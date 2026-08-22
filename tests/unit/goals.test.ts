import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { GoalEngine } from '../../src/engine/goals.js';

describe('GoalEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('creates and retrieves a goal', () => {
    const goal = GoalEngine.createGoal(db, {
      project: 'test',
      title: 'Conquer North Base',
      priority: 0.9,
      success_criteria: ['Control flag', 'Clear enemies'],
    });

    expect(goal.id).toBeDefined();
    expect(goal.title).toBe('Conquer North Base');
    expect(goal.priority).toBe(0.9);
    expect(goal.success_criteria).toHaveLength(2);

    const fetched = GoalEngine.getGoal(db, { project: 'test', id: goal.id });
    expect(fetched.title).toBe('Conquer North Base');
  });

  it('supports idempotency via client_request_id', () => {
    const g1 = GoalEngine.createGoal(db, {
      project: 'test',
      title: 'Scout Perimeter',
      client_request_id: 'req_123',
    });

    const g2 = GoalEngine.createGoal(db, {
      project: 'test',
      title: 'Scout Perimeter Different',
      client_request_id: 'req_123',
    });

    expect(g1.id).toBe(g2.id);
    expect(g2.title).toBe('Scout Perimeter');
  });

  it('decomposes goals hierarchically', () => {
    const parent = GoalEngine.createGoal(db, {
      project: 'test',
      title: 'Secure Outpost',
      priority: 0.8,
    });

    const decomposed = GoalEngine.decomposeGoal(db, {
      project: 'test',
      parent_id: parent.id,
      subgoals: [
        { title: 'Reconnaissance', priority: 0.9 },
        { title: 'Infiltration', priority: 0.8 },
      ],
    });

    expect(decomposed.subgoals).toHaveLength(2);
    expect(decomposed.subgoals[0].parent_id).toBe(parent.id);

    const subgoals = GoalEngine.listGoals(db, { project: 'test', parent_id: parent.id });
    expect(subgoals).toHaveLength(2);
  });
});
