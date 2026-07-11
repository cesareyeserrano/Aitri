/**
 * Tests: full-lifecycle E2E — init → validate "Pipeline complete" (T1, TEST-HARDENING)
 *
 * Drives ONE temp project through the whole pipeline using only real CLI
 * invocations of the working-tree binary plus artifact writes — exactly what
 * an agent does in a consumer project. This is the only test that executes
 * phases 4 and 5 end-to-end (approve 4 → verify-run → verify-complete →
 * approve 5 → validate); unit suites cover those commands against hand-seeded
 * `.aitri` state, which never proves the phases COMPOSE.
 *
 * Deliberate fixture choices:
 *   - backend-only FR types (no ux/visual) so the optional UX phase is not
 *     forced and Phase 3 accepts integration TCs for the critical-flow gate
 *   - test_runner pins `--test-reporter=spec`: under a non-TTY spawn the
 *     default TAP reporter emits no ✔/✖ markers and verify-run would credit
 *     zero TCs
 *   - the temp dir is NOT a git repo — the happy path must not require git
 *     (reconcile baseline falls back to mtime)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BIN   = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aitri.js');
const AITRI = `"${process.execPath}" "${BIN}"`;
const SPEC  = path.join('aitri', 'product', 'spec');

const TC_IDS = [
  'TC-001h', 'TC-001e', 'TC-001f',
  'TC-002h', 'TC-002e', 'TC-002f',
  'TC-003h', 'TC-003e', 'TC-003f',
];

const REQUIREMENTS = JSON.stringify({
  project_name: 'E2E App',
  project_summary: 'Minimal backend app for full-lifecycle E2E of the Aitri pipeline.',
  functional_requirements: [
    { id: 'FR-001', title: 'Login',   priority: 'MUST',   type: 'security',    acceptance_criteria: ['returns 401 on invalid token'], description: 'User auth' },
    { id: 'FR-002', title: 'Compute', priority: 'MUST',   type: 'logic',       acceptance_criteria: ['returns correct sum'],           description: 'Business calc' },
    { id: 'FR-003', title: 'Persist', priority: 'MUST',   type: 'persistence', acceptance_criteria: ['data survives restart'],         description: 'Storage' },
    { id: 'FR-004', title: 'Export',  priority: 'SHOULD', type: 'reporting',   acceptance_criteria: ['generates valid CSV file'],      description: 'Export' },
    { id: 'FR-005', title: 'Totals',  priority: 'NICE',   type: 'logic',       acceptance_criteria: ['returns correct total'],         description: 'Totals' },
  ],
  user_stories: [
    { id: 'US-001', requirement_id: 'FR-001', as_a: 'user', i_want: 'to login', so_that: 'I can access data' },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms',  acceptance_criteria: 'load test at 100 RPS' },
    { id: 'NFR-002', category: 'Security',    requirement: 'TLS 1.3 only', acceptance_criteria: 'SSL Labs A grade' },
    { id: 'NFR-003', category: 'Reliability', requirement: '99.9% uptime', acceptance_criteria: 'monthly SLA report' },
  ],
  no_go_zone: ['no offline mode in v1', 'no third-party SSO', 'no multi-tenant isolation'],
  constraints: [],
  technology_preferences: ['Node.js'],
  idea_provenance: { problem: 'confirmed', users: 'confirmed', baseline: 'confirmed', success_metric: 'confirmed', no_go_zone: 'confirmed' },
  coverage_map: [
    { need: 'log in', disposition: 'FR-001' },
    { need: 'compute values', disposition: 'FR-002' },
    { need: 'persist data', disposition: 'FR-003' },
    { need: 'export data', disposition: 'FR-004' },
    { need: 'see totals', disposition: 'FR-005' },
    { need: 'offline mode', disposition: 'out_of_scope' },
  ],
}, null, 2);

const SYSTEM_DESIGN = [
  '## 1. Executive Summary',
  'Node.js v20, in-process persistence. Justified by fixture scope.',
  '',
  '## 2. System Architecture',
  '```',
  'Client → API → Store',
  '```',
  '',
  '## 3. Data Model',
  'records: id, value',
  '',
  '## 4. API Design',
  'POST /login — returns token',
  '',
  '## 5. Implementation Approach',
  'FR-001: Login. Method: bcrypt compare + JWT issue. I/O: {email,password} → {token}. Failure: 401 on mismatch.',
  '',
  '## 6. Security Design',
  'JWT HS256, bcrypt cost 12',
  '',
  '## 7. Performance & Scalability',
  'Single process, O(1) store access',
  '',
  '## 8. Deployment Architecture',
  'Single node process',
  '',
  '## 9. Risk Analysis',
  'Risk 1: data loss — snapshot on write',
  'Risk 2: token leak — short TTL',
  'Risk 3: overload — backpressure',
  '',
  '## 10. Technical Risk Flags',
  'None detected — Node.js satisfies all stated NFRs.',
  ...Array(10).fill('Extra design content line.'),
].join('\n');

const makeTC = (id, reqId, type, scenario, title) => ({
  id, requirement_id: reqId, title, type, scenario,
  user_story_id: 'US-001', ac_id: 'AC-001', priority: 'high',
  preconditions: [], steps: ['step'],
  expected_result: 'expected behavior observed', test_data: {},
  given: 'seeded fixture state', when: 'the action runs', then: 'the expected result holds',
});

const TEST_CASES = JSON.stringify({
  test_plan: { strategy: 'unit+integration', coverage_goal: '80%', test_types: ['unit', 'integration'] },
  test_cases: [
    makeTC('TC-001h', 'FR-001', 'unit',        'happy_path', 'Login happy'),
    makeTC('TC-001e', 'FR-001', 'integration', 'edge_case',  'Login edge'),
    makeTC('TC-001f', 'FR-001', 'unit',        'negative',   'Login negative'),
    makeTC('TC-002h', 'FR-002', 'unit',        'happy_path', 'Compute happy'),
    makeTC('TC-002e', 'FR-002', 'integration', 'edge_case',  'Compute edge'),
    makeTC('TC-002f', 'FR-002', 'unit',        'negative',   'Compute negative'),
    makeTC('TC-003h', 'FR-003', 'unit',        'happy_path', 'Persist happy'),
    makeTC('TC-003e', 'FR-003', 'integration', 'edge_case',  'Persist edge'),
    makeTC('TC-003f', 'FR-003', 'unit',        'negative',   'Persist negative'),
  ],
}, null, 2);

const APP_SOURCE = `export const add = (a, b) => a + b;\n`;

const PROJECT_TESTS = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { add } from '../src/app.js';",
  '',
  `const ids = ${JSON.stringify(TC_IDS)};`,
  'for (const id of ids) {',
  '  test(`${id}: covered by lifecycle fixture`, () => {',
  '    assert.equal(add(1, 2), 3);',
  '  });',
  '}',
  '',
].join('\n');

// `env -u NODE_TEST_CONTEXT` is a test-harness artifact, not a consumer-project
// pattern: THIS suite runs under node --test, so the spawned fixture runner
// inherits NODE_TEST_CONTEXT and node:test would refuse to run recursively.
// A real project's verify-run never has that variable set.
const BUILD_REPORT = JSON.stringify({
  files_created: ['src/app.js', 'tests/basic.test.js'],
  test_runner: 'env -u NODE_TEST_CONTEXT node --test --test-reporter=spec tests/basic.test.js',
  test_files: ['tests/basic.test.js'],
  technical_debt: [],
}, null, 2);

const TRACEABILITY = JSON.stringify({
  project: 'E2E App',
  version: '1.0.0',
  phases_completed: [1, 2, 3, 4, 5],
  overall_status: 'compliant',
  requirement_compliance: [
    { id: 'FR-001', level: 'functionally_present' },
    { id: 'FR-002', level: 'functionally_present' },
    { id: 'FR-003', level: 'functionally_present' },
    { id: 'FR-004', level: 'functionally_present' },
    { id: 'FR-005', level: 'functionally_present' },
  ],
}, null, 2);

let dir;

function aitri(args) {
  // stderr piped (not inherited): [aitri] advisories would otherwise leak into
  // the outer test-runner output on every step.
  return execSync(`${AITRI} ${args}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function writeSpec(file, content) {
  fs.writeFileSync(path.join(dir, SPEC, file), content);
}

describe('full lifecycle E2E — init → validate "Pipeline complete"', () => {
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-lifecycle-'));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('init scaffolds the contained project', () => {
    aitri('init');
    assert.ok(fs.existsSync(path.join(dir, '.aitri')));
    assert.ok(fs.existsSync(path.join(dir, SPEC)));
  });

  it('phase 1: complete + approve (backend-only — no forced UX phase)', () => {
    writeSpec('01_REQUIREMENTS.json', REQUIREMENTS);
    assert.match(aitri('complete 1'), /Phase requirements.*complete/i);
    const out = aitri('approve 1');
    assert.match(out, /APPROVED/);
    assert.doesNotMatch(out, /run-phase ux/, 'no UX FRs → pipeline must not route through the UX phase');
  });

  it('phase 2: complete + approve', () => {
    writeSpec('02_SYSTEM_DESIGN.md', SYSTEM_DESIGN);
    assert.match(aitri('complete 2'), /Phase architecture.*complete/i);
    assert.match(aitri('approve 2'), /APPROVED/);
  });

  it('phase 3: complete + approve', () => {
    writeSpec('03_TEST_CASES.json', TEST_CASES);
    assert.match(aitri('complete 3'), /Phase tests.*complete/i);
    assert.match(aitri('approve 3'), /APPROVED/);
  });

  it('phase 4: complete + approve routes to verify-run', () => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'app.js'), APP_SOURCE);
    fs.writeFileSync(path.join(dir, 'tests', 'basic.test.js'), PROJECT_TESTS);
    writeSpec('04_BUILD_REPORT.json', BUILD_REPORT);

    assert.match(aitri('complete 4'), /Phase build.*complete/i);
    const out = aitri('approve 4');
    assert.match(out, /Phase build.*APPROVED/i);
    assert.match(out, /verify-run/, 'approve 4 must route to verify-run');
  });

  it('verify-run executes the project test_runner and credits every planned TC', () => {
    const out = aitri('verify-run');
    assert.match(out, /Passed:\s*9/, 'all 9 TCs must be credited from runner output');
    assert.match(out, /verify-complete/, 'must route to verify-complete');

    // Run-binding (ADR-069): the results file and its stamp must exist.
    const results = JSON.parse(fs.readFileSync(path.join(dir, SPEC, '04_TEST_RESULTS.json'), 'utf8'));
    assert.ok(Array.isArray(results.results) && results.results.length >= 9);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.match(cfg.verifyResultsHash, /^[a-f0-9]{64}$/, 'verifyResultsHash must be stamped');
    assert.equal(cfg.lastVerifyRun.passed, 9);
  });

  it('verify-complete passes the fr_coverage gate and stamps verifyPassed', () => {
    const out = aitri('verify-complete');
    assert.match(out, /Verify passed — 9\/9 tests passing/);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.equal(cfg.verifyPassed, true, 'verifyPassed must be persisted');
  });

  // The blocked-before-verify negative lives in test/commands/run-phase.test.js
  // ("blocks phase 5 when verify not passed") — here we only prove the unlock.
  it('run-phase 5 renders the deploy briefing after verify passed', () => {
    const out = aitri('run-phase 5');
    assert.ok(out.length > 200, 'deploy briefing must render');
  });

  it('phase 5: complete + approve closes the pipeline', () => {
    writeSpec('05_TRACEABILITY.json', TRACEABILITY);
    assert.match(aitri('complete 5'), /Phase deploy.*complete/i);
    const out = aitri('approve 5');
    assert.match(out, /All 5 phases complete and approved/);
    assert.match(out, /aitri validate/);
  });

  it('validate declares the pipeline complete and deployable', () => {
    const out = aitri('validate');
    assert.match(out, /Pipeline complete/, 'deployable end-state must be reached');
    assert.doesNotMatch(out, /DRIFT|MISSING/i, 'no drift or missing artifacts in a clean forward run');
  });

  it('the closed pipeline left a coherent .aitri (phases, hashes, verify state)', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.deepEqual([...cfg.approvedPhases].sort(), [1, 2, 3, 4, 5]);
    for (const phase of [1, 2, 3, 4, 5]) {
      assert.match(cfg.artifactHashes[String(phase)] || '', /^[a-f0-9]{64}$/,
        `phase ${phase} must have a stored artifact hash`);
    }
    assert.equal(cfg.verifyPassed, true);
    assert.deepEqual(cfg.driftPhases || [], [], 'no drift recorded');
  });
});
