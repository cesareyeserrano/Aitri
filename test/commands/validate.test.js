/**
 * Tests: aitri validate — artifact presence + approval check
 * Covers: all artifacts present, missing artifact, --json output, drift alias in message
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdValidate } from '../../lib/commands/validate.js';
import { loadConfig, hashArtifact, hashResultsFile } from '../../lib/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-validate-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function captureLog(fn) {
  const lines = [];
  const orig = console.log.bind(console);
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: 'spec',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

// Minimal valid artifact content (doesn't need to pass phase validation — validate just checks existence)
const ARTIFACTS = {
  'IDEA.md': '# My Idea\nSolve a problem.\n',
  'spec/01_REQUIREMENTS.json': '{"project_name":"T","functional_requirements":[]}',
  'spec/02_SYSTEM_DESIGN.md': '## Executive Summary\nDesign.\n',
  'spec/03_TEST_CASES.json': '{"test_cases":[]}',
  'spec/04_BUILD_REPORT.json': '{"files_created":[],"setup_commands":[]}',
  'spec/04_TEST_RESULTS.json': '{"summary":{"total":1,"passed":1,"failed":0},"results":[]}',
  'spec/05_TRACEABILITY.json': '{"requirement_compliance":[]}',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

function seedDeployableRoot(dir, configOverrides = {}) {
  const hashes = {};
  for (const [rel, content] of Object.entries(ARTIFACTS)) {
    writeFile(dir, rel, content);
    const phaseMap = {
      'spec/01_REQUIREMENTS.json': '1',
      'spec/02_SYSTEM_DESIGN.md': '2',
      'spec/03_TEST_CASES.json': '3',
      'spec/04_BUILD_REPORT.json': '4',
      'spec/05_TRACEABILITY.json': '5',
    };
    if (phaseMap[rel]) hashes[phaseMap[rel]] = hashArtifact(content);
  }
  writeFile(dir, '.aitri', minimalConfig({
    approvedPhases: [1, 2, 3, 4, 5],
    completedPhases: [1, 2, 3, 4, 5],
    verifyPassed: true,
    verifySummary: { passed: 30, failed: 0, skipped: 0, total: 30 },
    artifactHashes: hashes,
    ...configOverrides,
  }));
}

function seedFeature(dir, name, config = {}) {
  const featDir = path.join(dir, 'features', name);
  fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
  writeFile(featDir, '.aitri', JSON.stringify({
    projectName: name,
    artifactsDir: 'spec',
    approvedPhases: [],
    completedPhases: [],
    ...config,
  }));
}

describe('cmdValidate() — all artifacts present and approved', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    seedDeployableRoot(dir);
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports all valid', () => {
    assert.ok(output.includes('All artifacts present and approved'), 'should report all valid');
  });

  it('shows Validating header', () => {
    assert.ok(output.includes('Validating'), 'should show Validating header');
  });

  it('root-only project shows no Features section', () => {
    assert.ok(!output.includes('Features:'),        'features header must not appear without features');
    assert.ok(!output.includes('Σ all pipelines'),  'aggregate line must not appear without features');
  });
});

// D5 follow-up (rc.156): last-chance intent-coverage visibility at the deploy verdict.
// fr_coverage proves FR→test; it cannot catch a client need that never became an FR —
// validate surfaces that blind spot (advisory, never a gate) via the same
// requirementsAuditState SSoT as complete 1 / approve 1 / resume.
describe('cmdValidate() — intent-coverage advisory at the deploy verdict (D5 follow-up)', () => {
  it('deployable + audit not fresh → prints the advisory with the audit command', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.match(out, /Pipeline complete/, 'precondition: the seed is deployable');
      assert.match(out, /Intent-coverage audit not fresh/, 'the advisory prints at the ship verdict');
      assert.match(out, /aitri audit requirements/, 'it names the command');
      assert.match(out, /fr_coverage/, 'it states WHY fr_coverage cannot catch the drop');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('deployable + audit FRESH (report + matching hash) → advisory absent', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, {
        coverageAuditLastAt: '2999-01-01T00:00:00.000Z',
        coverageAuditReqHash: hashArtifact(ARTIFACTS['spec/01_REQUIREMENTS.json']),
      });
      writeFile(dir, 'spec/AUDIT_REPORT.md', '## Requirements Coverage\nAll covered.\n');
      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.match(out, /Pipeline complete/, 'precondition: still deployable');
      assert.doesNotMatch(out, /Intent-coverage audit not fresh/, 'a fresh audit silences it');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('NOT deployable → advisory absent (scoped to the ready-to-ship verdict only)', () => {
    // Adversarial-pass fix: verifyPassed:false exits early at allGood=false and never
    // reaches the verdict section — a blocking bug keeps all artifacts green (allGood=true)
    // while health.deployable=false, so THIS seed exercises the real blocked-verdict branch.
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      writeFile(dir, 'spec/BUGS.json', JSON.stringify({
        bugs: [{ id: 'BUG-001', severity: 'critical', status: 'open', title: 'ship blocker' }],
      }));
      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.match(out, /deploy is blocked/, 'precondition: the blocked-verdict branch actually renders');
      assert.doesNotMatch(out, /Intent-coverage audit not fresh/,
        'when deploy is already blocked the advisory is secondary noise');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdValidate() — features with verify ran', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    seedDeployableRoot(dir);
    seedFeature(dir, 'alpha', {
      approvedPhases:  [1, 2, 3, 4, 5],
      completedPhases: [1, 2, 3, 4, 5],
      verifyPassed:    false,
      verifySummary:   { passed: 10, failed: 2, skipped: 0, total: 12 },
    });
    seedFeature(dir, 'beta', {
      approvedPhases:  [1, 2, 3, 4, 5],
      completedPhases: [1, 2, 3, 4, 5],
      verifyPassed:    true,
      verifySummary:   { passed: 8, failed: 0, skipped: 0, total: 8 },
    });
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('prints Features section with per-feature row', () => {
    assert.ok(output.includes('Features:'), 'features header must appear');
    assert.ok(output.includes('alpha'),     'alpha feature row must appear');
    assert.ok(output.includes('beta'),      'beta feature row must appear');
  });

  it('shows aggregate Σ line with summed counts across root + features', () => {
    // root 30/30 (pass=30 fail=0) + alpha 10/12 (pass=10 fail=2) + beta 8/8 (pass=8 fail=0)
    //   → 48 pass / 2 fail / 0 deferred (alpha.5: three-bucket format)
    assert.ok(output.includes('Σ all pipelines: (48 ✓ 2 ✗ 0 ⊘)'),
      `expected aggregate (48 ✓ 2 ✗ 0 ⊘), got:\n${output}`);
  });

  it('flags failing feature with ❌ and passing with ✅', () => {
    assert.ok(/alpha.*verify ❌/.test(output), 'alpha should show ❌');
    assert.ok(/beta.*verify ✅/.test(output),  'beta should show ✅');
  });
});

describe('cmdValidate() — feature at 5/5 with verify failed blocks deploy', () => {
  let dir;
  let output;
  let explainOutput;

  before(() => {
    dir = tmpDir();
    seedDeployableRoot(dir);
    seedFeature(dir, 'frontend-remediation', {
      approvedPhases:  [1, 2, 3, 4, 5],
      completedPhases: [1, 2, 3, 4, 5],
      verifyPassed:    false,
      verifySummary:   { passed: 0, failed: 44, skipped: 0, total: 44 },
    });
    output        = captureLog(() => cmdValidate({ dir, args: [] }));
    explainOutput = captureLog(() => cmdValidate({ dir, args: ['--explain'] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports deploy blocked instead of "Pipeline complete"', () => {
    assert.ok(!output.includes('Pipeline complete. Deployment artifacts are ready'),
      'validate must not declare ready-to-ship when a 5/5 feature has failed verify');
    assert.ok(output.includes('deploy is blocked'),
      'validate must surface the deploy block');
  });

  it('names the failing feature in blocking reasons', () => {
    assert.ok(output.includes('frontend-remediation'),
      'feature name must appear in the blocking-reasons list');
  });

  it('--explain surfaces the feature_verify_failed type', () => {
    assert.ok(explainOutput.includes('feature_verify_failed'),
      '--explain must expose the reason type');
    assert.ok(explainOutput.includes('frontend-remediation'),
      '--explain must name the failing feature');
  });
});

describe('cmdValidate() — deploy files are informational, not required (A5)', () => {
  let dir;
  let defaultOutput;
  let explainOutput;

  before(() => {
    dir = tmpDir();
    seedDeployableRoot(dir);
    // No Dockerfile, no docker-compose.yml — project targets e.g. systemd/Pi/lambda.
    defaultOutput = captureLog(() => cmdValidate({ dir, args: [] }));
    explainOutput = captureLog(() => cmdValidate({ dir, args: ['--explain'] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does NOT warn about missing Dockerfile / docker-compose.yml (default or explain)', () => {
    for (const out of [defaultOutput, explainOutput]) {
      assert.doesNotMatch(out, /Dockerfile.*not found/);
      assert.doesNotMatch(out, /docker-compose\.yml.*not found/);
      assert.doesNotMatch(out, /check Phase 5 output/);
    }
  });

  it('default text does NOT include the non-containerized hint (rc.2: moved behind --explain)', () => {
    assert.doesNotMatch(defaultOutput, /No standard deployment files detected/,
      'default text must not include the operational deploy info — it duplicates manifest/status');
  });

  it('--explain surfaces the non-containerized hint', () => {
    assert.match(explainOutput, /No standard deployment files detected/);
    assert.match(explainOutput, /systemd, lambda, Pi/);
  });
});

describe('cmdValidate() — deploy files listing when present (rc.2: behind --explain)', () => {
  it('default text does NOT list deploy files; --explain DOES', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      writeFile(dir, 'Dockerfile', 'FROM node:20\n');
      writeFile(dir, 'DEPLOYMENT.md', '# deploy\n');
      const defaultOut = captureLog(() => cmdValidate({ dir, args: [] }));
      const explainOut = captureLog(() => cmdValidate({ dir, args: ['--explain'] }));
      // Default: no deploy candidates block
      assert.doesNotMatch(defaultOut, /Deployment files detected/,
        'default text must not list deploy files');
      // --explain: full block
      assert.match(explainOut, /Deployment files detected/);
      assert.match(explainOut, /✅ Dockerfile/);
      assert.match(explainOut, /✅ DEPLOYMENT\.md/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── rc.2 P3 (2026-05-12): validate text trim — features hide-when-all-green ─
// Closes BACKLOG "Pre-promotion findings" P3 (validate overlap with status):
// default text shows features section only when blockers present; --explain
// always shows it. JSON shape UNCHANGED (regression-locked separately).

describe('cmdValidate() — features section conditional on blockers (rc.2)', () => {
  it('default text shows Features section when a feature has failed verify', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      seedFeature(dir, 'alpha', {
        approvedPhases:  [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
        verifyPassed:    false,
        verifySummary:   { passed: 0, failed: 5, skipped: 0, total: 5 },
      });
      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.match(out, /Features:/);
      assert.match(out, /alpha.*verify ❌/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('default text shows Features section when a feature is incomplete', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      seedFeature(dir, 'alpha', { approvedPhases: [1] });  // incomplete
      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.match(out, /Features:/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('default text HIDES Features section when all features are all-green', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      seedFeature(dir, 'alpha', {
        approvedPhases:  [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
        verifyPassed:    true,
        verifySummary:   { passed: 10, failed: 0, skipped: 0, total: 10 },
      });
      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.doesNotMatch(out, /Features:/,
        'all-green features add no signal — keep default text lean');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('--explain ALWAYS shows Features section (even when all-green)', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      seedFeature(dir, 'alpha', {
        approvedPhases:  [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
        verifyPassed:    true,
        verifySummary:   { passed: 10, failed: 0, skipped: 0, total: 10 },
      });
      const out = captureLog(() => cmdValidate({ dir, args: ['--explain'] }));
      assert.match(out, /Features:/, '--explain surfaces full audit even when all-green');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdValidate() — JSON shape unchanged by rc.2 text trim (regression lock)', () => {
  // The text refactor must NOT touch --json output. Hub consumes the JSON shape
  // documented in docs/integrations/STATUS_JSON.md. Schema contract.
  it('--json keeps allValid, artifacts[], deployFiles, setupCommands, deployable, deployableReasons', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      writeFile(dir, 'Dockerfile', 'FROM node:20\n');
      const raw = captureStdout(() => cmdValidate({ dir, args: ['--json'] }));
      const j = JSON.parse(raw);
      assert.equal(typeof j.allValid, 'boolean');
      assert.ok(Array.isArray(j.artifacts));
      assert.ok(typeof j.deployFiles === 'object');
      assert.ok(Array.isArray(j.setupCommands));
      assert.equal(typeof j.deployable, 'boolean');
      assert.ok(Array.isArray(j.deployableReasons));
      assert.equal(typeof j.openBugs, 'number');
      assert.equal(typeof j.blockingBugs, 'number');
      // Deploy candidates still in JSON
      assert.equal(j.deployFiles.Dockerfile, true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdValidate() — blocking bug defers to priority ladder (F2 regression)', () => {
  // FEEDBACK.md F2 reported validate saying "ready to ship" while status said
  // "resolve blocking bug first". In current code both paths share bugs.blocking
  // via computeHealth; this test locks that coupling so it cannot regress.
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    seedDeployableRoot(dir);
    writeFile(dir, 'spec/BUGS.json', JSON.stringify({
      bugs: [{
        id: 'BG-001',
        title: 'SQL injection in login',
        severity: 'critical',
        status: 'open',
        description: 'x',
        created_at: new Date().toISOString(),
      }],
    }));
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does NOT claim ready-to-ship when a critical bug is open', () => {
    assert.ok(
      !/Pipeline complete\. Deployment artifacts are ready/.test(output),
      'validate must not contradict the priority ladder when bugs.blocking > 0'
    );
  });

  it('surfaces the blocking bug in the deploy-blocked reasons', () => {
    assert.match(output, /deploy is blocked/);
    assert.match(output, /critical\/high bug/);
  });
});

describe('cmdValidate() — features without verify ran', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    seedDeployableRoot(dir);
    seedFeature(dir, 'alpha', { approvedPhases: [1] });
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('prints Features section', () => {
    assert.ok(output.includes('Features:'), 'features header must appear when features exist');
    assert.ok(output.includes('alpha'),     'alpha row must appear');
  });

  it('omits Σ line when no feature ran verify', () => {
    assert.ok(!output.includes('Σ all pipelines'),
      'aggregate line must not appear when no feature has a verify summary');
  });
});

describe('cmdValidate() — missing artifact', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# Idea\nContent.\n');
    // Only write IDEA.md — all spec/ artifacts missing
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports missing artifacts', () => {
    assert.ok(output.includes('MISSING'), 'should report MISSING for absent artifacts');
  });

  it('shows warning summary', () => {
    assert.ok(output.includes('missing or not approved'), 'should show warning');
  });
});

describe('cmdValidate() — not approved artifact', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [] }));
    writeFile(dir, 'IDEA.md', '# Idea\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACTS['spec/01_REQUIREMENTS.json']);
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('shows not approved status', () => {
    assert.ok(output.includes('not approved'), 'unapproved artifact should be flagged');
  });
});

describe('cmdValidate() — --json output', () => {
  let dir;
  let jsonOutput;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1] }));
    writeFile(dir, 'IDEA.md', '# Idea\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACTS['spec/01_REQUIREMENTS.json']);
    const raw = captureStdout(() => cmdValidate({ dir, args: ['--json'] }));
    jsonOutput = JSON.parse(raw);
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns valid JSON', () => {
    assert.ok(jsonOutput, 'output must be parseable JSON');
  });

  it('has project name', () => {
    assert.equal(jsonOutput.project, 'TestProject');
  });

  it('has artifacts array', () => {
    assert.ok(Array.isArray(jsonOutput.artifacts), 'artifacts must be an array');
  });

  it('marks existing artifact as approved', () => {
    const req = jsonOutput.artifacts.find(a => a.name === '01_REQUIREMENTS.json');
    assert.ok(req, 'requirements artifact must be in output');
    assert.equal(req.exists, true);
    assert.equal(req.approved, true);
  });

  it('marks missing artifact as not existing', () => {
    const design = jsonOutput.artifacts.find(a => a.name === '02_SYSTEM_DESIGN.md');
    assert.ok(design, 'design artifact must be in output');
    assert.equal(design.exists, false);
  });

  it('has allValid field', () => {
    assert.equal(typeof jsonOutput.allValid, 'boolean');
    assert.equal(jsonOutput.allValid, false, 'should not be all valid with missing artifacts');
  });

  it('has deployFiles', () => {
    assert.ok(jsonOutput.deployFiles, 'deployFiles must exist');
  });
});

describe('cmdValidate() — --json run-binding on the results file (UPLAN-0703 B3)', () => {
  function stampRoot(dir) {
    const rp = path.join(dir, 'spec', '04_TEST_RESULTS.json');
    const cp = path.join(dir, '.aitri');
    const cfg = JSON.parse(fs.readFileSync(cp, 'utf8'));
    cfg.verifyResultsHash = hashResultsFile(fs.readFileSync(rp, 'utf8'));
    fs.writeFileSync(cp, JSON.stringify(cfg));
  }

  it('reports drift:true + resultsBinding:"mismatch" when the results file was edited after the run', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      stampRoot(dir);
      // Edit the results file after it was bound — no longer hardcoded drift:false.
      writeFile(dir, 'spec/04_TEST_RESULTS.json', '{"summary":{"total":1,"passed":1,"failed":0},"results":[],"note":"edited"}');
      const json = JSON.parse(captureStdout(() => cmdValidate({ dir, args: ['--json'] })));
      const entry = json.artifacts.find(a => a.name === '04_TEST_RESULTS.json');
      assert.ok(entry, 'results artifact must be present');
      assert.equal(entry.drift, true, 'an edited results file is drift, not hardcoded false');
      assert.equal(entry.resultsBinding, 'mismatch');
      assert.equal(entry.approved, false, 'a tampered results file is not approved');
      assert.equal(json.allValid, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reports drift:false + resultsBinding:"bound" when the stamped file is unchanged', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      stampRoot(dir);
      const json = JSON.parse(captureStdout(() => cmdValidate({ dir, args: ['--json'] })));
      const entry = json.artifacts.find(a => a.name === '04_TEST_RESULTS.json');
      assert.equal(entry.drift, false);
      assert.equal(entry.resultsBinding, 'bound');
      assert.equal(entry.approved, true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdValidate() --ci — unreadable BUGS.json refuses (UPLAN-0703 B8)', () => {
  function runCi(dir) {
    let stderr = '';
    const origErr = process.stderr.write.bind(process.stderr);
    const origCode = process.exitCode;
    process.stderr.write = (c) => { stderr += c; return true; };
    try { captureLog(() => cmdValidate({ dir, args: ['--ci'] })); }
    finally { process.stderr.write = origErr; }
    const code = process.exitCode;
    process.exitCode = origCode;   // don't leak into the test runner
    return { stderr, code };
  }

  it('a malformed ROOT BUGS.json exits non-zero (never green over dropped blocking bugs)', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      writeFile(dir, 'spec/BUGS.json', '{ bugs: [ broken');
      const { stderr, code } = runCi(dir);
      assert.equal(code, 1);
      assert.match(stderr, /BUGS\.json is malformed/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a malformed FEATURE BUGS.json also exits non-zero (the aggregate reads every pipeline)', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      seedFeature(dir, 'billing', { approvedPhases: [1, 2, 3, 4, 5], completedPhases: [1, 2, 3, 4, 5], verifyPassed: true });
      writeFile(dir, path.join('features', 'billing', 'spec', 'BUGS.json'), '{ bugs: [ broken');
      const { stderr, code } = runCi(dir);
      assert.equal(code, 1);
      assert.match(stderr, /feature:billing.*BUGS\.json is malformed/s);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdValidate() — drift uses alias in message', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    const origContent = ARTIFACTS['spec/01_REQUIREMENTS.json'];
    const origHash = hashArtifact(origContent);
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      completedPhases: [1],
      artifactHashes: { '1': origHash },
    }));
    writeFile(dir, 'IDEA.md', '# Idea\n');
    // Write modified content so hash doesn't match
    writeFile(dir, 'spec/01_REQUIREMENTS.json', '{"project_name":"Modified","functional_requirements":[]}');
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('shows DRIFT warning', () => {
    assert.ok(output.includes('DRIFT'), 'drift must be detected');
  });

  it('uses alias in drift message', () => {
    assert.ok(output.includes('requirements') || output.includes('approve'), 'drift message should reference alias or approve command');
  });
});

// ── alpha.22: IDEA.md gate accepts absorbed brief (closes alpha.17 contract gap) ──

describe('cmdValidate() — IDEA.md gate accepts original_brief absorption (alpha.22)', () => {
  // Background: alpha.17 introduced `adopt --upgrade`'s orphan-IDEA absorb
  // migration — IDEA.md content moves into 01_REQUIREMENTS.json.original_brief
  // and the file is unlinked. validate.js was not updated and continued
  // gating on `fs.existsSync('IDEA.md')`, falsely flagging the migrated state
  // as a missing required artifact. Surfaced 2026-05-02 PM by Ultron post
  // alpha.14 → alpha.21 upgrade.

  it('text mode: IDEA.md absent + original_brief populated → ✅ with absorption note', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      // Simulate post-alpha.17 state: IDEA.md gone, original_brief in reqs.
      fs.unlinkSync(path.join(dir, 'IDEA.md'));
      const reqsPath  = path.join(dir, 'spec/01_REQUIREMENTS.json');
      const reqs      = JSON.parse(fs.readFileSync(reqsPath, 'utf8'));
      reqs.original_brief = 'Solve a problem.';
      const updated   = JSON.stringify(reqs);
      fs.writeFileSync(reqsPath, updated, 'utf8');
      // Re-stamp phase 1 hash to avoid drift noise (mirrors what the alpha.17 migration does).
      const cfgPath = path.join(dir, '.aitri');
      const cfg     = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      cfg.artifactHashes['1'] = hashArtifact(updated);
      fs.writeFileSync(cfgPath, JSON.stringify(cfg));

      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.match(out, /✅ IDEA\.md \(absorbed/,
        'absorbed brief must satisfy the IDEA.md gate with explicit annotation');
      assert.doesNotMatch(out, /❌ IDEA\.md/,
        'must not flag IDEA.md as missing when brief is absorbed');
      assert.match(out, /All artifacts present and approved/,
        'absorbed-brief project must validate as fully present');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('text mode: IDEA.md absent AND original_brief absent → ❌ (negation guard)', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      // Strip both paths: file gone, original_brief never populated.
      fs.unlinkSync(path.join(dir, 'IDEA.md'));
      // (ARTIFACTS seed has no original_brief — skip the populate step.)

      const out = captureLog(() => cmdValidate({ dir, args: [] }));
      assert.match(out, /❌ IDEA\.md/,
        'when neither path satisfies, the gate must still fail');
      assert.doesNotMatch(out, /absorbed/,
        'absorption annotation must not appear when neither path satisfies');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('JSON mode: absorbed brief sets approved=true, exists=false, absorbed=true', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      fs.unlinkSync(path.join(dir, 'IDEA.md'));
      const reqsPath = path.join(dir, 'spec/01_REQUIREMENTS.json');
      const reqs     = JSON.parse(fs.readFileSync(reqsPath, 'utf8'));
      reqs.original_brief = 'Some narrative.';
      const updated  = JSON.stringify(reqs);
      fs.writeFileSync(reqsPath, updated, 'utf8');
      const cfgPath = path.join(dir, '.aitri');
      const cfg     = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      cfg.artifactHashes['1'] = hashArtifact(updated);
      fs.writeFileSync(cfgPath, JSON.stringify(cfg));

      const out  = captureStdout(() => cmdValidate({ dir, args: ['--json'] }));
      const json = JSON.parse(out);
      const ideaArtifact = json.artifacts.find(a => a.name === 'IDEA.md');
      assert.ok(ideaArtifact, 'JSON output must include IDEA.md artifact entry');
      assert.equal(ideaArtifact.exists,   false, 'exists stays literal — file is gone');
      assert.equal(ideaArtifact.approved, true,  'approved=true via absorption path');
      assert.equal(ideaArtifact.absorbed, true,  'additive absorbed flag set when brief was absorbed');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('JSON mode: allValid=true for a completed project whose brief was absorbed (E2E-PIPELINE-0706)', () => {
    // Pre-rc.160, allValid required literal `exists` on every required entry —
    // a permanent false-negative for EVERY project past approve 1 (IDEA.md is
    // deleted at absorption by design). The predicate now honors `absorbed`.
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      fs.unlinkSync(path.join(dir, 'IDEA.md'));
      const reqsPath = path.join(dir, 'spec/01_REQUIREMENTS.json');
      const reqs     = JSON.parse(fs.readFileSync(reqsPath, 'utf8'));
      reqs.original_brief = 'Some narrative.';
      const updated  = JSON.stringify(reqs);
      fs.writeFileSync(reqsPath, updated, 'utf8');
      const cfgPath = path.join(dir, '.aitri');
      const cfg     = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      cfg.artifactHashes['1'] = hashArtifact(updated);
      fs.writeFileSync(cfgPath, JSON.stringify(cfg));

      const json = JSON.parse(captureStdout(() => cmdValidate({ dir, args: ['--json'] })));
      assert.equal(json.allValid, true,
        'absorbed brief counts as satisfied — allValid must not be a permanent false-negative');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('JSON mode: allValid=false when the brief is neither on disk nor absorbed', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      fs.unlinkSync(path.join(dir, 'IDEA.md'));
      // original_brief never populated — the gate must still fail.
      const json = JSON.parse(captureStdout(() => cmdValidate({ dir, args: ['--json'] })));
      assert.equal(json.allValid, false, 'a genuinely missing brief still fails allValid');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('JSON mode: file on disk → exists=true, approved=true, no absorbed flag', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      // Default seedDeployableRoot writes IDEA.md to disk and does NOT set original_brief.

      const out  = captureStdout(() => cmdValidate({ dir, args: ['--json'] }));
      const json = JSON.parse(out);
      const ideaArtifact = json.artifacts.find(a => a.name === 'IDEA.md');
      assert.equal(ideaArtifact.exists,   true,  'file path: exists is true');
      assert.equal(ideaArtifact.approved, true,  'file path: approved is true');
      assert.equal(ideaArtifact.absorbed, undefined,
        'file path: absorbed flag must be omitted entirely (additive — only present when absorption was used)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ADV-0622-27: validate is a reporting command (exits 0 by default), so a CI step running
// it silently passes even when the project is not deployable. --ci turns the deploy-gate
// verdict into the exit code (opt-in; output unchanged).
describe('cmdValidate() — --ci exit code (ADV-0622-27)', () => {
  function withExit(fn) {
    const saved = process.exitCode;
    process.exitCode = 0;
    try { fn(); return process.exitCode; } finally { process.exitCode = saved; }
  }

  it('--ci exits non-zero when the project is NOT deployable', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1] }));  // nowhere near deployable
    try {
      const code = withExit(() => captureLog(() => cmdValidate({ dir, args: ['--ci'] })));
      assert.equal(code, 1, 'not-deployable + --ci must exit non-zero');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('--ci leaves exit code 0 when the project IS deployable', () => {
    const dir = tmpDir();
    seedDeployableRoot(dir);
    try {
      const code = withExit(() => captureLog(() => cmdValidate({ dir, args: ['--ci'] })));
      assert.equal(code, 0, 'deployable + --ci stays 0');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('without --ci, a not-deployable project still exits 0 (reporting command, unchanged)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1] }));
    try {
      const code = withExit(() => captureLog(() => cmdValidate({ dir, args: [] })));
      assert.equal(code, 0, 'default validate never changes the exit code');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('--json --ci keeps stdout pure JSON (the notice goes to stderr)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1] }));
    try {
      let out, code;
      withExit(() => { out = captureStdout(() => cmdValidate({ dir, args: ['--json', '--ci'] })); code = process.exitCode; });
      assert.equal(code, 1, '--json --ci still exits non-zero when not deployable');
      assert.doesNotThrow(() => JSON.parse(out), 'stdout must remain parseable JSON under --json --ci');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
