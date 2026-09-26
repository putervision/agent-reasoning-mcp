import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { canonicalJsonStringify } from '../../src/utils/canonical-json.js';
import { StatePackBuilder, computePackHash, verifyPackHash } from '../../src/engine/state-pack.js';
import { StatePack } from '../../src/schema/types.js';

describe('Canonical StatePack Hash Contract (Pentad Shared Specification)', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/canonical-state-pack.json');
  const fixtureRaw = fs.readFileSync(fixturePath, 'utf8');
  const fixture: StatePack = JSON.parse(fixtureRaw);

  const EXPECTED_PACK_HASH = '283cbb0c60496b6beca4237341fb3bb1ae76490628a81b54b46953058eb9bd21';
  const EXPECTED_FULL_HASH = '376e80f562b8edab8d51fe40faf76140c65253a215bca87ee7dd89224636e079';

  it('verifies StatePackBuilder validation passes on canonical fixture', () => {
    expect(StatePackBuilder.validate(fixture)).toBe(true);
  });

  it('computes exact byte-for-byte canonical pack_hash matching EXPECTED_PACK_HASH', () => {
    const { pack_hash, ...rest } = fixture;
    const cjson = canonicalJsonStringify(rest);
    const hash = crypto.createHash('sha256').update(cjson, 'utf8').digest('hex');

    expect(pack_hash).toBe(EXPECTED_PACK_HASH);
    expect(hash).toBe(EXPECTED_PACK_HASH);
    expect(computePackHash(rest)).toBe(EXPECTED_PACK_HASH);
    expect(verifyPackHash(fixture)).toBe(true);
  });

  it('computes exact byte-for-byte full serialized canonical hash matching EXPECTED_FULL_HASH', () => {
    const fullCjson = canonicalJsonStringify(fixture);
    const fullHash = crypto.createHash('sha256').update(fullCjson, 'utf8').digest('hex');
    expect(fullHash).toBe(EXPECTED_FULL_HASH);
  });

  it('strictly adheres to canonical JSON formatting rules', () => {
    const cjson = canonicalJsonStringify(fixture);

    // Rule 1: No trailing newlines or whitespace
    expect(cjson.endsWith('\n')).toBe(false);
    expect(cjson.trim()).toBe(cjson);

    // Rule 2: Keys must be sorted lexicographically
    const parsed = JSON.parse(cjson);
    const topKeys = Object.keys(parsed);
    const sortedKeys = [...topKeys].sort();
    expect(topKeys).toEqual(sortedKeys);

    // Rule 3: Floats rounded to max 6 decimals
    expect(cjson).toContain('10.5');
    expect(cjson).toContain('-5.25');
  });

  it('detects tampering and rejects invalid pack_hash', () => {
    const tampered = { ...fixture, project: 'tampered-project' };
    expect(verifyPackHash(tampered)).toBe(false);
  });
});
