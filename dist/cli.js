#!/usr/bin/env node
import {
  BeliefEngine,
  GoalEngine,
  IntentionEngine,
  getDb,
  getProjectSlug,
  getVersion,
  registerProject,
  resolveProjectRoot,
  verifyEventChain
} from "./chunk-FB4TIUGM.js";

// src/cli.ts
import path2 from "path";

// src/cli/init.ts
import * as fs from "fs";
import * as path from "path";

// src/cli/templates.ts
function getAgentsMdTemplate() {
  return `<!-- agent-reasoning-mcp:start -->
# Strategic Agent Reasoning (agent-reasoning-mcp)

This project uses \`agent-reasoning-mcp\` to manage goals, decompose complex tasks, evaluate situational trade-offs, and track decision rationale.

## Mandatory Reasoning Workflow
1. **Start of planning**: Call \`set_goal(action: "create", title: "...")\` to establish high-level objectives.
2. **Decomposition**: Call \`set_goal(action: "decompose", parent_id: "...", subgoals: [...])\` to break down into actionable steps.
3. **Situational Trade-offs**: Call \`evaluate_situation(action: "snapshot", snapshot: {...})\` before selecting high-stakes actions.
4. **Utility Configuration**: Tune agent priorities with \`set_utility_weights(action: "configure", weights: {...})\`.
5. **Intention Dispatch**: Create execution directives with \`manage_intentions(action: "create", ...)\` for the runtime engine.
6. **Reactive Replanning**: If an unexpected blocker occurs, invoke \`replan(action: "blocker", goal_id: "...", blocker_description: "...")\`.

## 10 Core MCP Tools
- \`set_goal\`: Manage goal hierarchy and task DAGs.
- \`evaluate_situation\`: Score and rank candidate actions from environment snapshots.
- \`replan\`: Adaptively reconstruct subgoals upon obstacles.
- \`assess_risk\`: Quantitative threat and risk calculation.
- \`query_knowledge\`: Search heuristics and past decision patterns.
- \`set_utility_weights\`: Configure utility weights (aggression, caution, greed, exploration).
- \`get_decision_trace\`: Explainable chain-of-thought rationale playback.
- \`manage_beliefs\`: Structured belief state with exponential confidence decay.
- \`manage_intentions\`: Wire contract directives queue for runtime execution.
- \`manage_reasoning_db\`: Snapshots, diagnostics, and SHA-256 Merkle audit verification.
<!-- agent-reasoning-mcp:end -->
`;
}

// src/cli/init.ts
function upsertInstructionBlock(content, newBlock, startMarker = "<!-- agent-reasoning-mcp:start -->", endMarker = "<!-- agent-reasoning-mcp:end -->") {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + endMarker.length);
    const existingBlock = content.substring(startIndex, endIndex + endMarker.length);
    if (existingBlock.trim() === newBlock.trim()) {
      return { updatedContent: content, status: "unchanged" };
    }
    return { updatedContent: `${before}${newBlock.trim()}${after}`, status: "updated" };
  }
  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return { updatedContent: `${content}${separator}${newBlock.trim()}
`, status: "appended" };
}
function runInit(options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = resolveProjectRoot(options.project, cwd);
  const slug = getProjectSlug(options.project, cwd);
  console.log(`Initializing agent-reasoning-mcp in: ${root} (project slug: ${slug})`);
  registerProject(slug, root);
  const db = getDb(slug, root);
  console.log("\u2714 SQLite reasoning database initialized with WAL mode.");
  const agentsPath = path.join(root, ".agents", "AGENTS.md");
  const dir = path.dirname(agentsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existingContent = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf-8") : "";
  const result = upsertInstructionBlock(existingContent, getAgentsMdTemplate());
  fs.writeFileSync(agentsPath, result.updatedContent, "utf-8");
  console.log(`\u2714 Agent instructions ${result.status} in ${agentsPath}`);
  console.log("\nagent-reasoning-mcp initialization complete!");
}

// src/cli.ts
function showHelp() {
  console.log(`
agent-reasoning-mcp CLI Tool v${getVersion()}

Usage:
  agent-reasoning-mcp <command> [options]

Commands:
  run                Start the MCP server on stdio transport (Default)
  init               Scaffold the workspace, database, and IDE agent rules
  doctor             Run environment and database health checks
  inspect            Display tables of goals, beliefs, intentions, and traces
  audit              Audit cryptographic SHA-256 event ledger hash chain
  view               Open interactive reasoning visualizer (viewer.html)
  update             Check npm registry for package updates

Options:
  -p, --project      Target specific project slug
  -v, --version      Show version number
  -h, --help         Show this help menu
`);
}
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "run";
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(getVersion());
    process.exit(0);
  }
  let project;
  const pIndex = args.findIndex((a) => a === "-p" || a === "--project");
  if (pIndex !== -1 && args[pIndex + 1]) {
    project = args[pIndex + 1];
  }
  switch (command) {
    case "run": {
      await import("./index.js");
      break;
    }
    case "init": {
      runInit({ project });
      break;
    }
    case "doctor": {
      const root = resolveProjectRoot(project);
      const slug = getProjectSlug(project);
      console.log(`Running diagnostic doctor for "${slug}" in ${root}...`);
      try {
        const db = getDb(slug);
        const integrity = db.pragma("integrity_check");
        const journal = db.pragma("journal_mode");
        const eventAudit = verifyEventChain(db, slug);
        console.log(`\u2714 SQLite database accessibility: OK`);
        console.log(`\u2714 Journal mode: ${JSON.stringify(journal)}`);
        console.log(`\u2714 Database integrity: ${JSON.stringify(integrity)}`);
        console.log(`\u2714 Event chain verification: ${eventAudit.valid ? "VALID (unbroken)" : "FAILED"}`);
        console.log("\nDoctor diagnostic check PASSED.");
      } catch (err) {
        console.error(`\u2716 Doctor check failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }
    case "inspect": {
      const slug = getProjectSlug(project);
      const db = getDb(slug);
      console.log(`
=== Active Goals for ${slug} ===`);
      console.table(GoalEngine.listGoals(db, { project: slug, limit: 20 }), ["id", "title", "status", "priority", "progress"]);
      console.log(`
=== Active Beliefs for ${slug} ===`);
      console.table(BeliefEngine.queryBeliefs(db, { project: slug, limit: 20 }), ["id", "category", "subject", "predicate", "confidence"]);
      console.log(`
=== Dispatched Intentions for ${slug} ===`);
      console.table(IntentionEngine.listIntentions(db, { project: slug, limit: 20 }), ["id", "behavior_name", "status", "priority"]);
      break;
    }
    case "audit": {
      const slug = getProjectSlug(project);
      const db = getDb(slug);
      const audit = verifyEventChain(db, slug);
      console.log(`Audit result for "${slug}":`, audit);
      break;
    }
    case "view": {
      console.log(`Interactive visualizer available at: ${path2.resolve(process.cwd(), "viewer.html")}`);
      break;
    }
    case "update": {
      console.log(`@putervision/agent-reasoning-mcp is up to date (v${getVersion()}).`);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}
main().catch((err) => {
  console.error("Fatal CLI error:", err);
  process.exit(1);
});
//# sourceMappingURL=cli.js.map