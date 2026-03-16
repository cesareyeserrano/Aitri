import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRunnerOutput, parsePlaywrightOutput, parseVitestOutput, parsePytestOutput, buildFRCoverage, scanTestContent, parseCoverageOutput } from '../../lib/commands/verify.js';

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

});
