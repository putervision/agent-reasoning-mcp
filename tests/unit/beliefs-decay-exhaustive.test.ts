import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { BeliefEngine } from '../../src/engine/beliefs.js';
import { runMigrations } from '../../src/engine/migrations.js';

describe('Belief Confidence Exponential Decay & TTL Expiration Suite', () => {
  let db: Database.Database;
  const project = 'beliefs-decay-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('updates belief confidence and executes exponential decay calculation', () => {
    const belief = BeliefEngine.updateBelief(db, {
      project,
      category: 'spatial',
      subject: 'enemy_boss',
      predicate: 'last_known_position',
      object: [120, 10, 350],
      confidence: 1.0,
      decay_rate: 0.5,
    });

    expect(belief.id).toBeDefined();
    expect(belief.confidence).toBe(1.0);

    // Simulate time passage by setting last_decayed_at 4 hours ago
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE beliefs SET last_decayed_at = ? WHERE id = ?').run(fourHoursAgo, belief.id);

    // Query beliefs (which automatically runs decay sweep)
    const results = BeliefEngine.queryBeliefs(db, {
      project,
      subject: 'enemy_boss',
    });

    expect(results.length).toBe(1);
    // C(4) = 1.0 * e^(-0.5 * 4) = e^(-2) ≈ 0.1353
    expect(results[0].confidence).toBeLessThan(0.3);
    expect(results[0].confidence).toBeGreaterThan(0.05);
  });

  it('purges beliefs whose TTL expiration timestamp has passed', () => {
    const pastTime = new Date(Date.now() - 10000).toISOString();
    const futureTime = new Date(Date.now() + 100000).toISOString();

    // Expired belief
    BeliefEngine.updateBelief(db, {
      project,
      category: 'state',
      subject: 'fog_gate',
      predicate: 'status',
      object: 'closed',
      expires_at: pastTime,
    });

    // Valid belief
    BeliefEngine.updateBelief(db, {
      project,
      category: 'state',
      subject: 'main_gate',
      predicate: 'status',
      object: 'open',
      expires_at: futureTime,
    });

    const expiredCount = BeliefEngine.expireBeliefs(db, project);
    expect(expiredCount).toBe(1);

    const remaining = BeliefEngine.queryBeliefs(db, { project });
    expect(remaining.length).toBe(1);
    expect(remaining[0].subject).toBe('main_gate');
  });

  it('updates existing belief without duplicating rows', () => {
    BeliefEngine.updateBelief(db, {
      project,
      category: 'entity',
      subject: 'npc_merchant',
      predicate: 'stock_gold',
      object: 500,
      confidence: 0.8,
    });

    BeliefEngine.updateBelief(db, {
      project,
      category: 'entity',
      subject: 'npc_merchant',
      predicate: 'stock_gold',
      object: 350,
      confidence: 1.0,
    });

    const all = BeliefEngine.queryBeliefs(db, { project });
    expect(all.length).toBe(1);
    expect(all[0].object).toBe(350);
    expect(all[0].confidence).toBe(1.0);
  });
});
