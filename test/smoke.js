/**
 * Module: Aitri Smoke Test — End-to-End
 * Purpose: Exercises the full CLI pipeline with real command invocations.
 *          Tests state management, artifact validation, and command flow.
 * Run: node test/smoke.js
 */

import { execSync }   from 'child_process';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';
import { describe, it, before, after } from 'node:test';
import assert         from 'node:assert/strict';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_REQUIREMENTS = JSON.stringify({
  project_name: 'Smoke Test App',
  project_summary: 'A minimal app for smoke testing Aitri CLI.',
  functional_requirements: [
    { id: 'FR-001', title: 'Login',      priority: 'MUST',   type: 'security',    acceptance_criteria: ['returns 401 on invalid token'], description: 'User auth' },
    { id: 'FR-002', title: 'Dashboard',  priority: 'MUST',   type: 'UX',          acceptance_criteria: ['renders at 375px viewport'],    description: 'Main view' },
    { id: 'FR-003', title: 'Export CSV', priority: 'MUST',   type: 'reporting',   acceptance_criteria: ['generates valid CSV file'],      description: 'Data export' },
    { id: 'FR-004', title: 'Save data',  priority: 'SHOULD', type: 'persistence', acceptance_criteria: ['data survives restart'],          description: 'Persistence' },
    { id: 'FR-005', title: 'Totals',     priority: 'NICE',   type: 'logic',       acceptance_criteria: ['returns correct sum'],            description: 'Calculation' },
  ],
  user_stories: [
    { id: 'US-001', requirement_id: 'FR-001', as_a: 'user', i_want: 'to login', so_that: 'I can access data' },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms',    acceptance_criteria: 'load test at 100 RPS' },
    { id: 'NFR-002', category: 'Security',    requirement: 'TLS 1.3 only',   acceptance_criteria: 'SSL Labs A grade' },
    { id: 'NFR-003', category: 'Reliability', requirement: '99.9% uptime',   acceptance_criteria: 'monthly SLA report' },
  ],
  constraints: [],
  technology_preferences: ['Node.js', 'PostgreSQL'],
}, null, 2);

const INVALID_REQUIREMENTS_FEW_FRS = JSON.stringify({
  project_name: 'Bad App',
  project_summary: 'Too few FRs.',
  functional_requirements: [
    { id: 'FR-001', title: 'Login', priority: 'MUST', type: 'security', acceptance_criteria: ['401 on invalid token'], description: 'Auth' },
  ],
  user_stories: [],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'fast' },
    { id: 'NFR-002', category: 'Security',    requirement: 'secure' },
    { id: 'NFR-003', category: 'Reliability', requirement: 'reliable' },
  ],
  constraints: [],
  technology_preferences: [],
}, null, 2);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function aitri(args, cwd) {
  return execSync(`aitri ${args}`, { cwd, encoding: 'utf8' });
}

function aitriShouldFail(args, cwd) {
  try {
    execSync(`aitri ${args}`, { cwd, encoding: 'utf8', stdio: 'pipe' });
    throw new Error(`Expected aitri ${args} to fail, but it succeeded`);
  } catch (e) {
    if (e.message.startsWith('Expected')) throw e;
    return e.stderr || e.stdout || '';
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let tmpDir;

describe('Aitri CLI — Smoke Test', () => {

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-smoke-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aitri --version returns version string', () => {
    const out = aitri('--version', tmpDir);
    assert.match(out.trim(), /^Aitri v\d+\.\d+\.\d+$/);
  });

  it('aitri init creates IDEA.md and .aitri config', () => {
    aitri('init', tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'IDEA.md')), 'IDEA.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.aitri')), '.aitri should exist');
  });

  it('aitri init is idempotent — safe to run twice', () => {
    assert.doesNotThrow(() => aitri('init', tmpDir));
  });

  it('aitri complete 1 fails when artifact is missing', () => {
    const out = aitriShouldFail('complete 1', tmpDir);
    assert.match(out, /Artifact not found|not found/i);
  });

  it('aitri complete 1 fails when artifact has too few FRs', () => {
    fs.writeFileSync(path.join(tmpDir, '01_REQUIREMENTS.json'), INVALID_REQUIREMENTS_FEW_FRS);
    const out = aitriShouldFail('complete 1', tmpDir);
    assert.match(out, /Min 5 functional_requirements/);
  });

  it('aitri complete 1 succeeds with valid artifact', () => {
    fs.writeFileSync(path.join(tmpDir, '01_REQUIREMENTS.json'), VALID_REQUIREMENTS);
    const out = aitri('complete 1', tmpDir);
    assert.match(out, /Phase 1.*complete/i);
  });

  it('aitri approve 1 updates state and shows next step', () => {
    const out = aitri('approve 1', tmpDir);
    assert.match(out, /APPROVED/);
    assert.match(out, /run-phase 2/);
  });

  it('aitri status shows Phase 1 as approved', () => {
    const out = aitri('status', tmpDir);
    assert.match(out, /PM Analysis/);
    assert.match(out, /Approved/);
  });

  it('aitri reject 1 records feedback and prints re-run command', () => {
    const out = aitri('reject 1 --feedback "Need more security FRs"', tmpDir);
    assert.match(out, /rejected/i);
    assert.match(out, /run-phase 1/);
  });

  it('aitri reject without feedback fails with usage error', () => {
    const out = aitriShouldFail('reject 1', tmpDir);
    assert.match(out, /feedback/i);
  });

  it('aitri validate shows missing phases', () => {
    const out = aitri('validate', tmpDir);
    assert.match(out, /MISSING|missing/i);
  });

  it('aitri run-phase 5 fails when verify has not passed', () => {
    const out = aitriShouldFail('run-phase 5', tmpDir);
    assert.match(out, /verify/i);
  });

  it('.aitri config persists approved phases across invocations', () => {
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.aitri'), 'utf8'));
    assert.ok(Array.isArray(config.approvedPhases), 'approvedPhases should be an array');
    assert.ok(config.approvedPhases.includes(1), 'Phase 1 should be in approvedPhases');
  });

  it('aitri approve discovery succeeds with valid artifact', () => {
    const discoveryContent = [
      '## Problem\nFreelancers lose track of invoices.\n',
      '## Users\n- Freelancer: wants to get paid on time.\n',
      '## Success Criteria\n- Invoice created in under 2 minutes.\n- Reminder sent within 24h.\n',
      '## Out of Scope\n- No payroll. No multi-currency. No accounting integration.\n',
    ].join('\n').repeat(2);
    fs.writeFileSync(path.join(tmpDir, '00_DISCOVERY.md'), discoveryContent);
    const out = aitri('complete discovery', tmpDir);
    assert.match(out, /complete/i);
    const out2 = aitri('approve discovery', tmpDir);
    assert.match(out2, /APPROVED/i);
  });

  it('aitri approve ux succeeds with valid artifact', () => {
    const uxContent = [
      '## User Flows\n### Screen: Dashboard\n- Entry: login\n- Steps: view list\n- Exit: logout\n- Error path: retry button\n',
      '## Component Inventory\n| Component | Default | Loading | Error | Empty | Disabled |\n|---|---|---|---|---|---|\n| List | rows | skeleton | error+retry | empty msg | N/A |\n',
      '## Nielsen Compliance\n### Dashboard\n- H1: status updates within 1s\n- H8: minimal controls visible\n',
    ].join('\n').repeat(2);
    fs.writeFileSync(path.join(tmpDir, '01_UX_SPEC.md'), uxContent);
    const out = aitri('complete ux', tmpDir);
    assert.match(out, /complete/i);
    const out2 = aitri('approve ux', tmpDir);
    assert.match(out2, /APPROVED/i);
  });

  it('aitri reject discovery records feedback', () => {
    const out = aitri('reject discovery --feedback "Add more out of scope items"', tmpDir);
    assert.match(out, /rejected/i);
    assert.match(out, /run-phase discovery/);
  });
});
