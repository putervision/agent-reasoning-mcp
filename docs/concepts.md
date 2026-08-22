# Core Concepts: agent-reasoning-mcp

## Belief-Desire-Intention (BDI) Architecture
1. **Beliefs**: What the agent knows about the world (with uncertainty and decay).
2. **Desires (Goals)**: What the agent wants to accomplish (hierarchical DAGs).
3. **Intentions**: What the agent has committed to execute right now.

## Multi-Attribute Expected Utility Theory
Actions are scored against active utility weights:
$$E[U] = \sum_{i} w_i \cdot u_i$$
Where $w_i$ represents agent profile priorities (Aggression, Caution, Greed, etc.).
