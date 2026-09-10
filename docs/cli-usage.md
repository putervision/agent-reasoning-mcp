# CLI Usage Guide: `@putervision/agent-reasoning-mcp`

`@putervision/agent-reasoning-mcp` includes a command-line interface for local workspace initialization, health checks, and database management.

---

## Commands Overview

### `agent-reasoning-mcp init`
Initializes `agent-reasoning-mcp` in the current project directory.
- Creates local `.agent-reasoning-mcp/<project-slug>/` database directory.
- Updates `.gitignore` to prevent committing SQLite WAL files.
- Seeds default utility profiles (`balanced`, `cautious`, `aggressive`, `explorer`).
- Scaffolds agent instructions (`.agents/AGENTS.md`, `CLAUDE.md`, `.windsurfrules`).
- Scaffolds MCP configurations (`.cursor/mcp.json`, `.vscode/mcp.json`).

```bash
agent-reasoning-mcp init
```

### `agent-reasoning-mcp init-global`
Re-initializes `agent-reasoning-mcp` across all projects registered in the global workspace registry (`~/.agent-reasoning-mcp/projects.json`).

```bash
agent-reasoning-mcp init-global
```

### `agent-reasoning-mcp doctor`
Runs comprehensive environment diagnostic checks on the local project:
- Node.js runtime compatibility.
- SQLite WAL database health.
- Cryptographic SHA-256 Merkle event ledger integrity.

```bash
agent-reasoning-mcp doctor
```

### `agent-reasoning-mcp doctor-global`
Runs doctor health diagnostics across all registered projects in the global registry.

```bash
agent-reasoning-mcp doctor-global
```

### `agent-reasoning-mcp inspect`
Outputs active strategic goals, intention queues, and current belief state in a formatted terminal table.

```bash
agent-reasoning-mcp inspect
```

### `agent-reasoning-mcp run`
Starts the stdio Model Context Protocol (MCP) server for integration with Cursor, Claude Code, VS Code, Gemini, or custom agent frameworks.

```bash
agent-reasoning-mcp run
```
