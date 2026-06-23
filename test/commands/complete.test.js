/**
 * Tests: aitri complete — validate artifact + record phase as complete
 * Covers: state recording, --check dry run, missing artifact, validation failure, lastSession
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdComplete } from '../../lib/commands/complete.js';
import { loadConfig, hashArtifact } from '../../lib/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-complete-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

const noopErr = (msg) => { throw new Error(msg); };

const VALID_REQUIREMENTS = JSON.stringify({
  project_name: 'Test App',
  project_summary: 'A test application.',
  functional_requirements: [
    { id: 'FR-001', title: 'Login',     priority: 'MUST',   type: 'security',  acceptance_criteria: ['returns 401 on invalid token'], description: 'Auth' },
    { id: 'FR-002', title: 'Dashboard', priority: 'MUST',   type: 'core',      acceptance_criteria: ['renders dashboard view'],       description: 'Main view' },
    { id: 'FR-003', title: 'Export',    priority: 'MUST',   type: 'reporting', acceptance_criteria: ['generates valid CSV'],           description: 'Export data' },
    { id: 'FR-004', title: 'Save',      priority: 'SHOULD', type: 'core',      acceptance_criteria: ['data survives restart'],         description: 'Persistence' },
    { id: 'FR-005', title: 'Totals',    priority: 'NICE',   type: 'logic',     acceptance_criteria: ['correct sum returned'],          description: 'Calc' },
  ],
  user_stories: [
    { id: 'US-001', requirement_id: 'FR-001', as_a: 'user', i_want: 'to login', so_that: 'I access data' },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms',  acceptance_criteria: 'load test' },
    { id: 'NFR-002', category: 'Security',    requirement: 'TLS 1.3',      acceptance_criteria: 'SSL Labs' },
    { id: 'NFR-003', category: 'Reliability', requirement: '99.9% uptime', acceptance_criteria: 'SLA report' },
  ],
  constraints: [],
  technology_preferences: ['Node.js'],
  idea_provenance: { problem: 'confirmed', users: 'confirmed', baseline: 'confirmed', success_metric: 'confirmed', no_go_zone: 'confirmed' },
}, null, 2);

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: 'spec',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdComplete() — successful complete (requirements)', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# My Idea\nSome content for the idea file.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    output = captureStdout(() =>
      cmdComplete({ dir, args: ['requirements'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sets currentPhase to 1', () => {
    const config = loadConfig(dir);
    assert.equal(config.currentPhase, 1);
  });

  it('adds phase to completedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1));
  });

  it('stores artifact hash in artifactHashes', () => {
    const config = loadConfig(dir);
    assert.ok(config.artifactHashes['1'], 'hash for phase 1 must exist');
  });

  it('appends completed event', () => {
    const config = loadConfig(dir);
    const last = config.events[config.events.length - 1];
    assert.equal(last.event, 'completed');
    assert.equal(last.phase, 1);
  });

  it('writes lastSession', () => {
    const config = loadConfig(dir);
    assert.ok(config.lastSession, 'lastSession must exist');
    assert.equal(config.lastSession.event, 'complete requirements');
  });

  it('prints success message with alias', () => {
    assert.ok(output.includes('requirements'), 'output should include phase alias');
    assert.ok(output.includes('✅'), 'output should include success icon');
  });
});

describe('cmdComplete() — accepts numeric phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# My Idea\nContent.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    captureStdout(() =>
      cmdComplete({ dir, args: ['1'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('records phase 1 as completed', () => {
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1));
  });
});

describe('cmdComplete() — --check dry run', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# My Idea\nContent.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    // Capture console.log instead of stdout.write since --check uses console.log
    const origLog = console.log;
    let logged = '';
    console.log = (...a) => { logged += a.join(' ') + '\n'; };
    try {
      cmdComplete({ dir, args: ['requirements', '--check'], err: noopErr });
    } finally {
      console.log = origLog;
    }
    output = logged;
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not modify state', () => {
    const config = loadConfig(dir);
    assert.deepEqual(config.completedPhases, []);
  });

  it('prints validation + cross-artifact review passed', () => {
    assert.ok(output.includes('validation + cross-artifact review passed'), 'should say validation + cross-artifact review passed');
  });
});

// R3-6: --check used to skip the cross-artifact review (phases 1/3/5), so a dry run
// printed green on errors the real `complete` blocks. The phase-5 TC→Results review
// catches a result referencing a non-existent TC — an error phase5.validate (which
// only inspects 05_TRACEABILITY.json) cannot see, so it is the true divergence.
describe('cmdComplete() — --check runs the cross-artifact review (R3-6)', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1, 2, 3, 4], approvedPhases: [1, 2, 3, 4] }));
    writeFile(dir, 'spec/01_REQUIREMENTS.json', JSON.stringify({
      project_name: 'T',
      functional_requirements: [{ id: 'FR-001', title: 'L', priority: 'MUST', acceptance_criteria: ['x'] }],
      non_functional_requirements: [],
    }));
    // Valid 05 artifact (passes phase5.validate) — FR-001 covered, no over-claim.
    writeFile(dir, 'spec/05_TRACEABILITY.json', JSON.stringify({
      project: 'T', version: '1', phases_completed: [1, 2, 3, 4, 5],
      requirement_compliance: [{ id: 'FR-001', level: 'functionally_present' }],
      overall_status: 'compliant',
    }));
    writeFile(dir, 'spec/03_TEST_CASES.json', JSON.stringify({
      test_plan: 'Plan',
      test_cases: [{ id: 'TC-001', requirement_id: 'FR-001', title: 't', type: 'unit', scenario: 'happy_path', expected_result: 'x' }],
    }));
    // Result references TC-999, which is NOT in 03_TEST_CASES.json → review error.
    writeFile(dir, 'spec/04_TEST_RESULTS.json', JSON.stringify({
      executed_at: new Date().toISOString(),
      results: [{ tc_id: 'TC-999', status: 'pass' }],
      fr_coverage: [{ fr_id: 'FR-001', status: 'covered' }],
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
    }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('exits non-zero (err thrown) on a cross-artifact error, not a green dry run', () => {
    let msg = '';
    try {
      captureStdout(() => cmdComplete({ dir, args: ['deploy', '--check'], err: noopErr }));
    } catch (e) { msg = e.message; }
    assert.match(msg, /Cross-artifact errors found/, 'review errors must surface under --check');
  });

  it('does not record state on a failed --check', () => {
    const config = loadConfig(dir);
    assert.ok(!config.completedPhases.includes(5), 'phase 5 must not be recorded by a dry run');
  });
});

describe('cmdComplete() — missing artifact', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('throws error when artifact is missing', () => {
    assert.throws(
      () => cmdComplete({ dir, args: ['requirements'], err: noopErr }),
      /Artifact not found/
    );
  });
});

describe('cmdComplete() — validation failure', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# Idea\nContent.\n');
    // Invalid: too few FRs
    writeFile(dir, 'spec/01_REQUIREMENTS.json', JSON.stringify({
      project_name: 'Bad',
      project_summary: 'Too few.',
      functional_requirements: [
        { id: 'FR-001', title: 'Login', priority: 'MUST', type: 'security', acceptance_criteria: ['401'], description: 'Auth' },
      ],
      user_stories: [],
      non_functional_requirements: [
        { id: 'NFR-001', category: 'Performance', requirement: 'fast' },
        { id: 'NFR-002', category: 'Security', requirement: 'secure' },
        { id: 'NFR-003', category: 'Reliability', requirement: 'reliable' },
      ],
      constraints: [],
      technology_preferences: [],
    }, null, 2));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('throws validation error', () => {
    assert.throws(
      () => cmdComplete({ dir, args: ['requirements'], err: noopErr }),
      /validation failed|Artifact validation/i
    );
  });
});

describe('cmdComplete() — unknown phase', () => {
  it('throws usage error for invalid phase', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      assert.throws(
        () => cmdComplete({ dir, args: ['nonexistent'], err: noopErr }),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdComplete() — spec/ artifact path', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ artifactsDir: 'spec' }));
    writeFile(dir, 'IDEA.md', '# Idea\nContent for idea.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    captureStdout(() =>
      cmdComplete({ dir, args: ['requirements'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('finds artifact in spec/ subdirectory', () => {
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1));
  });
});

// ── Feature-context emission (alpha.6) ───────────────────────────────────────

describe('cmdComplete() — feature-context "Approved →" hint carries `feature <name> ` prefix', () => {
  it('emits scope-prefixed approve / reject hints in feature scope', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({ artifactsDir: 'spec' }));
      writeFile(dir, 'IDEA.md', '# Idea\nContent.\n');
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      const out = captureStdout(() =>
        cmdComplete({ dir, args: ['requirements'], err: noopErr, featureRoot: '/parent', scopeName: 'foo' })
      );
      assert.ok(out.includes('aitri feature approve foo requirements'),
        `expected feature-prefixed approve hint, got:\n${out}`);
      assert.ok(out.includes('aitri feature reject foo requirements'),
        `expected feature-prefixed reject hint, got:\n${out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('emits root-style hints when featureRoot is absent (regression guard)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({ artifactsDir: 'spec' }));
      writeFile(dir, 'IDEA.md', '# Idea\nContent.\n');
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      const out = captureStdout(() =>
        cmdComplete({ dir, args: ['requirements'], err: noopErr })
      );
      assert.ok(!/aitri feature \w+ /.test(out),
        'root context must not emit feature-prefixed commands');
      assert.ok(/aitri approve requirements\b/.test(out),
        `expected root-style approve hint, got:\n${out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdComplete() — re-opening an approved phase whose content changed (drift-launder fix)', () => {
  const VALID_DESIGN = `# System Design

## Executive Summary
We build a Node service. Decision: REST over gRPC because clients are browsers.
Justification: simplicity and broad client support outweigh streaming needs.

## System Architecture
Three components: API gateway, service layer, datastore.
The gateway routes requests to the service, which reads/writes the datastore.
Each component is independently deployable.

## Data Model
Users(id, email), Sessions(id, user_id, token). Normalized to 3NF.
Indexes on Users.email and Sessions.token for lookup performance.

## API Design
POST /login returns a token. GET /dashboard returns the view.
POST /export returns CSV. All endpoints require a valid bearer token except /login.

## Security Design
TLS 1.3 everywhere. Tokens are short-lived JWTs with rotation.
Input is validated at the gateway; output is escaped at the view layer.

## Performance & Scalability
p99 < 200ms target. Horizontal scaling behind a load balancer.
Cache hot reads in an in-memory layer with a short TTL.

## Deployment Architecture
Containerized service deployed behind a reverse proxy.
Rolling deploys with health checks gate each step.

## Risk Analysis
- Risk 1: token theft — mitigated by short TTL and rotation.
- Risk 2: datastore outage — mitigated by replicas and failover.
- Risk 3: traffic spike — mitigated by autoscaling and rate limits.

## Technical Risk Flags
None detected — the stack is well understood and the scope is bounded.
The team has shipped comparable services before.
`;

  it('withdraws approval + cascades downstream when an approved phase is re-completed with changed content', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', VALID_DESIGN);
      // Phase 2 approved, with 3 and 4 also approved downstream; hash for phase 2
      // stamped to the ORIGINAL design content.
      writeFile(dir, '.aitri', minimalConfig({
        approvedPhases:  [1, 2, 3, 4],
        completedPhases: [1, 2, 3, 4],
        verifyPassed: true,
        artifactHashes: { '1': 'h1', '2': hashArtifact(VALID_DESIGN), '3': 'h3', '4': 'h4' },
      }));
      // Operator edits the approved design directly on disk (drift).
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', VALID_DESIGN + '\n## Addendum\nA new architectural decision was added after approval.\n');

      captureStdout(() => cmdComplete({ dir, args: ['architecture'], err: noopErr }));

      const cfg = loadConfig(dir);
      // Phase 2 re-opened (withdrawn from approved), downstream 3/4 cascaded out.
      assert.ok(!cfg.approvedPhases.map(String).includes('2'), 'phase 2 approval must be withdrawn');
      assert.ok(!cfg.approvedPhases.map(String).includes('3'), 'phase 3 must be cascade-invalidated');
      assert.ok(!cfg.approvedPhases.map(String).includes('4'), 'phase 4 must be cascade-invalidated');
      assert.ok(cfg.approvedPhases.map(String).includes('1'), 'phase 1 (upstream) stays approved');
      assert.equal(cfg.verifyPassed, false, 'verifyPassed reset (phase 4 was in the cascade)');
      // Hash re-stamped to the new content (no phantom drift after).
      assert.ok(cfg.artifactHashes['2'], 'phase 2 hash present');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT cascade when an approved phase is re-completed with UNCHANGED content', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', VALID_DESIGN);
      writeFile(dir, '.aitri', minimalConfig({
        approvedPhases:  [1, 2, 3],
        completedPhases: [1, 2, 3],
        artifactHashes: { '2': hashArtifact(VALID_DESIGN) },
      }));
      captureStdout(() => cmdComplete({ dir, args: ['architecture'], err: noopErr }));
      const cfg = loadConfig(dir);
      assert.ok(cfg.approvedPhases.map(String).includes('3'), 'unchanged re-complete must NOT cascade downstream');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// §3.1 (rc.64 adopter): a phase cannot be completed on top of an upstream phase that
// was never validated — otherwise a silently-failed `complete requirements` still lets
// architecture→…→deploy be completed/approved over a Phase 1 with no stored state.
describe('cmdComplete() — upstream ordering gate (§3.1)', () => {
  it('refuses to complete a downstream phase when an upstream phase is not completed', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '## Executive Summary\nDesign.\n');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [] })); // phase 1 NOT completed
      assert.throws(
        () => cmdComplete({ dir, args: ['architecture'], err: noopErr }),
        /upstream phase\(s\) not yet completed: requirements/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('allows completing a phase once its upstream is completed', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md',
        '## Executive Summary\nD\n## System Architecture\nA\n## Data Model\nM\n## API Contracts\nC\n## Security & Auth\nS\n## Deployment\nD\n');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      // Should not throw on the ordering gate (it may still validate the design artifact).
      let orderingError = false;
      try { captureStdout(() => cmdComplete({ dir, args: ['architecture'], err: noopErr })); }
      catch (e) { if (/upstream phase/.test(e.message)) orderingError = true; }
      assert.equal(orderingError, false, 'ordering gate must pass when phase 1 is completed');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
