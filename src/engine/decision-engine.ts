import Database from 'better-sqlite3';
import {
  StatePack,
  ClassifyResponse,
  AskNoulResponse,
  AskChoiceResponse,
  AskScoreResponse,
  DecisionReason,
} from '../schema/types.js';
import { DecisionLRUCache, globalDecisionCache, PersistentDecisionCache } from './cache.js';
import { StatePackBuilder } from './state-pack.js';
import { UtilityEngine } from './utility.js';
import { UtilityProfileEngine } from './personality.js';
import { KnowledgeEngine } from './knowledge.js';
import { logReasoningEvent } from './events.js';
import { canonicalJsonStringify } from '../utils/canonical-json.js';

// In-memory vector store for L2 cosine similarity
const l2CentroidStore = new Map<string, number[]>();

export function registerCentroid(id: string, vector: number[]): void {
  l2CentroidStore.set(id, vector);
}

export function clearCentroids(): void {
  l2CentroidStore.clear();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class DecisionEngine {
  /**
   * Helper to ensure a StatePack is available or create a default sparse one.
   */
  private static resolveStatePack(params: {
    project: string;
    session_id?: string;
    state_pack?: StatePack;
  }): StatePack {
    if (params.state_pack && StatePackBuilder.validate(params.state_pack)) {
      return params.state_pack;
    }
    return StatePackBuilder.build({
      project: params.project,
      session_id: params.session_id || 'default_session',
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. CLASSIFY
  // ═════════════════════════════════════════════════════════════════════════
  static classify(
    db: Database.Database,
    params: {
      project: string;
      target_type: 'entity' | 'visual_state' | 'task' | 'goal' | 'snapshot';
      target_id?: string;
      classes: string[];
      state_pack?: StatePack;
    }
  ): ClassifyResponse {
    const startTime = performance.now();
    const pack = this.resolveStatePack(params);
    const targetObj = typeof (params as any).target === 'object' ? (params as any).target : null;
    const targetId =
      params.target_id ||
      (typeof (params as any).target === 'string' ? (params as any).target : targetObj?.id) ||
      `${params.target_type}_target`;

    // Cap candidate classes at 16
    const rawClasses = params.classes || (params as any).candidate_classes || [];
    const candidateClasses = rawClasses.slice(0, 16);
    if (candidateClasses.length === 0) {
      throw new Error('classify requires at least 1 candidate class.');
    }

    // Cache check
    const queryPayload = {
      target_type: params.target_type,
      target_id: targetId,
      classes: candidateClasses,
    };
    const cacheKey = DecisionLRUCache.computeCacheKey(pack.pack_hash, 'classify', queryPayload);

    const memoryHit = globalDecisionCache.get<ClassifyResponse>(cacheKey);
    if (memoryHit) {
      const res = {
        ...memoryHit.result,
        tier: 'cache' as const,
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
      return res;
    }

    const dbHit = PersistentDecisionCache.getFromDb<ClassifyResponse>(db, cacheKey);
    if (dbHit) {
      const res = {
        ...dbHit.result,
        tier: 'cache' as const,
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
      globalDecisionCache.set(cacheKey, res);
      return res;
    }

    // Tier L1: Heuristic / Pattern Matching
    let tier: 'L1' | 'L2' | 'L3' | 'L4' = 'L1';
    let reasons: DecisionReason[] = [];
    const classScores: Record<string, number> = {};

    for (const c of candidateClasses) {
      classScores[c] = 0;
    }

    let hasFeatures = false;

    // Feature matching: Target Object directly passed
    if (targetObj) {
      hasFeatures = true;
      for (const c of candidateClasses) {
        if (targetObj.type && targetObj.type.toLowerCase().includes(c.toLowerCase()))
          classScores[c] += 0.8;
        if (targetObj.status && targetObj.status.toLowerCase().includes(c.toLowerCase()))
          classScores[c] += 0.8;
        if (/hostile/i.test(targetObj.status) && /threat|critical|danger/i.test(c))
          classScores[c] += 0.85;
      }
    }

    // Feature matching: Vitals
    if (pack.vitals) {
      if ((pack.vitals.hp ?? 100) < 30) {
        hasFeatures = true;
        reasons.push('CRITICAL_VITALS_HP');
        for (const c of candidateClasses) {
          if (/critical|threat|danger|emergency/i.test(c)) {
            classScores[c] += 0.9;
          }
        }
      }
      if ((pack.vitals.threat_level ?? 0) > 0.7) {
        hasFeatures = true;
        reasons.push('HIGH_THREAT_DETECTED');
        for (const c of candidateClasses) {
          if (/threat|critical|danger|hostile/i.test(c)) {
            classScores[c] += 0.85;
          }
        }
      }
    }

    // Feature matching: Spatial Entities
    if (pack.spatial && pack.spatial.nearby_entities.length > 0) {
      hasFeatures = true;
      const matchingEntity = pack.spatial.nearby_entities.find(
        (e) => e.id === targetId || candidateClasses.includes(e.type)
      );
      if (matchingEntity) {
        for (const c of candidateClasses) {
          if (
            c.toLowerCase() === matchingEntity.type.toLowerCase() ||
            c.toLowerCase() === matchingEntity.status.toLowerCase()
          ) {
            classScores[c] += 0.8;
            reasons.push('SPATIAL_PROXIMITY_MATCH');
          }
        }
      }
    }

    // Feature matching: Visual Layout
    if (pack.visual) {
      hasFeatures = true;
      const summary = pack.visual.description_summary.toLowerCase();
      for (const c of candidateClasses) {
        if (summary.includes(c.toLowerCase())) {
          classScores[c] += 0.7;
          reasons.push('VISUAL_LAYOUT_MATCH');
        }
      }
    }

    // Feature matching: Tasks / Blockers
    if (pack.tasks) {
      hasFeatures = true;
      const blockerText = pack.tasks.active_blockers
        .map((b) => b.description.toLowerCase())
        .join(' ');
      for (const c of candidateClasses) {
        if (blockerText.includes(c.toLowerCase())) {
          classScores[c] += 0.6;
          reasons.push('ACTIVE_BLOCKER_PRESENT');
        }
      }
    }

    // Feature matching: FTS5 Heuristics
    try {
      const patterns = KnowledgeEngine.queryKnowledge(db, {
        project: params.project,
        query: `${params.target_type} ${targetId}`,
        limit: 3,
      });
      if (patterns.length > 0) {
        hasFeatures = true;
        for (const p of patterns) {
          for (const c of candidateClasses) {
            if (p.recommended_strategy.toLowerCase().includes(c.toLowerCase())) {
              classScores[c] += p.confidence;
              reasons.push('RULE_HEURISTIC_MATCH');
            }
          }
        }
      }
    } catch {
      // Ignored
    }

    // Sort by score
    const sorted = Object.entries(classScores).sort((a, b) => b[1] - a[1]);
    const topClass = sorted[0][0];
    const topScore = sorted[0][1];
    const secondScore = sorted.length > 1 ? sorted[1][1] : 0;
    const margin = topScore - secondScore;

    let predicted_class = topClass;
    let confidence = 0.5;

    // Strict L1 Abstain Check:
    // If features are missing OR margin < 0.25 and score is low, L1 abstains
    if (!hasFeatures || topScore === 0 || margin < 0.25) {
      // Attempt Tier L2: Vector matcher
      let l2Matched = false;
      if (pack.visual?.embedding_centroids && pack.visual.embedding_centroids.length > 0) {
        const centroid = pack.visual.embedding_centroids[0];
        let bestSim = -1;
        let bestSimClass = topClass;
        for (const c of candidateClasses) {
          const registered = l2CentroidStore.get(c);
          if (registered) {
            const sim = cosineSimilarity(centroid, registered);
            if (sim > bestSim) {
              bestSim = sim;
              bestSimClass = c;
            }
          }
        }
        if (bestSim > 0.78) {
          predicted_class = bestSimClass;
          confidence = Math.round(bestSim * 100) / 100;
          tier = 'L2';
          reasons = ['VECTOR_SIMILARITY_MATCH'];
          l2Matched = true;
        }
      }

      if (!l2Matched) {
        // Enforce L1 Abstain: do not fabricate softmax, report abstain
        predicted_class = candidateClasses[0];
        confidence = 0.0;
        tier = 'L1';
        reasons = ['INSUFFICIENT_FEATURES_ABSTAIN'];
      }
    } else {
      confidence = Math.min(1.0, Math.round(topScore * 100) / 100);
      if (reasons.length === 0) reasons.push('RULE_HEURISTIC_MATCH');
    }

    // Compute probability distribution
    const probabilities: Record<string, number> = {};
    if (reasons.includes('INSUFFICIENT_FEATURES_ABSTAIN')) {
      for (const c of candidateClasses) {
        probabilities[c] = 0;
      }
    } else {
      const sum = sorted.reduce((acc, curr) => acc + Math.max(0.01, curr[1]), 0);
      for (const [cls, sc] of sorted) {
        probabilities[cls] = Math.round((Math.max(0.01, sc) / sum) * 100) / 100;
      }
    }

    // Deduplicate reasons
    reasons = Array.from(new Set(reasons));

    const latency_ms = Math.round((performance.now() - startTime) * 100) / 100;

    // Log decision event
    const event = logReasoningEvent(db, {
      project: params.project,
      entity_id: targetId,
      entity_type: 'decision',
      action: 'classify',
      details: {
        predicted_class,
        confidence,
        tier,
        reasons,
        pack_hash: pack.pack_hash,
      },
    });

    const response: ClassifyResponse = {
      target_id: targetId,
      predicted_class,
      confidence,
      significance: confidence,
      class_probabilities: probabilities,
      calibrated: false,
      reasons,
      tier,
      latency_ms,
      pack_hash: pack.pack_hash,
      event_hash: event.hash,
    };

    // Store in cache
    globalDecisionCache.set(cacheKey, response);
    PersistentDecisionCache.saveToDb(db, {
      cacheKey,
      tool: 'classify',
      queryHash: DecisionLRUCache.computeCacheKey(pack.pack_hash, 'classify', queryPayload),
      packHash: pack.pack_hash,
      result: response,
      tier,
      latencyMs: Math.round(latency_ms),
    });

    return response;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. ASK_NOUL (Boolean / Probabilistic Proposition)
  // ═════════════════════════════════════════════════════════════════════════
  static askNoul(
    db: Database.Database,
    params: {
      project: string;
      statement: string;
      prior?: number;
      state_pack?: StatePack;
    }
  ): AskNoulResponse {
    const startTime = performance.now();
    const pack = this.resolveStatePack(params);
    const queryPayload = { statement: params.statement, prior: params.prior };
    const cacheKey = DecisionLRUCache.computeCacheKey(pack.pack_hash, 'ask_noul', queryPayload);

    const memoryHit = globalDecisionCache.get<AskNoulResponse>(cacheKey);
    if (memoryHit) {
      return {
        ...memoryHit.result,
        tier: 'cache',
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
    }

    const dbHit = PersistentDecisionCache.getFromDb<AskNoulResponse>(db, cacheKey);
    if (dbHit) {
      const res = {
        ...dbHit.result,
        tier: 'cache' as const,
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
      globalDecisionCache.set(cacheKey, res);
      return res;
    }

    let tier: 'L1' | 'L2' | 'L3' | 'L4' = 'L1';
    let reasons: DecisionReason[] = [];
    let probability = params.prior !== undefined ? params.prior : 0.5;
    let confidence = 0.5;
    let hasSignal = false;
    const stmt = (params.statement || (params as any).proposition || '').toLowerCase();

    // Check Vitals for critical conditions
    if (pack.vitals) {
      if (/hp|health|dead|dying|fatal/i.test(stmt)) {
        hasSignal = true;
        if ((pack.vitals.hp ?? 100) < 30) {
          probability = 0.9;
          confidence = 0.95;
          reasons.push('CRITICAL_VITALS_HP');
        } else {
          probability = 0.1;
          confidence = 0.9;
        }
      }
      if (/threat|danger|safe/i.test(stmt)) {
        hasSignal = true;
        const threat = pack.vitals.threat_level ?? 0;
        if (stmt.includes('safe')) {
          probability = threat < 0.3 ? 0.85 : 0.15;
        } else {
          probability = threat > 0.5 ? 0.9 : 0.2;
        }
        confidence = 0.85;
        if (threat > 0.5) reasons.push('HIGH_THREAT_DETECTED');
      }
    }

    // Check Blockers
    if (pack.tasks && pack.tasks.active_blockers.length > 0) {
      if (/block|obstruction|stuck|prevented/i.test(stmt)) {
        hasSignal = true;
        probability = 0.95;
        confidence = 0.95;
        reasons.push('ACTIVE_BLOCKER_PRESENT');
      }
    }

    // Check Visual Layout
    if (pack.visual) {
      if (/visible|rendered|screen|element/i.test(stmt)) {
        hasSignal = true;
        const inDesc = pack.visual.description_summary.toLowerCase();
        probability = inDesc.length > 0 ? 0.8 : 0.2;
        confidence = 0.75;
        reasons.push('VISUAL_LAYOUT_MATCH');
      }
    }

    // Check Spatial
    if (pack.spatial) {
      if (/near|proximity|distance|enemy|hostile/i.test(stmt)) {
        hasSignal = true;
        const hasNear = pack.spatial.nearby_entities.some((e) => e.distance < 5);
        probability = hasNear ? 0.85 : 0.2;
        confidence = 0.8;
        reasons.push('SPATIAL_PROXIMITY_MATCH');
      }
    }

    let escalate = false;
    if (!hasSignal) {
      // Strict L1 Abstain: If no concrete features matched proposition
      reasons.push('INSUFFICIENT_FEATURES_ABSTAIN');
      probability = 0.5;
      confidence = 0.0;
      escalate = true;
    } else if (probability >= 0.4 && probability <= 0.6) {
      escalate = true;
    }

    let perception_escalation:
      | {
          recommended: boolean;
          subgoal_title: string;
          target?: string;
          rationale: string;
        }
      | undefined = undefined;

    if (escalate) {
      const targetMatch = stmt.match(
        /entity[_\s]+([a-zA-Z0-9_-]+)|target[_\s]+([a-zA-Z0-9_-]+)|door|key|chest|player|enemy|item|perimeter|zone/i
      );
      const targetName = targetMatch
        ? targetMatch[1] || targetMatch[2] || targetMatch[0]
        : pack.spatial?.nearby_entities?.[0]?.id || 'target_region';

      perception_escalation = {
        recommended: true,
        subgoal_title: `Perception Escalation: inspect ${targetName}`,
        target: targetName,
        rationale: !hasSignal
          ? 'Insufficient feature evidence in state pack to evaluate proposition (L1 abstain).'
          : 'High uncertainty in proposition probability evaluation (p in [0.4, 0.6]).',
      };
    }

    if (reasons.length === 0) {
      reasons.push('RULE_HEURISTIC_MATCH');
    }

    reasons = Array.from(new Set(reasons));
    const is_true = probability > 0.5;
    const latency_ms = Math.round((performance.now() - startTime) * 100) / 100;

    const event = logReasoningEvent(db, {
      project: params.project,
      entity_id: pack.pack_id,
      entity_type: 'decision',
      action: 'ask_noul',
      details: {
        statement: params.statement,
        is_true,
        probability,
        confidence,
        tier,
        reasons,
        perception_escalation,
        pack_hash: pack.pack_hash,
      },
    });

    const response: AskNoulResponse = {
      is_true,
      probability: Math.round(probability * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      significance: Math.round(confidence * 100) / 100,
      calibrated: false,
      reasons,
      escalate_to_system_two: escalate,
      perception_escalation,
      tier,
      latency_ms,
      pack_hash: pack.pack_hash,
      event_hash: event.hash,
    };

    globalDecisionCache.set(cacheKey, response);
    PersistentDecisionCache.saveToDb(db, {
      cacheKey,
      tool: 'ask_noul',
      queryHash: DecisionLRUCache.computeCacheKey(pack.pack_hash, 'ask_noul', queryPayload),
      packHash: pack.pack_hash,
      result: response,
      tier,
      latencyMs: Math.round(latency_ms),
    });

    return response;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. ASK_CHOICE (Discrete Categorical Choice)
  // ═════════════════════════════════════════════════════════════════════════
  static askChoice(
    db: Database.Database,
    params: {
      project: string;
      question: string;
      options: Array<{ id: string; text: string }>;
      state_pack?: StatePack;
      utility_profile?: string;
    }
  ): AskChoiceResponse {
    const startTime = performance.now();
    const pack = this.resolveStatePack(params);
    const candidateOptions = params.options.slice(0, 16);
    if (candidateOptions.length === 0) {
      throw new Error('ask_choice requires at least 1 option.');
    }

    const queryPayload = {
      question: params.question,
      options: candidateOptions,
      utility_profile: params.utility_profile,
    };
    const cacheKey = DecisionLRUCache.computeCacheKey(pack.pack_hash, 'ask_choice', queryPayload);

    const memoryHit = globalDecisionCache.get<AskChoiceResponse>(cacheKey);
    if (memoryHit) {
      return {
        ...memoryHit.result,
        tier: 'cache',
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
    }

    const dbHit = PersistentDecisionCache.getFromDb<AskChoiceResponse>(db, cacheKey);
    if (dbHit) {
      const res = {
        ...dbHit.result,
        tier: 'cache' as const,
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
      globalDecisionCache.set(cacheKey, res);
      return res;
    }

    let tier: 'L1' | 'L2' | 'L3' | 'L4' = 'L1';
    let reasons: DecisionReason[] = [];

    // Get active utility profile
    let profile = UtilityProfileEngine.getActiveProfile(db, params.project);
    if (params.utility_profile) {
      try {
        const specific = UtilityProfileEngine.getProfile(db, {
          project: params.project,
          name: params.utility_profile,
        });
        if (specific) profile = specific;
      } catch {
        // Fallback to active profile
      }
    } else if (pack.utility?.weights) {
      profile = {
        id: (pack.utility.profile_name || 'pack_utility') as any,
        project: params.project,
        name: pack.utility.profile_name || 'pack_utility',
        weights: pack.utility.weights as any,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    // Score candidate options using UtilityEngine
    const scoredCandidates = candidateOptions.map((opt) => {
      const optText = opt.text.toLowerCase();
      const attrs: Record<string, number> = {
        aggression: 0.5,
        caution: 0.5,
        greed: 0.5,
        efficiency: 0.5,
        exploration: 0.5,
        cooperation: 0.5,
        survival: 0.5,
      };

      if (/attack|strike|destroy|fight/i.test(optText)) {
        attrs.aggression = 1.0;
        attrs.caution = 0.0;
        attrs.survival = 0.1;
      } else if (/flee|retreat|heal|hide|defend|evade|dodge/i.test(optText)) {
        attrs.caution = 1.0;
        attrs.aggression = 0.0;
        attrs.survival = 1.0;
        attrs.efficiency = 0.8;
      } else if (/idle|wait|stand|pause|do nothing/i.test(optText)) {
        attrs.efficiency = 0.1;
        attrs.caution = 0.2;
        attrs.survival = 0.2;
      } else if (/gather|loot|explore|scout/i.test(optText)) {
        attrs.greed = 0.9;
        attrs.exploration = 0.9;
      }

      // Vitals modulation
      if (pack.vitals && (pack.vitals.hp ?? 100) < 30) {
        if (/heal|retreat|flee|evade|dodge/i.test(optText)) {
          attrs.caution = 1.0;
          attrs.survival = 1.0;
        }
      }

      const scored = UtilityEngine.scoreCandidate({ action: opt.id, attributes: attrs }, profile);
      return {
        id: opt.id,
        text: opt.text,
        utility: scored.estimated_utility,
      };
    });

    scoredCandidates.sort((a, b) => b.utility - a.utility);

    const top = scoredCandidates[0];
    const second = scoredCandidates.length > 1 ? scoredCandidates[1] : null;
    const margin = second ? top.utility - second.utility : 1.0;

    let selected_id = top.id;
    let confidence = 0.75;

    // Strict L1 Abstain: if margin < 0.25 between top alternatives
    if (second && margin < 0.25) {
      reasons.push('INSUFFICIENT_FEATURES_ABSTAIN');
      confidence = 0.2;
    } else {
      reasons.push('UTILITY_MARGIN_EXCEEDED');
      confidence = Math.min(1.0, Math.round((0.5 + margin / 2) * 100) / 100);
    }

    if (pack.vitals && (pack.vitals.hp ?? 100) < 30) {
      reasons.push('CRITICAL_VITALS_HP');
    }

    reasons = Array.from(new Set(reasons));

    // Distribution
    const distribution: Record<string, number> = {};
    const sum = scoredCandidates.reduce((acc, c) => acc + Math.max(0.01, c.utility), 0);
    for (const c of scoredCandidates) {
      distribution[c.id] = Math.round((Math.max(0.01, c.utility) / sum) * 100) / 100;
    }

    const latency_ms = Math.round((performance.now() - startTime) * 100) / 100;

    const event = logReasoningEvent(db, {
      project: params.project,
      entity_id: selected_id,
      entity_type: 'decision',
      action: 'ask_choice',
      details: {
        selected_id,
        margin_over_second: Math.round(margin * 100) / 100,
        confidence,
        tier,
        reasons,
        pack_hash: pack.pack_hash,
      },
    });

    const response: AskChoiceResponse = {
      selected_id,
      probability: distribution[selected_id] || 0.5,
      confidence,
      significance: confidence,
      distribution,
      margin_over_second: Math.round(margin * 100) / 100,
      calibrated: false,
      reasons,
      tier,
      latency_ms,
      pack_hash: pack.pack_hash,
      event_hash: event.hash,
    };

    globalDecisionCache.set(cacheKey, response);
    PersistentDecisionCache.saveToDb(db, {
      cacheKey,
      tool: 'ask_choice',
      queryHash: DecisionLRUCache.computeCacheKey(pack.pack_hash, 'ask_choice', queryPayload),
      packHash: pack.pack_hash,
      result: response,
      tier,
      latencyMs: Math.round(latency_ms),
    });

    return response;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. ASK_SCORE (Scalar Evaluation)
  // ═════════════════════════════════════════════════════════════════════════
  static askScore(
    db: Database.Database,
    params: {
      project: string;
      target: string;
      metric: string;
      scale?: [number, number];
      criteria?: string[];
      state_pack?: StatePack;
    }
  ): AskScoreResponse {
    const startTime = performance.now();
    const pack = this.resolveStatePack(params);
    let minScale = 0.0;
    let maxScale = 1.0;
    if (Array.isArray(params.scale) && params.scale.length === 2) {
      minScale = params.scale[0];
      maxScale = params.scale[1];
    } else if (
      typeof (params as any).min_value === 'number' &&
      typeof (params as any).max_value === 'number'
    ) {
      minScale = (params as any).min_value;
      maxScale = (params as any).max_value;
    }
    const targetEntityId = params.target || params.metric || 'score_target';
    const queryPayload = {
      target: targetEntityId,
      metric: params.metric,
      scale: [minScale, maxScale],
      criteria: params.criteria,
    };
    const cacheKey = DecisionLRUCache.computeCacheKey(pack.pack_hash, 'ask_score', queryPayload);

    const memoryHit = globalDecisionCache.get<AskScoreResponse>(cacheKey);
    if (memoryHit) {
      return {
        ...memoryHit.result,
        tier: 'cache',
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
    }

    const dbHit = PersistentDecisionCache.getFromDb<AskScoreResponse>(db, cacheKey);
    if (dbHit) {
      const res = {
        ...dbHit.result,
        tier: 'cache' as const,
        latency_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
      globalDecisionCache.set(cacheKey, res);
      return res;
    }

    let tier: 'L1' | 'L2' | 'L3' | 'L4' = 'L1';
    let reasons: DecisionReason[] = [];
    let normalized = 0.5;
    let confidence = 0.6;
    let hasSignal = false;

    const metric = params.metric.toLowerCase();

    if (/threat|risk|danger/i.test(metric)) {
      hasSignal = true;
      normalized = pack.vitals?.threat_level ?? 0.3;
      confidence = 0.85;
      reasons.push('HIGH_THREAT_DETECTED');
    } else if (/health|vitality|hp/i.test(metric)) {
      hasSignal = true;
      normalized = (pack.vitals?.hp ?? 100) / 100;
      confidence = 0.9;
      if ((pack.vitals?.hp ?? 100) < 30) reasons.push('CRITICAL_VITALS_HP');
    } else if (/progress|completion/i.test(metric)) {
      hasSignal = true;
      normalized = pack.tasks?.active_goal?.progress ?? 0.0;
      confidence = 0.8;
      reasons.push('GOAL_AFFINITY_MAX');
    }

    if (!hasSignal) {
      reasons.push('INSUFFICIENT_FEATURES_ABSTAIN');
      normalized = 0.5;
      confidence = 0.1;
    }

    if (reasons.length === 0) reasons.push('RULE_HEURISTIC_MATCH');
    reasons = Array.from(new Set(reasons));

    const score = Math.round((minScale + normalized * (maxScale - minScale)) * 100) / 100;
    const latency_ms = Math.round((performance.now() - startTime) * 100) / 100;

    const event = logReasoningEvent(db, {
      project: params.project,
      entity_id: targetEntityId,
      entity_type: 'decision',
      action: 'ask_score',
      details: {
        target: params.target,
        metric: params.metric,
        score,
        normalized_score: normalized,
        tier,
        reasons,
        pack_hash: pack.pack_hash,
      },
    });

    const response: AskScoreResponse = {
      score,
      normalized_score: Math.round(normalized * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      significance: Math.round(confidence * 100) / 100,
      calibrated: false,
      reasons,
      tier,
      latency_ms,
      pack_hash: pack.pack_hash,
      event_hash: event.hash,
    };

    globalDecisionCache.set(cacheKey, response);
    PersistentDecisionCache.saveToDb(db, {
      cacheKey,
      tool: 'ask_score',
      queryHash: DecisionLRUCache.computeCacheKey(pack.pack_hash, 'ask_score', queryPayload),
      packHash: pack.pack_hash,
      result: response,
      tier,
      latencyMs: Math.round(latency_ms),
    });

    return response;
  }
}
