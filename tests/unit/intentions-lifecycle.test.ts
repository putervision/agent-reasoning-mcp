import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IntentionEngine } from '../../src/engine/intentions.js';
import { GoalEngine } from '../../src/engine/goals.js';
import { runMigrations } from '../../src/engine/migrations.js';

describe('Intention Lifecycle & Dispatch Engine Suite', () => {
  let db: Database.Database;
  const project = 'intentions-lifecycle-project';
  let rootGoalId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    const goal = GoalEngine.createGoal(db, {
      project,
      title: 'Explore Ancient Dungeon',
      priority: 1,
    });
    rootGoalId = goal.id;
  });

  afterEach(() => {
    db.close();
  });

  it('manages full intention lifecycle: pending -> dispatched -> completed', () => {
    // 1. Create intention
    const intention = IntentionEngine.createIntention(db, {
      project,
      goal_id: rootGoalId,
      behavior_name: 'scout_corridor',
      parameters: { speed: 1.5, light_torch: true },
      priority: 0.85,
    });

    expect(intention.id).toBeDefined();
    expect(intention.status).toBe('pending');
    expect(intention.priority).toBe(0.85);

    // 2. Dispatch intention
    const dispatched = IntentionEngine.dispatchIntention(db, {
      project,
      id: intention.id,
    });
    expect(dispatched.status).toBe('dispatched');

    // 3. Resolve intention
    const resolved = IntentionEngine.resolveIntention(db, {
      project,
      id: intention.id,
      status: 'completed',
      result: { corridor_cleared: true, loot_found: ['gold_key'] },
    });

    expect(resolved.status).toBe('completed');
    expect(resolved.result).toEqual({ corridor_cleared: true, loot_found: ['gold_key'] });
  });

  it('lists intentions sorted by priority descending', () => {
    IntentionEngine.createIntention(db, {
      project,
      goal_id: rootGoalId,
      behavior_name: 'gather_herbs',
      priority: 0.2,
    });

    IntentionEngine.createIntention(db, {
      project,
      goal_id: rootGoalId,
      behavior_name: 'flee_dragon',
      priority: 0.99,
    });

    IntentionEngine.createIntention(db, {
      project,
      goal_id: rootGoalId,
      behavior_name: 'patrol_camp',
      priority: 0.5,
    });

    const list = IntentionEngine.listIntentions(db, { project });
    expect(list.length).toBe(3);
    expect(list[0].behavior_name).toBe('flee_dragon');
    expect(list[1].behavior_name).toBe('patrol_camp');
    expect(list[2].behavior_name).toBe('gather_herbs');
  });

  it('supports client_request_id idempotency', () => {
    const i1 = IntentionEngine.createIntention(db, {
      project,
      goal_id: rootGoalId,
      behavior_name: 'mine_iron',
      client_request_id: 'req_mine_001',
    });

    const i2 = IntentionEngine.createIntention(db, {
      project,
      goal_id: rootGoalId,
      behavior_name: 'mine_iron',
      client_request_id: 'req_mine_001',
    });

    expect(i1.id).toBe(i2.id);
  });
});
