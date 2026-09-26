import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { runMigrations } from '../../src/engine/migrations.js';
import { IntentionGateEngine } from '../../src/engine/intention-gate.js';
import { StatePackBuilder } from '../../src/engine/state-pack.js';
import { globalDecisionCache } from '../../src/engine/cache.js';

describe('IntentionGateEngine - Intention Pre-Dispatch Security Gate', () => {
  let db: Database.Database;
  const project = 'gate_test_project';
  const originalSecret = process.env.PENTAD_HMAC_SECRET;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    globalDecisionCache.clear();
    process.env.PENTAD_HMAC_SECRET = 'pentad_super_secret_test_key_32bytes_long!';
  });

  afterEach(() => {
    db.close();
    if (originalSecret !== undefined) {
      process.env.PENTAD_HMAC_SECRET = originalSecret;
    } else {
      delete process.env.PENTAD_HMAC_SECRET;
    }
  });

  it('approves safe intention and issues valid cryptographic DispatchToken [airgap]', () => {
    const pack = StatePackBuilder.build({
      project,
      session_id: 'session_gate_01',
    });

    const result = IntentionGateEngine.evaluateAndGate(db, {
      project,
      intention_id: 'intent_safe_01',
      proposed_action: {
        behavior_name: 'patrol_route_alpha',
        parameters: { speed: 1.2, waypoint: 'wp_01' },
      },
      state_pack: pack,
    });

    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe('approved');
    expect(result.dispatch_token).toBeDefined();

    const token = result.dispatch_token!;
    expect(token.intention_id).toBe('intent_safe_01');
    expect(token.behavior_name).toBe('patrol_route_alpha');
    expect(token.aud).toBe('behavior-mcp');
    expect(token.hmac_signature).toBeDefined();

    // Verify HMAC signature manually
    const secret = process.env.PENTAD_HMAC_SECRET!;
    const expectedPreimage = `${token.token_id}:${token.intention_id}:${token.behavior_name}:${token.params_hash}:${token.aud}:${token.issued_at}:${token.expires_at}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(expectedPreimage, 'utf8')
      .digest('hex');
    expect(token.hmac_signature).toBe(expectedSig);
  });

  it('fails closed and rejects intention when PENTAD_HMAC_SECRET is unset [airgap]', () => {
    delete process.env.PENTAD_HMAC_SECRET;

    const pack = StatePackBuilder.build({
      project,
      session_id: 'session_no_secret',
    });

    const result = IntentionGateEngine.evaluateAndGate(db, {
      project,
      intention_id: 'intent_no_secret',
      proposed_action: {
        behavior_name: 'patrol_route_alpha',
      },
      state_pack: pack,
    });

    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe('rejected');
    expect(result.dispatch_token).toBeUndefined();
    expect(result.reasons).toContain('MISSING_REQUIRED_PARAMS');
  });

  it('quarantines or requests approval for destructive actions [airgap]', () => {
    const pack = StatePackBuilder.build({
      project,
      session_id: 'session_destructive',
    });

    const result = IntentionGateEngine.evaluateAndGate(db, {
      project,
      intention_id: 'intent_destroy',
      proposed_action: {
        behavior_name: 'delete_system_partition',
        parameters: { force: true },
      },
      state_pack: pack,
    });

    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe('needs_human_approval');
    expect(result.dispatch_token).toBeUndefined();
    expect(result.reasons).toContain('DESTRUCTIVE_ACTION_DETECTED');
  });

  it('rejects offensive action when agent vitals are in critical condition [airgap]', () => {
    const pack = StatePackBuilder.build({
      project,
      session_id: 'session_critical_vitals',
      vitals: { hp: 10, threat_level: 0.9 },
    });

    const result = IntentionGateEngine.evaluateAndGate(db, {
      project,
      intention_id: 'intent_attack_crit',
      proposed_action: {
        behavior_name: 'attack_drone_headon',
      },
      state_pack: pack,
    });

    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe('rejected');
    expect(result.policy_violations).toContain(
      'Agent in critical health state; offensive engagement forbidden'
    );
    expect(result.reasons).toContain('CRITICAL_VITALS_HP');
  });
});
