import Database from 'better-sqlite3';
import { SituationSnapshot, CandidateAction } from '../schema/types.js';
import { UtilityProfileEngine } from './personality.js';
import { UtilityEngine } from './utility.js';
import { RiskEngine } from './risk.js';
import { DecisionTraceEngine } from './traces.js';

export class EvaluatorEngine {
  static evaluateSituation(
    db: Database.Database,
    params: {
      project: string;
      snapshot?: SituationSnapshot;
      quick_context?: string;
      candidate_actions?: Array<{ action: string; parameters?: Record<string, unknown>; description?: string }>;
      utility_profile?: string;
    }
  ): {
    chosen_action: CandidateAction;
    ranked_candidates: CandidateAction[];
    reasoning_chain: string[];
    risk_assessment: any;
    trace_id: string;
  } {
    const startTime = Date.now();
    const profile = params.utility_profile
      ? UtilityProfileEngine.getProfile(db, { project: params.project, name: params.utility_profile })
      : UtilityProfileEngine.getActiveProfile(db, params.project);

    const candidates = params.candidate_actions && params.candidate_actions.length > 0
      ? params.candidate_actions
      : [
          { action: 'idle_patrol', parameters: { radius: 15 } },
          { action: 'gather_resources', parameters: { target_type: 'ore' } },
          { action: 'engage_threat', parameters: { aggressive: true } },
          { action: 'flee_to_safety', parameters: { threshold_hp: 30 } },
        ];

    const reasoning_chain: string[] = [];
    reasoning_chain.push(`Loaded active utility profile: "${profile.name}" (Aggression: ${profile.weights.aggression}, Caution: ${profile.weights.caution}).`);

    let threatLevel = 0.0;
    let currentHp = 100;

    if (params.snapshot) {
      reasoning_chain.push(`Analyzed situation snapshot from session "${params.snapshot.session_id}".`);
      if (params.snapshot.vitals) {
        threatLevel = params.snapshot.vitals.threat_level ?? 0.0;
        currentHp = params.snapshot.vitals.hp ?? 100;
        reasoning_chain.push(`Vitals: HP=${currentHp}, Threat=${threatLevel}.`);
      }
      if (params.snapshot.state?.active_goals?.length) {
        reasoning_chain.push(`Active goals count: ${params.snapshot.state.active_goals.length}. Primary goal: "${params.snapshot.state.active_goals[0].title}".`);
      }
    } else if (params.quick_context) {
      reasoning_chain.push(`Quick context: ${params.quick_context}`);
    }

    // Score candidates with situational modulation
    const scoredCandidates: CandidateAction[] = candidates.map((c) => {
      const isCombat = /engage|attack|combat/i.test(c.action);
      const isEscape = /flee|heal/i.test(c.action);
      const isGather = /gather|loot|farm/i.test(c.action);
      const isPatrol = /patrol|explore|navigate/i.test(c.action);

      let eff = 0.7;
      if (threatLevel > 0.6 && isCombat) eff += 0.25;
      if (threatLevel > 0.6 && isPatrol) eff -= 0.3;
      if (currentHp < 30 && isEscape) eff += 0.35;

      const attributes: Record<string, number> = {
        aggression: isCombat ? 0.9 : 0.2,
        caution: (isEscape || isPatrol) ? 0.8 : 0.3,
        greed: isGather ? 0.9 : 0.2,
        efficiency: Math.min(1.0, Math.max(0.1, eff)),
        exploration: isPatrol ? (threatLevel > 0.5 ? 0.3 : 0.8) : 0.3,
        cooperation: 0.5,
      };

      const candidateScored = UtilityEngine.scoreCandidate({ ...c, attributes }, profile);
      const risk = RiskEngine.assessAction(c.action, c.parameters, params.snapshot ? { vitals: params.snapshot.vitals } : undefined, profile);
      candidateScored.risk_score = risk.risk_score;
      return candidateScored;
    });

    const ranked = scoredCandidates.sort((a, b) => b.estimated_utility - a.estimated_utility);
    const chosen = ranked[0];

    reasoning_chain.push(`Scored ${ranked.length} candidate actions against utility weights.`);
    reasoning_chain.push(`Selected highest utility action: "${chosen.action}" with estimated utility ${chosen.estimated_utility.toFixed(3)}.`);

    const risk_assessment = RiskEngine.assessAction(chosen.action, chosen.parameters, params.snapshot ? { vitals: params.snapshot.vitals } : undefined, profile);
    const latency_ms = Date.now() - startTime;

    const summary = params.snapshot?.session_id
      ? `Evaluation for session ${params.snapshot.session_id}`
      : params.quick_context || 'General situation evaluation';

    const trace = DecisionTraceEngine.recordTrace(db, {
      project: params.project,
      session_id: params.snapshot?.session_id,
      situation_summary: summary,
      candidate_actions: ranked,
      utility_profile: profile.name,
      chosen_action: chosen.action,
      reasoning_chain,
      risk_assessment,
      latency_ms,
    });

    return {
      chosen_action: chosen,
      ranked_candidates: ranked,
      reasoning_chain,
      risk_assessment,
      trace_id: trace.id,
    };
  }
}
