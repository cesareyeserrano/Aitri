/**
 * Module: Command — init
 * Purpose: Initialize a new Aitri project. Creates IDEA.md + .aitri config.
 *
 * Layout (LAYOUT-1, ADR-049): NEW projects are born contained — everything
 * Aitri-owned under `aitri/` (the root unit in `aitri/product/`, features later
 * in `aitri/features/`), with `.aitri` staying at the project root. Projects
 * that already have a config (re-init) keep their existing layout untouched.
 */

import fs from 'fs';
import path from 'path';
import {
  loadConfig, saveConfig, configExists,
  productSubdir, ideaPath, ideaContextDir, backlogMdPath, layoutEmissionVars,
} from '../state.js';
import { render } from '../prompts/render.js';
import { writeAgentFiles } from '../agent-files.js';
import { ensureAitriGitignore } from '../gitignore.js';
import { listAssets } from '../context-assets.js';

export function cmdInit({ dir, rootDir, err, VERSION }) {
  fs.mkdirSync(dir, { recursive: true });
  const isNew  = !configExists(dir);
  const config = loadConfig(dir);
  config.projectName    = path.basename(dir);
  config.createdAt      = config.createdAt || new Date().toISOString();
  config.aitriVersion   = VERSION;
  config.currentPhase   = config.currentPhase   || 0;
  config.approvedPhases = config.approvedPhases  || [];

  if (isNew) {
    // Contained layout: aitri/product/{IDEA.md, idea_context/, spec/} + aitri/BACKLOG.md.
    // artifactsDir is PERSISTED in the shared .aitri — always POSIX separators
    // (a path.join here would serialize backslashes on Windows and break clones).
    config.layoutRoot   = 'aitri';
    config.artifactsDir = 'aitri/product/spec';
    fs.mkdirSync(path.join(dir, 'aitri', 'product', 'spec'), { recursive: true });
  } else if (config.artifactsDir === undefined) {
    // Legacy re-init (pre-v0.1.20 config without artifactsDir): keep the flat layout.
    config.artifactsDir = 'spec';
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  }

  // Layout-resolved paths — flat for existing projects, contained for new ones.
  const unitSubdir   = productSubdir(config);
  const ideaFile     = ideaPath(dir, config);
  const ideaCtxDir   = ideaContextDir(dir, config);
  const ideaFileRel  = path.relative(dir, ideaFile);
  const ideaCtxRel   = path.relative(dir, ideaCtxDir);
  const specRel      = config.artifactsDir || '.';

  // Create idea_context/ folder for mockups, Figma exports, reference docs, etc.
  // Name pairs with the seed file at this level: IDEA.md ↔ idea_context/.
  if (!fs.existsSync(ideaCtxDir)) {
    fs.mkdirSync(ideaCtxDir, { recursive: true });
    fs.writeFileSync(
      path.join(ideaCtxDir, 'README.md'),
      `# idea_context/ — supporting assets\n\nDrop reference material here: mockups, Figma exports, PDFs, a prior PRD, screenshots, reference docs.\nAitri automatically lists the files in this folder in every phase briefing so your agent can reference them.\n\nNotes:\n- This folder (\`${ideaCtxRel}/\`) is for supporting assets. The seed brief you write is the \`${ideaFileRel}\` file — a different thing.\n- The approved artifacts (in ${specRel}/) are the source of truth. Keep this folder curated: remove material that becomes obsolete as the project evolves, so it does not mislead the agent.\n`
    );
  }

  let created = !fs.existsSync(ideaFile);
  let absorbedRootIdea = false;
  if (created) {
    if (unitSubdir) fs.mkdirSync(path.dirname(ideaFile), { recursive: true });
    // A seed brief written BEFORE init (wizard, or by hand at the root — the
    // documented pre-init flow) must not be shadowed by a fresh template in the
    // container: move it into the unit instead.
    const rootIdea = path.join(dir, 'IDEA.md');
    if (unitSubdir && fs.existsSync(rootIdea)) {
      fs.renameSync(rootIdea, ideaFile);
      created = false;
      absorbedRootIdea = true;
    } else {
      // Rendered, not copied: the template's asset examples name the
      // idea_context/ location, which is layout-dependent (rc.77).
      fs.writeFileSync(ideaFile, render('IDEA', layoutEmissionVars(config)));
    }
  }

  const ignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignorePath)) {
    // The template is shipped as `gitignore` (no leading dot): npm strips any file
    // named `.gitignore` from published packages, so a dotted template is absent on
    // every `npm i -g aitri` install and `readFileSync` would crash init on the first
    // command. Read the dotless name, and fall back to a minimal default rather than
    // throwing if even that is missing — a .gitignore is convenience, not critical.
    const tpl = path.join(rootDir, 'templates', 'gitignore');
    let content = 'node_modules/\n.env\n.env.local\ndist/\nbuild/\ncoverage/\n.DS_Store\n';
    try { content = fs.readFileSync(tpl, 'utf8'); } catch { /* shipped template absent — use default */ }
    fs.writeFileSync(ignorePath, content);
  }
  // Per-machine Aitri state (.aitri.local, .aitri.lock) is gitignored; the shared
  // .aitri file IS committed (ADR-045). Surgical + idempotent — also corrects a legacy
  // bare-`.aitri` line on an existing .gitignore.
  ensureAitriGitignore(dir);

  const backlogPath = backlogMdPath(dir, config);
  if (!fs.existsSync(backlogPath)) {
    const tpl = path.join(rootDir, 'templates', 'BACKLOG.md');
    fs.writeFileSync(backlogPath, fs.readFileSync(tpl, 'utf8'));
  }

  // Pass the in-memory config: saveConfig runs after this, so a loadConfig
  // fallback inside would render the agent files with the pre-init layout.
  writeAgentFiles(dir, rootDir, config);

  saveConfig(dir, config);

  console.log(`✅ Aitri initialized: ${dir}`);
  console.log(`📝 ${ideaFileRel} ${created ? 'created' : absorbedRootIdea ? 'moved from project root (your pre-init brief, kept verbatim)' : 'already exists'}`);

  // Surface a legacy idea/ folder early (TPA-3). It is no longer scanned (renamed
  // to idea_context/), so assets left there are silently ignored by every briefing —
  // the source of the DSB-AT-POC adopter's ~50% scope loss. Catch it at init, not
  // only later at run-phase.
  const legacyIdea = listAssets(dir, 'idea');
  if (legacyIdea.length) {
    console.log(
      `\n⚠ ${legacyIdea.length} asset(s) found in idea/ — that folder is NOT scanned ` +
      `(it was renamed to idea_context/), so they will be absent from every briefing.\n` +
      `  Move them so the agent sees them:  mv idea/* ${ideaCtxRel}/`
    );
  }
  console.log(`
What to do now:
  1. Edit ${ideaFileRel} — the seed brief. Describe your project in your own words.
     The more context you provide, the better the requirements will be.
  2. (Optional) Drop reference material into the ${ideaCtxRel}/ folder — mockups, PDFs, a
     prior PRD, screenshots. Aitri lists those files in every briefing so your agent reads them.
     → ${ideaFileRel} is the file you write; ${ideaCtxRel}/ is the folder for supporting assets.

  Then, when ready:
  • aitri run-phase discovery      (optional) Define problem, users, success — before requirements
  • aitri run-phase requirements   Generate the requirements document
  • aitri run-phase ux             (optional, after requirements) Design screens and flows
  • aitri status                   Check pipeline status at any time

  Note: per-agent instruction files were created (AGENTS.md, CLAUDE.md, GEMINI.md, .codex/, .github/) —
  same content, one per agent. Your AI agent reads its own automatically; you don't edit these.`);
}
