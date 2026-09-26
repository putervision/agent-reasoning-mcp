import { describe, it, expect } from 'vitest';
import {
  loadProjectConfig,
  getPentadHmacSecret,
  getDispatchTokenTtlMs,
  getTypeSafeApiKey,
  getL3ModelPath,
} from '../../src/engine/config.js';
import { registerAllTools } from '../../src/tools/handlers.js';

describe('Config & Tool Error Handling Coverage', () => {
  it('covers all config environment variables and getters', () => {
    process.env.PUTERVISION_PROJECT_SLUG = 'slug_test';
    process.env.DISPATCH_TOKEN_TTL_MS = '45000';
    process.env.TYPESAFE_API_KEY = 'secret_key_123';
    process.env.L3_MODEL_PATH = '/models/l3.onnx';

    const cfg = loadProjectConfig('/tmp/nonexistent_' + Date.now());
    expect(cfg.projectName).toBe('slug_test');
    expect(getDispatchTokenTtlMs()).toBe(45000);
    expect(getTypeSafeApiKey()).toBe('secret_key_123');
    expect(getL3ModelPath()).toBe('/models/l3.onnx');

    delete process.env.PUTERVISION_PROJECT_SLUG;
    delete process.env.DISPATCH_TOKEN_TTL_MS;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.L3_MODEL_PATH;
  });

  it('covers handler error advice formatting', async () => {
    let handler: Function = () => {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, fn: Function) => {
        if (name === 'set_goal') handler = fn;
      },
    };
    registerAllTools(mockServer as any);

    // Call with invalid arguments that trigger error advice
    const res = await handler({ project: 'test_p', action: 'invalid_action' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBeDefined();

    let dbHandler: Function = () => {};
    let intentHandler: Function = () => {};
    const server2 = {
      tool: (name: string, desc: string, schema: any, fn: Function) => {
        if (name === 'manage_reasoning_db') dbHandler = fn;
        if (name === 'manage_intentions') intentHandler = fn;
      },
    };
    registerAllTools(server2 as any);

    const dbRes = await dbHandler({ project: 'test_p', action: 'unsupported_db_action' });
    expect(dbRes.isError).toBe(true);

    const intentRes = await intentHandler({
      project: 'test_p',
      action: 'unsupported_intent_action',
    });
    expect(intentRes.isError).toBe(true);
  });

  it('covers sanitizeKeys array mapping and profile validation errors', async () => {
    const { sanitizeKeys } = await import('../../src/utils/sanitize.js');
    expect(sanitizeKeys([1, { __proto__: 'bad', ok: true }])).toEqual([1, { ok: true }]);

    const { UtilityProfileEngine } = await import('../../src/engine/personality.js');
    const Database = (await import('better-sqlite3')).default;
    const { runMigrations } = await import('../../src/engine/migrations.js');
    const testDb = new Database(':memory:');
    runMigrations(testDb);

    expect(() =>
      UtilityProfileEngine.configureProfile(testDb, { project: 'p', name: 'bad', weights: {} })
    ).toThrow('Utility weights are required');

    testDb.close();
  });

  it('covers canonicalJsonStringify and getVersion', async () => {
    const { canonicalJsonStringify } = await import('../../src/utils/canonical-json.js');
    expect(canonicalJsonStringify(undefined)).toBe('');
    expect(canonicalJsonStringify(null)).toBe('null');
    expect(canonicalJsonStringify(-0)).toBe('0');
    expect(canonicalJsonStringify([undefined, 1])).toBe('[null,1]');
    expect(canonicalJsonStringify({ a: undefined, b: 2 })).toBe('{"b":2}');
    expect(() => canonicalJsonStringify(Infinity)).toThrow('Invalid non-finite number');
    expect(canonicalJsonStringify(Symbol('test'))).toBe(undefined);

    const { getVersion } = await import('../../src/utils/version.js');
    expect(getVersion()).toBe('0.3.0');
    (globalThis as any).__APP_VERSION__ = '1.2.3';
    expect(getVersion()).toBe('1.2.3');
    delete (globalThis as any).__APP_VERSION__;
  });

  it('covers IntentionGate goal scope and health validation', async () => {
    process.env.PENTAD_HMAC_SECRET = 'test_pentad_secret_123';
    const { IntentionGateEngine } = await import('../../src/engine/intention-gate.js');
    const Database = (await import('better-sqlite3')).default;
    const { runMigrations } = await import('../../src/engine/migrations.js');
    const testDb = new Database(':memory:');
    runMigrations(testDb);

    // Goal not found
    const resNotFound = IntentionGateEngine.evaluateAndGate(testDb, {
      project: 'test_p',
      proposed_action: { behavior_name: 'test_act' },
      context_goal_id: 'nonexistent_goal',
    });
    expect(resNotFound.in_scope).toBe(false);

    // Goal completed
    testDb
      .prepare(
        "INSERT INTO goals (id, project, title, status, created_at, updated_at) VALUES ('g1', 'test_p', 'Goal 1', 'completed', 'now', 'now')"
      )
      .run();
    const resCompleted = IntentionGateEngine.evaluateAndGate(testDb, {
      project: 'test_p',
      proposed_action: { behavior_name: 'test_act' },
      context_goal_id: 'g1',
    });
    expect(resCompleted.in_scope).toBe(false);

    // Goal active
    testDb.prepare("UPDATE goals SET status = 'active' WHERE id = 'g1'").run();
    const resActive = IntentionGateEngine.evaluateAndGate(testDb, {
      project: 'test_p',
      proposed_action: { behavior_name: 'test_act' },
      context_goal_id: 'g1',
    });
    expect(resActive.in_scope).toBe(true);

    // High risk score & critical health attack
    const { StatePackBuilder } = await import('../../src/engine/state-pack.js');
    const pack = StatePackBuilder.build({
      project: 'test_p',
      session_id: 's',
      vitals: { hp: 10, threat_level: 0.9 },
    });

    const resCritical = IntentionGateEngine.evaluateAndGate(testDb, {
      project: 'test_p',
      proposed_action: { behavior_name: 'attack_enemy' },
      state_pack: pack,
    });
    expect(resCritical.allowed).toBe(false);

    // Cover ProjectConfigSchema and safeJsonStringify fallback
    const { ProjectConfigSchema } = await import('../../src/engine/config.js');
    expect(ProjectConfigSchema.safeParse('not an object').success).toBe(false);

    const { safeJsonStringify } = await import('../../src/utils/json-validator.js');
    const circular: any = {};
    circular.self = circular;
    expect(safeJsonStringify(circular, 'fallback_val')).toBe('fallback_val');

    // Cover path-validator
    const { validatePath } = await import('../../src/utils/path-validator.js');
    expect(() => validatePath('', { projectRoot: '/tmp' })).toThrow(
      'File path must be a non-empty string'
    );
    expect(() => validatePath('/etc/shadow', { projectRoot: '/tmp' })).toThrow('Access denied');
    expect(validatePath('test.json', { projectRoot: '/tmp' })).toBe('/tmp/test.json');

    delete process.env.PENTAD_HMAC_SECRET;
    testDb.close();
  });
});
