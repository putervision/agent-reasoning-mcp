import crypto from 'crypto';
import Database from 'better-sqlite3';
import { canonicalJsonStringify } from '../utils/canonical-json.js';
import { getCurrentIsoString } from '../utils/time.js';

export interface CacheEntry<T> {
  result: T;
  tier: 'cache';
  cachedAt: number;
  expiresAt: number;
}

export class DecisionLRUCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxEntries: number;
  private defaultTtlMs: number;

  constructor(maxEntries = 1000, defaultTtlMs = 60000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  static computeCacheKey(packHash: string, tool: string, query: unknown): string {
    const queryStr = typeof query === 'string' ? query : canonicalJsonStringify(query);
    const preimage = `${packHash}:${tool}:${queryStr}`;
    return crypto.createHash('sha256').update(preimage, 'utf8').digest('hex');
  }

  get<T>(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU order (delete & re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry as CacheEntry<T>;
  }

  set<T>(key: string, result: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest (first key in iteration)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const now = Date.now();
    const duration = ttlMs || this.defaultTtlMs;
    this.cache.set(key, {
      result,
      tier: 'cache',
      cachedAt: now,
      expiresAt: now + duration,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const globalDecisionCache = new DecisionLRUCache(1000, 60000);

export class PersistentDecisionCache {
  static getFromDb<T>(db: Database.Database, cacheKey: string): { result: T; latency_ms: number } | null {
    const row = db
      .prepare(
        'SELECT result_json, expires_at FROM decision_cache WHERE cache_key = ?'
      )
      .get(cacheKey) as { result_json: string; expires_at: string } | undefined;

    if (!row) return null;

    if (new Date(row.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM decision_cache WHERE cache_key = ?').run(cacheKey);
      return null;
    }

    try {
      const parsed = JSON.parse(row.result_json);
      return { result: parsed as T, latency_ms: 0 };
    } catch {
      return null;
    }
  }

  static saveToDb(
    db: Database.Database,
    params: {
      cacheKey: string;
      tool: string;
      queryHash: string;
      packHash: string;
      result: unknown;
      tier: 'L1' | 'L2' | 'L3' | 'L4' | 'cache';
      latencyMs: number;
      ttlMs?: number;
    }
  ): void {
    const now = Date.now();
    const ttl = params.ttlMs || 300000; // 5 min default
    const createdAt = getCurrentIsoString();
    const expiresAt = new Date(now + ttl).toISOString();

    db.prepare(
      `
      INSERT OR REPLACE INTO decision_cache (
        cache_key, tool, query_hash, pack_hash, result_json, tier, latency_ms, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      params.cacheKey,
      params.tool,
      params.queryHash,
      params.packHash,
      JSON.stringify(params.result),
      params.tier,
      params.latencyMs,
      createdAt,
      expiresAt
    );
  }
}
