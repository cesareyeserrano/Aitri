/**
 * Module: Aitri State Manager
 * Purpose: Load/save .aitri config and read project artifacts.
 *          Shared by CLI and MCP server.
 */

import fs from 'fs';
import path from 'path';

const CONFIG_FILE = '.aitri';

export function loadConfig(dir) {
  const p = path.join(dir, CONFIG_FILE);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {
      process.stderr.write(`[aitri] Warning: .aitri config is malformed — resetting to empty state.\n`);
    }
  }
  return { currentPhase: 0, approvedPhases: [] };
}

export function saveConfig(dir, config) {
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2),
  );
}

export function readArtifact(dir, filename) {
  const p = path.join(dir, filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
