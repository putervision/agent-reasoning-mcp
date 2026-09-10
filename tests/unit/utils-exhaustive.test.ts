import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logger, getLogLevel, LOG_LEVELS } from '../../src/utils/logger.js';
import {
  ReasoningError,
  DatabaseError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../src/utils/errors.js';
import { getCurrentBranch } from '../../src/utils/git.js';
import {
  validatePath,
  getDefaultAllowedDirs,
  loadPathConfig,
} from '../../src/utils/path-validator.js';
import { redactText, redactData } from '../../src/utils/redact.js';
import { sanitizeKeys } from '../../src/utils/sanitize.js';
import { getCurrentIsoString, parseIsoString, getElapsedTimeMs } from '../../src/utils/time.js';
import { getVersion } from '../../src/utils/version.js';
import { safeJsonParse, safeJsonStringify } from '../../src/utils/json-validator.js';
import { SchemaAdvisor } from '../../src/engine/advisor.js';

describe('agent-reasoning-mcp Comprehensive Utils Suite', () => {
  describe('Errors Module', () => {
    it('should instantiate all error types with proper inheritance and defaults', () => {
      const baseErr = new ReasoningError('base error');
      expect(baseErr.name).toBe('ReasoningError');
      expect(baseErr.code).toBe('INTERNAL_ERROR');
      expect(baseErr instanceof Error).toBe(true);

      const dbErr = new DatabaseError('db failed', { query: 'SELECT 1' });
      expect(dbErr.name).toBe('DatabaseError');
      expect(dbErr.code).toBe('DATABASE_ERROR');
      expect(dbErr.details).toEqual({ query: 'SELECT 1' });

      const valErr = new ValidationError('invalid schema');
      expect(valErr.name).toBe('ValidationError');
      expect(valErr.code).toBe('VALIDATION_ERROR');

      const notFoundErr = new NotFoundError('item not found');
      expect(notFoundErr.name).toBe('NotFoundError');
      expect(notFoundErr.code).toBe('NOT_FOUND_ERROR');

      const conflictErr = new ConflictError('resource conflict');
      expect(conflictErr.name).toBe('ConflictError');
      expect(conflictErr.code).toBe('CONFLICT_ERROR');
    });
  });

  describe('Logger Module', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('should respect REASONING_LOG_LEVEL environment variable', () => {
      process.env.REASONING_LOG_LEVEL = 'debug';
      expect(getLogLevel()).toBe(LOG_LEVELS.debug);

      process.env.REASONING_LOG_LEVEL = 'warn';
      expect(getLogLevel()).toBe(LOG_LEVELS.warn);

      delete process.env.REASONING_LOG_LEVEL;
      expect(getLogLevel()).toBe(LOG_LEVELS.info);
    });

    it('should log messages via console.error for all log levels', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.REASONING_LOG_LEVEL = 'debug';

      logger.debug('debug message', { key: 'val' });
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('Git Utils Module', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-reason-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should detect current branch from ref: refs/heads/ in .git/HEAD', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/reasoning-v1.0\n');

      const branch = getCurrentBranch(tmpDir);
      expect(branch).toBe('reasoning-v1.0');
    });

    it('should handle detached HEAD SHA in .git/HEAD', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');

      const branch = getCurrentBranch(tmpDir);
      expect(branch).toBe('HEAD');
    });

    it('should fallback to main when directory is not a git repository', () => {
      const branch = getCurrentBranch(tmpDir);
      expect(branch).toBe('main');
    });
  });

  describe('Path Validator Module', () => {
    it('should compute default allowed dirs', () => {
      const root = '/tmp/test-reasoning-project';
      const allowed = getDefaultAllowedDirs(root);
      expect(allowed).toContain(path.resolve(root));
      expect(allowed.some((d) => d.includes('.agent-reasoning-mcp'))).toBe(true);
    });

    it('should validate allowed paths and reject directory traversal attacks', () => {
      const root = path.resolve('/tmp/test-reasoning-project');
      const config = loadPathConfig(root);

      const validSub = path.join(root, 'sub', 'plan.json');
      expect(validatePath(validSub, config)).toBe(validSub);

      expect(() => validatePath('/etc/passwd', config)).toThrow(ValidationError);
      expect(() => validatePath(path.join(root, '..', 'outside.txt'), config)).toThrow(
        ValidationError
      );
    });
  });

  describe('Redact & Sanitize Modules', () => {
    it('should redact sensitive tokens and credentials', () => {
      const text = 'Bearer secret_auth_token_999 and password=hunter2';
      const redacted = redactText(text);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('secret_auth_token_999');
      expect(redacted).not.toContain('hunter2');
      expect(redactText('')).toBe('');
    });

    it('should redact sensitive keys in nested data structures', () => {
      expect(redactData(null)).toBeNull();
      expect(redactData(undefined)).toBeUndefined();
      expect(redactData(42)).toBe(42);

      const arrayData = ['normal', 'password=secret123', 100];
      const redactedArray = redactData(arrayData);
      expect(redactedArray[1]).toContain('[REDACTED]');

      const objData = {
        name: 'test',
        apiKey: 'sk-1234567890abcdef12345',
        secret_token: 'topsecret',
        nested: {
          authPassword: 'pass',
          safeCount: 10,
        },
      };
      const redactedObj = redactData(objData);
      expect(redactedObj.apiKey).toBe('[REDACTED]');
      expect(redactedObj.secret_token).toBe('[REDACTED]');
      expect(redactedObj.nested.authPassword).toBe('[REDACTED]');
      expect(redactedObj.nested.safeCount).toBe(10);
    });

    it('should sanitize prototype pollution keys recursively', () => {
      const malicious = {
        name: 'agent',
        __proto__: { polluted: true },
        nested: {
          constructor: 'bad',
          safeKey: 'valid',
        },
      };

      const sanitized = sanitizeKeys(malicious);
      expect((sanitized as any).polluted).toBeUndefined();
      expect((sanitized as any).nested.safeKey).toBe('valid');
    });
  });

  describe('Time & Version & JSON Validator Modules', () => {
    it('should compute timestamps and elapsed durations', () => {
      const iso = getCurrentIsoString();
      const parsed = parseIsoString(iso);
      expect(parsed).toBeInstanceOf(Date);
      expect(getElapsedTimeMs(new Date(Date.now() - 500).toISOString())).toBeGreaterThanOrEqual(
        400
      );
    });

    it('should retrieve package version or fallback', () => {
      const ver = getVersion();
      expect(typeof ver).toBe('string');
      expect(ver.length).toBeGreaterThan(0);
    });

    it('should safely parse and stringify JSON structures', () => {
      const parsed = safeJsonParse('{"goal":"victory"}', {});
      expect(parsed).toEqual({ goal: 'victory' });

      const fallback = safeJsonParse('bad json', { default: 1 });
      expect(fallback).toEqual({ default: 1 });

      const str = safeJsonStringify({ val: 42 });
      expect(str).toBe('{"val":42}');
    });
  });

  describe('SchemaAdvisor Module', () => {
    it('should suggest aliases and close tool matches', () => {
      const alias = SchemaAdvisor.getAdvice('create_goal', 'unknown', ['set_goal', 'replan']);
      expect(alias).toContain('is an alias');

      const fuzzy = SchemaAdvisor.getAdvice('set_goall', 'unknown', ['set_goal', 'replan']);
      expect(fuzzy).toContain('Did you mean');
    });
  });
});
