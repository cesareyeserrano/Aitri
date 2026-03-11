/**
 * Module: Command — verify + verify-complete
 * Purpose: verify: print test execution briefing.
 *          verify-complete: gate — validates 04_TEST_RESULTS.json, unlocks Phase 5.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadConfig, saveConfig, readArtifact } from '../state.js';

export function cmdVerifyRun({ dir, flagValue, err }) {
  const config = loadConfig(dir);
  if (!(config.approvedPhases || []).includes(4)) {
    err(`Phase 4 must be approved before running verify-run.\nRun: aitri approve 4`);
  }

  const manifest = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json');
  if (!manifest) err(`Missing 04_IMPLEMENTATION_MANIFEST.json — complete Phase 4 first.`);

  const testCases = readArtifact(dir, '03_TEST_CASES.json');
  if (!testCases) err(`Missing 03_TEST_CASES.json — complete Phase 3 first.`);

  // Detect test command: --cmd flag > package.json scripts.test > npm test
  let testCmd = flagValue('--cmd');
  if (!testCmd) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.test) testCmd = 'npm test';
      } catch { /* malformed package.json — fall through */ }
    }
    if (!testCmd) testCmd = 'npm test';
  }

  process.stderr.write(`[aitri] Running: ${testCmd}\n`);

  const [bin, ...cmdArgs] = testCmd.split(' ');
  const result = spawnSync(bin, cmdArgs, {
    cwd: dir,
    encoding: 'utf8',
    timeout: 300000, // 5 minutes
    shell: true,
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = [stdout, stderr].filter(Boolean).join('\n');
  const exitCode = result.status ?? 1;

  let tcs;
  try { tcs = JSON.parse(testCases); } catch { err('03_TEST_CASES.json is malformed JSON'); }
  const tcList = tcs.test_cases?.map(tc => `  ${tc.id}: ${tc.title} [${tc.type}]`).join('\n') || '';

  console.log([
    `# Verify Run — Actual Test Output`,
    ``,
    `## Test command`,
    `  ${testCmd}`,
    ``,
    `## Exit code: ${exitCode} ${exitCode === 0 ? '(success)' : '(failure)'}`,
    ``,
    `## Test runner output`,
    `\`\`\``,
    output || '(no output)',
    `\`\`\``,
    ``,
    `## Test Cases to map (from 03_TEST_CASES.json)`,
    tcList,
    ``,
    `## Your task`,
    `Using ONLY the test runner output above — not your memory — map each TC to pass/fail/skip.`,
    `Do not infer pass for a TC unless the output explicitly shows it passed.`,
    ``,
    `## Output: \`${dir}/04_TEST_RESULTS.json\``,
    `Schema:`,
    `{ "executed_at": "ISO8601",`,
    `  "test_runner": "${testCmd}",`,
    `  "results": [{ "tc_id": "TC-001", "status": "pass|fail|skip", "notes": "paste relevant output line" }],`,
    `  "fr_coverage": [{ "fr_id": "FR-001", "tests_passing": 3, "tests_failing": 0, "status": "covered|partial|uncovered" }],`,
    `  "summary": { "total": 0, "passed": 0, "failed": 0, "skipped": 0 } }`,
    ``,
    `## Rules`,
    `- Map TCs based on the output above — evidence only, no inference`,
    `- notes field MUST contain the actual output line that proves pass or explains fail`,
    `- fr_coverage must list every FR from 01_REQUIREMENTS.json`,
    ``,
    `## Instructions`,
    `1. Read the test runner output above carefully`,
    `2. Map each TC-* to pass/fail/skip with the relevant output line in notes`,
    `3. Compute fr_coverage per FR`,
    `4. Save to: ${dir}/04_TEST_RESULTS.json`,
    `5. Run: aitri verify-complete`,
  ].join('\n'));
}

export function cmdVerify({ dir, err }) {
  const config = loadConfig(dir);
  if (!(config.approvedPhases || []).includes(4)) {
    err(`Phase 4 must be approved before running verify.\nRun: aitri approve 4`);
  }

  const testCases = readArtifact(dir, '03_TEST_CASES.json');
  const manifest  = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json');
  if (!testCases) err(`Missing 03_TEST_CASES.json — complete Phase 3 first.`);
  if (!manifest)  err(`Missing 04_IMPLEMENTATION_MANIFEST.json — complete Phase 4 first.`);

  let tcs;
  try { tcs = JSON.parse(testCases); } catch { err('03_TEST_CASES.json is malformed JSON'); }
  try { JSON.parse(manifest); }        catch { err('04_IMPLEMENTATION_MANIFEST.json is malformed JSON'); }

  const tcList = tcs.test_cases?.map(tc => `${tc.id}: ${tc.title} [${tc.type}]`).join('\n  ') || '';

  console.log([
    `# Verify — Test Execution`,
    `Run the full test suite and map every TC result to pass/fail.`,
    ``,
    `## Test Cases to execute (from 03_TEST_CASES.json)`,
    `  ${tcList}`,
    ``,
    `## Test runner`,
    `Check package.json / Makefile / README for the test command.`,
    `Common: npm test | pytest | go test ./... | jest`,
    ``,
    `## Output: \`${dir}/04_TEST_RESULTS.json\``,
    `Schema:`,
    `{ "executed_at": "ISO8601",`,
    `  "test_runner": "npm test",`,
    `  "results": [{ "tc_id": "TC-001", "status": "pass|fail|skip", "notes": "" }],`,
    `  "fr_coverage": [{ "fr_id": "FR-001", "tests_passing": 3, "tests_failing": 0, "status": "covered|partial|uncovered" }],`,
    `  "summary": { "total": 0, "passed": 0, "failed": 0, "skipped": 0 } }`,
    ``,
    `## Rules`,
    `- Every TC-* from 03_TEST_CASES.json must have a result entry`,
    `- fr_coverage must list every FR-* from 01_REQUIREMENTS.json`,
    `- Do not infer pass — only mark pass if the test actually ran and passed`,
    `- Skip is acceptable with a reason in notes`,
    `- For every fail or skip result: notes MUST contain the actual error output from the test runner`,
    `  ❌ notes: ""  ← rejected — empty notes on a fail hides root cause`,
    `  ✅ notes: "AssertionError: expected 401, got 200 at auth.test.js:42"`,
    ``,
    `## Instructions`,
    `1. Run the test suite`,
    `2. Map each TC-* to pass/fail/skip based on actual output`,
    `3. Compute fr_coverage per FR (how many TCs pass vs fail)`,
    `4. Save to: ${dir}/04_TEST_RESULTS.json`,
    `5. Run: aitri verify-complete`,
  ].join('\n'));
}

export function cmdVerifyComplete({ dir, err }) {
  const resultsPath = path.join(dir, '04_TEST_RESULTS.json');
  if (!fs.existsSync(resultsPath)) {
    err(`04_TEST_RESULTS.json not found.\nRun: aitri verify  then save the results file.`);
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

  const failed = d.results.filter(r => r.status === 'fail');
  const failedNoNotes = failed.filter(r => !r.notes?.trim());
  if (failedNoNotes.length)
    err(`${failedNoNotes.length} failing test(s) have empty notes — paste actual test runner error output in notes:\n  ${failedNoNotes.map(r => r.tc_id).join(', ')}`);

  if (failed.length) {
    const list = failed.map(r => `  ✗ ${r.tc_id}${r.notes ? `: ${r.notes}` : ''}`).join('\n');
    err(`${failed.length} test(s) failing — fix before proceeding to Phase 5:\n${list}`);
  }

  const uncovered = d.fr_coverage.filter(fr => fr.status === 'uncovered');
  if (uncovered.length) {
    err(`Uncovered FRs — all requirements must have passing tests:\n  ${uncovered.map(f => f.fr_id).join(', ')}`);
  }

  const config = loadConfig(dir);
  config.verifyPassed    = true;
  config.verifyTimestamp = new Date().toISOString();
  config.verifySummary   = d.summary;
  saveConfig(dir, config);

  const { total, passed, skipped } = d.summary;
  console.log(`✅ Verify passed — ${passed}/${total} tests passing${skipped ? `, ${skipped} skipped` : ''}`);
  console.log(`\n→ Next: aitri run-phase 5  (Deployment — DevOps Engineer)`);
}
