import { RiskAssessmentResult, UtilityProfile } from '../schema/types.js';

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
}
