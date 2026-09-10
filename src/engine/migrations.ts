import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const currentVersionRow = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string } | undefined;
  const currentVersion = currentVersionRow ? parseInt(currentVersionRow.value, 10) : 0;

  if (currentVersion < 1) {
    logger.info('Applying migration v1 for agent-reasoning-mcp...');
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
