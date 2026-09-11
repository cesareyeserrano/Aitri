/**
 * Tests for TC-ID-COLLISION-0911 (ADR-092, 2.2.0-rc.16) — TC ids are unique across the
 * pipelines of one project.
 *
 * verify-run credits a plan TC by id alone, and a pipeline's runner may execute more than
 * its own tests (a whole-repo script shared by every feature). Two pipelines planning the
 * same id therefore cross-credit: one pipeline's test result lands on the other's TC — a
 * pass while that TC's own test is missing, or a failure it never owned. Phase 3 checked
 * duplicates only inside one file.
 *
 * Pinned here: the shared finder (lib/tc-collisions.js), the Phase 3 refusal wired through
 * PHASE_DEFS[3].validate with the ctx `complete` passes, and the verify-run advisory driven
 * through the real command.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

import { saveConfig, loadConfig } from '../lib/state.js';
import { PHASE_DEFS } from '../lib/phases/index.js';
import { crossPipelineTCCollisions, projectPipelines, describeCollision, suggestTCNamespace } from '../lib/tc-collisions.js';
import { cmdVerifyRun } from '../lib/commands/verify.js';
import { cmdComplete } from '../lib/commands/complete.js';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-tc-collide-')); }
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

const makeTC = (id, reqId, type, scenario = 'happy_path') => ({
  id, requirement_id: reqId, title: `Test ${id}`, type,
  scenario, user_story_id: 'US-001', ac_id: 'AC-001',
  priority: 'high', preconditions: [], steps: ['step'], expected_result: 'HTTP 200 with expected response', test_data: {},
});
const planWith = (ids) => JSON.stringify({
  test_plan: { strategy: 'unit + e2e', coverage_goal: '80%', test_types: ['unit', 'e2e'] },
  test_cases: ids,
});
/** A Phase-3-valid plan over FR-001/FR-002 whose ids carry an optional namespace. */
const validPlan = (ns = '') => planWith([
  makeTC(`TC-${ns}001h`, 'FR-001', 'unit',        'happy_path'),
  makeTC(`TC-${ns}001e`, 'FR-001', 'integration', 'edge_case'),
  makeTC(`TC-${ns}001f`, 'FR-001', 'e2e',         'negative'),
  makeTC(`TC-${ns}002h`, 'FR-002', 'unit',        'happy_path'),
  makeTC(`TC-${ns}002e`, 'FR-002', 'integration', 'edge_case'),
  makeTC(`TC-${ns}002f`, 'FR-002', 'e2e',         'negative'),
]);

function writePlan(pipelineDir, artifactsDir, content) {
  fs.mkdirSync(path.join(pipelineDir, artifactsDir), { recursive: true });
  fs.writeFileSync(path.join(pipelineDir, artifactsDir, '03_TEST_CASES.json'), content);
}

/** Flat layout: root plan in spec/, features under features/<name>/spec. */
function seedFlat(root, { rootPlan, features = {} }) {
  saveConfig(root, { projectName: 'p', artifactsDir: 'spec' });
  if (rootPlan) writePlan(root, 'spec', rootPlan);
  for (const [name, plan] of Object.entries(features)) {
    const fd = path.join(root, 'features', name);
    fs.mkdirSync(fd, { recursive: true });
    saveConfig(fd, { projectName: name, artifactsDir: 'spec' });
    if (plan) writePlan(fd, 'spec', plan);
  }
}

describe('crossPipelineTCCollisions()', () => {
  it('a feature id also planned by the root → reported with the root as the other owner', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { f1: validPlan() } });
      const fd = path.join(root, 'features', 'f1');
      const c = crossPipelineTCCollisions({ dir: fd, featureRoot: root, ids: ['TC-001h', 'TC-F-009h'] });
      assert.deepEqual(c, [{ id: 'TC-001h', others: [{ label: 'root', id: 'TC-001h' }] }]);
      assert.equal(describeCollision(c[0]), 'TC-001h — also in root');
    } finally { cleanup(root); }
  });

  it('compares case-insensitively (verify-run links ids that differ only in case) and names the other spelling', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: planWith([makeTC('TC-001H', 'FR-001', 'unit')]), features: { f1: null } });
      const fd = path.join(root, 'features', 'f1');
      const c = crossPipelineTCCollisions({ dir: fd, featureRoot: root, ids: ['TC-001h'] });
      assert.equal(c.length, 1);
      assert.equal(describeCollision(c[0]), 'TC-001h — also in root (as TC-001H)');
    } finally { cleanup(root); }
  });

  it('from the root: sibling features are checked; the pipeline itself is never a collision', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { a: validPlan('A-'), b: validPlan() } });
      const c = crossPipelineTCCollisions({ dir: root, ids: ['TC-001h', 'TC-A-001h', 'TC-ROOT-001h'] });
      assert.deepEqual(c.map(x => describeCollision(x)).sort(), ['TC-001h — also in feature b', 'TC-A-001h — also in feature a']);
    } finally { cleanup(root); }
  });

  it('namespaced pipelines (the T-Ledger shape: bare root ids, namespaced features) → no collision', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { backend: validPlan('BE-'), ciclos: validPlan('CICLOS-') } });
      const fd = path.join(root, 'features', 'ciclos');
      const ids = JSON.parse(validPlan('CICLOS-')).test_cases.map(t => t.id);
      assert.deepEqual(crossPipelineTCCollisions({ dir: fd, featureRoot: root, ids }), []);
    } finally { cleanup(root); }
  });

  it('contained layout (aitri/product/spec + aitri/features) is enumerated through the layout, not a hardcoded path', () => {
    const root = tmpDir();
    try {
      saveConfig(root, { projectName: 'p', artifactsDir: 'aitri/product/spec', layoutRoot: 'aitri' });
      writePlan(root, 'aitri/product/spec', validPlan());
      const fd = path.join(root, 'aitri', 'features', 'f2');
      fs.mkdirSync(fd, { recursive: true });
      saveConfig(fd, { projectName: 'f2', artifactsDir: 'spec' });
      writePlan(fd, 'spec', validPlan());
      assert.deepEqual(projectPipelines(fd, root).map(p => p.label), ['root', 'feature f2']);
      assert.equal(crossPipelineTCCollisions({ dir: fd, featureRoot: root, ids: ['TC-002f'] }).length, 1);
    } finally { cleanup(root); }
  });

  it('tolerant: an orphan dir, a conflicted sibling .aitri and a malformed sibling plan are skipped, never thrown', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { good: null, broken: validPlan() } });
      fs.mkdirSync(path.join(root, 'features', 'orphan', 'spec'), { recursive: true });          // no .aitri
      writePlan(path.join(root, 'features', 'orphan'), 'spec', validPlan());
      fs.writeFileSync(path.join(root, 'features', 'broken', '.aitri'), '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> x\n');
      const badPlanFeature = path.join(root, 'features', 'badplan');
      fs.mkdirSync(badPlanFeature, { recursive: true });
      saveConfig(badPlanFeature, { projectName: 'badplan', artifactsDir: 'spec' });
      writePlan(badPlanFeature, 'spec', '{ not json');
      const fd = path.join(root, 'features', 'good');
      const c = crossPipelineTCCollisions({ dir: fd, featureRoot: root, ids: ['TC-001h'] });
      assert.deepEqual(c.map(describeCollision), ['TC-001h — also in root'], 'only the readable root counts');
    } finally { cleanup(root); }
  });

  it('a feature dir spelled in another case (case-insensitive filesystem) is still recognized as itself', (t) => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { ciclos: validPlan('CICLOS-') } });
      const typed = path.join(root, 'features', 'CICLOS');   // `aitri feature ... CICLOS` builds this
      if (!fs.existsSync(typed)) { t.skip('case-sensitive filesystem — that spelling cannot reach the same dir'); return; }
      const ids = JSON.parse(validPlan('CICLOS-')).test_cases.map(x => x.id);
      assert.deepEqual(crossPipelineTCCollisions({ dir: typed, featureRoot: root, ids }), [],
        'a feature must never collide with its own plan because of how its name was typed');
    } finally { cleanup(root); }
  });

  it('suggestTCNamespace derives a canonical namespace from a feature name', () => {
    assert.equal(suggestTCNamespace('ciclos'), 'TC-CICLOS-');
    assert.equal(suggestTCNamespace('multi-anio'), 'TC-MULTI-ANIO-');
    assert.equal(suggestTCNamespace('web2-app'), 'TC-WEB-APP-');
    assert.equal(suggestTCNamespace('123'), null);
  });
});

describe('Phase 3 refuses a TC id another pipeline already plans (wired through validate ctx)', () => {
  it('feature scope: refuses, names the root, suggests the feature namespace', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { ciclos: validPlan() } });
      const fd = path.join(root, 'features', 'ciclos');
      assert.throws(
        () => PHASE_DEFS[3].validate(validPlan(), { dir: fd, config: loadConfig(fd), featureRoot: root }),
        (e) => /already planned by another pipeline/.test(e.message)
          && /TC-001h — also in root/.test(e.message)
          && /TC-CICLOS-001h/.test(e.message),
      );
    } finally { cleanup(root); }
  });

  it('root scope: refuses an id a feature already plans, naming the feature', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { f1: validPlan() } });
      assert.throws(
        () => PHASE_DEFS[3].validate(validPlan(), { dir: root, config: loadConfig(root) }),
        /TC-001h — also in feature f1/,
      );
    } finally { cleanup(root); }
  });

  it('namespaced feature ids pass; a content-only validate (no ctx.dir) never reads the project', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { ciclos: validPlan('CICLOS-') } });
      const fd = path.join(root, 'features', 'ciclos');
      assert.doesNotThrow(() => PHASE_DEFS[3].validate(validPlan('CICLOS-'), { dir: fd, config: loadConfig(fd), featureRoot: root }));
      assert.doesNotThrow(() => PHASE_DEFS[3].validate(validPlan()));
    } finally { cleanup(root); }
  });
});

// Wiring pins through the real command: a helper- or validate()-only pin would stay green if
// complete.js stopped handing the project (dir + featureRoot) to the validator.
describe('the refusal is wired through the real `complete 3` command', () => {
  function runComplete(opts) {
    let errMsg = null, stderrText = '';
    const origErr = console.error, origLog = console.log, origExit = process.exit;
    console.error = (...a) => { stderrText += `${a.join(' ')}\n`; };
    console.log = () => {};
    process.exit = (code) => { throw Object.assign(new Error(`exit ${code}`), { exitCode: code }); };
    try {
      cmdComplete({ ...opts, err: (m) => { errMsg = m; throw new Error(m); } });
    } catch (e) {
      if (errMsg === null && e.exitCode === undefined) throw e;
    } finally {
      console.error = origErr; console.log = origLog; process.exit = origExit;
    }
    return { errMsg, stderrText };
  }
  function seedFeature(root, featurePlan) {
    seedFlat(root, { rootPlan: validPlan(), features: { ciclos: null } });
    const fd = path.join(root, 'features', 'ciclos');
    saveConfig(fd, { projectName: 'ciclos', artifactsDir: 'spec', approvedPhases: [1, 2], completedPhases: [1, 2] });
    writePlan(fd, 'spec', featurePlan);
    return fd;
  }

  it('feature scope: `feature complete <name> 3` refuses an id the root plans', () => {
    const root = tmpDir();
    try {
      const fd = seedFeature(root, validPlan());
      const { errMsg } = runComplete({ dir: fd, args: ['3'], featureRoot: root, scopeName: 'ciclos' });
      assert.match(errMsg || '', /already planned by another pipeline[\s\S]*TC-001h — also in root[\s\S]*TC-CICLOS-001h/);
    } finally { cleanup(root); }
  });

  it('feature scope `--check` reports the same refusal and exits non-zero', () => {
    const root = tmpDir();
    try {
      const fd = seedFeature(root, validPlan());
      const { stderrText } = runComplete({ dir: fd, args: ['3', '--check'], featureRoot: root, scopeName: 'ciclos' });
      assert.match(stderrText, /already planned by another pipeline[\s\S]*TC-001h — also in root/);
    } finally { cleanup(root); }
  });

  it('root scope: `complete 3` refuses an id a feature plans', () => {
    const root = tmpDir();
    try {
      seedFlat(root, { rootPlan: validPlan(), features: { f1: validPlan() } });
      saveConfig(root, { projectName: 'p', artifactsDir: 'spec', approvedPhases: [1, 2], completedPhases: [1, 2] });
      const { errMsg } = runComplete({ dir: root, args: ['3'] });
      assert.match(errMsg || '', /TC-001h — also in feature f1/);
    } finally { cleanup(root); }
  });
});

describe('verify-run warns about collisions a plan approved before the gate still carries (advisory)', () => {
  function seedFeatureRun(root, featurePlan) {
    seedFlat(root, { rootPlan: planWith([makeTC('TC-001h', 'FR-001', 'unit')]), features: { f1: null } });
    const fd = path.join(root, 'features', 'f1');
    saveConfig(fd, { projectName: 'f1', artifactsDir: 'spec', approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4] });
    fs.mkdirSync(path.join(fd, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(fd, 'spec', '01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'MUST' }],
    }));
    writePlan(fd, 'spec', featurePlan);
    fs.writeFileSync(path.join(fd, 'spec', '04_BUILD_REPORT.json'), JSON.stringify({
      files_created: ['x.js'], technical_debt: [], test_runner: 'node runner.cjs', test_files: ['runner.cjs'],
    }));
    // A whole-repo runner: it prints the ROOT's TC-001h too.
    fs.writeFileSync(path.join(fd, 'runner.cjs'), `console.log('\\u2714 TC-001h root test');\nconsole.log('\\u2714 TC-F-001h feature test');\n`);
    return fd;
  }
  function runVerify(fd, root) {
    let errMsg = null, stderr = '';
    const origLog = console.log, origErr = process.stderr.write;
    console.log = () => {};
    process.stderr.write = (s) => { stderr += String(s); return true; };
    try {
      cmdVerifyRun({ dir: fd, args: [], flagValue: () => null, featureRoot: root, scopeName: 'f1',
        err: (m) => { errMsg = m; throw new Error(m); } });
    } catch (e) {
      if (errMsg === null) throw e;
    } finally {
      console.log = origLog; process.stderr.write = origErr;
    }
    assert.equal(errMsg, null, `verify-run must complete — got: ${errMsg}`);
    return stderr;
  }

  it('a colliding automated plan id → warning naming the id and the other pipeline; the run still completes', () => {
    const root = tmpDir();
    try {
      const fd = seedFeatureRun(root, planWith([makeTC('TC-001h', 'FR-001', 'unit'), makeTC('TC-F-001h', 'FR-001', 'unit')]));
      const stderr = runVerify(fd, root);
      assert.match(stderr, /1 planned TC id\(s\) are also planned by another pipeline of this project: TC-001h — also in root/);
      assert.ok(fs.existsSync(path.join(fd, 'spec', '04_TEST_RESULTS.json')), 'advisory only: results are still written');
    } finally { cleanup(root); }
  });

  it('control: namespaced feature ids → no collision warning', () => {
    const root = tmpDir();
    try {
      const fd = seedFeatureRun(root, planWith([makeTC('TC-F-001h', 'FR-001', 'unit')]));
      const stderr = runVerify(fd, root);
      assert.doesNotMatch(stderr, /also planned by another pipeline/);
    } finally { cleanup(root); }
  });
});
