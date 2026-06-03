/**
 * Module: Command — init
 * Purpose: Initialize a new Aitri project. Creates IDEA.md + .aitri config.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig } from '../state.js';
import { writeAgentFiles } from '../agent-files.js';

export function cmdInit({ dir, rootDir, err, VERSION }) {
  fs.mkdirSync(dir, { recursive: true });
  const config = loadConfig(dir);
  config.projectName    = path.basename(dir);
  config.createdAt      = config.createdAt || new Date().toISOString();
  config.aitriVersion   = VERSION;
  config.currentPhase   = config.currentPhase   || 0;
  config.approvedPhases = config.approvedPhases  || [];
  // New projects: artifacts go in spec/ subfolder. Existing projects keep root (backward compat).
  if (config.artifactsDir === undefined) {
    config.artifactsDir = 'spec';
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  }

  // Create idea_context/ folder for mockups, Figma exports, reference docs, etc.
  // Name pairs with the seed file at this level: IDEA.md ↔ idea_context/.
  const ideaDir = path.join(dir, 'idea_context');
  if (!fs.existsSync(ideaDir)) {
    fs.mkdirSync(ideaDir, { recursive: true });
    fs.writeFileSync(
      path.join(ideaDir, 'README.md'),
      '# idea_context/ — supporting assets\n\nDrop reference material here: mockups, Figma exports, PDFs, a prior PRD, screenshots, reference docs.\nAitri automatically lists the files in this folder in every phase briefing so your agent can reference them.\n\nNotes:\n- This folder (`idea_context/`) is for supporting assets. The seed brief you write is the `IDEA.md` file at the project root — a different thing.\n- The approved artifacts (in spec/) are the source of truth. Keep this folder curated: remove material that becomes obsolete as the project evolves, so it does not mislead the agent.\n'
    );
  }

  const ideaPath = path.join(dir, 'IDEA.md');
  const created  = !fs.existsSync(ideaPath);
  if (created) {
    const tpl = path.join(rootDir, 'templates', 'IDEA.md');
    fs.writeFileSync(ideaPath, fs.readFileSync(tpl, 'utf8'));
  }

  const ignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignorePath)) {
    // The template is shipped as `gitignore` (no leading dot): npm strips any file
    // named `.gitignore` from published packages, so a dotted template is absent on
    // every `npm i -g aitri` install and `readFileSync` would crash init on the first
    // command. Read the dotless name, and fall back to a minimal default rather than
    // throwing if even that is missing — a .gitignore is convenience, not critical.
    const tpl = path.join(rootDir, 'templates', 'gitignore');
    let content = 'node_modules/\n.env\n.env.local\ndist/\nbuild/\ncoverage/\n.DS_Store\n.aitri\n';
    try { content = fs.readFileSync(tpl, 'utf8'); } catch { /* shipped template absent — use default */ }
    fs.writeFileSync(ignorePath, content);
  }

  const backlogPath = path.join(dir, 'BACKLOG.md');
  if (!fs.existsSync(backlogPath)) {
    const tpl = path.join(rootDir, 'templates', 'BACKLOG.md');
    fs.writeFileSync(backlogPath, fs.readFileSync(tpl, 'utf8'));
  }

  writeAgentFiles(dir, rootDir);

  saveConfig(dir, config);

  console.log(`✅ Aitri initialized: ${dir}`);
  console.log(`📝 IDEA.md ${created ? 'created' : 'already exists'}`);
  console.log(`
What to do now:
  1. Edit IDEA.md — the seed brief. Describe your project in your own words.
     The more context you provide, the better the requirements will be.
  2. (Optional) Drop reference material into the idea_context/ folder — mockups, PDFs, a
     prior PRD, screenshots. Aitri lists those files in every briefing so your agent reads them.
     → IDEA.md is the file you write; idea_context/ is the folder for supporting assets.

  Then, when ready:
  • aitri run-phase discovery      (optional) Define problem, users, success — before requirements
  • aitri run-phase requirements   Generate the requirements document
  • aitri run-phase ux             (optional, after requirements) Design screens and flows
  • aitri status                   Check pipeline status at any time

  Note: per-agent instruction files were created (AGENTS.md, CLAUDE.md, GEMINI.md, .codex/, .github/) —
  same content, one per agent. Your AI agent reads its own automatically; you don't edit these.`);
}
