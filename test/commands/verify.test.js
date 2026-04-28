import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseRunnerOutput, parsePlaywrightOutput, parseVitestOutput, parsePytestOutput, buildFRCoverage, scanTestContent, parseCoverageOutput, extractTCId, cmdVerifyRun, cmdVerifyComplete } from '../../lib/commands/verify.js';

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

  it('does not double-detect same TC id (first occurrence wins)', () => {
    const output = [
      `✔ TC-001: first run (0.2ms)`,
      `✖ TC-001: second run? (0.1ms)`,
    ].join('\n');
    const result = parseRunnerOutput(output);
    assert.equal(result.get('TC-001')?.status, 'pass');
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

  it('does not double-detect same TC id (first occurrence wins)', () => {
    const output = [
      ` ✓ TC-001: first run (2ms)`,
      ` × TC-001: retry (1ms)`,
    ].join('\n');
    const result = parseVitestOutput(output);
    assert.equal(result.get('TC-001')?.status, 'pass');
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

  it('does not double-detect same TC id (first occurrence wins)', () => {
    const output = [
      `  ✓  1 tests/e2e/sales-tracker.spec.js › TC-020: No scroll (0.3s)`,
      `  ✗  2 tests/e2e/sales-tracker.spec.js › TC-020: No scroll retry (0.1s)`,
    ].join('\n');
    const result = parsePlaywrightOutput(output);
    assert.equal(result.get('TC-020')?.status, 'pass');
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

  it('does not double-detect same TC id (first occurrence wins)', () => {
    const output = [
      `tests/test_foo.py::test_TC_001h_first PASSED`,
      `tests/test_foo.py::test_TC_001h_duplicate FAILED`,
    ].join('\n');
    const result = parsePytestOutput(output);
    assert.equal(result.get('TC-001h')?.status, 'pass');
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
    assert.ok(result.has('TC-FE-001h'), 'TC_FE_001h should normalize to TC-FE-001h');
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
    assert.ok(result.has('TC-API-USER-010f'), 'deep namespace should normalize correctly');
    assert.equal(result.get('TC-API-USER-010f')?.status, 'pass');
  });

  it('normalizes all-lowercase pytest convention (test_tc_fe_001h) to uppercase namespace', () => {
    const output = `tests/test_foo.py::test_tc_fe_001h_threshold PASSED`;
    const result = parsePytestOutput(output);
    assert.ok(result.has('TC-FE-001h'), 'lowercase tc_fe should normalize to TC-FE');
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
    writeJSON(dir, 'spec/04_IMPLEMENTATION_MANIFEST.json', {
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
