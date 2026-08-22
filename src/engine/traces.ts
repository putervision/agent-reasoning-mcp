import Database from 'better-sqlite3';
import { DecisionTrace, TraceId, CandidateAction, RiskAssessmentResult, GoalId } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse, safeJsonStringify } from '../utils/json-validator.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logReasoningEvent } from './events.js';

export class DecisionTraceEngine {
  static recordTrace(
    db: Database.Database,
    params: {
      project: string;
      session_id?: string;
      goal_id?: string;
      situation_summary: string;
      candidate_actions: CandidateAction[];
      utility_profile: string;
      chosen_action: string;
      reasoning_chain: string[];
      risk_assessment?: RiskAssessmentResult;
      outcome?: string;
      latency_ms?: number;
      metadata?: Record<string, unknown>;
    }
  ): DecisionTrace {
    if (!params.situation_summary || !params.chosen_action) {
      throw new ValidationError('situation_summary and chosen_action are required.');
    }

    const id = generateId() as TraceId;
    const now = getCurrentIsoString();

    db.prepare(`
      INSERT INTO decision_traces (
        id, project, session_id, goal_id, situation_summary, candidate_actions_json,
        utility_profile, chosen_action, reasoning_chain_json, risk_assessment_json,
        outcome, latency_ms, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.project,
      params.session_id ?? null,
      params.goal_id ?? null,
      params.situation_summary,
      safeJsonStringify(params.candidate_actions || []),
      params.utility_profile,
      params.chosen_action,
      safeJsonStringify(params.reasoning_chain || []),
      params.risk_assessment ? safeJsonStringify(params.risk_assessment) : null,
      params.outcome ?? null,
      params.latency_ms ?? 0,
      params.metadata ? safeJsonStringify(params.metadata) : null,
      now
    );

    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: 'trace',
      action: 'record',
      details: { chosen_action: params.chosen_action, utility_profile: params.utility_profile },
    });

    return {
      id,
      project: params.project,
      session_id: params.session_id,
      goal_id: (params.goal_id as GoalId) || undefined,
      situation_summary: params.situation_summary,
      candidate_actions: params.candidate_actions,
      utility_profile: params.utility_profile,
      chosen_action: params.chosen_action,
      reasoning_chain: params.reasoning_chain,
      risk_assessment: params.risk_assessment,
      outcome: params.outcome,
      latency_ms: params.latency_ms || 0,
      metadata: params.metadata,
      created_at: now,
    };
  }

  static getTrace(db: Database.Database, params: { project: string; id: string }): DecisionTrace {
    const row = db.prepare('SELECT * FROM decision_traces WHERE project = ? AND id = ?').get(params.project, params.id) as any;
    if (!row) throw new NotFoundError(`Decision trace ${params.id} not found.`);
    return this.mapRowToTrace(row);
  }

  static listTraces(
    db: Database.Database,
    params: { project: string; goal_id?: string; limit?: number }
  ): DecisionTrace[] {
    let sql = 'SELECT * FROM decision_traces WHERE project = ?';
    const sqlParams: any[] = [params.project];

    if (params.goal_id) {
      sql += ' AND goal_id = ?';
      sqlParams.push(params.goal_id);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    sqlParams.push(params.limit || 50);

    const rows = db.prepare(sql).all(...sqlParams) as any[];
    return rows.map((r) => this.mapRowToTrace(r));
  }

  static getLatestTrace(db: Database.Database, project: string): DecisionTrace | null {
    const row = db.prepare('SELECT * FROM decision_traces WHERE project = ? ORDER BY created_at DESC LIMIT 1').get(project) as any;
    if (!row) return null;
    return this.mapRowToTrace(row);
  }

  static explainTrace(db: Database.Database, params: { project: string; id: string }): string {
    const trace = this.getTrace(db, params);
    let out = `# Decision Trace: ${trace.id}\n\n`;
    out += `**Situation**: ${trace.situation_summary}\n`;
    out += `**Profile**: ${trace.utility_profile}\n`;
    out += `**Chosen Action**: \`${trace.chosen_action}\` (Latency: ${trace.latency_ms}ms)\n\n`;
    out += `## Chain of Thought:\n`;
    for (let i = 0; i < trace.reasoning_chain.length; i++) {
      out += `${i + 1}. ${trace.reasoning_chain[i]}\n`;
    }
    out += `\n## Candidate Utilities:\n`;
    for (const c of trace.candidate_actions) {
      out += `- \`${c.action}\`: Score = ${c.estimated_utility.toFixed(3)}\n`;
    }
    return out;
  }

  private static mapRowToTrace(row: any): DecisionTrace {
    return {
      id: row.id as TraceId,
      project: row.project,
      session_id: row.session_id,
      goal_id: row.goal_id as GoalId | undefined,
      situation_summary: row.situation_summary,
      candidate_actions: safeJsonParse(row.candidate_actions_json, []),
      utility_profile: row.utility_profile,
      chosen_action: row.chosen_action,
      reasoning_chain: safeJsonParse(row.reasoning_chain_json, []),
      risk_assessment: safeJsonParse(row.risk_assessment_json, undefined),
      outcome: row.outcome,
      latency_ms: row.latency_ms,
      metadata: safeJsonParse(row.metadata_json, undefined),
      created_at: row.created_at,
    };
  }
}
