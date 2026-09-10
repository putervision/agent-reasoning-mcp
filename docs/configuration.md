# Configuration Guide: `@putervision/agent-reasoning-mcp`

`@putervision/agent-reasoning-mcp` can be customized via `.agent-reasoning-mcp.json` in your project root or via environment variables.

---

## Configuration File (`.agent-reasoning-mcp.json`)

```json
{
  "projectName": "my-agent-workspace",
  "activeProfile": "balanced",
  "beliefDecayRate": 0.05,
  "maxGoalsDepth": 5,
  "busyTimeoutMs": 5000,
  "mmapSizeBytes": 134217728,
  "accessMode": "normal"
}
```

### Options Reference
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectName` | `string` | auto-detected | Slug identifier for project database isolation |
| `activeProfile` | `string` | `"balanced"` | Default active utility profile name |
| `beliefDecayRate` | `number` | `0.05` | Exponential decay constant \(\lambda\) for belief confidence |
| `maxGoalsDepth` | `number` | `5` | Maximum allowable depth for subgoal hierarchy decomposition |
| `busyTimeoutMs` | `number` | `5000` | SQLite WAL busy timeout in milliseconds |
| `mmapSizeBytes` | `number` | `134217728` | Memory-mapped I/O size (128 MB default) |
| `accessMode` | `enum` | `"normal"` | Set to `"read_only"` for query-only analysis |

---

## Environment Variables
- `REASONING_PROJECT`: Override target project slug.
- `REASONING_LOG_LEVEL`: Set log level (`debug`, `info`, `warn`, `error`).
- `REASONING_MCP_DIR`: Custom directory for SQLite database storage.
