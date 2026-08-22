import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { BeliefEngine } from '../../src/engine/beliefs.js';

describe('BeliefEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('asserts and queries beliefs', () => {
    const b = BeliefEngine.updateBelief(db, {
      project: 'test',
      category: 'spatial',
      subject: 'gate_north',
      predicate: 'is_locked',
      object: true,
      confidence: 0.95,
    });

    expect(b.id).toBeDefined();
    expect(b.confidence).toBe(0.95);

    const queried = BeliefEngine.queryBeliefs(db, { project: 'test', category: 'spatial' });
    expect(queried).toHaveLength(1);
    expect(queried[0].subject).toBe('gate_north');
  });

  it('applies exponential decay calculation without crashing', () => {
    BeliefEngine.updateBelief(db, {
      project: 'test',
      category: 'entity',
      subject: 'enemy_scout',
      predicate: 'last_seen_position',
      object: [10, 0, 20],
      confidence: 1.0,
      decay_rate: 0.5,
    });

    BeliefEngine.decayBeliefs(db, 'test');
    const queried = BeliefEngine.queryBeliefs(db, { project: 'test' });
    expect(queried[0].confidence).toBeLessThanOrEqual(1.0);
  });
});
