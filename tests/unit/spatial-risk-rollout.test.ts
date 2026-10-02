import { describe, it, expect } from 'vitest';
import { RiskEngine } from '../../src/engine/risk.js';
import { AffordanceBitmask } from '../../src/schema/types.js';

describe('Spatial Rollout Risk Assessment', () => {
  it('detects zero risk on clear trajectory without obstacles', () => {
    const result = RiskEngine.assessSpatialRollout({
      trajectory: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
      obstacles: [],
    });

    expect(result.collision_probability).toBe(0);
    expect(result.risk_score).toBe(0);
    expect(result.threat_level).toBe('none');
    expect(result.affordance_violations.length).toBe(0);
  });

  it('detects collision with spherical obstacle and assesses high risk', () => {
    const result = RiskEngine.assessSpatialRollout({
      trajectory: [
        [0, 0, 0],
        [5, 0, 0],
        [10, 0, 0],
      ],
      obstacles: [
        {
          id: 'boulder_1',
          position: [5, 0, 0],
          radius: 1.5,
          affordance_mask: AffordanceBitmask.OCCLUDER, // Non-traversable
        },
      ],
      clearance_threshold: 2.0,
    });

    expect(result.collision_probability).toBeGreaterThan(0);
    expect(result.obstacle_clearance).toBe(0);
    expect(result.risk_score).toBeGreaterThan(0.4);
    expect(result.affordance_violations.length).toBeGreaterThan(0);
    expect(result.mitigations.length).toBeGreaterThan(0);
  });

  it('detects affordance violation when penetrating threat obstacle bounding box', () => {
    const result = RiskEngine.assessSpatialRollout({
      trajectory: [
        [0, 0, 0],
        [2, 2, 0],
        [4, 4, 0],
      ],
      obstacles: [
        {
          id: 'lava_pit',
          bounding_box: {
            min: [1, 1, -1],
            max: [3, 3, 1],
          },
          affordance_mask: AffordanceBitmask.THREAT,
        },
      ],
    });

    expect(result.affordance_violations.some((v) => v.includes('THREAT') || v.includes('lava_pit'))).toBe(true);
    expect(result.threat_level).toMatch(/high|critical/);
  });
});
