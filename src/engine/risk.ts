import {
  RiskAssessmentResult,
  UtilityProfile,
  SpatialRolloutRiskResult,
  AffordanceBitmask,
} from '../schema/types.js';

export class RiskEngine {
  static assessAction(
    actionName: string,
    params?: Record<string, unknown>,
    context?: Record<string, unknown>,
    profile?: UtilityProfile
  ): RiskAssessmentResult {
    const threats: string[] = [];
    const opportunities: string[] = [];
    const mitigations: string[] = [];
    let riskScore = 0.2;

    const hp = (context?.vitals as any)?.hp ?? 100;
    const threatLevel = (context?.vitals as any)?.threat_level ?? 0;

    if (/attack|combat|engage|kite/i.test(actionName)) {
      if (hp < 30) {
        threats.push('Critical health: engagement risks fatality');
        mitigations.push('Flee or heal before attacking');
        riskScore += 0.5;
      } else {
        opportunities.push('Eliminating target yields rewards and security');
        riskScore += 0.2;
      }
    } else if (/flee|retreat|heal/i.test(actionName)) {
      opportunities.push('Preserves agent survival');
      mitigations.push('Navigate away from enemy clusters');
      riskScore = 0.1;
    } else if (/gather|farm|loot/i.test(actionName)) {
      opportunities.push('Resource accumulation');
      if (threatLevel > 0.5) {
        threats.push('Enemies nearby while vulnerable in gathering animation');
        mitigations.push('Maintain line-of-sight check');
        riskScore += 0.3;
      }
    }

    if (profile) {
      // Adjust risk perception by caution vs aggression weights
      riskScore =
        (riskScore * (profile.weights.caution || 0.5)) / (profile.weights.aggression || 0.5);
    }

    riskScore = Math.max(0, Math.min(1, riskScore));

    let threat_level: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (riskScore > 0.8) threat_level = 'critical';
    else if (riskScore > 0.6) threat_level = 'high';
    else if (riskScore > 0.4) threat_level = 'medium';
    else if (riskScore < 0.1) threat_level = 'none';

    return {
      threat_level,
      risk_score: riskScore,
      threats,
      opportunities,
      mitigations,
    };
  }

  static assessSpatialRollout(params: {
    trajectory?: number[][];
    obstacles?: Array<{
      id?: string;
      position?: [number, number, number];
      bounding_box?:
        | { min: [number, number, number]; max: [number, number, number] }
        | [number, number, number, number, number, number];
      radius?: number;
      affordance_mask?: number;
      type?: string;
      status?: string;
    }>;
    clearance_threshold?: number;
  }): SpatialRolloutRiskResult {
    const trajectory = params.trajectory || [];
    const obstacles = params.obstacles || [];
    const threshold = params.clearance_threshold ?? 1.0;

    if (trajectory.length === 0) {
      return {
        collision_probability: 0.0,
        obstacle_clearance: Infinity,
        affordance_violations: [],
        risk_score: 0.0,
        threat_level: 'none',
        breakdown: {
          collision_risk: 0.0,
          clearance_penalty: 0.0,
          affordance_penalty: 0.0,
        },
        mitigations: [],
      };
    }

    let minClearance = Infinity;
    let collisionCount = 0;
    const affordanceViolations: string[] = [];

    for (let i = 0; i < trajectory.length; i++) {
      const pt = trajectory[i];
      if (!Array.isArray(pt) || pt.length < 3) continue;
      const [px, py, pz] = pt;

      for (const obs of obstacles) {
        let dist = Infinity;
        let isInside = false;

        if (obs.bounding_box) {
          let minB: [number, number, number];
          let maxB: [number, number, number];
          if (Array.isArray(obs.bounding_box) && obs.bounding_box.length >= 6) {
            minB = [obs.bounding_box[0], obs.bounding_box[1], obs.bounding_box[2]];
            maxB = [obs.bounding_box[3], obs.bounding_box[4], obs.bounding_box[5]];
          } else if (
            typeof obs.bounding_box === 'object' &&
            'min' in obs.bounding_box &&
            'max' in obs.bounding_box
          ) {
            minB = obs.bounding_box.min;
            maxB = obs.bounding_box.max;
          } else {
            minB = [-0.5, -0.5, -0.5];
            maxB = [0.5, 0.5, 0.5];
          }

          const dx = Math.max(0, Math.max(minB[0] - px, px - maxB[0]));
          const dy = Math.max(0, Math.max(minB[1] - py, py - maxB[1]));
          const dz = Math.max(0, Math.max(minB[2] - pz, pz - maxB[2]));
          dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          isInside =
            px >= minB[0] &&
            px <= maxB[0] &&
            py >= minB[1] &&
            py <= maxB[1] &&
            pz >= minB[2] &&
            pz <= maxB[2];
        } else if (obs.position) {
          const [ox, oy, oz] = obs.position;
          const radius = obs.radius ?? 1.0;
          const centerDist = Math.sqrt((px - ox) ** 2 + (py - oy) ** 2 + (pz - oz) ** 2);
          dist = Math.max(0, centerDist - radius);
          isInside = centerDist <= radius;
        }

        if (isInside || dist === 0) {
          collisionCount++;
          minClearance = 0;
        } else if (dist < minClearance) {
          minClearance = dist;
        }

        // Check affordance violations
        const mask = obs.affordance_mask;
        if (mask !== undefined) {
          const isThreat = (mask & AffordanceBitmask.THREAT) !== 0;
          const isNonTraversable = (mask & AffordanceBitmask.TRAVERSABLE) === 0;

          if (isInside || dist < threshold) {
            if (isThreat) {
              const violation = `Waypoint ${i} (${px.toFixed(1)}, ${py.toFixed(1)}, ${pz.toFixed(1)}) enters THREAT zone of obstacle '${obs.id || 'unknown'}'`;
              if (!affordanceViolations.includes(violation)) affordanceViolations.push(violation);
            }
            if (isNonTraversable) {
              const violation = `Waypoint ${i} violates TRAVERSABLE constraint for obstacle '${obs.id || 'unknown'}' (clearance=${dist.toFixed(2)}m)`;
              if (!affordanceViolations.includes(violation)) affordanceViolations.push(violation);
            }
          }
        }
      }
    }

    const collisionProbability =
      trajectory.length > 0
        ? Math.min(1.0, collisionCount / Math.max(1, trajectory.length * 0.3))
        : 0;
    const clearancePenalty =
      minClearance < threshold && minClearance !== Infinity
        ? Math.min(1.0, (threshold - minClearance) / threshold)
        : 0.0;
    const affordancePenalty = Math.min(1.0, affordanceViolations.length * 0.25);

    const riskScore = Math.min(
      1.0,
      Math.max(
        0.0,
        0.5 * collisionProbability + 0.3 * clearancePenalty + 0.2 * affordancePenalty
      )
    );

    let threat_level: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    if (riskScore > 0.8) threat_level = 'critical';
    else if (riskScore > 0.6) threat_level = 'high';
    else if (riskScore > 0.4) threat_level = 'medium';
    else if (riskScore > 0.1) threat_level = 'low';

    const mitigations: string[] = [];
    if (collisionProbability > 0) {
      mitigations.push('Reroute trajectory waypoints around detected obstacle collisions');
    }
    if (clearancePenalty > 0) {
      mitigations.push(`Increase obstacle clearance to maintain safety threshold of ${threshold}m`);
    }
    if (affordanceViolations.length > 0) {
      mitigations.push('Avoid non-traversable or threat zones in spatial path planning');
    }

    return {
      collision_probability: Math.round(collisionProbability * 1000) / 1000,
      obstacle_clearance: minClearance === Infinity ? 999.0 : Math.round(minClearance * 1000) / 1000,
      affordance_violations: affordanceViolations,
      risk_score: Math.round(riskScore * 1000) / 1000,
      threat_level,
      breakdown: {
        collision_risk: Math.round(collisionProbability * 1000) / 1000,
        clearance_penalty: Math.round(clearancePenalty * 1000) / 1000,
        affordance_penalty: Math.round(affordancePenalty * 1000) / 1000,
      },
      mitigations,
    };
  }
}
