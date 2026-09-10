# @putervision/agent-reasoning-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/agent-reasoning-mcp.svg)](https://www.npmjs.com/package/@putervision/agent-reasoning-mcp)
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

## 🛠️ 10 Core MCP Tools

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

- 📖 **[Formal API Reference](docs/api-reference.md)**: Full parameter tables, type definitions, and tool schemas.
- 💡 **[Core Architecture & Concepts](docs/concepts.md)**: BDI model, utility formulation, and belief decay dynamics.
- 🖥️ **[CLI Usage Guide](docs/cli-usage.md)**: Complete CLI command reference (`init`, `doctor`, `inspect`, `run`).
- 💾 **[Database Schema](docs/database-schema.md)**: SQLite table structures, indexes, and Merkle audit ledger.
- ⚙️ **[Configuration Reference](docs/configuration.md)**: `.agent-reasoning-mcp.json` parameters and environment variables.

---

## 🔗 Client Configuration

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:
```json
{
  "mcpServers": {
    "agent-reasoning-mcp": {
      "command": "agent-reasoning-mcp",
      "args": ["run"]
    }
  }
}
```

---

## 🧪 Testing

```bash
# Run full unit and integration test suite across 16 test files (68 tests)
npm test
```

---

## 📄 License
MIT © PuterVision
