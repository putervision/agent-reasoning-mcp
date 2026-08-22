import {
  BeliefEngine,
  GoalEngine,
  IntentionEngine,
  NotFoundError,
  ValidationError,
  generateId,
  getCurrentIsoString,
  getDb,
  getProjectSlug,
  getReadOnlyDb,
  getVersion,
  logReasoningEvent,
  safeJsonParse,
  safeJsonStringify,
  verifyEventChain
} from "./chunk-FB4TIUGM.js";

// src/engine/personality.ts
var UtilityProfileEngine = class {
  static configureProfile(db, params) {
    if (!params.name) throw new ValidationError("Profile name is required.");
    if (!params.weights || Object.keys(params.weights).length === 0) {
      throw new ValidationError("Utility weights are required.");
    }
    const defaultWeights = {
      aggression: 0.5,
      caution: 0.5,
      greed: 0.5,
      efficiency: 0.5,
      exploration: 0.5,
      cooperation: 0.5,
      ...params.weights
    };
    const now = getCurrentIsoString();
    const existing = db.prepare("SELECT * FROM utility_profiles WHERE project = ? AND name = ?").get(params.project, params.name);
    if (params.is_active) {
      db.prepare("UPDATE utility_profiles SET is_active = 0 WHERE project = ?").run(params.project);
    }
    if (existing) {
      db.prepare(`
        UPDATE utility_profiles SET
          description = ?, weights_json = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        params.description ?? existing.description,
        safeJsonStringify(defaultWeights),
        params.is_active ? 1 : existing.is_active,
        now,
        existing.id
      );
      return this.getProfile(db, { project: params.project, name: params.name });
    }
    const id = generateId();
    const isActive = params.is_active ? 1 : 0;
    db.prepare(`
      INSERT INTO utility_profiles (id, project, name, description, weights_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.project, params.name, params.description ?? null, safeJsonStringify(defaultWeights), isActive, now, now);
    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: "profile",
      action: "configure",
      details: { name: params.name, weights: defaultWeights }
    });
    return {
      id,
      project: params.project,
      name: params.name,
      description: params.description,
      weights: defaultWeights,
      is_active: isActive === 1,
      created_at: now,
      updated_at: now
    };
  }
  static getActiveProfile(db, project) {
    const row = db.prepare("SELECT * FROM utility_profiles WHERE project = ? AND is_active = 1").get(project);
    if (row) return this.mapRowToProfile(row);
    return {
      id: "default",
      project,
      name: "balanced",
      description: "Default balanced autonomous profile",
      weights: {
        aggression: 0.5,
        caution: 0.5,
        greed: 0.5,
        efficiency: 0.5,
        exploration: 0.5,
        cooperation: 0.5
      },
      is_active: true,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  static getProfile(db, params) {
    const row = db.prepare("SELECT * FROM utility_profiles WHERE project = ? AND name = ?").get(params.project, params.name);
    if (!row) throw new NotFoundError(`Utility profile "${params.name}" not found.`);
    return this.mapRowToProfile(row);
  }
  static listProfiles(db, project) {
    const rows = db.prepare("SELECT * FROM utility_profiles WHERE project = ? ORDER BY is_active DESC, name ASC").all(project);
    return rows.map((r) => this.mapRowToProfile(r));
  }
  static activateProfile(db, params) {
    const profile = this.getProfile(db, params);
    db.transaction(() => {
      db.prepare("UPDATE utility_profiles SET is_active = 0 WHERE project = ?").run(params.project);
      db.prepare("UPDATE utility_profiles SET is_active = 1 WHERE project = ? AND name = ?").run(params.project, params.name);
    })();
    return { ...profile, is_active: true };
  }
  static mapRowToProfile(row) {
    return {
      id: row.id,
      project: row.project,
      name: row.name,
      description: row.description,
      weights: safeJsonParse(row.weights_json, {
        aggression: 0.5,
        caution: 0.5,
        greed: 0.5,
        efficiency: 0.5,
        exploration: 0.5,
        cooperation: 0.5
      }),
      is_active: row.is_active === 1,
      metadata: safeJsonParse(row.metadata_json, void 0),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
};

// src/engine/traces.ts
var DecisionTraceEngine = class {
  static recordTrace(db, params) {
    if (!params.situation_summary || !params.chosen_action) {
      throw new ValidationError("situation_summary and chosen_action are required.");
    }
    const id = generateId();
    const now = getCurrentIsoString();
    db.prepare(`
      INSERT INTO decision_traces (
        id, project, session_id, goal_id, situation_summary, candidate_actions_json,
        utility_profile, chosen_action, reasoning_chain_json, risk_assessment_json,
        outcome, latency_ms, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.project,
      params.session_id ?? null,
      params.goal_id ?? null,
      params.situation_summary,
      safeJsonStringify(params.candidate_actions || []),
      params.utility_profile,
      params.chosen_action,
      safeJsonStringify(params.reasoning_chain || []),
      params.risk_assessment ? safeJsonStringify(params.risk_assessment) : null,
      params.outcome ?? null,
      params.latency_ms ?? 0,
      params.metadata ? safeJsonStringify(params.metadata) : null,
      now
    );
    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: "trace",
      action: "record",
      details: { chosen_action: params.chosen_action, utility_profile: params.utility_profile }
    });
    return {
      id,
      project: params.project,
      session_id: params.session_id,
      goal_id: params.goal_id || void 0,
      situation_summary: params.situation_summary,
      candidate_actions: params.candidate_actions,
      utility_profile: params.utility_profile,
      chosen_action: params.chosen_action,
      reasoning_chain: params.reasoning_chain,
      risk_assessment: params.risk_assessment,
      outcome: params.outcome,
      latency_ms: params.latency_ms || 0,
      metadata: params.metadata,
      created_at: now
    };
  }
  static getTrace(db, params) {
    const row = db.prepare("SELECT * FROM decision_traces WHERE project = ? AND id = ?").get(params.project, params.id);
    if (!row) throw new NotFoundError(`Decision trace ${params.id} not found.`);
    return this.mapRowToTrace(row);
  }
  static listTraces(db, params) {
    let sql = "SELECT * FROM decision_traces WHERE project = ?";
    const sqlParams = [params.project];
    if (params.goal_id) {
      sql += " AND goal_id = ?";
      sqlParams.push(params.goal_id);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    sqlParams.push(params.limit || 50);
    const rows = db.prepare(sql).all(...sqlParams);
    return rows.map((r) => this.mapRowToTrace(r));
  }
  static getLatestTrace(db, project) {
    const row = db.prepare("SELECT * FROM decision_traces WHERE project = ? ORDER BY created_at DESC LIMIT 1").get(project);
    if (!row) return null;
    return this.mapRowToTrace(row);
  }
  static explainTrace(db, params) {
    const trace = this.getTrace(db, params);
    let out = `# Decision Trace: ${trace.id}

`;
    out += `**Situation**: ${trace.situation_summary}
`;
    out += `**Profile**: ${trace.utility_profile}
`;
    out += `**Chosen Action**: \`${trace.chosen_action}\` (Latency: ${trace.latency_ms}ms)

`;
    out += `## Chain of Thought:
`;
    for (let i = 0; i < trace.reasoning_chain.length; i++) {
      out += `${i + 1}. ${trace.reasoning_chain[i]}
`;
    }
    out += `
## Candidate Utilities:
`;
    for (const c of trace.candidate_actions) {
      out += `- \`${c.action}\`: Score = ${c.estimated_utility.toFixed(3)}
`;
    }
    return out;
  }
  static mapRowToTrace(row) {
    return {
      id: row.id,
      project: row.project,
      session_id: row.session_id,
      goal_id: row.goal_id,
      situation_summary: row.situation_summary,
      candidate_actions: safeJsonParse(row.candidate_actions_json, []),
      utility_profile: row.utility_profile,
      chosen_action: row.chosen_action,
      reasoning_chain: safeJsonParse(row.reasoning_chain_json, []),
      risk_assessment: safeJsonParse(row.risk_assessment_json, void 0),
      outcome: row.outcome,
      latency_ms: row.latency_ms,
      metadata: safeJsonParse(row.metadata_json, void 0),
      created_at: row.created_at
    };
  }
};

// src/engine/utility.ts
var UtilityEngine = class {
  static scoreCandidate(candidate, profile) {
    const attrs = candidate.attributes || {
      aggression: 0.5,
      caution: 0.5,
      greed: 0.5,
      efficiency: 0.5,
      exploration: 0.5,
      cooperation: 0.5
    };
    let totalScore = 0;
    let weightSum = 0;
    const breakdown = {};
    for (const [k, w] of Object.entries(profile.weights)) {
      const u = attrs[k] !== void 0 ? attrs[k] : 0.5;
      const weightedScore = w * u;
      breakdown[k] = weightedScore;
      totalScore += weightedScore;
      weightSum += w;
    }
    const estimated_utility = weightSum > 0 ? totalScore / weightSum : totalScore;
    return {
      action: candidate.action,
      parameters: candidate.parameters,
      estimated_utility,
      utility_breakdown: breakdown,
      feasibility: 1
    };
  }
  static rankCandidates(candidates, profile) {
    const scored = candidates.map((c) => this.scoreCandidate(c, profile));
    return scored.sort((a, b) => b.estimated_utility - a.estimated_utility);
  }
};

// src/engine/risk.ts
var RiskEngine = class {
  static assessAction(actionName, params, context, profile) {
    const threats = [];
    const opportunities = [];
    const mitigations = [];
    let riskScore = 0.2;
    const hp = context?.vitals?.hp ?? 100;
    const threatLevel = context?.vitals?.threat_level ?? 0;
    if (/attack|combat|engage|kite/i.test(actionName)) {
      if (hp < 30) {
        threats.push("Critical health: engagement risks fatality");
        mitigations.push("Flee or heal before attacking");
        riskScore += 0.5;
      } else {
        opportunities.push("Eliminating target yields rewards and security");
        riskScore += 0.2;
      }
    } else if (/flee|retreat|heal/i.test(actionName)) {
      opportunities.push("Preserves agent survival");
      mitigations.push("Navigate away from enemy clusters");
      riskScore = 0.1;
    } else if (/gather|farm|loot/i.test(actionName)) {
      opportunities.push("Resource accumulation");
      if (threatLevel > 0.5) {
        threats.push("Enemies nearby while vulnerable in gathering animation");
        mitigations.push("Maintain line-of-sight check");
        riskScore += 0.3;
      }
    }
    if (profile) {
      riskScore = riskScore * (profile.weights.caution || 0.5) / (profile.weights.aggression || 0.5);
    }
    riskScore = Math.max(0, Math.min(1, riskScore));
    let threat_level = "low";
    if (riskScore > 0.8) threat_level = "critical";
    else if (riskScore > 0.6) threat_level = "high";
    else if (riskScore > 0.4) threat_level = "medium";
    else if (riskScore < 0.1) threat_level = "none";
    return {
      threat_level,
      risk_score: riskScore,
      threats,
      opportunities,
      mitigations
    };
  }
};

// src/engine/evaluator.ts
var EvaluatorEngine = class {
  static evaluateSituation(db, params) {
    const startTime = Date.now();
    const profile = params.utility_profile ? UtilityProfileEngine.getProfile(db, { project: params.project, name: params.utility_profile }) : UtilityProfileEngine.getActiveProfile(db, params.project);
    const candidates = params.candidate_actions && params.candidate_actions.length > 0 ? params.candidate_actions : [
      { action: "idle_patrol", parameters: { radius: 15 } },
      { action: "gather_resources", parameters: { target_type: "ore" } },
      { action: "engage_threat", parameters: { aggressive: true } },
      { action: "flee_to_safety", parameters: { threshold_hp: 30 } }
    ];
    const reasoning_chain = [];
    reasoning_chain.push(`Loaded active utility profile: "${profile.name}" (Aggression: ${profile.weights.aggression}, Caution: ${profile.weights.caution}).`);
    let threatLevel = 0;
    let currentHp = 100;
    if (params.snapshot) {
      reasoning_chain.push(`Analyzed situation snapshot from session "${params.snapshot.session_id}".`);
      if (params.snapshot.vitals) {
        threatLevel = params.snapshot.vitals.threat_level ?? 0;
        currentHp = params.snapshot.vitals.hp ?? 100;
        reasoning_chain.push(`Vitals: HP=${currentHp}, Threat=${threatLevel}.`);
      }
      if (params.snapshot.state?.active_goals?.length) {
        reasoning_chain.push(`Active goals count: ${params.snapshot.state.active_goals.length}. Primary goal: "${params.snapshot.state.active_goals[0].title}".`);
      }
    } else if (params.quick_context) {
      reasoning_chain.push(`Quick context: ${params.quick_context}`);
    }
    const scoredCandidates = candidates.map((c) => {
      const isCombat = /engage|attack|combat/i.test(c.action);
      const isEscape = /flee|heal/i.test(c.action);
      const isGather = /gather|loot|farm/i.test(c.action);
      const isPatrol = /patrol|explore|navigate/i.test(c.action);
      let eff = 0.7;
      if (threatLevel > 0.6 && isCombat) eff += 0.25;
      if (threatLevel > 0.6 && isPatrol) eff -= 0.3;
      if (currentHp < 30 && isEscape) eff += 0.35;
      const attributes = {
        aggression: isCombat ? 0.9 : 0.2,
        caution: isEscape || isPatrol ? 0.8 : 0.3,
        greed: isGather ? 0.9 : 0.2,
        efficiency: Math.min(1, Math.max(0.1, eff)),
        exploration: isPatrol ? threatLevel > 0.5 ? 0.3 : 0.8 : 0.3,
        cooperation: 0.5
      };
      const candidateScored = UtilityEngine.scoreCandidate({ ...c, attributes }, profile);
      const risk = RiskEngine.assessAction(c.action, c.parameters, params.snapshot ? { vitals: params.snapshot.vitals } : void 0, profile);
      candidateScored.risk_score = risk.risk_score;
      return candidateScored;
    });
    const ranked = scoredCandidates.sort((a, b) => b.estimated_utility - a.estimated_utility);
    const chosen = ranked[0];
    reasoning_chain.push(`Scored ${ranked.length} candidate actions against utility weights.`);
    reasoning_chain.push(`Selected highest utility action: "${chosen.action}" with estimated utility ${chosen.estimated_utility.toFixed(3)}.`);
    const risk_assessment = RiskEngine.assessAction(chosen.action, chosen.parameters, params.snapshot ? { vitals: params.snapshot.vitals } : void 0, profile);
    const latency_ms = Date.now() - startTime;
    const summary = params.snapshot?.session_id ? `Evaluation for session ${params.snapshot.session_id}` : params.quick_context || "General situation evaluation";
    const trace = DecisionTraceEngine.recordTrace(db, {
      project: params.project,
      session_id: params.snapshot?.session_id,
      situation_summary: summary,
      candidate_actions: ranked,
      utility_profile: profile.name,
      chosen_action: chosen.action,
      reasoning_chain,
      risk_assessment,
      latency_ms
    });
    return {
      chosen_action: chosen,
      ranked_candidates: ranked,
      reasoning_chain,
      risk_assessment,
      trace_id: trace.id
    };
  }
};

// src/engine/replanner.ts
var ReplannerEngine = class {
  static replanGoal(db, params) {
    const goal = GoalEngine.getGoal(db, { project: params.project, id: params.goal_id });
    const intentions = IntentionEngine.listIntentions(db, { project: params.project, goal_id: goal.id });
    let cancelledCount = 0;
    for (const item of intentions) {
      if (item.status === "pending" || item.status === "dispatched") {
        IntentionEngine.resolveIntention(db, {
          project: params.project,
          id: item.id,
          status: "aborted",
          result: { reason: `Replanning triggered: ${params.blocker_description || "Reactive event"}` }
        });
        cancelledCount++;
      }
    }
    const fallbackSubgoals = [
      { title: `Resolve blocker: ${params.blocker_description || "Investigate obstacle"}`, priority: goal.priority + 0.1 },
      { title: `Resume main objective: ${goal.title}`, priority: goal.priority }
    ];
    const decomposed = GoalEngine.decomposeGoal(db, {
      project: params.project,
      parent_id: goal.id,
      subgoals: fallbackSubgoals
    });
    return {
      original_goal: goal,
      new_subgoals: decomposed.subgoals,
      cancelled_intentions: cancelledCount,
      recommended_action: fallbackSubgoals[0].title
    };
  }
};

// src/engine/knowledge.ts
var KnowledgeEngine = class {
  static createPattern(db, params) {
    if (!params.situation_pattern || !params.recommended_strategy) {
      throw new ValidationError("situation_pattern and recommended_strategy are required.");
    }
    const id = generateId();
    const now = getCurrentIsoString();
    const confidence = params.confidence !== void 0 ? params.confidence : 0.7;
    db.prepare(`
      INSERT INTO knowledge_patterns (
        id, project, pattern_type, context_tags_json, situation_pattern,
        recommended_strategy, confidence, sample_count, success_rate,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1.0, ?, ?, ?)
    `).run(
      id,
      params.project,
      params.pattern_type,
      safeJsonStringify(params.context_tags || []),
      params.situation_pattern,
      params.recommended_strategy,
      confidence,
      params.metadata ? safeJsonStringify(params.metadata) : null,
      now,
      now
    );
    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: "knowledge",
      action: "create_pattern",
      details: { pattern_type: params.pattern_type, situation: params.situation_pattern }
    });
    return {
      id,
      project: params.project,
      pattern_type: params.pattern_type,
      context_tags: params.context_tags || [],
      situation_pattern: params.situation_pattern,
      recommended_strategy: params.recommended_strategy,
      confidence,
      sample_count: 1,
      success_rate: 1,
      metadata: params.metadata,
      created_at: now,
      updated_at: now
    };
  }
  static queryKnowledge(db, params) {
    let sql = "SELECT * FROM knowledge_patterns WHERE project = ?";
    const sqlParams = [params.project];
    if (params.pattern_type) {
      sql += " AND pattern_type = ?";
      sqlParams.push(params.pattern_type);
    }
    if (params.query) {
      sql += " AND (situation_pattern LIKE ? OR recommended_strategy LIKE ?)";
      sqlParams.push(`%${params.query}%`, `%${params.query}%`);
    }
    sql += " ORDER BY confidence DESC, success_rate DESC LIMIT ?";
    sqlParams.push(params.limit || 50);
    const rows = db.prepare(sql).all(...sqlParams);
    return rows.map((r) => this.mapRowToPattern(r));
  }
  static mapRowToPattern(row) {
    return {
      id: row.id,
      project: row.project,
      pattern_type: row.pattern_type,
      context_tags: safeJsonParse(row.context_tags_json, []),
      situation_pattern: row.situation_pattern,
      recommended_strategy: row.recommended_strategy,
      confidence: row.confidence,
      sample_count: row.sample_count,
      success_rate: row.success_rate,
      metadata: safeJsonParse(row.metadata_json, void 0),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
};

// src/engine/snapshots.ts
var SnapshotEngine = class {
  static saveSnapshot(db, params) {
    if (!params.name || typeof params.name !== "string") {
      throw new ValidationError("Snapshot name is required.");
    }
    const goals = db.prepare("SELECT * FROM goals WHERE project = ?").all(params.project);
    const beliefs = db.prepare("SELECT * FROM beliefs WHERE project = ?").all(params.project);
    const profiles = db.prepare("SELECT * FROM utility_profiles WHERE project = ?").all(params.project);
    const intentions = db.prepare("SELECT * FROM intentions WHERE project = ?").all(params.project);
    const knowledge = db.prepare("SELECT * FROM knowledge_patterns WHERE project = ?").all(params.project);
    const data = { goals, beliefs, profiles, intentions, knowledge };
    const id = generateId();
    const now = getCurrentIsoString();
    db.prepare(`
      INSERT INTO snapshots (id, project, name, description, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project, name) DO UPDATE SET
        description = excluded.description,
        data_json = excluded.data_json,
        created_at = excluded.created_at
    `).run(id, params.project, params.name, params.description ?? null, JSON.stringify(data), now);
    return { snapshot_id: id, name: params.name, timestamp: now };
  }
  static restoreSnapshot(db, params) {
    const row = db.prepare("SELECT * FROM snapshots WHERE project = ? AND name = ?").get(params.project, params.name);
    if (!row) {
      throw new ValidationError(`Snapshot "${params.name}" not found for project "${params.project}".`);
    }
    const data = safeJsonParse(row.data_json, { goals: [], beliefs: [] });
    db.transaction(() => {
      db.prepare("DELETE FROM intentions WHERE project = ?").run(params.project);
      db.prepare("DELETE FROM beliefs WHERE project = ?").run(params.project);
      db.prepare("DELETE FROM goals WHERE project = ?").run(params.project);
      if (Array.isArray(data.goals)) {
        const stmt = db.prepare(`
          INSERT INTO goals (id, project, session_id, parent_id, title, description, status, priority, utility_weights_json, deadline_at, progress, success_criteria_json, failure_reason, metadata_json, client_request_id, created_at, updated_at, version)
          VALUES (@id, @project, @session_id, @parent_id, @title, @description, @status, @priority, @utility_weights_json, @deadline_at, @progress, @success_criteria_json, @failure_reason, @metadata_json, @client_request_id, @created_at, @updated_at, @version)
        `);
        for (const g of data.goals) stmt.run(g);
      }
      if (Array.isArray(data.beliefs)) {
        const stmt = db.prepare(`
          INSERT INTO beliefs (id, project, session_id, category, subject, predicate, object_json, confidence, source, source_id, expires_at, decay_rate, last_decayed_at, client_request_id, metadata_json, created_at, updated_at)
          VALUES (@id, @project, @session_id, @category, @subject, @predicate, @object_json, @confidence, @source, @source_id, @expires_at, @decay_rate, @last_decayed_at, @client_request_id, @metadata_json, @created_at, @updated_at)
        `);
        for (const b of data.beliefs) stmt.run(b);
      }
    })();
    return {
      restored_goals: data.goals?.length || 0,
      restored_beliefs: data.beliefs?.length || 0
    };
  }
  static listSnapshots(db, params) {
    return db.prepare("SELECT id, name, description, created_at FROM snapshots WHERE project = ? ORDER BY created_at DESC LIMIT ?").all(params.project, params.limit || 50);
  }
};

// src/server.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

// src/tools/handlers.ts
import { z } from "zod";

// src/tools/definitions.ts
var READ_ONLY_TOOLS = /* @__PURE__ */ new Set([
  "query_beliefs",
  "get_decision_trace",
  "query_knowledge"
]);
var toolDefinitions = [
  {
    name: "set_goal",
    description: "Register, update, decompose, or manage hierarchical goals and task DAGs in the reasoning engine.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "decompose", "get", "list", "abandon"],
          description: "The goal management operation to perform"
        },
        id: { type: "string", description: "Goal ID (required for update, get, abandon)" },
        parent_id: { type: "string", description: "Parent goal ID for hierarchical sub-goals" },
        title: { type: "string", description: "Goal title or objective summary" },
        description: { type: "string", description: "Detailed goal description" },
        status: {
          type: "string",
          enum: ["active", "completed", "failed", "abandoned", "suspended"],
          description: "Goal status"
        },
        priority: { type: "number", description: "Goal priority (0.0 to 1.0)" },
        utility_weights: { type: "object", description: "Goal-specific utility weight overrides" },
        deadline_at: { type: "string", description: "ISO-8601 deadline timestamp" },
        progress: { type: "number", description: "Completion progress (0.0 to 1.0)" },
        success_criteria: { type: "array", items: { type: "string" }, description: "List of verifiable conditions" },
        subgoals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "number" }
            },
            required: ["title"]
          },
          description: "Array of sub-goals for decompose action"
        },
        client_request_id: { type: "string", description: "Idempotency key to prevent duplicate creation" },
        project: { type: "string", description: "Target project slug" },
        limit: { type: "number", description: "Max items to return for list action" }
      },
      required: ["action"]
    }
  },
  {
    name: "evaluate_situation",
    description: "Ingest multi-modal situation snapshot, compute expected utilities against active weights, and output prioritized action recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["snapshot", "quick"],
          description: "Snapshot evaluation mode or quick text context"
        },
        snapshot: {
          type: "object",
          description: "Normalized SituationSnapshot with world, vision, state, and vitals"
        },
        quick_context: { type: "string", description: "Text summary of current situation for quick evaluation" },
        candidate_actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string" },
              parameters: { type: "object" },
              description: { type: "string" }
            },
            required: ["action"]
          },
          description: "Candidate actions to score and rank"
        },
        utility_profile: { type: "string", description: "Named utility profile to score against (defaults to active)" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  },
  {
    name: "replan",
    description: "Regenerate sub-task DAG and abort/recreate intentions upon unexpected blockers or environmental state changes.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["blocker", "event", "full"],
          description: "Replanning trigger type"
        },
        goal_id: { type: "string", description: "ID of goal to replan" },
        blocker_description: { type: "string", description: "Description of the obstacle or blocker encountered" },
        trigger_event: { type: "string", description: "Event description triggering replanning" },
        preserve_completed: { type: "boolean", description: "Whether to preserve already completed subgoals" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action", "goal_id"]
    }
  },
  {
    name: "assess_risk",
    description: "Compute quantitative risk and threat assessment for candidate actions or plans against active utility weights.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["action", "plan", "compare"],
          description: "Risk assessment mode"
        },
        candidate_action: { type: "string", description: "Action name to evaluate" },
        parameters: { type: "object", description: "Action parameters" },
        candidate_actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string" },
              parameters: { type: "object" }
            },
            required: ["action"]
          },
          description: "Multiple actions to compare risk scores"
        },
        situation_context: { type: "object", description: "Current environment telemetry & vitals" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  },
  {
    name: "query_knowledge",
    description: "Search learned heuristic patterns, tactics, and past decision traces by context similarity.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "patterns", "similar_situations"],
          description: "Knowledge query mode"
        },
        query: { type: "string", description: "Semantic search query string" },
        pattern_type: {
          type: "string",
          enum: ["heuristic", "anti_pattern", "optimization", "contingency"],
          description: "Filter by pattern category"
        },
        context_tags: { type: "array", items: { type: "string" }, description: "Filter by context tags" },
        limit: { type: "number", description: "Max patterns to return" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  },
  {
    name: "set_utility_weights",
    description: "Configure and activate multi-attribute utility weights (aggression, caution, greed, exploration, cooperation).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["configure", "get", "list", "activate"],
          description: "Profile operation"
        },
        name: { type: "string", description: 'Profile name (e.g. "aggressive", "cautious", "explorer")' },
        description: { type: "string", description: "Profile description" },
        weights: {
          type: "object",
          description: "Key-value map of weight values (0.0 to 1.0)"
        },
        is_active: { type: "boolean", description: "Whether to set as currently active profile" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  },
  {
    name: "get_decision_trace",
    description: "Retrieve explainable step-by-step chain-of-thought rationale, candidate utilities, and risk assessment for past decisions.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["latest", "get", "list", "explain"],
          description: "Trace retrieval operation"
        },
        trace_id: { type: "string", description: "Trace ID for get/explain action" },
        goal_id: { type: "string", description: "Filter traces by linked goal ID" },
        limit: { type: "number", description: "Max traces to list" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  },
  {
    name: "manage_beliefs",
    description: "Maintain structured belief state with TTL expiration sweeps, exponential confidence decay, and category filtering.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["update", "query", "expire", "reconcile"],
          description: "Belief operation"
        },
        category: {
          type: "string",
          enum: ["spatial", "entity", "state", "rule", "social"],
          description: "Belief category"
        },
        subject: { type: "string", description: 'Belief subject (e.g. "north_gate", "enemy_patrol")' },
        predicate: { type: "string", description: 'Predicate relationship (e.g. "is_locked", "status")' },
        object: { description: "Belief value / state payload" },
        confidence: { type: "number", description: "Confidence score (0.0 to 1.0)" },
        source: {
          type: "string",
          enum: ["observation", "deduction", "agent_communication", "a_priori"],
          description: "Belief provenance source"
        },
        expires_at: { type: "string", description: "ISO-8601 expiration timestamp" },
        decay_rate: { type: "number", description: "Exponential decay rate lambda per hour" },
        belief_id: { type: "string", description: "Belief ID for specific lookup" },
        client_request_id: { type: "string", description: "Idempotency key" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  },
  {
    name: "manage_intentions",
    description: "Queue, dispatch, track, and resolve behavior directives (wire contract) for behavior-runtime-mcp.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "dispatch", "get", "list", "cancel", "resolve"],
          description: "Intention operation"
        },
        intention_id: { type: "string", description: "Intention ID for dispatch/get/cancel/resolve" },
        goal_id: { type: "string", description: "Linked goal ID" },
        trace_id: { type: "string", description: "Linked decision trace ID" },
        behavior_name: { type: "string", description: 'Target behavior tree name (e.g. "combat_kite", "gather_loop")' },
        parameters: { type: "object", description: "Runtime behavior parameters" },
        priority: { type: "number", description: "Execution priority (0.0 to 1.0)" },
        deadline_at: { type: "string", description: "ISO-8601 completion deadline" },
        abort_conditions: { type: "array", items: { type: "object" }, description: "Auto-abort trigger conditions" },
        result: { type: "object", description: "Outcome payload for resolve action" },
        status: {
          type: "string",
          enum: ["pending", "dispatched", "running", "completed", "failed", "aborted", "interrupted"],
          description: "Status filter or update"
        },
        client_request_id: { type: "string", description: "Idempotency key" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  },
  {
    name: "manage_reasoning_db",
    description: "Database maintenance, stats, SHA-256 Merkle audit verification, checkpoints save/restore, and diffs.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["backup", "stats", "audit", "snapshot", "diff", "restore"],
          description: "Database maintenance operation"
        },
        name: { type: "string", description: "Snapshot or backup name" },
        description: { type: "string", description: "Description for snapshot" },
        project: { type: "string", description: "Target project slug" }
      },
      required: ["action"]
    }
  }
];

// src/engine/advisor.ts
var TOOL_ALIASES = {
  add_goal: "set_goal",
  create_goal: "set_goal",
  update_goal: "set_goal",
  decompose: "decompose_goal",
  subgoals: "decompose_goal",
  add_belief: "update_belief",
  set_belief: "update_belief",
  beliefs: "query_beliefs",
  search_beliefs: "query_beliefs",
  evaluate: "evaluate_situation",
  situation: "evaluate_situation",
  utility: "calculate_utility",
  score: "calculate_utility",
  risk: "assess_risk",
  threat: "assess_risk",
  replan: "replan_goal",
  adapt: "replan_goal",
  dispatch: "manage_intentions",
  intentions: "manage_intentions",
  weights: "set_utility_weights",
  personality: "set_utility_weights",
  trace: "record_decision_trace",
  history: "record_decision_trace"
};
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
var SchemaAdvisor = class {
  static resolveAlias(toolName) {
    return TOOL_ALIASES[toolName.toLowerCase()];
  }
  static getAdvice(toolName, error, availableTools) {
    const alias = this.resolveAlias(toolName);
    if (alias) {
      return `Tool "${toolName}" is an alias. Did you mean to call "${alias}"?`;
    }
    let closest = "";
    let minDistance = Infinity;
    for (const tool of availableTools) {
      const dist = levenshtein(toolName.toLowerCase(), tool.toLowerCase());
      if (dist < minDistance && dist <= 3) {
        minDistance = dist;
        closest = tool;
      }
    }
    if (closest) {
      return `Tool "${toolName}" not found. Did you mean "${closest}"? (${error})`;
    }
    return `Invalid tool call "${toolName}": ${error}`;
  }
};

// src/tools/handlers.ts
function jsonSchemaToZod(schema) {
  if (!schema || typeof schema !== "object") return z.unknown();
  const s = schema;
  if (s.type === "string") {
    if (s.enum && Array.isArray(s.enum) && s.enum.length > 0) {
      return z.enum(s.enum);
    }
    return z.string();
  }
  if (s.type === "number") return z.number();
  if (s.type === "boolean") return z.boolean();
  if (s.type === "array") {
    const itemSchema = s.items ? jsonSchemaToZod(s.items) : z.unknown();
    return z.array(itemSchema);
  }
  if (s.type === "object" || s.properties) {
    const shape = {};
    const requiredKeys = new Set(s.required || []);
    if (s.properties) {
      for (const [key, prop] of Object.entries(s.properties)) {
        let fieldSchema = jsonSchemaToZod(prop);
        if (!requiredKeys.has(key)) {
          fieldSchema = fieldSchema.optional();
        }
        shape[key] = fieldSchema;
      }
    }
    return z.object(shape).passthrough();
  }
  return z.unknown();
}
function registerAllTools(server2) {
  const toolNames = toolDefinitions.map((t) => t.name);
  for (const def of toolDefinitions) {
    const zodShape = {};
    const schemaProps = def.inputSchema.properties || {};
    const requiredList = new Set(def.inputSchema.required || []);
    for (const [key, prop] of Object.entries(schemaProps)) {
      let fieldSchema = jsonSchemaToZod(prop);
      if (!requiredList.has(key)) {
        fieldSchema = fieldSchema.optional();
      }
      zodShape[key] = fieldSchema;
    }
    server2.tool(
      def.name,
      def.description,
      zodShape,
      async (args) => {
        try {
          const project = getProjectSlug(args.project);
          const isReadOnly = READ_ONLY_TOOLS.has(def.name);
          const db = isReadOnly ? getReadOnlyDb(project) : getDb(project);
          let result;
          switch (def.name) {
            case "set_goal": {
              const action = args.action;
              if (action === "create") {
                result = GoalEngine.createGoal(db, { project, ...args });
              } else if (action === "update") {
                result = GoalEngine.updateGoal(db, { project, ...args });
              } else if (action === "decompose") {
                result = GoalEngine.decomposeGoal(db, { project, parent_id: args.id || args.parent_id, subgoals: args.subgoals || [] });
              } else if (action === "get") {
                result = GoalEngine.getGoal(db, { project, id: args.id });
              } else if (action === "list") {
                result = GoalEngine.listGoals(db, { project, status: args.status, parent_id: args.parent_id, limit: args.limit });
              } else if (action === "abandon") {
                result = GoalEngine.abandonGoal(db, { project, id: args.id, reason: args.description });
              } else {
                throw new ValidationError(`Unknown action "${action}" for set_goal.`);
              }
              break;
            }
            case "evaluate_situation": {
              result = EvaluatorEngine.evaluateSituation(db, { project, ...args });
              break;
            }
            case "replan": {
              result = ReplannerEngine.replanGoal(db, { project, ...args });
              break;
            }
            case "assess_risk": {
              if (args.action === "compare" && args.candidate_actions) {
                result = args.candidate_actions.map((c) => ({
                  action: c.action,
                  risk: RiskEngine.assessAction(c.action, c.parameters, args.situation_context)
                }));
              } else {
                result = RiskEngine.assessAction(args.candidate_action || "default_action", args.parameters, args.situation_context);
              }
              break;
            }
            case "query_knowledge": {
              result = KnowledgeEngine.queryKnowledge(db, { project, ...args });
              break;
            }
            case "set_utility_weights": {
              const action = args.action;
              if (action === "configure") {
                result = UtilityProfileEngine.configureProfile(db, { project, ...args });
              } else if (action === "get") {
                result = args.name ? UtilityProfileEngine.getProfile(db, { project, name: args.name }) : UtilityProfileEngine.getActiveProfile(db, project);
              } else if (action === "list") {
                result = UtilityProfileEngine.listProfiles(db, project);
              } else if (action === "activate") {
                result = UtilityProfileEngine.activateProfile(db, { project, name: args.name });
              } else {
                throw new ValidationError(`Unknown action "${action}" for set_utility_weights.`);
              }
              break;
            }
            case "get_decision_trace": {
              const action = args.action;
              if (action === "latest") {
                result = DecisionTraceEngine.getLatestTrace(db, project) || { message: "No decision traces found." };
              } else if (action === "get") {
                result = DecisionTraceEngine.getTrace(db, { project, id: args.trace_id });
              } else if (action === "list") {
                result = DecisionTraceEngine.listTraces(db, { project, goal_id: args.goal_id, limit: args.limit });
              } else if (action === "explain") {
                const explanation = DecisionTraceEngine.explainTrace(db, { project, id: args.trace_id });
                result = { explanation };
              } else {
                throw new ValidationError(`Unknown action "${action}" for get_decision_trace.`);
              }
              break;
            }
            case "manage_beliefs": {
              const action = args.action;
              if (action === "update") {
                result = BeliefEngine.updateBelief(db, { project, ...args });
              } else if (action === "query") {
                result = BeliefEngine.queryBeliefs(db, { project, ...args });
              } else if (action === "expire") {
                const expiredCount = BeliefEngine.expireBeliefs(db, project);
                result = { expired_beliefs: expiredCount };
              } else if (action === "reconcile") {
                BeliefEngine.decayBeliefs(db, project);
                result = { message: "Beliefs successfully reconciled and decayed." };
              } else {
                throw new ValidationError(`Unknown action "${action}" for manage_beliefs.`);
              }
              break;
            }
            case "manage_intentions": {
              const action = args.action;
              if (action === "create") {
                result = IntentionEngine.createIntention(db, { project, ...args });
              } else if (action === "dispatch") {
                result = IntentionEngine.dispatchIntention(db, { project, id: args.intention_id });
              } else if (action === "get") {
                result = IntentionEngine.getIntention(db, { project, id: args.intention_id });
              } else if (action === "list") {
                result = IntentionEngine.listIntentions(db, { project, status: args.status, goal_id: args.goal_id });
              } else if (action === "cancel") {
                result = IntentionEngine.resolveIntention(db, { project, id: args.intention_id, status: "aborted", result: args.result });
              } else if (action === "resolve") {
                result = IntentionEngine.resolveIntention(db, { project, id: args.intention_id, status: args.status || "completed", result: args.result });
              } else {
                throw new ValidationError(`Unknown action "${action}" for manage_intentions.`);
              }
              break;
            }
            case "manage_reasoning_db": {
              const action = args.action;
              if (action === "stats") {
                const goalsCount = db.prepare("SELECT COUNT(*) as c FROM goals WHERE project = ?").get(project).c;
                const beliefsCount = db.prepare("SELECT COUNT(*) as c FROM beliefs WHERE project = ?").get(project).c;
                const tracesCount = db.prepare("SELECT COUNT(*) as c FROM decision_traces WHERE project = ?").get(project).c;
                const intentionsCount = db.prepare("SELECT COUNT(*) as c FROM intentions WHERE project = ?").get(project).c;
                result = { goalsCount, beliefsCount, tracesCount, intentionsCount, project };
              } else if (action === "audit") {
                result = verifyEventChain(db, project);
              } else if (action === "snapshot") {
                result = SnapshotEngine.saveSnapshot(db, { project, name: args.name || `snap_${Date.now()}`, description: args.description });
              } else if (action === "restore") {
                result = SnapshotEngine.restoreSnapshot(db, { project, name: args.name });
              } else if (action === "diff") {
                result = SnapshotEngine.listSnapshots(db, { project });
              } else {
                result = { status: "ok", project };
              }
              break;
            }
            default:
              throw new ValidationError(`Unrecognized tool "${def.name}".`);
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          const advice = SchemaAdvisor.getAdvice(def.name, error.message, toolNames);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error.message,
                  code: error.code || "EXECUTION_ERROR",
                  advice
                }, null, 2)
              }
            ]
          };
        }
      }
    );
  }
}

// src/tools/prompts.ts
import { z as z2 } from "zod";
function registerAllPrompts(server2) {
  server2.prompt(
    "strategic-assessment",
    "Generate comprehensive strategic assessment from active goals, beliefs, and situation snapshot",
    {
      project: z2.string().optional().describe("Target project slug"),
      focus_area: z2.string().optional().describe('Specific focus area (e.g. "combat", "economy", "exploration")')
    },
    async (args) => {
      const focus = args.focus_area || "general autonomous operation";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Perform a strategic assessment for project "${args.project || "default"}" focusing on ${focus}. Review active goals via \`set_goal(list)\`, query current beliefs with \`manage_beliefs(query)\`, and evaluate situation with \`evaluate_situation(snapshot)\`. Output prioritized intentions and recommendations.`
            }
          }
        ]
      };
    }
  );
  server2.prompt(
    "goal-planning",
    "Decompose high-level strategic objectives into structured sub-goal DAGs with verifiable success criteria",
    {
      objective: z2.string().describe("High-level mission objective to plan"),
      priority: z2.string().optional().describe("Priority level (0.0 to 1.0)")
    },
    async (args) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Plan and decompose the following objective into a structured DAG of actionable subgoals: "${args.objective}". Use \`set_goal(create)\` and \`set_goal(decompose)\` with clear success criteria and priority ${args.priority || "0.8"}.`
            }
          }
        ]
      };
    }
  );
  server2.prompt(
    "risk-evaluation",
    "Perform quantitative threat and opportunity analysis for proposed action plans",
    {
      proposed_action: z2.string().describe("Proposed behavior or action plan"),
      threat_context: z2.string().optional().describe("Known environmental threats or constraints")
    },
    async (args) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Evaluate risk for proposed action "${args.proposed_action}". Context: "${args.threat_context || "Standard operations"}". Call \`assess_risk(action)\` and compute threat/opportunity trade-offs against active utility weights.`
            }
          }
        ]
      };
    }
  );
  server2.prompt(
    "post-mortem",
    "Analyze decision trace and outcome results to extract heuristic knowledge patterns and lessons learned",
    {
      trace_id: z2.string().describe("Decision trace ID to analyze")
    },
    async (args) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Conduct a post-mortem review on decision trace "${args.trace_id}". Retrieve the step-by-step reasoning chain with \`get_decision_trace(explain)\` and extract reusable tactics or anti-patterns into \`query_knowledge\`.`
            }
          }
        ]
      };
    }
  );
}

// src/server.ts
var server = new McpServer({
  name: "io.github.putervision/agent-reasoning-mcp",
  version: getVersion()
});
function getVarString(val) {
  if (Array.isArray(val)) return val[0];
  return val;
}
server.registerResource(
  "reasoning-summary",
  new ResourceTemplate("reasoning:///{project}/summary", { list: void 0 }),
  {
    title: "Reasoning Engine Summary Template",
    description: "High-level BDI cognitive state: active goals, top beliefs, and intention queue health",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const goals = GoalEngine.listGoals(db, { project, status: "active", limit: 10 });
    const beliefs = BeliefEngine.queryBeliefs(db, { project, limit: 10 });
    const intentions = IntentionEngine.listIntentions(db, { project, status: "pending", limit: 10 });
    const activeProfile = UtilityProfileEngine.getActiveProfile(db, project);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ project, activeProfile, active_goals: goals.length, beliefs_count: beliefs.length, pending_intentions: intentions.length }, null, 2)
        }
      ]
    };
  }
);
server.registerResource(
  "reasoning-goals",
  new ResourceTemplate("reasoning:///{project}/goals", { list: void 0 }),
  {
    title: "Reasoning Active Goals Template",
    description: "Active goal hierarchy and task DAGs",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = GoalEngine.listGoals(db, { project, status: "active", limit: 100 });
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
    };
  }
);
server.registerResource(
  "reasoning-beliefs",
  new ResourceTemplate("reasoning:///{project}/beliefs", { list: void 0 }),
  {
    title: "Reasoning Active Beliefs Template",
    description: "Beliefs with confidence decay ratings",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = BeliefEngine.queryBeliefs(db, { project, limit: 100 });
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
    };
  }
);
server.registerResource(
  "reasoning-intentions",
  new ResourceTemplate("reasoning:///{project}/intentions", { list: void 0 }),
  {
    title: "Reasoning Intentions Queue Template",
    description: "Queued and running intentions dispatched to runtime",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = IntentionEngine.listIntentions(db, { project, limit: 100 });
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
    };
  }
);
server.registerResource(
  "reasoning-traces",
  new ResourceTemplate("reasoning:///{project}/traces", { list: void 0 }),
  {
    title: "Reasoning Decision Traces Template",
    description: "Historical chain-of-thought decision logs",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = DecisionTraceEngine.listTraces(db, { project, limit: 50 });
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
    };
  }
);
server.registerResource(
  "reasoning-profiles",
  new ResourceTemplate("reasoning:///{project}/profiles", { list: void 0 }),
  {
    title: "Reasoning Utility Profiles Template",
    description: "Configured utility scoring profiles and weights",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = UtilityProfileEngine.listProfiles(db, project);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
    };
  }
);
server.registerResource(
  "reasoning-knowledge",
  new ResourceTemplate("reasoning:///{project}/knowledge", { list: void 0 }),
  {
    title: "Reasoning Knowledge Patterns Template",
    description: "Learned tactics, heuristics, and anti-patterns",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = KnowledgeEngine.queryKnowledge(db, { project, limit: 100 });
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
    };
  }
);
server.registerResource(
  "reasoning-active-loop",
  new ResourceTemplate("reasoning:///{project}/active_loop", { list: void 0 }),
  {
    title: "Reasoning Active Pentad Loop Telemetry",
    description: "Current loop state linking goal, intention, and latest outcome",
    mimeType: "application/json"
  },
  async (uri, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const topGoal = GoalEngine.listGoals(db, { project, status: "active", limit: 1 })[0] || null;
    const topIntention = IntentionEngine.listIntentions(db, { project, status: "dispatched", limit: 1 })[0] || null;
    const latestTrace = DecisionTraceEngine.getLatestTrace(db, project);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ project, active_goal: topGoal, active_intention: topIntention, latest_trace: latestTrace }, null, 2)
        }
      ]
    };
  }
);
registerAllTools(server);
registerAllPrompts(server);

export {
  UtilityProfileEngine,
  DecisionTraceEngine,
  UtilityEngine,
  RiskEngine,
  EvaluatorEngine,
  ReplannerEngine,
  KnowledgeEngine,
  SnapshotEngine,
  server
};
//# sourceMappingURL=chunk-VKYDKRCK.js.map