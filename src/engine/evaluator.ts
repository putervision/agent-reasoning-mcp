import Database from 'better-sqlite3';
import { SituationSnapshot, CandidateAction, AffordanceBitmask } from '../schema/types.js';
import { UtilityProfileEngine } from './personality.js';
import { UtilityEngine } from './utility.js';
import { RiskEngine } from './risk.js';
import { DecisionTraceEngine } from './traces.js';
import { StateBridge } from './bridge/state-bridge.js';
import { VisionBridge } from './bridge/vision-bridge.js';
import { WorldBridge, WorldBridgeData } from './bridge/world-bridge.js';

export class EvaluatorEngine {
  static evaluateSituation(
    db: Database.Database,
    params: {
      project: string;
      snapshot?: SituationSnapshot;
      quick_context?: string;
      candidate_actions?: Array<{
        action: string;
        parameters?: Record<string, unknown>;
        description?: string;
      }>;
      utility_profile?: string;
      lookahead_depth?: number;
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
      ? UtilityProfileEngine.getProfile(db, {
          project: params.project,
          name: params.utility_profile,
        })
      : UtilityProfileEngine.getActiveProfile(db, params.project);

    const candidates =
      params.candidate_actions && params.candidate_actions.length > 0
        ? params.candidate_actions
        : [
            { action: 'idle_patrol', parameters: { radius: 15 } },
            { action: 'gather_resources', parameters: { target_type: 'ore' } },
            { action: 'engage_threat', parameters: { aggressive: true } },
            { action: 'flee_to_safety', parameters: { threshold_hp: 30 } },
          ];

    const reasoning_chain: string[] = [];
    reasoning_chain.push(
      `Loaded active utility profile: "${profile.name}" (Aggression: ${profile.weights.aggression}, Caution: ${profile.weights.caution}).`
    );

    let threatLevel = 0.0;
    let currentHp = 100;
    let worldData: WorldBridgeData | undefined;

    if (params.snapshot) {
      reasoning_chain.push(
        `Analyzed situation snapshot from session "${params.snapshot.session_id}".`
      );
      if (params.snapshot.vitals) {
        threatLevel = params.snapshot.vitals.threat_level ?? 0.0;
        currentHp = params.snapshot.vitals.hp ?? 100;
        reasoning_chain.push(`Vitals: HP=${currentHp}, Threat=${threatLevel}.`);
      }

      // 1. State Memory Bridge hydration
      if (params.snapshot.state) {
        const stateData = StateBridge.normalizeStateData(params.snapshot.state);
        if (stateData.blockers.length > 0) {
          reasoning_chain.push(
            `StateBridge: Detected ${stateData.blockers.length} active blocker(s). Elevating caution.`
          );
          threatLevel = Math.max(threatLevel, 0.4);
        }
        if (stateData.tasks.length > 0) {
          reasoning_chain.push(
            `StateBridge: Found ${stateData.tasks.length} active workflow task(s).`
          );
        }
      }

      // 2. Vision Memory Bridge hydration
      if (params.snapshot.vision) {
        const visionData = VisionBridge.normalizeVisionData(params.snapshot.vision);
        if (visionData.description) {
          reasoning_chain.push(
            `VisionBridge: Visual layout: "${visionData.description.substring(0, 100)}...".`
          );
        }
        if (visionData.grounded_elements.length > 0) {
          reasoning_chain.push(
            `VisionBridge: ${visionData.grounded_elements.length} grounded interactive UI element(s) identified.`
          );
        }
      }

      // 3. World Model Bridge hydration
      if (params.snapshot.world) {
        worldData = WorldBridge.normalizeWorldData(params.snapshot.world);
        if (worldData.entities.length > 0) {
          const hostileCount = worldData.entities.filter(
            (e) =>
              /hostile|enemy|threat/i.test(e.type) ||
              /hostile/i.test(e.status) ||
              ((e.affordance_mask ?? 0) & AffordanceBitmask.THREAT) !== 0
          ).length;
          if (hostileCount > 0) {
            threatLevel = Math.max(threatLevel, 0.7);
            reasoning_chain.push(
              `WorldBridge: Detected ${hostileCount} hostile spatial entity/entities in proximity.`
            );
          } else {
            reasoning_chain.push(
              `WorldBridge: Tracking ${worldData.entities.length} spatial entities in environment.`
            );
          }
        }
        if (worldData.spatial_slice) {
          reasoning_chain.push(
            `WorldBridge: Hydrated spatial slice with ${worldData.spatial_slice.nearby_entities.length} nearby entities.`
          );
        }
        if (worldData.spatial_predicates && Object.keys(worldData.spatial_predicates).length > 0) {
          reasoning_chain.push(
            `WorldBridge: Evaluated ${Object.keys(worldData.spatial_predicates).length} spatial predicates.`
          );
        }
      }
    } else if (params.quick_context) {
      reasoning_chain.push(`Quick context: ${params.quick_context}`);
    }

    const observerPos: [number, number, number] = worldData?.observer_position ||
      worldData?.spatial_slice?.observer_position || [0, 0, 0];

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
        caution: isEscape || isPatrol ? 0.8 : 0.3,
        greed: isGather ? 0.9 : 0.2,
        efficiency: Math.min(1.0, Math.max(0.1, eff)),
        exploration: isPatrol ? (threatLevel > 0.5 ? 0.3 : 0.8) : 0.3,
        cooperation: 0.5,
      };

      const candidateScored = UtilityEngine.scoreCandidate({ ...c, attributes }, profile);
      const risk = RiskEngine.assessAction(
        c.action,
        c.parameters,
        params.snapshot ? { vitals: params.snapshot.vitals } : undefined,
        profile
      );
      candidateScored.risk_score = risk.risk_score;

      // ── Spatial Scoring Modulation (§2) ──────────────────────────────────
      let distance_penalty = 0;
      let occlusion_penalty = 0;
      let threat_penalty = 0;
      let affordance_bonus = 0;

      const targetId = (c.parameters?.target_entity_id || c.parameters?.target_id) as
        string | undefined;
      const targetEntity =
        worldData?.entities.find((e) => e.id === targetId) ||
        worldData?.spatial_slice?.nearby_entities.find((e) => e.id === targetId);

      // 1. Distance penalty
      let dist: number | undefined;
      if (c.parameters?.distance !== undefined) {
        dist = Number(c.parameters.distance);
      } else if (
        targetEntity &&
        'distance' in targetEntity &&
        typeof targetEntity.distance === 'number'
      ) {
        dist = targetEntity.distance;
      } else if (
        Array.isArray(c.parameters?.target_position) &&
        c.parameters.target_position.length === 3
      ) {
        const tp = c.parameters.target_position as number[];
        dist = Math.sqrt(
          (tp[0] - observerPos[0]) ** 2 +
            (tp[1] - observerPos[1]) ** 2 +
            (tp[2] - observerPos[2]) ** 2
        );
      } else if (
        targetEntity &&
        'position' in targetEntity &&
        Array.isArray(targetEntity.position)
      ) {
        const ep = targetEntity.position as number[];
        dist = Math.sqrt(
          (ep[0] - observerPos[0]) ** 2 +
            (ep[1] - observerPos[1]) ** 2 +
            (ep[2] - observerPos[2]) ** 2
        );
      }

      if (dist !== undefined && !isNaN(dist)) {
        distance_penalty = Math.min(0.25, (dist / 100) * 0.25);
      }

      // 2. Occlusion penalty
      if (
        c.parameters?.occluded === true ||
        (targetId && worldData?.spatial_predicates?.[`${targetId}_occluded`] === true) ||
        (targetId && worldData?.spatial_predicates?.[`${targetId}:occluded`] === true)
      ) {
        occlusion_penalty = 0.15;
      }

      // 3. Threat penalty
      const isTargetThreat =
        targetEntity &&
        (((targetEntity.affordance_mask ?? 0) & AffordanceBitmask.THREAT) !== 0 ||
          /hostile|enemy|threat/i.test((targetEntity as any).status || (targetEntity as any).type));

      if (isTargetThreat) {
        if (!isCombat && !isEscape) {
          threat_penalty = Math.max(0.15, threatLevel * 0.3);
        }
      } else if (threatLevel > 0.5 && (isGather || isPatrol)) {
        threat_penalty = threatLevel * 0.2;
      }

      // 4. Affordance bonus
      const affordanceMask =
        targetEntity?.affordance_mask ??
        (typeof c.parameters?.affordance_mask === 'number'
          ? c.parameters.affordance_mask
          : typeof c.parameters?.required_affordances === 'number'
            ? c.parameters.required_affordances
            : undefined);

      if (affordanceMask !== undefined) {
        if ((affordanceMask & AffordanceBitmask.TRAVERSABLE) !== 0) affordance_bonus += 0.1;
        if ((affordanceMask & AffordanceBitmask.INTERACTABLE) !== 0) affordance_bonus += 0.15;
        if ((affordanceMask & AffordanceBitmask.CONTAINER) !== 0) affordance_bonus += 0.05;
        if ((affordanceMask & AffordanceBitmask.OCCLUDER) !== 0) affordance_bonus -= 0.05;
        if ((affordanceMask & AffordanceBitmask.THREAT) !== 0) affordance_bonus -= 0.2;
      }

      // Update utility breakdown and estimated utility
      if (candidateScored.utility_breakdown) {
        if (distance_penalty > 0) {
          candidateScored.utility_breakdown.distance_penalty =
            -Math.round(distance_penalty * 1000) / 1000;
        }
        if (occlusion_penalty > 0) {
          candidateScored.utility_breakdown.occlusion_penalty =
            -Math.round(occlusion_penalty * 1000) / 1000;
        }
        if (threat_penalty > 0) {
          candidateScored.utility_breakdown.threat_penalty =
            -Math.round(threat_penalty * 1000) / 1000;
        }
        if (affordance_bonus !== 0) {
          candidateScored.utility_breakdown.affordance_bonus =
            Math.round(affordance_bonus * 1000) / 1000;
        }
      }

      candidateScored.estimated_utility = Math.max(
        0.0,
        Math.min(
          1.0,
          candidateScored.estimated_utility +
            affordance_bonus -
            distance_penalty -
            occlusion_penalty -
            threat_penalty
        )
      );

      if (params.lookahead_depth && params.lookahead_depth > 1) {
        const gamma = 0.85;
        const optionalityBonus =
          isPatrol || isGather ? 0.15 : isCombat && threatLevel > 0.6 ? 0.2 : 0.05;
        candidateScored.estimated_utility += gamma * optionalityBonus;
      }

      return candidateScored;
    });

    if (params.lookahead_depth && params.lookahead_depth > 1) {
      reasoning_chain.push(
        `Applied bounded heuristic lookahead (depth=${params.lookahead_depth}, gamma=0.85) to candidate trajectories.`
      );
    }

    const ranked = scoredCandidates.sort((a, b) => b.estimated_utility - a.estimated_utility);
    const chosen = ranked[0];

    reasoning_chain.push(`Scored ${ranked.length} candidate actions against utility weights.`);
    reasoning_chain.push(
      `Selected highest utility action: "${chosen.action}" with estimated utility ${chosen.estimated_utility.toFixed(3)}.`
    );

    const risk_assessment = RiskEngine.assessAction(
      chosen.action,
      chosen.parameters,
      params.snapshot ? { vitals: params.snapshot.vitals } : undefined,
      profile
    );
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
