// src/utils/logger.ts
var LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
function getLogLevel() {
  const envLevel = (process.env.REASONING_LOG_LEVEL || process.env.AGENT_REASONING_MCP_LOG_LEVEL)?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return LOG_LEVELS[envLevel];
  }
  return LOG_LEVELS.info;
}
var logger = {
  debug: (message, ...args) => {
    if (getLogLevel() <= LOG_LEVELS.debug) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message, ...args) => {
    if (getLogLevel() <= LOG_LEVELS.info) {
      console.error(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message, ...args) => {
    if (getLogLevel() <= LOG_LEVELS.warn) {
      console.error(`[WARN] ${message}`, ...args);
    }
  },
  error: (message, ...args) => {
    if (getLogLevel() <= LOG_LEVELS.error) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
};

// src/utils/errors.ts
var ReasoningError = class extends Error {
  code;
  details;
  constructor(message, code = "INTERNAL_ERROR", details) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var DatabaseError = class extends ReasoningError {
  constructor(message, details) {
    super(message, "DATABASE_ERROR", details);
  }
};
var ValidationError = class extends ReasoningError {
  constructor(message, details) {
    super(message, "VALIDATION_ERROR", details);
  }
};
var NotFoundError = class extends ReasoningError {
  constructor(message, details) {
    super(message, "NOT_FOUND_ERROR", details);
  }
};
var ConflictError = class extends ReasoningError {
  constructor(message, details) {
    super(message, "CONFLICT_ERROR", details);
  }
};

// src/engine/db.ts
import Database from "better-sqlite3";
import * as path3 from "path";
import * as fs2 from "fs";
import * as os2 from "os";

// src/engine/config.ts
import * as fs from "fs";
import * as path from "path";
var cachedConfigs = /* @__PURE__ */ new Map();
var CONFIG_TTL_MS = 2e3;
function loadProjectConfig(projectRoot) {
  const now = Date.now();
  const cached = cachedConfigs.get(projectRoot);
  if (cached && now - cached.timestamp < CONFIG_TTL_MS) {
    return cached.config;
  }
  const configPath = path.join(projectRoot, ".agent-reasoning-mcp.json");
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      config = JSON.parse(raw);
    } catch (err) {
      logger.warn(`Failed to parse .agent-reasoning-mcp.json: ${err.message}`);
    }
  }
  cachedConfigs.set(projectRoot, { config, timestamp: now });
  return config;
}

// src/utils/path-validator.ts
import * as path2 from "path";
import * as os from "os";
function getDefaultAllowedDirs(projectRoot) {
  const resolvedRoot = path2.resolve(projectRoot);
  const homeBackups = path2.join(os.homedir(), ".agent-reasoning-mcp", "backups");
  return [resolvedRoot, homeBackups];
}
function loadPathConfig(projectRoot) {
  return {
    projectRoot: path2.resolve(projectRoot),
    allowedExportDirs: getDefaultAllowedDirs(projectRoot)
  };
}
function validatePath(filePath, config) {
  if (!filePath || typeof filePath !== "string") {
    throw new ValidationError("File path must be a non-empty string.");
  }
  let resolved;
  if (path2.isAbsolute(filePath)) {
    resolved = path2.resolve(filePath);
  } else {
    resolved = path2.resolve(config.projectRoot, filePath);
  }
  const allowed = (config.allowedExportDirs || [config.projectRoot]).map((d) => path2.resolve(d));
  const isAllowed = allowed.some((dir) => {
    return resolved === dir || resolved.startsWith(dir + path2.sep);
  });
  if (!isAllowed) {
    throw new ValidationError(
      `Access denied: path "${filePath}" resolves outside allowed directories.`
    );
  }
  return resolved;
}

// src/engine/migrations.ts
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const currentVersionRow = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get();
  const currentVersion = currentVersionRow ? parseInt(currentVersionRow.value, 10) : 0;
  if (currentVersion < 1) {
    logger.info("Applying migration v1 for agent-reasoning-mcp...");
    db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
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
      CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project);
      CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(project, status);
      CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id);
      CREATE INDEX IF NOT EXISTS idx_goals_client_req ON goals(project, client_request_id);

      CREATE TABLE IF NOT EXISTS beliefs (
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
      CREATE INDEX IF NOT EXISTS idx_beliefs_project ON beliefs(project);
      CREATE INDEX IF NOT EXISTS idx_beliefs_category ON beliefs(project, category);
      CREATE INDEX IF NOT EXISTS idx_beliefs_subject ON beliefs(project, subject);
      CREATE INDEX IF NOT EXISTS idx_beliefs_client_req ON beliefs(project, client_request_id);

      CREATE TABLE IF NOT EXISTS decision_traces (
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
      CREATE INDEX IF NOT EXISTS idx_traces_project ON decision_traces(project);
      CREATE INDEX IF NOT EXISTS idx_traces_goal ON decision_traces(goal_id);
      CREATE INDEX IF NOT EXISTS idx_traces_created ON decision_traces(created_at);

      CREATE TABLE IF NOT EXISTS utility_profiles (
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
      CREATE INDEX IF NOT EXISTS idx_profiles_project ON utility_profiles(project);

      CREATE TABLE IF NOT EXISTS intentions (
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
      CREATE INDEX IF NOT EXISTS idx_intentions_project ON intentions(project);
      CREATE INDEX IF NOT EXISTS idx_intentions_status ON intentions(project, status);
      CREATE INDEX IF NOT EXISTS idx_intentions_goal ON intentions(goal_id);
      CREATE INDEX IF NOT EXISTS idx_intentions_client_req ON intentions(project, client_request_id);

      CREATE TABLE IF NOT EXISTS knowledge_patterns (
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
      CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_patterns(project);
      CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_patterns(project, pattern_type);

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        action TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        details_json TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_project ON events(project);
      CREATE INDEX IF NOT EXISTS idx_events_entity ON events(project, entity_id);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(project, name)
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project);

      INSERT INTO schema_meta (key, value) VALUES ('version', '1')
      ON CONFLICT(key) DO UPDATE SET value = '1';
    `);
  }
}

// src/engine/db.ts
function validatePath2(filePath, project) {
  const projectRoot = resolveProjectRoot(project);
  const pathConfig = loadPathConfig(projectRoot);
  return validatePath(filePath, pathConfig);
}
var DEFAULT_REGISTRY_PATH = path3.join(os2.homedir(), ".agent-reasoning-mcp", "projects.json");
function getRegistryPath() {
  return process.env.REASONING_REGISTRY_PATH || DEFAULT_REGISTRY_PATH;
}
var registryCache = null;
var REGISTRY_TTL_MS = 2e3;
function getRegistry() {
  const now = Date.now();
  if (registryCache && now - registryCache.timestamp < REGISTRY_TTL_MS) {
    return registryCache.registry;
  }
  const regPath = getRegistryPath();
  try {
    if (fs2.existsSync(regPath)) {
      const raw = fs2.readFileSync(regPath, "utf-8");
      const registry = JSON.parse(raw);
      registryCache = { registry, timestamp: now };
      return registry;
    }
  } catch (err) {
    logger.warn(`Failed to read registry: ${err.message}`);
  }
  return {};
}
function registerProject(projectName, projectRoot) {
  const regPath = getRegistryPath();
  const dir = path3.dirname(regPath);
  if (!fs2.existsSync(dir)) {
    fs2.mkdirSync(dir, { recursive: true });
  }
  const registry = getRegistry();
  const slug = sanitizeSlug(projectName);
  registry[slug] = path3.resolve(projectRoot);
  const tmpPath = `${regPath}.tmp.${Math.random().toString(36).substring(2, 8)}`;
  fs2.writeFileSync(tmpPath, JSON.stringify(registry, null, 2) + "\n", { mode: 384 });
  fs2.renameSync(tmpPath, regPath);
  registryCache = { registry, timestamp: Date.now() };
  logger.debug(`Registered project: ${slug} -> ${projectRoot}`);
}
function unregisterProject(projectName) {
  const regPath = getRegistryPath();
  const registry = getRegistry();
  const slug = sanitizeSlug(projectName);
  if (registry[slug]) {
    delete registry[slug];
    const tmpPath = `${regPath}.tmp.${Math.random().toString(36).substring(2, 8)}`;
    fs2.writeFileSync(tmpPath, JSON.stringify(registry, null, 2) + "\n", { mode: 384 });
    fs2.renameSync(tmpPath, regPath);
    registryCache = { registry, timestamp: Date.now() };
  }
}
function sanitizeSlug(str) {
  return str.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function resolveProjectRoot(project, cwd = process.cwd()) {
  if (project) {
    const registry = getRegistry();
    const slug = sanitizeSlug(project);
    if (registry[slug] && fs2.existsSync(registry[slug])) {
      return registry[slug];
    }
    if (registry[project] && fs2.existsSync(registry[project])) {
      return registry[project];
    }
  }
  let curr = path3.resolve(cwd);
  const home = os2.homedir();
  while (curr !== path3.dirname(curr) && curr !== home) {
    if (fs2.existsSync(path3.join(curr, ".git")) || fs2.existsSync(path3.join(curr, ".agent-reasoning-mcp"))) {
      return curr;
    }
    curr = path3.dirname(curr);
  }
  return path3.resolve(cwd);
}
function getProjectSlug(project, cwd = process.cwd()) {
  if (project && project.trim().length > 0) {
    return sanitizeSlug(project);
  }
  const root = resolveProjectRoot(project, cwd);
  const config = loadProjectConfig(root);
  if (config.projectName) {
    return sanitizeSlug(config.projectName);
  }
  return sanitizeSlug(path3.basename(root));
}
function getBaseDir(projectRoot) {
  const config = loadProjectConfig(projectRoot);
  if (config.storagePath) {
    return path3.resolve(projectRoot, config.storagePath);
  }
  if (process.env.REASONING_MCP_DIR || process.env.AGENT_REASONING_MCP_DIR) {
    return path3.resolve(projectRoot, process.env.REASONING_MCP_DIR || process.env.AGENT_REASONING_MCP_DIR);
  }
  return path3.join(projectRoot, ".agent-reasoning-mcp");
}
function getProjectDbDir(project, cwd = process.cwd()) {
  const root = resolveProjectRoot(project, cwd);
  const slug = getProjectSlug(project, cwd);
  const baseDir = getBaseDir(root);
  return path3.join(baseDir, slug);
}
function getDbPath(project, cwd = process.cwd()) {
  const dbDir = getProjectDbDir(project, cwd);
  return path3.join(dbDir, "reasoning.db");
}
var dbCache = /* @__PURE__ */ new Map();
var readOnlyDbCache = /* @__PURE__ */ new Map();
var MAX_CACHED_DBS = 5;
function getDb(project, cwd = process.cwd()) {
  const dbPath = getDbPath(project, cwd);
  if (dbCache.has(dbPath)) {
    return dbCache.get(dbPath);
  }
  const dbDir = path3.dirname(dbPath);
  if (!fs2.existsSync(dbDir)) {
    fs2.mkdirSync(dbDir, { recursive: true, mode: 448 });
  }
  const root = resolveProjectRoot(project, cwd);
  const config = loadProjectConfig(root);
  try {
    const db = new Database(dbPath, {
      timeout: config.busyTimeoutMs || 5e3
    });
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma(`busy_timeout = ${config.busyTimeoutMs || 5e3}`);
    db.pragma("foreign_keys = ON");
    db.pragma("cache_size = -20000");
    db.pragma(`mmap_size = ${config.mmapSizeBytes || 134217728}`);
    db.pragma("trusted_schema = OFF");
    runMigrations(db);
    if (dbCache.size >= MAX_CACHED_DBS) {
      const firstKey = dbCache.keys().next().value;
      if (firstKey) {
        try {
          dbCache.get(firstKey)?.close();
        } catch {
        }
        dbCache.delete(firstKey);
      }
    }
    dbCache.set(dbPath, db);
    return db;
  } catch (err) {
    throw new DatabaseError(`Failed to open agent-reasoning database at ${dbPath}: ${err.message}`);
  }
}
function getReadOnlyDb(project, cwd = process.cwd()) {
  const dbPath = getDbPath(project, cwd);
  if (readOnlyDbCache.has(dbPath)) {
    return readOnlyDbCache.get(dbPath);
  }
  if (!fs2.existsSync(dbPath)) {
    getDb(project, cwd);
  }
  const root = resolveProjectRoot(project, cwd);
  const config = loadProjectConfig(root);
  try {
    const db = new Database(dbPath, {
      readonly: true,
      timeout: config.busyTimeoutMs || 5e3
    });
    db.pragma("query_only = ON");
    db.pragma(`busy_timeout = ${config.busyTimeoutMs || 5e3}`);
    db.pragma("foreign_keys = ON");
    db.pragma("enable_load_extension = 0");
    db.pragma("cache_size = -20000");
    db.pragma(`mmap_size = ${config.mmapSizeBytes || 134217728}`);
    db.pragma("trusted_schema = OFF");
    if (readOnlyDbCache.size >= MAX_CACHED_DBS) {
      const firstKey = readOnlyDbCache.keys().next().value;
      if (firstKey) {
        try {
          readOnlyDbCache.get(firstKey)?.close();
        } catch {
        }
        readOnlyDbCache.delete(firstKey);
      }
    }
    readOnlyDbCache.set(dbPath, db);
    return db;
  } catch (err) {
    throw new DatabaseError(`Failed to open read-only reasoning database at ${dbPath}: ${err.message}`);
  }
}
function closeDb(project, cwd = process.cwd()) {
  const dbPath = getDbPath(project, cwd);
  if (dbCache.has(dbPath)) {
    try {
      dbCache.get(dbPath)?.close();
    } catch {
    }
    dbCache.delete(dbPath);
  }
  if (readOnlyDbCache.has(dbPath)) {
    try {
      readOnlyDbCache.get(dbPath)?.close();
    } catch {
    }
    readOnlyDbCache.delete(dbPath);
  }
}
function closeAllDbs() {
  for (const [key, db] of dbCache.entries()) {
    try {
      db.close();
    } catch {
    }
  }
  dbCache.clear();
  for (const [key, db] of readOnlyDbCache.entries()) {
    try {
      db.close();
    } catch {
    }
  }
  readOnlyDbCache.clear();
}

// src/utils/id.ts
import * as crypto from "crypto";
var ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function generateId() {
  let now = Date.now();
  let timeStr = "";
  for (let i = 0; i < 10; i++) {
    const mod = now % 32;
    timeStr = ENCODING.charAt(mod) + timeStr;
    now = Math.floor(now / 32);
  }
  const randomBytes2 = crypto.randomBytes(16);
  let randomStr = "";
  for (let i = 0; i < 16; i++) {
    randomStr += ENCODING.charAt(randomBytes2[i] % 32);
  }
  return timeStr + randomStr;
}

// src/utils/time.ts
function getCurrentIsoString() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function parseIsoString(iso) {
  return new Date(iso);
}
function getElapsedTimeMs(startTimeIso) {
  return Date.now() - new Date(startTimeIso).getTime();
}

// src/engine/events.ts
import crypto2 from "crypto";

// src/utils/json-validator.ts
function safeJsonParse(str, fallback) {
  if (!str || typeof str !== "string") return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
function safeJsonStringify(obj, fallback = "{}") {
  try {
    return JSON.stringify(obj);
  } catch {
    return fallback;
  }
}

// src/engine/events.ts
function computeEventHash(params) {
  const data = [
    params.prev_hash,
    params.id,
    params.project,
    params.entity_id,
    params.entity_type,
    params.action,
    params.timestamp,
    JSON.stringify(params.details || {})
  ].join("|");
  return crypto2.createHash("sha256").update(data).digest("hex");
}
function logReasoningEvent(db, params) {
  const lastRow = db.prepare("SELECT hash FROM events WHERE project = ? ORDER BY rowid DESC LIMIT 1").get(params.project);
  const prevHash = lastRow?.hash || "0".repeat(64);
  const eventId = generateId();
  const timestamp = getCurrentIsoString();
  const hash = computeEventHash({
    prev_hash: prevHash,
    id: eventId,
    project: params.project,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    action: params.action,
    timestamp,
    details: params.details
  });
  db.prepare(`
    INSERT INTO events (id, project, entity_id, entity_type, action, prev_hash, hash, details_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    params.project,
    params.entity_id,
    params.entity_type,
    params.action,
    prevHash,
    hash,
    JSON.stringify(params.details || {}),
    timestamp
  );
  return {
    id: eventId,
    project: params.project,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    action: params.action,
    prev_hash: prevHash,
    hash,
    details: params.details,
    timestamp
  };
}
function verifyEventChain(db, project) {
  const rows = db.prepare("SELECT * FROM events WHERE project = ? ORDER BY rowid ASC").all(project);
  if (rows.length === 0) {
    return { valid: true, total_events: 0 };
  }
  let expectedPrevHash = "0".repeat(64);
  for (const row of rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        total_events: rows.length,
        corrupted_event_id: row.id,
        error: `Prev hash mismatch at event ${row.id}: expected ${expectedPrevHash}, found ${row.prev_hash}`
      };
    }
    const calculatedHash = computeEventHash({
      prev_hash: row.prev_hash,
      id: row.id,
      project: row.project,
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      action: row.action,
      timestamp: row.timestamp,
      details: safeJsonParse(row.details_json, {})
    });
    if (calculatedHash !== row.hash) {
      return {
        valid: false,
        total_events: rows.length,
        corrupted_event_id: row.id,
        error: `Data tamper detected at event ${row.id}: hash mismatch`
      };
    }
    expectedPrevHash = row.hash;
  }
  return { valid: true, total_events: rows.length };
}

// src/engine/goals.ts
var GoalEngine = class {
  static createGoal(db, params) {
    if (!params.title || typeof params.title !== "string") {
      throw new ValidationError("Goal title is required.");
    }
    if (params.client_request_id) {
      const existing = db.prepare("SELECT * FROM goals WHERE project = ? AND client_request_id = ?").get(params.project, params.client_request_id);
      if (existing) {
        return this.mapRowToGoal(existing);
      }
    }
    if (params.parent_id) {
      const parent = db.prepare("SELECT id FROM goals WHERE project = ? AND id = ?").get(params.project, params.parent_id);
      if (!parent) {
        throw new NotFoundError(`Parent goal ${params.parent_id} not found.`);
      }
    }
    const id = generateId();
    const now = getCurrentIsoString();
    const status = params.status || "active";
    const priority = params.priority !== void 0 ? params.priority : 0.5;
    db.prepare(`
      INSERT INTO goals (
        id, project, session_id, parent_id, title, description, status, priority,
        utility_weights_json, deadline_at, progress, success_criteria_json,
        metadata_json, client_request_id, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      params.project,
      params.session_id ?? null,
      params.parent_id ?? null,
      params.title,
      params.description ?? null,
      status,
      priority,
      params.utility_weights ? safeJsonStringify(params.utility_weights) : null,
      params.deadline_at ?? null,
      params.success_criteria ? safeJsonStringify(params.success_criteria) : null,
      params.metadata ? safeJsonStringify(params.metadata) : null,
      params.client_request_id ?? null,
      now,
      now
    );
    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: "goal",
      action: "create",
      details: { title: params.title, priority, parent_id: params.parent_id }
    });
    return {
      id,
      project: params.project,
      session_id: params.session_id,
      parent_id: params.parent_id || null,
      title: params.title,
      description: params.description,
      status,
      priority,
      utility_weights: params.utility_weights,
      deadline_at: params.deadline_at,
      progress: 0,
      success_criteria: params.success_criteria,
      metadata: params.metadata,
      client_request_id: params.client_request_id,
      created_at: now,
      updated_at: now,
      version: 1
    };
  }
  static updateGoal(db, params) {
    const existing = db.prepare("SELECT * FROM goals WHERE project = ? AND id = ?").get(params.project, params.id);
    if (!existing) {
      throw new NotFoundError(`Goal ${params.id} not found.`);
    }
    const now = getCurrentIsoString();
    const title = params.title ?? existing.title;
    const description = params.description ?? existing.description;
    const status = params.status ?? existing.status;
    const priority = params.priority !== void 0 ? params.priority : existing.priority;
    const progress = params.progress !== void 0 ? params.progress : existing.progress;
    const failure_reason = params.failure_reason ?? existing.failure_reason;
    const metadata_json = params.metadata ? safeJsonStringify({ ...safeJsonParse(existing.metadata_json, {}), ...params.metadata }) : existing.metadata_json;
    const version = existing.version + 1;
    db.prepare(`
      UPDATE goals SET
        title = ?, description = ?, status = ?, priority = ?, progress = ?,
        failure_reason = ?, metadata_json = ?, updated_at = ?, version = ?
      WHERE project = ? AND id = ?
    `).run(title, description, status, priority, progress, failure_reason, metadata_json, now, version, params.project, params.id);
    logReasoningEvent(db, {
      project: params.project,
      entity_id: params.id,
      entity_type: "goal",
      action: "update",
      details: { title, status, priority, progress }
    });
    return this.getGoal(db, { project: params.project, id: params.id });
  }
  static decomposeGoal(db, params) {
    const parent = this.getGoal(db, { project: params.project, id: params.parent_id });
    const created = [];
    db.transaction(() => {
      for (const sub of params.subgoals) {
        const goal = this.createGoal(db, {
          project: params.project,
          session_id: parent.session_id,
          parent_id: parent.id,
          title: sub.title,
          description: sub.description,
          priority: sub.priority !== void 0 ? sub.priority : parent.priority
        });
        created.push(goal);
      }
    })();
    return { parent_goal: parent, subgoals: created };
  }
  static getGoal(db, params) {
    const row = db.prepare("SELECT * FROM goals WHERE project = ? AND id = ?").get(params.project, params.id);
    if (!row) throw new NotFoundError(`Goal ${params.id} not found.`);
    return this.mapRowToGoal(row);
  }
  static listGoals(db, params) {
    let sql = "SELECT * FROM goals WHERE project = ?";
    const sqlParams = [params.project];
    if (params.status) {
      sql += " AND status = ?";
      sqlParams.push(params.status);
    }
    if (params.parent_id !== void 0) {
      if (params.parent_id === "null" || params.parent_id === "") {
        sql += " AND parent_id IS NULL";
      } else {
        sql += " AND parent_id = ?";
        sqlParams.push(params.parent_id);
      }
    }
    sql += " ORDER BY priority DESC, created_at ASC LIMIT ?";
    sqlParams.push(params.limit || 100);
    const rows = db.prepare(sql).all(...sqlParams);
    return rows.map((r) => this.mapRowToGoal(r));
  }
  static abandonGoal(db, params) {
    return this.updateGoal(db, {
      project: params.project,
      id: params.id,
      status: "abandoned",
      failure_reason: params.reason || "Goal manually abandoned."
    });
  }
  static mapRowToGoal(row) {
    return {
      id: row.id,
      project: row.project,
      session_id: row.session_id,
      parent_id: row.parent_id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      utility_weights: safeJsonParse(row.utility_weights_json, void 0),
      deadline_at: row.deadline_at,
      progress: row.progress,
      success_criteria: safeJsonParse(row.success_criteria_json, void 0),
      failure_reason: row.failure_reason,
      metadata: safeJsonParse(row.metadata_json, void 0),
      client_request_id: row.client_request_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version
    };
  }
};

// src/engine/beliefs.ts
var BeliefEngine = class {
  static updateBelief(db, params) {
    if (!params.subject || !params.predicate) {
      throw new ValidationError("Belief subject and predicate are required.");
    }
    if (params.client_request_id) {
      const existing2 = db.prepare("SELECT * FROM beliefs WHERE project = ? AND client_request_id = ?").get(params.project, params.client_request_id);
      if (existing2) {
        return this.mapRowToBelief(existing2);
      }
    }
    const existing = db.prepare("SELECT * FROM beliefs WHERE project = ? AND category = ? AND subject = ? AND predicate = ?").get(params.project, params.category, params.subject, params.predicate);
    const now = getCurrentIsoString();
    const confidence = params.confidence !== void 0 ? Math.max(0, Math.min(1, params.confidence)) : 1;
    const decay_rate = params.decay_rate !== void 0 ? params.decay_rate : params.category === "spatial" ? 0.2 : 0.05;
    if (existing) {
      db.prepare(`
        UPDATE beliefs SET
          object_json = ?, confidence = ?, source = ?, source_id = ?,
          expires_at = ?, decay_rate = ?, last_decayed_at = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        safeJsonStringify(params.object),
        confidence,
        params.source || existing.source,
        params.source_id ?? existing.source_id,
        params.expires_at ?? existing.expires_at,
        decay_rate,
        now,
        params.metadata ? safeJsonStringify(params.metadata) : existing.metadata_json,
        now,
        existing.id
      );
      logReasoningEvent(db, {
        project: params.project,
        entity_id: existing.id,
        entity_type: "belief",
        action: "update",
        details: { subject: params.subject, predicate: params.predicate, confidence }
      });
      return this.getBelief(db, { project: params.project, id: existing.id });
    }
    const id = generateId();
    db.prepare(`
      INSERT INTO beliefs (
        id, project, session_id, category, subject, predicate, object_json,
        confidence, source, source_id, expires_at, decay_rate, last_decayed_at,
        client_request_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.project,
      params.session_id ?? null,
      params.category,
      params.subject,
      params.predicate,
      safeJsonStringify(params.object),
      confidence,
      params.source || "observation",
      params.source_id ?? null,
      params.expires_at ?? null,
      decay_rate,
      now,
      params.client_request_id ?? null,
      params.metadata ? safeJsonStringify(params.metadata) : null,
      now,
      now
    );
    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: "belief",
      action: "assert",
      details: { subject: params.subject, predicate: params.predicate, confidence }
    });
    return {
      id,
      project: params.project,
      session_id: params.session_id,
      category: params.category,
      subject: params.subject,
      predicate: params.predicate,
      object: params.object,
      confidence,
      source: params.source || "observation",
      source_id: params.source_id,
      expires_at: params.expires_at,
      decay_rate,
      last_decayed_at: now,
      client_request_id: params.client_request_id,
      metadata: params.metadata,
      created_at: now,
      updated_at: now
    };
  }
  static queryBeliefs(db, params) {
    this.decayBeliefs(db, params.project);
    let sql = "SELECT * FROM beliefs WHERE project = ?";
    const sqlParams = [params.project];
    if (params.category) {
      sql += " AND category = ?";
      sqlParams.push(params.category);
    }
    if (params.subject) {
      sql += " AND subject LIKE ?";
      sqlParams.push(`%${params.subject}%`);
    }
    if (params.predicate) {
      sql += " AND predicate = ?";
      sqlParams.push(params.predicate);
    }
    if (params.min_confidence !== void 0) {
      sql += " AND confidence >= ?";
      sqlParams.push(params.min_confidence);
    }
    sql += " ORDER BY confidence DESC, updated_at DESC LIMIT ?";
    sqlParams.push(params.limit || 50);
    const rows = db.prepare(sql).all(...sqlParams);
    return rows.map((r) => this.mapRowToBelief(r));
  }
  static decayBeliefs(db, project) {
    const now = Date.now();
    const rows = db.prepare("SELECT id, confidence, decay_rate, last_decayed_at FROM beliefs WHERE project = ?").all(project);
    db.transaction(() => {
      const updateStmt = db.prepare("UPDATE beliefs SET confidence = ?, last_decayed_at = ? WHERE id = ?");
      for (const row of rows) {
        if (!row.last_decayed_at) continue;
        const elapsedHours = (now - new Date(row.last_decayed_at).getTime()) / (1e3 * 60 * 60);
        if (elapsedHours > 0.01) {
          const newConf = Math.max(0.01, row.confidence * Math.exp(-row.decay_rate * elapsedHours));
          updateStmt.run(newConf, new Date(now).toISOString(), row.id);
        }
      }
    })();
  }
  static expireBeliefs(db, project) {
    const now = getCurrentIsoString();
    const res = db.prepare("DELETE FROM beliefs WHERE project = ? AND expires_at IS NOT NULL AND expires_at < ?").run(project, now);
    return res.changes;
  }
  static getBelief(db, params) {
    const row = db.prepare("SELECT * FROM beliefs WHERE project = ? AND id = ?").get(params.project, params.id);
    if (!row) throw new NotFoundError(`Belief ${params.id} not found.`);
    return this.mapRowToBelief(row);
  }
  static mapRowToBelief(row) {
    return {
      id: row.id,
      project: row.project,
      session_id: row.session_id,
      category: row.category,
      subject: row.subject,
      predicate: row.predicate,
      object: safeJsonParse(row.object_json, row.object_json),
      confidence: row.confidence,
      source: row.source,
      source_id: row.source_id,
      expires_at: row.expires_at,
      decay_rate: row.decay_rate,
      last_decayed_at: row.last_decayed_at,
      client_request_id: row.client_request_id,
      metadata: safeJsonParse(row.metadata_json, void 0),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
};

// src/engine/intentions.ts
var IntentionEngine = class {
  static createIntention(db, params) {
    if (!params.goal_id || !params.behavior_name) {
      throw new ValidationError("goal_id and behavior_name are required.");
    }
    if (params.client_request_id) {
      const existing = db.prepare("SELECT * FROM intentions WHERE project = ? AND client_request_id = ?").get(params.project, params.client_request_id);
      if (existing) {
        return this.mapRowToIntention(existing);
      }
    }
    const id = generateId();
    const now = getCurrentIsoString();
    const priority = params.priority !== void 0 ? params.priority : 0.5;
    db.prepare(`
      INSERT INTO intentions (
        id, project, goal_id, trace_id, session_id, behavior_name,
        parameters_json, priority, status, deadline_at, abort_conditions_json,
        client_request_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(
      id,
      params.project,
      params.goal_id,
      params.trace_id ?? null,
      params.session_id ?? null,
      params.behavior_name,
      safeJsonStringify(params.parameters || {}),
      priority,
      params.deadline_at ?? null,
      params.abort_conditions ? safeJsonStringify(params.abort_conditions) : null,
      params.client_request_id ?? null,
      now,
      now
    );
    logReasoningEvent(db, {
      project: params.project,
      entity_id: id,
      entity_type: "intention",
      action: "create",
      details: { goal_id: params.goal_id, behavior_name: params.behavior_name }
    });
    return {
      id,
      project: params.project,
      goal_id: params.goal_id,
      trace_id: params.trace_id || void 0,
      session_id: params.session_id,
      behavior_name: params.behavior_name,
      parameters: params.parameters || {},
      priority,
      status: "pending",
      deadline_at: params.deadline_at,
      abort_conditions: params.abort_conditions,
      client_request_id: params.client_request_id,
      created_at: now,
      updated_at: now
    };
  }
  static dispatchIntention(db, params) {
    const intention = this.getIntention(db, params);
    const now = getCurrentIsoString();
    db.prepare("UPDATE intentions SET status = ?, updated_at = ? WHERE id = ?").run("dispatched", now, intention.id);
    logReasoningEvent(db, {
      project: params.project,
      entity_id: intention.id,
      entity_type: "intention",
      action: "dispatch",
      details: { behavior_name: intention.behavior_name }
    });
    return { ...intention, status: "dispatched", updated_at: now };
  }
  static resolveIntention(db, params) {
    const intention = this.getIntention(db, params);
    const now = getCurrentIsoString();
    db.prepare("UPDATE intentions SET status = ?, result_json = ?, updated_at = ? WHERE id = ?").run(
      params.status,
      safeJsonStringify(params.result || {}),
      now,
      intention.id
    );
    logReasoningEvent(db, {
      project: params.project,
      entity_id: intention.id,
      entity_type: "intention",
      action: "resolve",
      details: { status: params.status, result: params.result }
    });
    return { ...intention, status: params.status, result: params.result, updated_at: now };
  }
  static getIntention(db, params) {
    const row = db.prepare("SELECT * FROM intentions WHERE project = ? AND id = ?").get(params.project, params.id);
    if (!row) throw new NotFoundError(`Intention ${params.id} not found.`);
    return this.mapRowToIntention(row);
  }
  static listIntentions(db, params) {
    let sql = "SELECT * FROM intentions WHERE project = ?";
    const sqlParams = [params.project];
    if (params.status) {
      sql += " AND status = ?";
      sqlParams.push(params.status);
    }
    if (params.goal_id) {
      sql += " AND goal_id = ?";
      sqlParams.push(params.goal_id);
    }
    sql += " ORDER BY priority DESC, created_at DESC LIMIT ?";
    sqlParams.push(params.limit || 50);
    const rows = db.prepare(sql).all(...sqlParams);
    return rows.map((r) => this.mapRowToIntention(r));
  }
  static mapRowToIntention(row) {
    return {
      id: row.id,
      project: row.project,
      goal_id: row.goal_id,
      trace_id: row.trace_id,
      session_id: row.session_id,
      behavior_name: row.behavior_name,
      parameters: safeJsonParse(row.parameters_json, {}),
      priority: row.priority,
      status: row.status,
      deadline_at: row.deadline_at,
      abort_conditions: safeJsonParse(row.abort_conditions_json, void 0),
      result: safeJsonParse(row.result_json, void 0),
      client_request_id: row.client_request_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
};

// src/utils/version.ts
function getVersion() {
  if (true) {
    return "0.1.0";
  }
  return "0.1.0";
}

export {
  LOG_LEVELS,
  getLogLevel,
  logger,
  ReasoningError,
  DatabaseError,
  ValidationError,
  NotFoundError,
  ConflictError,
  validatePath2 as validatePath,
  getRegistryPath,
  getRegistry,
  registerProject,
  unregisterProject,
  sanitizeSlug,
  resolveProjectRoot,
  getProjectSlug,
  getBaseDir,
  getProjectDbDir,
  getDbPath,
  getDb,
  getReadOnlyDb,
  closeDb,
  closeAllDbs,
  generateId,
  getCurrentIsoString,
  parseIsoString,
  getElapsedTimeMs,
  safeJsonParse,
  safeJsonStringify,
  computeEventHash,
  logReasoningEvent,
  verifyEventChain,
  GoalEngine,
  BeliefEngine,
  IntentionEngine,
  getVersion
};
//# sourceMappingURL=chunk-FB4TIUGM.js.map