import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { BeliefEngine } from '../../src/engine/beliefs.js';
import { IntentionGateEngine } from '../../src/engine/intention-gate.js';
import { DecisionEngine } from '../../src/engine/decision-engine.js';
import { AffordanceBitmask } from '../../src/schema/types.js';

describe('Spatial Belief Reconciliation, Intention Affordance Gating & Perception Escalation', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    process.env.PENTAD_HMAC_SECRET = 'test_secret_for_reasoning_gate';
  });

  it('reconciles spatial beliefs with reinforced, decayed, unexpected, and novel entities', () => {
    // Seed initial belief for entity that will go missing
    BeliefEngine.updateBelief(db, {
      project: 'test_proj',
      category: 'spatial',
      subject: 'patrol_guard',
      predicate: 'location',
      object: { position: [10, 0, 10] },
      confidence: 0.9,
    });

    const result = BeliefEngine.reconcileSpatial(db, {
      project: 'test_proj',
      matched_entities: [
        {
          id: 'base_beacon',
          position: [0, 0, 0],
          status: 'active',
          affordance_mask: AffordanceBitmask.INTERACTABLE,
          confidence: 0.9,
        },
      ],
      missing_entities: [
        {
          id: 'patrol_guard',
          reason: 'not_found_in_camera_frustum',
        },
      ],
      unexpected_entities: [
        {
          id: 'wandering_merchant',
          position: [15, 0, 2],
          status: 'neutral',
        },
      ],
      novel_entities: [
        {
          id: 'unmapped_cave',
          position: [50, 0, 50],
          affordance_mask: AffordanceBitmask.TRAVERSABLE,
        },
      ],
    });

    expect(result.matched_count).toBe(1);
    expect(result.decayed_missing_count).toBe(1);
    expect(result.unexpected_count).toBe(1);
    expect(result.novel_count).toBe(1);

    // Verify decayed belief for missing entity
    const decayed = BeliefEngine.queryBeliefs(db, {
      project: 'test_proj',
      category: 'spatial',
      subject: 'patrol_guard',
    });
    expect(decayed.length).toBe(1);
    expect(decayed[0].confidence).toBeLessThan(0.9); // decayed from 0.9 -> 0.45
  });

  it('gates intentions and rejects non-combat actions targeting threat entities', () => {
    const statePack = {
      pack_id: 'pack_1',
      pack_hash: 'hash_1',
      timestamp: new Date().toISOString(),
      project: 'test_proj',
      session_id: 'sess_1',
      spatial: {
        observer_position: [0, 0, 0] as [number, number, number],
        nearby_entities: [
          {
            id: 'hostile_boss',
            type: 'boss',
            distance: 5,
            status: 'hostile',
            affordance_mask: AffordanceBitmask.THREAT,
          },
        ],
      },
    };

    const gateRes = IntentionGateEngine.evaluateAndGate(db, {
      project: 'test_proj',
      proposed_action: {
        behavior_name: 'gather_resources',
        parameters: { target_entity_id: 'hostile_boss' },
      },
      state_pack: statePack as any,
    });

    expect(gateRes.allowed).toBe(false);
    expect(gateRes.verdict).toBe('rejected');
    expect(gateRes.blast_radius).toBe('critical');
    expect(gateRes.reasons).toContain('AFFORDANCE_VIOLATION');
  });

  it('provides perception escalation recommendation on ask_noul abstain / high uncertainty', () => {
    const res = DecisionEngine.askNoul(db, {
      project: 'test_proj',
      statement: 'Is target door unlocked?',
      // No features in empty state pack -> L1 abstain
    });

    expect(res.escalate_to_system_two).toBe(true);
    expect(res.reasons).toContain('INSUFFICIENT_FEATURES_ABSTAIN');
    expect(res.perception_escalation).toBeDefined();
    expect(res.perception_escalation?.recommended).toBe(true);
    expect(res.perception_escalation?.subgoal_title).toContain('Perception Escalation: inspect door');
  });
});
