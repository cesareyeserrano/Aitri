import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseRunnerOutput, parsePlaywrightOutput, parseVitestOutput, parsePytestOutput, parseGoOutput, buildFRCoverage, buildACCoverage, scanTestContent, parseCoverageOutput, injectCoverageFlag, extractTCId, cmdVerifyRun, cmdVerifyComplete, runQualityGates, resolveWinBin } from '../../lib/commands/verify.js';
import { cmdStatus } from '../../lib/commands/status.js';

describe('parseRunnerOutput()', () => {

  it('detects passing TC from ✔ TC-XXX line', () => {
    const output = `✔ TC-001: setBudget stores valid amount (0.265417ms)`;
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-001')?.status, 'pass');
  });

  it('detects failing TC from ✖ TC-XXX line', () => {
    const output = `✖ TC-020: docker-compose.yml declares port mapping 3000:80 (0.202542ms)`;
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-020')?.status, 'fail');
  });

  it('captures error context in notes for failing TC', () => {
    const output = [
      `✖ TC-005: rejects invalid stage (0.060ms)`,
      `  AssertionError: expected error to be thrown`,
      `  at TestContext.<anonymous> (tests/unit.test.mjs:42)`,
    ].join('\n');
    const result = parseRunnerOutput(output);
    assert.ok(result.get('TC-005')?.notes.includes('AssertionError'));
  });

  it('passes notes include the output line for passing TC', () => {
    const output = `✔ TC-007: returns 30.0 for 30000 closed of 100000 budget (0.092292ms)`;
    const result = parseRunnerOutput(output);
    assert.ok(result.get('TC-007')?.notes.includes('TC-007'));
  });

  it('returns empty map for output with no TC patterns', () => {
    const output = `✔ Some non-TC test (0.1ms)\n✖ Another non-TC test (0.2ms)`;
    const result = parseRunnerOutput(output);
    assert.equal(result.size, 0);
  });

  it('detects multiple TCs from multi-line output', () => {
    const output = [
      `✔ TC-001: setBudget (0.2ms)`,
      `✔ TC-002: getBudget (0.1ms)`,
      `✖ TC-003: rejects negative (0.1ms)`,
    ].join('\n');
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-001')?.status, 'pass');
    assert.equal(result.get('TC-002')?.status, 'pass');
    assert.equal(result.get('TC-003')?.status, 'fail');
  });

  it('fail wins when one TC id appears as both pass and fail (no masked failure)', () => {
    // Parametrized/repeated tests share one TC id; a passing case can print
    // before a failing one. First-occurrence-wins used to mask the failure.
    const output = [
      `✔ TC-001: case A (0.2ms)`,
      `✖ TC-001: case B fails (0.1ms)`,
    ].join('\n');
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-001')?.status, 'fail');
    assert.equal(result.size, 1);
  });

  it('fail wins regardless of order (fail before pass)', () => {
    const result = parseRunnerOutput(`✖ TC-001: case A fails\n✔ TC-001: case B`);
    assert.equal(result.get('TC-001')?.status, 'fail');
  });

  it('classifies a node:test todo (✔ … # TODO) as skip, not pass', () => {
    // node --test prints ✔ for todo tests; crediting an unimplemented placeholder
    // as a pass would mark its FR covered on nothing.
    const result = parseRunnerOutput(`✔ TC-002h: not built yet (0.1ms) # TODO`);
    assert.equal(result.get('TC-002h')?.status, 'skip');
  });

  it('handles TC ids with multiple digits', () => {
    const output = `✔ TC-018: docker healthcheck (0.3ms)`;
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-018')?.status, 'pass');
  });

  it('detects alphanumeric TC id (e.g. TC-020b)', () => {
    const output = `✔ TC-020b: no horizontal scroll at 375px (0.1ms)`;
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-020b')?.status, 'pass');
  });

  it('detects TC-020c as pass with alphanumeric id', () => {
    const output = `✔ TC-020c: negative — body overflow-x hidden (0.1ms)`;
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-020c')?.status, 'pass');
  });

  it('detects multi-segment namespaced TC (TC-FE-001h)', () => {
    const output = `✔ TC-FE-001h: threshold absent from scroll guard (0.1ms)`;
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-FE-001h')?.status, 'pass');
  });

  // The parser requires a numeric block on purpose: a digit-free id like
  // TC-e2eFolderScan must NOT match, otherwise stray log tokens (TC-PASS,
  // TC-NOTES) become phantom TCs. Non-canonical authoring is blocked at the
  // Phase 3 gate instead (see test/phases/phase3.test.js). Guards against
  // re-introducing the reverted digit-free branch.
  it('does NOT extract a digit-free id (TC-e2eFolderScan → null)', () => {
    assert.equal(extractTCId('✔ TC-e2eFolderScan: register folder type'), null);
  });

});

describe('parseVitestOutput()', () => {

  it('detects passing TC from ✓ (U+2713) Vitest verbose line', () => {
    const output = ` ✓ TC-001: login returns JWT (3ms)`;
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-001')?.status, 'pass');
  });

  it('detects failing TC from × (U+00D7) Vitest line', () => {
    const output = ` × TC-002: invalid token returns 401 (1ms)`;
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-002')?.status, 'fail');
  });

  it('detects failing TC from ✕ (U+2715) Jest verbose line', () => {
    const output = `    ✕ TC-003: dashboard renders at 375px (2ms)`;
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-003')?.status, 'fail');
  });

  it('detects multiple TCs from multi-line Vitest output', () => {
    const output = [
      ` ✓ TC-001: login returns JWT (3ms)`,
      ` ✓ TC-002: dashboard renders (2ms)`,
      ` × TC-003: invalid token rejected (1ms)`,
    ].join('\n');
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-001')?.status, 'pass');
    assert.equal(result.get('TC-002')?.status, 'pass');
    assert.equal(result.get('TC-003')?.status, 'fail');
  });

  it('returns empty map for output with no TC patterns', () => {
    const output = ` ✓ some non-TC test (1ms)\n × another non-TC test (1ms)`;
    const result = parseVitestOutput(output);
    assert.equal(result.size, 0);
  });

  it('fail wins when one TC id appears as both pass and fail (no masked failure)', () => {
    const output = [
      ` ✓ TC-001: case A (2ms)`,
      ` × TC-001: case B fails (1ms)`,
    ].join('\n');
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-001')?.status, 'fail');
    assert.equal(result.size, 1);
  });

  it('does not misread a fail whose title contains a ✓ glyph as a pass', () => {
    const result = parseVitestOutput(` × TC-001f: rejects the ✓ marker (1ms)`);
    assert.equal(result.get('TC-001f')?.status, 'fail');
  });

  it('detects alphanumeric TC id (TC-020b) in Vitest output', () => {
    const output = ` ✓ TC-020b: 375px viewport no scroll (2ms)`;
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-020b')?.status, 'pass');
  });

  it('captures error context in notes for failing TC', () => {
    const output = [
      ` × TC-005: rejects invalid token (1ms)`,
      `   AssertionError: Expected 401 but got 200`,
    ].join('\n');
    const result = parseVitestOutput(output);
    assert.ok(result.get('TC-005')?.notes.includes('AssertionError'));
  });

  it('detects multi-segment namespaced TC (TC-FE-001h) in Vitest output', () => {
    const output = ` ✓ TC-FE-001h: threshold absent (2ms)`;
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-FE-001h')?.status, 'pass');
  });

});

describe('parsePlaywrightOutput()', () => {

  it('detects passing TC from ✓ (U+2713) Playwright line', () => {
    const output = `  ✓  1 tests/e2e/sales-tracker.spec.js › TC-021: Full flow (1.23s)`;
    const result = parsePlaywrightOutput(output);
    assert.equal(result.get('TC-021')?.status, 'pass');
  });

  it('detects failing TC from ✗ Playwright line', () => {
    const output = `  ✗  2 tests/e2e/sales-tracker.spec.js › TC-022: Deal persists (0.5s)`;
    const result = parsePlaywrightOutput(output);
    assert.equal(result.get('TC-022')?.status, 'fail');
  });

  it('detects multiple TCs from multi-line Playwright output', () => {
    const output = [
      `  ✓  1 tests/e2e/sales-tracker.spec.js › TC-021: Full flow (1.2s)`,
      `  ✓  2 tests/e2e/sales-tracker.spec.js › TC-022: Deal persists (0.8s)`,
      `  ✗  3 tests/e2e/sales-tracker.spec.js › TC-023: Stage change (0.4s)`,
    ].join('\n');
    const result = parsePlaywrightOutput(output);
    assert.equal(result.get('TC-021')?.status, 'pass');
    assert.equal(result.get('TC-022')?.status, 'pass');
    assert.equal(result.get('TC-023')?.status, 'fail');
  });

  it('fail wins when one TC id appears as both pass and fail (no masked failure)', () => {
    const output = [
      `  ✓  1 tests/e2e/sales-tracker.spec.js › TC-020: No scroll (0.3s)`,
      `  ✗  2 tests/e2e/sales-tracker.spec.js › TC-020: No scroll retry fails (0.1s)`,
    ].join('\n');
    const result = parsePlaywrightOutput(output);
    assert.equal(result.get('TC-020')?.status, 'fail');
    assert.equal(result.size, 1);
  });

  it('returns empty map for output with no TC patterns', () => {
    const output = `  ✓  1 tests/e2e/sales-tracker.spec.js › Full flow — no TC tag (1.0s)`;
    const result = parsePlaywrightOutput(output);
    assert.equal(result.size, 0);
  });

  it('detects alphanumeric TC id (TC-020b) in Playwright output', () => {
    const output = `  ✓  3 tests/e2e/sales-tracker.spec.js › TC-020b: 375px viewport (0.5s)`;
    const result = parsePlaywrightOutput(output);
    assert.equal(result.get('TC-020b')?.status, 'pass');
  });

  it('detects multi-segment namespaced TC (TC-FE-001h) in Playwright output', () => {
    const output = `  ✓  4 tests/e2e/fe.spec.js › TC-FE-001h: threshold absent (0.3s)`;
    const result = parsePlaywrightOutput(output);
    assert.equal(result.get('TC-FE-001h')?.status, 'pass');
  });

});

// ── parseGoOutput (alpha.8) ──────────────────────────────────────────────────
//
// Fixture captured from a real `go test -v` run on 2026-04-28 against a
// synthetic module in /tmp/aitri-go-fixture covering: passing tests, failing
// tests, skipped tests, parent-with-subtests, and a non-TC test that must NOT
// be detected. The fixture is what alpha.8's parseGoOutput consumes.
//
// Per ADR-029: tests assert that the parser produces the same result a
// downstream consumer (here, cmdVerifyRun's results-aggregation logic) would
// require — not that the output matches a string the test author chose.

describe('parseGoOutput() — alpha.8', () => {

  // Verbose `go test -v` output. Subtests are 4-space-indented to match Go's
  // actual format. Parent test reports FAIL when any subtest fails.
  const verboseFixture = [
    '=== RUN   TestTC_NM_001h',
    '--- PASS: TestTC_NM_001h (0.00s)',
    '=== RUN   TestTC_NM_002f',
    '--- PASS: TestTC_NM_002f (0.00s)',
    '=== RUN   TestTC_NM_003e',
    '    sample_test.go:23: intentional fail to capture parser output',
    '--- FAIL: TestTC_NM_003e (0.00s)',
    '=== RUN   TestTC_NM_004h',
    '    sample_test.go:29: skipped on purpose',
    '--- SKIP: TestTC_NM_004h (0.00s)',
    '=== RUN   TestPlainNoMarker',
    '--- PASS: TestPlainNoMarker (0.00s)',
    '=== RUN   TestTC_NM_005h',
    '=== RUN   TestTC_NM_005h/inner_a',
    '=== RUN   TestTC_NM_005h/inner_b',
    '    sample_test.go:46: inner failure',
    '--- FAIL: TestTC_NM_005h (0.00s)',
    '    --- PASS: TestTC_NM_005h/inner_a (0.00s)',
    '    --- FAIL: TestTC_NM_005h/inner_b (0.00s)',
    'FAIL',
    'FAIL\taitri-go-fixture\t0.524s',
    'FAIL',
  ].join('\n');

  it('detects pass and normalizes underscores → dashes (TC_NM_001h → TC-NM-001h)', () => {
    const result = parseGoOutput(verboseFixture);
    assert.equal(result.get('TC-NM-001h')?.status, 'pass');
    assert.equal(result.get('TC-NM-002f')?.status, 'pass');
  });

  it('detects fail with assertion context captured from preceding indented lines', () => {
    const result = parseGoOutput(verboseFixture);
    const e = result.get('TC-NM-003e');
    assert.equal(e?.status, 'fail');
    assert.ok(e?.notes.includes('intentional fail'),
      `expected assertion context in notes, got: ${e?.notes}`);
  });

  it('detects skip', () => {
    const result = parseGoOutput(verboseFixture);
    assert.equal(result.get('TC-NM-004h')?.status, 'skip');
  });

  it('reports parent test as fail when subtests fail (top-level only, subtests excluded)', () => {
    const result = parseGoOutput(verboseFixture);
    assert.equal(result.get('TC-NM-005h')?.status, 'fail');
    // Subtests must NOT appear as separate entries
    for (const id of result.keys()) {
      assert.ok(!id.includes('inner_'), `subtest leaked into results: ${id}`);
      assert.ok(!id.includes('/'),       `subtest leaked into results: ${id}`);
    }
  });

  it('ignores non-TC tests (TestPlainNoMarker, TestTCPConnection)', () => {
    const result = parseGoOutput(verboseFixture);
    assert.ok(!result.has('PlainNoMarker'),       'TestPlainNoMarker must not be detected');
    // Confirm against TCPConnection-style false positive
    const r2 = parseGoOutput('--- PASS: TestTCPConnection (0.00s)');
    assert.equal(r2.size, 0, 'TestTCPConnection (no separator before digits) must not be detected');
  });

  it('returns 5 TCs (PASS + PASS + FAIL + SKIP + FAIL parent) — no subtests, no PlainNoMarker', () => {
    const result = parseGoOutput(verboseFixture);
    assert.equal(result.size, 5,
      `expected 5 entries, got ${result.size}: ${[...result.keys()].join(', ')}`);
    assert.deepEqual(
      [...result.keys()].sort(),
      ['TC-NM-001h', 'TC-NM-002f', 'TC-NM-003e', 'TC-NM-004h', 'TC-NM-005h'].sort(),
    );
  });

  it('non-verbose go test output (FAIL only) — pass-only run reports nothing detected', () => {
    // Without -v, `go test ./...` only emits failures. A passing-only run has
    // no `--- PASS:` lines — verify-complete will block on 0 passing tests, which
    // is the correct signal to the operator that they need -v.
    const nonVerbosePass = 'ok\taitri-go-fixture\t0.001s';
    const result = parseGoOutput(nonVerbosePass);
    assert.equal(result.size, 0, 'non-verbose pass-only output produces no detections (expected)');
  });

  it('non-verbose with failure — only FAIL lines visible, parser still detects them', () => {
    // Without -v Go does emit `--- FAIL:` lines (even when -v absent).
    const nonVerboseFail = [
      '--- FAIL: TestTC_NM_003e (0.00s)',
      '    sample_test.go:23: intentional fail',
      'FAIL',
    ].join('\n');
    const result = parseGoOutput(nonVerboseFail);
    assert.equal(result.get('TC-NM-003e')?.status, 'fail');
  });

  it('handles namespaced TC ids (TC_FE_NM_001h → TC-FE-NM-001h)', () => {
    const out = '--- PASS: TestTC_FE_NM_001h (0.00s)';
    const result = parseGoOutput(out);
    assert.equal(result.get('TC-FE-NM-001h')?.status, 'pass');
  });

  it('does not false-match outputs from other runners (no "--- PASS:" pattern)', () => {
    // Vitest output
    assert.equal(parseGoOutput('  ✓ TC-001: works (1ms)').size, 0);
    // pytest output
    assert.equal(parseGoOutput('tests/foo.py::test_TC_001h_x PASSED').size, 0);
    // Playwright
    assert.equal(parseGoOutput('  ✓  1 tests/e2e/x.spec.js › TC-021: ok (1s)').size, 0);
    // node:test
    assert.equal(parseGoOutput('  ✔ TC-001: ok (1ms)').size, 0);
  });

  it('other parsers do not false-match Go output (regression guard)', () => {
    // Confirms isolation: existing parsers see the Go fixture and detect nothing
    assert.equal(parseRunnerOutput(verboseFixture).size, 0,  'parseRunnerOutput must not detect Go output');
    assert.equal(parseVitestOutput(verboseFixture).size, 0,  'parseVitestOutput must not detect Go output');
    assert.equal(parsePytestOutput(verboseFixture).size, 0,  'parsePytestOutput must not detect Go output');
    assert.equal(parsePlaywrightOutput(verboseFixture).size, 0, 'parsePlaywrightOutput must not detect Go output');
  });
});

describe('buildACCoverage() — AC-level traceability (ADR-041 option A)', () => {
  const requirements = {
    user_stories: [
      { id: 'US-001', requirement_id: 'FR-001', acceptance_criteria: [
        { id: 'AC-001', text: 'under the limit passes' },
        { id: 'AC-002', text: 'over the limit is rejected' },
        { id: 'AC-003', text: 'exactly at the limit (edge)' },   // no TC will reference this
      ] },
    ],
  };
  const testCases = [
    { id: 'TC-001', requirement_id: 'FR-001', ac_id: 'AC-001' },
    { id: 'TC-002', requirement_id: 'FR-001', ac_id: 'AC-002' },
  ];

  it('returns [] when no structured AC ids are declared (additive skip)', () => {
    assert.deepEqual(buildACCoverage([], [], {}), []);
    assert.deepEqual(
      buildACCoverage([], [], { user_stories: [{ requirement_id: 'FR-001', acceptance_criteria: ['plain string'] }] }),
      [],
    );
  });

  it('flags an acceptance criterion that no TC references as "untested"', () => {
    const results = [{ tc_id: 'TC-001', status: 'pass' }, { tc_id: 'TC-002', status: 'pass' }];
    const cov = buildACCoverage(results, testCases, requirements);
    const ac3 = cov.find(a => a.ac_id === 'AC-003');
    assert.equal(ac3?.status, 'untested', 'an AC with no test must be flagged untested');
    assert.equal(ac3?.fr_id, 'FR-001', 'AC maps to its FR via the user story');
  });

  it('marks an AC covered when its TC passes, uncovered when it fails', () => {
    const results = [{ tc_id: 'TC-001', status: 'pass' }, { tc_id: 'TC-002', status: 'fail' }];
    const cov = buildACCoverage(results, testCases, requirements);
    assert.equal(cov.find(a => a.ac_id === 'AC-001')?.status, 'covered');
    assert.equal(cov.find(a => a.ac_id === 'AC-002')?.status, 'uncovered');
  });

  it('accepts both {id,text} and {id,description} AC shapes', () => {
    const reqs = { user_stories: [{ requirement_id: 'FR-001', acceptance_criteria: [{ id: 'AC-001', description: 'desc form' }] }] };
    const cov = buildACCoverage([{ tc_id: 'TC-001', status: 'pass' }], [{ id: 'TC-001', ac_id: 'AC-001' }], reqs);
    assert.equal(cov.find(a => a.ac_id === 'AC-001')?.status, 'covered');
  });
});

describe('buildFRCoverage()', () => {

  const testCases = [
    { id: 'TC-001', requirement_id: 'FR-001' },
    { id: 'TC-002', requirement_id: 'FR-001' },
    { id: 'TC-003', requirement_id: 'FR-002' },
  ];
  const frIds = ['FR-001', 'FR-002'];

  it('covered when all TCs for FR pass', () => {
    const results = [
      { tc_id: 'TC-001', status: 'pass' },
      { tc_id: 'TC-002', status: 'pass' },
      { tc_id: 'TC-003', status: 'pass' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.status, 'covered');
    assert.equal(coverage.find(f => f.fr_id === 'FR-002')?.status, 'covered');
  });

  it('uncovered when all TCs for FR fail', () => {
    const results = [
      { tc_id: 'TC-001', status: 'fail' },
      { tc_id: 'TC-002', status: 'fail' },
      { tc_id: 'TC-003', status: 'pass' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.status, 'uncovered');
  });

  it('partial when some TCs pass and some fail', () => {
    const results = [
      { tc_id: 'TC-001', status: 'pass' },
      { tc_id: 'TC-002', status: 'fail' },
      { tc_id: 'TC-003', status: 'pass' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.status, 'partial');
  });

  it('partial when all TCs for FR are skipped', () => {
    const results = [
      { tc_id: 'TC-001', status: 'skip' },
      { tc_id: 'TC-002', status: 'skip' },
      { tc_id: 'TC-003', status: 'pass' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.status, 'partial');
  });

  it('counts passing tests correctly', () => {
    const results = [
      { tc_id: 'TC-001', status: 'pass' },
      { tc_id: 'TC-002', status: 'pass' },
      { tc_id: 'TC-003', status: 'fail' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.tests_passing, 2);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.tests_failing, 0);
    assert.equal(coverage.find(f => f.fr_id === 'FR-002')?.tests_failing, 1);
  });

  it('includes all FR ids in output even with no TCs', () => {
    const coverage = buildFRCoverage([], [], ['FR-001', 'FR-002', 'FR-003']);
    assert.equal(coverage.length, 3);
  });

  it('manual status when all TCs for FR are manual', () => {
    const results = [
      { tc_id: 'TC-001', status: 'manual' },
      { tc_id: 'TC-002', status: 'manual' },
      { tc_id: 'TC-003', status: 'pass' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.status, 'manual');
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.tests_manual, 2);
    assert.equal(coverage.find(f => f.fr_id === 'FR-002')?.status, 'covered');
  });

  it('manual TCs do not count as skipped in fr_coverage', () => {
    const results = [
      { tc_id: 'TC-001', status: 'manual' },
      { tc_id: 'TC-002', status: 'pass' },
      { tc_id: 'TC-003', status: 'pass' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.tests_skipped, 0);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.tests_manual, 1);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.status, 'covered');
  });

  it('mixed manual+skip produces partial (not manual) status', () => {
    const results = [
      { tc_id: 'TC-001', status: 'manual' },
      { tc_id: 'TC-002', status: 'skip' },
      { tc_id: 'TC-003', status: 'pass' },
    ];
    const coverage = buildFRCoverage(results, testCases, frIds);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.status, 'partial');
  });

  it('supports multi-FR TCs via frs array', () => {
    const tcs = [{ id: 'TC-001', frs: ['FR-001', 'FR-002'] }];
    const results = [{ tc_id: 'TC-001', status: 'pass' }];
    const coverage = buildFRCoverage(results, tcs, ['FR-001', 'FR-002']);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.tests_passing, 1);
    assert.equal(coverage.find(f => f.fr_id === 'FR-002')?.tests_passing, 1);
  });

  it('legacy schema with only "requirement" produces empty mapping (A2 trap)', () => {
    // Regression: pre-v0.1.x schema used "requirement" (string). Without the verify-run
    // precondition, buildFRCoverage would produce all-zeros and overwrite 04_TEST_RESULTS.json.
    const legacyTcs = [{ id: 'TC-001', requirement: 'FR-001' }];
    const results = [{ tc_id: 'TC-001', status: 'pass' }];
    const coverage = buildFRCoverage(results, legacyTcs, ['FR-001']);
    assert.equal(coverage.find(f => f.fr_id === 'FR-001')?.tests_passing, 0);
  });

});

describe('BUG-3 regression — flagValue null vs undefined', () => {

  it('parseFloat(null) is NaN — confirms the root cause', () => {
    // flagValue returns null when a flag is absent (not undefined)
    // Old check: rawThreshold !== undefined → true for null → parseFloat(null) = NaN → coverage injected
    // Fix: rawThreshold !== null && rawThreshold !== undefined
    const rawThreshold = null; // what flagValue returns when --coverage-threshold is absent
    assert.ok(Number.isNaN(parseFloat(rawThreshold)), 'parseFloat(null) must be NaN');
    // The correct guard:
    const coverageThreshold = rawThreshold !== null && rawThreshold !== undefined ? parseFloat(rawThreshold) : null;
    assert.equal(coverageThreshold, null, 'fixed guard returns null — no coverage injection');
  });

  it('valid threshold string is parsed correctly with fixed guard', () => {
    const rawThreshold = '80';
    const coverageThreshold = rawThreshold !== null && rawThreshold !== undefined ? parseFloat(rawThreshold) : null;
    assert.equal(coverageThreshold, 80);
  });

});

describe('scanTestContent()', () => {

  it('flags TC with 0 assertions as low confidence', () => {
    const content = `it('TC-001: test', () => {\n  // @aitri-tc TC-001\n});`;
    const result = scanTestContent(content, 'tests/unit.test.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].tc_id, 'TC-001');
    assert.equal(result[0].assertCount, 0);
  });

  it('flags TC with 1 assertion as low confidence', () => {
    const content = `it('TC-002: test', () => {\n  // @aitri-tc TC-002\n  assert.ok(true);\n});`;
    const result = scanTestContent(content, 'tests/unit.test.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].assertCount, 1);
  });

  it('does not flag TC with 2 assertions', () => {
    const content = `it('TC-003: test', () => {\n  // @aitri-tc TC-003\n  assert.equal(add(1,2), 3);\n  assert.throws(() => add('a',1));\n});`;
    const result = scanTestContent(content, 'tests/unit.test.js');
    assert.equal(result.length, 0);
  });

  it('returns file path in result', () => {
    const content = `it('TC-001: test', () => {\n  // @aitri-tc TC-001\n});`;
    const result = scanTestContent(content, 'tests/unit.test.js');
    assert.equal(result[0].file, 'tests/unit.test.js');
  });

  // Marker extraction uses the shared canonical grammar — a namespaced id must
  // not be truncated at the second hyphen (was TC-E2E-001h → TC-E2E, which named
  // the wrong TC in the assertion-density report). Same SSoT as extractTCId.
  it('captures a namespaced marker id in full (TC-E2E-001h, not TC-E2E)', () => {
    const content = `test('TC-E2E-001h: flow', () => {\n  // @aitri-tc TC-E2E-001h\n});`;
    const result = scanTestContent(content, 'tests/e2e.test.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].tc_id, 'TC-E2E-001h');
  });

  it('normalizes an underscore marker id to canonical form (pytest)', () => {
    const content = `def test_x():\n    # @aitri-tc TC_API_010f\n    pass`;
    const result = scanTestContent(content, 'tests/test_x.py');
    assert.equal(result[0].tc_id, 'TC-API-010f');
  });

  it('returns empty array when no @aitri-tc markers present', () => {
    const content = `it('some test', () => {\n  assert.ok(true);\n});`;
    const result = scanTestContent(content, 'tests/unit.test.js');
    assert.equal(result.length, 0);
  });

  it('counts expect() calls as assertions', () => {
    const content = `it('TC-004: test', () => {\n  // @aitri-tc TC-004\n  expect(fn()).toBe(1);\n  expect(fn()).toBe(2);\n});`;
    const result = scanTestContent(content, 'tests/unit.test.js');
    assert.equal(result.length, 0);
  });

  it('detects multiple low-confidence TCs in same file', () => {
    const content = [
      `it('TC-001: a', () => { // @aitri-tc TC-001\n});`,
      `it('TC-002: b', () => { // @aitri-tc TC-002\n});`,
    ].join('\n');
    const result = scanTestContent(content, 'tests/unit.test.js');
    assert.equal(result.length, 2);
  });

  it('detects Python-style # @aitri-tc markers', () => {
    const content = `def test_TC_001_description():\n    # @aitri-tc TC-001\n    pass`;
    const result = scanTestContent(content, 'tests/test_unit.py');
    assert.equal(result.length, 1);
    assert.equal(result[0].tc_id, 'TC-001');
  });

  it('counts Python assert statements as assertions', () => {
    const content = `def test_TC_002_description():\n    # @aitri-tc TC-002\n    assert result == expected\n    assert len(items) > 0`;
    const result = scanTestContent(content, 'tests/test_unit.py');
    assert.equal(result.length, 0);
  });

  it('supports alphanumeric TC IDs (e.g. TC-001b) with # marker', () => {
    const content = `def test_TC_001b():\n    # @aitri-tc TC-001b\n    pass`;
    const result = scanTestContent(content, 'tests/test_unit.py');
    assert.equal(result.length, 1);
    assert.equal(result[0].tc_id, 'TC-001b');
  });

});

describe('parseCoverageOutput()', () => {

  it('extracts line coverage from node coverage table', () => {
    const output = ` all files      |  95.24 |    90.00 |  100.00 |\n`;
    assert.equal(parseCoverageOutput(output), 95.24);
  });

  it('returns null when no coverage data found', () => {
    assert.equal(parseCoverageOutput('no coverage here'), null);
  });

  it('handles 100% coverage', () => {
    const output = `all files | 100.00 | 100.00 | 100.00 |`;
    assert.equal(parseCoverageOutput(output), 100);
  });

  it('handles low coverage value', () => {
    const output = `all files      |  42.50 |    30.00 |  60.00 |`;
    assert.equal(parseCoverageOutput(output), 42.50);
  });

  it('is case-insensitive for all files row', () => {
    const output = `All Files      |  80.00 |    75.00 |  90.00 |`;
    assert.equal(parseCoverageOutput(output), 80.00);
  });

  // C1 (rc.9) — stack-agnostic coverage parsing
  it('extracts go test -cover coverage', () => {
    const output = `ok  \texample/pkg\t0.012s\ncoverage: 87.5% of statements\n`;
    assert.equal(parseCoverageOutput(output), 87.5);
  });

  it('extracts pytest-cov TOTAL row coverage', () => {
    const output =
      `Name        Stmts   Miss  Cover\n` +
      `-------------------------------\n` +
      `app.py        100     20    80%\n` +
      `-------------------------------\n` +
      `TOTAL         100     20    80%\n`;
    assert.equal(parseCoverageOutput(output), 80);
  });

  it('istanbul table wins over a stray percent elsewhere', () => {
    const output = `Something 50% done\nall files | 95.24 | 90 | 100 |\n`;
    assert.equal(parseCoverageOutput(output), 95.24);
  });

  it('handles null/empty output', () => {
    assert.equal(parseCoverageOutput(''), null);
    assert.equal(parseCoverageOutput(null), null);
  });

});

describe('injectCoverageFlag() — C1 stack-agnostic coverage instrumentation', () => {

  it('node ≥22 uses --coverage', () => {
    const { cmd, tool } = injectCoverageFlag('node --test test/', 22);
    assert.equal(cmd, 'node --coverage --test test/');
    assert.equal(tool, '--coverage');
  });

  it('node <22 uses --experimental-test-coverage', () => {
    const { cmd, tool } = injectCoverageFlag('node --test test/', 20);
    assert.equal(cmd, 'node --experimental-test-coverage --test test/');
    assert.equal(tool, '--experimental-test-coverage');
  });

  it('node: does not double-inject when coverage flag already present', () => {
    const { cmd } = injectCoverageFlag('node --coverage --test test/', 22);
    assert.equal(cmd, 'node --coverage --test test/');
  });

  it('go test gets -cover', () => {
    const { cmd, tool } = injectCoverageFlag('go test ./... -v', 22);
    assert.equal(cmd, 'go test -cover ./... -v');
    assert.equal(tool, 'go -cover');
  });

  it('go test: no double -cover', () => {
    const { cmd } = injectCoverageFlag('go test -cover ./...', 22);
    assert.equal(cmd, 'go test -cover ./...');
  });

  it('pytest gets --cov (incl. venv-resolved binary path)', () => {
    const { cmd, tool } = injectCoverageFlag('/proj/.venv/bin/pytest -v', 22);
    assert.equal(cmd, '/proj/.venv/bin/pytest -v --cov=. --cov-report=term');
    assert.equal(tool, 'pytest-cov');
  });

  it('jest gets --coverage', () => {
    assert.equal(injectCoverageFlag('jest --verbose', 22).tool, 'jest --coverage');
    assert.match(injectCoverageFlag('jest --verbose', 22).cmd, /--coverage$/);
  });

  it('vitest gets --coverage', () => {
    assert.equal(injectCoverageFlag('vitest run', 22).tool, 'vitest --coverage');
  });

  it('unrecognized runner returns tool=null and unchanged cmd', () => {
    const { cmd, tool } = injectCoverageFlag('cargo test', 22);
    assert.equal(tool, null);
    assert.equal(cmd, 'cargo test');
  });

});

describe('parsePytestOutput()', () => {

  it('detects passing TC from pytest -v PASSED line', () => {
    const output = `tests/test_foo.py::test_TC_001h_env_example_exists PASSED`;
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-001h')?.status, 'pass');
  });

  it('detects failing TC from pytest -v FAILED line', () => {
    const output = `tests/test_foo.py::test_TC_002f_no_tracked_file FAILED`;
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-002f')?.status, 'fail');
  });

  it('normalizes TC_XXX underscore to TC-XXX hyphen', () => {
    const output = `tests/test_foo.py::test_TC_003h_requirements_deleted PASSED`;
    const result = parsePytestOutput(output);
    assert.ok(result.has('TC-003h'), 'TC_003h should be normalized to TC-003h');
    assert.equal(result.get('TC-003h')?.status, 'pass');
  });

  it('detects TC-XXX with hyphen directly in test name', () => {
    const output = `tests/test_foo.py::TC-004h_ci_coverage PASSED`;
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-004h')?.status, 'pass');
  });

  it('detects multiple TCs from multi-line pytest -v output', () => {
    const output = [
      `tests/test_foo.py::test_TC_001h_exists PASSED`,
      `tests/test_foo.py::test_TC_002h_gitignore PASSED`,
      `tests/test_foo.py::test_TC_003f_no_requirements FAILED`,
    ].join('\n');
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-001h')?.status, 'pass');
    assert.equal(result.get('TC-002h')?.status, 'pass');
    assert.equal(result.get('TC-003f')?.status, 'fail');
  });

  it('captures AssertionError context from lines following FAILED', () => {
    const output = [
      `tests/test_foo.py::test_TC_005f_ruff_check FAILED`,
      `E   AssertionError: ruff format --check exits 0 but expected 1`,
      `E   assert 0 != 0`,
    ].join('\n');
    const result = parsePytestOutput(output);
    assert.ok(result.get('TC-005f')?.notes.includes('AssertionError'));
  });

  it('captures E-prefixed error lines from pytest short output', () => {
    const output = [
      `FAILED tests/test_foo.py::test_TC_004f_threshold - AssertionError: threshold not enforced`,
    ].join('\n');
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-004f')?.status, 'fail');
  });

  it('fail wins when one TC id appears as both pass and fail (parametrized, no masked failure)', () => {
    // The canonical real case: pytest parametrize prints one line per case,
    // all sharing the function name → one TC id. A failing case must not be
    // masked by a passing one that printed first.
    const output = [
      `tests/test_foo.py::test_TC_001h_x[case0] PASSED`,
      `tests/test_foo.py::test_TC_001h_x[case1] FAILED`,
    ].join('\n');
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-001h')?.status, 'fail');
    assert.equal(result.size, 1);
  });

  it('returns empty map for output with no TC patterns', () => {
    const output = [
      `tests/test_foo.py::test_some_unrelated_function PASSED`,
      `tests/test_foo.py::test_another_test FAILED`,
    ].join('\n');
    const result = parsePytestOutput(output);
    assert.equal(result.size, 0);
  });

  it('ignores lines with TC pattern but no PASSED/FAILED marker', () => {
    const output = `collecting ... tests/test_foo.py::test_TC_001h_env COLLECTED`;
    const result = parsePytestOutput(output);
    assert.equal(result.size, 0);
  });

  it('detects multi-segment namespaced TC (TC-FE-001h) in pytest function names', () => {
    const output = `tests/test_frontend_remediation.py::test_TC_FE_001h_threshold_120_absent PASSED`;
    const result = parsePytestOutput(output);
    assert.ok(result.has('TC-FE-001h'), 'TC_FE_001h should reconcile to TC-FE-001h');
    assert.equal(result.get('TC-FE-001h')?.status, 'pass');
  });

  it('detects multi-segment namespaced TC failing', () => {
    const output = `tests/test_frontend_remediation.py::test_TC_FE_002f_no_excessive_blank FAILED`;
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-FE-002f')?.status, 'fail');
  });

  it('detects deep namespace TC (TC-API-USER-010f) in pytest function names', () => {
    const output = `tests/test_api.py::test_TC_API_USER_010f_auth_flow PASSED`;
    const result = parsePytestOutput(output);
    assert.ok(result.has('TC-API-USER-010f'), 'deep namespace should reconcile correctly');
    assert.equal(result.get('TC-API-USER-010f')?.status, 'pass');
  });

  it('normalizes all-lowercase pytest convention (test_tc_fe_001h) to uppercase namespace', () => {
    const output = `tests/test_foo.py::test_tc_fe_001h_threshold PASSED`;
    const result = parsePytestOutput(output);
    assert.ok(result.has('TC-FE-001h'), 'lowercase tc_fe should reconcile to TC-FE');
  });

});

describe('extractTCId()', () => {

  it('returns null when no TC pattern present', () => {
    assert.equal(extractTCId('no test case here'), null);
  });

  it('normalizes single-segment TC preserving lowercase suffix', () => {
    assert.equal(extractTCId('✔ TC-020b: foo'), 'TC-020b');
  });

  it('normalizes underscore-separated multi-segment to hyphen-separated', () => {
    assert.equal(extractTCId('test_TC_FE_001h_description'), 'TC-FE-001h');
  });

  it('preserves hyphen-separated multi-segment as-is', () => {
    assert.equal(extractTCId('TC-FE-001h: description'), 'TC-FE-001h');
  });

  it('uppercases lowercase namespace segments', () => {
    assert.equal(extractTCId('test_tc_fe_001h_foo'), 'TC-FE-001h');
  });

  it('handles deep namespaces', () => {
    assert.equal(extractTCId('test_TC_API_USER_010f_auth'), 'TC-API-USER-010f');
  });

  it('rejects TC prefix preceded by alphanumeric (no word boundary before)', () => {
    assert.equal(extractTCId('xTC-001h passes'), null);
  });

  // rc.3 — Hub canary 2026-05-13: TC-E2E-001h was returning null because
  // the namespace pattern only accepted letters (`[A-Za-z]+`). Real-world
  // namespaces include alphanumeric segments (E2E, V1, S3, …); the fix
  // requires the first char to be a letter and permits digits after it.
  it('handles namespace segments with digits (E2E, V1, S3)', () => {
    assert.equal(extractTCId('✔ TC-E2E-001h Collector-facing snapshot'), 'TC-E2E-001h');
    assert.equal(extractTCId('✔ TC-E2E-005h Legacy fallback'), 'TC-E2E-005h');
    assert.equal(extractTCId('  ✓  1 [chromium] › file.spec.js:5:1 › TC-V1-010h: desc (123ms)'), 'TC-V1-010h');
    assert.equal(extractTCId('test_TC_S3_BUCKET_042e_description'), 'TC-S3-BUCKET-042e');
  });

});

describe('cmdVerifyRun() — A2 schema precondition', () => {

  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-verify-a2-'));
  }

  function writeJSON(dir, rel, obj) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(obj, null, 2), 'utf8');
  }

  function seedLegacyProject(dir) {
    writeJSON(dir, '.aitri/config.json', {
      approvedPhases: [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      artifactsDir: 'spec',
      aitriVersion: '0.1.65',
    });
    writeJSON(dir, 'spec/04_BUILD_REPORT.json', {
      files_created: ['src/foo.js'],
      test_runner: 'node --test',
      test_files: [],
    });
    // Legacy schema: "requirement" (string), no requirement_id / frs
    writeJSON(dir, 'spec/03_TEST_CASES.json', {
      test_cases: [
        { id: 'TC-001', title: 'foo', requirement: 'FR-001' },
        { id: 'TC-002', title: 'bar', requirement: 'FR-001' },
      ],
    });
    writeJSON(dir, 'spec/01_REQUIREMENTS.json', {
      functional_requirements: [{ id: 'FR-001', title: 'foo', priority: 'must-have' }],
    });
    // Seed a pre-existing 04_TEST_RESULTS.json with valid coverage — guard must preserve it.
    writeJSON(dir, 'spec/04_TEST_RESULTS.json', {
      summary: { total: 2, passed: 2, failed: 0, skipped: 0 },
      results: [{ tc_id: 'TC-001', status: 'pass' }, { tc_id: 'TC-002', status: 'pass' }],
      fr_coverage: [{ fr_id: 'FR-001', tests_passing: 2, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' }],
    });
  }

  it('errors out before touching 04_TEST_RESULTS.json on legacy schema', () => {
    const dir = tmpDir();
    seedLegacyProject(dir);
    const priorResults = fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8');

    let errMsg = null;
    const err = (m) => { errMsg = m; throw new Error(m); };
    const flagValue = () => null;

    assert.throws(() => cmdVerifyRun({ dir, args: [], flagValue, err }), /legacy schema/);
    assert.match(errMsg, /requirement_id/);
    assert.match(errMsg, /frs/);

    // Critical: the pre-existing results must NOT have been overwritten.
    const afterResults = fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8');
    assert.equal(afterResults, priorResults);

    fs.rmSync(dir, { recursive: true, force: true });
  });

});

// ── Feature-context emission (alpha.6) ───────────────────────────────────────

describe('cmdVerifyRun() — feature-context cwd', () => {
  // Defect: Ultron alpha.6 canary saw 52 of 78 skipped tests come from the
  // parent project rather than the feature pipeline. Root cause: cmdVerifyRun
  // spawned the runner with `cwd: featureRoot || dir`, which in feature scope
  // is the parent project root. Test discovery then walked the parent's tree.
  // After the fix, cwd is `dir` (the feature subdirectory) — the runner reports
  // its own cwd and we assert it matches the feature dir, not the parent.
  it('runs the test command from the feature dir, not the parent', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-vr-fparent-'));
    const featureDir = path.join(parent, 'features', 'foo');
    try {
      fs.mkdirSync(featureDir, { recursive: true });

      // Runner records its cwd to a sibling file and emits one TC pass marker.
      const runner = path.join(featureDir, 'runner.js');
      fs.writeFileSync(
        runner,
        `import fs from 'node:fs';
fs.writeFileSync('cwd-snapshot.txt', process.cwd());
console.log('✔ TC-001 — runner ran in this cwd');
`,
        'utf8'
      );

      fs.mkdirSync(path.join(featureDir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(featureDir, '.aitri'), JSON.stringify({
        projectName: 'foo',
        artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4],
        completedPhases: [1, 2, 3, 4],
      }));
      fs.writeFileSync(path.join(featureDir, 'spec/04_BUILD_REPORT.json'),
        JSON.stringify({
          files_created: [{ path: 'runner.js' }],
          test_runner: 'node runner.js',
        }));
      fs.writeFileSync(path.join(featureDir, 'spec/03_TEST_CASES.json'), JSON.stringify({
        test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
      }));
      fs.writeFileSync(path.join(featureDir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
        functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
      }));

      // Suppress stdout/stderr from the runner during the test.
      const origLog = console.log; const origErr = process.stderr.write;
      console.log = () => {}; process.stderr.write = () => true;
      try {
        cmdVerifyRun({
          dir: featureDir,
          args: [],
          flagValue: () => null,
          err: (m) => { throw new Error(m); },
          featureRoot: parent,
          scopeName: 'foo',
        });
      } finally {
        console.log = origLog; process.stderr.write = origErr;
      }

      const cwdSnapshot = fs.readFileSync(path.join(featureDir, 'cwd-snapshot.txt'), 'utf8');
      assert.equal(fs.realpathSync(cwdSnapshot), fs.realpathSync(featureDir),
        `runner cwd must equal the feature dir; got ${cwdSnapshot}`);
      assert.notEqual(fs.realpathSync(cwdSnapshot), fs.realpathSync(parent),
        'runner must not have run from the parent project root');
    } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  });
});

describe('cmdVerifyRun() — feature-context emits prefixed approve hint on missing Phase 4', () => {
  it('feature scope: error message points to `aitri feature approve foo 4`', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-vr-fctx-'));
    try {
      fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
        projectName: 'F', artifactsDir: 'spec',
        approvedPhases: [], completedPhases: [],
      }));
      let captured = '';
      const err = (msg) => { captured = msg; throw new Error(msg); };
      try {
        cmdVerifyRun({
          dir, args: [], flagValue: () => null, err,
          featureRoot: '/parent', scopeName: 'foo',
        });
      } catch { /* expected */ }
      assert.ok(captured.includes('aitri feature approve foo 4'),
        `expected feature-prefixed approve hint, got: ${captured}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('root scope: error message points to `aitri approve 4` (regression guard)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-vr-rctx-'));
    try {
      fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
        projectName: 'R', artifactsDir: 'spec',
        approvedPhases: [], completedPhases: [],
      }));
      let captured = '';
      const err = (msg) => { captured = msg; throw new Error(msg); };
      try {
        cmdVerifyRun({ dir, args: [], flagValue: () => null, err });
      } catch { /* expected */ }
      assert.ok(!/aitri feature \w+ /.test(captured),
        'root context must not emit feature-prefixed command');
      assert.ok(captured.includes('aitri approve 4'),
        `expected root-style approve hint, got: ${captured}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Z1 (alpha.13): verify-run invalidates stale verifyPassed ─────────────────
//
// Defect: re-running verify-run with degraded results (all-skip or any failure)
// did not reset config.verifyPassed. Status / resume / validate continued to
// report "deployable: ready" while the latest verify-run was 0/0/N skipped.
// Surfaced by Zombite canary 2026-04-29 on alpha.12. Generalises to any project
// that re-runs verify-run after a code change without re-running verify-complete.
describe('cmdVerifyRun() — Z1 verifyPassed invalidation', () => {
  function seedProject(dir, opts = {}) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p',
      artifactsDir: 'spec',
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      verifyPassed:    opts.priorPassed ?? true,
      verifySummary:   opts.priorPassed === false ? undefined : { total: 5, passed: 5, failed: 0, skipped: 0 },
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: opts.testCases ?? [
        { id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' },
      ],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'runner.js' }],
      test_runner: opts.runner ?? 'node runner.js',
    }));
    fs.writeFileSync(path.join(dir, 'runner.js'), opts.runnerScript ?? '');
  }

  function readConfig(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
  }

  function silent(fn) {
    const origLog = console.log; const origErr = process.stderr.write;
    console.log = () => {}; process.stderr.write = () => true;
    try { return fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
  }

  it('all-skip results invalidate prior verifyPassed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z1-allskip-'));
    try {
      seedProject(dir, {
        runnerScript: '// no markers, no output',
      });
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      const cfg = readConfig(dir);
      assert.equal(cfg.verifyPassed, false, 'verifyPassed must reset after all-skip verify-run');
      assert.equal(cfg.verifySummary, undefined, 'verifySummary must be cleared');
      assert.ok(cfg.verifyRanAt, 'verifyRanAt must still be stamped');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // §3.4 round / §3.8 (rc.64 adopter): exit≠0 AND zero detected TCs means the suite
  // likely did NOT run (build/compile failure, crash, app holding the build output) —
  // not "all tests skipped". Surface it so the per-TC "rename your function" notes are
  // not mistaken for the real cause.
  it('§3.8 — warns when the runner exits non-zero AND detects no TCs (build/lock, not all-skip)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-buildfail-'));
    try {
      seedProject(dir, { runnerScript: 'process.exit(1);' }); // no output, non-zero exit
      let stderr = '';
      const origErr = process.stderr.write; const origLog = console.log;
      process.stderr.write = (c) => { stderr += c; return true; }; console.log = () => {};
      try {
        cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } });
      } catch { /* a non-zero run may err downstream; the warning is already on stderr */ }
      finally { process.stderr.write = origErr; console.log = origLog; }
      assert.match(stderr, /produced NO recognizable TC results/);
      assert.match(stderr, /did NOT run/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('rc.42 — warns when the runner exits non-zero but no TCs failed (exit-code divergence)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-divergence-'));
    try {
      // Runner reports a passing TC, then exits 1 (e.g. exits non-zero on skips).
      seedProject(dir, { runnerScript: "console.log('\\u2714 TC-001: ok (1ms)'); process.exit(1);" });
      let stderr = '';
      const origErr = process.stderr.write; const origLog = console.log;
      process.stderr.write = (c) => { stderr += c; return true; }; console.log = () => {};
      try {
        cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } });
      } finally { process.stderr.write = origErr; console.log = origLog; }
      assert.match(stderr, /exited 1 \(failure\) but no failing TCs were parsed/,
        'a non-zero exit with zero parsed failures must surface a divergence note');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not link TC-001h to TC-001H result via the case-insensitive fallback (C2)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-c2-'));
    try {
      // Two canonical ids differing only by suffix case; the runner only ran the
      // uppercase one. The lowercase one's test never ran → must be skip, not a
      // false pass borrowed from TC-001H.
      seedProject(dir, {
        testCases: [
          { id: 'TC-001h', title: 'lower', requirement_id: 'FR-001', expected_result: 'r' },
          { id: 'TC-001H', title: 'upper', requirement_id: 'FR-001', expected_result: 'r' },
        ],
        runnerScript: `console.log('✔ TC-001H — only this one ran');\n`,
      });
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      const results = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8')).results;
      const byId = Object.fromEntries(results.map(r => [r.tc_id, r.status]));
      assert.equal(byId['TC-001H'], 'pass', 'the id that actually ran passes');
      assert.equal(byId['TC-001h'], 'skip', 'the id that never ran must NOT borrow the other case’s pass');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('manual TC verified via tc verify counts as passed, not double-counted as manual (M2)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-m2-'));
    try {
      seedProject(dir, {
        testCases: [
          { id: 'TC-001', title: 'auto',   requirement_id: 'FR-001', expected_result: 'r' },
          { id: 'TC-002', title: 'manual', requirement_id: 'FR-001', expected_result: 'r', automation: 'manual' },
        ],
        runnerScript: `console.log('✔ TC-001 — runner ran');\n`,
      });
      // Prior run: the manual TC-002 was verified by a human as pass.
      fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
        results: [{ tc_id: 'TC-002', status: 'pass', verified_manually: true,
                    verified_at: '2026-01-01T00:00:00Z', notes: 'human checked' }],
      }));
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      const s = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8')).summary;
      // The bug counted TC-002 in both `manual` (declared) and `passed` (status).
      assert.equal(s.passed + s.failed + s.skipped + s.manual, s.total,
        'passed + failed + skipped + manual must equal total');
      assert.equal(s.passed, 2, 'TC-001 (auto) + TC-002 (manual-verified) both pass');
      assert.equal(s.manual, 0, 'no TC remains in manual status');
      assert.equal(s.manual_verified, 1, 'TC-002 still tracked as manual-verified');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('healthy results (passed > 0, failed === 0) preserve prior verifyPassed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z1-healthy-'));
    try {
      seedProject(dir, {
        runnerScript: `console.log('✔ TC-001 — runner ran');\n`,
      });
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      const cfg = readConfig(dir);
      assert.equal(cfg.verifyPassed, true, 'healthy verify-run must NOT reset verifyPassed');
      assert.ok(cfg.verifySummary, 'verifySummary must be preserved');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('any failure resets verifyPassed even with some passes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z1-fail-'));
    try {
      seedProject(dir, {
        testCases: [
          { id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' },
          { id: 'TC-002', title: 't', requirement_id: 'FR-001', expected_result: 'r' },
        ],
        runnerScript: `console.log('✔ TC-001 — pass');\nconsole.log('✖ TC-002 — fail');\nprocess.exit(1);\n`,
      });
      // Suppress prompt for bug registration in non-TTY (it returns early on no stdin TTY).
      silent(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }); }
        catch { /* runner exit-code 1 may surface, ignore */ }
      });
      const cfg = readConfig(dir);
      assert.equal(cfg.verifyPassed, false, 'failure in verify-run must reset verifyPassed');
      assert.equal(cfg.verifySummary, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not crash when verifyPassed was already false', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z1-already-false-'));
    try {
      seedProject(dir, {
        priorPassed: false,
        runnerScript: '// no markers',
      });
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      const cfg = readConfig(dir);
      assert.equal(cfg.verifyPassed, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── N1 sub-finding (alpha.16): runner ENOENT does NOT persist degraded ──────
//                              04_TEST_RESULTS.json or flip verifyPassed.
//
// Distinction: "runner crashed before producing output" vs "runner ran and
// produced bad results". The first case must be visible (clear error) but
// must NOT mutate the artifact / .aitri state — otherwise the operator sees
// a phantom regression (verify ❌, 0/N skipped) on a project where the test
// suite never executed. Surfaced by Cesar canary 2026-05-02 alongside N1:
// .venv-relative manifests on alpha.4 → alpha.15 upgrade trip ENOENT and the
// previous behaviour over-wrote 04_TEST_RESULTS.json + flipped verifyPassed.

describe('cmdVerifyRun() — runner ENOENT does not persist degraded results', () => {
  function seed(dir, runner) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      verifyPassed:    true,
      verifySummary:   { total: 1, passed: 1, failed: 0, skipped: 0 },
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'src/x.py' }],
      test_runner:   runner,
    }));
  }
  function silent(fn) {
    const origLog = console.log; const origErr = process.stderr.write;
    console.log = () => {}; process.stderr.write = () => true;
    try { return fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
  }

  it('does NOT write 04_TEST_RESULTS.json when runner is ENOENT', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-enoent-write-'));
    try {
      seed(dir, '.venv/bin/pytest tests/ -v');
      const errs = [];
      silent(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { errs.push(m); throw new Error(m); } }); }
        catch { /* err() throws, ignore */ }
      });
      assert.equal(fs.existsSync(path.join(dir, 'spec/04_TEST_RESULTS.json')), false,
        '04_TEST_RESULTS.json must NOT be written when runner failed to start');
      assert.ok(errs.some(m => /Command not found|ENOENT|runner/i.test(m)),
        'expected an err() message about the missing runner');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT flip verifyPassed when runner is ENOENT', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-enoent-flag-'));
    try {
      seed(dir, '.venv/bin/pytest tests/ -v');
      silent(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }); }
        catch { /* err() throws */ }
      });
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      assert.equal(cfg.verifyPassed, true,
        'verifyPassed must be preserved — the runner never ran, this is not a regression');
      assert.ok(cfg.verifySummary, 'verifySummary must be preserved');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('rc.5: ENOENT pytest hint leads with portable bare pytest and warns absolute is not CI-portable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-enoent-hint-'));
    try {
      seed(dir, '.venv/bin/pytest tests/ -v');
      const errs = [];
      silent(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { errs.push(m); throw new Error(m); } }); }
        catch { /* err() throws */ }
      });
      const msg = errs.find(m => /Command not found/.test(m)) || '';
      assert.match(msg, /bare/);
      assert.match(msg, /auto-detect/i);
      const barePos = msg.search(/bare\s+"?pytest/);
      const absPos  = msg.search(/absolute/);
      assert.ok(barePos !== -1 && absPos !== -1 && barePos < absPos,
        'portable bare-pytest fix must precede the absolute fallback');
      assert.match(msg, /will not work in CI|not .*portable|machine-specific/i);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('preserves a previously written 04_TEST_RESULTS.json on ENOENT', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-enoent-preserve-'));
    try {
      seed(dir, '.venv/bin/pytest tests/ -v');
      const prevResults = {
        executed_at: '2026-04-01T00:00:00.000Z',
        test_runner: 'old-runner',
        results: [{ tc_id: 'TC-001', status: 'pass' }],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      };
      fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify(prevResults));
      silent(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }); }
        catch { /* err() throws */ }
      });
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      assert.deepEqual(after, prevResults, 'previous results must be preserved verbatim');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── L2 (alpha.16): runtime mensajería neutral when no Playwright config ─────
//
// Pre-alpha.16 SKIP_NOTE always told the operator "E2E tests may also require
// a browser environment", and the skipped-e2e count was always labeled
// "e2e/browser" — both prescribe Playwright as the implied runner. On a
// project without playwright.config.{js,ts} the wording was misleading: the
// real fix is usually a missing @aitri-tc marker or the wrong runner, not a
// browser. Reword conditionally — "browser" only when the config is present.

describe('cmdVerifyRun() — L2 mensajería conditional on Playwright config', () => {
  function seed(dir, withPwConfig) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r', type: 'e2e' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'runner.js' }],
      test_runner:   'node runner.js',
    }));
    fs.writeFileSync(path.join(dir, 'runner.js'), '// no markers, all skip\n');
    if (withPwConfig) {
      fs.writeFileSync(path.join(dir, 'playwright.config.js'), 'export default {};\n');
    }
  }
  function captureStdout(fn) {
    let out = '';
    const origLog = console.log; const origErr = process.stderr.write;
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    process.stderr.write = () => true;
    try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
    return out;
  }

  it('with playwright.config.js: skip count uses "browser" label and SKIP_NOTE mentions browser', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-l2-pw-'));
    try {
      seed(dir, true);
      const out = captureStdout(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }); }
        catch { /* playwright not installed in this test env — ignore exit */ }
      });
      assert.match(out, /e2e\/browser/, 'expected "e2e/browser" label when playwright.config is present');
      const written = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      const skip = written.results.find(r => r.tc_id === 'TC-001');
      assert.match(skip.notes, /browser environment/, 'SKIP_NOTE must mention browser when pw config exists');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('without playwright.config: skip count uses neutral "e2e" label and SKIP_NOTE drops browser hint', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-l2-nopw-'));
    try {
      seed(dir, false);
      const out = captureStdout(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }); }
        catch { /* ignore */ }
      });
      assert.doesNotMatch(out, /e2e\/browser/, 'must NOT use "browser" wording without playwright.config');
      assert.match(out, /\b1 e2e\b|\(1 e2e,/, 'expected neutral "e2e" label');
      const written = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      const skip = written.results.find(r => r.tc_id === 'TC-001');
      assert.doesNotMatch(skip.notes, /browser/, 'SKIP_NOTE must NOT mention browser without pw config');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Z3 (alpha.13): verify-complete next-action respects phase 5 state ────────
//
// Defect: verify-complete always emitted "next: run-phase 5" regardless of
// whether phase 5 was already approved. When operator re-runs verify after a
// code change to a deployed product, the instruction contradicted resume /
// status. Surfaced by Zombite canary 2026-04-29.
describe('cmdVerifyComplete() — C2 strictAssertions gate', () => {
  function seed(dir, { strict, lowConfidence }) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
      ...(strict ? { strictAssertions: true } : {}),
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'x.js' }], test_runner: 'node --test',
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
      executed_at: new Date().toISOString(),
      test_runner: 'node --test',
      exit_code: 0,
      results: [{ tc_id: 'TC-001', status: 'pass' }],
      fr_coverage: [{ fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' }],
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      low_confidence_tcs: lowConfidence ? [{ tc_id: 'TC-001', file: 'x.test.js', assertCount: 1 }] : [],
    }));
  }

  it('blocks when strictAssertions ON and low_confidence_tcs non-empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-c2-block-'));
    try {
      seed(dir, { strict: true, lowConfidence: true });
      let msg = '';
      try { cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } }); }
      catch (e) { msg = e.message; }
      assert.match(msg, /strictAssertions is ON/);
      assert.match(msg, /TC-001/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  function runQuiet(fn) {
    const origLog = console.log; const origErr = process.stderr.write;
    console.log = () => {}; process.stderr.write = () => true;
    try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
  }

  it('does NOT block when strictAssertions ON but no low-confidence TCs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-c2-clean-'));
    try {
      seed(dir, { strict: true, lowConfidence: false });
      // err throws only on gate failure — reaching the end means the C2 gate passed
      assert.doesNotThrow(() => runQuiet(() =>
        cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT block when strictAssertions OFF even with low-confidence TCs (default)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-c2-default-'));
    try {
      seed(dir, { strict: false, lowConfidence: true });
      assert.doesNotThrow(() => runQuiet(() =>
        cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdVerifyComplete() — AC-level coverage gate (ADR-041 option A, rc.49)', () => {
  function seed(dir, acCoverage) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'MUST' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', ac_id: 'AC-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'x.js' }], test_runner: 'node --test',
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
      executed_at: new Date().toISOString(),
      test_runner: 'node --test',
      exit_code: 0,
      results: [{ tc_id: 'TC-001', status: 'pass' }],
      fr_coverage: [{ fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' }],
      ...(acCoverage ? { ac_coverage: acCoverage } : {}),
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      low_confidence_tcs: [],
    }));
  }
  function runQuiet(fn) {
    const origLog = console.log; const origErr = process.stderr.write;
    console.log = () => {}; process.stderr.write = () => true;
    try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
  }

  it('blocks when a declared acceptance criterion is untested', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ac-block-'));
    try {
      seed(dir, [
        { ac_id: 'AC-001', fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' },
        { ac_id: 'AC-002', fr_id: 'FR-001', tests_passing: 0, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'untested' },
      ]);
      let msg = '';
      try { runQuiet(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })); }
      catch (e) { msg = e.message; }
      assert.match(msg, /acceptance criterion\(s\) without a passing test/);
      assert.match(msg, /AC-002/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT block when every declared acceptance criterion is covered', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ac-clean-'));
    try {
      seed(dir, [
        { ac_id: 'AC-001', fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' },
      ]);
      assert.doesNotThrow(() => runQuiet(() =>
        cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('is a no-op when no structured ACs are declared (no ac_coverage field)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ac-none-'));
    try {
      seed(dir, null);   // string-AC / legacy project — verify-run wrote no ac_coverage
      assert.doesNotThrow(() => runQuiet(() =>
        cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// #2 (finance-dashboard canary 2026-06-05): verify-complete must hard-block only
// MUST FRs lacking a passing test (CLAUDE.md principle 8 + Phase 3 behavior) — a
// SHOULD/NICE FR with no passing test is warned, not blocked. Before this, EVERY FR
// was gated, dead-ending the deploy gate on a legal SHOULD/NICE FR.
describe('cmdVerifyComplete() — FR coverage gate is MUST-only (#2)', () => {
  // FR-001 MUST (covered), FR-002 SHOULD (uncovered), FR-003 NICE (uncovered).
  function seed(dir) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [
        { id: 'FR-001', title: 'core',  priority: 'MUST' },
        { id: 'FR-002', title: 'extra', priority: 'SHOULD' },
        { id: 'FR-003', title: 'nice',  priority: 'NICE' },
      ],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'x.js' }], test_runner: 'node --test',
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
      executed_at: new Date().toISOString(), test_runner: 'node --test', exit_code: 0,
      results: [{ tc_id: 'TC-001', status: 'pass' }],
      fr_coverage: [
        { fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' },
        { fr_id: 'FR-002', tests_passing: 0, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'partial' },
        { fr_id: 'FR-003', tests_passing: 0, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'partial' },
      ],
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      low_confidence_tcs: [],
    }));
  }
  function capture(fn) {
    let err = '';
    const origLog = console.log; const origErr = process.stderr.write;
    console.log = () => {}; process.stderr.write = (c) => { err += c; return true; };
    try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
    return err;
  }

  it('does NOT block when only SHOULD/NICE FRs are uncovered (MUST covered)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-must-only-'));
    try {
      seed(dir);
      assert.doesNotThrow(() => capture(() =>
        cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('warns about the uncovered SHOULD/NICE FRs instead of blocking', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-must-warn-'));
    try {
      seed(dir);
      const stderr = capture(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } }));
      assert.match(stderr, /SHOULD\/NICE FR\(s\) have no passing test/);
      assert.match(stderr, /FR-002/);
      assert.match(stderr, /FR-003/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('still hard-blocks when a MUST FR has no passing test', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-must-block-'));
    try {
      seed(dir);
      // Demote FR-001's coverage to zero passing → MUST gate must fire.
      const res = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      res.fr_coverage[0] = { fr_id: 'FR-001', tests_passing: 0, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'partial' };
      fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify(res));
      let msg = '';
      try { capture(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })); }
      catch (e) { msg = e.message; }
      assert.match(msg, /MUST FRs have zero passing tests/);
      assert.match(msg, /FR-001/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdVerifyComplete() — Z3 next-action respects phase 5 state', () => {
  function seedReady(dir, opts = {}) {
    const phase5Approved = opts.phase5Approved ?? false;
    const approved = phase5Approved ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases:  approved,
      completedPhases: approved,
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'x.js' }], test_runner: 'node --test',
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
      executed_at: new Date().toISOString(),
      test_runner: 'node --test',
      exit_code: 0,
      results: [{ tc_id: 'TC-001', status: 'pass' }],
      fr_coverage: [{ fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' }],
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
    }));
  }

  function captureLog(fn) {
    const lines = [];
    const origLog = console.log; const origErr = process.stderr.write;
    console.log = (...a) => { lines.push(a.join(' ')); };
    process.stderr.write = () => true;
    try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
    return lines.join('\n');
  }

  it('phase 5 NOT approved → emits "next: run-phase deploy" (regression guard)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z3-p5no-'));
    try {
      seedReady(dir, { phase5Approved: false });
      const out = captureLog(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } }));
      // Snapshot SSoT (alpha.19+): nextPhaseAction emits the alias form
      // (`run-phase deploy`) — both `5` and `deploy` resolve to phase 5.
      assert.match(out, /run-phase (5|deploy)/);
      assert.match(out, /PIPELINE INSTRUCTION/);
      assert.doesNotMatch(out, /aitri validate/);
      assert.doesNotMatch(out, /aitri reconcile/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('phase 5 approved (root scope) → emits "next: aitri validate"', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z3-p5yes-'));
    try {
      seedReady(dir, { phase5Approved: true });
      const out = captureLog(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } }));
      assert.match(out, /aitri validate/);
      // Snapshot reason — replaces alpha.13's "Phase 5 already approved" line.
      assert.match(out, /confirm deployment readiness/i);
      assert.doesNotMatch(out, /run-phase (5|deploy)/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reconcile pending (root scope) → "aitri reconcile" matches `aitri status` Next: line (alpha.19)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z3-norm-'));
    try {
      seedReady(dir, { phase5Approved: false });
      // Inject reconcile pending — the canonical case where alpha.13's
      // hardcoded if/else contradicted status. Status routes to priority 4
      // `aitri reconcile`; verify-complete used to override that with
      // run-phase 5. Snapshot SSoT consumption removes the contradiction.
      const cfgPath = path.join(dir, '.aitri');
      const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      config.reconcileState = { status: 'pending', baseRef: 'abc123', method: 'git', lastRun: new Date().toISOString() };
      fs.writeFileSync(cfgPath, JSON.stringify(config));

      const verifyOut = captureLog(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } }));
      const statusOut = captureLog(() => cmdStatus({ dir, args: [] }));

      // verify-complete must NOT push past reconcile to run-phase 5
      assert.doesNotMatch(verifyOut, /run-phase (5|deploy)/);
      // verify-complete and status both emit `aitri reconcile` as next
      assert.match(verifyOut, /aitri reconcile/);
      assert.match(statusOut, /Next: aitri reconcile/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('phase 5 approved (feature scope) → no PIPELINE INSTRUCTION, points to feature status', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z3-feat-'));
    try {
      seedReady(dir, { phase5Approved: true });
      const out = captureLog(() => cmdVerifyComplete({
        dir, err: (m) => { throw new Error(m); },
        featureRoot: '/parent', scopeName: 'foo',
      }));
      assert.doesNotMatch(out, /PIPELINE INSTRUCTION/);
      assert.match(out, /aitri feature status foo/);
      assert.doesNotMatch(out, /run-phase 5/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('phase 5 NOT approved (feature scope) → emits feature-prefixed run-phase 5 (regression guard)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-z3-feat-no-'));
    try {
      seedReady(dir, { phase5Approved: false });
      const out = captureLog(() => cmdVerifyComplete({
        dir, err: (m) => { throw new Error(m); },
        featureRoot: '/parent', scopeName: 'foo',
      }));
      assert.match(out, /aitri feature run-phase foo 5/);
      assert.match(out, /PIPELINE INSTRUCTION/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdVerifyComplete() — feature-context emits prefixed verify-run hint on missing results', () => {
  it('feature scope: error message points to `aitri feature verify-run foo`', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-vc-fctx-'));
    try {
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
        projectName: 'F', artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4], completedPhases: [],
      }));
      let captured = '';
      const err = (msg) => { captured = msg; throw new Error(msg); };
      try {
        cmdVerifyComplete({ dir, err, featureRoot: '/parent', scopeName: 'foo' });
      } catch { /* expected */ }
      assert.ok(captured.includes('aitri feature verify-run foo'),
        `expected feature-prefixed verify-run hint, got: ${captured}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdVerifyComplete() — e2e gate honours automation: "manual" and runner availability', () => {
  function seedE2EProject(dir, { e2eResultStatus, hasPlaywright = false } = {}) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [
        { id: 'TC-U1', title: 'unit', requirement_id: 'FR-001', type: 'unit', expected_result: 'r' },
        { id: 'TC-E1', title: 'e2e',  requirement_id: 'FR-001', type: 'e2e',  expected_result: 'r' },
      ],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'x.js' }], test_runner: 'node --test',
    }));
    const e2ePass = e2eResultStatus === 'pass' ? 1 : 0;
    const e2eMan  = e2eResultStatus === 'manual' ? 1 : 0;
    const e2eSkip = (e2eResultStatus === 'pass' || e2eResultStatus === 'manual') ? 0 : 1;
    // FR-001 always has the unit TC passing → never blocked by FR coverage gate;
    // e2e gate is what we're isolating in these tests.
    const tests_passing = 1 + e2ePass;
    const tests_manual  = e2eMan;
    const tests_skipped = e2eSkip;
    const frStatus = tests_passing > 0 ? 'covered' : 'partial';
    fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
      executed_at: new Date().toISOString(),
      test_runner: 'node --test',
      exit_code: 0,
      results: [
        { tc_id: 'TC-U1', status: 'pass', notes: 'ok' },
        { tc_id: 'TC-E1', status: e2eResultStatus, notes: e2eResultStatus === 'skip' ? 'no runner' : 'ok' },
      ],
      fr_coverage: [{
        fr_id: 'FR-001', tests_passing, tests_failing: 0,
        tests_skipped, tests_manual, status: frStatus,
      }],
      summary: { total: 2, passed: tests_passing, failed: 0, skipped: tests_skipped },
    }));
    if (hasPlaywright) {
      fs.writeFileSync(path.join(dir, 'playwright.config.js'), '// stub');
    }
  }

  it('blocks when e2e TC is skip and recommends automation:"manual" (no Playwright)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2e-skip-nopw-'));
    try {
      seedE2EProject(dir, { e2eResultStatus: 'skip', hasPlaywright: false });
      let captured = '';
      const err = (m) => { captured = m; throw new Error(m); };
      try { cmdVerifyComplete({ dir, err }); } catch { /* expected */ }
      assert.match(captured, /E2E tests required but none covered/);
      assert.match(captured, /No e2e runner detected/);
      assert.match(captured, /automation: "manual"/);
      assert.doesNotMatch(captured, /change their type/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('blocks when e2e TC is skip and recommends Playwright fixes (config present)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2e-skip-pw-'));
    try {
      seedE2EProject(dir, { e2eResultStatus: 'skip', hasPlaywright: true });
      let captured = '';
      const err = (m) => { captured = m; throw new Error(m); };
      try { cmdVerifyComplete({ dir, err }); } catch { /* expected */ }
      assert.match(captured, /Playwright config detected but no e2e TC passed/);
      assert.match(captured, /npx playwright install/);
      assert.doesNotMatch(captured, /change their type/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('passes the e2e gate when the TC has status:"manual" (automation: "manual")', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2e-manual-'));
    try {
      seedE2EProject(dir, { e2eResultStatus: 'manual', hasPlaywright: false });
      let captured = '';
      const err = (m) => { captured = m; throw new Error(m); };
      try { cmdVerifyComplete({ dir, err }); } catch { /* may fail later checks; only assert e2e gate not hit */ }
      assert.doesNotMatch(captured, /E2E tests required but none covered/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('passes the e2e gate when the TC has status:"pass"', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2e-pass-'));
    try {
      seedE2EProject(dir, { e2eResultStatus: 'pass', hasPlaywright: true });
      let captured = '';
      const err = (m) => { captured = m; throw new Error(m); };
      try { cmdVerifyComplete({ dir, err }); } catch { /* may fail later checks; only assert e2e gate not hit */ }
      assert.doesNotMatch(captured, /E2E tests required but none covered/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runQualityGates() + verify-run/complete integration (ADR-037)', () => {
  function seedQA(dir, gates) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
      verifyPassed: true, verifySummary: { total: 1, passed: 1, failed: 0, skipped: 0 },
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'runner.js' }],
      test_runner: 'node runner.js',
      quality_gates: gates,
    }));
    fs.writeFileSync(path.join(dir, 'runner.js'), `console.log('✔ TC-001 — ran');\n`);
  }
  const readResults = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
  const readCfg     = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
  const silent = (fn) => {
    const ol = console.log, oe = process.stderr.write;
    console.log = () => {}; process.stderr.write = () => true;
    try { return fn(); } finally { console.log = ol; process.stderr.write = oe; }
  };

  it('runQualityGates classifies pass/fail/advisory/missing-binary', () => {
    const r = runQualityGates([
      { name: 'ok',   command: 'true',  required: true },
      { name: 'bad',  command: 'false', required: true },
      { name: 'adv',  command: 'false', required: false },
      { name: 'gone', command: 'definitely-not-a-real-binary-zzz', required: true },
    ], '/tmp');
    assert.equal(r[0].status, 'pass');
    assert.equal(r[1].status, 'fail');
    assert.equal(r[2].status, 'fail');
    assert.equal(r[2].required, false);
    assert.equal(r[3].status, 'error');
    assert.equal(r[3].exit_code, null);
  });

  it('required defaults to true when omitted', () => {
    const r = runQualityGates([{ name: 'x', command: 'true' }], '/tmp');
    assert.equal(r[0].required, true);
  });

  it('verify-run records quality_gates and a failing required gate resets verifyPassed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-qa-fail-'));
    try {
      seedQA(dir, [{ name: 'lint', command: 'false', required: true }]);
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      const res = readResults(dir);
      assert.ok(Array.isArray(res.quality_gates), 'quality_gates recorded in results');
      assert.equal(res.quality_gates[0].status, 'fail');
      assert.equal(readCfg(dir).verifyPassed, false, 'required gate fail must reset verifyPassed');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('verify-complete BLOCKS on a failing required gate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-qa-block-'));
    try {
      seedQA(dir, [{ name: 'lint', command: 'false', required: true }]);
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      let blocked = false, msg = '';
      try { silent(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })); }
      catch (e) { blocked = true; msg = e.message; }
      assert.ok(blocked, 'verify-complete must block');
      assert.match(msg, /required code-quality gate/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('an advisory (required:false) failing gate does NOT block verify-complete', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-qa-adv-'));
    try {
      seedQA(dir, [{ name: 'sec', command: 'false', required: false }]);
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      // verify-complete should pass the gate check (TC-001 passed, advisory gate ignored).
      assert.doesNotThrow(() => silent(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a passing required gate does not block and is recorded', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-qa-pass-'));
    try {
      seedQA(dir, [{ name: 'lint', command: 'true', required: true }]);
      silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
      assert.equal(readResults(dir).quality_gates[0].status, 'pass');
      assert.doesNotThrow(() => silent(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('coverage as a declared quality_gate (ADR-037 follow-up)', () => {
  // test_runner carries `--coverage` so injectCoverageFlag sees it present and
  // leaves the command unchanged; the script prints a parseable coverage line.
  function seedCov(dir, threshold, measuredLine, required = true) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
      verifyPassed: true, verifySummary: { total: 1, passed: 1, failed: 0, skipped: 0 },
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'runner.js' }],
      test_runner: 'node runner.js --coverage',
      quality_gates: [{ name: 'coverage', threshold, required }],
    }));
    fs.writeFileSync(path.join(dir, 'runner.js'),
      `console.log('✔ TC-001 — ran');\nconsole.log('All files | ${measuredLine} |');\n`);
  }
  const readResults = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
  const silent = (fn) => {
    const ol = console.log, oe = process.stderr.write;
    console.log = () => {}; process.stderr.write = () => true;
    try { return fn(); } finally { console.log = ol; process.stderr.write = oe; }
  };
  const run = (dir) => silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));

  it('coverage below threshold → fail gate, blocks verify-complete', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-cov-fail-'));
    try {
      seedCov(dir, 80, '72');
      run(dir);
      const g = readResults(dir).quality_gates.find(x => x.name === 'coverage');
      assert.equal(g.status, 'fail');
      assert.equal(g.measured, 72);
      let msg = '';
      try { silent(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })); }
      catch (e) { msg = e.message; }
      assert.match(msg, /required code-quality gate/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('coverage at/above threshold → pass gate, does not block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-cov-pass-'));
    try {
      seedCov(dir, 80, '88');
      run(dir);
      const g = readResults(dir).quality_gates.find(x => x.name === 'coverage');
      assert.equal(g.status, 'pass');
      assert.equal(g.measured, 88);
      assert.doesNotThrow(() => silent(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('coverage gate is advisory (required:false) does not block when below', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-cov-adv-'));
    try {
      seedCov(dir, 90, '50', false);
      run(dir);
      assert.equal(readResults(dir).quality_gates.find(x => x.name === 'coverage').status, 'fail');
      assert.doesNotThrow(() => silent(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } })));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('opt-in review gate (ADR-034 addendum)', () => {
  function seedReview(dir, { reviewGate, verdict }) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
      verifyPassed: true, verifySummary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      ...(reviewGate ? { reviewGate: true } : {}),
    }));
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
      files_created: [{ path: 'runner.js' }], test_runner: 'node runner.js',
    }));
    fs.writeFileSync(path.join(dir, 'runner.js'), `console.log('✔ TC-001 — ran');\n`);
    if (verdict) {
      fs.writeFileSync(path.join(dir, 'spec/04_CODE_REVIEW.md'),
        `# Code Review\n## Issues\n- something\n## Verdict\nVerdict: ${verdict} — note\n`);
    }
  }
  const silent = (fn) => {
    const ol = console.log, oe = process.stderr.write;
    console.log = () => {}; process.stderr.write = () => true;
    try { return fn(); } finally { console.log = ol; process.stderr.write = oe; }
  };
  const run = (dir) => silent(() => cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }));
  const complete = (dir) => silent(() => cmdVerifyComplete({ dir, err: (m) => { throw new Error(m); } }));

  it('reviewGate ON + verdict FAIL → blocks verify-complete', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rev-fail-'));
    try {
      seedReview(dir, { reviewGate: true, verdict: 'FAIL' });
      run(dir);
      let msg = ''; try { complete(dir); } catch (e) { msg = e.message; }
      assert.match(msg, /reviewGate is ON.*FAIL/s);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reviewGate OFF (default) + verdict FAIL → does NOT block (advisory, per ADR-034)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rev-off-'));
    try {
      seedReview(dir, { reviewGate: false, verdict: 'FAIL' });
      run(dir);
      assert.doesNotThrow(() => complete(dir));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reviewGate ON + verdict PASS → does not block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rev-pass-'));
    try {
      seedReview(dir, { reviewGate: true, verdict: 'PASS' });
      run(dir);
      assert.doesNotThrow(() => complete(dir));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reviewGate ON + no review present → does not block (review stays optional)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rev-none-'));
    try {
      seedReview(dir, { reviewGate: true, verdict: null });
      run(dir);
      assert.doesNotThrow(() => complete(dir));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// §3.10 / Windows (rc.64 adopter): npm-family launchers are .cmd shims that spawn()
// with shell:false cannot resolve on Windows. resolveWinBin maps them to .cmd on
// win32 only — a no-op on POSIX (so this whole suite, which runs on POSIX, is
// unaffected). The win32 branch is exercised by overriding process.platform.
describe('resolveWinBin() — Windows npm-family .cmd resolution', () => {
  function asPlatform(name, fn) {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: name, configurable: true });
    try { return fn(); } finally { Object.defineProperty(process, 'platform', orig); }
  }

  it('is a no-op on POSIX (returns the bare binary unchanged)', () => {
    asPlatform('linux', () => {
      assert.equal(resolveWinBin('npm'), 'npm');
      assert.equal(resolveWinBin('npx'), 'npx');
    });
  });

  it('maps npm-family shims to .cmd on win32', () => {
    asPlatform('win32', () => {
      assert.equal(resolveWinBin('npm'),  'npm.cmd');
      assert.equal(resolveWinBin('npx'),  'npx.cmd');
      assert.equal(resolveWinBin('yarn'), 'yarn.cmd');
      assert.equal(resolveWinBin('pnpm'), 'pnpm.cmd');
    });
  });

  it('leaves .exe-resolving binaries and already-extensioned commands untouched on win32', () => {
    asPlatform('win32', () => {
      assert.equal(resolveWinBin('node'),    'node');     // node.exe resolves
      assert.equal(resolveWinBin('dotnet'),  'dotnet');   // dotnet.exe resolves
      assert.equal(resolveWinBin('go'),      'go');
      assert.equal(resolveWinBin('npm.cmd'), 'npm.cmd');  // already has an extension
    });
  });
});
