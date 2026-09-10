import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { loadProjectConfig } from '../../src/engine/config.js';
import {
  registerProject,
  unregisterProject,
  getRegistry,
  sanitizeSlug,
  resolveProjectRoot,
  getProjectSlug,
  getBaseDir,
  getDb,
  getReadOnlyDb,
  closeDb,
  closeAllDbs,
} from '../../src/engine/db.js';
import { KnowledgeEngine } from '../../src/engine/knowledge.js';
import { UtilityProfileEngine } from '../../src/engine/personality.js';
import { DecisionTraceEngine } from '../../src/engine/traces.js';
import { GoalEngine } from '../../src/engine/goals.js';
import { IntentionEngine } from '../../src/engine/intentions.js';
import { StateBridge } from '../../src/engine/bridge/state-bridge.js';
import { VisionBridge } from '../../src/engine/bridge/vision-bridge.js';
import { WorldBridge } from '../../src/engine/bridge/world-bridge.js';

describe('agent-reasoning-mcp Engine Services Deep Suite', () => {
  let tempDir: string;
  let db: Database.Database;
  const project = 'services-test-project';
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PUTERVISION_PROJECT_DIR;
    delete process.env.PUTERVISION_PROJECT_SLUG;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reasoning-deep-test-'));
    db = getDb(project, tempDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    closeAllDbs();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Config Module', () => {
    it('should load project config with default and custom values', () => {
      const confDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reasoning-conf-test-'));
      const configPath = path.join(confDir, '.agent-reasoning-mcp.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          projectName: 'Custom Agent',
          beliefDecayRate: 0.05,
          maxGoalDepth: 5,
        })
      );

      const config = loadProjectConfig(confDir);
      expect(config.projectName).toBe('Custom Agent');
      expect(config.beliefDecayRate).toBe(0.05);
      expect(config.maxGoalDepth).toBe(5);

      fs.rmSync(confDir, { recursive: true, force: true });
    });

    it('should fallback to defaults when config is invalid', () => {
      const confDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reasoning-conf-invalid-'));
      const configPath = path.join(confDir, '.agent-reasoning-mcp.json');
      fs.writeFileSync(configPath, '{ not json');

      const config = loadProjectConfig(confDir);
      expect(typeof config).toBe('object');
      expect(config.projectName).toBeUndefined();

      fs.rmSync(confDir, { recursive: true, force: true });
    });
  });

  describe('DB Registry & Path Resolution', () => {
    it('should sanitize project slugs cleanly', () => {
      expect(sanitizeSlug('Strategic Agent / 2026!')).toBe('strategic-agent-2026');
      expect(sanitizeSlug('---')).toBe('');
    });

    it('should register and unregister projects in registry', () => {
      registerProject('reasoning-slug', tempDir);
      const registry = getRegistry();
      expect(registry['reasoning-slug']).toBe(tempDir);

      unregisterProject('reasoning-slug');
      const updatedRegistry = getRegistry();
      expect(updatedRegistry['reasoning-slug']).toBeUndefined();
    });

    it('should resolve project slug and base dir', () => {
      const slug = getProjectSlug(undefined, tempDir);
      expect(typeof slug).toBe('string');

      const baseDir = getBaseDir(tempDir);
      expect(baseDir).toContain('.agent-reasoning-mcp');
    });

    it('should open read-write and read-only databases and apply pragmas', () => {
      const rwDb = getDb('rw-reason-proj', tempDir);
      expect(rwDb.open).toBe(true);

      const roDb = getReadOnlyDb('rw-reason-proj', tempDir);
      expect(roDb.open).toBe(true);

      const row = roDb.prepare('PRAGMA query_only').get() as any;
      expect(row.query_only).toBe(1);
    });

    it('should trigger connection pool LRU eviction when opening >5 databases', () => {
      for (let i = 1; i <= 7; i++) {
        const pSlug = `lru-reason-${i}`;
        const rw = getDb(pSlug, tempDir);
        expect(rw.open).toBe(true);
        const ro = getReadOnlyDb(pSlug, tempDir);
        expect(ro.open).toBe(true);
      }

      closeDb('lru-reason-7', tempDir);
    });
  });

  describe('KnowledgeEngine Unit Tests', () => {
    it('should register and search knowledge patterns with filters', () => {
      const pattern = KnowledgeEngine.createPattern(db, {
        project,
        pattern_type: 'heuristic',
        context_tags: ['combat', 'tactics'],
        situation_pattern: 'Ambushed from high ground',
        recommended_strategy: 'Deploy smoke and flank right',
        confidence: 0.9,
      });

      expect(pattern.id).toBeDefined();
      expect(pattern.situation_pattern).toContain('Ambushed');

      const searchResults = KnowledgeEngine.queryKnowledge(db, {
        project,
        query: 'flank',
        pattern_type: 'heuristic',
      });
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].recommended_strategy).toContain('Deploy smoke');
    });

    it('should seed default tactical gaming patterns idempotently', () => {
      const seeded = KnowledgeEngine.seedDefaultPatterns(db, 'seeded-proj');
      expect(seeded).toBe(3);

      const reseeded = KnowledgeEngine.seedDefaultPatterns(db, 'seeded-proj');
      expect(reseeded).toBe(0);

      const patterns = KnowledgeEngine.queryKnowledge(db, { project: 'seeded-proj' });
      expect(patterns.length).toBe(3);
    });
  });

  describe('UtilityProfileEngine Unit Tests', () => {
    it('should configure, retrieve, activate, and update utility profiles', () => {
      const profile = UtilityProfileEngine.configureProfile(db, {
        project,
        name: 'aggressive_scout',
        weights: { aggression: 0.9, caution: 0.1, exploration: 0.8 },
        is_active: false,
      });

      expect(profile.name).toBe('aggressive_scout');
      expect(profile.weights.aggression).toBe(0.9);

      // Update existing profile
      const updated = UtilityProfileEngine.configureProfile(db, {
        project,
        name: 'aggressive_scout',
        description: 'Updated profile description',
        weights: { aggression: 0.95, caution: 0.05 },
        is_active: true,
      });
      expect(updated.description).toBe('Updated profile description');
      expect(updated.is_active).toBe(true);

      const activeProfile = UtilityProfileEngine.getActiveProfile(db, project);
      expect(activeProfile.name).toBe('aggressive_scout');

      const activated = UtilityProfileEngine.activateProfile(db, {
        project,
        name: 'aggressive_scout',
      });
      expect(activated.is_active).toBe(true);

      const profiles = UtilityProfileEngine.listProfiles(db, project);
      expect(profiles.length).toBeGreaterThan(0);
    });
  });

  describe('Goals & Intentions & Traces Deep Query Filters', () => {
    it('should filter goals, traces, and intentions with specific parameters', () => {
      const goal = GoalEngine.createGoal(db, {
        project,
        title: 'Main Quest',
        priority: 0.9,
      });

      const sub = GoalEngine.createGoal(db, {
        project,
        parent_id: goal.id,
        title: 'Sub Quest',
        priority: 0.8,
      });

      // Filter goals by status and parent_id
      const filteredGoals = GoalEngine.listGoals(db, {
        project,
        status: 'active',
        parent_id: goal.id,
      });
      expect(filteredGoals.length).toBe(1);
      expect(filteredGoals[0].id).toBe(sub.id);

      const trace = DecisionTraceEngine.recordTrace(db, {
        project,
        goal_id: goal.id,
        situation_summary: 'Target identified',
        candidate_actions: [{ action: 'strike', estimated_utility: 0.9 }],
        utility_profile: 'balanced',
        chosen_action: 'strike',
        reasoning_chain: ['Optimal'],
      });

      // Filter traces by goal_id
      const traces = DecisionTraceEngine.listTraces(db, {
        project,
        goal_id: goal.id,
      });
      expect(traces.length).toBe(1);
      expect(traces[0].id).toBe(trace.id);

      const intent = IntentionEngine.createIntention(db, {
        project,
        goal_id: goal.id,
        behavior_name: 'strike_behavior',
        priority: 0.9,
      });

      // Filter intentions by status and goal_id
      const intentions = IntentionEngine.listIntentions(db, {
        project,
        status: 'pending',
        goal_id: goal.id,
      });
      expect(intentions.length).toBe(1);
      expect(intentions[0].id).toBe(intent.id);
    });
  });

  describe('Multi-Modal Bridges Unit Tests', () => {
    it('should normalize state memory bridge data correctly including nulls', () => {
      const stateData = StateBridge.normalizeStateData({
        tasks: [{ id: 't1', title: 'Compile Binary', status: 'in_progress', priority: 1 }],
        blockers: [{ id: 'b1', description: 'Missing Library' }],
        decisions: [{ id: 'd1', recommendation: 'Use SQLite WAL' }],
      });

      expect(stateData.tasks.length).toBe(1);
      expect(stateData.blockers.length).toBe(1);
      expect(stateData.decisions.length).toBe(1);

      const nullData = StateBridge.normalizeStateData(null);
      expect(nullData.tasks).toEqual([]);
    });

    it('should normalize vision memory bridge data correctly including nulls', () => {
      const visionData = VisionBridge.normalizeVisionData({
        current_state_id: 'vs_01',
        description: 'Login Screen with submit button',
        grounded_elements: [{ selector: '#login-btn', label: 'Submit' }],
      });

      expect(visionData.current_state_id).toBe('vs_01');
      expect(visionData.grounded_elements.length).toBe(1);

      const nullData = VisionBridge.normalizeVisionData(null);
      expect(nullData.grounded_elements).toEqual([]);
    });

    it('should normalize world model bridge data correctly including nulls', () => {
      const worldData = WorldBridge.normalizeWorldData({
        entities: [{ id: 'ent_01', name: 'Player_Hero', position: [10, 0, 5], confidence: 0.95 }],
        relations: [{ from: 'ent_01', relation: 'inside', to: 'arena_01' }],
      });

      expect(worldData.entities.length).toBe(1);
      expect(worldData.relations.length).toBe(1);

      const nullData = WorldBridge.normalizeWorldData(null);
      expect(nullData.entities).toEqual([]);
    });
  });
});
