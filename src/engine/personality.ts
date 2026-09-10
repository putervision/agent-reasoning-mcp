import Database from 'better-sqlite3';
import { UtilityProfile, ProfileId } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse, safeJsonStringify } from '../utils/json-validator.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logReasoningEvent } from './events.js';
import { sanitizeKeys } from '../utils/sanitize.js';

export class UtilityProfileEngine {
  static configureProfile(
    db: Database.Database,
    params: {
      project: string;
      name: string;
      description?: string;
      weights: Record<string, number>;
      is_active?: boolean;
    }
  ): UtilityProfile {
    if (!params.name) throw new ValidationError('Profile name is required.');
    if (!params.weights || Object.keys(params.weights).length === 0) {
      throw new ValidationError('Utility weights are required.');
    }

    const defaultWeights = {
      aggression: 0.5,
      caution: 0.5,
      greed: 0.5,
      efficiency: 0.5,
      exploration: 0.5,
      cooperation: 0.5,
      ...sanitizeKeys(params.weights),
    };

    const now = getCurrentIsoString();
    const existing = db
      .prepare('SELECT * FROM utility_profiles WHERE project = ? AND name = ?')
      .get(params.project, params.name) as any;

    if (params.is_active) {
      db.prepare('UPDATE utility_profiles SET is_active = 0 WHERE project = ?').run(params.project);
    }

    if (existing) {
      db.prepare(
        `
        UPDATE utility_profiles SET
          description = ?, weights_json = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(
        params.description ?? existing.description,
        safeJsonStringify(defaultWeights),
        params.is_active ? 1 : existing.is_active,
        now,
        existing.id
      );

      return this.getProfile(db, { project: params.project, name: params.name });
    }

    const id = generateId() as ProfileId;
    const isActive = params.is_active ? 1 : 0;

    db.prepare(
      `
      INSERT INTO utility_profiles (id, project, name, description, weights_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.project,
      params.name,
      params.description ?? null,
      safeJsonStringify(defaultWeights),
      isActive,
      now,
      now
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: 'profile',
      action: 'configure',
      details: { name: params.name, weights: defaultWeights },
    });

    return {
      id,
      project: params.project,
      name: params.name,
      description: params.description,
      weights: defaultWeights,
      is_active: isActive === 1,
      created_at: now,
      updated_at: now,
    };
  }

  static getActiveProfile(db: Database.Database, project: string): UtilityProfile {
    const row = db
      .prepare('SELECT * FROM utility_profiles WHERE project = ? AND is_active = 1')
      .get(project) as any;
    if (row) return this.mapRowToProfile(row);

    // Default fallback profile
    return {
      id: 'default' as ProfileId,
      project,
      name: 'balanced',
      description: 'Default balanced autonomous profile',
      weights: {
        aggression: 0.5,
        caution: 0.5,
        greed: 0.5,
        efficiency: 0.5,
        exploration: 0.5,
        cooperation: 0.5,
      },
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  static getProfile(
    db: Database.Database,
    params: { project: string; name: string }
  ): UtilityProfile {
    const row = db
      .prepare('SELECT * FROM utility_profiles WHERE project = ? AND name = ?')
      .get(params.project, params.name) as any;
    if (!row) throw new NotFoundError(`Utility profile "${params.name}" not found.`);
    return this.mapRowToProfile(row);
  }

  static listProfiles(db: Database.Database, project: string): UtilityProfile[] {
    const rows = db
      .prepare('SELECT * FROM utility_profiles WHERE project = ? ORDER BY is_active DESC, name ASC')
      .all(project) as any[];
    return rows.map((r) => this.mapRowToProfile(r));
  }

  static activateProfile(
    db: Database.Database,
    params: { project: string; name: string }
  ): UtilityProfile {
    const profile = this.getProfile(db, params);
    db.transaction(() => {
      db.prepare('UPDATE utility_profiles SET is_active = 0 WHERE project = ?').run(params.project);
      db.prepare('UPDATE utility_profiles SET is_active = 1 WHERE project = ? AND name = ?').run(
        params.project,
        params.name
      );
    })();
    return { ...profile, is_active: true };
  }

  private static mapRowToProfile(row: any): UtilityProfile {
    return {
      id: row.id as ProfileId,
      project: row.project,
      name: row.name,
      description: row.description,
      weights: safeJsonParse(row.weights_json, {
        aggression: 0.5,
        caution: 0.5,
        greed: 0.5,
        efficiency: 0.5,
        exploration: 0.5,
        cooperation: 0.5,
      }),
      is_active: row.is_active === 1,
      metadata: safeJsonParse(row.metadata_json, undefined),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
