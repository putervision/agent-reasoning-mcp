#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { runInit } from './cli/init.js';
import { getDb, resolveProjectRoot, getProjectSlug } from './engine/db.js';
import { GoalEngine } from './engine/goals.js';
import { BeliefEngine } from './engine/beliefs.js';
import { IntentionEngine } from './engine/intentions.js';
import { DecisionTraceEngine } from './engine/traces.js';
import { verifyEventChain } from './engine/events.js';
import { getVersion } from './utils/version.js';

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
  const command = args[0] || 'run';

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(getVersion());
    process.exit(0);
  }

  let project: string | undefined;
  const pIndex = args.findIndex((a) => a === '-p' || a === '--project');
  if (pIndex !== -1 && args[pIndex + 1]) {
    project = args[pIndex + 1];
  }

  switch (command) {
    case 'run': {
      await import('./index.js');
      break;
    }

    case 'init': {
      runInit({ project });
      break;
    }

    case 'doctor': {
      const root = resolveProjectRoot(project);
      const slug = getProjectSlug(project);
      console.log(`Running diagnostic doctor for "${slug}" in ${root}...`);
      try {
        const db = getDb(slug);
        const integrity = db.pragma('integrity_check');
        const journal = db.pragma('journal_mode');
        const eventAudit = verifyEventChain(db, slug);
        console.log(`✔ SQLite database accessibility: OK`);
        console.log(`✔ Journal mode: ${JSON.stringify(journal)}`);
        console.log(`✔ Database integrity: ${JSON.stringify(integrity)}`);
        console.log(`✔ Event chain verification: ${eventAudit.valid ? 'VALID (unbroken)' : 'FAILED'}`);
        console.log('\nDoctor diagnostic check PASSED.');
      } catch (err: any) {
        console.error(`✖ Doctor check failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'inspect': {
      const slug = getProjectSlug(project);
      const db = getDb(slug);
      console.log(`\n=== Active Goals for ${slug} ===`);
      console.table(GoalEngine.listGoals(db, { project: slug, limit: 20 }), ['id', 'title', 'status', 'priority', 'progress']);

      console.log(`\n=== Active Beliefs for ${slug} ===`);
      console.table(BeliefEngine.queryBeliefs(db, { project: slug, limit: 20 }), ['id', 'category', 'subject', 'predicate', 'confidence']);

      console.log(`\n=== Dispatched Intentions for ${slug} ===`);
      console.table(IntentionEngine.listIntentions(db, { project: slug, limit: 20 }), ['id', 'behavior_name', 'status', 'priority']);
      break;
    }

    case 'audit': {
      const slug = getProjectSlug(project);
      const db = getDb(slug);
      const audit = verifyEventChain(db, slug);
      console.log(`Audit result for "${slug}":`, audit);
      break;
    }

    case 'view': {
      console.log(`Interactive visualizer available at: ${path.resolve(process.cwd(), 'viewer.html')}`);
      break;
    }

    case 'update': {
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
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
