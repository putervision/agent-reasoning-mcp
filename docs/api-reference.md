# API Reference: `@putervision/agent-reasoning-mcp`

Comprehensive documentation for all 10 MCP tools provided by `@putervision/agent-reasoning-mcp`.

---

## 1. `set_goal`
Manage strategic goals, hierarchical goal decomposition, and DAG execution state.

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("create", "update", "decompose", "get", "list", "abandon") | Yes | Goal lifecycle operation |
| `id` | `string` | No | Target goal identifier |
| `parent_id` | `string` | No | Parent goal ID for hierarchical decomposition |
| `title` | `string` | No | Short descriptive title of the goal objective |
| `description` | `string` | No | Detailed explanation of goal requirements |
| `priority` | `number` | No | Goal priority weight (0.0 to 1.0) |
| `progress` | `number` | No | Completion ratio (0.0 to 1.0) |
| `subgoals` | `array` | No | Array of subgoal objects when decomposing |
| `project` | `string` | No | Target project slug |

---

## 2. `evaluate_situation`
Score and rank candidate actions from environment snapshots using multi-attribute expected utility theory (\(E[U] = \sum w_i u_i\)).

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("snapshot", "quick") | Yes | Evaluation scope |
| `snapshot` | `object` | No | Full multi-modal snapshot (world, vision, state, vitals) |
| `quick_context` | `string` | No | Plain text context summary for rapid ranking |
| `candidate_actions` | `array` | No | Array of candidate actions to score |
| `utility_profile` | `string` | No | Target personality profile to evaluate against |
| `project` | `string` | No | Target project slug |

---

## 3. `replan`
Adaptively reconstruct subgoals upon obstacles and abort stale intentions.

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("blocker", "event", "full") | Yes | Replanning trigger type |
| `goal_id` | `string` | Yes | Target goal identifier to replan |
| `blocker_description` | `string` | No | Description of unexpected obstacle |
| `trigger_event` | `string` | No | Event description causing replan |
| `preserve_completed` | `boolean` | No | Whether to keep completed subgoals (defaults to true) |
| `project` | `string` | No | Target project slug |

---

## 4. `assess_risk`
Quantitative threat and opportunity analysis for proposed action plans.

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("action", "plan", "compare") | Yes | Risk assessment mode |
| `candidate_action` | `string` | No | Single action name to assess |
| `candidate_actions` | `array` | No | Multiple actions for comparative risk scoring |
| `situation_context` | `any` | No | Environmental threat context |
| `project` | `string` | No | Target project slug |

---

## 5. `query_knowledge`
Search learned heuristics, tactical knowledge, and past decision patterns.

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("search", "patterns", "similar_situations") | Yes | Search mode |
| `query` | `string` | No | Keyword or text query for heuristic matching |
| `pattern_type` | `enum` ("heuristic", "anti_pattern", "optimization", "contingency") | No | Pattern type filter |
| `limit` | `number` | No | Max patterns to return |
| `project` | `string` | No | Target project slug |

---

## 6. `set_utility_weights`
Configure utility weights (aggression, caution, greed, efficiency, exploration, cooperation).

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("configure", "get", "list", "activate") | Yes | Profile operation |
| `name` | `string` | No | Profile name |
| `weights` | `record<string, number>` | No | Attribute weight dictionary |
| `is_active` | `boolean` | No | Whether to activate this profile globally |
| `project` | `string` | No | Target project slug |

---

## 7. `get_decision_trace`
Retrieve explainable chain-of-thought rationale, candidate rankings, and latency telemetry.

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("latest", "get", "list", "explain") | Yes | Trace query action |
| `trace_id` | `string` | No | Specific decision trace ID |
| `goal_id` | `string` | No | Filter traces by goal ID |
| `limit` | `number` | No | Max traces to return |
| `project` | `string` | No | Target project slug |

---

## 8. `manage_beliefs`
Structured belief state management with exponential confidence decay (\(C(t) = C_0 e^{-\lambda t}\)).

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("update", "query", "expire", "reconcile") | Yes | Belief state operation |
| `category` | `enum` ("spatial", "entity", "state", "rule", "social") | No | Belief category |
| `subject` | `string` | No | Entity or concept subject |
| `predicate` | `string` | No | Relation or property predicate |
| `object` | `any` | No | Stored object data |
| `confidence` | `number` | No | Initial confidence score (0.0 to 1.0) |
| `project` | `string` | No | Target project slug |

---

## 9. `manage_intentions`
Wire contract directives queue for dispatching to runtime execution engines.

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("create", "dispatch", "get", "list", "cancel", "resolve") | Yes | Intention lifecycle action |
| `goal_id` | `string` | No | Originating goal identifier |
| `behavior_name` | `string` | No | Behavior tree name to trigger |
| `priority` | `number` | No | Execution priority |
| `intention_id` | `string` | No | Intention instance ID |
| `project` | `string` | No | Target project slug |

---

## 10. `manage_reasoning_db`
Reasoning database statistics, SHA-256 Merkle audit verification, and snapshot rollback.

### Parameters
| Name | Type | Required | Description |
|------|------|:---:|-------------|
| `action` | `enum` ("stats", "audit", "snapshot", "diff", "restore") | Yes | Database maintenance action |
| `name` | `string` | No | Snapshot name |
| `description` | `string` | No | Snapshot description |
| `project` | `string` | No | Target project slug |
