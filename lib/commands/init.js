/**
 * Module: Command — init
 * Purpose: Initialize a new Aitri project. Creates IDEA.md + .aitri config.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig } from '../state.js';

export function cmdInit({ dir, rootDir, err }) {
  fs.mkdirSync(dir, { recursive: true });
  const config = loadConfig(dir);
  config.projectName    = path.basename(dir);
  config.createdAt      = config.createdAt || new Date().toISOString();
  config.currentPhase   = config.currentPhase   || 0;
  config.approvedPhases = config.approvedPhases  || [];

  const ideaPath = path.join(dir, 'IDEA.md');
  const created  = !fs.existsSync(ideaPath);
  if (created) {
    const tpl = path.join(rootDir, 'templates', 'IDEA.md');
    fs.writeFileSync(ideaPath, fs.readFileSync(tpl, 'utf8'));
  }

  const ignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignorePath)) {
    const tpl = path.join(rootDir, 'templates', '.gitignore');
    fs.writeFileSync(ignorePath, fs.readFileSync(tpl, 'utf8'));
  }

  saveConfig(dir, config);

  console.log(`✅ Aitri initialized: ${dir}`);
  console.log(`📝 IDEA.md ${created ? 'created' : 'already exists'}`);
  console.log(`
What to do now:
  1. Edit IDEA.md — describe your project in your own words
     The more context you provide, the better the requirements will be.

  Optional — run before Phase 1:
  • aitri run-phase discovery   Define the problem, users, and success criteria (needs IDEA.md only)

  When ready:
  • aitri run-phase 1           Generate requirements (Phase 1 — PM Analysis)

  After Phase 1 — optional before Phase 2:
  • aitri run-phase ux          Design screens and flows (needs 01_REQUIREMENTS.json)

  • aitri status                Check pipeline status at any time`);
}
