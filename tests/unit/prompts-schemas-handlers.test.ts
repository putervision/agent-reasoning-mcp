import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { registerAllTools, jsonSchemaToZod } from '../../src/tools/handlers.js';
import { runMigrations } from '../../src/engine/migrations.js';
import * as dbModule from '../../src/engine/db.js';
import { registerAllPrompts } from '../../src/tools/prompts.js';
import { UtilityEngine } from '../../src/engine/utility.js';
import {
  SetGoalSchema,
  EvaluateSituationSchema,
  ReplanSchema,
  AssessRiskSchema,
  QueryKnowledgeSchema,
  SetUtilityWeightsSchema,
  GetDecisionTraceSchema,
  ManageBeliefsSchema,
  ManageIntentionsSchema,
  ManageReasoningDbSchema,
} from '../../src/schema/schemas.js';

describe('agent-reasoning-mcp Handlers & Prompts & Schemas Suite', () => {
  let db: Database.Database;
  const project = 'handlers-test-project';
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

    registerAllTools(mockServer as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe('UtilityEngine Unit Scoring', () => {
    it('should score and rank candidate actions against utility weights', () => {
      const profile = {
        id: 'p1' as any,
        project,
        name: 'tactical',
        weights: {
          aggression: 0.8,
          caution: 0.2,
          greed: 0.5,
          efficiency: 0.5,
          exploration: 0.5,
          cooperation: 0.5,
        },
        is_active: true,
        created_at: '',
        updated_at: '',
      };

      const ranked = UtilityEngine.rankCandidates(
        [
          { action: 'attack', attributes: { aggression: 0.9, caution: 0.1 } },
          { action: 'defend', attributes: { aggression: 0.1, caution: 0.9 } },
        ],
        profile
      );

      expect(ranked[0].action).toBe('attack');
      expect(ranked[0].estimated_utility).toBeGreaterThan(ranked[1].estimated_utility);
    });
  });

  describe('Zod Schema Converter & Tool Schema Tests', () => {
    it('should convert JSON schemas to Zod correctly', () => {
      expect(jsonSchemaToZod(null)).toBeDefined();
      expect(jsonSchemaToZod('string')).toBeDefined();
      expect(jsonSchemaToZod({ type: 'number' })).toBeDefined();
      expect(jsonSchemaToZod({ type: 'boolean' })).toBeDefined();
      expect(jsonSchemaToZod({ type: 'array', items: { type: 'string' } })).toBeDefined();
      expect(
        jsonSchemaToZod({ type: 'object', properties: { p: { type: 'string' } }, required: ['p'] })
      ).toBeDefined();
    });

    it('should validate all 10 Zod schemas', () => {
      expect(SetGoalSchema.safeParse({ action: 'list' }).success).toBe(true);
      expect(
        EvaluateSituationSchema.safeParse({ action: 'quick', quick_context: 'threat detected' })
          .success
      ).toBe(true);
      expect(ReplanSchema.safeParse({ action: 'blocker', goal_id: 'g1' }).success).toBe(true);
      expect(
        AssessRiskSchema.safeParse({ action: 'action', candidate_action: 'strike' }).success
      ).toBe(true);
      expect(QueryKnowledgeSchema.safeParse({ action: 'search', query: 'tactics' }).success).toBe(
        true
      );
      expect(SetUtilityWeightsSchema.safeParse({ action: 'get' }).success).toBe(true);
      expect(GetDecisionTraceSchema.safeParse({ action: 'list' }).success).toBe(true);
      expect(ManageBeliefsSchema.safeParse({ action: 'query' }).success).toBe(true);
      expect(ManageIntentionsSchema.safeParse({ action: 'list' }).success).toBe(true);
      expect(ManageReasoningDbSchema.safeParse({ action: 'stats' }).success).toBe(true);
    });
  });

  describe('MCP Handlers Complete Lifecycle', () => {
    it('should handle set_goal create, get, decompose, update, abandon, and list', async () => {
      const setGoal = toolMap.get('set_goal')!;

      // 1. Create
      const created = await setGoal({
        action: 'create',
        title: 'Master Strategic Mission',
        priority: 0.9,
      });
      const goalData = JSON.parse(created.content[0].text);
      expect(goalData.id).toBeDefined();

      // 2. Decompose
      const decomposed = await setGoal({
        action: 'decompose',
        parent_id: goalData.id,
        subgoals: [
          { title: 'Sub-task Alpha', priority: 0.8 },
          { title: 'Sub-task Beta', priority: 0.7 },
        ],
      });
      expect(decomposed.content[0].text).toContain('Sub-task Alpha');

      // 3. Get
      const fetched = await setGoal({
        action: 'get',
        id: goalData.id,
      });
      expect(fetched.content[0].text).toContain('Master Strategic Mission');

      // 4. Update
      const updated = await setGoal({
        action: 'update',
        id: goalData.id,
        progress: 0.5,
      });
      expect(updated.content[0].text).toContain('0.5');

      // 5. Abandon
      const abandoned = await setGoal({
        action: 'abandon',
        id: goalData.id,
      });
      expect(abandoned.content[0].text).toContain('abandoned');

      // 6. List
      const list = await setGoal({ action: 'list' });
      expect(list.content[0].text).toContain('Master Strategic Mission');
    });

    it('should handle replan goal actions', async () => {
      const setGoal = toolMap.get('set_goal')!;
      const replanTool = toolMap.get('replan')!;

      const goal = await setGoal({
        action: 'create',
        title: 'Mission to Replan',
        priority: 0.8,
      });
      const goalId = JSON.parse(goal.content[0].text).id;

      const replanBlocker = await replanTool({
        action: 'blocker',
        goal_id: goalId,
        blocker_description: 'Path blocked by rockslide',
      });
      expect(replanBlocker.content[0].text).toContain('new_subgoals');

      const replanEvent = await replanTool({
        action: 'event',
        goal_id: goalId,
        trigger_event: 'Storm incoming',
      });
      expect(replanEvent.content[0].text).toContain('new_subgoals');

      const replanFull = await replanTool({
        action: 'full',
        goal_id: goalId,
      });
      expect(replanFull.content[0].text).toContain('new_subgoals');
    });

    it('should handle beliefs update, query, expire, and reconcile', async () => {
      const beliefTool = toolMap.get('manage_beliefs')!;

      const updateRes = await beliefTool({
        action: 'update',
        category: 'spatial',
        subject: 'bridge_east',
        predicate: 'is_collapsed',
        object: { status: 'collapsed' },
        confidence: 0.9,
      });
      expect(updateRes.content[0].text).toContain('bridge_east');

      const queryRes = await beliefTool({
        action: 'query',
        category: 'spatial',
      });
      expect(queryRes.content[0].text).toContain('bridge_east');

      const expireRes = await beliefTool({
        action: 'expire',
      });
      expect(expireRes.content[0].text).toContain('expired_beliefs');

      const reconcileRes = await beliefTool({
        action: 'reconcile',
      });
      expect(reconcileRes.content[0].text).toContain('reconciled');
    });

    it('should handle intentions create, list, resolve, and cancel', async () => {
      const setGoal = toolMap.get('set_goal')!;
      const intentionTool = toolMap.get('manage_intentions')!;

      const goalRes = await setGoal({
        action: 'create',
        title: 'Intent Goal Target',
        priority: 0.8,
      });
      const goalId = JSON.parse(goalRes.content[0].text).id;

      const createRes = await intentionTool({
        action: 'create',
        goal_id: goalId,
        behavior_name: 'patrol_route',
        priority: 0.8,
      });
      const intentId = JSON.parse(createRes.content[0].text).id;
      expect(intentId).toBeDefined();

      const listRes = await intentionTool({ action: 'list' });
      expect(listRes.content[0].text).toContain('patrol_route');

      const resolveRes = await intentionTool({
        action: 'resolve',
        intention_id: intentId,
        status: 'completed',
      });
      expect(resolveRes.content[0].text).toContain('completed');

      const create2 = await intentionTool({
        action: 'create',
        goal_id: goalId,
        behavior_name: 'cancel_me',
      });
      const intentId2 = JSON.parse(create2.content[0].text).id;

      const cancelRes = await intentionTool({
        action: 'cancel',
        intention_id: intentId2,
      });
      expect(cancelRes.content[0].text).toContain('aborted');
    });

    it('should handle decision traces latest, get, list, and explain', async () => {
      const evalTool = toolMap.get('evaluate_situation')!;
      const traceTool = toolMap.get('get_decision_trace')!;

      const evalRes = await evalTool({
        action: 'quick',
        quick_context: 'Ambush detected',
        candidate_actions: [{ action: 'deploy_smoke' }],
      });
      const traceId = JSON.parse(evalRes.content[0].text).trace_id;

      const getRes = await traceTool({
        action: 'get',
        trace_id: traceId,
      });
      expect(getRes.content[0].text).toContain('deploy_smoke');

      const listRes = await traceTool({ action: 'list' });
      expect(listRes.content[0].text).toContain('deploy_smoke');

      const latestRes = await traceTool({ action: 'latest' });
      expect(latestRes.content[0].text).toContain('deploy_smoke');

      const explainRes = await traceTool({
        action: 'explain',
        trace_id: traceId,
      });
      expect(explainRes.content[0].text).toContain('deploy_smoke');
    });

    it('should handle manage_reasoning_db snapshot, diff, restore', async () => {
      const dbTool = toolMap.get('manage_reasoning_db')!;

      const snapRes = await dbTool({
        action: 'snapshot',
        name: 'test_snap',
      });
      expect(snapRes.content[0].text).toContain('test_snap');

      const diffRes = await dbTool({ action: 'diff' });
      expect(diffRes.content[0].text).toContain('test_snap');

      const restoreRes = await dbTool({
        action: 'restore',
        name: 'test_snap',
      });
      expect(restoreRes.content[0].text).toContain('restored');
    });
  });

  describe('Prompt Callbacks Invocations', async () => {
    it('should invoke prompt callbacks directly', async () => {
      const promptMap = new Map<string, Function>();
      const mockPromptServer = {
        prompt: (name: string, desc: string, schema: any, handler: Function) => {
          promptMap.set(name, handler);
        },
      };

      registerAllPrompts(mockPromptServer as any);
      expect(promptMap.size).toBeGreaterThan(0);

      for (const [, handler] of promptMap.entries()) {
        const res = await handler({
          project,
          focus_area: 'combat',
          objective: 'Defeat dragon',
          priority: '0.9',
          proposed_action: 'cast blizzard',
          threat_context: 'high altitude',
          trace_id: 't_01',
        });
        expect(res.messages[0].content.text.length).toBeGreaterThan(0);
      }
    });
  });
});
