export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const READ_ONLY_TOOLS = new Set([
  'query_beliefs',
  'get_decision_trace',
  'query_knowledge',
]);

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'set_goal',
    description: 'Register, update, decompose, or manage hierarchical goals and task DAGs in the reasoning engine.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'decompose', 'get', 'list', 'abandon'],
          description: 'The goal management operation to perform',
        },
        id: { type: 'string', description: 'Goal ID (required for update, get, abandon)' },
        parent_id: { type: 'string', description: 'Parent goal ID for hierarchical sub-goals' },
        title: { type: 'string', description: 'Goal title or objective summary' },
        description: { type: 'string', description: 'Detailed goal description' },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'failed', 'abandoned', 'suspended'],
          description: 'Goal status',
        },
        priority: { type: 'number', description: 'Goal priority (0.0 to 1.0)' },
        utility_weights: { type: 'object', description: 'Goal-specific utility weight overrides' },
        deadline_at: { type: 'string', description: 'ISO-8601 deadline timestamp' },
        progress: { type: 'number', description: 'Completion progress (0.0 to 1.0)' },
        success_criteria: { type: 'array', items: { type: 'string' }, description: 'List of verifiable conditions' },
        subgoals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'number' },
            },
            required: ['title'],
          },
          description: 'Array of sub-goals for decompose action',
        },
        client_request_id: { type: 'string', description: 'Idempotency key to prevent duplicate creation' },
        project: { type: 'string', description: 'Target project slug' },
        limit: { type: 'number', description: 'Max items to return for list action' },
      },
      required: ['action'],
    },
  },
  {
    name: 'evaluate_situation',
    description: 'Ingest multi-modal situation snapshot, compute expected utilities against active weights, and output prioritized action recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['snapshot', 'quick'],
          description: 'Snapshot evaluation mode or quick text context',
        },
        snapshot: {
          type: 'object',
          description: 'Normalized SituationSnapshot with world, vision, state, and vitals',
        },
        quick_context: { type: 'string', description: 'Text summary of current situation for quick evaluation' },
        candidate_actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              parameters: { type: 'object' },
              description: { type: 'string' },
            },
            required: ['action'],
          },
          description: 'Candidate actions to score and rank',
        },
        utility_profile: { type: 'string', description: 'Named utility profile to score against (defaults to active)' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
  {
    name: 'replan',
    description: 'Regenerate sub-task DAG and abort/recreate intentions upon unexpected blockers or environmental state changes.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['blocker', 'event', 'full'],
          description: 'Replanning trigger type',
        },
        goal_id: { type: 'string', description: 'ID of goal to replan' },
        blocker_description: { type: 'string', description: 'Description of the obstacle or blocker encountered' },
        trigger_event: { type: 'string', description: 'Event description triggering replanning' },
        preserve_completed: { type: 'boolean', description: 'Whether to preserve already completed subgoals' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action', 'goal_id'],
    },
  },
  {
    name: 'assess_risk',
    description: 'Compute quantitative risk and threat assessment for candidate actions or plans against active utility weights.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['action', 'plan', 'compare'],
          description: 'Risk assessment mode',
        },
        candidate_action: { type: 'string', description: 'Action name to evaluate' },
        parameters: { type: 'object', description: 'Action parameters' },
        candidate_actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              parameters: { type: 'object' },
            },
            required: ['action'],
          },
          description: 'Multiple actions to compare risk scores',
        },
        situation_context: { type: 'object', description: 'Current environment telemetry & vitals' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
  {
    name: 'query_knowledge',
    description: 'Search learned heuristic patterns, tactics, and past decision traces by context similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'patterns', 'similar_situations'],
          description: 'Knowledge query mode',
        },
        query: { type: 'string', description: 'Semantic search query string' },
        pattern_type: {
          type: 'string',
          enum: ['heuristic', 'anti_pattern', 'optimization', 'contingency'],
          description: 'Filter by pattern category',
        },
        context_tags: { type: 'array', items: { type: 'string' }, description: 'Filter by context tags' },
        limit: { type: 'number', description: 'Max patterns to return' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
  {
    name: 'set_utility_weights',
    description: 'Configure and activate multi-attribute utility weights (aggression, caution, greed, exploration, cooperation).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['configure', 'get', 'list', 'activate'],
          description: 'Profile operation',
        },
        name: { type: 'string', description: 'Profile name (e.g. "aggressive", "cautious", "explorer")' },
        description: { type: 'string', description: 'Profile description' },
        weights: {
          type: 'object',
          description: 'Key-value map of weight values (0.0 to 1.0)',
        },
        is_active: { type: 'boolean', description: 'Whether to set as currently active profile' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_decision_trace',
    description: 'Retrieve explainable step-by-step chain-of-thought rationale, candidate utilities, and risk assessment for past decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['latest', 'get', 'list', 'explain'],
          description: 'Trace retrieval operation',
        },
        trace_id: { type: 'string', description: 'Trace ID for get/explain action' },
        goal_id: { type: 'string', description: 'Filter traces by linked goal ID' },
        limit: { type: 'number', description: 'Max traces to list' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_beliefs',
    description: 'Maintain structured belief state with TTL expiration sweeps, exponential confidence decay, and category filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['update', 'query', 'expire', 'reconcile'],
          description: 'Belief operation',
        },
        category: {
          type: 'string',
          enum: ['spatial', 'entity', 'state', 'rule', 'social'],
          description: 'Belief category',
        },
        subject: { type: 'string', description: 'Belief subject (e.g. "north_gate", "enemy_patrol")' },
        predicate: { type: 'string', description: 'Predicate relationship (e.g. "is_locked", "status")' },
        object: { description: 'Belief value / state payload' },
        confidence: { type: 'number', description: 'Confidence score (0.0 to 1.0)' },
        source: {
          type: 'string',
          enum: ['observation', 'deduction', 'agent_communication', 'a_priori'],
          description: 'Belief provenance source',
        },
        expires_at: { type: 'string', description: 'ISO-8601 expiration timestamp' },
        decay_rate: { type: 'number', description: 'Exponential decay rate lambda per hour' },
        belief_id: { type: 'string', description: 'Belief ID for specific lookup' },
        client_request_id: { type: 'string', description: 'Idempotency key' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_intentions',
    description: 'Queue, dispatch, track, and resolve behavior directives (wire contract) for behavior-runtime-mcp.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'dispatch', 'get', 'list', 'cancel', 'resolve'],
          description: 'Intention operation',
        },
        intention_id: { type: 'string', description: 'Intention ID for dispatch/get/cancel/resolve' },
        goal_id: { type: 'string', description: 'Linked goal ID' },
        trace_id: { type: 'string', description: 'Linked decision trace ID' },
        behavior_name: { type: 'string', description: 'Target behavior tree name (e.g. "combat_kite", "gather_loop")' },
        parameters: { type: 'object', description: 'Runtime behavior parameters' },
        priority: { type: 'number', description: 'Execution priority (0.0 to 1.0)' },
        deadline_at: { type: 'string', description: 'ISO-8601 completion deadline' },
        abort_conditions: { type: 'array', items: { type: 'object' }, description: 'Auto-abort trigger conditions' },
        result: { type: 'object', description: 'Outcome payload for resolve action' },
        status: {
          type: 'string',
          enum: ['pending', 'dispatched', 'running', 'completed', 'failed', 'aborted', 'interrupted'],
          description: 'Status filter or update'
        },
        client_request_id: { type: 'string', description: 'Idempotency key' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_reasoning_db',
    description: 'Database maintenance, stats, SHA-256 Merkle audit verification, checkpoints save/restore, and diffs.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['backup', 'stats', 'audit', 'snapshot', 'diff', 'restore'],
          description: 'Database maintenance operation',
        },
        name: { type: 'string', description: 'Snapshot or backup name' },
        description: { type: 'string', description: 'Description for snapshot' },
        project: { type: 'string', description: 'Target project slug' },
      },
      required: ['action'],
    },
  },
];
