# Agent Instructions for agent-reasoning-mcp

This project uses `@putervision/agent-reasoning-mcp` for strategic BDI reasoning.

## Mandatory Workflow
1. **Goals**: Call `set_goal(create)` before beginning complex work.
2. **Evaluation**: Call `evaluate_situation(snapshot)` to score trade-offs against active utility weights.
3. **Intentions**: Dispatch execution directives with `manage_intentions(create)` for runtime execution.
4. **Replanning**: If blocked, call `replan(blocker)` to generate fallback DAGs.
