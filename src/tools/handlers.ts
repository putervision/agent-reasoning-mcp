import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolDefinitions, READ_ONLY_TOOLS } from './definitions.js';
import { getDb, getReadOnlyDb, getProjectSlug } from '../engine/db.js';
import { GoalEngine } from '../engine/goals.js';
import { BeliefEngine } from '../engine/beliefs.js';
import { UtilityProfileEngine } from '../engine/personality.js';
import { IntentionEngine } from '../engine/intentions.js';
import { DecisionTraceEngine } from '../engine/traces.js';
import { EvaluatorEngine } from '../engine/evaluator.js';
import { RiskEngine } from '../engine/risk.js';
import { ReplannerEngine } from '../engine/replanner.js';
import { KnowledgeEngine } from '../engine/knowledge.js';
import { SnapshotEngine } from '../engine/snapshots.js';
import { verifyEventChain } from '../engine/events.js';
import { SchemaAdvisor } from '../engine/advisor.js';
import { ValidationError } from '../utils/errors.js';

interface JsonSchemaProperty {
  type?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
}

export function jsonSchemaToZod(schema: JsonSchemaProperty | unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') return z.unknown();
  const s = schema as JsonSchemaProperty;

  if (s.type === 'string') {
    if (s.enum && Array.isArray(s.enum) && s.enum.length > 0) {
      return z.enum(s.enum as [string, ...string[]]);
    }
    return z.string();
  }
  if (s.type === 'number') return z.number();
  if (s.type === 'boolean') return z.boolean();
  if (s.type === 'array') {
    const itemSchema = s.items ? jsonSchemaToZod(s.items) : z.unknown();
    return z.array(itemSchema);
  }
  if (s.type === 'object' || s.properties) {
    const shape: Record<string, z.ZodTypeAny> = {};
    const requiredKeys = new Set(s.required || []);
    if (s.properties) {
      for (const [key, prop] of Object.entries(s.properties)) {
        let fieldSchema = jsonSchemaToZod(prop);
        if (!requiredKeys.has(key)) {
          fieldSchema = fieldSchema.optional();
        }
        shape[key] = fieldSchema;
      }
    }
    return z.object(shape).passthrough();
  }
  return z.unknown();
}

export function registerAllTools(server: McpServer): void {
  const toolNames = toolDefinitions.map((t) => t.name);

  for (const def of toolDefinitions) {
    const zodShape: Record<string, z.ZodTypeAny> = {};
    const schemaProps = (def.inputSchema.properties || {}) as Record<string, JsonSchemaProperty>;
    const requiredList = new Set((def.inputSchema.required as string[]) || []);

    for (const [key, prop] of Object.entries(schemaProps)) {
      let fieldSchema = jsonSchemaToZod(prop);
      if (!requiredList.has(key)) {
        fieldSchema = fieldSchema.optional();
      }
      zodShape[key] = fieldSchema;
    }

    server.tool(
      def.name,
      def.description,
      zodShape,
      async (args: any) => {
        try {
          const project = getProjectSlug(args.project);
          const isReadOnly = READ_ONLY_TOOLS.has(def.name);
          const db = isReadOnly ? getReadOnlyDb(project) : getDb(project);

          let result: any;

          switch (def.name) {
            case 'set_goal': {
              const action = args.action;
              if (action === 'create') {
                result = GoalEngine.createGoal(db, { project, ...args });
              } else if (action === 'update') {
                result = GoalEngine.updateGoal(db, { project, ...args });
              } else if (action === 'decompose') {
                result = GoalEngine.decomposeGoal(db, { project, parent_id: args.id || args.parent_id, subgoals: args.subgoals || [] });
              } else if (action === 'get') {
                result = GoalEngine.getGoal(db, { project, id: args.id });
              } else if (action === 'list') {
                result = GoalEngine.listGoals(db, { project, status: args.status, parent_id: args.parent_id, limit: args.limit });
              } else if (action === 'abandon') {
                result = GoalEngine.abandonGoal(db, { project, id: args.id, reason: args.description });
              } else {
                throw new ValidationError(`Unknown action "${action}" for set_goal.`);
              }
              break;
            }

            case 'evaluate_situation': {
              result = EvaluatorEngine.evaluateSituation(db, { project, ...args });
              break;
            }

            case 'replan': {
              result = ReplannerEngine.replanGoal(db, { project, ...args });
              break;
            }

            case 'assess_risk': {
              if (args.action === 'compare' && args.candidate_actions) {
                result = args.candidate_actions.map((c: any) => ({
                  action: c.action,
                  risk: RiskEngine.assessAction(c.action, c.parameters, args.situation_context),
                }));
              } else {
                result = RiskEngine.assessAction(args.candidate_action || 'default_action', args.parameters, args.situation_context);
              }
              break;
            }

            case 'query_knowledge': {
              result = KnowledgeEngine.queryKnowledge(db, { project, ...args });
              break;
            }

            case 'set_utility_weights': {
              const action = args.action;
              if (action === 'configure') {
                result = UtilityProfileEngine.configureProfile(db, { project, ...args });
              } else if (action === 'get') {
                result = args.name ? UtilityProfileEngine.getProfile(db, { project, name: args.name }) : UtilityProfileEngine.getActiveProfile(db, project);
              } else if (action === 'list') {
                result = UtilityProfileEngine.listProfiles(db, project);
              } else if (action === 'activate') {
                result = UtilityProfileEngine.activateProfile(db, { project, name: args.name });
              } else {
                throw new ValidationError(`Unknown action "${action}" for set_utility_weights.`);
              }
              break;
            }

            case 'get_decision_trace': {
              const action = args.action;
              if (action === 'latest') {
                result = DecisionTraceEngine.getLatestTrace(db, project) || { message: 'No decision traces found.' };
              } else if (action === 'get') {
                result = DecisionTraceEngine.getTrace(db, { project, id: args.trace_id });
              } else if (action === 'list') {
                result = DecisionTraceEngine.listTraces(db, { project, goal_id: args.goal_id, limit: args.limit });
              } else if (action === 'explain') {
                const explanation = DecisionTraceEngine.explainTrace(db, { project, id: args.trace_id });
                result = { explanation };
              } else {
                throw new ValidationError(`Unknown action "${action}" for get_decision_trace.`);
              }
              break;
            }

            case 'manage_beliefs': {
              const action = args.action;
              if (action === 'update') {
                result = BeliefEngine.updateBelief(db, { project, ...args });
              } else if (action === 'query') {
                result = BeliefEngine.queryBeliefs(db, { project, ...args });
              } else if (action === 'expire') {
                const expiredCount = BeliefEngine.expireBeliefs(db, project);
                result = { expired_beliefs: expiredCount };
              } else if (action === 'reconcile') {
                BeliefEngine.decayBeliefs(db, project);
                result = { message: 'Beliefs successfully reconciled and decayed.' };
              } else {
                throw new ValidationError(`Unknown action "${action}" for manage_beliefs.`);
              }
              break;
            }

            case 'manage_intentions': {
              const action = args.action;
              if (action === 'create') {
                result = IntentionEngine.createIntention(db, { project, ...args });
              } else if (action === 'dispatch') {
                result = IntentionEngine.dispatchIntention(db, { project, id: args.intention_id });
              } else if (action === 'get') {
                result = IntentionEngine.getIntention(db, { project, id: args.intention_id });
              } else if (action === 'list') {
                result = IntentionEngine.listIntentions(db, { project, status: args.status, goal_id: args.goal_id });
              } else if (action === 'cancel') {
                result = IntentionEngine.resolveIntention(db, { project, id: args.intention_id, status: 'aborted', result: args.result });
              } else if (action === 'resolve') {
                result = IntentionEngine.resolveIntention(db, { project, id: args.intention_id, status: args.status || 'completed', result: args.result });
              } else {
                throw new ValidationError(`Unknown action "${action}" for manage_intentions.`);
              }
              break;
            }

            case 'manage_reasoning_db': {
              const action = args.action;
              if (action === 'stats') {
                const goalsCount = (db.prepare('SELECT COUNT(*) as c FROM goals WHERE project = ?').get(project) as any).c;
                const beliefsCount = (db.prepare('SELECT COUNT(*) as c FROM beliefs WHERE project = ?').get(project) as any).c;
                const tracesCount = (db.prepare('SELECT COUNT(*) as c FROM decision_traces WHERE project = ?').get(project) as any).c;
                const intentionsCount = (db.prepare('SELECT COUNT(*) as c FROM intentions WHERE project = ?').get(project) as any).c;
                result = { goalsCount, beliefsCount, tracesCount, intentionsCount, project };
              } else if (action === 'audit') {
                result = verifyEventChain(db, project);
              } else if (action === 'snapshot') {
                result = SnapshotEngine.saveSnapshot(db, { project, name: args.name || `snap_${Date.now()}`, description: args.description });
              } else if (action === 'restore') {
                result = SnapshotEngine.restoreSnapshot(db, { project, name: args.name });
              } else if (action === 'diff') {
                result = SnapshotEngine.listSnapshots(db, { project });
              } else {
                result = { status: 'ok', project };
              }
              break;
            }

            default:
              throw new ValidationError(`Unrecognized tool "${def.name}".`);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error: any) {
          const advice = SchemaAdvisor.getAdvice(def.name, error.message, toolNames);
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: error.message,
                  code: error.code || 'EXECUTION_ERROR',
                  advice,
                }, null, 2),
              },
            ],
          };
        }
      }
    );
  }
}
