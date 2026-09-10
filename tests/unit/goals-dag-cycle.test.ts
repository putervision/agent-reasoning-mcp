import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GoalEngine } from '../../src/engine/goals.js';
import { ReplannerEngine } from '../../src/engine/replanner.js';
import { IntentionEngine } from '../../src/engine/intentions.js';
import { runMigrations } from '../../src/engine/migrations.js';

describe('Goal Hierarchy, Subgoal Decomposition & Replanning Suite', () => {
  let db: Database.Database;
  const project = 'goals-dag-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates parent goal and decomposes into ordered subgoals', () => {
    const parent = GoalEngine.createGoal(db, {
      project,
      title: 'Craft Legendary Armor',
      description: 'Collect materials, forge in volcano, and enchant',
      priority: 2,
    });

    expect(parent.id).toBeDefined();
    expect(parent.status).toBe('active');

    const decomposed = GoalEngine.decomposeGoal(db, {
      project,
      parent_id: parent.id,
      subgoals: [
        { title: 'Gather 50 Mythril Ore', priority: 3, description: 'Mine from mountain caves' },
        { title: 'Smelt Mythril Ingots', priority: 2, description: 'Heat in forge' },
        { title: 'Enchant with Fire Protection', priority: 1, description: 'Apply spell scroll' },
      ],
    });

    expect(decomposed.subgoals.length).toBe(3);
    expect(decomposed.subgoals[0].parent_id).toBe(parent.id);

    const retrievedChildren = GoalEngine.listGoals(db, { project, parent_id: parent.id });
    expect(retrievedChildren.length).toBe(3);
  });

  it('executes reactive replanning, aborts active intentions, and attaches recovery subgoals', () => {
    const mainGoal = GoalEngine.createGoal(db, {
      project,
      title: 'Infiltrate Goblin Camp',
      priority: 5,
    });

    // Spawn 2 intentions
    IntentionEngine.createIntention(db, {
      project,
      goal_id: mainGoal.id,
      behavior_name: 'stealth_approach',
    });
    IntentionEngine.createIntention(db, {
      project,
      goal_id: mainGoal.id,
      behavior_name: 'pick_lock',
    });

    // Replan upon obstacle
    const replanResult = ReplannerEngine.replanGoal(db, {
      project,
      goal_id: mainGoal.id,
      blocker_description: 'Reinforced iron door is alarm-trapped',
    });

    expect(replanResult.cancelled_intentions).toBe(2);
    expect(replanResult.new_subgoals.length).toBe(2);
    expect(replanResult.recommended_action).toContain('Reinforced iron door');

    // Verify intentions are aborted
    const intentions = IntentionEngine.listIntentions(db, { project, goal_id: mainGoal.id });
    expect(intentions.every((i) => i.status === 'aborted')).toBe(true);
  });

  it('updates goal progress and marks goal completed', () => {
    const goal = GoalEngine.createGoal(db, {
      project,
      title: 'Harvest Wheat',
      priority: 1,
    });

    const updated = GoalEngine.updateGoal(db, {
      project,
      id: goal.id,
      progress: 1.0,
      status: 'completed',
    });

    expect(updated.progress).toBe(1.0);
    expect(updated.status).toBe('completed');
  });
});
