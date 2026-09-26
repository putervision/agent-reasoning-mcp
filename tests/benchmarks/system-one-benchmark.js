import Database from 'better-sqlite3';
import {
  runMigrations,
  DecisionEngine,
  IntentionGateEngine,
  StatePackBuilder,
  globalDecisionCache,
} from '../../dist/lib.js';

console.log('================================================================');
console.log('   PuterVision "System 1" Fast Decision Benchmark              ');
console.log('================================================================\n');

const db = new Database(':memory:');
runMigrations(db);

const statePack = StatePackBuilder.build({
  project: 'benchmark_project',
  session_id: 'session_jev_bench',
  spatial: {
    observer_position: [0, 0, 0],
    nearby_entities: [
      { id: 'ent_01', type: 'enemy', distance: 3.2, status: 'hostile' },
      { id: 'ent_02', type: 'obstacle', distance: 1.5, status: 'neutral' },
      { id: 'ent_03', type: 'door', distance: 7.0, status: 'neutral' },
    ],
  },
  tasks: {
    active_goal: { id: 'g1', title: 'Navigate to target room', priority: 0.9, progress: 0.4 },
    active_blockers: [{ id: 'b1', description: 'Locked blast door' }],
    recent_decision_ids: ['d1', 'd2'],
  },
  vitals: { hp: 45, threat_level: 0.8 },
  utility: {
    profile_name: 'tactical_survival',
    weights: { aggression: 0.1, caution: 0.9, greed: 0.2, efficiency: 0.8, exploration: 0.3 },
  },
});

function calculatePercentiles(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p = (pct) => {
    const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
    return sorted[idx];
  };
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    mean: sum / sorted.length,
    p50: p(50),
    p95: p(95),
    p99: p(99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function benchmarkTool(name, slaLimitMs, runFn, iterations = 1000) {
  // 1. Cold run (without L1 memory cache)
  const coldLatencies = [];
  for (let i = 0; i < 100; i++) {
    globalDecisionCache.clear();
    const t0 = performance.now();
    runFn();
    const t1 = performance.now();
    coldLatencies.push(t1 - t0);
  }
  const coldStats = calculatePercentiles(coldLatencies);

  // 2. Warm up L1 cache
  runFn();

  // 3. Hot L1 Cache run
  const hotLatencies = [];
  const startHot = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    runFn();
    const t1 = performance.now();
    hotLatencies.push(t1 - t0);
  }
  const totalHotTime = performance.now() - startHot;
  const hotStats = calculatePercentiles(hotLatencies);
  const throughput = Math.round((iterations / (totalHotTime / 1000)));

  const speedup = (coldStats.mean / hotStats.mean).toFixed(1);
  const status = hotStats.p95 <= slaLimitMs ? 'PASSED' : 'FAILED';

  console.log(`▶ Tool: [${name}] (Target: <${slaLimitMs}ms)`);
  console.log(`  • Cold Evaluation : mean=${coldStats.mean.toFixed(4)}ms (p50=${coldStats.p50.toFixed(4)}ms, p95=${coldStats.p95.toFixed(4)}ms)`);
  console.log(`  • L1 Cache Query  : mean=${hotStats.mean.toFixed(4)}ms (p50=${hotStats.p50.toFixed(4)}ms, p95=${hotStats.p95.toFixed(4)}ms)`);
  console.log(`  • Throughput      : ${throughput.toLocaleString()} ops/sec (Speedup: ${speedup}x)`);
  console.log(`  • Status          : [${status}] (hot p95 ${hotStats.p95.toFixed(4)}ms <= ${slaLimitMs}ms SLA)\n`);

  return {
    name,
    slaLimitMs,
    coldMean: coldStats.mean,
    hotMean: hotStats.mean,
    hotP50: hotStats.p50,
    hotP95: hotStats.p95,
    throughput,
    speedup,
  };
}

const results = [];

// 1. ask_noul
results.push(
  benchmarkTool('ask_noul', 2.0, () => {
    DecisionEngine.askNoul(db, {
      project: 'benchmark_project',
      proposition: 'Threat is imminent within 5 meters',
      state_pack: statePack,
    });
  })
);

// 2. classify
results.push(
  benchmarkTool('classify', 2.0, () => {
    DecisionEngine.classify(db, {
      project: 'benchmark_project',
      target_type: 'entity',
      target_id: 'ent_01',
      classes: ['threat', 'neutral', 'friendly', 'critical_danger'],
      state_pack: statePack,
    });
  })
);

// 3. ask_choice
results.push(
  benchmarkTool('ask_choice', 2.0, () => {
    DecisionEngine.askChoice(db, {
      project: 'benchmark_project',
      prompt: 'Select next immediate action',
      options: [
        { id: 'opt_evade', text: 'Evade hostile entity and seek cover' },
        { id: 'opt_engage', text: 'Engage enemy with lethal force' },
        { id: 'opt_wait', text: 'Wait and observe enemy movement' },
      ],
      state_pack: statePack,
    });
  })
);

// 4. ask_score
results.push(
  benchmarkTool('ask_score', 2.0, () => {
    DecisionEngine.askScore(db, {
      project: 'benchmark_project',
      target: 'ent_01',
      metric: 'threat_level',
      scale: [0, 100],
      state_pack: statePack,
    });
  })
);

// 5. gate_intention
results.push(
  benchmarkTool('gate_intention', 1.0, () => {
    IntentionGateEngine.evaluateAndGate(db, {
      project: 'benchmark_project',
      proposed_action: {
        behavior_name: 'move_to_cover',
        parameters: { target: 'room_102' },
      },
      state_pack: statePack,
    });
  })
);

console.log('================================================================');
console.log('                     BENCHMARK SUMMARY                          ');
console.log('================================================================');
console.table(
  results.map((r) => ({
    'Tool': r.name,
    'SLA (ms)': `<${r.slaLimitMs}`,
    'Cold Latency': `${r.coldMean.toFixed(4)} ms`,
    'L1 Cache (p50)': `${r.hotP50.toFixed(4)} ms`,
    'L1 Cache (p95)': `${r.hotP95.toFixed(4)} ms`,
    'Throughput (ops/s)': `${r.throughput.toLocaleString()}`,
    'L1 Speedup': `${r.speedup}x`,
  }))
);

db.close();
