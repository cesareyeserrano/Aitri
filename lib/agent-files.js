/**
 * Module: Agent instruction files
 * Purpose: Write agent-specific instruction files from AGENTS.md template.
 *          Each agent reads its own file automatically at session start.
 *          Non-destructive: never overwrites existing files.
 */

import fs from 'fs';
import path from 'path';

/**
 * Agent file destinations. Each agent has a unique path it auto-reads.
 * Content is identical — sourced from templates/AGENTS.md.
 */
const AGENT_FILES = [
  'AGENTS.md',                        // Generic (human reference)
  'CLAUDE.md',                         // Claude Code
  '.codex/instructions.md',            // OpenAI Codex
  'GEMINI.md',                         // Google Gemini CLI
];

/**
 * Write agent instruction files from AGENTS.md template.
 * Skips files that already exist (non-destructive).
 *
 * @param {string} dir - Project root.
 * @param {string} rootDir - Aitri CLI root (where templates/ lives).
 * @returns {string[]} List of files that were created.
 */
export function writeAgentFiles(dir, rootDir) {
  const tplPath = path.join(rootDir, 'templates', 'AGENTS.md');
  if (!fs.existsSync(tplPath)) return [];

  const content = fs.readFileSync(tplPath, 'utf8');
  const created = [];

  for (const relPath of AGENT_FILES) {
    const dest = path.join(dir, relPath);
    if (fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
    created.push(relPath);
  }

  return created;
}
