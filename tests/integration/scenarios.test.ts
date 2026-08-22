import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { GoalEngine } from '../../src/engine/goals.js';
import { BeliefEngine } from '../../src/engine/beliefs.js';
import { IntentionEngine } from '../../src/engine/intentions.js';
import { EvaluatorEngine } from '../../src/engine/evaluator.js';
import { verifyEventChain } from '../../src/engine/events.js';

describe('Mandatory Scenarios: agent-reasoning-mcp', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  // Scenario 1: Intention Lifecycle
  it('Scenario 1: executes full intention lifecycle (create -> dispatch -> resolve)', () => {
    const goal = GoalEngine.createGoal(db, { project: 'test', title: 'Capture Flag' });
    const intention = IntentionEngine.createIntention(db, {
      project: 'test',
      goal_id: goal.id,
      behavior_name: 'navigate_and_capture',
      parameters: { speed: 1.5 },
      priority: 0.9,
    });

    expect(intention.status).toBe('pending');

    const dispatched = IntentionEngine.dispatchIntention(db, { project: 'test', id: intention.id });
    expect(dispatched.status).toBe('dispatched');

    const resolved = IntentionEngine.resolveIntention(db, {
      project: 'test',
      id: intention.id,
      status: 'completed',
      result: { flag_captured: true, duration_sec: 42 },
    });

    expect(resolved.status).toBe('completed');
    expect(resolved.result).toEqual({ flag_captured: true, duration_sec: 42 });
  });

  // Scenario 4: SHA-256 Audit Chain Continuity across 50 operations
  it('Scenario 4: verifies unbroken SHA-256 audit ledger across 50 operations', () => {
    for (let i = 0; i < 25; i++) {
      GoalEngine.createGoal(db, { project: 'audit_test', title: `Objective ${i}` });
      BeliefEngine.updateBelief(db, {
        project: 'audit_test',
        category: 'state',
        subject: `fact_${i}`,
        predicate: 'value',
        object: i,
      });
    }

    const auditResult = verifyEventChain(db, 'audit_test');
    expect(auditResult.valid).toBe(true);
    expect(auditResult.total_events).toBe(50);
  });
});
