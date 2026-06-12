/**
 * Module: Agent instruction files
 * Purpose: Write agent-specific instruction files from AGENTS.md template.
 *          Each agent reads its own file automatically at session start.
 *          Non-destructive: never overwrites existing files.
 *
 * The template is RENDERED per project (LAYOUT-1, rc.77): path placeholders
 * ({{IDEA_FILE}}, {{IDEA_CONTEXT_DIR}}, {{SPEC_DIR}}, {{FEATURES_DIR}},
 * {{BACKLOG_FILE}}) resolve through the project's layout, so a contained
 * project's agents read `aitri/product/idea_context` while a legacy flat
 * project's agents read `idea_context` — same rules, layout-correct paths.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, layoutEmissionVars } from './state.js';
import { render } from './prompts/render.js';

/**
 * Agent file destinations. Each agent has a unique path it auto-reads.
 * Content is identical — sourced from templates/AGENTS.md.
 */
const AGENT_FILES = [
  'AGENTS.md',                          // Generic (human reference)
  'CLAUDE.md',                          // Claude Code
  '.codex/instructions.md',             // OpenAI Codex
  'GEMINI.md',                          // Google Gemini CLI
  '.github/copilot-instructions.md',    // GitHub Copilot (repo-wide custom instructions)
];

/**
 * Write agent instruction files from AGENTS.md template.
 * Skips files that already exist (non-destructive).
 *
 * @param {string} dir - Project root.
 * @param {string} rootDir - Aitri CLI root (where templates/ lives).
 * @param {object} [config] - Project config for layout resolution. Callers that
 *   hold an unsaved in-memory config (init) MUST pass it — a fallback loadConfig
 *   would read the pre-save state and render the wrong layout. Other callers
 *   (adopt, upgrade) run after save and may omit it.
 * @returns {string[]} List of files that were created.
 */
export function writeAgentFiles(dir, rootDir, config) {
  const tplPath = path.join(rootDir, 'templates', 'AGENTS.md');
  if (!fs.existsSync(tplPath)) return [];

  const content = render('AGENTS', layoutEmissionVars(config || loadConfig(dir)));
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

/**
 * DESTRUCTIVE variant for the layout migration (LAYOUT-1 Phase C): delete the
 * generated files and re-render them, so the emitted paths match the new
 * layout. writeAgentFiles' non-destructive skip would leave them stale. Only
 * the layout migration calls this, after its explicit operator confirmation.
 *
 * USER-AUTHORED files are preserved (rc.82, adversarial review): a project
 * adopted into Aitri may carry its own hand-written CLAUDE.md/AGENTS.md that
 * writeAgentFiles deliberately skipped — deleting those would destroy content
 * Aitri never generated. Only files carrying the Aitri template marker are
 * regenerated; the rest are reported back for the operator to reconcile.
 *
 * @returns {{ regenerated: string[], kept: string[] }}
 */
const AITRI_TEMPLATE_MARKER = 'Aitri Pipeline Rules';

export function regenerateAgentFiles(dir, rootDir, config) {
  const kept = [];
  for (const relPath of AGENT_FILES) {
    const dest = path.join(dir, relPath);
    if (!fs.existsSync(dest)) continue;
    let content = '';
    try { content = fs.readFileSync(dest, 'utf8'); } catch { /* unreadable — leave it */ }
    if (content.includes(AITRI_TEMPLATE_MARKER)) {
      try { fs.unlinkSync(dest); } catch { /* leave it; writeAgentFiles will skip */ }
    } else {
      kept.push(relPath);
    }
  }
  const regenerated = writeAgentFiles(dir, rootDir, config);
  return { regenerated, kept };
}
