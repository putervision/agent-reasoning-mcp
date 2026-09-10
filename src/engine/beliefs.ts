import Database from 'better-sqlite3';
import { Belief, BeliefId, BeliefCategory } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse, safeJsonStringify } from '../utils/json-validator.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logReasoningEvent } from './events.js';

export class BeliefEngine {
  static updateBelief(
    db: Database.Database,
    params: {
      project: string;
      session_id?: string;
      category: BeliefCategory;
      subject: string;
      predicate: string;
      object: unknown;
      confidence?: number;
      source?: 'observation' | 'deduction' | 'agent_communication' | 'a_priori';
      source_id?: string;
      expires_at?: string;
      decay_rate?: number;
      client_request_id?: string;
      metadata?: Record<string, unknown>;
    }
  ): Belief {
    if (!params.subject || !params.predicate) {
      throw new ValidationError('Belief subject and predicate are required.');
    }

    if (params.client_request_id) {
      const existing = db
        .prepare('SELECT * FROM beliefs WHERE project = ? AND client_request_id = ?')
        .get(params.project, params.client_request_id) as any;
      if (existing) {
        return this.mapRowToBelief(existing);
      }
    }

    // Check if belief with same category, subject, predicate exists
    const existing = db
      .prepare(
        'SELECT * FROM beliefs WHERE project = ? AND category = ? AND subject = ? AND predicate = ?'
      )
      .get(params.project, params.category, params.subject, params.predicate) as any;

    const now = getCurrentIsoString();
    const confidence =
      params.confidence !== undefined ? Math.max(0, Math.min(1, params.confidence)) : 1.0;
    const decay_rate =
      params.decay_rate !== undefined
        ? params.decay_rate
        : params.category === 'spatial'
          ? 0.2
          : 0.05;

    if (existing) {
      db.prepare(
        `
        UPDATE beliefs SET
          object_json = ?, confidence = ?, source = ?, source_id = ?,
          expires_at = ?, decay_rate = ?, last_decayed_at = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(
        safeJsonStringify(params.object),
        confidence,
        params.source || existing.source,
        params.source_id ?? existing.source_id,
        params.expires_at ?? existing.expires_at,
        decay_rate,
        now,
        params.metadata ? safeJsonStringify(params.metadata) : existing.metadata_json,
        now,
        existing.id
      );

      logReasoningEvent(db, {
        project: params.project,
        entity_id: existing.id,
        entity_type: 'belief',
        action: 'update',
        details: { subject: params.subject, predicate: params.predicate, confidence },
      });

      return this.getBelief(db, { project: params.project, id: existing.id });
    }

    const id = generateId() as BeliefId;
    db.prepare(
      `
      INSERT INTO beliefs (
        id, project, session_id, category, subject, predicate, object_json,
        confidence, source, source_id, expires_at, decay_rate, last_decayed_at,
        client_request_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.project,
      params.session_id ?? null,
      params.category,
      params.subject,
      params.predicate,
      safeJsonStringify(params.object),
      confidence,
      params.source || 'observation',
      params.source_id ?? null,
      params.expires_at ?? null,
      decay_rate,
      now,
      params.client_request_id ?? null,
      params.metadata ? safeJsonStringify(params.metadata) : null,
      now,
      now
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: 'belief',
      action: 'assert',
      details: { subject: params.subject, predicate: params.predicate, confidence },
    });

    return {
      id,
      project: params.project,
      session_id: params.session_id,
      category: params.category,
      subject: params.subject,
      predicate: params.predicate,
      object: params.object,
      confidence,
      source: params.source || 'observation',
      source_id: params.source_id,
      expires_at: params.expires_at,
      decay_rate,
      last_decayed_at: now,
      client_request_id: params.client_request_id,
      metadata: params.metadata,
      created_at: now,
      updated_at: now,
    };
  }

  static queryBeliefs(
    db: Database.Database,
    params: {
      project: string;
      category?: BeliefCategory;
      subject?: string;
      predicate?: string;
      min_confidence?: number;
      limit?: number;
    }
  ): Belief[] {
    this.decayBeliefs(db, params.project);

    let sql = 'SELECT * FROM beliefs WHERE project = ?';
    const sqlParams: any[] = [params.project];

    if (params.category) {
      sql += ' AND category = ?';
      sqlParams.push(params.category);
    }
    if (params.subject) {
      sql += ' AND subject LIKE ?';
      sqlParams.push(`%${params.subject}%`);
    }
    if (params.predicate) {
      sql += ' AND predicate = ?';
      sqlParams.push(params.predicate);
    }
    if (params.min_confidence !== undefined) {
      sql += ' AND confidence >= ?';
      sqlParams.push(params.min_confidence);
    }

    sql += ' ORDER BY confidence DESC, updated_at DESC LIMIT ?';
    sqlParams.push(params.limit || 50);

    const rows = db.prepare(sql).all(...sqlParams) as any[];
    return rows.map((r) => this.mapRowToBelief(r));
  }

  static decayBeliefs(db: Database.Database, project: string): void {
    const now = Date.now();
    const rows = db
      .prepare('SELECT id, confidence, decay_rate, last_decayed_at FROM beliefs WHERE project = ?')
      .all(project) as any[];

    db.transaction(() => {
      const updateStmt = db.prepare(
        'UPDATE beliefs SET confidence = ?, last_decayed_at = ? WHERE id = ?'
      );
      for (const row of rows) {
        if (!row.last_decayed_at) continue;
        const elapsedHours = (now - new Date(row.last_decayed_at).getTime()) / (1000 * 60 * 60);
        if (elapsedHours > 0.01) {
          // Exponential decay: C(t) = C0 * e^(-lambda * t)
          const newConf = Math.max(0.01, row.confidence * Math.exp(-row.decay_rate * elapsedHours));
          updateStmt.run(newConf, new Date(now).toISOString(), row.id);
        }
      }
    })();
  }

  static expireBeliefs(db: Database.Database, project: string): number {
    const now = getCurrentIsoString();
    const res = db
      .prepare(
        'DELETE FROM beliefs WHERE project = ? AND expires_at IS NOT NULL AND expires_at < ?'
      )
      .run(project, now);
    return res.changes;
  }

  static getBelief(db: Database.Database, params: { project: string; id: string }): Belief {
    const row = db
      .prepare('SELECT * FROM beliefs WHERE project = ? AND id = ?')
      .get(params.project, params.id) as any;
    if (!row) throw new NotFoundError(`Belief ${params.id} not found.`);
    return this.mapRowToBelief(row);
  }

  private static mapRowToBelief(row: any): Belief {
    return {
      id: row.id as BeliefId,
      project: row.project,
      session_id: row.session_id,
      category: row.category as BeliefCategory,
      subject: row.subject,
      predicate: row.predicate,
      object: safeJsonParse(row.object_json, row.object_json),
      confidence: row.confidence,
      source: row.source,
      source_id: row.source_id,
      expires_at: row.expires_at,
      decay_rate: row.decay_rate,
      last_decayed_at: row.last_decayed_at,
      client_request_id: row.client_request_id,
      metadata: safeJsonParse(row.metadata_json, undefined),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
