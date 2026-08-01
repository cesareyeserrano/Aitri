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
 * Claude Code slash command (INTEG-CCMD-0718): an explicit `/aitri` trigger that
 * re-injects the pipeline protocol at the moment of use — ambient CLAUDE.md rules
 * decay over a long session; the command puts them in front of the agent for exactly
 * one action. Own content (not the AGENTS.md template), same non-destructive skip.
 */
const CLAUDE_COMMAND_FILE = '.claude/commands/aitri.md';
// Marker is a body comment, not the frontmatter description: slash commands are
// user-tunable, and a customizer who rewrites the body but keeps the description must
// not have their edits silently regenerated away (adversarial finding). Removing the
// comment marks the file user-authored.
const CLAUDE_COMMAND_MARKER = '<!-- aitri-generated command';
const CLAUDE_COMMAND_CONTENT = `---
description: Advance the Aitri pipeline — one step
---
<!-- aitri-generated command — delete this comment if you customize the body -->
Run \`aitri resume\`. Follow the FIRST entry in its "Next Action" section — that is the
single next step. Do not choose a different action, skip phases, or re-open approved
phases (unless the printed action itself names the re-run — a reject or drift flow does).
If the action is a \`run-phase\`, read the briefing it prints and produce the artifact at
the path it specifies, then run the \`complete\` it names. If a later command prints a
PIPELINE INSTRUCTION block, that instruction overrides everything else.
`;

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

  const cmdDest = path.join(dir, CLAUDE_COMMAND_FILE);
  if (!fs.existsSync(cmdDest)) {
    fs.mkdirSync(path.dirname(cmdDest), { recursive: true });
    fs.writeFileSync(cmdDest, CLAUDE_COMMAND_CONTENT, 'utf8');
    created.push(CLAUDE_COMMAND_FILE);
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
  const files = [
    ...AGENT_FILES.map(relPath => ({ relPath, marker: AITRI_TEMPLATE_MARKER })),
    { relPath: CLAUDE_COMMAND_FILE, marker: CLAUDE_COMMAND_MARKER },
  ];
  for (const { relPath, marker } of files) {
    const dest = path.join(dir, relPath);
    if (!fs.existsSync(dest)) continue;
    let content = '';
    try { content = fs.readFileSync(dest, 'utf8'); } catch { /* unreadable — leave it */ }
    if (content.includes(marker)) {
      try { fs.unlinkSync(dest); } catch { /* leave it; writeAgentFiles will skip */ }
    } else {
      kept.push(relPath);
    }
  }
  const regenerated = writeAgentFiles(dir, rootDir, config);
  return { regenerated, kept };
}
