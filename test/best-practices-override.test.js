/**
 * Tests for BP-SYSTEM-0722 (2.2.0-rc.6) — best-practices resolution chain.
 *
 * The override shipped (README-documented since 2026-03) but its precedence was
 * untested, and the feature-scope rung did not exist: feature dispatch passes the
 * FEATURE dir as `dir`, so a feature-phase briefing silently skipped the owning
 * project's `best-practices/` and fell to Aitri's global default — the README
 * promise was false for every feature phase. Chain now:
 *   scope-local best-practices/ → owning project's best-practices/ (featureRoot)
 *   → templates/best-practices/ (global default).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readBestPractices } from '../lib/commands/run-phase.js';

// Same resolution bin/aitri.js uses: package root (parent of lib/, holds templates/).
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-bp-override-test-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
function writeBp(base, filename, content) {
  const d = path.join(base, 'best-practices');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, filename), content);
}

describe('readBestPractices() — resolution chain', () => {
  it('root scope: project override beats the global default', () => {
    const proj = tmpDir();
    try {
      writeBp(proj, 'testing.md', '## PROJECT TESTING STANDARDS (override)');
      const out = readBestPractices(proj, null, PKG_ROOT, 'testing.md');
      assert.match(out, /PROJECT TESTING STANDARDS/);
      assert.doesNotMatch(out, /One behavior per test case/); // global marker absent
    } finally { cleanup(proj); }
  });

  it('root scope: falls back to the global template when no override exists', () => {
    const proj = tmpDir();
    try {
      const out = readBestPractices(proj, null, PKG_ROOT, 'testing.md');
      assert.match(out, /One behavior per test case/); // global testing.md content
    } finally { cleanup(proj); }
  });

  it('feature scope: the OWNING PROJECT override reaches the feature briefing (the rc.6 fix)', () => {
    const proj = tmpDir();
    try {
      writeBp(proj, 'testing.md', '## PROJECT TESTING STANDARDS (override)');
      const featDir = path.join(proj, 'features', 'billing');
      fs.mkdirSync(featDir, { recursive: true });
      // dir = feature dir (what feature dispatch passes), featureRoot = project.
      const out = readBestPractices(featDir, proj, PKG_ROOT, 'testing.md');
      assert.match(out, /PROJECT TESTING STANDARDS/,
        'feature phases must inherit the project best-practices override');
    } finally { cleanup(proj); }
  });

  it('feature scope: a feature-local best-practices/ beats the project override', () => {
    const proj = tmpDir();
    try {
      writeBp(proj, 'testing.md', '## PROJECT STANDARDS');
      const featDir = path.join(proj, 'features', 'billing');
      writeBp(featDir, 'testing.md', '## FEATURE-LOCAL STANDARDS');
      const out = readBestPractices(featDir, proj, PKG_ROOT, 'testing.md');
      assert.match(out, /FEATURE-LOCAL STANDARDS/);
    } finally { cleanup(proj); }
  });

  it('feature scope: no overrides anywhere falls through to the global default', () => {
    const proj = tmpDir();
    try {
      const featDir = path.join(proj, 'features', 'billing');
      fs.mkdirSync(featDir, { recursive: true });
      const out = readBestPractices(featDir, proj, PKG_ROOT, 'testing.md');
      assert.match(out, /One behavior per test case/);
    } finally { cleanup(proj); }
  });

  it('unknown filename returns empty string, never throws', () => {
    const proj = tmpDir();
    try {
      assert.equal(readBestPractices(proj, null, PKG_ROOT, 'nope.md'), '');
    } finally { cleanup(proj); }
  });
});

describe('feature-scope override — end-to-end through the CLI (pins the wiring, not just the helper)', () => {
  it('`feature run-phase <name> 2` injects the OWNING PROJECT override into the briefing', () => {
    const proj = tmpDir();
    try {
      const MARKER = 'OVERRIDE-MARKER-E2E-ARCH';
      fs.writeFileSync(path.join(proj, '.aitri'), JSON.stringify({
        projectName: 'bp-e2e', aitriVersion: '2.2.0-rc.6', artifactsDir: 'spec',
        approvedPhases: [1], completedPhases: [1],
      }));
      writeBp(proj, 'architecture.md', `## PROJECT ARCH STANDARDS ${MARKER}`);
      fs.writeFileSync(path.join(proj, 'IDEA.md'), '# Idea\n');
      fs.mkdirSync(path.join(proj, 'spec'), { recursive: true });
      const reqs = JSON.stringify({
        project_name: 'bp-e2e',
        functional_requirements: [{ id: 'FR-001', priority: 'MUST', title: 't', acceptance_criteria: ['AC'] }],
        non_functional_requirements: [], user_stories: [],
      });
      fs.writeFileSync(path.join(proj, 'spec', '01_REQUIREMENTS.json'), reqs);

      const featDir = path.join(proj, 'features', 'pay');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(featDir, '.aitri'), JSON.stringify({
        projectName: 'pay', artifactsDir: 'spec', approvedPhases: [1], completedPhases: [1],
      }));
      fs.writeFileSync(path.join(featDir, 'FEATURE_IDEA.md'), '# Feature idea\n');
      fs.writeFileSync(path.join(featDir, 'spec', '01_REQUIREMENTS.json'), reqs);

      const out = execSync(`node ${path.join(PKG_ROOT, 'bin', 'aitri.js')} feature run-phase pay 2`, {
        cwd: proj, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.match(out, new RegExp(MARKER),
        'the feature phase-2 briefing must carry the project best-practices override');
    } finally { cleanup(proj); }
  });
});
