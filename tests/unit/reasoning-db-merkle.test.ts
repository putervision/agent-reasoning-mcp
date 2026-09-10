import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { verifyEventChain, logReasoningEvent } from '../../src/engine/events.js';
import { SnapshotEngine } from '../../src/engine/snapshots.js';
import { GoalEngine } from '../../src/engine/goals.js';
import { BeliefEngine } from '../../src/engine/beliefs.js';
import { runMigrations } from '../../src/engine/migrations.js';

describe('Merkle Event Ledger & Snapshot Rollback in agent-reasoning-mcp', () => {
  let db: Database.Database;
  const project = 'reasoning-merkle-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Cryptographic Merkle Chain', () => {
    it('verifies SHA-256 event chaining across multiple engine actions', () => {
      logReasoningEvent(db, {
        project,
        entity_id: 'goal_01',
        entity_type: 'goal',
        action: 'create',
        details: { title: 'Discover Ancient Temple' },
      });

      logReasoningEvent(db, {
        project,
        entity_id: 'belief_01',
        entity_type: 'belief',
        action: 'assert',
        details: { subject: 'temple', predicate: 'is_located_at', confidence: 0.95 },
      });

      const audit = verifyEventChain(db, project);
      expect(audit.valid).toBe(true);
      expect(audit.total_events).toBe(2);
    });

    it('detects tampering when an event details payload is modified directly in SQLite', () => {
      logReasoningEvent(db, {
        project,
        entity_id: 'goal_01',
        entity_type: 'goal',
        action: 'create',
        details: { title: 'Original Goal' },
      });

      // Tamper with SQLite record
      db.prepare(
        "UPDATE events SET details_json = '{\"tampered\": true}' WHERE entity_id = 'goal_01'"
      ).run();

      const audit = verifyEventChain(db, project);
      expect(audit.valid).toBe(false);
      expect(audit.error).toContain('Data tamper detected');
    });
  });

  describe('SnapshotEngine', () => {
    it('saves snapshot and restores goals/beliefs state upon rollback', () => {
      GoalEngine.createGoal(db, {
        project,
        title: 'Initial Base Goal',
      });

      BeliefEngine.updateBelief(db, {
        project,
        category: 'spatial',
        subject: 'home_base',
        predicate: 'coordinates',
        object: [0, 0, 0],
      });

      const snap = SnapshotEngine.saveSnapshot(db, {
        project,
        name: 'checkpoint_alpha',
      });

      expect(snap.snapshot_id).toBeDefined();

      // Subsequent changes
      GoalEngine.createGoal(db, {
        project,
        title: 'Dangerous Temporary Quest',
      });

      expect(GoalEngine.listGoals(db, { project }).length).toBe(2);

      // Restore
      const res = SnapshotEngine.restoreSnapshot(db, {
        project,
        name: 'checkpoint_alpha',
      });

      expect(res.restored_goals).toBe(1);
      expect(res.restored_beliefs).toBe(1);

      const afterRestoreGoals = GoalEngine.listGoals(db, { project });
      expect(afterRestoreGoals.length).toBe(1);
      expect(afterRestoreGoals[0].title).toBe('Initial Base Goal');
    });
  });
});
