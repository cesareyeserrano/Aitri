/**
 * Module: Command — tc
 * Purpose: Record manual TC execution results into 04_TEST_RESULTS.json,
 *          and mark a TC as manual in 03_TEST_CASES.json.
 *
 * Manual TCs (automation: "manual" in 03_TEST_CASES.json) are excluded from
 * the automated runner gate but can be verified by a human via this command.
 * Verified results count toward the total pass score.
 *
 * Usage:
 *   aitri tc verify <TC-ID> --result pass|fail --notes "description of what was observed"
 *   aitri tc mark-manual <TC-ID>
 */

import fs from 'fs';
import { loadConfig, saveConfig, artifactPath, hashArtifact } from '../state.js';

export function cmdTC({ dir, args, flagValue, err }) {
  const sub = args[0];
  if (sub === 'verify')      return tcVerify({ dir, args: args.slice(1), flagValue, err });
  if (sub === 'mark-manual') return tcMarkManual({ dir, args: args.slice(1), err });
  err(
    `Unknown tc sub-command: "${sub || '(none)'}"\n\n` +
    `Usage:\n` +
    `  aitri tc verify <TC-ID> --result pass|fail --notes "..."\n` +
    `  aitri tc mark-manual <TC-ID>`
  );
}

function tcVerify({ dir, args, flagValue, err }) {
  const tcId = args[0];
  if (!tcId) err('TC ID required.\n  Usage: aitri tc verify <TC-ID> --result pass|fail --notes "..."');

  const result = flagValue('--result');
  if (!result) err('--result is required.\n  Values: pass | fail');
  if (result !== 'pass' && result !== 'fail')
    err(`--result must be "pass" or "fail", got: "${result}"`);

  const notes = flagValue('--notes');
  if (!notes || !notes.trim())
    err('--notes is required — describe what you observed during manual execution.\n  Example: aitri tc verify TC-002f --result pass --notes "pip freeze 3.12 vs 3.14 difiere en 8 paquetes"');

  const config   = loadConfig(dir);
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');

  if (!fs.existsSync(resultsPath))
    err('04_TEST_RESULTS.json not found — run: aitri verify-run first');

  let d;
  try { d = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); }
  catch { err('04_TEST_RESULTS.json is malformed JSON — fix and retry'); }

  const entry = (d.results || []).find(r => r.tc_id === tcId);
  if (!entry)
    err(`"${tcId}" not found in 04_TEST_RESULTS.json — check the TC ID and re-run verify-run if needed`);

  if (entry.status !== 'manual' && !entry.verified_manually)
    err(
      `"${tcId}" is not a manual TC (current status: "${entry.status}").\n` +
      `Only TCs with automation: "manual" in 03_TEST_CASES.json can be verified this way.`
    );

  const wasStatus = entry.status;
  entry.status           = result;
  entry.notes            = notes || entry.notes;
  entry.verified_manually = true;
  entry.verified_at      = new Date().toISOString();

  // Recompute summary after updating the entry
  const allResults       = d.results || [];
  const manualAll        = allResults.filter(r => r.status === 'manual' || r.verified_manually);
  const manualVerified   = allResults.filter(r => r.verified_manually);
  const skippedResults   = allResults.filter(r => r.status === 'skip');

  d.summary = {
    ...d.summary,
    passed:           allResults.filter(r => r.status === 'pass').length,
    failed:           allResults.filter(r => r.status === 'fail').length,
    skipped:          skippedResults.length,
    manual:           manualAll.length,
    manual_verified:  manualVerified.length,
  };

  fs.writeFileSync(resultsPath, JSON.stringify(d, null, 2));

  // Sync verifySummary in .aitri so aitri resume shows updated numbers
  config.verifySummary = d.summary;
  saveConfig(dir, config);

  const symbol = result === 'pass' ? '✅' : '❌';
  process.stdout.write(`${symbol} ${tcId} recorded as ${result} (manual verification)\n`);
  if (notes) process.stdout.write(`   Notes: ${notes}\n`);

  const stillPending = allResults.filter(r => r.status === 'manual');
  if (stillPending.length > 0) {
    process.stdout.write(`\n  ${stillPending.length} manual TC(s) still unverified:\n`);
    for (const r of stillPending) {
      process.stdout.write(`    ${r.tc_id}\n`);
    }
    process.stdout.write(`  Run: aitri tc verify <TC-ID> --result pass|fail --notes "..."\n`);
  } else {
    const totalPassed = allResults.filter(r => r.status === 'pass').length;
    process.stdout.write(`\n  All manual TCs verified. Total passing: ${totalPassed}/${allResults.length}\n`);
    process.stdout.write(`  Run: aitri verify-complete\n`);
  }

  void wasStatus; // suppress unused-var hint — kept for future audit logging
}

function tcMarkManual({ dir, args, err }) {
  const tcId = args[0];
  if (!tcId) err('TC ID required.\n  Usage: aitri tc mark-manual <TC-ID>');

  const config  = loadConfig(dir);
  const tcsPath = artifactPath(dir, config, '03_TEST_CASES.json');

  if (!fs.existsSync(tcsPath))
    err('03_TEST_CASES.json not found — Phase 3 has not produced test cases yet.');

  let d;
  try { d = JSON.parse(fs.readFileSync(tcsPath, 'utf8')); }
  catch { err('03_TEST_CASES.json is malformed JSON — fix and retry'); }

  const tc = (d.test_cases || []).find(t => t.id === tcId);
  if (!tc)
    err(`"${tcId}" not found in 03_TEST_CASES.json — check the TC ID`);

  if (tc.automation === 'manual') {
    process.stdout.write(`✅ ${tcId} is already marked manual. (no change)\n`);
    return;
  }

  tc.automation = 'manual';
  fs.writeFileSync(tcsPath, JSON.stringify(d, null, 2));

  // mark-manual is itself the operator authorization for this scoped field
  // edit — re-stamping the Phase 3 hash here is intentional, not the same as
  // `aitri rehash` (which gates over arbitrary content drift).
  if ((config.artifactHashes || {})['3']) {
    const newHash = hashArtifact(fs.readFileSync(tcsPath, 'utf8'));
    config.artifactHashes = { ...config.artifactHashes, '3': newHash };
  }
  saveConfig(dir, config);

  process.stdout.write(`✅ ${tcId} marked as automation: "manual"\n`);
  process.stdout.write(`   Run: aitri tc verify ${tcId} --result pass|fail --notes "..."  (after manual execution)\n`);
}
