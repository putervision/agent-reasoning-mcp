import { z } from 'zod';

export const SetGoalSchema = z.object({
  action: z.enum(['create', 'update', 'decompose', 'get', 'list', 'abandon']),
  id: z.string().optional(),
  parent_id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'completed', 'failed', 'abandoned', 'suspended']).optional(),
  priority: z.number().min(0).max(1).optional(),
  utility_weights: z.record(z.number()).optional(),
  deadline_at: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  success_criteria: z.array(z.string()).optional(),
  subgoals: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    priority: z.number().optional(),
  })).optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional(),
  limit: z.number().optional(),
});

export const EvaluateSituationSchema = z.object({
  action: z.enum(['snapshot', 'quick']),
  snapshot: z.object({
    session_id: z.string(),
    timestamp: z.string().optional(),
    world: z.any().optional(),
    vision: z.any().optional(),
    state: z.any().optional(),
    vitals: z.any().optional(),
  }).optional(),
  quick_context: z.string().optional(),
  candidate_actions: z.array(z.object({
    action: z.string(),
    parameters: z.record(z.any()).optional(),
    description: z.string().optional(),
  })).optional(),
  utility_profile: z.string().optional(),
  project: z.string().optional(),
});

export const ReplanSchema = z.object({
  action: z.enum(['blocker', 'event', 'full']),
  goal_id: z.string(),
  blocker_description: z.string().optional(),
  trigger_event: z.string().optional(),
  preserve_completed: z.boolean().optional(),
  project: z.string().optional(),
});

export const AssessRiskSchema = z.object({
  action: z.enum(['action', 'plan', 'compare']),
  candidate_action: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  candidate_actions: z.array(z.object({
    action: z.string(),
    parameters: z.record(z.any()).optional(),
  })).optional(),
  situation_context: z.any().optional(),
  project: z.string().optional(),
});

export const QueryKnowledgeSchema = z.object({
  action: z.enum(['search', 'patterns', 'similar_situations']),
  query: z.string().optional(),
  pattern_type: z.enum(['heuristic', 'anti_pattern', 'optimization', 'contingency']).optional(),
  context_tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  project: z.string().optional(),
});

export const SetUtilityWeightsSchema = z.object({
  action: z.enum(['configure', 'get', 'list', 'activate']),
  name: z.string().optional(),
  description: z.string().optional(),
  weights: z.record(z.number()).optional(),
  is_active: z.boolean().optional(),
  project: z.string().optional(),
});

export const GetDecisionTraceSchema = z.object({
  action: z.enum(['latest', 'get', 'list', 'explain']),
  trace_id: z.string().optional(),
  goal_id: z.string().optional(),
  limit: z.number().optional(),
  project: z.string().optional(),
});

export const ManageBeliefsSchema = z.object({
  action: z.enum(['update', 'query', 'expire', 'reconcile']),
  category: z.enum(['spatial', 'entity', 'state', 'rule', 'social']).optional(),
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.any().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['observation', 'deduction', 'agent_communication', 'a_priori']).optional(),
  expires_at: z.string().optional(),
  decay_rate: z.number().optional(),
  belief_id: z.string().optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional(),
});

export const ManageIntentionsSchema = z.object({
  action: z.enum(['create', 'dispatch', 'get', 'list', 'cancel', 'resolve']),
  intention_id: z.string().optional(),
  goal_id: z.string().optional(),
  trace_id: z.string().optional(),
  behavior_name: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  priority: z.number().optional(),
  deadline_at: z.string().optional(),
  abort_conditions: z.array(z.any()).optional(),
  result: z.record(z.any()).optional(),
  status: z.enum(['pending', 'dispatched', 'running', 'completed', 'failed', 'aborted', 'interrupted']).optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional(),
});

export const ManageReasoningDbSchema = z.object({
  action: z.enum(['backup', 'stats', 'audit', 'snapshot', 'diff', 'restore']),
  name: z.string().optional(),
  description: z.string().optional(),
  project: z.string().optional(),
});
