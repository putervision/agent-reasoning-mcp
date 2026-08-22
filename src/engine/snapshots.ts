import Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { ValidationError } from '../utils/errors.js';
import { safeJsonParse } from '../utils/json-validator.js';

export class SnapshotEngine {
  static saveSnapshot(
    db: Database.Database,
    params: { project: string; name: string; description?: string }
  ): { snapshot_id: string; name: string; timestamp: string } {
    if (!params.name || typeof params.name !== 'string') {
      throw new ValidationError('Snapshot name is required.');
    }

    const goals = db.prepare('SELECT * FROM goals WHERE project = ?').all(params.project);
    const beliefs = db.prepare('SELECT * FROM beliefs WHERE project = ?').all(params.project);
    const profiles = db.prepare('SELECT * FROM utility_profiles WHERE project = ?').all(params.project);
    const intentions = db.prepare('SELECT * FROM intentions WHERE project = ?').all(params.project);
    const knowledge = db.prepare('SELECT * FROM knowledge_patterns WHERE project = ?').all(params.project);

    const data = { goals, beliefs, profiles, intentions, knowledge };
    const id = generateId();
    const now = getCurrentIsoString();

    db.prepare(`
      INSERT INTO snapshots (id, project, name, description, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project, name) DO UPDATE SET
        description = excluded.description,
        data_json = excluded.data_json,
        created_at = excluded.created_at
    `).run(id, params.project, params.name, params.description ?? null, JSON.stringify(data), now);

    return { snapshot_id: id, name: params.name, timestamp: now };
  }

  static restoreSnapshot(
    db: Database.Database,
    params: { project: string; name: string }
  ): { restored_goals: number; restored_beliefs: number } {
    const row = db
      .prepare('SELECT * FROM snapshots WHERE project = ? AND name = ?')
      .get(params.project, params.name) as any;

    if (!row) {
      throw new ValidationError(`Snapshot "${params.name}" not found for project "${params.project}".`);
    }

    const data = safeJsonParse(row.data_json, { goals: [], beliefs: [] });

    db.transaction(() => {
      db.prepare('DELETE FROM intentions WHERE project = ?').run(params.project);
      db.prepare('DELETE FROM beliefs WHERE project = ?').run(params.project);
      db.prepare('DELETE FROM goals WHERE project = ?').run(params.project);

      if (Array.isArray(data.goals)) {
        const stmt = db.prepare(`
          INSERT INTO goals (id, project, session_id, parent_id, title, description, status, priority, utility_weights_json, deadline_at, progress, success_criteria_json, failure_reason, metadata_json, client_request_id, created_at, updated_at, version)
          VALUES (@id, @project, @session_id, @parent_id, @title, @description, @status, @priority, @utility_weights_json, @deadline_at, @progress, @success_criteria_json, @failure_reason, @metadata_json, @client_request_id, @created_at, @updated_at, @version)
        `);
        for (const g of data.goals) stmt.run(g);
      }

      if (Array.isArray(data.beliefs)) {
        const stmt = db.prepare(`
          INSERT INTO beliefs (id, project, session_id, category, subject, predicate, object_json, confidence, source, source_id, expires_at, decay_rate, last_decayed_at, client_request_id, metadata_json, created_at, updated_at)
          VALUES (@id, @project, @session_id, @category, @subject, @predicate, @object_json, @confidence, @source, @source_id, @expires_at, @decay_rate, @last_decayed_at, @client_request_id, @metadata_json, @created_at, @updated_at)
        `);
        for (const b of data.beliefs) stmt.run(b);
      }
    })();

    return {
      restored_goals: data.goals?.length || 0,
      restored_beliefs: data.beliefs?.length || 0,
    };
  }

  static listSnapshots(
    db: Database.Database,
    params: { project: string; limit?: number }
  ): Array<{ id: string; name: string; description?: string; created_at: string }> {
    return db
      .prepare('SELECT id, name, description, created_at FROM snapshots WHERE project = ? ORDER BY created_at DESC LIMIT ?')
      .all(params.project, params.limit || 50) as any[];
  }
}
