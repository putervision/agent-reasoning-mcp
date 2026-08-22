# @putervision/agent-reasoning-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/agent-reasoning-mcp.svg)](https://www.npmjs.com/package/@putervision/agent-reasoning-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18.18.0-brightgreen.svg)](https://nodejs.org)

> Strategic BDI Reasoning & Decision Intelligence Engine for Autonomous AI Agents

`@putervision/agent-reasoning-mcp` is a formal Model Context Protocol (MCP) server that provides strategic belief-desire-intention (BDI) reasoning, hierarchical goal decomposition, multi-attribute expected utility calculation, exponential belief decay, quantitative risk evaluation, and reactive replanning.

> **PuterVision Research Posture**: *Functional agency and closed-loop automation — not consciousness, sentience, or AGI.*

---

## ⚡ Quick Start

```bash
# Initialize in your agent workspace
npx @putervision/agent-reasoning-mcp init

# Run health diagnostics
npx @putervision/agent-reasoning-mcp doctor

# Inspect active goals and beliefs
npx @putervision/agent-reasoning-mcp inspect
```

---

## 🛠️ Consolidated MCP Tools (10 Tools)

| Tool | Actions | Description |
|------|---------|-------------|
| `set_goal` | `create`, `update`, `decompose`, `get`, `list`, `abandon` | Manage goal hierarchy and task DAGs |
| `evaluate_situation` | `snapshot`, `quick` | Score candidate actions from environment snapshots |
| `replan` | `blocker`, `event`, `full` | Adaptively reconstruct subgoals upon obstacles |
| `assess_risk` | `action`, `plan`, `compare` | Quantitative threat and risk calculation |
| `query_knowledge` | `search`, `patterns`, `similar_situations` | Search learned heuristics and past decision patterns |
| `set_utility_weights` | `configure`, `get`, `list`, `activate` | Configure utility weights (aggression, caution, greed, exploration) |
| `get_decision_trace` | `latest`, `get`, `list`, `explain` | Explainable chain-of-thought rationale playback |
| `manage_beliefs` | `update`, `query`, `expire`, `reconcile` | Structured belief state with exponential confidence decay |
| `manage_intentions` | `create`, `dispatch`, `get`, `list`, `cancel`, `resolve` | Wire contract directives queue for runtime execution |
| `manage_reasoning_db` | `backup`, `stats`, `audit`, `snapshot`, `diff`, `restore` | Snapshots, diagnostics, and SHA-256 Merkle audit verification |

---

## 🏛️ Ecosystem Integration

Participates in the **PuterVision Pentad**:
- **`agent-reasoning-mcp`**: Decides *what* to do (BDI, Utility, Replanning)
- **`behavior-runtime-mcp`**: Acts at ~60Hz in browser runtimes
- **`state-memory-mcp`**: Durable workflow memory, tasks, decisions
- **`vision-memory-mcp`**: Visual caching and element grounding
- **`world-model-mcp`**: 3D/2D spatial layout and simulation

---

## 📄 License
MIT © PuterVision
