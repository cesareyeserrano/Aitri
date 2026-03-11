import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRunnerOutput, buildFRCoverage, scanTestContent, parseCoverageOutput } from '../../lib/commands/verify.js';

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
