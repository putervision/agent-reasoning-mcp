# Core Architecture & Concepts: `@putervision/agent-reasoning-mcp`

`@putervision/agent-reasoning-mcp` provides formal BDI (Belief-Desire-Intention) reasoning and multi-attribute expected utility theory for autonomous AI developer agents.

---

## 1. Belief-Desire-Intention (BDI) Architecture

```
                    [ External Perception & Memory ]
                     (World, Vision, State Graphs)
                                   │
                                   ▼
    [ Beliefs: State Knowledge ] ──▶ C(t) = C_0 * e^(-λt)
                                   │
                                   ▼
    [ Desires: Goal DAGs ] ───────▶ Hierarchical Subgoals & Success Criteria
                                   │
                                   ▼
    [ Reasoning & Utility Engine] ─▶ E[U] = Σ w_i * u_i
                                   │
                                   ▼
    [ Intentions Queue ] ─────────▶ Dispatched to Runtime Engines (behavior-mcp)
```

---

## 2. Multi-Attribute Expected Utility Theory
Actions are ranked dynamically across 6 core utility dimensions:
- **Aggression** (\(w_{\text{agg}}\)): Preference for proactive, offensive engagement.
- **Caution** (\(w_{\text{caut}}\)): Weight assigned to risk avoidance and survivability.
- **Greed** (\(w_{\text{greed}}\)): Prioritization of resource harvesting and rewards.
- **Efficiency** (\(w_{\text{eff}}\)): Minimization of steps, time, and token cost.
- **Exploration** (\(w_{\text{expl}}\)): Incentive for discovering unmapped regions or solutions.
- **Cooperation** (\(w_{\text{coop}}\)): Alignment with other agents and user instructions.

The expected utility is computed as:
\[
E[U] = \frac{\sum_{i} w_i \cdot u_i}{\sum_{i} w_i}
\]

---

## 3. Exponential Belief Decay
Belief confidence decays over time when unverified by recent observation:
\[
C(t) = C_0 \cdot e^{-\lambda t}
\]
Where \(\lambda\) is the configurable decay rate (default: `0.05`), ensuring the agent doesn't act on stale environmental assumptions.

---

## 4. Reactive Replanning
When an action fails or a blocker arises:
1. Active intentions for the goal are cancelled.
2. The blocker is recorded.
3. Subgoals are adaptively reconstructed.
4. Preserved completed subgoals remain intact.
