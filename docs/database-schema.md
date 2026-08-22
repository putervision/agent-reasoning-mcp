# Database Schema: agent-reasoning-mcp

`reasoning.db` is an embedded SQLite database operating in WAL mode with normalized tables:
- `goals`: Hierarchical goal DAGs and progress tracking.
- `beliefs`: Structured belief states with exponential confidence decay.
- `decision_traces`: Explainable chain-of-thought decision logs.
- `utility_profiles`: Active scoring weights.
- `intentions`: Dispatched execution directives.
- `knowledge_patterns`: Learned heuristics and tactics.
- `events`: Cryptographic SHA-256 Merkle audit log.
- `snapshots`: Point-in-time state checkpoints.
