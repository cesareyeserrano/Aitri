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
  1. Edit IDEA.md — describe your project in your own words
     The more context you provide, the better the requirements will be.

  Optional — run before requirements:
  • aitri run-phase discovery      Define the problem, users, and success criteria (needs IDEA.md only)

  When ready:
  • aitri run-phase requirements   Generate requirements document

  After requirements — optional before architecture:
  • aitri run-phase ux             Design screens and flows (needs 01_REQUIREMENTS.json)

  • aitri status                Check pipeline status at any time`);
}
