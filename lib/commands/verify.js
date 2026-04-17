/**
 * Module: Command — verify + verify-complete
 * Purpose: verify-run: execute real tests, auto-parse TC results from output, write 04_TEST_RESULTS.json.
 *          verify-complete: gate — validates 04_TEST_RESULTS.json, unlocks Phase 5.
 *          verify: disabled — redirects to verify-run.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadConfig, saveConfig, readArtifact, artifactPath, appendEvent, writeLastSession } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
import { autoVerifyBugs, getBlockingBugs, promptAndRegisterBugs } from './bug.js';

/**
 * Parse test runner output for TC-XXX pass/fail markers.
 * Detects lines matching: ✔ TC-XXX or ✖ TC-XXX (node:test format)
 * TC IDs support alphanumeric suffixes: TC-001, TC-020b, TC-012c
 * @param {string} output - Combined stdout+stderr from test runner
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parseRunnerOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Support alphanumeric TC IDs: TC-001, TC-020b, TC-012c (not just TC-\d+)
    const passMatch = line.match(/✔\s+(TC-[A-Za-z0-9]+)/);
    const failMatch = line.match(/✖\s+(TC-[A-Za-z0-9]+)/);

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
 * Parse Vitest / Jest test runner output for TC-XXX pass/fail markers.
 * Vitest verbose uses ✓ (U+2713) for pass and × (U+00D7) or ✕ (U+2715) for fail.
 * Jest verbose uses the same symbols.
 * Requires verbose output: `vitest run --reporter verbose` or `jest --verbose`
 * @param {string} output - Combined stdout+stderr from test runner
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parseVitestOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tcMatch = line.match(/TC-([A-Za-z0-9]+)/);
    if (!tcMatch) continue;
    const tcId = `TC-${tcMatch[1]}`;
    if (detected.has(tcId)) continue;
    if (/[✓✔]/.test(line)) {
      detected.set(tcId, { status: 'pass', notes: line.trim() });
    } else if (/[×✕✗]/.test(line)) {
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('Error') || l.includes('Expected') || l.includes('Received'))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      detected.set(tcId, {
        status: 'fail',
        notes: [line.trim(), ...errorContext].join(' | ').slice(0, 400),
      });
    }
  }
  return detected;
}

/**
 * Parse pytest -v output for TC-XXX pass/fail markers.
 * pytest -v produces lines like:
 *   tests/foo.py::test_TC_001h_description PASSED
 *   tests/foo.py::test_TC_001f_description FAILED
 * TC IDs may use underscores in function names (TC_001h) — normalized to TC-001h.
 * Requires verbose output: `pytest -v` or `python3 -m pytest -v`
 * @param {string} output - Combined stdout+stderr from pytest
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parsePytestOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match TC-XXX or TC_XXX in test function names — case-insensitive to handle Python
    // lowercase convention (test_tc_001h). Negative lookbehind avoids mid-word matches.
    // Captured group preserved as-is; ID is normalized to uppercase TC- prefix below.
    const tcMatch = line.match(/(?<![A-Za-z])[Tt][Cc][-_]([A-Za-z0-9]+)/);
    if (!tcMatch) continue;
    const tcId = `TC-${tcMatch[1]}`;
    if (detected.has(tcId)) continue;
    if (/\bPASSED\b/.test(line)) {
      detected.set(tcId, { status: 'pass', notes: line.trim() });
    } else if (/\bFAILED\b/.test(line)) {
      // Capture assertion error from following lines
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('AssertionError') || l.includes('Error') || l.startsWith('E '))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      detected.set(tcId, {
        status: 'fail',
        notes: [line.trim(), ...errorContext].join(' | ').slice(0, 400),
      });
    }
  }
  return detected;
}

/**
 * Parse Playwright test runner output for TC-XXX pass/fail markers.
 * Playwright list reporter uses ✓ (U+2713) and format:
 *   ✓  N tests/path/file.spec.js:line:col › TC-XXX: description (Xms)
 *   ✗  N tests/path/file.spec.js:line:col › TC-XXX: description (Xms)
 * @param {string} output - Playwright stdout
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parsePlaywrightOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');
  for (const line of lines) {
    const tcMatch = line.match(/TC-([A-Za-z0-9]+)/);
    if (!tcMatch) continue;
    const tcId = `TC-${tcMatch[1]}`;
    if (detected.has(tcId)) continue;
    if (/[✓✔]/.test(line)) {
      detected.set(tcId, { status: 'pass', notes: line.trim() });
    } else if (/[✗✘✖]/.test(line)) {
      detected.set(tcId, { status: 'fail', notes: line.trim() });
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
    counters[id] = { passing: 0, failing: 0, skipped: 0, manual: 0 };
  }
  for (const r of results) {
    const frId = tcToFR[r.tc_id];
    if (frId && counters[frId]) {
      if (r.status === 'pass')        counters[frId].passing++;
      else if (r.status === 'fail')   counters[frId].failing++;
      else if (r.status === 'manual') counters[frId].manual++;
      else                            counters[frId].skipped++;
    }
  }

  return frIds.map(fr_id => {
    const c = counters[fr_id] || { passing: 0, failing: 0, skipped: 0, manual: 0 };
    let status;
    if (c.passing > 0)                                     status = c.failing > 0 ? 'partial' : 'covered';
    else if (c.failing > 0)                                status = 'uncovered';
    else if (c.manual > 0 && c.skipped === 0)              status = 'manual';
    else                                                   status = 'partial';
    return { fr_id, tests_passing: c.passing, tests_failing: c.failing, tests_skipped: c.skipped, tests_manual: c.manual, status };
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
    const markerMatch = lines[i].match(/(?:\/\/|#)\s*@aitri-tc\s+(TC-[A-Za-z0-9]+)/);
    if (!markerMatch) continue;
    const tc_id = markerMatch[1];
    const start = Math.max(0, i - 20);
    const end = Math.min(lines.length, i + 40);
    const block = lines.slice(start, end).join('\n');
    // Match JS-style (assert.x / expect()) and Python-style (assert expr) assertions
    const assertMatches = block.match(/\bassert\.\w+\s*\(|\bexpect\s*\(|\bassert\s+[^\s(]/g) || [];
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

export function cmdVerifyRun({ dir, args, flagValue, err, featureRoot }) {
  const config = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';
  if (!(config.approvedPhases || []).includes(4)) {
    err(`Phase 4 must be approved before running verify-run.\nRun: aitri approve 4`);
  }

  const manifestRaw = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json', artifactsDir);
  if (!manifestRaw) err(`Missing 04_IMPLEMENTATION_MANIFEST.json — complete Phase 4 first.`);

  const testCasesRaw = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
  if (!testCasesRaw) err(`Missing 03_TEST_CASES.json — complete Phase 3 first.`);

  let manifest, tcs, requirements;
  try { manifest = JSON.parse(manifestRaw); } catch { err('04_IMPLEMENTATION_MANIFEST.json is malformed JSON'); }
  try { tcs = JSON.parse(testCasesRaw); } catch { err('03_TEST_CASES.json is malformed JSON'); }
  const requirementsRaw = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
  try { if (requirementsRaw) requirements = JSON.parse(requirementsRaw); } catch { /* non-fatal */ }

  // Warn if manifest is missing test_runner or test_files — agent may have forgotten to declare them
  const missingTestRunner = !manifest.test_runner;
  const missingTestFiles  = !Array.isArray(manifest.test_files) || manifest.test_files.length === 0;

  // Resolve test command: --cmd flag > manifest.test_runner > npm test
  let testCmd = flagValue('--cmd') || manifest.test_runner || 'npm test';

  // Auto-detect Python virtualenv: bare 'pytest' won't resolve inside .venv without shell activation.
  // If .venv/bin/pytest (or venv/bin/pytest) exists in the project dir, rewrite the command to use it.
  if (/^pytest\b/.test(testCmd)) {
    const projectRoot = featureRoot || dir;
    const candidates = [
      path.join(projectRoot, '.venv', 'bin', 'pytest'),
      path.join(projectRoot, 'venv',  'bin', 'pytest'),
    ];
    const venvPytest = candidates.find(p => fs.existsSync(p));
    if (venvPytest) {
      testCmd = testCmd.replace(/^pytest/, venvPytest);
      process.stderr.write(`[aitri] Detected virtualenv — using ${venvPytest}\n`);
    }
  }

  // Coverage threshold: inject --experimental-test-coverage for node runners
  const rawThreshold = flagValue('--coverage-threshold');
  const coverageThreshold = rawThreshold !== null ? parseFloat(rawThreshold) : null;
  if (coverageThreshold !== null && testCmd.trim().startsWith('node ')) {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    const covFlag = major >= 22 ? '--coverage' : '--experimental-test-coverage';
    testCmd = 'node ' + covFlag + ' ' + testCmd.slice('node '.length).trim();
    process.stderr.write(`[aitri] Coverage threshold: ${coverageThreshold}% (using ${covFlag})\n`);
  }

  process.stderr.write(`[aitri] Running: ${testCmd}\n`);
  process.stderr.write(`[aitri] Auto-parsing TC results from output (no agent mapping needed)...\n`);

  // Split command into binary + args — shell: false avoids [DEP0190] and injection risk
  const cmdParts = testCmd.trim().split(/\s+/);
  const result = spawnSync(cmdParts[0], cmdParts.slice(1), {
    cwd: featureRoot || dir,
    encoding: 'utf8',
    timeout: 300000,
    shell: false,
  });

  // ENOENT means the binary wasn't found at all — give an actionable hint before continuing
  if (result.error?.code === 'ENOENT') {
    const hint = /pytest/.test(cmdParts[0])
      ? `  If using a Python virtualenv, the binary may not be in PATH.\n` +
        `  Override with: aitri verify-run --cmd ".venv/bin/pytest tests/ -v"\n` +
        `  Or set test_runner in 04_IMPLEMENTATION_MANIFEST.json to the full path.`
      : `  Check that "${cmdParts[0]}" is installed and accessible in PATH.`;
    process.stderr.write(`[aitri] Command not found: "${cmdParts[0]}"\n${hint}\n`);
  }

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = [stdout, stderr].filter(Boolean).join('\n');
  const exitCode = result.status ?? 1;

  // Auto-parse TC results — agent cannot self-report
  const testCaseList = tcs.test_cases || [];
  const detected = parseRunnerOutput(output);

  // Vitest/Jest fallback: if runner is vitest/jest OR node:test parser got 0 TCs, try Vitest parser
  const runnerHint = (manifest.test_runner || testCmd || '').toLowerCase();
  const isVitestOrJest = /vitest|jest/.test(runnerHint);
  if (isVitestOrJest || detected.size === 0) {
    const vitestDetected = parseVitestOutput(output);
    for (const [id, r] of vitestDetected) {
      if (!detected.has(id)) detected.set(id, r);
    }
    if (vitestDetected.size > 0)
      process.stderr.write(`[aitri] Vitest/Jest parser: ${vitestDetected.size} TC(s) detected\n`);
  }

  // Pytest fallback: if runner is pytest OR still 0 TCs, try pytest -v parser
  const isPytest = /pytest/.test(runnerHint);
  if (isPytest || detected.size === 0) {
    const pytestDetected = parsePytestOutput(output);
    for (const [id, r] of pytestDetected) {
      if (!detected.has(id)) detected.set(id, r);
    }
    if (pytestDetected.size > 0)
      process.stderr.write(`[aitri] pytest parser: ${pytestDetected.size} TC(s) detected\n`);
  }

  // Playwright e2e runner — auto-detected from playwright.config.js/ts presence
  // --e2e flag kept as no-op for backward compatibility
  let playwrightOutput = '';
  let playwrightExitCode = null;
  const pwConfigJs = path.join(dir, 'playwright.config.js');
  const pwConfigTs = path.join(dir, 'playwright.config.ts');
  const hasPwConfig = fs.existsSync(pwConfigJs) || fs.existsSync(pwConfigTs);
  if (hasPwConfig) {
    {
      process.stderr.write(`[aitri] Playwright config detected — running E2E tests automatically...\n`);
      const pwResult = spawnSync('npx', ['playwright', 'test'], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 600000,
        shell: false,
      });
      const pwStdout = pwResult.stdout || '';
      const pwStderr = pwResult.stderr || '';
      playwrightOutput = [pwStdout, pwStderr].filter(Boolean).join('\n');
      playwrightExitCode = pwResult.status ?? 1;
      // Use Playwright-specific parser (✓ U+2713, path › TC-XXX format)
      // Main runner wins on conflict
      const pwDetected = parsePlaywrightOutput(playwrightOutput);
      for (const [id, result] of pwDetected) {
        if (!detected.has(id)) detected.set(id, result);
      }
      process.stderr.write(`[aitri] Playwright: ${pwDetected.size} TC(s) detected\n`);
    }
  }

  const SKIP_NOTE = (tc) =>
    `Not detected in test runner output — rename the test function to include "${tc.id}" ` +
    `(e.g. test_${tc.id.replace(/-/g, '_')}_description) and add # @aitri-tc ${tc.id} above it. ` +
    `E2E tests may also require a browser environment.`;

  // Case-insensitive fallback: Python lowercase convention (test_tc_001h) produces detected keys
  // like "TC-001h" but the JSON may store "TC-001h" — keys always match. However if the test
  // function uses mixed case (test_TC_B1h vs JSON "TC-B1h"), the .toLowerCase() lookup unifies them.
  const detectedCI = new Map([...detected].map(([k, v]) => [k.toLowerCase(), v]));

  // Partition manual TCs — automation: 'manual' means a human runs them, not pytest/jest.
  // They should never appear in runner output; marking them 'skip' is incorrect.
  const manualTCIds = new Set(
    testCaseList.filter(tc => tc.automation === 'manual').map(tc => tc.id)
  );

  const results = testCaseList.map(tc => {
    if (manualTCIds.has(tc.id)) {
      return { tc_id: tc.id, status: 'manual', notes: 'Manual execution required — excluded from automated runner.' };
    }
    const entry = detected.get(tc.id) ?? detectedCI.get(tc.id.toLowerCase());
    return entry
      ? { tc_id: tc.id, status: entry.status, notes: entry.notes }
      : { tc_id: tc.id, status: 'skip', notes: SKIP_NOTE(tc) };
  });

  // Preserve manually-verified TC results from a previous run.
  // aitri tc verify writes verified_manually: true into 04_TEST_RESULTS.json.
  // Without this block, a subsequent verify-run would reset those entries back to 'manual'.
  const prevResultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  if (fs.existsSync(prevResultsPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevResultsPath, 'utf8'));
      const prevVerified = new Map(
        (prev.results || [])
          .filter(r => r.verified_manually)
          .map(r => [r.tc_id, r])
      );
      if (prevVerified.size > 0) {
        for (const r of results) {
          const v = prevVerified.get(r.tc_id);
          if (v) {
            r.status            = v.status;
            r.notes             = v.notes;
            r.verified_manually = true;
            r.verified_at       = v.verified_at;
          }
        }
        process.stderr.write(`[aitri] Preserved ${prevVerified.size} manually-verified TC(s) from previous run\n`);
      }
    } catch { /* non-fatal — if prev file is corrupt, start fresh */ }
  }

  // Assertion density scan — flag low-confidence TCs before writing results
  const lowConfidence = scanAssertionDensity(manifest.test_files || [], dir);

  // Parse coverage if threshold was requested
  const lineCoverage = coverageThreshold !== null ? parseCoverageOutput(output) : null;
  const coverageFailed = lineCoverage !== null && lineCoverage < coverageThreshold;

  // Build fr_coverage using Phase 3 TC→FR mapping
  const frIds = requirements?.functional_requirements?.map(fr => fr.id)
    || [...new Set(testCaseList.map(tc => tc.requirement_id).filter(Boolean))];
  const frCoverage = buildFRCoverage(results, testCaseList, frIds);

  // Classify skipped TCs: e2e type (require browser) vs no marker detected
  const skippedResults = results.filter(r => r.status === 'skip');
  const skippedE2E = skippedResults.filter(r => {
    const tc = testCaseList.find(t => t.id === r.tc_id);
    return tc?.type === 'e2e';
  });
  const skippedNoMarker = skippedResults.filter(r => {
    const tc = testCaseList.find(t => t.id === r.tc_id);
    return tc?.type !== 'e2e';
  });

  const manualVerified = results.filter(r => r.verified_manually === true).length;

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    skipped: skippedResults.length,
    skipped_e2e: skippedE2E.length,
    skipped_no_marker: skippedNoMarker.length,
    manual: manualTCIds.size,
    manual_verified: manualVerified,
  };

  const testResults = {
    executed_at: new Date().toISOString(),
    test_runner: testCmd,
    exit_code: exitCode,
    results,
    fr_coverage: frCoverage,
    summary,
  };

  // Warn if all FR coverage is zero but tests passed — signals missing @aitri-tc markers
  const allCoverageZero = frCoverage.every(fr => fr.tests_passing === 0);
  if (allCoverageZero && summary.passed > 0) {
    process.stderr.write(
      `[aitri] Warning: all FR coverage shows 0 passing tests, but ${summary.passed} test(s) passed.\n` +
      `  @aitri-tc markers may be missing from test files.\n` +
      `  Add markers like: // @aitri-tc TC-001  above each test block.\n`
    );
  }

  // Only warn about zero detection if there are automated TCs — all-manual projects legitimately produce no output
  const automatedTCCount = testCaseList.length - manualTCIds.size;
  const zeroTCsDetected = detected.size === 0 && automatedTCCount > 0;

  // Write results automatically — agent does NOT write this file
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));

  config.verifyRanAt = new Date().toISOString();
  appendEvent(config, 'verify-run', 'verify', { passed: summary.passed, failed: summary.failed, skipped: summary.skipped, manual: summary.manual });
  writeLastSession(config, dir, 'verify-run');
  saveConfig(dir, config);

  // Auto-transition fixed → verified for bugs whose linked TC just passed
  autoVerifyBugs(dir, config, results);

  // Prompt to register failing TCs as bugs (TTY only)
  const failedResults = results.filter(r => r.status === 'fail');
  promptAndRegisterBugs(dir, config, failedResults, {
    isPlaywright: hasPwConfig,
    testCaseList,
  });

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

  // Cap raw output to avoid overwhelming the agent briefing
  const OUTPUT_MAX_LINES = 200;
  const outputLines  = (output || '').split('\n');
  const isTruncated  = outputLines.length > OUTPUT_MAX_LINES;
  const displayOutput = isTruncated
    ? outputLines.slice(0, OUTPUT_MAX_LINES).join('\n') +
      `\n... (${outputLines.length - OUTPUT_MAX_LINES} more lines truncated — full output in your terminal)`
    : (output || '(no output)');

  const manifestWarnLines = (missingTestRunner || missingTestFiles) ? [
    ``,
    `## ⚠ Manifest Incomplete — Update 04_IMPLEMENTATION_MANIFEST.json`,
    ...(missingTestRunner ? [
      `  test_runner is missing — aitri verify-run fell back to "npm test".`,
      `  Add the exact command matching your stack to 04_IMPLEMENTATION_MANIFEST.json:`,
      `    JavaScript: "test_runner": "npm test" | "vitest run --reporter verbose" | "jest --verbose"`,
      `    Python:     "test_runner": "pytest -v"`,
      `    Go:         "test_runner": "go test ./... -v"`,
      `    Rust:       "test_runner": "cargo test -- --nocapture"`,
    ] : []),
    ...(missingTestFiles ? [
      `  test_files is missing or empty — assertion density scan skipped.`,
      `  Add: "test_files": ["<paths to files containing @aitri-tc markers>"]`,
    ] : []),
    `  Fix the manifest so future verify-run runs use the correct command.`,
  ] : [];

  const zeroTCsLines = zeroTCsDetected ? [
    ``,
    `## ⚠ Zero TCs Auto-Detected — All ${testCaseList.length} Test Cases Marked Skip`,
    `aitri verify-run could not match any test output to a TC-XXX id.`,
    `This means tests ran but were not linked to Aitri test cases.`,
    ``,
    `To fix — each test must include TC-XXX in its name and an @aitri-tc marker comment:`,
    ``,
    `  JavaScript (Jest/Mocha/Vitest):`,
    `    it('TC-001: description', () => {`,
    `      // @aitri-tc TC-001`,
    `    });`,
    ``,
    `  Python (pytest):`,
    `    def test_TC_001_description():`,
    `        # @aitri-tc TC-001`,
    ``,
    `  Go:`,
    `    func TestTC001Description(t *testing.T) {`,
    `        // @aitri-tc TC-001`,
    ``,
    `Detection patterns supported:`,
    `  node:test / mocha / TAP:  ✔/✖ TC-XXX in output (test name starts with TC-XXX:)`,
    `  Vitest --reporter verbose: ✓/× TC-XXX in output`,
    `  Jest --verbose:            ✓/✕ TC-XXX in output`,
    `  pytest -v:                 PASSED/FAILED TC-XXX in output`,
    ``,
    `Rename your tests to include the TC id, add the @aitri-tc marker, then re-run verify-run.`,
    `verify-complete will block on 0 passing tests.`,
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
    `  Skipped: ${summary.skipped}${summary.skipped > 0 ? ` (${summary.skipped_e2e} e2e/browser, ${summary.skipped_no_marker} no marker detected)` : ''}`,
    `  Manual:  ${summary.manual > 0 ? `${summary.manual_verified}/${summary.manual} verified` : '0'}${summary.manual > 0 && summary.manual_verified < summary.manual ? ` — run: aitri tc verify <TC-ID> --result pass|fail --notes "..."` : ''}`,
    ...coverageLines,
    ...zeroTCsLines,
    ...manifestWarnLines,
    ...assertionWarnLines,
    ``,
    `## Raw test output${isTruncated ? ` (first ${OUTPUT_MAX_LINES} of ${outputLines.length} lines)` : ''}`,
    `\`\`\``,
    displayOutput,
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
    `Detection pattern: ✔/✖ TC-XXX (node:test) and ✓/×/✕ TC-XXX (Vitest/Jest verbose). Auto-detected from runner.`,
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
  const config = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
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

  const testCases = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
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

  // Identify stub TCs (from adopt verify-spec) — they get known-gap prompt instead of hard block
  const stubIds = new Set();
  if (testCases) {
    try {
      const tcsObj = JSON.parse(testCases);
      for (const tc of (tcsObj.test_cases || [])) {
        if (tc.stub === true) stubIds.add(tc.id);
      }
    } catch { /* non-fatal */ }
  }

  const failed      = d.results.filter(r => r.status === 'fail');
  const skippedTCs  = d.results.filter(r => r.status === 'skip');
  const passedTCs   = d.results.filter(r => r.status === 'pass');
  const manualTCs   = d.results.filter(r => r.status === 'manual');

  const failedStubs = failed.filter(r => stubIds.has(r.tc_id));
  const failedReal  = failed.filter(r => !stubIds.has(r.tc_id));

  const failedNoNotes  = failedReal.filter(r => !r.notes?.trim());
  const skippedNoNotes = skippedTCs.filter(r => !r.notes?.trim());
  if (failedNoNotes.length)
    err(`${failedNoNotes.length} failing test(s) have empty notes:\n  ${failedNoNotes.map(r => r.tc_id).join(', ')}`);
  if (skippedNoNotes.length)
    err(`${skippedNoNotes.length} skipped test(s) have empty notes:\n  ${skippedNoNotes.map(r => r.tc_id).join(', ')}`);

  if (skippedTCs.length > 0 && failed.length === 0 && passedTCs.length === 0)
    err(`All ${skippedTCs.length} test(s) are skipped and none passed — at least 1 test must actually run and pass.`);

  if (failedReal.length) {
    const list = failedReal.map(r => `  ✗ ${r.tc_id}${r.notes ? `: ${r.notes}` : ''}`).join('\n');
    err(`${failedReal.length} test(s) failing — fix before proceeding to Phase 5:\n${list}`);
  }

  // Stub TC known-gap handling — prompt human instead of hard block
  if (failedStubs.length) {
    const list = failedStubs.map(r => `  ✗ ${r.tc_id}${r.notes ? ` — ${r.notes.slice(0, 120)}` : ''}`).join('\n');
    process.stdout.write(`\n⚠ ${failedStubs.length} stub TC(s) did not pass (from adopt verify-spec):\n${list}\n`);
    process.stdout.write(`  These represent spec gaps — code may not satisfy these ACs yet.\n`);

    if (!process.stdin.isTTY) {
      err(`Stub TC(s) failing — acknowledge in terminal first.\nRun aitri verify-complete manually to review each gap.`);
    }

    process.stdout.write(`\nMark as known gaps to continue? (y/N): `);
    const answer = readStdinSync(10).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      process.stderr.write(`\n❌ Verify-complete cancelled — fix the failing stubs or re-run to acknowledge.\n`);
      process.exit(1);
    }

    // Mark known_gap in 04_TEST_RESULTS.json for audit trail
    for (const result of d.results) {
      if (stubIds.has(result.tc_id) && result.status === 'fail') {
        result.known_gap = true;
      }
    }
    fs.writeFileSync(resultsPath, JSON.stringify(d, null, 2));
    process.stderr.write(`[aitri] ${failedStubs.length} known gap(s) recorded in 04_TEST_RESULTS.json\n`);
  }

  const uncovered = d.fr_coverage.filter(fr => fr.status === 'uncovered');
  if (uncovered.length) {
    err(`Uncovered FRs — all requirements must have passing tests:\n  ${uncovered.map(f => f.fr_id).join(', ')}`);
  }

  // E2E gate: if Phase 3 has TCs with type "e2e" and none passed → block
  if (testCases) {
    try {
      const tcs = JSON.parse(testCases);
      const e2eTCs = (tcs.test_cases || []).filter(tc => tc.type === 'e2e');
      if (e2eTCs.length > 0) {
        const e2eIds = new Set(e2eTCs.map(tc => tc.id));
        const e2ePassed = (d.results || []).filter(r => e2eIds.has(r.tc_id) && r.status === 'pass');
        if (e2ePassed.length === 0) {
          const skippedIds = (d.results || [])
            .filter(r => e2eIds.has(r.tc_id) && r.status !== 'pass')
            .map(r => r.tc_id);
          err(
            `E2E tests required but none passed — ${e2eTCs.length} E2E TC(s) defined in Phase 3:\n` +
            `  ${skippedIds.slice(0, 10).join(', ')}${skippedIds.length > 10 ? ` (+${skippedIds.length - 10} more)` : ''}\n\n` +
            `aitri verify-run auto-detects Playwright when playwright.config.js exists.\n` +
            `If Playwright failed, check browser installation: npx playwright install\n` +
            `If E2E tests genuinely cannot run in this environment, change their type in Phase 3.`
          );
        }
      }
    } catch { /* parse error already caught above */ }
  }

  // Traceability cross-check: every FR from Phase 1 must be in fr_coverage with ≥1 passing test
  const requirements = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
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
        // FRs with status 'manual' are covered by human execution — don't block on zero automated tests
        return !entry || (entry.tests_passing === 0 && entry.status !== 'manual');
      });
      if (uncoveredPhase1.length)
        err(`Requirement coverage failure — these FRs have zero passing tests:\n  ${uncoveredPhase1.join(', ')}\n  Every requirement from Phase 1 must have ≥1 passing test before Phase 5.`);
    } catch { /* parse error already caught above */ }
  }

  // Block if open bugs are linked to MUST FRs
  const blockingBugs = getBlockingBugs(dir, config);
  if (blockingBugs.length) {
    const list = blockingBugs.map(b => `  ✗ ${b.id} [${b.severity}]: ${b.title}${b.fr ? ` (${b.fr})` : ''}`).join('\n');
    err(`Open critical/high bug(s) must be resolved before Phase 5:\n${list}\n\nRun: aitri bug fix <id> [--tc TC-NNN]  then  aitri bug verify <id>`);
  }

  config.verifyPassed  = true;
  config.verifySummary = d.summary;
  appendEvent(config, 'verify-complete', 'verify', { passed: d.summary?.passed, failed: d.summary?.failed });
  writeLastSession(config, dir, 'verify-complete');
  saveConfig(dir, config);

  const { total, passed, skipped } = d.summary;
  let tcTypeMap = {};
  try { const tcs = JSON.parse(readArtifact(dir, '03_TEST_CASES.json', artifactsDir) || '{}'); (tcs.test_cases || []).forEach(t => { tcTypeMap[t.id] = t.type; }); } catch { /* non-fatal */ }
  const e2eCount = (d.results || []).filter(r => r.status === 'pass' && tcTypeMap[r.tc_id] === 'e2e').length;
  const e2eNote  = e2eCount > 0 ? ` (${passed - e2eCount} unit + ${e2eCount} e2e)` : '';
  const bar = '─'.repeat(60);
  console.log(`✅ Verify passed — ${passed}/${total} tests passing${e2eNote}${skipped ? `, ${skipped} skipped` : ''}${manualTCs.length > 0 ? `, ${manualTCs.length} manual` : ''}`);
  console.log(`\n${bar}`);
  console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
  console.log(`  aitri run-phase 5\n`);
  console.log(`Do NOT write deployment code, skip Phase 5, or modify any files yet.`);
  console.log(`Phase 5 (Deployment — DevOps Engineer) must run next.`);
  console.log(`The pipeline decides the route. You execute it.`);
  console.log(bar);
}
