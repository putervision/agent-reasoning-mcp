# 🚀 Migration Guide: @putervision/agent-reasoning-mcp

This guide explains how to migrate client integrations, custom agents, and tool callers to the unified **v0.2.0+ API** with native transport, bounded lookahead evaluation, and canonical resources.

---

## ⚡️ Key Architecture Updates

### 1. Zero-Dependency Native Transport (`PV_NATIVE_TRANSPORT=1`)
You can run `agent-reasoning-mcp` with zero dependency on `@modelcontextprotocol/sdk` and `zod` by setting `PV_NATIVE_TRANSPORT=1`:

```json
{
  "mcpServers": {
    "agent-reasoning": {
      "command": "node",
      "args": ["/path/to/agent-reasoning-mcp/dist/index.js"],
      "env": {
        "PV_NATIVE_TRANSPORT": "1"
      }
    }
  }
}
```

- Sub-millisecond JSON-RPC 2.0 framing directly on Node.js `readline`.
- Dynamic protocol version negotiation (supports `2024-11-05` and newer).
- Per-request AbortController cancellation via `notifications/cancelled`.

### 2. Mandatory `project` Slug Validation
All tools requiring persistent reasoning state now strictly require a non-empty `project` parameter.
- Missing or empty `project` values immediately return JSON-RPC Error `-32602` (`Invalid params: "project" parameter is required`).
- Cross-project contamination is prevented by strict database file partitioning.

### 3. Canonical Tool Documentation Resources (`pv://docs/...`)
Tool documentation and schemas can now be inspected directly through MCP resources without loading the full parameter schema into every context window:
- URI template: `pv://docs/{toolName}`
- Individual resources: `pv://docs/set_goal`, `pv://docs/evaluate_situation`, etc.

### 4. Bounded Lookahead Evaluation (`lookahead_depth`)
In `evaluate_situation`, you can now pass `lookahead_depth` (1 to 5) alongside candidate actions to perform multi-step heuristic lookahead:
```typescript
const result = await client.callTool({
  name: "evaluate_situation",
  arguments: {
    project: "my-project",
    snapshot: {
      active_goals: ["goal_1"],
      blockers: [],
      recent_decisions: [],
      candidate_actions: [
        { id: "action_1", description: "Fetch user profile", utility: 0.8 },
        { id: "action_2", description: "Refresh cache", utility: 0.5 }
      ]
    },
    lookahead_depth: 2
  }
});
```
Candidate actions receive discounted heuristic projections ($\gamma = 0.85$ per step) and return ranking along with confidence metrics.
