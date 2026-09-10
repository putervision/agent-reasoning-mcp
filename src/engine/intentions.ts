import Database from 'better-sqlite3';
import { Intention, IntentionId, IntentionStatus, GoalId, TraceId } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse, safeJsonStringify } from '../utils/json-validator.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logReasoningEvent } from './events.js';

export class IntentionEngine {
  static createIntention(
    db: Database.Database,
    params: {
      project: string;
      goal_id: string;
      trace_id?: string;
      session_id?: string;
      behavior_name: string;
      parameters?: Record<string, unknown>;
      priority?: number;
      deadline_at?: string;
      abort_conditions?: Array<{
        condition_type: string;
        condition_params: Record<string, unknown>;
      }>;
      client_request_id?: string;
    }
  ): Intention {
    if (!params.goal_id || !params.behavior_name) {
      throw new ValidationError('goal_id and behavior_name are required.');
    }

    if (params.client_request_id) {
      const existing = db
        .prepare('SELECT * FROM intentions WHERE project = ? AND client_request_id = ?')
        .get(params.project, params.client_request_id) as any;
      if (existing) {
        return this.mapRowToIntention(existing);
      }
    }

    const id = generateId() as IntentionId;
    const now = getCurrentIsoString();
    const priority = params.priority !== undefined ? params.priority : 0.5;

    db.prepare(
      `
      INSERT INTO intentions (
        id, project, goal_id, trace_id, session_id, behavior_name,
        parameters_json, priority, status, deadline_at, abort_conditions_json,
        client_request_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.project,
      params.goal_id,
      params.trace_id ?? null,
      params.session_id ?? null,
      params.behavior_name,
      safeJsonStringify(params.parameters || {}),
      priority,
      params.deadline_at ?? null,
      params.abort_conditions ? safeJsonStringify(params.abort_conditions) : null,
      params.client_request_id ?? null,
      now,
      now
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: 'intention',
      action: 'create',
      details: { goal_id: params.goal_id, behavior_name: params.behavior_name },
    });

    return {
      id,
      project: params.project,
      goal_id: params.goal_id as GoalId,
      trace_id: (params.trace_id as TraceId) || undefined,
      session_id: params.session_id,
      behavior_name: params.behavior_name,
      parameters: params.parameters || {},
      priority,
      status: 'pending',
      deadline_at: params.deadline_at,
      abort_conditions: params.abort_conditions,
      client_request_id: params.client_request_id,
      created_at: now,
      updated_at: now,
    };
  }

  static dispatchIntention(
    db: Database.Database,
    params: { project: string; id: string }
  ): Intention {
    const intention = this.getIntention(db, params);
    const now = getCurrentIsoString();

    db.prepare('UPDATE intentions SET status = ?, updated_at = ? WHERE id = ?').run(
      'dispatched',
      now,
      intention.id
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: intention.id,
      entity_type: 'intention',
      action: 'dispatch',
      details: { behavior_name: intention.behavior_name },
    });

    return { ...intention, status: 'dispatched', updated_at: now };
  }

  static resolveIntention(
    db: Database.Database,
    params: {
      project: string;
      id: string;
      status: 'completed' | 'failed' | 'aborted' | 'interrupted';
      result?: Record<string, unknown>;
    }
  ): Intention {
    const intention = this.getIntention(db, params);
    const now = getCurrentIsoString();

    db.prepare(
      'UPDATE intentions SET status = ?, result_json = ?, updated_at = ? WHERE id = ?'
    ).run(params.status, safeJsonStringify(params.result || {}), now, intention.id);

    logReasoningEvent(db, {
      project: params.project,
      entity_id: intention.id,
      entity_type: 'intention',
      action: 'resolve',
      details: { status: params.status, result: params.result },
    });

    return { ...intention, status: params.status, result: params.result, updated_at: now };
  }

  static getIntention(db: Database.Database, params: { project: string; id: string }): Intention {
    const row = db
      .prepare('SELECT * FROM intentions WHERE project = ? AND id = ?')
      .get(params.project, params.id) as any;
    if (!row) throw new NotFoundError(`Intention ${params.id} not found.`);
    return this.mapRowToIntention(row);
  }

  static listIntentions(
    db: Database.Database,
    params: { project: string; status?: IntentionStatus; goal_id?: string; limit?: number }
  ): Intention[] {
    let sql = 'SELECT * FROM intentions WHERE project = ?';
    const sqlParams: any[] = [params.project];

    if (params.status) {
      sql += ' AND status = ?';
      sqlParams.push(params.status);
    }
    if (params.goal_id) {
      sql += ' AND goal_id = ?';
      sqlParams.push(params.goal_id);
    }

    sql += ' ORDER BY priority DESC, created_at DESC LIMIT ?';
    sqlParams.push(params.limit || 50);

    const rows = db.prepare(sql).all(...sqlParams) as any[];
    return rows.map((r) => this.mapRowToIntention(r));
  }

  private static mapRowToIntention(row: any): Intention {
    return {
      id: row.id as IntentionId,
      project: row.project,
      goal_id: row.goal_id as GoalId,
      trace_id: row.trace_id as TraceId | undefined,
      session_id: row.session_id,
      behavior_name: row.behavior_name,
      parameters: safeJsonParse(row.parameters_json, {}),
      priority: row.priority,
      status: row.status as IntentionStatus,
      deadline_at: row.deadline_at,
      abort_conditions: safeJsonParse(row.abort_conditions_json, undefined),
      result: safeJsonParse(row.result_json, undefined),
      client_request_id: row.client_request_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
