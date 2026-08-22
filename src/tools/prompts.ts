import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAllPrompts(server: McpServer): void {
  server.prompt(
    'strategic-assessment',
    'Generate comprehensive strategic assessment from active goals, beliefs, and situation snapshot',
    {
      project: z.string().optional().describe('Target project slug'),
      focus_area: z.string().optional().describe('Specific focus area (e.g. "combat", "economy", "exploration")'),
    },
    async (args) => {
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

  server.prompt(
    'goal-planning',
    'Decompose high-level strategic objectives into structured sub-goal DAGs with verifiable success criteria',
    {
      objective: z.string().describe('High-level mission objective to plan'),
      priority: z.string().optional().describe('Priority level (0.0 to 1.0)'),
    },
    async (args) => {
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

  server.prompt(
    'risk-evaluation',
    'Perform quantitative threat and opportunity analysis for proposed action plans',
    {
      proposed_action: z.string().describe('Proposed behavior or action plan'),
      threat_context: z.string().optional().describe('Known environmental threats or constraints'),
    },
    async (args) => {
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

  server.prompt(
    'post-mortem',
    'Analyze decision trace and outcome results to extract heuristic knowledge patterns and lessons learned',
    {
      trace_id: z.string().describe('Decision trace ID to analyze'),
    },
    async (args) => {
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
