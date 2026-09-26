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
  entity_type: 'goal' | 'belief' | 'trace' | 'profile' | 'intention' | 'knowledge' | 'decision';
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

// ═══════════════════════════════════════════════════════════════════════════
// PuterVision System One Normative Contracts (§3)
// ═══════════════════════════════════════════════════════════════════════════

export type DecisionReason =
  | 'RULE_HEURISTIC_MATCH'
  | 'HIGH_THREAT_DETECTED'
  | 'CRITICAL_VITALS_HP'
  | 'ACTIVE_BLOCKER_PRESENT'
  | 'GOAL_AFFINITY_MAX'
  | 'RISK_SCORE_EXCEEDED'
  | 'OUT_OF_SCOPE'
  | 'DESTRUCTIVE_ACTION_DETECTED'
  | 'MISSING_REQUIRED_PARAMS'
  | 'POLICY_VIOLATION'
  | 'VECTOR_SIMILARITY_MATCH'
  | 'MODEL_INFERENCE'
  | 'INSUFFICIENT_FEATURES_ABSTAIN'
  | 'UTILITY_MARGIN_EXCEEDED'
  | 'BELIEF_DECAY_TRIGGER'
  | 'SPATIAL_PROXIMITY_MATCH'
  | 'VISUAL_LAYOUT_MATCH'
  | 'COOLDOWN_ACTIVE';

export interface VisualSlice {
  state_id: string; // Ptr to vision-memory visual_state
  layout_hash: string; // Perceptual SHA-256
  description_summary: string; // Max 120 chars
  interactive_element_count: number;
  embedding_ref_ids?: string[]; // Lightweight centroid IDs (<1KB slice budget)
  embedding_centroids?: number[][]; // Optional raw 512-dim vectors (if provided inline)
}

export interface SpatialSlice {
  observer_position: [number, number, number];
  nearby_entities: Array<{
    id: string;
    type: string;
    distance: number; // Euclidean distance in meters
    status: string; // e.g. "hostile", "neutral", "locked"
  }>; // Max 16 closest entities
}

export interface TaskSlice {
  active_goal?: {
    id: string;
    title: string;
    priority: number; // 0.0 - 1.0
    progress: number; // 0.0 - 1.0
  };
  active_blockers: Array<{
    id: string;
    description: string;
  }>;
  recent_decision_ids: string[]; // Pointers to last 3 state-memory decision nodes
}

export interface VitalsSlice {
  hp?: number;
  threat_level?: number; // 0.0 - 1.0
  resources?: Record<string, number>;
}

export interface UtilitySlice {
  profile_name: string;
  weights: Record<string, number>;
}

export interface StatePack {
  pack_id: string; // UUID v4
  pack_hash: string; // SHA-256 of canonical, key-sorted JSON
  timestamp: string; // ISO-8601
  project: string;
  session_id: string;

  visual?: VisualSlice;
  spatial?: SpatialSlice;
  tasks?: TaskSlice;
  vitals?: VitalsSlice;
  utility?: UtilitySlice;
}

export interface DispatchToken {
  token_id: string; // Unique token UUID
  intention_id: string; // Bound intention ID
  behavior_name: string; // Bound behavior tree name
  params_hash: string; // SHA-256 of canonical intention parameters
  aud: 'behavior-mcp'; // Audience — only behavior-mcp may consume this token
  issued_at: string; // ISO-8601
  expires_at: string; // ISO-8601
  hmac_signature: string; // HMAC-SHA256 signature
}

export interface ClassifyResponse {
  target_id: string;
  predicted_class: string;
  confidence: number; // 0.0 to 1.0
  significance?: number; // Derived: equals confidence
  class_probabilities: Record<string, number>;
  calibrated: boolean; // false until empirical calibration verified
  reasons: DecisionReason[];
  tier: 'L1' | 'L2' | 'L3' | 'L4' | 'cache';
  latency_ms: number;
  pack_hash: string;
  event_hash: string;
}

export interface AskNoulResponse {
  is_true: boolean;
  probability: number; // p in [0.0, 1.0]
  confidence: number; // Confidence in estimate
  significance?: number; // Derived: equals confidence
  calibrated: boolean;
  reasons: DecisionReason[];
  escalate_to_system_two: boolean; // Set if L1 abstains or uncertainty is high [0.4, 0.6]
  tier: 'L1' | 'L2' | 'L3' | 'L4' | 'cache';
  latency_ms: number;
  pack_hash: string;
  event_hash: string;
}

export interface AskChoiceResponse {
  selected_id: string;
  probability: number;
  confidence: number;
  significance?: number; // Derived: equals confidence
  distribution: Record<string, number>; // Sums to 1.0
  margin_over_second: number;
  calibrated: boolean;
  reasons: DecisionReason[];
  tier: 'L1' | 'L2' | 'L3' | 'L4' | 'cache';
  latency_ms: number;
  pack_hash: string;
  event_hash: string;
}

export interface AskScoreResponse {
  score: number; // In requested scale
  normalized_score: number; // Mapped to [0.0, 1.0]
  confidence: number;
  significance?: number; // Derived: equals confidence
  calibrated: boolean;
  reasons: DecisionReason[];
  tier: 'L1' | 'L2' | 'L3' | 'L4' | 'cache';
  latency_ms: number;
  pack_hash: string;
  event_hash: string;
}

export interface GateIntentionResponse {
  allowed: boolean;
  verdict: 'approved' | 'rejected' | 'quarantined' | 'needs_human_approval';
  blast_radius: 'none' | 'low' | 'medium' | 'high' | 'critical';
  risk_score: number; // 0.0 to 1.0 from RiskEngine
  significance: 1.0; // Gate decisions are always significant
  in_scope: boolean; // Validated against context_goal_id
  policy_violations: string[];
  reasons: DecisionReason[];
  dispatch_token?: DispatchToken; // Cryptographic token required by behavior-mcp
  tier: 'L1' | 'L2' | 'L3' | 'L4' | 'cache';
  latency_ms: number;
  event_hash: string;
}
