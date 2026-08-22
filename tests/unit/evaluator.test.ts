import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EvaluatorEngine } from '../../src/engine/evaluator.js';
import { UtilityProfileEngine } from '../../src/engine/personality.js';

describe('EvaluatorEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('evaluates situation against active utility profile', () => {
    UtilityProfileEngine.configureProfile(db, {
      project: 'test',
      name: 'aggressive_profile',
      weights: { aggression: 0.9, caution: 0.1, greed: 0.5, efficiency: 0.5, exploration: 0.5, cooperation: 0.5 },
      is_active: true,
    });

    const result = EvaluatorEngine.evaluateSituation(db, {
      project: 'test',
      snapshot: {
        session_id: 'sess_1',
        timestamp: new Date().toISOString(),
        state: {
          active_goals: [{ id: 'g1', title: 'Win Battle', priority: 1.0 }],
          blockers: [],
        },
        vitals: { hp: 100, threat_level: 0.2 },
      },
      candidate_actions: [
        { action: 'combat_engage', parameters: { aggressive: true } },
        { action: 'idle_patrol', parameters: { radius: 10 } },
      ],
    });

    expect(result.chosen_action.action).toBe('combat_engage');
    expect(result.trace_id).toBeDefined();
    expect(result.reasoning_chain.length).toBeGreaterThan(2);
  });
});
