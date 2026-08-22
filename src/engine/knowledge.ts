import Database from 'better-sqlite3';
import { KnowledgePattern, PatternId } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse, safeJsonStringify } from '../utils/json-validator.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logReasoningEvent } from './events.js';

export class KnowledgeEngine {
  static createPattern(
    db: Database.Database,
    params: {
      project: string;
      pattern_type: 'heuristic' | 'anti_pattern' | 'optimization' | 'contingency';
      context_tags: string[];
      situation_pattern: string;
      recommended_strategy: string;
      confidence?: number;
      metadata?: Record<string, unknown>;
    }
  ): KnowledgePattern {
    if (!params.situation_pattern || !params.recommended_strategy) {
      throw new ValidationError('situation_pattern and recommended_strategy are required.');
    }

    const id = generateId() as PatternId;
    const now = getCurrentIsoString();
    const confidence = params.confidence !== undefined ? params.confidence : 0.7;

    db.prepare(`
      INSERT INTO knowledge_patterns (
        id, project, pattern_type, context_tags_json, situation_pattern,
        recommended_strategy, confidence, sample_count, success_rate,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1.0, ?, ?, ?)
    `).run(
      id,
      params.project,
      params.pattern_type,
      safeJsonStringify(params.context_tags || []),
      params.situation_pattern,
      params.recommended_strategy,
      confidence,
      params.metadata ? safeJsonStringify(params.metadata) : null,
      now,
      now
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: 'knowledge',
      action: 'create_pattern',
      details: { pattern_type: params.pattern_type, situation: params.situation_pattern },
    });

    return {
      id,
      project: params.project,
      pattern_type: params.pattern_type,
      context_tags: params.context_tags || [],
      situation_pattern: params.situation_pattern,
      recommended_strategy: params.recommended_strategy,
      confidence,
      sample_count: 1,
      success_rate: 1.0,
      metadata: params.metadata,
      created_at: now,
      updated_at: now,
    };
  }

  static queryKnowledge(
    db: Database.Database,
    params: {
      project: string;
      query?: string;
      pattern_type?: string;
      context_tags?: string[];
      limit?: number;
    }
  ): KnowledgePattern[] {
    let sql = 'SELECT * FROM knowledge_patterns WHERE project = ?';
    const sqlParams: any[] = [params.project];

    if (params.pattern_type) {
      sql += ' AND pattern_type = ?';
      sqlParams.push(params.pattern_type);
    }
    if (params.query) {
      sql += ' AND (situation_pattern LIKE ? OR recommended_strategy LIKE ?)';
      sqlParams.push(`%${params.query}%`, `%${params.query}%`);
    }

    sql += ' ORDER BY confidence DESC, success_rate DESC LIMIT ?';
    sqlParams.push(params.limit || 50);

    const rows = db.prepare(sql).all(...sqlParams) as any[];
    return rows.map((r) => this.mapRowToPattern(r));
  }

  private static mapRowToPattern(row: any): KnowledgePattern {
    return {
      id: row.id as PatternId,
      project: row.project,
      pattern_type: row.pattern_type,
      context_tags: safeJsonParse(row.context_tags_json, []),
      situation_pattern: row.situation_pattern,
      recommended_strategy: row.recommended_strategy,
      confidence: row.confidence,
      sample_count: row.sample_count,
      success_rate: row.success_rate,
      metadata: safeJsonParse(row.metadata_json, undefined),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
