import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GoalEngine } from '../../src/engine/goals.js';
import { UtilityProfileEngine } from '../../src/engine/personality.js';
import { EvaluatorEngine } from '../../src/engine/evaluator.js';
import { IntentionEngine } from '../../src/engine/intentions.js';
import { DecisionTraceEngine } from '../../src/engine/traces.js';
import { BeliefEngine } from '../../src/engine/beliefs.js';
import { StateBridge } from '../../src/engine/bridge/state-bridge.js';
import { VisionBridge } from '../../src/engine/bridge/vision-bridge.js';
import { WorldBridge } from '../../src/engine/bridge/world-bridge.js';
import { runMigrations } from '../../src/engine/migrations.js';
import { SituationSnapshot } from '../../src/schema/types.js';

describe('PuterVision MCP Pentad Super-Loop Cross-Package E2E Simulation', () => {
  let db: Database.Database;
  const project = 'pentad-superloop-e2e';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('executes full 7-step autonomous Super-Loop cycle across Pentad subsystems', () => {
    // =========================================================================
    // STEP 1: Strategic Planning & Utility Configuration (agent-reasoning-mcp)
    // =========================================================================
    const rootGoal = GoalEngine.createGoal(db, {
      project,
      title: 'Survey & Secure Resource Perimeter',
      description:
        'Autonomous exploration and resource extraction under dynamic hostile conditions',
      priority: 1,
    });
    expect(rootGoal.id).toBeDefined();

    const utilityProfile = UtilityProfileEngine.configureProfile(db, {
      project,
      name: 'balanced_autonomous',
      description: 'Balanced risk-reward profile for unattended super-loop runs',
      weights: {
        aggression: 0.4,
        caution: 0.7,
        greed: 0.6,
        efficiency: 0.85,
        exploration: 0.75,
        cooperation: 0.5,
      },
      is_active: true,
    });
    expect(utilityProfile.is_active).toBe(true);

    // =========================================================================
    // STEP 2: Workflow State Memory Simulation (state-memory-mcp)
    // =========================================================================
    const rawStateContext = {
      tasks: [
        { id: 'task_001', title: 'Scout Sector 7 Perimeter', status: 'in_progress', priority: 1 },
      ],
      blockers: [],
      decisions: [{ id: 'dec_001', recommendation: 'Avoid heavy combat armor to maintain speed' }],
    };
    const stateNormalized = StateBridge.normalizeStateData(rawStateContext);
    expect(stateNormalized.tasks.length).toBe(1);

    // =========================================================================
    // STEP 3: Perceptual Visual Memory Simulation (vision-memory-mcp)
    // =========================================================================
    const rawVisionContext = {
      current_state_id: 'vs_sector7_overview',
      description:
        'Sector 7 clearing: High-density gold vein detected. 1 patrolling scout droid on east ridge.',
      grounded_elements: [
        { selector: '#gold_vein', label: 'Gold Vein Node' },
        { selector: '#patrol_droid', label: 'Hostile Scout Droid' },
      ],
    };
    const visionNormalized = VisionBridge.normalizeVisionData(rawVisionContext);
    expect(visionNormalized.grounded_elements.length).toBe(2);

    // =========================================================================
    // STEP 4: Spatial World Model Simulation (world-model-mcp)
    // =========================================================================
    const rawWorldContext = {
      entities: [
        {
          id: 'ent_droid_01',
          type: 'hostile_scout',
          position: [15, 0, 20] as [number, number, number],
          status: 'hostile',
        },
        {
          id: 'ent_gold_vein',
          type: 'resource_deposit',
          position: [8, 0, 12] as [number, number, number],
          status: 'rich',
        },
      ],
      relations: [{ source: 'ent_droid_01', relation: 'patrolling_near', target: 'ent_gold_vein' }],
      observer_position: [0, 0, 0] as [number, number, number],
    };
    const worldNormalized = WorldBridge.normalizeWorldData(rawWorldContext);
    expect(worldNormalized.entities.length).toBe(2);

    // Ingest into agent beliefs
    BeliefEngine.updateBelief(db, {
      project,
      category: 'spatial',
      subject: 'ent_gold_vein',
      predicate: 'is_located_at',
      object: [8, 0, 12],
      confidence: 0.99,
    });

    // =========================================================================
    // STEP 5: Multi-Modal Snapshot Evaluation & Intention Dispatch (agent-reasoning-mcp)
    // =========================================================================
    const snapshot: SituationSnapshot = {
      session_id: 'superloop_session_01',
      vitals: { hp: 100, max_hp: 100, threat_level: 0.35 },
      state: stateNormalized,
      vision: visionNormalized,
      world: worldNormalized,
    };

    const evaluation = EvaluatorEngine.evaluateSituation(db, {
      project,
      snapshot,
      utility_profile: 'balanced_autonomous',
      candidate_actions: [
        {
          action: 'gather_resources',
          parameters: { target_node: 'gold_vein', stealth_mode: true },
        },
        { action: 'engage_threat', parameters: { target: 'ent_droid_01' } },
        { action: 'idle_patrol', parameters: { radius: 10 } },
      ],
    });

    expect(evaluation.chosen_action).toBeDefined();
    expect(evaluation.trace_id).toBeDefined();
    expect(evaluation.reasoning_chain.length).toBeGreaterThan(2);

    // Dispatch intention for the chosen action
    const intention = IntentionEngine.createIntention(db, {
      project,
      goal_id: rootGoal.id,
      trace_id: evaluation.trace_id,
      behavior_name: evaluation.chosen_action.action,
      parameters: evaluation.chosen_action.parameters,
      priority: 0.9,
    });
    expect(intention.status).toBe('pending');

    const dispatched = IntentionEngine.dispatchIntention(db, {
      project,
      id: intention.id,
    });
    expect(dispatched.status).toBe('dispatched');

    // =========================================================================
    // STEP 6: Behavior Tree Tactical Execution Simulation (behavior-mcp)
    // =========================================================================
    // Simulated behavior runtime step
    const simulatedRuntimeOutcome = {
      status: 'completed' as const,
      result: {
        gold_extracted: 150,
        stealth_maintained: true,
        threat_avoided: 'ent_droid_01',
      },
    };

    // =========================================================================
    // STEP 7: Outcome Recording & Closed-Loop Resolution
    // =========================================================================
    const resolvedIntention = IntentionEngine.resolveIntention(db, {
      project,
      id: intention.id,
      status: 'completed',
      result: simulatedRuntimeOutcome.result,
    });
    expect(resolvedIntention.status).toBe('completed');

    // Update goal progress
    const updatedGoal = GoalEngine.updateGoal(db, {
      project,
      id: rootGoal.id,
      progress: 0.5,
    });
    expect(updatedGoal.progress).toBe(0.5);

    // Verify decision trace can explain rationale
    const explanation = DecisionTraceEngine.explainTrace(db, {
      project,
      id: evaluation.trace_id,
    });
    expect(explanation).toContain(evaluation.chosen_action.action);
  });
});
