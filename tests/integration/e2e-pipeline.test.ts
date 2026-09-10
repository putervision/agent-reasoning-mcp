import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations as runReasoningMigrations } from '../../src/engine/migrations.js';
import { GoalEngine } from '../../src/engine/goals.js';
import { EvaluatorEngine } from '../../src/engine/evaluator.js';
import { IntentionEngine } from '../../src/engine/intentions.js';

describe('Scenario 7: Deterministic LLM-Free E2E Pipeline', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runReasoningMigrations(db);
  });

  it('runs complete closed-loop pipeline deterministically without LLMs', () => {
    // 1. Goal creation
    const goal = GoalEngine.createGoal(db, {
      project: 'e2e_project',
      title: 'Defend Base from Incursion',
      priority: 0.95,
      success_criteria: ['Threat eliminated', 'Base intact'],
    });
    expect(goal.id).toBeDefined();

    // 2. Evaluate situation with mock world/vision snapshot
    const evaluation = EvaluatorEngine.evaluateSituation(db, {
      project: 'e2e_project',
      snapshot: {
        session_id: 'e2e_sess',
        timestamp: new Date().toISOString(),
        vitals: { hp: 100, threat_level: 0.8 },
        state: {
          active_goals: [{ id: goal.id, title: goal.title, priority: goal.priority }],
          blockers: [],
        },
      },
      candidate_actions: [
        { action: 'combat_kite', parameters: { aggressive: true } },
        { action: 'idle_patrol', parameters: { radius: 10 } },
      ],
    });

    expect(evaluation.chosen_action.action).toBe('combat_kite');

    // 3. Dispatch Intention
    const intention = IntentionEngine.createIntention(db, {
      project: 'e2e_project',
      goal_id: goal.id,
      trace_id: evaluation.trace_id,
      behavior_name: evaluation.chosen_action.action,
      parameters: evaluation.chosen_action.parameters || {},
      priority: goal.priority,
    });
    expect(intention.status).toBe('pending');

    const dispatched = IntentionEngine.dispatchIntention(db, {
      project: 'e2e_project',
      id: intention.id,
    });
    expect(dispatched.status).toBe('dispatched');

    // 4. Resolve Intention
    const resolved = IntentionEngine.resolveIntention(db, {
      project: 'e2e_project',
      id: intention.id,
      status: 'completed',
      result: { damage_dealt: 450, kills: 2 },
    });

    expect(resolved.status).toBe('completed');
    expect(resolved.result?.kills).toBe(2);

    // 5. Update Goal to completed
    const completedGoal = GoalEngine.updateGoal(db, {
      project: 'e2e_project',
      id: goal.id,
      status: 'completed',
      progress: 1.0,
    });

    expect(completedGoal.status).toBe('completed');
    expect(completedGoal.progress).toBe(1.0);
  });
});
