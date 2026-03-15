/**
 * Module: Command — init
 * Purpose: Initialize a new Aitri project. Creates IDEA.md + .aitri config.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { loadConfig, saveConfig } from '../state.js';

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

  // Create idea/ folder for mockups, Figma exports, reference docs, etc.
  const ideaDir = path.join(dir, 'idea');
  if (!fs.existsSync(ideaDir)) {
    fs.mkdirSync(ideaDir, { recursive: true });
    fs.writeFileSync(
      path.join(ideaDir, 'README.md'),
      '# idea/\n\nDrop supporting assets here: mockups, Figma exports, PDFs, screenshots, reference docs.\n\nAitri automatically lists files in this folder in every phase briefing so the agent can reference them.\n'
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
    const tpl = path.join(rootDir, 'templates', '.gitignore');
    fs.writeFileSync(ignorePath, fs.readFileSync(tpl, 'utf8'));
  }

  saveConfig(dir, config);

  // Optional: register in Aitri Hub if installed — silent on any error
  // Skip temp/system directories (e.g. test runners, CI, /tmp)
  const isTempDir = /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(dir);
  if (!isTempDir) {
    try {
      const hubProjectsPath = path.join(os.homedir(), '.aitri-hub', 'projects.json');
      if (fs.existsSync(hubProjectsPath)) {
        const hubData = JSON.parse(fs.readFileSync(hubProjectsPath, 'utf8'));
        const projects = Array.isArray(hubData.projects) ? hubData.projects : [];
        if (!projects.some(p => p.location === dir)) {
          const id = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 8);
          projects.push({ id, name: path.basename(dir).slice(0, 40), location: dir, type: 'local', addedAt: new Date().toISOString() });
          hubData.projects = projects;
          fs.writeFileSync(hubProjectsPath, JSON.stringify(hubData, null, 2));
          console.log(`  Registered in Aitri Hub`);
        }
      }
    } catch { /* Hub not installed or inaccessible — skip silently */ }
  }

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
