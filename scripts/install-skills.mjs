#!/usr/bin/env node
/**
 * install-skills.mjs
 * Copies the appropriate agent skill file to ~/.claude/skills/aitri/SKILL.md
 * Run automatically via `npm install -g .` (postinstall) or manually with:
 *   node scripts/install-skills.mjs [--agent claude|codex|opencode|gemini]
 */

import fs from "fs";
import path from "path";
import os from "os";

const args = process.argv.slice(2);
const agentFlag = args.indexOf("--agent");
const agent = agentFlag !== -1 ? args[agentFlag + 1] : "claude";

const validAgents = ["claude", "codex", "opencode", "gemini"];
if (!validAgents.includes(agent)) {
  console.error(`Unknown agent: ${agent}. Valid options: ${validAgents.join(", ")}`);
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const srcFile = path.join(repoRoot, "adapters", agent, "SKILL.md");

if (!fs.existsSync(srcFile)) {
  console.error(`Skill file not found: ${srcFile}`);
  process.exit(1);
}

// Detect Claude Code skills directory
const claudeSkillsDir = path.join(os.homedir(), ".claude", "skills", "aitri");

if (!fs.existsSync(claudeSkillsDir)) {
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
}

const destFile = path.join(claudeSkillsDir, "SKILL.md");
fs.copyFileSync(srcFile, destFile);

console.log(`✓ Aitri skill installed for ${agent}: ${destFile}`);
