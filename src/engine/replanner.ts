import Database from 'better-sqlite3';
import { GoalEngine } from './goals.js';
import { IntentionEngine } from './intentions.js';
import { Goal } from '../schema/types.js';
import { NotFoundError } from '../utils/errors.js';

export class ReplannerEngine {
  static replanGoal(
    db: Database.Database,
    params: {
      project: string;
      goal_id: string;
      blocker_description?: string;
      trigger_event?: string;
      preserve_completed?: boolean;
    }
  ): {
    original_goal: Goal;
    new_subgoals: Goal[];
    cancelled_intentions: number;
    recommended_action: string;
  } {
    const goal = GoalEngine.getGoal(db, { project: params.project, id: params.goal_id });

    // Cancel pending/dispatched intentions linked to this goal
    const intentions = IntentionEngine.listIntentions(db, { project: params.project, goal_id: goal.id });
    let cancelledCount = 0;
    for (const item of intentions) {
      if (item.status === 'pending' || item.status === 'dispatched') {
        IntentionEngine.resolveIntention(db, {
          project: params.project,
          id: item.id,
          status: 'aborted',
          result: { reason: `Replanning triggered: ${params.blocker_description || 'Reactive event'}` },
        });
        cancelledCount++;
      }
    }

    // Generate fallback sub-goals
    const fallbackSubgoals = [
      { title: `Resolve blocker: ${params.blocker_description || 'Investigate obstacle'}`, priority: goal.priority + 0.1 },
      { title: `Resume main objective: ${goal.title}`, priority: goal.priority },
    ];

    const decomposed = GoalEngine.decomposeGoal(db, {
      project: params.project,
      parent_id: goal.id,
      subgoals: fallbackSubgoals,
    });

    return {
      original_goal: goal,
      new_subgoals: decomposed.subgoals,
      cancelled_intentions: cancelledCount,
      recommended_action: fallbackSubgoals[0].title,
    };
  }
}
