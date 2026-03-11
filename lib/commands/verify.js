/**
 * Module: Command — verify + verify-complete
 * Purpose: verify-run: execute real tests, auto-parse TC results from output, write 04_TEST_RESULTS.json.
 *          verify-complete: gate — validates 04_TEST_RESULTS.json, unlocks Phase 5.
 *          verify: disabled — redirects to verify-run.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadConfig, saveConfig, readArtifact } from '../state.js';

/**
 * Parse test runner output for TC-XXX pass/fail markers.
 * Detects lines matching: ✔ TC-XXX or ✖ TC-XXX (node:test format)
 * @param {string} output - Combined stdout+stderr from test runner
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parseRunnerOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const passMatch = line.match(/✔\s+(TC-\d+)/);
    const failMatch = line.match(/✖\s+(TC-\d+)/);

    if (passMatch && !detected.has(passMatch[1])) {
      detected.set(passMatch[1], { status: 'pass', notes: line.trim() });
    } else if (failMatch && !detected.has(failMatch[1])) {
      // Capture error context from following lines
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('AssertionError') || l.includes('Error') || l.startsWith('at '))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      detected.set(failMatch[1], {
        status: 'fail',
        notes: [line.trim(), ...errorContext].join(' | ').slice(0, 400),
      });
    }
  }

  return detected;
}

/**
 * Build fr_coverage from results + Phase 3 TC→FR mapping.
 * @param {Array} results - TC result objects
 * @param {Array} testCases - Phase 3 test_cases
 * @param {Array} frIds - FR ids from Phase 1
 */
export function buildFRCoverage(results, testCases, frIds) {
  const tcToFR = {};
  for (const tc of testCases) {
    tcToFR[tc.id] = tc.requirement_id;
  }

  const counters = {};
  for (const id of frIds) {
    counters[id] = { passing: 0, failing: 0, skipped: 0 };
  }
  for (const r of results) {
    const frId = tcToFR[r.tc_id];
    if (frId && counters[frId]) {
      if (r.status === 'pass') counters[frId].passing++;
      else if (r.status === 'fail') counters[frId].failing++;
      else counters[frId].skipped++;
    }
  }

  return frIds.map(fr_id => {
    const c = counters[fr_id] || { passing: 0, failing: 0, skipped: 0 };
    const status = c.passing > 0
      ? (c.failing > 0 ? 'partial' : 'covered')
      : (c.failing > 0 ? 'uncovered' : 'partial');
    return { fr_id, tests_passing: c.passing, tests_failing: c.failing, tests_skipped: c.skipped, status };
  });
}

/**
 * Scan test file content for @aitri-tc markers and count assert calls per TC block.
 * Pure function — testable without filesystem access.
 * @param {string} content - test file content
 * @param {string} relPath - relative path for reporting
 * @returns {Array<{tc_id: string, file: string, assertCount: number}>} TCs with ≤1 assertion
 */
export function scanTestContent(content, relPath = '') {
  const lowConfidence = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const markerMatch = lines[i].match(/\/\/\s*@aitri-tc\s+(TC-\d+)/);
    if (!markerMatch) continue;
    const tc_id = markerMatch[1];
    const start = Math.max(0, i - 20);
    const end = Math.min(lines.length, i + 40);
    const block = lines.slice(start, end).join('\n');
    const assertMatches = block.match(/\bassert\.\w+\s*\(|\bexpect\s*\(/g) || [];
    if (assertMatches.length <= 1) {
      lowConfidence.push({ tc_id, file: relPath, assertCount: assertMatches.length });
    }
  }
  return lowConfidence;
}

/**
 * Scan test files on disk for low-confidence TCs (≤1 assert per TC block).
 * @param {string[]} testFiles - relative paths from manifest.test_files
 * @param {string} dir - project directory
 * @returns {Array<{tc_id: string, file: string, assertCount: number}>}
 */
export function scanAssertionDensity(testFiles, dir) {
  const results = [];
  for (const relPath of (testFiles || [])) {
    const fullPath = path.join(dir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      results.push(...scanTestContent(content, relPath));
    } catch { /* non-fatal — skip unreadable files */ }
  }
  return results;
}

/**
 * Parse line coverage % from node --test --experimental-test-coverage output.
 * Looks for "all files | XX.XX |" pattern in coverage table.
 * @param {string} output - combined test runner output
 * @returns {number|null} line coverage percentage, or null if not found
 */
export function parseCoverageOutput(output) {
  const match = output.match(/all files\s*\|\s*([\d.]+)/i);
  if (!match) return null;
  return parseFloat(match[1]);
}

export function cmdVerifyRun({ dir, flagValue, err }) {
  const config = loadConfig(dir);
  if (!(config.approvedPhases || []).includes(4)) {
    err(`Phase 4 must be approved before running verify-run.\nRun: aitri approve 4`);
  }

  const manifestRaw = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json');
  if (!manifestRaw) err(`Missing 04_IMPLEMENTATION_MANIFEST.json — complete Phase 4 first.`);

  const testCasesRaw = readArtifact(dir, '03_TEST_CASES.json');
  if (!testCasesRaw) err(`Missing 03_TEST_CASES.json — complete Phase 3 first.`);

  let manifest, tcs, requirements;
  try { manifest = JSON.parse(manifestRaw); } catch { err('04_IMPLEMENTATION_MANIFEST.json is malformed JSON'); }
  try { tcs = JSON.parse(testCasesRaw); } catch { err('03_TEST_CASES.json is malformed JSON'); }
  const requirementsRaw = readArtifact(dir, '01_REQUIREMENTS.json');
  try { if (requirementsRaw) requirements = JSON.parse(requirementsRaw); } catch { /* non-fatal */ }

  // Resolve test command: --cmd flag > manifest.test_runner > npm test
  let testCmd = flagValue('--cmd') || manifest.test_runner || 'npm test';

  // Coverage threshold: inject --experimental-test-coverage for node runners
  const rawThreshold = flagValue('--coverage-threshold');
  const coverageThreshold = rawThreshold !== undefined ? parseFloat(rawThreshold) : null;
  if (coverageThreshold !== null && testCmd.trim().startsWith('node ')) {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    const covFlag = major >= 22 ? '--coverage' : '--experimental-test-coverage';
    testCmd = 'node ' + covFlag + ' ' + testCmd.slice('node '.length).trim();
    process.stderr.write(`[aitri] Coverage threshold: ${coverageThreshold}% (using ${covFlag})\n`);
  }

  process.stderr.write(`[aitri] Running: ${testCmd}\n`);
  process.stderr.write(`[aitri] Auto-parsing TC results from output (no agent mapping needed)...\n`);

  const [bin, ...cmdArgs] = testCmd.split(' ');
  const result = spawnSync(bin, cmdArgs, {
    cwd: dir,
    encoding: 'utf8',
    timeout: 300000,
    shell: true,
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = [stdout, stderr].filter(Boolean).join('\n');
  const exitCode = result.status ?? 1;

  // Auto-parse TC results — agent cannot self-report
  const testCaseList = tcs.test_cases || [];
  const detected = parseRunnerOutput(output);

  // Playwright e2e runner — activated by --e2e flag
  let playwrightOutput = '';
  let playwrightExitCode = null;
  const runE2E = flagValue('--e2e') !== undefined;
  if (runE2E) {
    const pwConfigJs = path.join(dir, 'playwright.config.js');
    const pwConfigTs = path.join(dir, 'playwright.config.ts');
    if (fs.existsSync(pwConfigJs) || fs.existsSync(pwConfigTs)) {
      process.stderr.write(`[aitri] Running Playwright e2e tests (--e2e)...\n`);
      const pwResult = spawnSync('npx', ['playwright', 'test'], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 600000,
        shell: true,
      });
      const pwStdout = pwResult.stdout || '';
      const pwStderr = pwResult.stderr || '';
      playwrightOutput = [pwStdout, pwStderr].filter(Boolean).join('\n');
      playwrightExitCode = pwResult.status ?? 1;
      // Merge Playwright-detected TCs — main runner wins on conflict
      const pwDetected = parseRunnerOutput(playwrightOutput);
      for (const [id, result] of pwDetected) {
        if (!detected.has(id)) detected.set(id, result);
      }
      process.stderr.write(`[aitri] Playwright: ${pwDetected.size} TC(s) detected\n`);
    } else {
      process.stderr.write(`[aitri] --e2e flag set but no playwright.config.js/ts found — skipping\n`);
    }
  }

  const SKIP_NOTE = (tc) =>
    `Not detected in test runner output — test name must start with "${tc.id}:" to be auto-detected. ` +
    `Likely requires browser or integration environment.`;

  const results = testCaseList.map(tc =>
    detected.has(tc.id)
      ? { tc_id: tc.id, status: detected.get(tc.id).status, notes: detected.get(tc.id).notes }
      : { tc_id: tc.id, status: 'skip', notes: SKIP_NOTE(tc) }
  );

  // Assertion density scan — flag low-confidence TCs before writing results
  const lowConfidence = scanAssertionDensity(manifest.test_files || [], dir);

  // Parse coverage if threshold was requested
  const lineCoverage = coverageThreshold !== null ? parseCoverageOutput(output) : null;
  const coverageFailed = lineCoverage !== null && lineCoverage < coverageThreshold;

  // Build fr_coverage using Phase 3 TC→FR mapping
  const frIds = requirements?.functional_requirements?.map(fr => fr.id)
    || [...new Set(testCaseList.map(tc => tc.requirement_id).filter(Boolean))];
  const frCoverage = buildFRCoverage(results, testCaseList, frIds);

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    skipped: results.filter(r => r.status === 'skip').length,
  };

  const testResults = {
    executed_at: new Date().toISOString(),
    test_runner: testCmd,
    exit_code: exitCode,
    results,
    fr_coverage: frCoverage,
    summary,
  };

  // Write results automatically — agent does NOT write this file
  const resultsPath = path.join(dir, '04_TEST_RESULTS.json');
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));

  process.stderr.write(`[aitri] Auto-detected: ${detected.size} TC(s) total. Written: 04_TEST_RESULTS.json\n`);

  const assertionWarnLines = lowConfidence.length > 0 ? [
    ``,
    `## ⚠ Assertion Density Warning — ${lowConfidence.length} low-confidence TC(s)`,
    `These TCs have ≤1 assert call in their test block — may not verify real behavior:`,
    ...lowConfidence.map(tc => `  ${tc.tc_id} (${tc.file}) — ${tc.assertCount} assertion(s)`),
    `Review each test: confirm the assertion exercises actual logic, not a constant expression.`,
    `This is a warning only — verify-complete will not block on assertion density.`,
  ] : [];

  const coverageLines = lineCoverage !== null ? [
    ``,
    `## Code Coverage`,
    `  Line coverage: ${lineCoverage.toFixed(2)}%  (threshold: ${coverageThreshold}%)`,
    coverageFailed
      ? `  ⚠ Below threshold — increase test coverage before verify-complete.`
      : `  ✓ Coverage threshold met.`,
  ] : [];

  console.log([
    `# Verify Run — Auto-Parsed Results`,
    ``,
    `## Test command`,
    `  ${testCmd}`,
    ``,
    `## Exit code: ${exitCode} ${exitCode === 0 ? '(success)' : '(failure)'}`,
    ``,
    `## Results (auto-detected from runner output)`,
    `  Passed:  ${summary.passed}`,
    `  Failed:  ${summary.failed}`,
    `  Skipped: ${summary.skipped} (test name not matching TC-XXX: pattern — skipped automatically)`,
    ...coverageLines,
    ...assertionWarnLines,
    ``,
    `## Raw test output`,
    `\`\`\``,
    output || '(no output)',
    `\`\`\``,
    ...(playwrightOutput ? [
      ``,
      `## Raw Playwright output (exit code: ${playwrightExitCode})`,
      `\`\`\``,
      playwrightOutput,
      `\`\`\``,
    ] : []),
    ``,
    `## 04_TEST_RESULTS.json written automatically`,
    `Results parsed from real runner output — agent self-reporting eliminated.`,
    `Detection pattern: ✔/✖ TC-XXX in test output (node:test, tap, mocha compatible).`,
    summary.failed > 0
      ? `\n⚠ ${summary.failed} failing test(s) detected. Fix failures before verify-complete.`
      : ``,
    coverageFailed
      ? `⚠ Coverage ${lineCoverage.toFixed(2)}% below threshold ${coverageThreshold}% — fix before verify-complete.`
      : ``,
    ``,
    `## Next step`,
    `Run: aitri verify-complete`,
  ].join('\n'));
}

export function cmdVerify({ err }) {
  err(
    `aitri verify is disabled — use aitri verify-run instead.\n\n` +
    `aitri verify allowed agents to self-report test results without real execution (honor system).\n` +
    `aitri verify-run executes the actual test suite and maps results from real runner output.\n\n` +
    `Run: aitri verify-run`
  );
}

export function cmdVerifyComplete({ dir, err }) {
  const resultsPath = path.join(dir, '04_TEST_RESULTS.json');
  if (!fs.existsSync(resultsPath)) {
    err(`04_TEST_RESULTS.json not found.\nRun: aitri verify-run  then save the results file.`);
  }

  let d;
  try { d = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); }
  catch { err('04_TEST_RESULTS.json is malformed JSON — fix and retry.'); }

  const missing = ['executed_at', 'results', 'fr_coverage', 'summary'].filter(k => !d[k]);
  if (missing.length) err(`04_TEST_RESULTS.json missing fields: ${missing.join(', ')}`);
  if (!Array.isArray(d.results) || d.results.length === 0)
    err('results array is empty — at least one TC must be reported');
  if (!Array.isArray(d.fr_coverage) || d.fr_coverage.length === 0)
    err('fr_coverage array is empty — every FR must have a coverage entry');

  const testCases = readArtifact(dir, '03_TEST_CASES.json');
  if (testCases) {
    try {
      const tcs = JSON.parse(testCases);
      const expectedIds = new Set(tcs.test_cases?.map(tc => tc.id) || []);
      const reportedIds = new Set(d.results.map(r => r.tc_id));
      const unreported  = [...expectedIds].filter(id => !reportedIds.has(id));
      if (unreported.length)
        err(`Missing results for: ${unreported.join(', ')}\nEvery TC from Phase 3 must have a result.`);
    } catch { /* parse error already caught above */ }
  }

  const failed      = d.results.filter(r => r.status === 'fail');
  const skippedTCs  = d.results.filter(r => r.status === 'skip');
  const passedTCs   = d.results.filter(r => r.status === 'pass');

  const failedNoNotes  = failed.filter(r => !r.notes?.trim());
  const skippedNoNotes = skippedTCs.filter(r => !r.notes?.trim());
  if (failedNoNotes.length)
    err(`${failedNoNotes.length} failing test(s) have empty notes:\n  ${failedNoNotes.map(r => r.tc_id).join(', ')}`);
  if (skippedNoNotes.length)
    err(`${skippedNoNotes.length} skipped test(s) have empty notes:\n  ${skippedNoNotes.map(r => r.tc_id).join(', ')}`);

  if (skippedTCs.length > 0 && failed.length === 0 && passedTCs.length === 0)
    err(`All ${skippedTCs.length} test(s) are skipped and none passed — at least 1 test must actually run and pass.`);

  if (failed.length) {
    const list = failed.map(r => `  ✗ ${r.tc_id}${r.notes ? `: ${r.notes}` : ''}`).join('\n');
    err(`${failed.length} test(s) failing — fix before proceeding to Phase 5:\n${list}`);
  }

  const uncovered = d.fr_coverage.filter(fr => fr.status === 'uncovered');
  if (uncovered.length) {
    err(`Uncovered FRs — all requirements must have passing tests:\n  ${uncovered.map(f => f.fr_id).join(', ')}`);
  }

  // Traceability cross-check: every FR from Phase 1 must be in fr_coverage with ≥1 passing test
  const requirements = readArtifact(dir, '01_REQUIREMENTS.json');
  if (requirements) {
    try {
      const reqs = JSON.parse(requirements);
      const phase1FRIds = new Set((reqs.functional_requirements || []).map(fr => fr.id));
      const reportedFRIds = new Set((d.fr_coverage || []).map(fr => fr.fr_id));

      const missingFromCoverage = [...phase1FRIds].filter(id => !reportedFRIds.has(id));
      if (missingFromCoverage.length)
        err(`FR coverage gap — these Phase 1 requirements are missing from fr_coverage:\n  ${missingFromCoverage.join(', ')}\n  Add an entry for every FR in 04_TEST_RESULTS.json fr_coverage.`);

      const uncoveredPhase1 = [...phase1FRIds].filter(id => {
        const entry = (d.fr_coverage || []).find(fr => fr.fr_id === id);
        return !entry || entry.tests_passing === 0;
      });
      if (uncoveredPhase1.length)
        err(`Requirement coverage failure — these FRs have zero passing tests:\n  ${uncoveredPhase1.join(', ')}\n  Every requirement from Phase 1 must have ≥1 passing test before Phase 5.`);
    } catch { /* parse error already caught above */ }
  }

  const config = loadConfig(dir);
  config.verifyPassed    = true;
  config.verifyTimestamp = new Date().toISOString();
  config.verifySummary   = d.summary;
  saveConfig(dir, config);

  const { total, passed, skipped } = d.summary;
  const bar = '─'.repeat(60);
  console.log(`✅ Verify passed — ${passed}/${total} tests passing${skipped ? `, ${skipped} skipped` : ''}`);
  console.log(`\n${bar}`);
  console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
  console.log(`  aitri run-phase 5\n`);
  console.log(`Do NOT write deployment code, skip Phase 5, or modify any files yet.`);
  console.log(`Phase 5 (Deployment — DevOps Engineer) must run next.`);
  console.log(`The pipeline decides the route. You execute it.`);
  console.log(bar);
}
