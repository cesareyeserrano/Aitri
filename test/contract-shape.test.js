/**
 * Tests: contract-shape — the FULL documented shape of the machine-readable
 * surfaces, mechanized (CONTRACT-SHAPE-0707).
 *
 * Why this exists: the prose contract docs and the emitted payloads have
 * drifted twice in ways only a full-shape check catches — health.driftPresent/
 * staleVerify were documented from v0.1.77 but never emitted for ~40 versions
 * (consumers read undefined), and rc.149 shipped nextActions severity
 * "blocker" outside the documented enum. Both defect classes are shape-level
 * and CI-catchable; the manual integration audits that found them ran late.
 * This file asserts EVERY field documented in STATUS_JSON.md / VALIDATE_JSON.md
 * against real emitted output — the shape half of those docs, executable.
 * (Deliberately zero-dep: the assertShape helper below replaces a JSON-Schema
 * validator; publishing schemas was evaluated and declined 2026-07-07 — no
 * consumer asked, and this test captures the defect-catching value.)
 *
 * Rule for editors: a change that touches these payloads must update
 * STATUS_JSON.md / VALIDATE_JSON.md AND this spec in the same commit —
 * that is the point.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdStatus } from '../lib/commands/status.js';
import { cmdValidate } from '../lib/commands/validate.js';
import { hashArtifact, hashResultsFile } from '../lib/state.js';

// ── Shape spec mini-language ─────────────────────────────────────────────────
// A spec is: 'string' | 'boolean' | 'number' | 'array' | 'object' |
// a union 'a|b|null', an enum (array of literals), a function predicate,
// or a nested object spec applied to every element of an array via {each: spec}.

function checkType(value, type) {
  switch (type) {
    case 'string':  return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'number':  return typeof value === 'number';
    case 'null':    return value === null;
    case 'array':   return Array.isArray(value);
    case 'object':  return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:        return false;
  }
}

function assertShape(value, spec, ctx) {
  if (typeof spec === 'function') {
    assert.ok(spec(value), `${ctx}: predicate failed (got ${JSON.stringify(value)})`);
    return;
  }
  if (typeof spec === 'string') {
    const ok = spec.split('|').some(t => checkType(value, t));
    assert.ok(ok, `${ctx}: expected ${spec}, got ${JSON.stringify(value)} (${typeof value})`);
    return;
  }
  if (Array.isArray(spec)) { // enum of literals
    assert.ok(spec.includes(value), `${ctx}: ${JSON.stringify(value)} not in enum ${JSON.stringify(spec)}`);
    return;
  }
  if (spec && typeof spec === 'object' && 'each' in spec) {
    assert.ok(Array.isArray(value), `${ctx}: expected array, got ${typeof value}`);
    value.forEach((el, i) => assertShape(el, spec.each, `${ctx}[${i}]`));
    return;
  }
  // nested object spec: every documented field must be PRESENT and well-typed.
  assert.ok(value !== null && typeof value === 'object', `${ctx}: expected object, got ${JSON.stringify(value)}`);
  for (const [key, sub] of Object.entries(spec)) {
    assert.ok(key in value, `${ctx}.${key}: documented field MISSING from emitted payload (the health.driftPresent failure class)`);
    assertShape(value[key], sub, `${ctx}.${key}`);
  }
}

// ── Fixture: a deployable root project (real command runs, no mocks) ────────

const ARTIFACTS = {
  'IDEA.md': '# Idea\nSolve a problem.\n',
  'spec/01_REQUIREMENTS.json': '{"project_name":"T","functional_requirements":[]}',
  'spec/02_SYSTEM_DESIGN.md': '## Executive Summary\nDesign.\n',
  'spec/03_TEST_CASES.json': '{"test_cases":[]}',
  'spec/04_BUILD_REPORT.json': '{"files_created":[],"setup_commands":[]}',
  'spec/04_TEST_RESULTS.json': JSON.stringify({
    summary: { total: 1, passed: 1, failed: 0 },
    results: [{ tc_id: 'TC-001h', status: 'pass' }],
    quality_gates: [{ name: 'lint', command: 'x', required: true, status: 'pass', exit_code: 0 }],
    ac_coverage: [{ ac_id: 'AC-001', fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' }],
  }),
  'spec/05_TRACEABILITY.json': '{"requirement_compliance":[]}',
};

function capture(fn) {
  let out = '';
  const origW = process.stdout.write.bind(process.stdout);
  const origL = console.log.bind(console);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  console.log = (...a) => { out += a.join(' ') + '\n'; };
  try { fn(); } finally { process.stdout.write = origW; console.log = origL; }
  return out;
}

let dir;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-contract-shape-'));
  const hashes = {};
  const phaseMap = {
    'spec/01_REQUIREMENTS.json': '1', 'spec/02_SYSTEM_DESIGN.md': '2',
    'spec/03_TEST_CASES.json': '3', 'spec/04_BUILD_REPORT.json': '4',
    'spec/05_TRACEABILITY.json': '5',
  };
  for (const [rel, content] of Object.entries(ARTIFACTS)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    if (phaseMap[rel]) hashes[phaseMap[rel]] = hashArtifact(content);
  }
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
    projectName: 'ContractShape',
    artifactsDir: 'spec',
    approvedPhases: [1, 2, 3, 4, 5],
    completedPhases: [1, 2, 3, 4, 5],
    verifyPassed: true,
    verifySummary: { passed: 1, failed: 0, skipped: 0, total: 1 },
    artifactHashes: hashes,
    verifyResultsHash: hashResultsFile(ARTIFACTS['spec/04_TEST_RESULTS.json']),
    lastVerifyRun: { passed: 1, failed: 0, skipped: 0, manual: 0, at: '2026-07-07T10:00:00.000Z' },
    verifyRanAt: '2026-07-07T10:00:00.000Z',
  }));
  fs.writeFileSync(path.join(dir, '.aitri.local'), JSON.stringify({
    lastSession: { at: '2026-07-07T10:00:00.000Z', agent: 'claude', event: 'approve 5' },
  }));
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

// ── STATUS_JSON.md — full documented shape ───────────────────────────────────

describe('contract shape: status --json emits every field STATUS_JSON.md documents', () => {
  it('top-level + nested blocks match the documented types/enums', () => {
    const payload = JSON.parse(capture(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] })));

    assertShape(payload, {
      // Legacy block (stable since v0.1.64)
      project: 'string',
      dir: 'string',
      aitriVersion: 'string|null',
      cliVersion: 'string',
      versionMismatch: 'boolean',
      phases: { each: {
        key: v => Number.isInteger(v) || typeof v === 'string',
        name: 'string',
        status: ['not_started', 'in_progress', 'completed', 'approved', 'passed', 'not_run'],
        drift: 'boolean',
      } },
      driftPhases: 'array',
      nextAction: 'string|null',
      allComplete: 'boolean',
      inHub: 'boolean',
      rejections: 'object',
      // Snapshot-derived extensions
      snapshotVersion: 'number|null',
      lastSession: 'object|null',
      features: 'array',
      bugs: {
        total: 'number', open: 'number', blocking: 'number',
        bySeverity: { critical: 'number', high: 'number', medium: 'number', low: 'number' },
        openIds: 'array',
        parseErrors: 'array',
      },
      backlog: { open: 'number' },
      audit: { exists: 'boolean', stalenessDays: 'number|null' },
      tests: {
        totals: { passed: 'number', failed: 'number', skipped: 'number', manual: 'number', total: 'number' },
        perPipeline: { each: {
          scope: 'string',
          passed: 'number|null', failed: 'number|null', total: 'number|null',
          ran: 'boolean',
          quality_gates: v => v === null || Array.isArray(v),
          ac_coverage: v => v === null || Array.isArray(v),
        } },
        stalenessDays: 'number|null',
      },
      reconcile: {
        state: 'string|null', method: 'string|null', baseRef: 'string|null',
        uncountedFiles: 'number|null',
      },
      health: {
        deployable: 'boolean',
        deployableReasons: 'array',
        staleAudit: 'boolean',
        blockedByBugs: 'boolean',
        activeFeatures: 'number',
        versionMismatch: 'boolean',
        // The two fields that were documented-but-never-emitted for ~40 versions:
        driftPresent: 'array',
        staleVerify: 'array',
      },
      nextActions: { each: {
        command: 'string',
        severity: ['info', 'warn', 'critical'], // rc.149 shipped 'blocker' out-of-enum
      } },
    }, 'status');

    // lastSession (rc.161): when non-null it must carry the documented core keys.
    assert.ok(payload.lastSession, 'fixture seeds a session — must be emitted');
    assertShape(payload.lastSession, { at: 'string', agent: 'string|null', event: 'string' }, 'status.lastSession');

    // quality surfaces (rc.161): fixture seeds them — verify projection shape.
    const root = payload.tests.perPipeline.find(p => p.scope === 'root');
    assertShape(root.quality_gates, { each: {
      name: 'string|null',
      status: ['pass', 'fail', 'error', null],
      required: 'boolean',
    } }, 'status.tests.perPipeline[root].quality_gates');
    for (const g of root.quality_gates) {
      assert.ok(!('command' in g) && !('output' in g), 'command/output must stay in the artifact');
    }
  });
});

// ── VALIDATE_JSON.md — full documented shape ─────────────────────────────────

describe('contract shape: validate --json emits every field VALIDATE_JSON.md documents', () => {
  it('top-level + artifacts[] match the documented types/enums', () => {
    const payload = JSON.parse(capture(() => cmdValidate({ dir, args: ['--json'] })));

    assertShape(payload, {
      // Legacy fields (stable; early-Hub contract)
      project: 'string',
      dir: 'string',
      allValid: 'boolean',
      artifacts: { each: {
        name: 'string',
        exists: 'boolean',
        approved: 'boolean',
        drift: 'boolean',
        required: 'boolean',
      } },
      deployFiles: {
        'Dockerfile': 'boolean',
        'docker-compose.yml': 'boolean',
        'DEPLOYMENT.md': 'boolean',
        '.env.example': 'boolean',
      },
      setupCommands: 'array',
      // Snapshot-derived extensions
      deployable: 'boolean',
      deployableReasons: { each: { type: 'string', message: 'string' } },
      openBugs: 'number',
      blockingBugs: 'number',
    }, 'validate');

    // The verify evidence entry (always present, required) carries its extras.
    const results = payload.artifacts.find(a => a.name === '04_TEST_RESULTS.json');
    assert.ok(results, 'verify evidence entry must always be present');
    assertShape(results.verifyPassed, 'boolean', 'validate.artifacts[04_TEST_RESULTS].verifyPassed');

    // The deployable fixture must actually read as valid+deployable — otherwise
    // this test would green-light shapes from a degenerate error payload.
    assert.equal(payload.allValid, true, 'fixture must reach allValid (guards the rc.160 absorbed-brief class)');
  });
});
