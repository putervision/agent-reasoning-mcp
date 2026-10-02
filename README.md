# @putervision/agent-reasoning-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/agent-reasoning-mcp.svg)](https://www.npmjs.com/package/@putervision/agent-reasoning-mcp)
[![version](https://img.shields.io/badge/version-0.4.0-blue.svg)](./CHANGELOG.md)
[![CI](https://github.com/putervision/agent-reasoning-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/putervision/agent-reasoning-mcp/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> **Strategic BDI Reasoning, Multi-Attribute Expected Utility Theory & Decision Intelligence for Autonomous AI Agents**

`@putervision/agent-reasoning-mcp` is a formal Model Context Protocol (MCP) server that provides strategic belief-desire-intention (BDI) reasoning, hierarchical goal decomposition, multi-attribute expected utility calculation (\(E[U] = \sum w_i u_i\)), exponential belief decay, quantitative risk evaluation, and reactive replanning across multi-modal memory bridges.

🌐 **Official Documentation**: [putervision.com](https://putervision.com) • [Interactive Web Docs](docs/index.html)

---

## ⚡ 15-Second Quick Start

```bash
# 1. Initialize reasoning database & seed default utility profiles
npx @putervision/agent-reasoning-mcp init

# 2. Run health diagnostics and Merkle audit checks
npx @putervision/agent-reasoning-mcp doctor

# 3. Inspect active goals, intentions, and belief states
npx @putervision/agent-reasoning-mcp inspect
```

---

## 🛠️ 15 Core MCP Tools

### BDI Strategic Deliberation (10 Tools)

| Tool | Actions | Purpose |
|------|---------|---------|
| `set_goal` | `create`, `update`, `decompose`, `get`, `list`, `abandon` | Manage goal hierarchy, task DAGs, and success criteria |
| `evaluate_situation` | `snapshot`, `quick` | Score and rank candidate actions from environment snapshots |
| `replan` | `blocker`, `event`, `full` | Adaptively reconstruct subgoals upon obstacles and abort stale intentions |
| `assess_risk` | `action`, `plan`, `compare` | Quantitative threat and risk calculation across candidate actions |
| `query_knowledge` | `search`, `patterns`, `similar_situations` | Search learned heuristics, tactical knowledge, and past decision patterns |
| `set_utility_weights` | `configure`, `get`, `list`, `activate` | Configure utility weights (aggression, caution, greed, efficiency, exploration) |
| `get_decision_trace` | `latest`, `get`, `list`, `explain` | Explainable chain-of-thought rationale and latency telemetry |
| `manage_beliefs` | `update`, `query`, `expire`, `reconcile` | Structured belief state with exponential confidence decay ($C = C_0 e^{-\lambda t}$) |
| `manage_intentions` | `create`, `dispatch`, `get`, `list`, `cancel`, `resolve` | Wire contract directives queue for runtime execution engines |
| `manage_reasoning_db` | `stats`, `audit`, `snapshot`, `restore` | Reasoning database statistics, SHA-256 Merkle audit, and snapshot rollback |

### System 1 Fast Decision Layer (5 Tools)

> Inspired by the typed System 1 pattern pioneered by TypeSafe's **Jev** (evaluating typed `Choice`, `Score`, and `Noul` primitives over compact state without token generation), implemented locally via in-memory LRU caches and deterministic heuristics (<2ms) without external API calls.

| Tool | Purpose | Latency Target | L1 Cache (p50) | Throughput |
|------|---------|:---:|:---:|:---:|
| `classify` | Low-latency categorical labeling over multi-modal StatePacks | `<2ms` | **`0.0075 ms`** | **~90,000 ops/s** |
| `ask_noul` | Typed probabilistic hypothesis and Boolean verification ($p \in [0.0, 1.0]$) | `<2ms` | **`0.0049 ms`** | **~127,000 ops/s** |
| `ask_choice` | Discrete $1$-of-$N$ choice selection ($N \le 16$) with probability simplex | `<2ms` | **`0.0138 ms`** | **~64,000 ops/s** |
| `ask_score` | Bounded numeric scalar scoring and calibrated utility rating | `<2ms` | **`0.0057 ms`** | **~129,000 ops/s** |
| `gate_intention` | Pre-dispatch blast-radius audit gate issuing signed HMAC dispatch tokens | `<1ms` | **`0.0709 ms`** | **~12,000 ops/s** |

> See **[docs/benchmarks.md](docs/benchmarks.md)** for full benchmark reproduction commands, latency percentiles (p50/p95/p99), and multi-tier caching architecture details.

---

## 🏛️ PuterVision Pentad Multi-Modal Ecosystem

`agent-reasoning-mcp` coordinates the closed-loop **PuterVision Super-Loop**:
- 🧠 **`agent-reasoning-mcp`**: Decides *what* to do (BDI Strategic Reasoning, Utility Theory, Replanning)
- ⚡ **`behavior-mcp`**: Executes *how* to act at ~60Hz in browser runtimes
- 📊 **`state-memory-mcp`**: Durable workflow memory, tasks, blockers, decisions
- 👁️ **`vision-memory-mcp`**: Perceptual caching, visual grounding, video timelines
- 🌐 **`world-model-mcp`**: 3D/2D spatial layout, entity permanence, collision simulation

---

## 📚 Deep Documentation Guides

- 📖 **[Formal API Reference](docs/api-reference.md)**: Full parameter tables, type definitions, and tool schemas for all 15 tools.
- 🚀 **[Performance Benchmarks](docs/benchmarks.md)**: Empirical throughput and microsecond latency metrics across all 5 System 1 tools.
- 💡 **[Core Architecture & Concepts](docs/concepts.md)**: BDI model, utility formulation, and belief decay dynamics.
- 🖥️ **[CLI Usage Guide](docs/cli-usage.md)**: Complete CLI command reference (`init`, `doctor`, `inspect`, `run`).
- 💾 **[Database Schema](docs/database-schema.md)**: SQLite table structures, indexes, and Merkle audit ledger.
- ⚙️ **[Configuration Reference](docs/configuration.md)**: `.agent-reasoning-mcp.json` parameters and environment variables.

---

## 🔗 Client Configuration & Environment

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:
```json
{
  "mcpServers": {
    "agent-reasoning-mcp": {
      "command": "agent-reasoning-mcp",
      "args": ["run"],
      "env": {
        "PENTAD_HMAC_SECRET": "your-secure-shared-secret-here",
        "DISPATCH_TOKEN_TTL_MS": "30000"
      }
    }
  }
}
```

### Key Environment Variables
* `PENTAD_HMAC_SECRET`: 256-bit shared key for cryptographic intention dispatch token signing.
* `DISPATCH_TOKEN_TTL_MS`: Dispatch token expiration window (default: 30,000ms).
* `SKIP_MODEL_LOAD`: Set to `1` (or `OFFLINE=1`) to force air-gapped L1/L2 deterministic evaluation.

---

## 🧪 Testing & Benchmarks

```bash
# Run full unit and integration test suites
npm test

# Run System 1 fast decision layer benchmark suite (throughput & latency percentiles)
npm run benchmark

# Run air-gapped verification
OFFLINE=1 SKIP_MODEL_LOAD=1 npm test
```

---

## 📄 License
MIT © PuterVision
