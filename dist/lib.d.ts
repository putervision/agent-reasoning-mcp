import { z } from 'zod';
import Database from 'better-sqlite3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type GoalId = string & {
    readonly __brand: unique symbol;
};
type BeliefId = string & {
    readonly __brand: unique symbol;
};
type TraceId = string & {
    readonly __brand: unique symbol;
};
type IntentionId = string & {
    readonly __brand: unique symbol;
};
type ProfileId = string & {
    readonly __brand: unique symbol;
};
type PatternId = string & {
    readonly __brand: unique symbol;
};
type SnapshotId = string & {
    readonly __brand: unique symbol;
};
type EventId = string & {
    readonly __brand: unique symbol;
};
type GoalStatus = 'active' | 'completed' | 'failed' | 'abandoned' | 'suspended';
type IntentionStatus = 'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'aborted' | 'interrupted';
type BeliefCategory = 'spatial' | 'entity' | 'state' | 'rule' | 'social';
interface Goal {
    id: GoalId;
    project: string;
    session_id?: string;
    parent_id?: GoalId | null;
    title: string;
    description?: string;
    status: GoalStatus;
    priority: number;
    utility_weights?: Record<string, number>;
    deadline_at?: string;
    progress?: number;
    success_criteria?: string[];
    failure_reason?: string;
    metadata?: Record<string, unknown>;
    client_request_id?: string;
    created_at: string;
    updated_at: string;
    version: number;
}
interface Belief {
    id: BeliefId;
    project: string;
    session_id?: string;
    category: BeliefCategory;
    subject: string;
    predicate: string;
    object: unknown;
    confidence: number;
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
interface DecisionTrace {
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
interface CandidateAction {
    action: string;
    parameters?: Record<string, unknown>;
    estimated_utility: number;
    utility_breakdown?: Record<string, number>;
    risk_score?: number;
    feasibility?: number;
}
interface RiskAssessmentResult {
    threat_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
    risk_score: number;
    threats: string[];
    opportunities: string[];
    mitigations: string[];
}
interface UtilityProfile {
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
interface Intention {
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
interface KnowledgePattern {
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
interface ReasoningEvent {
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
interface SituationSnapshot {
    session_id: string;
    timestamp: string;
    world?: {
        entities: Array<{
            id: string;
            type: string;
            position: [number, number, number];
            status: string;
        }>;
        relations?: Array<{
            source: string;
            relation: string;
            target: string;
        }>;
        observer_position?: [number, number, number];
    };
    vision?: {
        current_state_id?: string;
        description?: string;
        grounded_elements?: Array<{
            selector: string;
            label: string;
        }>;
    };
    state: {
        active_goals: Array<{
            id: string;
            title: string;
            priority: number;
        }>;
        blockers: Array<{
            id: string;
            description: string;
        }>;
        recent_decisions?: Array<{
            id: string;
            recommendation: string;
        }>;
    };
    vitals?: {
        hp?: number;
        resources?: Record<string, number>;
        threat_level?: number;
        [key: string]: unknown;
    };
}

declare const SetGoalSchema: z.ZodObject<{
    action: z.ZodEnum<["create", "update", "decompose", "get", "list", "abandon"]>;
    id: z.ZodOptional<z.ZodString>;
    parent_id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["active", "completed", "failed", "abandoned", "suspended"]>>;
    priority: z.ZodOptional<z.ZodNumber>;
    utility_weights: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    deadline_at: z.ZodOptional<z.ZodString>;
    progress: z.ZodOptional<z.ZodNumber>;
    success_criteria: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    subgoals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        priority?: number | undefined;
        description?: string | undefined;
    }, {
        title: string;
        priority?: number | undefined;
        description?: string | undefined;
    }>, "many">>;
    client_request_id: z.ZodOptional<z.ZodString>;
    project: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    action: "create" | "update" | "decompose" | "get" | "list" | "abandon";
    title?: string | undefined;
    limit?: number | undefined;
    id?: string | undefined;
    priority?: number | undefined;
    parent_id?: string | undefined;
    status?: "active" | "completed" | "failed" | "abandoned" | "suspended" | undefined;
    progress?: number | undefined;
    subgoals?: {
        title: string;
        priority?: number | undefined;
        description?: string | undefined;
    }[] | undefined;
    description?: string | undefined;
    project?: string | undefined;
    utility_weights?: Record<string, number> | undefined;
    deadline_at?: string | undefined;
    success_criteria?: string[] | undefined;
    client_request_id?: string | undefined;
}, {
    action: "create" | "update" | "decompose" | "get" | "list" | "abandon";
    title?: string | undefined;
    limit?: number | undefined;
    id?: string | undefined;
    priority?: number | undefined;
    parent_id?: string | undefined;
    status?: "active" | "completed" | "failed" | "abandoned" | "suspended" | undefined;
    progress?: number | undefined;
    subgoals?: {
        title: string;
        priority?: number | undefined;
        description?: string | undefined;
    }[] | undefined;
    description?: string | undefined;
    project?: string | undefined;
    utility_weights?: Record<string, number> | undefined;
    deadline_at?: string | undefined;
    success_criteria?: string[] | undefined;
    client_request_id?: string | undefined;
}>;
declare const EvaluateSituationSchema: z.ZodObject<{
    action: z.ZodEnum<["snapshot", "quick"]>;
    snapshot: z.ZodOptional<z.ZodObject<{
        session_id: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
        world: z.ZodOptional<z.ZodAny>;
        vision: z.ZodOptional<z.ZodAny>;
        state: z.ZodOptional<z.ZodAny>;
        vitals: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        session_id: string;
        state?: any;
        timestamp?: string | undefined;
        vitals?: any;
        world?: any;
        vision?: any;
    }, {
        session_id: string;
        state?: any;
        timestamp?: string | undefined;
        vitals?: any;
        world?: any;
        vision?: any;
    }>>;
    quick_context: z.ZodOptional<z.ZodString>;
    candidate_actions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        action: z.ZodString;
        parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        action: string;
        description?: string | undefined;
        parameters?: Record<string, any> | undefined;
    }, {
        action: string;
        description?: string | undefined;
        parameters?: Record<string, any> | undefined;
    }>, "many">>;
    utility_profile: z.ZodOptional<z.ZodString>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "snapshot" | "quick";
    snapshot?: {
        session_id: string;
        state?: any;
        timestamp?: string | undefined;
        vitals?: any;
        world?: any;
        vision?: any;
    } | undefined;
    utility_profile?: string | undefined;
    project?: string | undefined;
    quick_context?: string | undefined;
    candidate_actions?: {
        action: string;
        description?: string | undefined;
        parameters?: Record<string, any> | undefined;
    }[] | undefined;
}, {
    action: "snapshot" | "quick";
    snapshot?: {
        session_id: string;
        state?: any;
        timestamp?: string | undefined;
        vitals?: any;
        world?: any;
        vision?: any;
    } | undefined;
    utility_profile?: string | undefined;
    project?: string | undefined;
    quick_context?: string | undefined;
    candidate_actions?: {
        action: string;
        description?: string | undefined;
        parameters?: Record<string, any> | undefined;
    }[] | undefined;
}>;
declare const ReplanSchema: z.ZodObject<{
    action: z.ZodEnum<["blocker", "event", "full"]>;
    goal_id: z.ZodString;
    blocker_description: z.ZodOptional<z.ZodString>;
    trigger_event: z.ZodOptional<z.ZodString>;
    preserve_completed: z.ZodOptional<z.ZodBoolean>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "blocker" | "event" | "full";
    goal_id: string;
    blocker_description?: string | undefined;
    project?: string | undefined;
    trigger_event?: string | undefined;
    preserve_completed?: boolean | undefined;
}, {
    action: "blocker" | "event" | "full";
    goal_id: string;
    blocker_description?: string | undefined;
    project?: string | undefined;
    trigger_event?: string | undefined;
    preserve_completed?: boolean | undefined;
}>;
declare const AssessRiskSchema: z.ZodObject<{
    action: z.ZodEnum<["action", "plan", "compare"]>;
    candidate_action: z.ZodOptional<z.ZodString>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    candidate_actions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        action: z.ZodString;
        parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        action: string;
        parameters?: Record<string, any> | undefined;
    }, {
        action: string;
        parameters?: Record<string, any> | undefined;
    }>, "many">>;
    situation_context: z.ZodOptional<z.ZodAny>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "action" | "plan" | "compare";
    candidate_action?: string | undefined;
    project?: string | undefined;
    parameters?: Record<string, any> | undefined;
    candidate_actions?: {
        action: string;
        parameters?: Record<string, any> | undefined;
    }[] | undefined;
    situation_context?: any;
}, {
    action: "action" | "plan" | "compare";
    candidate_action?: string | undefined;
    project?: string | undefined;
    parameters?: Record<string, any> | undefined;
    candidate_actions?: {
        action: string;
        parameters?: Record<string, any> | undefined;
    }[] | undefined;
    situation_context?: any;
}>;
declare const QueryKnowledgeSchema: z.ZodObject<{
    action: z.ZodEnum<["search", "patterns", "similar_situations"]>;
    query: z.ZodOptional<z.ZodString>;
    pattern_type: z.ZodOptional<z.ZodEnum<["heuristic", "anti_pattern", "optimization", "contingency"]>>;
    context_tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    limit: z.ZodOptional<z.ZodNumber>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "search" | "patterns" | "similar_situations";
    query?: string | undefined;
    limit?: number | undefined;
    pattern_type?: "heuristic" | "anti_pattern" | "optimization" | "contingency" | undefined;
    project?: string | undefined;
    context_tags?: string[] | undefined;
}, {
    action: "search" | "patterns" | "similar_situations";
    query?: string | undefined;
    limit?: number | undefined;
    pattern_type?: "heuristic" | "anti_pattern" | "optimization" | "contingency" | undefined;
    project?: string | undefined;
    context_tags?: string[] | undefined;
}>;
declare const SetUtilityWeightsSchema: z.ZodObject<{
    action: z.ZodEnum<["configure", "get", "list", "activate"]>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    weights: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    is_active: z.ZodOptional<z.ZodBoolean>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "get" | "list" | "configure" | "activate";
    name?: string | undefined;
    weights?: Record<string, number> | undefined;
    description?: string | undefined;
    project?: string | undefined;
    is_active?: boolean | undefined;
}, {
    action: "get" | "list" | "configure" | "activate";
    name?: string | undefined;
    weights?: Record<string, number> | undefined;
    description?: string | undefined;
    project?: string | undefined;
    is_active?: boolean | undefined;
}>;
declare const GetDecisionTraceSchema: z.ZodObject<{
    action: z.ZodEnum<["latest", "get", "list", "explain"]>;
    trace_id: z.ZodOptional<z.ZodString>;
    goal_id: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "get" | "list" | "latest" | "explain";
    goal_id?: string | undefined;
    trace_id?: string | undefined;
    limit?: number | undefined;
    project?: string | undefined;
}, {
    action: "get" | "list" | "latest" | "explain";
    goal_id?: string | undefined;
    trace_id?: string | undefined;
    limit?: number | undefined;
    project?: string | undefined;
}>;
declare const ManageBeliefsSchema: z.ZodObject<{
    action: z.ZodEnum<["update", "query", "expire", "reconcile"]>;
    category: z.ZodOptional<z.ZodEnum<["spatial", "entity", "state", "rule", "social"]>>;
    subject: z.ZodOptional<z.ZodString>;
    predicate: z.ZodOptional<z.ZodString>;
    object: z.ZodOptional<z.ZodAny>;
    confidence: z.ZodOptional<z.ZodNumber>;
    source: z.ZodOptional<z.ZodEnum<["observation", "deduction", "agent_communication", "a_priori"]>>;
    expires_at: z.ZodOptional<z.ZodString>;
    decay_rate: z.ZodOptional<z.ZodNumber>;
    belief_id: z.ZodOptional<z.ZodString>;
    client_request_id: z.ZodOptional<z.ZodString>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "update" | "query" | "expire" | "reconcile";
    object?: any;
    category?: "spatial" | "entity" | "state" | "rule" | "social" | undefined;
    subject?: string | undefined;
    predicate?: string | undefined;
    confidence?: number | undefined;
    project?: string | undefined;
    client_request_id?: string | undefined;
    source?: "observation" | "deduction" | "agent_communication" | "a_priori" | undefined;
    expires_at?: string | undefined;
    decay_rate?: number | undefined;
    belief_id?: string | undefined;
}, {
    action: "update" | "query" | "expire" | "reconcile";
    object?: any;
    category?: "spatial" | "entity" | "state" | "rule" | "social" | undefined;
    subject?: string | undefined;
    predicate?: string | undefined;
    confidence?: number | undefined;
    project?: string | undefined;
    client_request_id?: string | undefined;
    source?: "observation" | "deduction" | "agent_communication" | "a_priori" | undefined;
    expires_at?: string | undefined;
    decay_rate?: number | undefined;
    belief_id?: string | undefined;
}>;
declare const ManageIntentionsSchema: z.ZodObject<{
    action: z.ZodEnum<["create", "dispatch", "get", "list", "cancel", "resolve"]>;
    intention_id: z.ZodOptional<z.ZodString>;
    goal_id: z.ZodOptional<z.ZodString>;
    trace_id: z.ZodOptional<z.ZodString>;
    behavior_name: z.ZodOptional<z.ZodString>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    priority: z.ZodOptional<z.ZodNumber>;
    deadline_at: z.ZodOptional<z.ZodString>;
    abort_conditions: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    result: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    status: z.ZodOptional<z.ZodEnum<["pending", "dispatched", "running", "completed", "failed", "aborted", "interrupted"]>>;
    client_request_id: z.ZodOptional<z.ZodString>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "create" | "get" | "list" | "dispatch" | "cancel" | "resolve";
    goal_id?: string | undefined;
    intention_id?: string | undefined;
    trace_id?: string | undefined;
    priority?: number | undefined;
    status?: "completed" | "failed" | "pending" | "dispatched" | "running" | "aborted" | "interrupted" | undefined;
    behavior_name?: string | undefined;
    result?: Record<string, any> | undefined;
    project?: string | undefined;
    deadline_at?: string | undefined;
    client_request_id?: string | undefined;
    parameters?: Record<string, any> | undefined;
    abort_conditions?: any[] | undefined;
}, {
    action: "create" | "get" | "list" | "dispatch" | "cancel" | "resolve";
    goal_id?: string | undefined;
    intention_id?: string | undefined;
    trace_id?: string | undefined;
    priority?: number | undefined;
    status?: "completed" | "failed" | "pending" | "dispatched" | "running" | "aborted" | "interrupted" | undefined;
    behavior_name?: string | undefined;
    result?: Record<string, any> | undefined;
    project?: string | undefined;
    deadline_at?: string | undefined;
    client_request_id?: string | undefined;
    parameters?: Record<string, any> | undefined;
    abort_conditions?: any[] | undefined;
}>;
declare const ManageReasoningDbSchema: z.ZodObject<{
    action: z.ZodEnum<["backup", "stats", "audit", "snapshot", "diff", "restore"]>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "snapshot" | "backup" | "stats" | "audit" | "diff" | "restore";
    name?: string | undefined;
    description?: string | undefined;
    project?: string | undefined;
}, {
    action: "snapshot" | "backup" | "stats" | "audit" | "diff" | "restore";
    name?: string | undefined;
    description?: string | undefined;
    project?: string | undefined;
}>;

declare class ReasoningError extends Error {
    readonly code: string;
    readonly details?: unknown;
    constructor(message: string, code?: string, details?: unknown);
}
declare class DatabaseError extends ReasoningError {
    constructor(message: string, details?: unknown);
}
declare class ValidationError extends ReasoningError {
    constructor(message: string, details?: unknown);
}
declare class NotFoundError extends ReasoningError {
    constructor(message: string, details?: unknown);
}
declare class ConflictError extends ReasoningError {
    constructor(message: string, details?: unknown);
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
declare const LOG_LEVELS: Record<LogLevel, number>;
declare function getLogLevel(): number;
declare const logger: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
};

declare function generateId(): string;

declare function getCurrentIsoString(): string;
declare function parseIsoString(iso: string): Date;
declare function getElapsedTimeMs(startTimeIso: string): number;

declare function validatePath(filePath: string, project?: string): string;
declare function getRegistryPath(): string;
declare function getRegistry(): Record<string, string>;
declare function registerProject(projectName: string, projectRoot: string): void;
declare function unregisterProject(projectName: string): void;
declare function sanitizeSlug(str: string): string;
declare function resolveProjectRoot(project?: string, cwd?: string): string;
declare function getProjectSlug(project?: string, cwd?: string): string;
declare function getBaseDir(projectRoot: string): string;
declare function getProjectDbDir(project?: string, cwd?: string): string;
declare function getDbPath(project?: string, cwd?: string): string;
declare function getDb(project?: string, cwd?: string): Database.Database;
declare function getReadOnlyDb(project?: string, cwd?: string): Database.Database;
declare function closeDb(project?: string, cwd?: string): void;
declare function closeAllDbs(): void;

declare class GoalEngine {
    static createGoal(db: Database.Database, params: {
        project: string;
        session_id?: string;
        parent_id?: string;
        title: string;
        description?: string;
        status?: GoalStatus;
        priority?: number;
        utility_weights?: Record<string, number>;
        deadline_at?: string;
        success_criteria?: string[];
        metadata?: Record<string, unknown>;
        client_request_id?: string;
    }): Goal;
    static updateGoal(db: Database.Database, params: {
        project: string;
        id: string;
        title?: string;
        description?: string;
        status?: GoalStatus;
        priority?: number;
        progress?: number;
        failure_reason?: string;
        metadata?: Record<string, unknown>;
    }): Goal;
    static decomposeGoal(db: Database.Database, params: {
        project: string;
        parent_id: string;
        subgoals: Array<{
            title: string;
            description?: string;
            priority?: number;
        }>;
    }): {
        parent_goal: Goal;
        subgoals: Goal[];
    };
    static getGoal(db: Database.Database, params: {
        project: string;
        id: string;
    }): Goal;
    static listGoals(db: Database.Database, params: {
        project: string;
        status?: GoalStatus;
        parent_id?: string;
        limit?: number;
    }): Goal[];
    static abandonGoal(db: Database.Database, params: {
        project: string;
        id: string;
        reason?: string;
    }): Goal;
    private static mapRowToGoal;
}

declare class BeliefEngine {
    static updateBelief(db: Database.Database, params: {
        project: string;
        session_id?: string;
        category: BeliefCategory;
        subject: string;
        predicate: string;
        object: unknown;
        confidence?: number;
        source?: 'observation' | 'deduction' | 'agent_communication' | 'a_priori';
        source_id?: string;
        expires_at?: string;
        decay_rate?: number;
        client_request_id?: string;
        metadata?: Record<string, unknown>;
    }): Belief;
    static queryBeliefs(db: Database.Database, params: {
        project: string;
        category?: BeliefCategory;
        subject?: string;
        predicate?: string;
        min_confidence?: number;
        limit?: number;
    }): Belief[];
    static decayBeliefs(db: Database.Database, project: string): void;
    static expireBeliefs(db: Database.Database, project: string): number;
    static getBelief(db: Database.Database, params: {
        project: string;
        id: string;
    }): Belief;
    private static mapRowToBelief;
}

declare class UtilityProfileEngine {
    static configureProfile(db: Database.Database, params: {
        project: string;
        name: string;
        description?: string;
        weights: Record<string, number>;
        is_active?: boolean;
    }): UtilityProfile;
    static getActiveProfile(db: Database.Database, project: string): UtilityProfile;
    static getProfile(db: Database.Database, params: {
        project: string;
        name: string;
    }): UtilityProfile;
    static listProfiles(db: Database.Database, project: string): UtilityProfile[];
    static activateProfile(db: Database.Database, params: {
        project: string;
        name: string;
    }): UtilityProfile;
    private static mapRowToProfile;
}

declare class IntentionEngine {
    static createIntention(db: Database.Database, params: {
        project: string;
        goal_id: string;
        trace_id?: string;
        session_id?: string;
        behavior_name: string;
        parameters?: Record<string, unknown>;
        priority?: number;
        deadline_at?: string;
        abort_conditions?: Array<{
            condition_type: string;
            condition_params: Record<string, unknown>;
        }>;
        client_request_id?: string;
    }): Intention;
    static dispatchIntention(db: Database.Database, params: {
        project: string;
        id: string;
    }): Intention;
    static resolveIntention(db: Database.Database, params: {
        project: string;
        id: string;
        status: 'completed' | 'failed' | 'aborted' | 'interrupted';
        result?: Record<string, unknown>;
    }): Intention;
    static getIntention(db: Database.Database, params: {
        project: string;
        id: string;
    }): Intention;
    static listIntentions(db: Database.Database, params: {
        project: string;
        status?: IntentionStatus;
        goal_id?: string;
        limit?: number;
    }): Intention[];
    private static mapRowToIntention;
}

declare class DecisionTraceEngine {
    static recordTrace(db: Database.Database, params: {
        project: string;
        session_id?: string;
        goal_id?: string;
        situation_summary: string;
        candidate_actions: CandidateAction[];
        utility_profile: string;
        chosen_action: string;
        reasoning_chain: string[];
        risk_assessment?: RiskAssessmentResult;
        outcome?: string;
        latency_ms?: number;
        metadata?: Record<string, unknown>;
    }): DecisionTrace;
    static getTrace(db: Database.Database, params: {
        project: string;
        id: string;
    }): DecisionTrace;
    static listTraces(db: Database.Database, params: {
        project: string;
        goal_id?: string;
        limit?: number;
    }): DecisionTrace[];
    static getLatestTrace(db: Database.Database, project: string): DecisionTrace | null;
    static explainTrace(db: Database.Database, params: {
        project: string;
        id: string;
    }): string;
    private static mapRowToTrace;
}

declare class EvaluatorEngine {
    static evaluateSituation(db: Database.Database, params: {
        project: string;
        snapshot?: SituationSnapshot;
        quick_context?: string;
        candidate_actions?: Array<{
            action: string;
            parameters?: Record<string, unknown>;
            description?: string;
        }>;
        utility_profile?: string;
    }): {
        chosen_action: CandidateAction;
        ranked_candidates: CandidateAction[];
        reasoning_chain: string[];
        risk_assessment: any;
        trace_id: string;
    };
}

declare class UtilityEngine {
    static scoreCandidate(candidate: {
        action: string;
        parameters?: Record<string, unknown>;
        attributes?: Record<string, number>;
    }, profile: UtilityProfile): CandidateAction;
    static rankCandidates(candidates: Array<{
        action: string;
        parameters?: Record<string, unknown>;
        attributes?: Record<string, number>;
    }>, profile: UtilityProfile): CandidateAction[];
}

declare class RiskEngine {
    static assessAction(actionName: string, params?: Record<string, unknown>, context?: Record<string, unknown>, profile?: UtilityProfile): RiskAssessmentResult;
}

declare class ReplannerEngine {
    static replanGoal(db: Database.Database, params: {
        project: string;
        goal_id: string;
        blocker_description?: string;
        trigger_event?: string;
        preserve_completed?: boolean;
    }): {
        original_goal: Goal;
        new_subgoals: Goal[];
        cancelled_intentions: number;
        recommended_action: string;
    };
}

declare class KnowledgeEngine {
    static createPattern(db: Database.Database, params: {
        project: string;
        pattern_type: 'heuristic' | 'anti_pattern' | 'optimization' | 'contingency';
        context_tags: string[];
        situation_pattern: string;
        recommended_strategy: string;
        confidence?: number;
        metadata?: Record<string, unknown>;
    }): KnowledgePattern;
    static queryKnowledge(db: Database.Database, params: {
        project: string;
        query?: string;
        pattern_type?: string;
        context_tags?: string[];
        limit?: number;
    }): KnowledgePattern[];
    private static mapRowToPattern;
}

declare class SnapshotEngine {
    static saveSnapshot(db: Database.Database, params: {
        project: string;
        name: string;
        description?: string;
    }): {
        snapshot_id: string;
        name: string;
        timestamp: string;
    };
    static restoreSnapshot(db: Database.Database, params: {
        project: string;
        name: string;
    }): {
        restored_goals: number;
        restored_beliefs: number;
    };
    static listSnapshots(db: Database.Database, params: {
        project: string;
        limit?: number;
    }): Array<{
        id: string;
        name: string;
        description?: string;
        created_at: string;
    }>;
}

declare function computeEventHash(params: {
    prev_hash: string;
    id: string;
    project: string;
    entity_id: string;
    entity_type: string;
    action: string;
    timestamp: string;
    details?: Record<string, unknown>;
}): string;
declare function logReasoningEvent(db: Database.Database, params: {
    project: string;
    entity_id: string;
    entity_type: 'goal' | 'belief' | 'trace' | 'profile' | 'intention' | 'knowledge';
    action: string;
    details?: Record<string, unknown>;
}): ReasoningEvent;
declare function verifyEventChain(db: Database.Database, project: string): {
    valid: boolean;
    total_events: number;
    corrupted_event_id?: string;
    error?: string;
};

interface StateBridgeData {
    tasks: Array<{
        id: string;
        title: string;
        status: string;
        priority: number;
    }>;
    blockers: Array<{
        id: string;
        description: string;
    }>;
    decisions: Array<{
        id: string;
        recommendation: string;
    }>;
}
declare class StateBridge {
    static normalizeStateData(rawStateData: any): StateBridgeData;
}

interface WorldBridgeData {
    entities: Array<{
        id: string;
        type: string;
        position: [number, number, number];
        status: string;
    }>;
    relations: Array<{
        source: string;
        relation: string;
        target: string;
    }>;
    observer_position?: [number, number, number];
}
declare class WorldBridge {
    static normalizeWorldData(rawWorldData: any): WorldBridgeData;
}

interface VisionBridgeData {
    current_state_id?: string;
    description?: string;
    grounded_elements: Array<{
        selector: string;
        label: string;
    }>;
}
declare class VisionBridge {
    static normalizeVisionData(rawVisionData: any): VisionBridgeData;
}

declare const server: McpServer;

export { AssessRiskSchema, type Belief, type BeliefCategory, BeliefEngine, type BeliefId, type CandidateAction, ConflictError, DatabaseError, type DecisionTrace, DecisionTraceEngine, EvaluateSituationSchema, EvaluatorEngine, type EventId, GetDecisionTraceSchema, type Goal, GoalEngine, type GoalId, type GoalStatus, type Intention, IntentionEngine, type IntentionId, type IntentionStatus, KnowledgeEngine, type KnowledgePattern, LOG_LEVELS, ManageBeliefsSchema, ManageIntentionsSchema, ManageReasoningDbSchema, NotFoundError, type PatternId, type ProfileId, QueryKnowledgeSchema, ReasoningError, type ReasoningEvent, ReplanSchema, ReplannerEngine, type RiskAssessmentResult, RiskEngine, SetGoalSchema, SetUtilityWeightsSchema, type SituationSnapshot, SnapshotEngine, type SnapshotId, StateBridge, type StateBridgeData, type TraceId, UtilityEngine, type UtilityProfile, UtilityProfileEngine, ValidationError, VisionBridge, type VisionBridgeData, WorldBridge, type WorldBridgeData, closeAllDbs, closeDb, computeEventHash, generateId, getBaseDir, getCurrentIsoString, getDb, getDbPath, getElapsedTimeMs, getLogLevel, getProjectDbDir, getProjectSlug, getReadOnlyDb, getRegistry, getRegistryPath, logReasoningEvent, logger, parseIsoString, registerProject, resolveProjectRoot, sanitizeSlug, server, unregisterProject, validatePath, verifyEventChain };
