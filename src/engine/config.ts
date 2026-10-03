import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface ProjectConfig {
  projectName?: string;
  defaultBranch?: string;
  storagePath?: string;
  allowedExportDirs?: string[];
  busyTimeoutMs?: number;
  mmapSizeBytes?: number;
  beliefDecayRate?: number;
  spatialTtlMs?: number;
  maxGoalDepth?: number;
  accessMode?: 'normal' | 'read_only';
  [key: string]: any;
}

export const ProjectConfigSchema = {
  safeParse(val: unknown): { success: boolean; data?: ProjectConfig; error?: { message: string } } {
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      return { success: false, error: { message: 'Expected object' } };
    }
    return { success: true, data: val as ProjectConfig };
  },
};

const cachedConfigs = new Map<string, { config: ProjectConfig; timestamp: number }>();
const CONFIG_TTL_MS = 2000;

export function loadProjectConfig(projectRoot: string): ProjectConfig {
  const now = Date.now();
  const cached = cachedConfigs.get(projectRoot);
  if (cached && now - cached.timestamp < CONFIG_TTL_MS) {
    return cached.config;
  }

  const effectiveRoot = process.env.PUTERVISION_PROJECT_DIR || projectRoot;
  const configPath = path.join(effectiveRoot, '.agent-reasoning-mcp.json');
  let config: ProjectConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = ProjectConfigSchema.safeParse(parsed);
      if (validated.success && validated.data) {
        config = validated.data;
      } else {
        logger.warn(`Invalid .agent-reasoning-mcp.json schema: ${validated.error?.message}`);
        config = parsed;
      }
    } catch (err: any) {
      logger.warn(`Failed to parse .agent-reasoning-mcp.json: ${err.message}`);
    }
  }

  if (process.env.PUTERVISION_PROJECT_SLUG && !config.projectName) {
    config.projectName = process.env.PUTERVISION_PROJECT_SLUG;
  }

  cachedConfigs.set(projectRoot, { config, timestamp: now });
  return config;
}

let hasWarnedHmacInConfig = false;

export function getPentadHmacSecret(projectRoot = process.cwd()): string | undefined {
  if (process.env.PENTAD_HMAC_SECRET) {
    return process.env.PENTAD_HMAC_SECRET;
  }
  const config = loadProjectConfig(projectRoot);
  const secret = config.pentadHmacSecret || config.hmacSecret;
  if (secret && !hasWarnedHmacInConfig) {
    logger.warn(
      'PENTAD_HMAC_SECRET should be supplied via environment variable instead of unencrypted project config file'
    );
    hasWarnedHmacInConfig = true;
  }
  return secret;
}

export function getDispatchTokenTtlMs(projectRoot = process.cwd()): number {
  if (process.env.DISPATCH_TOKEN_TTL_MS) {
    const parsed = parseInt(process.env.DISPATCH_TOKEN_TTL_MS, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const config = loadProjectConfig(projectRoot);
  return config.dispatchTokenTtlMs || 30000;
}

export function getTypeSafeApiKey(): string | undefined {
  return process.env.TYPESAFE_API_KEY;
}

export function getL3ModelPath(): string | undefined {
  return process.env.L3_MODEL_PATH;
}
