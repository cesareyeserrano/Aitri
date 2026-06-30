import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildTraceabilityMarkdown, cmdExport } from '../../lib/commands/export.js';

function tmpProject(artifacts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-export-'));
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec', projectName: 'Demo' }));
  for (const [name, obj] of Object.entries(artifacts)) {
    fs.writeFileSync(path.join(dir, 'spec', name),
      typeof obj === 'string' ? obj : JSON.stringify(obj));
  }
  return dir;
}
const cfg = { artifactsDir: 'spec', projectName: 'Demo' };
const quiet = (fn) => { const ol = console.log, oe = process.stderr.write, ow = process.stdout.write;
  let out = ''; console.log = () => {}; process.stderr.write = () => true; process.stdout.write = (c) => { out += c; return true; };
  try { fn(); } finally { console.log = ol; process.stderr.write = oe; process.stdout.write = ow; } return out; };

describe('buildTraceabilityMarkdown()', () => {
  it('renders a matrix row per FR and NFR, joining coverage + compliance', () => {
    const dir = tmpProject({
      '01_REQUIREMENTS.json': {
        functional_requirements: [
          { id: 'FR-001', title: 'Login', priority: 'MUST' },
          { id: 'FR-002', title: 'Logout', priority: 'SHOULD' },
        ],
        non_functional_requirements: [{ id: 'NFR-001', requirement: 'p95 < 200ms', category: 'Regression' }],
      },
      '03_TEST_CASES.json': { test_cases: [
        { id: 'TC-001h', requirement_id: 'FR-001' }, { id: 'TC-001f', requirement_id: 'FR-001' },
      ] },
      '04_TEST_RESULTS.json': { fr_coverage: [
        { fr_id: 'FR-001', tests_passing: 2, tests_failing: 0, tests_skipped: 0, status: 'covered' },
      ] },
      '05_TRACEABILITY.json': { overall_status: 'partial',
        requirement_compliance: [{ id: 'FR-001', level: 'complete', tc_ids: ['TC-001h', 'TC-001f'] }] },
    });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.equal(typeof md, 'string');
      assert.match(md, /# Traceability Matrix — Demo/);
      assert.match(md, /Overall status:\*\* partial/);
      assert.match(md, /\| FR-001 \| Login \| MUST \| FR \| TC-001h, TC-001f \| ✓2 ✗0 ⊘0 \| covered \| complete \|/);
      assert.match(md, /\| FR-002 \| Logout \| SHOULD \| FR \| — \| — \| — \| — \|/);   // uncovered → dashes
      assert.match(md, /\| NFR-001 \| p95 < 200ms \| MUST \(reg\) \| NFR \|/);          // regression priority label
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('escapes a pipe in a cell so it does not break the table', () => {
    const dir = tmpProject({ '01_REQUIREMENTS.json': {
      functional_requirements: [{ id: 'FR-001', title: 'A | B choice', priority: 'MUST' }] } });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /A &#124; B choice/, 'a literal pipe must be entity-escaped so it cannot break the table');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('unions compliance tc_ids with the live 03_TEST_CASES — a stale 05 cannot hide current TCs', () => {
    const dir = tmpProject({
      '01_REQUIREMENTS.json': { functional_requirements: [{ id: 'FR-001', title: 'x', priority: 'MUST' }] },
      '03_TEST_CASES.json': { test_cases: [{ id: 'TC-DERIVED', requirement_id: 'FR-001' }] },
      '05_TRACEABILITY.json': { requirement_compliance: [{ id: 'FR-001', level: 'complete', tc_ids: ['TC-AUTH'] }] },
    });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /TC-AUTH/);
      assert.match(md, /TC-DERIVED/, 'the live test case must NOT be suppressed by a (possibly stale) compliance list');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('H1: flags a "complete" compliance level over failing/uncovered evidence, and alarms the MUST coverage', () => {
    const dir = tmpProject({
      '01_REQUIREMENTS.json': { functional_requirements: [{ id: 'FR-001', title: 'Login', priority: 'MUST' }] },
      '03_TEST_CASES.json': { test_cases: [{ id: 'TC-1', requirement_id: 'FR-001' }] },
      '04_TEST_RESULTS.json': { fr_coverage: [{ fr_id: 'FR-001', tests_passing: 0, tests_failing: 3, tests_skipped: 0, status: 'uncovered' }] },
      '05_TRACEABILITY.json': { requirement_compliance: [{ id: 'FR-001', level: 'complete', tc_ids: ['TC-1'] }] },
    });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /⚠ uncovered \(failing\)/, 'a failing MUST FR must alarm in the coverage column');
      assert.match(md, /⚠ complete \(vs tests\)/, 'a "complete" level over failing tests must be flagged, not shown as authoritative');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('AUDIT-0629-E: flags a "complete" level over a pending "manual" FR — matches what complete 5 rejects', () => {
    const dir = tmpProject({
      '01_REQUIREMENTS.json': { functional_requirements: [{ id: 'FR-001', title: 'Login', priority: 'MUST' }] },
      '03_TEST_CASES.json': { test_cases: [{ id: 'TC-1', requirement_id: 'FR-001', automation: 'manual' }] },
      // a pending (unverified) manual TC → fr_coverage status "manual", 0 passing. The deploy gate
      // (phase5) rejects a "complete" claim over this; the export shared the SAME rule must flag it.
      '04_TEST_RESULTS.json': { fr_coverage: [{ fr_id: 'FR-001', tests_passing: 0, tests_failing: 0, tests_manual: 1, status: 'manual' }] },
      '05_TRACEABILITY.json': { requirement_compliance: [{ id: 'FR-001', level: 'complete', tc_ids: ['TC-1'] }] },
    });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /⚠ complete \(vs tests\)/,
        'a "complete" claim over a pending manual FR must be flagged — the doc must not render clean what the deploy gate rejects (the old inline copy wrongly accepted "manual")');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('AUDIT-0629-F: a lowercase category:"regression" NFR is still treated as MUST (reuses isMustRequirement)', () => {
    const dir = tmpProject({
      '01_REQUIREMENTS.json': { non_functional_requirements: [
        { id: 'NFR-001', requirement: 'no perf regression', category: 'regression' },   // lowercase — the old inline check missed it
      ] },
      '04_TEST_RESULTS.json': { fr_coverage: [] },   // uncovered → a MUST must alarm; a non-MUST renders plain '—'
    });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /\| NFR-001 \| no perf regression \| MUST \(reg\) \| NFR \|/,
        'a regression NFR of any casing shows the MUST priority label');
      assert.match(md, /⚠ untested/,
        'an uncovered regression NFR alarms as a MUST, not a plain dash (case-sensitive inline check used to drop it)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('H3: surfaces a coverage entry whose requirement id is absent from 01 (orphan/stale)', () => {
    const dir = tmpProject({
      '01_REQUIREMENTS.json': { functional_requirements: [{ id: 'FR-001', title: 'x', priority: 'MUST' }] },
      '04_TEST_RESULTS.json': { fr_coverage: [
        { fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, status: 'covered' },
        { fr_id: 'FR-999', tests_passing: 0, tests_failing: 5, tests_skipped: 0, status: 'uncovered' },
      ] },
    });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /Consistency warnings/);
      assert.match(md, /FR-999/, 'an orphan failing coverage entry must not silently vanish');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('H4: a present-but-malformed source is flagged, not silently treated as absent', () => {
    const dir = tmpProject({
      '01_REQUIREMENTS.json': { functional_requirements: [{ id: 'FR-001', title: 'x', priority: 'MUST' }] },
      '04_TEST_RESULTS.json': '{ broken json',
    });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /04_TEST_RESULTS\.json is present but unreadable/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('degrades when only requirements exist (no TCs/results/compliance)', () => {
    const dir = tmpProject({ '01_REQUIREMENTS.json': {
      functional_requirements: [{ id: 'FR-001', title: 'x', priority: 'MUST' }] } });
    try {
      const md = buildTraceabilityMarkdown(dir, cfg);
      assert.match(md, /\| FR-001 \| x \| MUST \| FR \| — \| — \| ⚠ untested \| — \|/); // a MUST with no tests alarms
      assert.doesNotMatch(md, /03_TEST_CASES/); // source list omits absent artifacts
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns an error when the spine artifact is missing or malformed', () => {
    const missing = tmpProject({});
    try { assert.match(buildTraceabilityMarkdown(missing, cfg).error, /not found/); }
    finally { fs.rmSync(missing, { recursive: true, force: true }); }
    const bad = tmpProject({ '01_REQUIREMENTS.json': '{ broken json' });
    try { assert.match(buildTraceabilityMarkdown(bad, cfg).error, /malformed/); }
    finally { fs.rmSync(bad, { recursive: true, force: true }); }
  });
});

describe('cmdExport()', () => {
  const throwErr = (m) => { throw new Error(m); };

  it('writes to --out and prints a confirmation', () => {
    const dir = tmpProject({ '01_REQUIREMENTS.json': {
      functional_requirements: [{ id: 'FR-001', title: 'x', priority: 'MUST' }] } });
    try {
      const out = quiet(() => cmdExport({ dir, args: ['traceability', '--out', 'matrix.md'],
        flagValue: (f) => { const i = ['traceability', '--out', 'matrix.md'].indexOf(f); return i >= 0 ? ['traceability', '--out', 'matrix.md'][i + 1] : null; },
        err: throwErr }));
      const written = fs.readFileSync(path.join(dir, 'matrix.md'), 'utf8');
      assert.match(written, /# Traceability Matrix/);
      assert.match(out, /Wrote traceability matrix/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('M1: refuses --out that would overwrite a pipeline artifact (the spine)', () => {
    const dir = tmpProject({ '01_REQUIREMENTS.json': { functional_requirements: [{ id: 'FR-001', title: 'x', priority: 'MUST' }] } });
    const before = fs.readFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), 'utf8');
    try {
      const args = ['traceability', '--out', 'spec/01_REQUIREMENTS.json'];
      assert.throws(() => cmdExport({ dir, args,
        flagValue: (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; }, err: throwErr }),
        /Refusing --out/);
      assert.equal(fs.readFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), 'utf8'), before,
        'the artifact must be left untouched');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('errors on an unknown subcommand', () => {
    const dir = tmpProject({});
    try {
      assert.throws(() => cmdExport({ dir, args: ['bogus'], flagValue: () => null, err: throwErr }), /Usage: aitri export/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('errors on an unsupported --format', () => {
    const dir = tmpProject({ '01_REQUIREMENTS.json': { functional_requirements: [{ id: 'FR-001', title: 'x', priority: 'MUST' }] } });
    try {
      assert.throws(() => cmdExport({ dir, args: ['traceability', '--format', 'pdf'],
        flagValue: (f) => f === '--format' ? 'pdf' : null, err: throwErr }), /Unsupported --format/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
