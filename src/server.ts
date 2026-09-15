import { NativeMcpServer, NativeResourceTemplate } from './transport/native-mcp.js';
import { getVersion } from './utils/version.js';
import { registerAllTools } from './tools/handlers.js';
import { registerAllPrompts } from './tools/prompts.js';
import { getReadOnlyDb, getProjectSlug } from './engine/db.js';
import { GoalEngine } from './engine/goals.js';
import { BeliefEngine } from './engine/beliefs.js';
import { IntentionEngine } from './engine/intentions.js';
import { DecisionTraceEngine } from './engine/traces.js';
import { UtilityProfileEngine } from './engine/personality.js';
import { KnowledgeEngine } from './engine/knowledge.js';
import { toolDefinitions } from './tools/definitions.js';

function getVarString(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

export function registerAllResources(server: any): void {
  // 1. reasoning-summary
  server.registerResource(
    'reasoning-summary',
    new NativeResourceTemplate('reasoning:///{project}/summary', { list: undefined }),
    {
      title: 'Reasoning Engine Summary Template',
      description: 'High-level BDI cognitive state: active goals, top beliefs, and intention queue health',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const goals = GoalEngine.listGoals(db, { project, status: 'active', limit: 10 });
      const beliefs = BeliefEngine.queryBeliefs(db, { project, limit: 10 });
      const intentions = IntentionEngine.listIntentions(db, { project, status: 'pending', limit: 10 });
      const activeProfile = UtilityProfileEngine.getActiveProfile(db, project);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                project,
                activeProfile,
                active_goals: goals.length,
                beliefs_count: beliefs.length,
                pending_intentions: intentions.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 2. reasoning-goals
  server.registerResource(
    'reasoning-goals',
    new NativeResourceTemplate('reasoning:///{project}/goals', { list: undefined }),
    {
      title: 'Reasoning Active Goals Template',
      description: 'Active goal hierarchy and task DAGs',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const data = GoalEngine.listGoals(db, { project, status: 'active', limit: 100 });
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // 3. reasoning-beliefs
  server.registerResource(
    'reasoning-beliefs',
    new NativeResourceTemplate('reasoning:///{project}/beliefs', { list: undefined }),
    {
      title: 'Reasoning Active Beliefs Template',
      description: 'Beliefs with confidence decay ratings',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const data = BeliefEngine.queryBeliefs(db, { project, limit: 100 });
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // 4. reasoning-intentions
  server.registerResource(
    'reasoning-intentions',
    new NativeResourceTemplate('reasoning:///{project}/intentions', { list: undefined }),
    {
      title: 'Reasoning Intentions Queue Template',
      description: 'Queued and running intentions dispatched to runtime',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const data = IntentionEngine.listIntentions(db, { project, limit: 100 });
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // 5. reasoning-traces
  server.registerResource(
    'reasoning-traces',
    new NativeResourceTemplate('reasoning:///{project}/traces', { list: undefined }),
    {
      title: 'Reasoning Decision Traces Template',
      description: 'Historical chain-of-thought decision logs',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const data = DecisionTraceEngine.listTraces(db, { project, limit: 50 });
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // 6. reasoning-profiles
  server.registerResource(
    'reasoning-profiles',
    new NativeResourceTemplate('reasoning:///{project}/profiles', { list: undefined }),
    {
      title: 'Reasoning Utility Profiles Template',
      description: 'Configured utility scoring profiles and weights',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const data = UtilityProfileEngine.listProfiles(db, project);
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // 7. reasoning-knowledge
  server.registerResource(
    'reasoning-knowledge',
    new NativeResourceTemplate('reasoning:///{project}/knowledge', { list: undefined }),
    {
      title: 'Reasoning Knowledge Patterns Template',
      description: 'Learned tactics, heuristics, and anti-patterns',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const data = KnowledgeEngine.queryKnowledge(db, { project, limit: 100 });
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // 8. reasoning-active-loop
  server.registerResource(
    'reasoning-active-loop',
    new NativeResourceTemplate('reasoning:///{project}/active_loop', { list: undefined }),
    {
      title: 'Reasoning Active Pentad Loop Telemetry',
      description: 'Current loop state linking goal, intention, and latest outcome',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const project = getProjectSlug(getVarString(variables?.project));
      const db = getReadOnlyDb(project);
      const topGoal = GoalEngine.listGoals(db, { project, status: 'active', limit: 1 })[0] || null;
      const topIntention =
        IntentionEngine.listIntentions(db, { project, status: 'dispatched', limit: 1 })[0] || null;
      const latestTrace = DecisionTraceEngine.getLatestTrace(db, project);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              { project, active_goal: topGoal, active_intention: topIntention, latest_trace: latestTrace },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 9. reasoning-health
  server.registerResource(
    'reasoning-health',
    'reasoning:///health',
    {
      title: 'Agent Reasoning Server Health',
      description: 'Server health status, version, and timestamp',
      mimeType: 'application/json',
    },
    async (uri: URL) => {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'healthy',
                version: getVersion(),
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Register pv://docs/... documentation resources (E13)
  for (const tool of toolDefinitions) {
    server.registerResource(
      `docs-${tool.name}`,
      `pv://docs/${tool.name}`,
      {
        title: `${tool.name} Documentation`,
        description: `Complete parameter schema and documentation for ${tool.name}`,
        mimeType: 'application/json',
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      })
    );
  }

  server.registerResource(
    'tool-docs-template',
    new NativeResourceTemplate('pv://docs/{toolName}', { list: undefined }),
    {
      title: 'Tool Documentation Template',
      description: 'Fetch detailed tool documentation and parameter schema via pv://docs/{toolName}',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const toolName = Array.isArray(variables.toolName) ? variables.toolName[0] : variables.toolName;
      const tool = toolDefinitions.find((t) => t.name === toolName);
      if (!tool) {
        throw new Error(`Documentation not found for tool: "${toolName}"`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

export function createNativeServer(): NativeMcpServer {
  const native = new NativeMcpServer({
    name: 'io.github.putervision/agent-reasoning-mcp',
    version: getVersion(),
  });

  registerAllResources(native);
  registerAllTools(native);
  registerAllPrompts(native);

  return native;
}

export const server = createNativeServer();
