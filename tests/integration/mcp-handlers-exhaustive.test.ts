import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { registerAllTools } from '../../src/tools/handlers.js';
import { runMigrations } from '../../src/engine/migrations.js';
import * as dbModule from '../../src/engine/db.js';

describe('agent-reasoning-mcp Exhaustive MCP Handlers Integration Suite', () => {
  let db: Database.Database;
  const project = 'reasoning-handlers-project';
  const toolMap = new Map<string, Function>();

  const mockServer = {
    tool: (name: string, desc: string, schema: any, handler: Function) => {
      toolMap.set(name, handler);
    },
  };

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    toolMap.clear();

    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);
    vi.spyOn(dbModule, 'getReadOnlyDb').mockReturnValue(db);
    vi.spyOn(dbModule, 'getProjectSlug').mockReturnValue(project);
    process.env.AGENT_REASONING_MCP_PROJECT = project;

    registerAllTools(mockServer as any);
  });

  afterEach(() => {
    delete process.env.AGENT_REASONING_MCP_PROJECT;
    vi.restoreAllMocks();
    db.close();
  });

  it('exercises full 10-tool reasoning pipeline: goal -> situation -> intention -> trace -> audit', async () => {
    // 1. set_goal: create & list
    const setGoal = toolMap.get('set_goal')!;
    const goalRes = await setGoal({
      action: 'create',
      title: 'Build Autonomous Base',
      description: 'Collect materials and construct defensive perimeter',
      priority: 2,
    });
    expect(goalRes.isError).toBeUndefined();
    const goalData = JSON.parse(goalRes.content[0].text);
    expect(goalData.title).toBe('Build Autonomous Base');
    expect(goalData._suggestions).toBeDefined();

    const goalId = goalData.id;

    // 2. set_utility_weights: configure & activate
    const setWeights = toolMap.get('set_utility_weights')!;
    await setWeights({
      action: 'configure',
      name: 'balanced_builder',
      weights: {
        aggression: 0.2,
        caution: 0.6,
        greed: 0.8,
        efficiency: 0.9,
        exploration: 0.5,
        cooperation: 0.7,
      },
      is_active: true,
    });

    const activeProfileRes = await setWeights({ action: 'get' });
    const profileData = JSON.parse(activeProfileRes.content[0].text);
    expect(profileData.name).toBe('balanced_builder');

    // 3. manage_beliefs: update & query
    const manageBeliefs = toolMap.get('manage_beliefs')!;
    await manageBeliefs({
      action: 'update',
      category: 'environment',
      subject: 'quarry',
      predicate: 'has_stone',
      object: true,
      confidence: 0.98,
    });

    const queryBeliefsRes = await manageBeliefs({
      action: 'query',
      category: 'environment',
    });
    const beliefsData = JSON.parse(queryBeliefsRes.content[0].text);
    expect(beliefsData.length).toBe(1);
    expect(beliefsData[0].subject).toBe('quarry');

    // 4. evaluate_situation
    const evalSituation = toolMap.get('evaluate_situation')!;
    const evalRes = await evalSituation({
      action: 'quick',
      quick_context: 'Abundant stone available, build foundation',
    });
    expect(evalRes.isError).toBeUndefined();
    const evalData = JSON.parse(evalRes.content[0].text);
    expect(evalData.chosen_action).toBeDefined();
    expect(evalData.trace_id).toBeDefined();

    const traceId = evalData.trace_id;

    // 5. get_decision_trace: get & explain
    const getTrace = toolMap.get('get_decision_trace')!;
    const traceRes = await getTrace({
      action: 'get',
      trace_id: traceId,
    });
    const traceData = JSON.parse(traceRes.content[0].text);
    expect(traceData.id).toBe(traceId);

    const explainRes = await getTrace({
      action: 'explain',
      trace_id: traceId,
    });
    const explainData = JSON.parse(explainRes.content[0].text);
    expect(explainData.explanation).toBeDefined();

    // 6. assess_risk
    const assessRisk = toolMap.get('assess_risk')!;
    const riskRes = await assessRisk({
      action: 'single',
      candidate_action: 'harvest_stone',
      parameters: { quarry_distance: 10 },
    });
    const riskData = JSON.parse(riskRes.content[0].text);
    expect(riskData.risk_score).toBeDefined();

    // 7. manage_intentions: create, dispatch, resolve
    const manageIntentions = toolMap.get('manage_intentions')!;
    const intentionRes = await manageIntentions({
      action: 'create',
      goal_id: goalId,
      trace_id: traceId,
      behavior_name: 'harvest_stone',
      priority: 0.9,
    });
    const intentionData = JSON.parse(intentionRes.content[0].text);
    expect(intentionData.id).toBeDefined();
    expect(intentionData.status).toBe('pending');

    const intentionId = intentionData.id;

    await manageIntentions({
      action: 'dispatch',
      intention_id: intentionId,
    });

    const getIntentionRes = await manageIntentions({
      action: 'get',
      intention_id: intentionId,
    });
    expect(JSON.parse(getIntentionRes.content[0].text).id).toBe(intentionId);

    const cancelRes = await manageIntentions({
      action: 'cancel',
      intention_id: intentionId,
    });
    expect(JSON.parse(cancelRes.content[0].text).status).toBe('aborted');

    const resolveRes = await manageIntentions({
      action: 'resolve',
      intention_id: intentionId,
      status: 'completed',
      result: { stone_collected: 500 },
    });
    const resolvedData = JSON.parse(resolveRes.content[0].text);
    expect(resolvedData.status).toBe('completed');

    // 8. replan upon obstacle
    const replan = toolMap.get('replan')!;
    const replanRes = await replan({
      action: 'blocker',
      goal_id: goalId,
      blocker_description: 'Bandit ambush at quarry',
    });
    const replanData = JSON.parse(replanRes.content[0].text);
    expect(replanData.new_subgoals.length).toBeGreaterThan(0);

    // 9. query_knowledge
    const queryKnowledge = toolMap.get('query_knowledge')!;
    const knowledgeRes = await queryKnowledge({
      category: 'tactics',
    });
    expect(knowledgeRes.isError).toBeUndefined();

    // 10. manage_reasoning_db: stats, audit, snapshot
    const manageDb = toolMap.get('manage_reasoning_db')!;
    const statsRes = await manageDb({ action: 'stats' });
    const statsData = JSON.parse(statsRes.content[0].text);
    expect(statsData.goalsCount).toBeGreaterThan(0);

    const auditRes = await manageDb({ action: 'audit' });
    const auditData = JSON.parse(auditRes.content[0].text);
    expect(auditData.valid).toBe(true);

    const snapRes = await manageDb({
      action: 'snapshot',
      name: 'post_pipeline_snapshot',
    });
    const snapData = JSON.parse(snapRes.content[0].text);
    expect(snapData.snapshot_id).toBeDefined();

    const docRes = await manageDb({ action: 'doctor' });
    expect(JSON.parse(docRes.content[0].text).status).toBe('healthy');

    const diffRes = await manageDb({ action: 'diff' });
    expect(JSON.parse(diffRes.content[0].text)).toBeDefined();

    const restoreRes = await manageDb({ action: 'restore', name: 'post_pipeline_snapshot' });
    expect(JSON.parse(restoreRes.content[0].text).restored_goals).toBeDefined();

    // 11. classify
    const classify = toolMap.get('classify')!;
    const classifyRes = await classify({
      target_type: 'entity',
      target_id: 'ent_01',
      classes: ['threat', 'neutral'],
    });
    expect(classifyRes.isError).toBeUndefined();

    // 12. ask_noul
    const askNoul = toolMap.get('ask_noul')!;
    const noulRes = await askNoul({
      statement: 'Area is secure',
    });
    expect(noulRes.isError).toBeUndefined();

    // 13. ask_choice
    const askChoice = toolMap.get('ask_choice')!;
    const choiceRes = await askChoice({
      question: 'Which path?',
      options: [
        { id: 'p1', text: 'North' },
        { id: 'p2', text: 'South' },
      ],
    });
    expect(choiceRes.isError).toBeUndefined();

    // 14. ask_score
    const askScore = toolMap.get('ask_score')!;
    const scoreRes = await askScore({
      metric: 'threat_level',
    });
    expect(scoreRes.isError).toBeUndefined();

    // 15. gate_intention
    const gateIntention = toolMap.get('gate_intention')!;
    const gateRes = await gateIntention({
      intention_id: intentionId,
      proposed_action: { behavior_name: 'scout_area' },
    });
    expect(gateRes.isError).toBeUndefined();
  });
});
