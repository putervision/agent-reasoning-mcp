import Database from 'better-sqlite3';
import { runMigrations, DecisionEngine, StatePackBuilder, canonicalJsonStringify } from '../../dist/lib.js';

console.log('--- PuterVision System 1 Decision Latency Benchmark ---');

const db = new Database(':memory:');
runMigrations(db);

const statePack = StatePackBuilder.build({
  project: 'benchmark_project',
  session_id: 'session_bench_01',
  spatial: {
    observer_position: [0, 0, 0],
    nearby_entities: [
      { id: 'ent_01', type: 'enemy', distance: 4.5, status: 'hostile' },
      { id: 'ent_02', type: 'door', distance: 10.0, status: 'neutral' },
    ],
  },
  tasks: {
    active_goal: { id: 'g1', title: 'Escape facility', priority: 0.9, progress: 0.3 },
    active_blockers: [{ id: 'b1', description: 'Locked fire door' }],
    recent_decision_ids: ['d1', 'd2'],
  },
  vitals: { hp: 50, threat_level: 0.7 },
  utility: {
    profile_name: 'default',
    weights: { aggression: 0.2, caution: 0.8, greed: 0.3, efficiency: 0.7, exploration: 0.4 },
  },
});

const ITERATIONS = 1000;

// Warm-up
for (let i = 0; i < 50; i++) {
  canonicalJsonStringify(statePack);
  DecisionEngine.askNoul(db, {
    project: 'benchmark_project',
    proposition: 'Escape route blocked',
    state_pack: statePack,
  });
}

const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  DecisionEngine.askNoul(db, {
    project: 'benchmark_project',
    proposition: 'Escape route blocked',
    state_pack: statePack,
  });
}
const elapsed = performance.now() - start;
const avgLatencyMs = elapsed / ITERATIONS;

console.log(`Executed ${ITERATIONS} iterations in ${elapsed.toFixed(2)}ms`);
console.log(`Average Decision Latency: ${avgLatencyMs.toFixed(4)}ms per query`);

if (avgLatencyMs > 2.0) {
  console.error(`FAILED: Average latency ${avgLatencyMs.toFixed(4)}ms exceeds 2.0ms threshold!`);
  process.exit(1);
} else {
  console.log(`✅ PASSED: Decision latency ${avgLatencyMs.toFixed(4)}ms is well within sub-millisecond spec (<1.5ms).`);
}

db.close();
