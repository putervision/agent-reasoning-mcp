export function registerAllPrompts(server: any): void {
  const registerPrompt = (
    name: string,
    metadata: { title: string; description: string; argsSchema?: Record<string, any> },
    handler: (args: any, extra?: { signal?: AbortSignal }) => Promise<any> | any
  ) => {
    if (typeof server.registerPrompt === 'function') {
      server.registerPrompt(name, metadata, handler);
    } else if (typeof server.prompt === 'function') {
      server.prompt(name, metadata.description, metadata.argsSchema || {}, handler);
    }
  };

  registerPrompt(
    'strategic-assessment',
    {
      title: 'Strategic Assessment',
      description:
        'Generate comprehensive strategic assessment from active goals, beliefs, and situation snapshot',
      argsSchema: {
        properties: {
          project: { type: 'string', description: 'Target project slug' },
          focus_area: {
            type: 'string',
            description: 'Specific focus area (e.g. "combat", "economy", "exploration")',
          },
        },
      },
    },
    async (args: any) => {
      const focus = args.focus_area || 'general autonomous operation';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Perform a strategic assessment for project "${args.project || 'default'}" focusing on ${focus}. Review active goals via \`set_goal(list)\`, query current beliefs with \`manage_beliefs(query)\`, and evaluate situation with \`evaluate_situation(snapshot)\`. Output prioritized intentions and recommendations.`,
            },
          },
        ],
      };
    }
  );

  registerPrompt(
    'goal-planning',
    {
      title: 'Goal Planning',
      description:
        'Decompose high-level strategic objectives into structured sub-goal DAGs with verifiable success criteria',
      argsSchema: {
        properties: {
          objective: { type: 'string', description: 'High-level mission objective to plan' },
          priority: { type: 'string', description: 'Priority level (0.0 to 1.0)' },
        },
        required: ['objective'],
      },
    },
    async (args: any) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Plan and decompose the following objective into a structured DAG of actionable subgoals: "${args.objective}". Use \`set_goal(create)\` and \`set_goal(decompose)\` with clear success criteria and priority ${args.priority || '0.8'}.`,
            },
          },
        ],
      };
    }
  );

  registerPrompt(
    'risk-evaluation',
    {
      title: 'Risk Evaluation',
      description: 'Perform quantitative threat and opportunity analysis for proposed action plans',
      argsSchema: {
        properties: {
          proposed_action: { type: 'string', description: 'Proposed behavior or action plan' },
          threat_context: {
            type: 'string',
            description: 'Known environmental threats or constraints',
          },
        },
        required: ['proposed_action'],
      },
    },
    async (args: any) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Evaluate risk for proposed action "${args.proposed_action}". Context: "${args.threat_context || 'Standard operations'}". Call \`assess_risk(action)\` and compute threat/opportunity trade-offs against active utility weights.`,
            },
          },
        ],
      };
    }
  );

  registerPrompt(
    'post-mortem',
    {
      title: 'Post-Mortem',
      description:
        'Analyze decision trace and outcome results to extract heuristic knowledge patterns and lessons learned',
      argsSchema: {
        properties: {
          trace_id: { type: 'string', description: 'Decision trace ID to analyze' },
        },
        required: ['trace_id'],
      },
    },
    async (args: any) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Conduct a post-mortem review on decision trace "${args.trace_id}". Retrieve the step-by-step reasoning chain with \`get_decision_trace(explain)\` and extract reusable tactics or anti-patterns into \`query_knowledge\`.`,
            },
          },
        ],
      };
    }
  );
}
