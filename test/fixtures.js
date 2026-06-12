/**
 * Test fixtures: project-layout factories (LAYOUT-1).
 *
 * `aitri init` creates the CONTAINED layout (aitri/product/...) since rc.76, so
 * tests that need a legacy FLAT project (everything at the project root —
 * upgrade-path simulations, legacy-regression coverage) must not build their
 * fixture through cmdInit anymore. initFlatProject() replicates what cmdInit
 * produced before rc.76, byte-compatible for fixture purposes: spec/ + IDEA.md +
 * idea_context/ + BACKLOG.md at the root, .gitignore handling, agent files, and
 * the same config fields (artifactsDir: 'spec', no layoutRoot).
 *
 * Signature mirrors cmdInit so call sites swap by name only.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig } from '../lib/state.js';
import { writeAgentFiles } from '../lib/agent-files.js';
import { ensureAitriGitignore } from '../lib/gitignore.js';

export function initFlatProject({ dir, rootDir, VERSION }) {
  fs.mkdirSync(dir, { recursive: true });
  const config = loadConfig(dir);
  config.projectName    = path.basename(dir);
  config.createdAt      = config.createdAt || new Date().toISOString();
  config.aitriVersion   = VERSION;
  config.currentPhase   = config.currentPhase   || 0;
  config.approvedPhases = config.approvedPhases  || [];
  if (config.artifactsDir === undefined) {
    config.artifactsDir = 'spec';
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  }

  const ideaCtxDir = path.join(dir, 'idea_context');
  if (!fs.existsSync(ideaCtxDir)) {
    fs.mkdirSync(ideaCtxDir, { recursive: true });
    fs.writeFileSync(path.join(ideaCtxDir, 'README.md'), '# idea_context/ — supporting assets\n');
  }

  const ideaPath = path.join(dir, 'IDEA.md');
  if (!fs.existsSync(ideaPath)) {
    const tpl = path.join(rootDir, 'templates', 'IDEA.md');
    fs.writeFileSync(ideaPath, fs.readFileSync(tpl, 'utf8'));
  }

  const ignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignorePath)) {
    const tpl = path.join(rootDir, 'templates', 'gitignore');
    let content = 'node_modules/\n.env\n';
    try { content = fs.readFileSync(tpl, 'utf8'); } catch { /* default */ }
    fs.writeFileSync(ignorePath, content);
  }
  ensureAitriGitignore(dir);

  const backlogPath = path.join(dir, 'BACKLOG.md');
  if (!fs.existsSync(backlogPath)) {
    const tpl = path.join(rootDir, 'templates', 'BACKLOG.md');
    fs.writeFileSync(backlogPath, fs.readFileSync(tpl, 'utf8'));
  }

  writeAgentFiles(dir, rootDir);
  saveConfig(dir, config);
}
