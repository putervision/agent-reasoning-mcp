import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EvaluatorEngine } from '../../src/engine/evaluator.js';
import { StateBridge } from '../../src/engine/bridge/state-bridge.js';
import { VisionBridge } from '../../src/engine/bridge/vision-bridge.js';
import { WorldBridge } from '../../src/engine/bridge/world-bridge.js';
import { UtilityProfileEngine } from '../../src/engine/personality.js';
import { runMigrations } from '../../src/engine/migrations.js';
import { SituationSnapshot } from '../../src/schema/types.js';

describe('Strategic Evaluator & Multi-Bridge Hydration Suite', () => {
  let db: Database.Database;
  const project = 'evaluator-bridges-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('hydrates state-memory tasks and blockers via StateBridge', () => {
    const rawState = {
      tasks: [{ id: 'task_01', title: 'Mine ore', status: 'in_progress', priority: 1 }],
      blockers: [{ id: 'blk_01', description: 'Inventory full' }],
      decisions: [{ id: 'dec_01', recommendation: 'Use iron pickaxe' }],
    };

    const parsed = StateBridge.normalizeStateData(rawState);
    expect(parsed.tasks.length).toBe(1);
    expect(parsed.blockers.length).toBe(1);
    expect(parsed.blockers[0].description).toBe('Inventory full');
  });

  it('hydrates vision-memory layout and grounded elements via VisionBridge', () => {
    const rawVision = {
      current_state_id: 'vs_01',
      description: 'Hostile creature approaching on left flank',
      grounded_elements: [
        { selector: '#enemy_spider', label: 'Enemy Spider' },
        { selector: '#health_bar', label: 'Health Bar' },
      ],
    };

    const parsed = VisionBridge.normalizeVisionData(rawVision);
    expect(parsed.description).toContain('Hostile creature');
    expect(parsed.grounded_elements.length).toBe(2);
    expect(parsed.current_state_id).toBe('vs_01');
  });

  it('hydrates world-model 3D spatial entities and relations via WorldBridge', () => {
    const rawWorld = {
      entities: [
        {
          id: 'ent_goblin',
          position: [5, 0, 8] as [number, number, number],
          type: 'hostile',
          status: 'active',
        },
        {
          id: 'ent_chest',
          position: [2, 0, 3] as [number, number, number],
          type: 'container',
          status: 'unopened',
        },
      ],
      relations: [{ source: 'ent_chest', relation: 'near', target: 'player' }],
    };

    const parsed = WorldBridge.normalizeWorldData(rawWorld);
    expect(parsed.entities.length).toBe(2);
    expect(parsed.relations.length).toBe(1);
  });

  it('evaluates threat level and scores action candidates dynamically across utility profiles', () => {
    // Register utility profiles
    UtilityProfileEngine.configureProfile(db, {
      project,
      name: 'aggressive_warrior',
      description: 'High combat aggression',
      weights: {
        aggression: 0.95,
        caution: 0.05,
        greed: 0.4,
        efficiency: 0.7,
        exploration: 0.2,
        cooperation: 0.1,
      },
      is_active: false,
    });

    UtilityProfileEngine.configureProfile(db, {
      project,
      name: 'cautious_scout',
      description: 'Defensive survival',
      weights: {
        aggression: 0.05,
        caution: 0.95,
        greed: 0.1,
        efficiency: 0.8,
        exploration: 0.6,
        cooperation: 0.5,
      },
      is_active: false,
    });

    const snapshot: SituationSnapshot = {
      session_id: 'sess_eval_01',
      vitals: { hp: 25, max_hp: 100, threat_level: 0.85 },
      state: {
        tasks: [{ id: 't1', title: 'Survive', status: 'in_progress', priority: 1 }],
        blockers: [{ id: 'b1', description: 'Surrounded by enemies' }],
        decisions: [],
      },
      world: {
        entities: [
          { id: 'e1', type: 'hostile', position: [1, 0, 1], status: 'hostile' },
          { id: 'e2', type: 'hostile', position: [2, 0, 2], status: 'hostile' },
        ],
        relations: [],
      },
    };

    // 1. Aggressive evaluation
    const aggRes = EvaluatorEngine.evaluateSituation(db, {
      project,
      snapshot,
      utility_profile: 'aggressive_warrior',
    });

    expect(aggRes.chosen_action).toBeDefined();
    expect(aggRes.ranked_candidates.length).toBeGreaterThanOrEqual(3);
    expect(
      aggRes.reasoning_chain.some((r) => r.includes('WorldBridge') || r.includes('hostile'))
    ).toBe(true);

    // 2. Cautious evaluation
    const cautRes = EvaluatorEngine.evaluateSituation(db, {
      project,
      snapshot,
      utility_profile: 'cautious_scout',
    });

    expect(cautRes.chosen_action.action).toBe('flee_to_safety');
  });

  it('records decision traces with explainable reasoning chains', () => {
    const res = EvaluatorEngine.evaluateSituation(db, {
      project,
      quick_context: 'Low stamina, patrol perimeter',
    });

    expect(res.trace_id).toBeDefined();
    expect(res.reasoning_chain.length).toBeGreaterThan(1);
    expect(res.risk_assessment).toBeDefined();
  });
});
