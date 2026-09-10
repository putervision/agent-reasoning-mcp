import Database from 'better-sqlite3';
import { Goal, GoalId, GoalStatus } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse, safeJsonStringify } from '../utils/json-validator.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logReasoningEvent } from './events.js';
import { sanitizeKeys } from '../utils/sanitize.js';

export class GoalEngine {
  static createGoal(
    db: Database.Database,
    params: {
      project: string;
      session_id?: string;
      parent_id?: string;
      title: string;
      description?: string;
      status?: GoalStatus;
      priority?: number;
      utility_weights?: Record<string, number>;
      deadline_at?: string;
      success_criteria?: string[];
      metadata?: Record<string, unknown>;
      client_request_id?: string;
    }
  ): Goal {
    if (!params.title || typeof params.title !== 'string') {
      throw new ValidationError('Goal title is required.');
    }

    if (params.client_request_id) {
      const existing = db
        .prepare('SELECT * FROM goals WHERE project = ? AND client_request_id = ?')
        .get(params.project, params.client_request_id) as any;
      if (existing) {
        return this.mapRowToGoal(existing);
      }
    }

    if (params.parent_id) {
      const parent = db
        .prepare('SELECT id FROM goals WHERE project = ? AND id = ?')
        .get(params.project, params.parent_id);
      if (!parent) {
        throw new NotFoundError(`Parent goal ${params.parent_id} not found.`);
      }
    }

    const id = generateId() as GoalId;
    const now = getCurrentIsoString();
    const status = params.status || 'active';
    const priority = params.priority !== undefined ? params.priority : 0.5;
    const sanitizedMetadata = params.metadata ? sanitizeKeys(params.metadata) : null;

    db.prepare(
      `
      INSERT INTO goals (
        id, project, session_id, parent_id, title, description, status, priority,
        utility_weights_json, deadline_at, progress, success_criteria_json,
        metadata_json, client_request_id, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, 1)
    `
    ).run(
      id,
      params.project,
      params.session_id ?? null,
      params.parent_id ?? null,
      params.title,
      params.description ?? null,
      status,
      priority,
      params.utility_weights ? safeJsonStringify(params.utility_weights) : null,
      params.deadline_at ?? null,
      params.success_criteria ? safeJsonStringify(params.success_criteria) : null,
      sanitizedMetadata ? safeJsonStringify(sanitizedMetadata) : null,
      params.client_request_id ?? null,
      now,
      now
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: 'goal',
      action: 'create',
      details: { title: params.title, priority, parent_id: params.parent_id },
    });

    return {
      id,
      project: params.project,
      session_id: params.session_id,
      parent_id: (params.parent_id as GoalId) || null,
      title: params.title,
      description: params.description,
      status,
      priority,
      utility_weights: params.utility_weights,
      deadline_at: params.deadline_at,
      progress: 0.0,
      success_criteria: params.success_criteria,
      metadata: sanitizedMetadata || undefined,
      client_request_id: params.client_request_id,
      created_at: now,
      updated_at: now,
      version: 1,
    };
  }

  static updateGoal(
    db: Database.Database,
    params: {
      project: string;
      id: string;
      title?: string;
      description?: string;
      status?: GoalStatus;
      priority?: number;
      progress?: number;
      failure_reason?: string;
      metadata?: Record<string, unknown>;
    }
  ): Goal {
    const existing = db
      .prepare('SELECT * FROM goals WHERE project = ? AND id = ?')
      .get(params.project, params.id) as any;
    if (!existing) {
      throw new NotFoundError(`Goal ${params.id} not found.`);
    }

    const now = getCurrentIsoString();
    const title = params.title ?? existing.title;
    const description = params.description ?? existing.description;
    const status = params.status ?? existing.status;
    const priority = params.priority !== undefined ? params.priority : existing.priority;
    const progress = params.progress !== undefined ? params.progress : existing.progress;
    const failure_reason = params.failure_reason ?? existing.failure_reason;
    const metadata_json = params.metadata
      ? safeJsonStringify(
          sanitizeKeys({ ...safeJsonParse(existing.metadata_json, {}), ...params.metadata })
        )
      : existing.metadata_json;
    const version = existing.version + 1;

    db.prepare(
      `
      UPDATE goals SET
        title = ?, description = ?, status = ?, priority = ?, progress = ?,
        failure_reason = ?, metadata_json = ?, updated_at = ?, version = ?
      WHERE project = ? AND id = ?
    `
    ).run(
      title,
      description,
      status,
      priority,
      progress,
      failure_reason,
      metadata_json,
      now,
      version,
      params.project,
      params.id
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: params.id,
      entity_type: 'goal',
      action: 'update',
      details: { title, status, priority, progress },
    });

    return this.getGoal(db, { project: params.project, id: params.id });
  }

  static decomposeGoal(
    db: Database.Database,
    params: {
      project: string;
      parent_id: string;
      subgoals: Array<{ title: string; description?: string; priority?: number }>;
    }
  ): { parent_goal: Goal; subgoals: Goal[] } {
    const parent = this.getGoal(db, { project: params.project, id: params.parent_id });
    const created: Goal[] = [];

    db.transaction(() => {
      for (const sub of params.subgoals) {
        const goal = this.createGoal(db, {
          project: params.project,
          session_id: parent.session_id,
          parent_id: parent.id,
          title: sub.title,
          description: sub.description,
          priority: sub.priority !== undefined ? sub.priority : parent.priority,
        });
        created.push(goal);
      }
    })();

    return { parent_goal: parent, subgoals: created };
  }

  static getGoal(db: Database.Database, params: { project: string; id: string }): Goal {
    const row = db
      .prepare('SELECT * FROM goals WHERE project = ? AND id = ?')
      .get(params.project, params.id) as any;
    if (!row) throw new NotFoundError(`Goal ${params.id} not found.`);
    return this.mapRowToGoal(row);
  }

  static listGoals(
    db: Database.Database,
    params: { project: string; status?: GoalStatus; parent_id?: string; limit?: number }
  ): Goal[] {
    let sql = 'SELECT * FROM goals WHERE project = ?';
    const sqlParams: any[] = [params.project];

    if (params.status) {
      sql += ' AND status = ?';
      sqlParams.push(params.status);
    }
    if (params.parent_id !== undefined) {
      if (params.parent_id === 'null' || params.parent_id === '') {
        sql += ' AND parent_id IS NULL';
      } else {
        sql += ' AND parent_id = ?';
        sqlParams.push(params.parent_id);
      }
    }

    sql += ' ORDER BY priority DESC, created_at ASC LIMIT ?';
    sqlParams.push(params.limit || 100);

    const rows = db.prepare(sql).all(...sqlParams) as any[];
    return rows.map((r) => this.mapRowToGoal(r));
  }

  static abandonGoal(
    db: Database.Database,
    params: { project: string; id: string; reason?: string }
  ): Goal {
    return this.updateGoal(db, {
      project: params.project,
      id: params.id,
      status: 'abandoned',
      failure_reason: params.reason || 'Goal manually abandoned.',
    });
  }

  private static mapRowToGoal(row: any): Goal {
    return {
      id: row.id as GoalId,
      project: row.project,
      session_id: row.session_id,
      parent_id: row.parent_id as GoalId | null,
      title: row.title,
      description: row.description,
      status: row.status as GoalStatus,
      priority: row.priority,
      utility_weights: safeJsonParse(row.utility_weights_json, undefined),
      deadline_at: row.deadline_at,
      progress: row.progress,
      success_criteria: safeJsonParse(row.success_criteria_json, undefined),
      failure_reason: row.failure_reason,
      metadata: safeJsonParse(row.metadata_json, undefined),
      client_request_id: row.client_request_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version,
    };
  }
}
