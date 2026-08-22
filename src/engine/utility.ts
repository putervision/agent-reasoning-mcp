import { UtilityProfile, CandidateAction } from '../schema/types.js';

export class UtilityEngine {
  static scoreCandidate(
    candidate: { action: string; parameters?: Record<string, unknown>; attributes?: Record<string, number> },
    profile: UtilityProfile
  ): CandidateAction {
    const attrs = candidate.attributes || {
      aggression: 0.5,
      caution: 0.5,
      greed: 0.5,
      efficiency: 0.5,
      exploration: 0.5,
      cooperation: 0.5,
    };

    let totalScore = 0;
    let weightSum = 0;
    const breakdown: Record<string, number> = {};

    for (const [k, w] of Object.entries(profile.weights)) {
      const u = attrs[k] !== undefined ? attrs[k] : 0.5;
      const weightedScore = w * u;
      breakdown[k] = weightedScore;
      totalScore += weightedScore;
      weightSum += w;
    }

    const estimated_utility = weightSum > 0 ? totalScore / weightSum : totalScore;

    return {
      action: candidate.action,
      parameters: candidate.parameters,
      estimated_utility,
      utility_breakdown: breakdown,
      feasibility: 1.0,
    };
  }

  static rankCandidates(
    candidates: Array<{ action: string; parameters?: Record<string, unknown>; attributes?: Record<string, number> }>,
    profile: UtilityProfile
  ): CandidateAction[] {
    const scored = candidates.map((c) => this.scoreCandidate(c, profile));
    return scored.sort((a, b) => b.estimated_utility - a.estimated_utility);
  }
}
