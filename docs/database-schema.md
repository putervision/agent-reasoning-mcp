# SQLite Database Schema: `@putervision/agent-reasoning-mcp`

`@putervision/agent-reasoning-mcp` stores all reasoning state in a local SQLite database (`.agent-reasoning-mcp/<project-slug>/reasoning.db`) with WAL (Write-Ahead Logging) and strict foreign key constraints.

---

## Tables

### 1. `goals`
Hierarchical goals, priorities, completion progress, and success criteria.

```sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  session_id TEXT,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority REAL NOT NULL DEFAULT 0.5,
  utility_weights_json TEXT,
  deadline_at TEXT,
  progress REAL NOT NULL DEFAULT 0.0,
  success_criteria_json TEXT,
  failure_reason TEXT,
  metadata_json TEXT,
  client_request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (parent_id) REFERENCES goals(id) ON DELETE SET NULL
);
```

### 2. `beliefs`
Belief state repository with exponential confidence decay tracking.

```sql
CREATE TABLE beliefs (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  session_id TEXT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'observation',
  source_id TEXT,
  expires_at TEXT,
  decay_rate REAL NOT NULL DEFAULT 0.05,
  last_decayed_at TEXT,
  client_request_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 3. `decision_traces`
Decision rationale ledger, candidate action rankings, and latency metrics.

```sql
CREATE TABLE decision_traces (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  session_id TEXT,
  goal_id TEXT,
  situation_summary TEXT NOT NULL,
  candidate_actions_json TEXT NOT NULL,
  utility_profile TEXT NOT NULL,
  chosen_action TEXT NOT NULL,
  reasoning_chain_json TEXT NOT NULL,
  risk_assessment_json TEXT,
  outcome TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
);
```

### 4. `utility_profiles`
Configurable personality profiles and multi-attribute weight distributions.

```sql
CREATE TABLE utility_profiles (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  weights_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project, name)
);
```

### 5. `intentions`
Executable action directives queue for dispatching to runtime execution engines.

```sql
CREATE TABLE intentions (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  trace_id TEXT,
  session_id TEXT,
  behavior_name TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  priority REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending',
  deadline_at TEXT,
  abort_conditions_json TEXT,
  result_json TEXT,
  client_request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES decision_traces(id) ON DELETE SET NULL
);
```

### 6. `knowledge_patterns`
Learned heuristics, optimizations, and decision anti-patterns.

```sql
CREATE TABLE knowledge_patterns (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  context_tags_json TEXT NOT NULL,
  situation_pattern TEXT NOT NULL,
  recommended_strategy TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  sample_count INTEGER NOT NULL DEFAULT 1,
  success_rate REAL NOT NULL DEFAULT 1.0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7. `events`
Append-only SHA-256 Merkle event ledger.

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);
```
