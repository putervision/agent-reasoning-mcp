import {
  DecisionTraceEngine,
  EvaluatorEngine,
  KnowledgeEngine,
  ReplannerEngine,
  RiskEngine,
  SnapshotEngine,
  UtilityEngine,
  UtilityProfileEngine,
  server
} from "./chunk-VKYDKRCK.js";
import {
  BeliefEngine,
  ConflictError,
  DatabaseError,
  GoalEngine,
  IntentionEngine,
  LOG_LEVELS,
  NotFoundError,
  ReasoningError,
  ValidationError,
  closeAllDbs,
  closeDb,
  computeEventHash,
  generateId,
  getBaseDir,
  getCurrentIsoString,
  getDb,
  getDbPath,
  getElapsedTimeMs,
  getLogLevel,
  getProjectDbDir,
  getProjectSlug,
  getReadOnlyDb,
  getRegistry,
  getRegistryPath,
  logReasoningEvent,
  logger,
  parseIsoString,
  registerProject,
  resolveProjectRoot,
  sanitizeSlug,
  unregisterProject,
  validatePath,
  verifyEventChain
} from "./chunk-FB4TIUGM.js";

// src/schema/schemas.ts
import { z } from "zod";
var SetGoalSchema = z.object({
  action: z.enum(["create", "update", "decompose", "get", "list", "abandon"]),
  id: z.string().optional(),
  parent_id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "completed", "failed", "abandoned", "suspended"]).optional(),
  priority: z.number().min(0).max(1).optional(),
  utility_weights: z.record(z.number()).optional(),
  deadline_at: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  success_criteria: z.array(z.string()).optional(),
  subgoals: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    priority: z.number().optional()
  })).optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional(),
  limit: z.number().optional()
});
var EvaluateSituationSchema = z.object({
  action: z.enum(["snapshot", "quick"]),
  snapshot: z.object({
    session_id: z.string(),
    timestamp: z.string().optional(),
    world: z.any().optional(),
    vision: z.any().optional(),
    state: z.any().optional(),
    vitals: z.any().optional()
  }).optional(),
  quick_context: z.string().optional(),
  candidate_actions: z.array(z.object({
    action: z.string(),
    parameters: z.record(z.any()).optional(),
    description: z.string().optional()
  })).optional(),
  utility_profile: z.string().optional(),
  project: z.string().optional()
});
var ReplanSchema = z.object({
  action: z.enum(["blocker", "event", "full"]),
  goal_id: z.string(),
  blocker_description: z.string().optional(),
  trigger_event: z.string().optional(),
  preserve_completed: z.boolean().optional(),
  project: z.string().optional()
});
var AssessRiskSchema = z.object({
  action: z.enum(["action", "plan", "compare"]),
  candidate_action: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  candidate_actions: z.array(z.object({
    action: z.string(),
    parameters: z.record(z.any()).optional()
  })).optional(),
  situation_context: z.any().optional(),
  project: z.string().optional()
});
var QueryKnowledgeSchema = z.object({
  action: z.enum(["search", "patterns", "similar_situations"]),
  query: z.string().optional(),
  pattern_type: z.enum(["heuristic", "anti_pattern", "optimization", "contingency"]).optional(),
  context_tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  project: z.string().optional()
});
var SetUtilityWeightsSchema = z.object({
  action: z.enum(["configure", "get", "list", "activate"]),
  name: z.string().optional(),
  description: z.string().optional(),
  weights: z.record(z.number()).optional(),
  is_active: z.boolean().optional(),
  project: z.string().optional()
});
var GetDecisionTraceSchema = z.object({
  action: z.enum(["latest", "get", "list", "explain"]),
  trace_id: z.string().optional(),
  goal_id: z.string().optional(),
  limit: z.number().optional(),
  project: z.string().optional()
});
var ManageBeliefsSchema = z.object({
  action: z.enum(["update", "query", "expire", "reconcile"]),
  category: z.enum(["spatial", "entity", "state", "rule", "social"]).optional(),
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.any().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["observation", "deduction", "agent_communication", "a_priori"]).optional(),
  expires_at: z.string().optional(),
  decay_rate: z.number().optional(),
  belief_id: z.string().optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional()
});
var ManageIntentionsSchema = z.object({
  action: z.enum(["create", "dispatch", "get", "list", "cancel", "resolve"]),
  intention_id: z.string().optional(),
  goal_id: z.string().optional(),
  trace_id: z.string().optional(),
  behavior_name: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  priority: z.number().optional(),
  deadline_at: z.string().optional(),
  abort_conditions: z.array(z.any()).optional(),
  result: z.record(z.any()).optional(),
  status: z.enum(["pending", "dispatched", "running", "completed", "failed", "aborted", "interrupted"]).optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional()
});
var ManageReasoningDbSchema = z.object({
  action: z.enum(["backup", "stats", "audit", "snapshot", "diff", "restore"]),
  name: z.string().optional(),
  description: z.string().optional(),
  project: z.string().optional()
});

// src/engine/bridge/state-bridge.ts
var StateBridge = class {
  static normalizeStateData(rawStateData) {
    if (!rawStateData || typeof rawStateData !== "object") {
      return { tasks: [], blockers: [], decisions: [] };
    }
    return {
      tasks: Array.isArray(rawStateData.tasks) ? rawStateData.tasks : [],
      blockers: Array.isArray(rawStateData.blockers) ? rawStateData.blockers : [],
      decisions: Array.isArray(rawStateData.decisions) ? rawStateData.decisions : []
    };
  }
};

// src/engine/bridge/world-bridge.ts
var WorldBridge = class {
  static normalizeWorldData(rawWorldData) {
    if (!rawWorldData || typeof rawWorldData !== "object") {
      return { entities: [], relations: [] };
    }
    return {
      entities: Array.isArray(rawWorldData.entities) ? rawWorldData.entities : [],
      relations: Array.isArray(rawWorldData.relations) ? rawWorldData.relations : [],
      observer_position: rawWorldData.observer_position
    };
  }
};

// src/engine/bridge/vision-bridge.ts
var VisionBridge = class {
  static normalizeVisionData(rawVisionData) {
    if (!rawVisionData || typeof rawVisionData !== "object") {
      return { grounded_elements: [] };
    }
    return {
      current_state_id: rawVisionData.current_state_id,
      description: rawVisionData.description,
      grounded_elements: Array.isArray(rawVisionData.grounded_elements) ? rawVisionData.grounded_elements : []
    };
  }
};
export {
  AssessRiskSchema,
  BeliefEngine,
  ConflictError,
  DatabaseError,
  DecisionTraceEngine,
  EvaluateSituationSchema,
  EvaluatorEngine,
  GetDecisionTraceSchema,
  GoalEngine,
  IntentionEngine,
  KnowledgeEngine,
  LOG_LEVELS,
  ManageBeliefsSchema,
  ManageIntentionsSchema,
  ManageReasoningDbSchema,
  NotFoundError,
  QueryKnowledgeSchema,
  ReasoningError,
  ReplanSchema,
  ReplannerEngine,
  RiskEngine,
  SetGoalSchema,
  SetUtilityWeightsSchema,
  SnapshotEngine,
  StateBridge,
  UtilityEngine,
  UtilityProfileEngine,
  ValidationError,
  VisionBridge,
  WorldBridge,
  closeAllDbs,
  closeDb,
  computeEventHash,
  generateId,
  getBaseDir,
  getCurrentIsoString,
  getDb,
  getDbPath,
  getElapsedTimeMs,
  getLogLevel,
  getProjectDbDir,
  getProjectSlug,
  getReadOnlyDb,
  getRegistry,
  getRegistryPath,
  logReasoningEvent,
  logger,
  parseIsoString,
  registerProject,
  resolveProjectRoot,
  sanitizeSlug,
  server,
  unregisterProject,
  validatePath,
  verifyEventChain
};
//# sourceMappingURL=lib.js.map