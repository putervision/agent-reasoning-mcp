export type GoalId = string & { readonly __brand: unique symbol };
export type BeliefId = string & { readonly __brand: unique symbol };
export type TraceId = string & { readonly __brand: unique symbol };
export type IntentionId = string & { readonly __brand: unique symbol };
export type ProfileId = string & { readonly __brand: unique symbol };
export type PatternId = string & { readonly __brand: unique symbol };
export type SnapshotId = string & { readonly __brand: unique symbol };
export type EventId = string & { readonly __brand: unique symbol };

export type GoalStatus = 'active' | 'completed' | 'failed' | 'abandoned' | 'suspended';
export type IntentionStatus =
  'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'aborted' | 'interrupted';
export type BeliefCategory = 'spatial' | 'entity' | 'state' | 'rule' | 'social';

export interface Goal {
  id: GoalId;
  project: string;
  session_id?: string;
  parent_id?: GoalId | null;
  title: string;
  description?: string;
  status: GoalStatus;
  priority: number; // 0.0 to 1.0
  utility_weights?: Record<string, number>;
  deadline_at?: string;
  progress?: number; // 0.0 to 1.0
  success_criteria?: string[];
  failure_reason?: string;
  metadata?: Record<string, unknown>;
  client_request_id?: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface Belief {
  id: BeliefId;
  project: string;
  session_id?: string;
  category: BeliefCategory;
  subject: string;
  predicate: string;
  object: unknown;
  confidence: number; // 0.0 to 1.0
  source: 'observation' | 'deduction' | 'agent_communication' | 'a_priori';
  source_id?: string;
  expires_at?: string;
  decay_rate: number;
  last_decayed_at?: string;
  client_request_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DecisionTrace {
  id: TraceId;
  project: string;
  session_id?: string;
  goal_id?: GoalId;
  situation_summary: string;
  candidate_actions: CandidateAction[];
  utility_profile: string;
  chosen_action: string;
  reasoning_chain: string[];
  risk_assessment?: RiskAssessmentResult;
  outcome?: string;
  latency_ms: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CandidateAction {
  action: string;
  parameters?: Record<string, unknown>;
  estimated_utility: number;
  utility_breakdown?: Record<string, number>;
  risk_score?: number;
  feasibility?: number;
}

export interface RiskAssessmentResult {
  threat_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  risk_score: number; // 0.0 to 1.0
  threats: string[];
  opportunities: string[];
  mitigations: string[];
}

export interface UtilityProfile {
  id: ProfileId;
  project: string;
  name: string;
  description?: string;
  weights: {
    aggression: number;
    caution: number;
    greed: number;
    efficiency: number;
    exploration: number;
    cooperation: number;
    [key: string]: number;
  };
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Intention {
  id: IntentionId;
  project: string;
  goal_id: GoalId;
  trace_id?: TraceId;
  session_id?: string;
  behavior_name: string;
  parameters: Record<string, unknown>;
  priority: number;
  status: IntentionStatus;
  deadline_at?: string;
  abort_conditions?: Array<{
    condition_type: string;
    condition_params: Record<string, unknown>;
  }>;
  result?: Record<string, unknown>;
  client_request_id?: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgePattern {
  id: PatternId;
  project: string;
  pattern_type: 'heuristic' | 'anti_pattern' | 'optimization' | 'contingency';
  context_tags: string[];
  situation_pattern: string;
  recommended_strategy: string;
  confidence: number;
  sample_count: number;
  success_rate: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReasoningEvent {
  id: EventId;
  project: string;
  entity_id: string;
  entity_type: 'goal' | 'belief' | 'trace' | 'profile' | 'intention' | 'knowledge';
  action: string;
  prev_hash: string;
  hash: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface SituationSnapshot {
  session_id: string;
  timestamp?: string;
  world?: {
    entities: Array<{
      id: string;
      type: string;
      position: [number, number, number];
      status: string;
    }>;
    relations?: Array<{ source: string; relation: string; target: string }>;
    observer_position?: [number, number, number];
  };
  vision?: {
    current_state_id?: string;
    description?: string;
    grounded_elements?: Array<{ selector: string; label: string }>;
  };
  state?: {
    tasks?: Array<{ id: string; title: string; status?: string; priority?: number }>;
    active_goals?: Array<{ id: string; title: string; priority: number }>;
    blockers?: Array<{ id: string; description: string }>;
    decisions?: Array<{ id: string; recommendation: string }>;
    recent_decisions?: Array<{ id: string; recommendation: string }>;
  };
  vitals?: {
    hp?: number;
    resources?: Record<string, number>;
    threat_level?: number;
    [key: string]: unknown;
  };
}
