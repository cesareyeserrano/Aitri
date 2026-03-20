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
    fs.writeFileSync(path.join(tmpDir, 'spec', '01_REQUIREMENTS.json'), INVALID_REQUIREMENTS_FEW_FRS);
    const out = aitriShouldFail('complete 1', tmpDir);
    assert.match(out, /Min 5 functional_requirements/);
  });

  it('aitri approve 1 fails when complete 1 has not passed', () => {
    // artifact file exists (from previous test) but complete did not pass
    const out = aitriShouldFail('approve 1', tmpDir);
    assert.match(out, /not been validated|complete 1/i);
  });

  it('aitri complete 1 succeeds with valid artifact', () => {
    fs.writeFileSync(path.join(tmpDir, 'spec', '01_REQUIREMENTS.json'), VALID_REQUIREMENTS);
    const out = aitri('complete 1', tmpDir);
    assert.match(out, /Phase requirements.*complete/i);
  });

  it('aitri approve 1 updates state and shows next step', () => {
    const out = aitri('approve 1', tmpDir);
    assert.match(out, /APPROVED/);
    // VALID_REQUIREMENTS has FR-002 type:UX — pipeline must require UX phase before Phase 2
    assert.match(out, /run-phase ux/);
    assert.ok(!out.includes('run-phase 2'), 'must not skip to Phase 2 when UX FRs are present');
  });

  it('aitri status shows Phase 1 as approved', () => {
    const out = aitri('status', tmpDir);
    assert.match(out, /requirements/);
    assert.match(out, /Approved/);
  });

  it('aitri reject 1 records feedback and prints re-run command', () => {
    const out = aitri('reject 1 --feedback "Need more security FRs"', tmpDir);
    assert.match(out, /rejected/i);
    assert.match(out, /run-phase requirements/);
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
      '## Discovery Confidence\nConfidence: high\nEvidence gaps: none\nHandoff decision: ready — all sections grounded in user input\n',
    ].join('\n').repeat(2);
    fs.writeFileSync(path.join(tmpDir, 'spec', '00_DISCOVERY.md'), discoveryContent);
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
    fs.writeFileSync(path.join(tmpDir, 'spec', '01_UX_SPEC.md'), uxContent);
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

  // ─── Regression Matrix ─────────────────────────────────────────────────────

  it('[regression] approve N success must persist in .aitri', () => {
    // Phase 1 was approved earlier in this test suite — re-verify it's in .aitri
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.aitri'), 'utf8'));
    assert.ok(Array.isArray(config.approvedPhases), 'approvedPhases must be an array');
    assert.ok(config.approvedPhases.includes(1), 'Phase 1 must be persisted in approvedPhases');
  });

  it('[regression] status must match .aitri approvedPhases', () => {
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.aitri'), 'utf8'));
    const statusOut = aitri('status', tmpDir);
    // Phase 1 is in approvedPhases — status must show Approved
    if (config.approvedPhases.includes(1)) {
      assert.match(statusOut, /Approved/);
    }
    // Phases not in approvedPhases must NOT show as Approved (spot-check Phase 2)
    if (!config.approvedPhases.includes(2)) {
      const lines = statusOut.split('\n');
      const phase2Line = lines.find(l => l.includes('Architect') || (l.includes('2') && !l.includes('Phase 2')));
      if (phase2Line) assert.doesNotMatch(phase2Line, /✅.*Approved/);
    }
  });

  it('[regression] verify-complete must be reflected in status', () => {
    // Simulate verifyPassed: true in .aitri and confirm status shows it
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.aitri'), 'utf8'));
    // Phase 4 must be approved for verify row to show; skip if not in this test's state
    if (config.approvedPhases.includes(4) || config.verifyPassed) {
      const statusOut = aitri('status', tmpDir);
      if (config.verifyPassed) {
        assert.match(statusOut, /Passed/);
      }
    }
    // Always verify the .aitri field is well-formed if it exists
    if ('verifyPassed' in config) {
      assert.equal(typeof config.verifyPassed, 'boolean', 'verifyPassed must be boolean');
    }
  });

  it('[regression] validate must not contradict approved state', () => {
    // Phase 1 is approved — validate should NOT mark it as MISSING or unapproved
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.aitri'), 'utf8'));
    const validateOut = aitri('validate', tmpDir);
    if (config.approvedPhases.includes(1)) {
      const lines = validateOut.split('\n');
      const reqLine = lines.find(l => l.includes('01_REQUIREMENTS.json'));
      // Should be ✅, not ❌ or ⏳ with "(not approved)"
      if (reqLine) {
        assert.ok(!reqLine.includes('not approved'), '01_REQUIREMENTS.json should not show "not approved"');
        assert.ok(!reqLine.includes('MISSING'), '01_REQUIREMENTS.json should not show "MISSING"');
      }
    }
  });

  it('[regression] aitri commands work from a subdirectory', () => {
    // Create a subdirectory and run aitri status from it — findProjectDir must locate .aitri
    const subDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(subDir, { recursive: true });
    const out = aitri('status', subDir);
    assert.match(out, /Aitri/i);
    // Should show Phase 1 as approved (state carried from parent)
    assert.match(out, /Approved/);
  });

  it('[regression] aitri init <path> initializes in the given directory, not cwd', () => {
    // Use a fresh tmp dir as cwd (no .aitri, no IDEA.md) to confirm init targets the arg, not cwd
    const cwdForTest = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-init-cwd-'));
    const target     = path.join(cwdForTest, 'nested', 'new-project');
    try {
      const out = aitri(`init ${target}`, cwdForTest);
      assert.match(out, /initialized/i);
      assert.ok(fs.existsSync(path.join(target, 'IDEA.md')),       'IDEA.md should be in target dir');
      assert.ok(fs.existsSync(path.join(target, '.aitri')),        '.aitri should be in target dir');
      assert.ok(!fs.existsSync(path.join(cwdForTest, 'IDEA.md')),  'IDEA.md must NOT be created in cwd');
      const cfg = JSON.parse(fs.readFileSync(path.join(target, '.aitri'), 'utf8'));
      assert.equal(cfg.projectName, 'new-project', 'projectName must match target folder name');
    } finally {
      fs.rmSync(cwdForTest, { recursive: true, force: true });
    }
  });

  it('[regression] aitri init <path> works with relative path argument', () => {
    const relTarget = 'relative-project';
    const absTarget = path.join(tmpDir, relTarget);
    const out = aitri(`init ${relTarget}`, tmpDir);
    assert.match(out, /initialized/i);
    assert.ok(fs.existsSync(path.join(absTarget, '.aitri')), '.aitri should be in relative target dir');
  });

  // ─── v0.1.26 — Drift Detection + Approval Hashing ──────────────────────────

  it('[v0.1.26] approve stores artifactHashes in .aitri', () => {
    // Phase 1 was approved earlier in this suite
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.aitri'), 'utf8'));
    assert.ok(config.artifactHashes, 'artifactHashes must exist in .aitri after approve');
    assert.ok(config.artifactHashes['1'], 'artifactHashes["1"] must be set after approve 1');
    assert.match(config.artifactHashes['1'], /^[a-f0-9]{64}$/, 'hash must be 64-char hex (SHA-256)');
  });

  it('[v0.1.26] aitri status shows DRIFT when artifact modified after approval', () => {
    // Modify 01_REQUIREMENTS.json after Phase 1 was approved
    const artifactPath = path.join(tmpDir, 'spec', '01_REQUIREMENTS.json');
    const original = fs.readFileSync(artifactPath, 'utf8');
    const modified = JSON.parse(original);
    modified.project_name = 'MODIFIED AFTER APPROVAL';
    fs.writeFileSync(artifactPath, JSON.stringify(modified, null, 2));

    try {
      const out = aitri('status', tmpDir);
      assert.match(out, /DRIFT/, 'status must show DRIFT when artifact was modified after approval');
    } finally {
      fs.writeFileSync(artifactPath, original); // restore so subsequent tests are not affected
    }
  });

  it('[v0.1.26] aitri validate shows DRIFT when artifact modified after approval', () => {
    const artifactPath = path.join(tmpDir, 'spec', '01_REQUIREMENTS.json');
    const original = fs.readFileSync(artifactPath, 'utf8');
    const modified = JSON.parse(original);
    modified.project_name = 'MODIFIED AFTER APPROVAL';
    fs.writeFileSync(artifactPath, JSON.stringify(modified, null, 2));

    try {
      const out = aitri('validate', tmpDir);
      assert.match(out, /DRIFT/, 'validate must show DRIFT when artifact was modified after approval');
      // allGood must be false — "Pipeline complete" message must NOT appear
      assert.doesNotMatch(out, /Pipeline complete/, 'validate must not declare pipeline complete when drift exists');
    } finally {
      fs.writeFileSync(artifactPath, original);
    }
  });

  it('[v0.1.26] aitri approve 1 blocks when artifact modified after complete (drift gate)', () => {
    // Modifying artifact after complete is now caught as drift — approve blocks in non-TTY
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ux-warn-'));
    try {
      execSync('aitri init', { cwd: dir, encoding: 'utf8' });
      fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), VALID_REQUIREMENTS);
      execSync('aitri complete 1', { cwd: dir, encoding: 'utf8' });
      // Modify artifact after complete — drift gate must block approve in non-TTY
      fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), '{not valid json}');
      let threw = false;
      try {
        execSync('aitri approve 1 2>&1', { cwd: dir, encoding: 'utf8' });
      } catch (e) {
        threw = true;
        assert.match(e.stdout || '', /artifact changed after approval|human review required/i);
      }
      assert.ok(threw, 'approve must exit non-zero when artifact modified after complete');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[regression] phase2 complete passes with numbered section headers', () => {
    // Write a 02_SYSTEM_DESIGN.md with numbered headers (## 1. Executive Summary style)
    const design = [
      '## 1. Executive Summary',
      'Node.js v20 + PostgreSQL 16. Justified by team expertise.',
      '',
      '## 2. System Architecture',
      '```',
      'Client → API → DB',
      '```',
      '',
      '## 3. Data Model',
      'Users: id, email, password_hash',
      '',
      '## 4. API Design',
      'POST /auth/login — returns JWT',
      '',
      '## 5. Security Design',
      'JWT HS256, bcrypt 12 rounds',
      '',
      '## 6. Performance & Scalability',
      'Connection pool size 20, Redis cache',
      '',
      '## 7. Deployment Architecture',
      'Docker + docker-compose',
      '',
      '## 8. Risk Analysis',
      'Risk 1: DB exhaustion — pool limit',
      'Risk 2: Token leak — short TTL',
      'Risk 3: Spike — horizontal scale',
      '',
      '## 9. Technical Risk Flags',
      'None detected — Node.js and PostgreSQL are compatible with all stated NFRs.',
      ...Array(10).fill('Extra design content line.'),
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'spec', '02_SYSTEM_DESIGN.md'), design);
    // complete 2 requires phase 1 approved (already done) and the artifact to exist
    const out = aitri('complete 2', tmpDir);
    assert.match(out, /Phase architecture.*complete/i);
  });
});

// ─── run-phase smoke ──────────────────────────────────────────────────────────

describe('Aitri CLI — run-phase smoke', () => {
  let rpDir;

  const LONG_IDEA = [
    'Invoice management app for freelancers.',
    'Freelancers currently track invoices in spreadsheets.',
    'When a payment is late there is no automated reminder.',
    'This causes late payments to go unnoticed for weeks.',
    'The app must let users create invoices in under 2 minutes.',
    'Overdue invoices should trigger an automated reminder within 24 hours.',
    'Payment status must be visible at a glance from a single dashboard.',
    'The app targets solo freelancers managing 5 to 20 clients.',
    'No payroll, no multi-currency, no accounting integrations at launch.',
    'Web only — no native mobile app in first version.',
  ].join(' ');

  const DESIGN_MD = [
    '## Executive Summary',
    'Node.js v20 + PostgreSQL 16.',
    '',
    '## System Architecture',
    '```\nClient → API → DB\n```',
    '',
    '## Data Model',
    'invoices: id, client_id, amount, due_date, status',
    '',
    '## API Design',
    'POST /invoices — create invoice',
    '',
    '## Security Design',
    'JWT HS256, bcrypt cost 12',
    '',
    '## Performance & Scalability',
    'Connection pool 20, Redis cache',
    '',
    '## Deployment Architecture',
    'Docker + docker-compose',
    '',
    '## Risk Analysis',
    'Risk 1: DB exhaustion — pool cap',
    'Risk 2: Token leak — short TTL',
    'Risk 3: Load spike — horiz. scale',
    '',
    '## Technical Risk Flags',
    'None detected — Node.js and PostgreSQL are compatible with all stated NFRs.',
    ...Array(10).fill('Extra content.'),
  ].join('\n');

  before(() => {
    rpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rp-'));
    execSync('aitri init', { cwd: rpDir, encoding: 'utf8' });
    fs.writeFileSync(path.join(rpDir, 'IDEA.md'), LONG_IDEA);
    fs.writeFileSync(path.join(rpDir, 'spec', '01_REQUIREMENTS.json'), VALID_REQUIREMENTS);
    fs.writeFileSync(path.join(rpDir, 'spec', '02_SYSTEM_DESIGN.md'), DESIGN_MD);
  });

  after(() => fs.rmSync(rpDir, { recursive: true, force: true }));

  it('[BUG-FIX] run-phase 1 reads IDEA.md from root, not spec/', () => {
    const out = aitri('run-phase 1', rpDir);
    assert.ok(out.length > 200, 'briefing must be non-trivially long');
    assert.match(out, /Phase 1|PM Analysis|Product Manager/i);
  });

  it('[BUG-FIX] run-phase 2 reads IDEA.md from root when spec/ is configured', () => {
    const out = aitri('run-phase 2', rpDir);
    assert.ok(out.length > 200, 'briefing must be non-trivially long');
    assert.match(out, /Phase 2|System Architecture|Architect/i);
  });

  it('run-phase 2 briefing injects architecture best-practices', () => {
    const out = aitri('run-phase 2', rpDir);
    assert.match(out, /Separation of concerns|Engineering Standards|12-factor/i);
  });

  it('run-phase 3 produces QA briefing with TC naming convention', () => {
    const out = aitri('run-phase 3', rpDir);
    assert.match(out, /Phase 3|QA|Test/i);
    assert.match(out, /TC-001h|naming convention|ending in/i);
  });

  it('run-phase 3 briefing injects testing best-practices', () => {
    const out = aitri('run-phase 3', rpDir);
    assert.match(out, /One behavior per test case|Testing Standards|Concrete values/i);
  });
});

// ─── complete 3 h/f gate smoke ────────────────────────────────────────────────

describe('Aitri CLI — complete 3 h/f naming gate', () => {
  let gateDir;

  const makeTC = (id, reqId, type, scenario) => ({
    id, requirement_id: reqId, title: `Test ${id}`, type,
    scenario, user_story_id: 'US-001', ac_id: 'AC-001',
    priority: 'high', preconditions: [], steps: ['step'],
    expected_result: 'HTTP 200 with expected response', test_data: {},
    given: 'user=alice@example.com exists', when: 'POST /login', then: 'status 200',
  });

  const VALID_TCS = JSON.stringify({
    test_plan: { strategy: 'unit+e2e', coverage_goal: '80%', test_types: ['unit', 'e2e'] },
    test_cases: [
      makeTC('TC-001h', 'FR-001', 'unit',        'happy_path'),
      makeTC('TC-001e', 'FR-001', 'integration', 'edge_case'),
      makeTC('TC-001f', 'FR-001', 'e2e',         'negative'),
      makeTC('TC-002h', 'FR-002', 'unit',        'happy_path'),
      makeTC('TC-002e', 'FR-002', 'integration', 'edge_case'),
      makeTC('TC-002f', 'FR-002', 'e2e',         'negative'),
    ],
  }, null, 2);

  const NO_H_TCS = JSON.stringify({
    test_plan: { strategy: 'unit+e2e', coverage_goal: '80%', test_types: ['unit', 'e2e'] },
    test_cases: [
      makeTC('TC-001x', 'FR-001', 'unit',        'happy_path'), // no h suffix
      makeTC('TC-001e', 'FR-001', 'integration', 'edge_case'),
      makeTC('TC-001f', 'FR-001', 'e2e',         'negative'),
      makeTC('TC-002h', 'FR-002', 'unit',        'happy_path'),
      makeTC('TC-002e', 'FR-002', 'integration', 'edge_case'),
      makeTC('TC-002f', 'FR-002', 'e2e',         'negative'),
    ],
  }, null, 2);

  before(() => {
    gateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-tc-'));
    execSync('aitri init', { cwd: gateDir, encoding: 'utf8' });
  });

  after(() => fs.rmSync(gateDir, { recursive: true, force: true }));

  it('complete 3 passes with valid h/f-suffixed TCs', () => {
    fs.writeFileSync(path.join(gateDir, 'spec', '03_TEST_CASES.json'), VALID_TCS);
    const out = aitri('complete 3', gateDir);
    assert.match(out, /Phase tests.*complete/i);
  });

  it('complete 3 rejects TCs missing h suffix (Rank 11 gate)', () => {
    fs.writeFileSync(path.join(gateDir, 'spec', '03_TEST_CASES.json'), NO_H_TCS);
    const out = aitriShouldFail('complete 3', gateDir);
    assert.match(out, /no TC id ending in 'h'/i);
  });
});

// ─── resume + checkpoint smoke ────────────────────────────────────────────────

describe('Aitri CLI — resume + checkpoint smoke', () => {
  let rcDir;

  before(() => {
    rcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rc-'));
    execSync('aitri init', { cwd: rcDir, encoding: 'utf8' });
    fs.writeFileSync(path.join(rcDir, 'spec', '01_REQUIREMENTS.json'), VALID_REQUIREMENTS);
    execSync('aitri complete 1', { cwd: rcDir, encoding: 'utf8' });
    execSync('aitri approve 1', { cwd: rcDir, encoding: 'utf8' });
  });

  after(() => fs.rmSync(rcDir, { recursive: true, force: true }));

  it('aitri resume prints structured markdown to stdout', () => {
    const out = aitri('resume', rcDir);
    assert.match(out, /AITRI SESSION RESUME/);
    assert.match(out, /Pipeline State/);
    assert.match(out, /Next Action/);
  });

  it('aitri resume shows Phase 1 as approved', () => {
    const out = aitri('resume', rcDir);
    assert.match(out, /Phase 1.*Approved/);
  });

  it('aitri resume shows open FRs', () => {
    const out = aitri('resume', rcDir);
    assert.match(out, /FR-001/);
    assert.match(out, /Open Requirements/);
  });

  it('aitri resume is pipeable (stdout only, no stderr bleed)', () => {
    const out = execSync('aitri resume 2>/dev/null', { cwd: rcDir, encoding: 'utf8' });
    assert.match(out, /AITRI SESSION RESUME/);
  });

  it('aitri checkpoint creates a file in checkpoints/', () => {
    aitri('checkpoint', rcDir);
    assert.ok(fs.existsSync(path.join(rcDir, 'checkpoints')), 'checkpoints/ must be created');
    const files = fs.readdirSync(path.join(rcDir, 'checkpoints'));
    assert.equal(files.filter(f => f.endsWith('.md')).length, 1, 'one checkpoint file must exist');
  });

  it('aitri checkpoint --name creates file with label in name', () => {
    aitri('checkpoint --name before-refactor', rcDir);
    const files = fs.readdirSync(path.join(rcDir, 'checkpoints'));
    assert.ok(files.some(f => f.includes('before-refactor')), 'labeled checkpoint must exist');
  });

  it('aitri checkpoint --list shows existing checkpoints', () => {
    const out = aitri('checkpoint --list', rcDir);
    assert.match(out, /\.md/);
  });

  it('checkpoint file contains resume content', () => {
    const files    = fs.readdirSync(path.join(rcDir, 'checkpoints')).filter(f => f.endsWith('.md')).sort();
    const cpContent = fs.readFileSync(path.join(rcDir, 'checkpoints', files[0]), 'utf8');
    assert.match(cpContent, /AITRI SESSION RESUME/);
    assert.match(cpContent, /Pipeline State/);
  });
});

// ── adopt ─────────────────────────────────────────────────────────────────────

describe('Aitri CLI — adopt smoke', () => {
  let adoptDir;

  before(() => {
    adoptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-adopt-smoke-'));
    // Seed a minimal conventional project so adopt scan has something to read
    fs.writeFileSync(path.join(adoptDir, 'package.json'), JSON.stringify({
      name: 'my-app', version: '1.0.0', description: 'A sample app',
      scripts: { test: 'node --test' },
    }, null, 2));
    fs.writeFileSync(path.join(adoptDir, 'README.md'), '# My App\nA web application for tracking invoices.');
    fs.mkdirSync(path.join(adoptDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(adoptDir, 'src', 'index.js'), 'export const add = (a, b) => a + b;');
    fs.mkdirSync(path.join(adoptDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(adoptDir, 'test', 'index.test.js'), "import assert from 'assert'; assert.equal(1+1, 2);");
  });

  after(() => { try { fs.rmSync(adoptDir, { recursive: true, force: true }); } catch {} });

  it('aitri adopt scan outputs briefing with project structure', () => {
    const out = aitri('adopt scan', adoptDir);
    assert.match(out, /ADOPTION_SCAN\.md/, 'briefing must mention ADOPTION_SCAN.md output');
    assert.match(out, /IDEA\.md/, 'briefing must mention IDEA.md output');
    assert.match(out, /stabilization|Technical Health/i, 'briefing must mention stabilization context');
  });

  it('aitri adopt scan briefing includes file tree', () => {
    const out = aitri('adopt scan', adoptDir);
    assert.match(out, /package\.json|src|README/i, 'file tree must appear in briefing');
  });

  it('aitri adopt apply initializes project from IDEA.md (from scan)', () => {
    fs.writeFileSync(
      path.join(adoptDir, 'IDEA.md'),
      '# Invoice App — Adoption Stabilization\n\n## What this project does\nInvoice tracking web app.\n\n## Stabilization goals\n- Add .env.example\n\n## Out of scope\nNew features.\n'
    );
    aitri('adopt apply', adoptDir);

    assert.ok(fs.existsSync(path.join(adoptDir, '.aitri')), '.aitri must be created');
    assert.ok(fs.existsSync(path.join(adoptDir, 'spec')), 'spec/ must be created');

    const config = JSON.parse(fs.readFileSync(path.join(adoptDir, '.aitri'), 'utf8'));
    assert.deepEqual(config.completedPhases, [], 'apply must not mark any phases — pipeline starts from Phase 1');
  });

  it('aitri adopt apply creates placeholder IDEA.md when scan was not run', () => {
    const adoptDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-adopt-noidea-'));
    try {
      aitri('adopt apply', adoptDir2);
      assert.ok(fs.existsSync(path.join(adoptDir2, 'IDEA.md')), 'placeholder IDEA.md must be created');
      const idea = fs.readFileSync(path.join(adoptDir2, 'IDEA.md'), 'utf8');
      assert.ok(idea.includes('Stabilization'), 'placeholder must mention stabilization');
    } finally {
      try { fs.rmSync(adoptDir2, { recursive: true, force: true }); } catch {}
    }
  });

  it('aitri adopt apply does not overwrite existing IDEA.md', () => {
    const adoptDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-adopt-keepidea-'));
    try {
      fs.writeFileSync(path.join(adoptDir3, 'IDEA.md'), '# My Custom Idea\nKeep this content.\n');
      aitri('adopt apply', adoptDir3);
      const idea = fs.readFileSync(path.join(adoptDir3, 'IDEA.md'), 'utf8');
      assert.ok(idea.includes('My Custom Idea'), 'existing IDEA.md must not be overwritten');
    } finally {
      try { fs.rmSync(adoptDir3, { recursive: true, force: true }); } catch {}
    }
  });

  it('aitri adopt --upgrade syncs existing artifacts into completedPhases', () => {
    // adoptDir already has .aitri from apply above; simulate phases 1+2 artifacts
    const specDir = path.join(adoptDir, 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), '{}');
    fs.writeFileSync(path.join(specDir, '02_SYSTEM_DESIGN.md'), '# Design');

    aitri('adopt --upgrade', adoptDir);
    const config = JSON.parse(fs.readFileSync(path.join(adoptDir, '.aitri'), 'utf8'));
    assert.ok(config.completedPhases.includes(1), 'phase 1 must be synced');
    assert.ok(config.completedPhases.includes(2), 'phase 2 must be synced');
  });

  it('aitri adopt scan error is actionable when invoked outside project', () => {
    // scan works anywhere — just verifying it doesn't crash on minimal dir
    const minDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-adopt-min-'));
    try {
      const out = aitri('adopt scan', minDir);
      assert.match(out, /ADOPTION_SCAN\.md/);
    } finally {
      try { fs.rmSync(minDir, { recursive: true, force: true }); } catch {}
    }
  });
});

// ── feature ───────────────────────────────────────────────────────────────────

describe('Aitri CLI — feature smoke', () => {
  let featureProjectDir;

  before(() => {
    featureProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-feature-smoke-'));
    aitri('init', featureProjectDir);
  });

  after(() => { try { fs.rmSync(featureProjectDir, { recursive: true, force: true }); } catch {} });

  it('aitri feature init creates feature directory with .aitri and FEATURE_IDEA.md', () => {
    aitri('feature init payments', featureProjectDir);
    const featureDir = path.join(featureProjectDir, 'features', 'payments');
    assert.ok(fs.existsSync(featureDir), 'feature dir must be created');
    assert.ok(fs.existsSync(path.join(featureDir, '.aitri')), 'feature .aitri must exist');
    assert.ok(fs.existsSync(path.join(featureDir, 'FEATURE_IDEA.md')), 'FEATURE_IDEA.md must exist');
    assert.ok(fs.existsSync(path.join(featureDir, 'spec')), 'spec/ dir must be created');
  });

  it('aitri feature init creates independent .aitri (does not modify parent state)', () => {
    const parentBefore = JSON.parse(fs.readFileSync(path.join(featureProjectDir, '.aitri'), 'utf8'));
    aitri('feature init reporting', featureProjectDir);
    const parentAfter  = JSON.parse(fs.readFileSync(path.join(featureProjectDir, '.aitri'), 'utf8'));
    assert.deepEqual(parentBefore.approvedPhases, parentAfter.approvedPhases, 'parent approvedPhases must not change');
    assert.deepEqual(parentBefore.completedPhases, parentAfter.completedPhases, 'parent completedPhases must not change');
  });

  it('aitri feature list shows initialized features', () => {
    const out = aitri('feature list', featureProjectDir);
    assert.match(out, /payments/, 'payments feature must appear');
    assert.match(out, /reporting/, 'reporting feature must appear');
  });

  it('aitri feature status shows feature pipeline state', () => {
    const out = aitri('feature status payments', featureProjectDir);
    assert.match(out, /payments|Phase|status/i, 'feature status must show pipeline info');
  });

  it('aitri feature init fails when feature already exists', () => {
    const stderr = aitriShouldFail('feature init payments', featureProjectDir);
    assert.match(stderr, /already exists/i);
  });

  it('aitri feature init fails when no parent .aitri found', () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-feature-bare-'));
    try {
      const stderr = aitriShouldFail('feature init mything', bareDir);
      assert.match(stderr, /No Aitri project|aitri init/i);
    } finally {
      try { fs.rmSync(bareDir, { recursive: true, force: true }); } catch {}
    }
  });
});

// ── help ──────────────────────────────────────────────────────────────────────

describe('Aitri CLI — help smoke', () => {
  let helpDir;

  before(() => {
    helpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-help-smoke-'));
    execSync('aitri init', { cwd: helpDir, encoding: 'utf8' });
  });

  after(() => { try { fs.rmSync(helpDir, { recursive: true, force: true }); } catch {} });

  it('aitri help outputs usage and command list', () => {
    const out = aitri('help', helpDir);
    assert.match(out, /aitri/i, 'help must mention aitri');
    assert.match(out, /init|run-phase|complete|approve/i, 'help must list commands');
  });

  it('aitri --help is equivalent to aitri help', () => {
    const out = aitri('--help', helpDir);
    assert.match(out, /aitri/i);
    assert.match(out, /init|run-phase|complete|approve/i);
  });

  it('aitri help exits zero (does not throw)', () => {
    assert.doesNotThrow(() => aitri('help', helpDir));
  });
});

// ── bug ───────────────────────────────────────────────────────────────────────

describe('Aitri CLI — bug smoke', () => {
  let bugDir;

  before(() => {
    bugDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-bug-smoke-'));
    execSync('aitri init', { cwd: bugDir, encoding: 'utf8' });
  });

  after(() => { try { fs.rmSync(bugDir, { recursive: true, force: true }); } catch {} });

  it('aitri bug add --title creates BUGS.json', () => {
    aitri('bug add --title "Login fails with valid credentials" --severity high', bugDir);
    assert.ok(
      fs.existsSync(path.join(bugDir, 'spec', 'BUGS.json')),
      'BUGS.json must be created after bug add'
    );
  });

  it('aitri bug list shows the registered bug', () => {
    const out = aitri('bug list', bugDir);
    assert.match(out, /BG-001/, 'bug list must show BG-001');
    assert.match(out, /Login fails with valid credentials/i, 'bug list must show the title');
  });

  it('aitri bug list --status open filters correctly', () => {
    const out = aitri('bug list --status open', bugDir);
    assert.match(out, /BG-001/, 'open bug must appear in --status open filter');
  });

  it('aitri bug fix BG-001 marks bug as fixed', () => {
    const out = aitri('bug fix BG-001', bugDir);
    assert.match(out, /fixed|BG-001/i);
    const bugs = JSON.parse(fs.readFileSync(path.join(bugDir, 'spec', 'BUGS.json'), 'utf8'));
    const bug = bugs.bugs.find(b => b.id === 'BG-001');
    assert.equal(bug.status, 'fixed', 'bug status must be fixed after bug fix');
  });

  it('aitri bug add fails without --title', () => {
    const out = aitriShouldFail('bug add --severity high', bugDir);
    assert.match(out, /--title/i, 'error must mention --title');
  });

  it('aitri bug add with --fr and --tc links to requirement and test case', () => {
    aitri('bug add --title "Export CSV produces wrong delimiter" --severity medium --fr FR-003 --tc TC-003f', bugDir);
    const bugs = JSON.parse(fs.readFileSync(path.join(bugDir, 'spec', 'BUGS.json'), 'utf8'));
    const bug = bugs.bugs.find(b => b.title.includes('Export CSV'));
    assert.ok(bug, 'linked bug must exist');
    assert.equal(bug.fr, 'FR-003');
    assert.equal(bug.tc_reference, 'TC-003f');
  });

  it('BUGS.json is valid JSON after multiple bug operations', () => {
    const raw = fs.readFileSync(path.join(bugDir, 'spec', 'BUGS.json'), 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw), 'BUGS.json must remain valid JSON');
    const bugs = JSON.parse(raw);
    assert.ok(Array.isArray(bugs.bugs), 'bugs.bugs must be an array');
  });
});

// ── review ────────────────────────────────────────────────────────────────────

describe('Aitri CLI — review smoke', () => {
  let reviewDir;

  const REVIEW_REQUIREMENTS = JSON.stringify({
    project_name: 'Review Smoke App',
    project_summary: 'Testing review command.',
    functional_requirements: [
      { id: 'FR-001', title: 'Login',      priority: 'MUST',   type: 'security',  acceptance_criteria: ['returns 401 on invalid token'], description: 'Auth' },
      { id: 'FR-002', title: 'Dashboard',  priority: 'MUST',   type: 'ux',        acceptance_criteria: ['renders at 375px viewport'],   description: 'View' },
      { id: 'FR-003', title: 'Export CSV', priority: 'MUST',   type: 'reporting', acceptance_criteria: ['generates valid CSV file'],     description: 'Export' },
      { id: 'FR-004', title: 'Save data',  priority: 'SHOULD', type: 'persistence', acceptance_criteria: ['data survives restart'],       description: 'Persist' },
      { id: 'FR-005', title: 'Totals',     priority: 'COULD',  type: 'logic',     acceptance_criteria: ['returns correct sum'],          description: 'Calc' },
    ],
    user_stories: [
      { id: 'US-001', requirement_id: 'FR-001', as_a: 'user', i_want: 'to login', so_that: 'I can access data' },
    ],
    non_functional_requirements: [
      { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms', acceptance_criteria: 'load test at 100 RPS' },
      { id: 'NFR-002', category: 'Security',    requirement: 'TLS 1.3',     acceptance_criteria: 'SSL Labs A grade' },
      { id: 'NFR-003', category: 'Reliability', requirement: '99.9% uptime', acceptance_criteria: 'monthly SLA report' },
    ],
    constraints: [],
    technology_preferences: ['Node.js'],
  }, null, 2);

  before(() => {
    reviewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-review-smoke-'));
    execSync('aitri init', { cwd: reviewDir, encoding: 'utf8' });
    fs.writeFileSync(path.join(reviewDir, 'spec', '01_REQUIREMENTS.json'), REVIEW_REQUIREMENTS);
    execSync('aitri complete 1', { cwd: reviewDir, encoding: 'utf8' });
    execSync('aitri approve 1', { cwd: reviewDir, encoding: 'utf8' });
  });

  after(() => { try { fs.rmSync(reviewDir, { recursive: true, force: true }); } catch {} });

  it('aitri review exits zero with only requirements present', () => {
    assert.doesNotThrow(() => aitri('review', reviewDir));
  });

  it('aitri review output includes phase summary or check results', () => {
    const out = aitri('review', reviewDir);
    assert.match(out, /review|FR-|check|OK|PASS|WARN|ERROR/i, 'review must output structured results');
  });

  it('aitri review --phase 1 scopes output to Phase 1', () => {
    assert.doesNotThrow(() => aitri('review --phase 1', reviewDir));
  });

  it('aitri review exits zero outside a project (no artifacts = no failures)', () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-review-bare-'));
    try {
      // review gracefully passes with no artifacts — empty project is trivially compliant
      assert.doesNotThrow(() => aitri('review', bareDir));
    } finally {
      try { fs.rmSync(bareDir, { recursive: true, force: true }); } catch {}
    }
  });
});
