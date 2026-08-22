# Configuration: agent-reasoning-mcp

Configurable via `.agent-reasoning-mcp.json` or environment variables:
- `REASONING_LOG_LEVEL`: `debug`, `info`, `warn`, `error` (default: `info`)
- `REASONING_BUSY_TIMEOUT_MS`: SQLite lock timeout (default: `5000`)
- `REASONING_MMAP_SIZE_BYTES`: Memory-mapped I/O size (default: `134217728` / 128MB)
- `REASONING_BELIEF_DECAY_RATE`: Default lambda per hour (default: `0.05`)
- `REASONING_SPATIAL_TTL_MS`: Spatial belief TTL (default: `300000` / 5m)
