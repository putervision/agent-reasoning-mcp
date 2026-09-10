import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
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

export const server = new McpServer({
  name: 'io.github.putervision/agent-reasoning-mcp',
  version: getVersion(),
});

function getVarString(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

// 1. reasoning-summary
server.registerResource(
  'reasoning-summary',
  new ResourceTemplate('reasoning:///{project}/summary', { list: undefined }),
  {
    title: 'Reasoning Engine Summary Template',
    description: 'High-level BDI cognitive state: active goals, top beliefs, and intention queue health',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
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
          text: JSON.stringify({ project, activeProfile, active_goals: goals.length, beliefs_count: beliefs.length, pending_intentions: intentions.length }, null, 2),
        },
      ],
    };
  }
);

// 2. reasoning-goals
server.registerResource(
  'reasoning-goals',
  new ResourceTemplate('reasoning:///{project}/goals', { list: undefined }),
  {
    title: 'Reasoning Active Goals Template',
    description: 'Active goal hierarchy and task DAGs',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
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
  new ResourceTemplate('reasoning:///{project}/beliefs', { list: undefined }),
  {
    title: 'Reasoning Active Beliefs Template',
    description: 'Beliefs with confidence decay ratings',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
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
  new ResourceTemplate('reasoning:///{project}/intentions', { list: undefined }),
  {
    title: 'Reasoning Intentions Queue Template',
    description: 'Queued and running intentions dispatched to runtime',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
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
  new ResourceTemplate('reasoning:///{project}/traces', { list: undefined }),
  {
    title: 'Reasoning Decision Traces Template',
    description: 'Historical chain-of-thought decision logs',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
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
  new ResourceTemplate('reasoning:///{project}/profiles', { list: undefined }),
  {
    title: 'Reasoning Utility Profiles Template',
    description: 'Configured utility scoring profiles and weights',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
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
  new ResourceTemplate('reasoning:///{project}/knowledge', { list: undefined }),
  {
    title: 'Reasoning Knowledge Patterns Template',
    description: 'Learned tactics, heuristics, and anti-patterns',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
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
  new ResourceTemplate('reasoning:///{project}/active_loop', { list: undefined }),
  {
    title: 'Reasoning Active Pentad Loop Telemetry',
    description: 'Current loop state linking goal, intention, and latest outcome',
    mimeType: 'application/json',
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const topGoal = GoalEngine.listGoals(db, { project, status: 'active', limit: 1 })[0] || null;
    const topIntention = IntentionEngine.listIntentions(db, { project, status: 'dispatched', limit: 1 })[0] || null;
    const latestTrace = DecisionTraceEngine.getLatestTrace(db, project);

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ project, active_goal: topGoal, active_intention: topIntention, latest_trace: latestTrace }, null, 2),
        },
      ],
    };
  }
);

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
          text: JSON.stringify({
            status: 'healthy',
            version: getVersion(),
            timestamp: new Date().toISOString(),
          }, null, 2),
        },
      ],
    };
  }
);

// Register Tools & Prompts
registerAllTools(server);
registerAllPrompts(server);
