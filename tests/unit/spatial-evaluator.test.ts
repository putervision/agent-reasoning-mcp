import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EvaluatorEngine } from '../../src/engine/evaluator.js';
import { UtilityProfileEngine } from '../../src/engine/personality.js';
import { AffordanceBitmask } from '../../src/schema/types.js';

describe('Spatial Evaluator & Utility Nudge', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('modulates candidate utility with distance, occlusion, and affordance terms', () => {
    UtilityProfileEngine.configureProfile(db, {
      project: 'test_proj',
      name: 'balanced',
      weights: {
        aggression: 0.5,
        caution: 0.5,
        greed: 0.5,
        efficiency: 0.5,
        exploration: 0.5,
        cooperation: 0.5,
      },
      is_active: true,
    });

    const snapshot = {
      session_id: 'sess_spatial',
      world: {
        observer_position: [0, 0, 0] as [number, number, number],
        entities: [
          {
            id: 'chest_1',
            type: 'container',
            position: [2, 0, 0] as [number, number, number],
            status: 'neutral',
            affordance_mask: AffordanceBitmask.INTERACTABLE | AffordanceBitmask.CONTAINER,
          },
          {
            id: 'distant_ore',
            type: 'ore',
            position: [80, 0, 0] as [number, number, number],
            status: 'neutral',
            affordance_mask: AffordanceBitmask.INTERACTABLE,
          },
          {
            id: 'occluded_target',
            type: 'loot',
            position: [5, 0, 0] as [number, number, number],
            status: 'neutral',
            affordance_mask: AffordanceBitmask.INTERACTABLE,
          },
        ],
        spatial_predicates: {
          occluded_target_occluded: true,
        },
      },
      vitals: { hp: 100, threat_level: 0.1 },
    };

    const candidateActions = [
      {
        action: 'loot_chest',
        parameters: { target_entity_id: 'chest_1' },
      },
      {
        action: 'mine_distant_ore',
        parameters: { target_entity_id: 'distant_ore' },
      },
      {
        action: 'loot_occluded',
        parameters: { target_entity_id: 'occluded_target' },
      },
    ];

    const result = EvaluatorEngine.evaluateSituation(db, {
      project: 'test_proj',
      snapshot,
      candidate_actions: candidateActions,
    });

    expect(result.chosen_action.action).toBe('loot_chest');

    const chestCandidate = result.ranked_candidates.find((c) => c.action === 'loot_chest')!;
    const distantCandidate = result.ranked_candidates.find((c) => c.action === 'mine_distant_ore')!;
    const occludedCandidate = result.ranked_candidates.find((c) => c.action === 'loot_occluded')!;

    // Chest has affordance bonus (+0.15 interactable + 0.05 container = +0.20)
    expect(chestCandidate.utility_breakdown?.affordance_bonus).toBeGreaterThan(0);

    // Distant ore has higher distance penalty than close chest
    expect(distantCandidate.utility_breakdown?.distance_penalty).toBeDefined();
    expect(Math.abs(distantCandidate.utility_breakdown?.distance_penalty || 0)).toBeGreaterThan(
      Math.abs(chestCandidate.utility_breakdown?.distance_penalty || 0)
    );

    // Occluded target has occlusion penalty (-0.15)
    expect(occludedCandidate.utility_breakdown?.occlusion_penalty).toBe(-0.15);

    // Chosen action should have higher estimated utility
    expect(chestCandidate.estimated_utility).toBeGreaterThan(distantCandidate.estimated_utility);
    expect(chestCandidate.estimated_utility).toBeGreaterThan(occludedCandidate.estimated_utility);
  });

  it('nudges utility profile weights incrementally within [0.0, 1.0]', () => {
    UtilityProfileEngine.configureProfile(db, {
      project: 'test_proj',
      name: 'scout',
      weights: {
        aggression: 0.2,
        caution: 0.8,
        greed: 0.4,
        efficiency: 0.6,
        exploration: 0.7,
        cooperation: 0.5,
      },
      is_active: true,
    });

    // Nudge caution upwards and aggression downwards
    const nudged = UtilityProfileEngine.nudgeProfile(db, {
      project: 'test_proj',
      name: 'scout',
      delta: {
        caution: 0.15,
        aggression: -0.1,
        exploration: 0.5, // should clamp to 1.0
      },
    });

    expect(nudged.weights.caution).toBe(0.95);
    expect(nudged.weights.aggression).toBe(0.1);
    expect(nudged.weights.exploration).toBe(1.0); // clamped
    expect(nudged.weights.greed).toBe(0.4); // unchanged
  });
});
