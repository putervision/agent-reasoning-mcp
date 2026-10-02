import crypto from 'crypto';
import Database from 'better-sqlite3';
import {
  GateIntentionResponse,
  DispatchToken,
  DecisionReason,
  StatePack,
  AffordanceBitmask,
} from '../schema/types.js';
import { RiskEngine } from './risk.js';
import { getPentadHmacSecret, getDispatchTokenTtlMs } from './config.js';
import { StatePackBuilder } from './state-pack.js';
import { DecisionLRUCache, globalDecisionCache, PersistentDecisionCache } from './cache.js';
import { logReasoningEvent } from './events.js';
import { generateId } from '../utils/id.js';
import { canonicalJsonStringify } from '../utils/canonical-json.js';

export class IntentionGateEngine {
  static evaluateAndGate(
    db: Database.Database,
    params: {
      project: string;
      intention_id?: string;
      proposed_action: {
        behavior_name: string;
        parameters?: Record<string, unknown>;
        target_resources?: string[];
      };
      context_goal_id?: string;
      state_pack?: StatePack;
    }
  ): GateIntentionResponse {
    const startTime = performance.now();
    const secret = getPentadHmacSecret();
    const intentionId = params.intention_id || generateId();
    const behaviorName = params.proposed_action.behavior_name;
    const actionParams = params.proposed_action.parameters || {};

    let pack: StatePack;
    if (params.state_pack && StatePackBuilder.validate(params.state_pack)) {
      pack = params.state_pack;
    } else {
      pack = StatePackBuilder.build({
        project: params.project,
        session_id: 'gate_session',
      });
    }

    const queryPayload = {
      intention_id: intentionId,
      behavior_name: behaviorName,
      parameters: actionParams,
      context_goal_id: params.context_goal_id,
    };
    const cacheKey = DecisionLRUCache.computeCacheKey(
      pack.pack_hash,
      'gate_intention',
      queryPayload
    );

    // Fail-closed if HMAC secret is unset
    if (!secret || secret.trim() === '') {
      const latency_ms = Math.round((performance.now() - startTime) * 100) / 100;
      const event = logReasoningEvent(db, {
        project: params.project,
        entity_id: intentionId,
        entity_type: 'decision',
        action: 'gate_intention',
        details: {
          verdict: 'rejected',
          reasons: ['MISSING_REQUIRED_PARAMS'],
          error: 'PENTAD_HMAC_SECRET unset',
        },
      });

      return {
        allowed: false,
        verdict: 'rejected',
        blast_radius: 'high',
        risk_score: 1.0,
        significance: 1.0,
        in_scope: true,
        policy_violations: [
          'PENTAD_HMAC_SECRET environment variable is missing or empty. Token signing refused.',
        ],
        reasons: ['MISSING_REQUIRED_PARAMS'],
        tier: 'L1',
        latency_ms,
        event_hash: event.hash,
      };
    }

    // Evaluate Risk using RiskEngine
    const riskResult = RiskEngine.assessAction(
      behaviorName,
      actionParams,
      pack ? { vitals: pack.vitals } : undefined
    );

    const risk_score = riskResult.risk_score;
    let blast_radius: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (risk_score <= 0.1) blast_radius = 'none';
    else if (risk_score <= 0.3) blast_radius = 'low';
    else if (risk_score <= 0.6) blast_radius = 'medium';
    else if (risk_score <= 0.8) blast_radius = 'high';
    else blast_radius = 'critical';

    const reasons: DecisionReason[] = [];
    const policy_violations: string[] = [];
    let in_scope = true;

    // Validate scope against context_goal_id
    if (params.context_goal_id) {
      const goalRow = db
        .prepare('SELECT id, status FROM goals WHERE id = ? AND project = ?')
        .get(params.context_goal_id, params.project) as { id: string; status: string } | undefined;
      if (!goalRow) {
        in_scope = false;
        policy_violations.push(
          `Goal ${params.context_goal_id} not found in project ${params.project}`
        );
        reasons.push('OUT_OF_SCOPE');
      } else if (goalRow.status === 'completed' || goalRow.status === 'abandoned') {
        in_scope = false;
        policy_violations.push(`Goal ${params.context_goal_id} is already ${goalRow.status}`);
        reasons.push('OUT_OF_SCOPE');
      } else {
        reasons.push('GOAL_AFFINITY_MAX');
      }
    }

    // Check for destructive actions
    if (
      /drop_db|purge_database|delete_all|format_drive|terminate_system|destroy_root|delete_system|destroy_system|delete_partition/i.test(
        behaviorName
      )
    ) {
      policy_violations.push(
        `Destructive behavior ${behaviorName} requires explicit human approval`
      );
      reasons.push('DESTRUCTIVE_ACTION_DETECTED');
    }

    if (risk_score > 0.85) {
      policy_violations.push(`Risk score ${risk_score} exceeds safety threshold (0.85)`);
      reasons.push('RISK_SCORE_EXCEEDED');
    }

    if (
      pack.vitals &&
      (pack.vitals.hp ?? 100) < 20 &&
      /attack|assault|engage/i.test(behaviorName)
    ) {
      policy_violations.push('Agent in critical health state; offensive engagement forbidden');
      reasons.push('CRITICAL_VITALS_HP');
    }

    // Spatial affordance & threat blast-radius checking (§5)
    const targetEntityId = actionParams.target_entity_id as string | undefined;
    const requiredAffordances =
      typeof actionParams.required_affordances === 'number'
        ? actionParams.required_affordances
        : undefined;

    if (targetEntityId) {
      const targetEntity = pack.spatial?.nearby_entities?.find((e) => e.id === targetEntityId);
      if (targetEntity) {
        const entityMask = targetEntity.affordance_mask ?? 0;
        const isThreat =
          (entityMask & AffordanceBitmask.THREAT) !== 0 ||
          /hostile|enemy|threat/i.test(targetEntity.status);

        if (isThreat) {
          if (!/flee|retreat|combat|attack|engage/i.test(behaviorName)) {
            blast_radius = 'critical';
            policy_violations.push(
              `Target entity '${targetEntityId}' has THREAT affordance; non-defensive behavior '${behaviorName}' rejected`
            );
            reasons.push('AFFORDANCE_VIOLATION');
          } else {
            blast_radius = 'high';
          }
        }

        if (requiredAffordances !== undefined) {
          if ((entityMask & requiredAffordances) !== requiredAffordances) {
            policy_violations.push(
              `Target entity '${targetEntityId}' lacks required affordance mask (required: ${requiredAffordances}, actual: ${entityMask})`
            );
            reasons.push('AFFORDANCE_VIOLATION');
          }
        }
      }
    } else if (requiredAffordances !== undefined) {
      const spatialMask = pack.spatial?.affordance_mask ?? 0;
      if ((spatialMask & requiredAffordances) !== requiredAffordances) {
        policy_violations.push(
          `Environment lacks required affordance mask (required: ${requiredAffordances}, actual: ${spatialMask})`
        );
        reasons.push('AFFORDANCE_VIOLATION');
      }
    }

    // Determine verdict
    let allowed = false;
    let verdict: 'approved' | 'rejected' | 'quarantined' | 'needs_human_approval' = 'approved';

    if (reasons.includes('DESTRUCTIVE_ACTION_DETECTED')) {
      allowed = false;
      verdict = 'needs_human_approval';
    } else if (policy_violations.length > 0) {
      allowed = false;
      verdict = 'rejected';
    } else {
      allowed = true;
      verdict = 'approved';
      if (reasons.length === 0) reasons.push('RULE_HEURISTIC_MATCH');
    }

    let dispatch_token: DispatchToken | undefined;

    if (allowed) {
      const now = Date.now();
      const ttlMs = getDispatchTokenTtlMs();
      const tokenId = generateId();
      const paramsHash = crypto
        .createHash('sha256')
        .update(canonicalJsonStringify(actionParams), 'utf8')
        .digest('hex');

      const issuedAt = new Date(now).toISOString();
      const expiresAt = new Date(now + ttlMs).toISOString();

      const tokenPreimage = `${tokenId}:${intentionId}:${behaviorName}:${paramsHash}:behavior-mcp:${issuedAt}:${expiresAt}`;
      const hmacSignature = crypto
        .createHmac('sha256', secret)
        .update(tokenPreimage, 'utf8')
        .digest('hex');

      dispatch_token = {
        token_id: tokenId,
        intention_id: intentionId,
        behavior_name: behaviorName,
        params_hash: paramsHash,
        aud: 'behavior-mcp',
        issued_at: issuedAt,
        expires_at: expiresAt,
        hmac_signature: hmacSignature,
      };
    }

    const latency_ms = Math.round((performance.now() - startTime) * 100) / 100;

    const event = logReasoningEvent(db, {
      project: params.project,
      entity_id: intentionId,
      entity_type: 'decision',
      action: 'gate_intention',
      details: {
        behavior_name: behaviorName,
        verdict,
        allowed,
        risk_score,
        blast_radius,
        reasons,
        token_id: dispatch_token?.token_id,
        pack_hash: pack.pack_hash,
      },
    });

    const response: GateIntentionResponse = {
      allowed,
      verdict,
      blast_radius,
      risk_score,
      significance: 1.0,
      in_scope,
      policy_violations,
      reasons: Array.from(new Set(reasons)),
      dispatch_token,
      tier: 'L1',
      latency_ms,
      event_hash: event.hash,
    };

    globalDecisionCache.set(cacheKey, response);
    PersistentDecisionCache.saveToDb(db, {
      cacheKey,
      tool: 'gate_intention',
      queryHash: DecisionLRUCache.computeCacheKey(pack.pack_hash, 'gate_intention', queryPayload),
      packHash: pack.pack_hash,
      result: response,
      tier: 'L1',
      latencyMs: Math.round(latency_ms),
    });

    return response;
  }
}
