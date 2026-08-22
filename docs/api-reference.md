# API Reference: agent-reasoning-mcp

Complete reference for all 10 MCP tools exposed by `@putervision/agent-reasoning-mcp`.

## 1. `set_goal`
Manage hierarchical goals and task DAGs.
- `action: "create"`: Register new goal objective.
- `action: "decompose"`: Breakdown parent goal into child subgoals.
- `action: "update"`: Update goal status, progress, or priority.
- `action: "get"`: Retrieve goal by ID.
- `action: "list"`: List goals with status and parent_id filters.
- `action: "abandon"`: Mark goal abandoned with failure reason.

## 2. `evaluate_situation`
Score multi-modal environment snapshots against active utility weights.
- `action: "snapshot"`: Evaluate normalized `SituationSnapshot` (world, vision, state, vitals).
- `action: "quick"`: Rapid text-context evaluation.

## 3. `replan`
Adaptively reconstruct subgoal DAG upon unexpected obstacles.
- `action: "blocker"`: Generate contingency subgoals and abort invalidated intentions.
- `action: "event"`: Replan based on external trigger event.
- `action: "full"`: Complete plan overhaul.

## 4. `assess_risk`
Quantitative threat and risk assessment for candidate actions.
- `action: "action"`: Single action threat score.
- `action: "compare"`: Multi-action risk comparison.

## 5. `query_knowledge`
Search learned heuristics and tactics by context tags and query strings.

## 6. `set_utility_weights`
Configure utility profiles (Aggression, Caution, Greed, Exploration, Efficiency, Cooperation).

## 7. `get_decision_trace`
Retrieve explainable step-by-step chain-of-thought rationale for decisions.

## 8. `manage_beliefs`
Maintain structured belief state with exponential confidence decay ($C(t) = C_0 \cdot e^{-\lambda t}$).

## 9. `manage_intentions`
Queue, dispatch, and track behavior directives (wire contract) for behavior-runtime-mcp.

## 10. `manage_reasoning_db`
Database backups, statistics, SHA-256 Merkle audit verification, and snapshot save/restore.
