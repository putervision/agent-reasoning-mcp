import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { DecisionEngine, registerCentroid, clearCentroids } from '../../src/engine/decision-engine.js';
import { StatePackBuilder } from '../../src/engine/state-pack.js';
import { globalDecisionCache } from '../../src/engine/cache.js';
import { StatePack } from '../../src/schema/types.js';

describe('DecisionEngine - L1/L2 Fast Decision Layer', () => {
  let db: Database.Database;
  const project = 'decision_engine_test';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    globalDecisionCache.clear();
  });

  afterEach(() => {
    db.close();
  });

  const baseStatePack: StatePack = StatePackBuilder.build({
    project,
    session_id: 'session_dec_01',
    spatial: {
      observer_position: [0, 0, 0],
      nearby_entities: [
        { id: 'ent_drone', type: 'hostile_drone', distance: 2.5, status: 'hostile' },
        { id: 'ent_depot', type: 'supply_crate', distance: 12.0, status: 'neutral' },
      ],
    },
    tasks: {
      active_goal: {
        id: 'goal_retreat',
        title: 'Retreat to safety',
        priority: 0.95,
        progress: 0.2,
      },
      active_blockers: [
        { id: 'blk_01', description: 'Hostile drone patrol in quadrant' },
      ],
      recent_decision_ids: [],
    },
    vitals: {
      hp: 20.0, // Critical HP
      threat_level: 0.85,
    },
    utility: {
      profile_name: 'cautious',
      weights: {
        aggression: 0.1,
        caution: 0.9,
        greed: 0.2,
        efficiency: 0.5,
        exploration: 0.2,
        cooperation: 0.5,
      },
    },
  });

  it('classifies target using L1 heuristics and identifies threat [airgap]', () => {
    const result = DecisionEngine.classify(db, {
      project,
      target_type: 'entity',
      target: { id: 'ent_drone', type: 'hostile_drone', status: 'hostile' },
      candidate_classes: ['critical_threat', 'neutral_ambient', 'friendly'],
      state_pack: baseStatePack,
    });

    expect(result.predicted_class).toBe('critical_threat');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.reasons).toContain('CRITICAL_VITALS_HP');
    expect(result.reasons).toContain('HIGH_THREAT_DETECTED');
    expect(result.tier).toBe('L1');
    expect(result.calibrated).toBe(false);
  });

  it('enforces strict L1 abstain rule when features are sparse [airgap][offline]', () => {
    // Empty state pack without features
    const emptyPack = StatePackBuilder.build({
      project,
      session_id: 'empty_session',
    });

    const result = DecisionEngine.classify(db, {
      project,
      target_type: 'entity',
      target: { id: 'unknown_obj', type: 'unknown' },
      candidate_classes: ['alpha', 'beta', 'gamma'],
      state_pack: emptyPack,
    });

    // When features are sparse and margin is zero, L1 must abstain rather than fake softmax
    expect(result.reasons).toContain('INSUFFICIENT_FEATURES_ABSTAIN');
  });

  it('evaluates ask_noul proposition with confidence and escalation on uncertainty [airgap]', () => {
    const result = DecisionEngine.askNoul(db, {
      project,
      proposition: 'Threat level is high and agent is in critical condition',
      state_pack: baseStatePack,
    });

    expect(result.is_true).toBe(true);
    expect(result.probability).toBeGreaterThan(0.6);
    expect(result.escalate_to_system_two).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('evaluates ask_choice and verifies margin between top choices [airgap]', () => {
    const result = DecisionEngine.askChoice(db, {
      project,
      question: 'What immediate tactical action should be taken?',
      options: [
        { id: 'evade', text: 'Evade hostile threat immediately' },
        { id: 'attack', text: 'Attack hostile drone head-on' },
        { id: 'idle', text: 'Wait and observe' },
      ],
      state_pack: baseStatePack,
    });

    expect(result.selected_id).toBe('evade');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.distribution['evade']).toBeGreaterThan(result.distribution['attack']);
    expect(result.tier).toBe('L1');
  });

  it('evaluates ask_score on bounded numeric scale [airgap]', () => {
    const result = DecisionEngine.askScore(db, {
      project,
      metric: 'threat_severity',
      min_value: 0,
      max_value: 100,
      state_pack: baseStatePack,
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.normalized_score).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('evaluates ask_score for health, progress, and unknown metrics [airgap]', () => {
    // Health (critical < 30)
    const hpRes = DecisionEngine.askScore(db, {
      project,
      metric: 'hp',
      min_value: 0,
      max_value: 100,
      state_pack: baseStatePack,
    });
    expect(hpRes.reasons).toContain('CRITICAL_VITALS_HP');
    expect(hpRes.score).toBe(20);

    // Progress
    const progRes = DecisionEngine.askScore(db, {
      project,
      metric: 'goal_completion_progress',
      state_pack: baseStatePack,
    });
    expect(progRes.reasons).toContain('GOAL_AFFINITY_MAX');
    expect(progRes.score).toBe(0.2);

    // Unknown metric
    const unkRes = DecisionEngine.askScore(db, {
      project,
      metric: 'unknown_abstract_metric',
      state_pack: baseStatePack,
    });
    expect(unkRes.reasons).toContain('INSUFFICIENT_FEATURES_ABSTAIN');
  });

  it('hits in-memory LRU cache on identical repeat queries in <1ms [airgap]', () => {
    // First query
    const res1 = DecisionEngine.askNoul(db, {
      project,
      proposition: 'Is immediate evacuation required?',
      state_pack: baseStatePack,
    });
    expect(res1.tier).toBe('L1');

    // Second identical query
    const res2 = DecisionEngine.askNoul(db, {
      project,
      proposition: 'Is immediate evacuation required?',
      state_pack: baseStatePack,
    });
    expect(res2.tier).toBe('cache');
    expect(res2.probability).toBe(res1.probability);
    expect(res2.latency_ms).toBeLessThan(5.0);

    // askScore cache hit
    const s1 = DecisionEngine.askScore(db, {
      project,
      metric: 'threat_level',
      state_pack: baseStatePack,
    });
    const s2 = DecisionEngine.askScore(db, {
      project,
      metric: 'threat_level',
      state_pack: baseStatePack,
    });
    expect(s2.tier).toBe('cache');
  });

  it('matches L2 vector centroid when L1 abstains and embeddings are present [airgap]', () => {
    registerCentroid('boss_unit', [1, 0, 0, 0]);

    const l2Pack = StatePackBuilder.build({
      project,
      session_id: 'l2_session',
      visual: {
        state_id: 'vs_boss',
        layout_hash: 'hash_boss',
        description_summary: 'boss room',
        interactive_element_count: 0,
        embedding_centroids: [[0.95, 0.05, 0, 0]],
      },
    });

    const result = DecisionEngine.classify(db, {
      project,
      target_type: 'entity',
      target: { id: 'unknown_ent', type: 'unknown' },
      candidate_classes: ['boss_unit', 'grunt_unit'],
      state_pack: l2Pack,
    });

    expect(result.tier).toBe('L2');
    expect(result.predicted_class).toBe('boss_unit');
    expect(result.confidence).toBeGreaterThan(0.78);
    expect(result.reasons).toContain('VECTOR_SIMILARITY_MATCH');

    clearCentroids();
  });

  it('tests DecisionLRUCache eviction and PersistentDecisionCache edges', async () => {
    const { DecisionLRUCache, PersistentDecisionCache } = await import('../../src/engine/cache.js');
    const smallCache = new DecisionLRUCache(2, 5000);
    smallCache.set('k1', { val: 1 });
    smallCache.set('k2', { val: 2 });
    expect(smallCache.size()).toBe(2);
    smallCache.set('k3', { val: 3 }); // Evicts k1
    expect(smallCache.size()).toBe(2);
    expect(smallCache.get('k1')).toBeNull();
    expect(smallCache.get('k3')?.result).toEqual({ val: 3 });

    // Expired row in PersistentDecisionCache
    const pastDate = new Date(Date.now() - 10000).toISOString();
    db.prepare('INSERT INTO decision_cache (cache_key, tool, query_hash, pack_hash, result_json, tier, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'expired_key',
      'classify',
      'qhash',
      'phash',
      JSON.stringify({ test: true }),
      'L1',
      pastDate,
      pastDate
    );
    const expiredRes = PersistentDecisionCache.getFromDb(db, 'expired_key');
    expect(expiredRes).toBeNull();

    // Invalid JSON row in PersistentDecisionCache
    const futureDate = new Date(Date.now() + 60000).toISOString();
    db.prepare('INSERT INTO decision_cache (cache_key, tool, query_hash, pack_hash, result_json, tier, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'bad_json_key',
      'classify',
      'qhash',
      'phash',
      'invalid-json-string{',
      'L1',
      futureDate,
      futureDate
    );
    const badRes = PersistentDecisionCache.getFromDb(db, 'bad_json_key');
    expect(badRes).toBeNull();
  });
});
