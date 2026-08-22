import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { getAgentsMdTemplate } from './templates.js';
import { registerProject, resolveProjectRoot, getProjectSlug, getDb } from '../engine/db.js';

export function upsertInstructionBlock(
  content: string,
  newBlock: string,
  startMarker = '<!-- agent-reasoning-mcp:start -->',
  endMarker = '<!-- agent-reasoning-mcp:end -->'
): { updatedContent: string; status: 'updated' | 'appended' | 'unchanged' } {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + endMarker.length);
    const existingBlock = content.substring(startIndex, endIndex + endMarker.length);
    if (existingBlock.trim() === newBlock.trim()) {
      return { updatedContent: content, status: 'unchanged' };
    }
    return { updatedContent: `${before}${newBlock.trim()}${after}`, status: 'updated' };
  }

  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  return { updatedContent: `${content}${separator}${newBlock.trim()}\n`, status: 'appended' };
}

export function runInit(options: { project?: string; cwd?: string } = {}): void {
  const cwd = options.cwd || process.cwd();
  const root = resolveProjectRoot(options.project, cwd);
  const slug = getProjectSlug(options.project, cwd);

  console.log(`Initializing agent-reasoning-mcp in: ${root} (project slug: ${slug})`);

  // 1. Register project
  registerProject(slug, root);

  // 2. Initialize DB & tables
  const db = getDb(slug, root);
  console.log('✔ SQLite reasoning database initialized with WAL mode.');

  // 3. Update AGENTS.md / CLAUDE.md / .cursor/rules
  const agentsPath = path.join(root, '.agents', 'AGENTS.md');
  const dir = path.dirname(agentsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const existingContent = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf-8') : '';
  const result = upsertInstructionBlock(existingContent, getAgentsMdTemplate());
  fs.writeFileSync(agentsPath, result.updatedContent, 'utf-8');
  console.log(`✔ Agent instructions ${result.status} in ${agentsPath}`);

  console.log('\nagent-reasoning-mcp initialization complete!');
}
