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
import path from 'path';
import { loadConfig, saveConfig, artifactPath, hashArtifact } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
// Pure result-file parser + fr_coverage builder, reused so --evidence can mechanically
// confirm a claim and so recording a result keeps fr_coverage in sync with the summary
// (verify.js does not import tc.js — no cycle).
import { parseXmlResults, buildFRCoverage } from './verify.js';

// Shared result-recording logic — used by both the explicit `tc verify <TC> --result`
// path and the guided `tc verify` checklist, so they stay identical.
function recomputeSummary(d) {
  const all            = d.results || [];
  const manualVerified = all.filter(r => r.verified_manually);
  d.summary = {
    ...d.summary,
    passed:          all.filter(r => r.status === 'pass').length,
    failed:          all.filter(r => r.status === 'fail').length,
    skipped:         all.filter(r => r.status === 'skip').length,
    // Count manual by STATUS, so the buckets partition the results and
    // passed+failed+skipped+manual === total (the documented contract). A manual TC
    // that was `tc verify`'d carries status pass/fail — counted there, NOT here.
    // (Was `status==='manual' || verified_manually`, which double-counted a verified
    // manual TC in both passed and manual. Matches verify.js recomputeSummary.)
    manual:          all.filter(r => r.status === 'manual').length,
    // Separate advisory (overlaps passed/failed): how many manual TCs were verified.
    manual_verified: manualVerified.length,
  };
}

function applyResult(d, entry, result, notes, evidence) {
  entry.status            = result;
  entry.notes             = notes || entry.notes;
  entry.verified_manually = true;
  entry.verified_at       = new Date().toISOString();
  if (evidence) entry.evidence = evidence;
  recomputeSummary(d);
}

// Recompute fr_coverage from the (now-updated) results so the artifact does not
// contradict itself: recomputeSummary already moves a verified manual TC into the
// passed count, but fr_coverage was left frozen at verify-run time (status "manual",
// 0 passing) — Hub then reads "summary: 1 passed" next to "FR-001: 0 passing, manual".
// Rebuild it from 03_TEST_CASES (TC→FR map) + 01_REQUIREMENTS (FR ids). Non-fatal:
// if either artifact is unreadable, leave fr_coverage as-is.
function recomputeFRCoverage(d, dir, config) {
  try {
    const tcs  = JSON.parse(fs.readFileSync(artifactPath(dir, config, '03_TEST_CASES.json'), 'utf8'));
    const reqs = JSON.parse(fs.readFileSync(artifactPath(dir, config, '01_REQUIREMENTS.json'), 'utf8'));
    const frIds = (reqs.functional_requirements || []).map(fr => fr.id).filter(Boolean);
    if (!frIds.length) return;
    d.fr_coverage = buildFRCoverage(d.results || [], tcs.test_cases || [], frIds);
  } catch { /* non-fatal — keep existing fr_coverage */ }
}

// Join 03_TEST_CASES.json so the guided checklist can tell the human WHAT to check.
function loadTCMeta(dir, config) {
  const meta = {};
  try {
    const tcs = JSON.parse(fs.readFileSync(artifactPath(dir, config, '03_TEST_CASES.json'), 'utf8'));
    for (const tc of (tcs.test_cases || [])) {
      meta[tc.id] = { title: tc.title || '', expected: tc.expected_result || tc.expected || '', reason: tc.manual_reason || '' };
    }
  } catch { /* non-fatal — guided mode still works with ids alone */ }
  return meta;
}

export function cmdTC({ dir, args, flagValue, err }) {
  const sub = args[0];
  if (sub === 'verify')      return tcVerify({ dir, args: args.slice(1), flagValue, err });
  if (sub === 'mark-manual') return tcMarkManual({ dir, args: args.slice(1), flagValue, err });
  err(
    `Unknown tc sub-command: "${sub || '(none)'}"\n\n` +
    `Usage:\n` +
    `  aitri tc verify                                            (guided — walk the pending manual TCs)\n` +
    `  aitri tc verify <TC-ID> --result pass|fail --notes "..." [--evidence <path>]\n` +
    `  aitri tc mark-manual <TC-ID> [--reason "why it can't be automated"]`
  );
}

function tcVerify({ dir, args, flagValue, err }) {
  const tcId = args[0];
  // No TC id → guided checklist mode (the human-friendly path: aitri lists what to
  // check and the human answers p/f/s per item). The explicit per-TC form below
  // stays for scripts/agents (fully scriptable — non-TTY never prompts).
  if (!tcId) return tcVerifyGuided({ dir, err });

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

  // --evidence is the escape hatch for an AUTOMATED TC whose runner output Aitri
  // could not parse (e.g. a stack with no TRX/JUnit adapter). It is NOT a free
  // attestation: a real file must exist on disk, so the override is anchored to a
  // tangible artifact, not the agent's word. Without it, the manual-only gate
  // stands — an automated TC must be `tc mark-manual`'d first.
  const evidenceFlag = flagValue('--evidence');
  let evidencePath = null;
  if (evidenceFlag) {
    evidencePath = path.isAbsolute(evidenceFlag) ? evidenceFlag : path.join(dir, evidenceFlag);
    if (!fs.existsSync(evidencePath))
      err(`--evidence file not found: ${evidencePath}\n  Pass a path to the runner result file or evidence log you are attesting from.`);
    // If the evidence is a parseable results file (TRX / JUnit-XML), confirm it
    // actually backs the claim — turn "a file exists" into mechanical verification.
    // A non-parseable evidence file (a log, a screenshot) stays the honor-system floor.
    let xml = '';
    try { xml = fs.readFileSync(evidencePath, 'utf8'); } catch { /* binary/unreadable → floor */ }
    const parsed = parseXmlResults(xml);
    if (parsed.size > 0) {
      const found = parsed.get(tcId);
      if (!found)
        err(`--evidence "${evidenceFlag}" is a results file but does not report ${tcId} — it cannot substantiate a result for a TC it does not contain. Point at the file that actually ran ${tcId}, or use a non-results evidence file.`);
      if (found.status !== result)
        err(`--evidence contradicts --result: you claim "${result}" for ${tcId}, but "${evidenceFlag}" reports "${found.status}". Fix the result or the evidence.`);
      // matches → mechanically confirmed, not honor-system
    }
  }

  if (entry.status !== 'manual' && !entry.verified_manually && !evidenceFlag)
    err(
      `"${tcId}" is not a manual TC (current status: "${entry.status}").\n` +
      `Only TCs with automation: "manual" in 03_TEST_CASES.json can be verified this way.\n` +
      `If the runner ran it but Aitri could not parse the output, either:\n` +
      `  • re-run with a structured result file: aitri verify-run --results <file|dir>, or\n` +
      `  • record it against evidence: aitri tc verify ${tcId} --result ${result} --notes "..." --evidence <path>`
    );

  applyResult(d, entry, result, notes, evidenceFlag);
  recomputeFRCoverage(d, dir, config);

  fs.writeFileSync(resultsPath, JSON.stringify(d, null, 2));

  // Sync verifySummary in .aitri so aitri resume shows updated numbers
  config.verifySummary = d.summary;
  saveConfig(dir, config);

  const symbol = result === 'pass' ? '✅' : '❌';
  const how = evidenceFlag ? 'evidence-backed' : 'manual verification';
  process.stdout.write(`${symbol} ${tcId} recorded as ${result} (${how})\n`);
  if (evidenceFlag) process.stdout.write(`   Evidence: ${evidenceFlag}\n`);
  if (notes) process.stdout.write(`   Notes: ${notes}\n`);

  const stillPending = (d.results || []).filter(r => r.status === 'manual');
  if (stillPending.length > 0) {
    process.stdout.write(`\n  ${stillPending.length} manual TC(s) still unverified:\n`);
    for (const r of stillPending) {
      process.stdout.write(`    ${r.tc_id}\n`);
    }
    process.stdout.write(`  Run: aitri tc verify  (guided) — or: aitri tc verify <TC-ID> --result pass|fail --notes "..."\n`);
  } else {
    const all = d.results || [];
    const totalPassed = all.filter(r => r.status === 'pass').length;
    process.stdout.write(`\n  All manual TCs verified. Total passing: ${totalPassed}/${all.length}\n`);
    process.stdout.write(`  Run: aitri verify-complete\n`);
  }
}

// Guided manual verification: list the pending manual TCs with WHAT to check, and
// (when a human is at the terminal) walk them one by one — p/f/s per item — instead
// of making the human type a long command per TC. Non-TTY prints the checklist and
// the explicit command, never prompts (stays scriptable).
function tcVerifyGuided({ dir, err }) {
  const config = loadConfig(dir);
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  if (!fs.existsSync(resultsPath))
    err('04_TEST_RESULTS.json not found — run: aitri verify-run first');

  let d;
  try { d = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); }
  catch { err('04_TEST_RESULTS.json is malformed JSON — fix and retry'); }

  const all     = d.results || [];
  const pending = all.filter(r => r.status === 'manual');

  // Manual-share signal (read-only preview of the hardening idea): surface how much
  // of the suite leans on a human, so an over-use of manual is visible. Never blocks.
  const manualShare = all.filter(r => r.status === 'manual' || r.verified_manually).length;
  if (all.length > 0 && manualShare === all.length)
    process.stdout.write(`⚠  All ${all.length} test case(s) are manual — there are no automated tests. Confirm this is intended (e.g. the project's no_go_zone forbids an automated suite).\n\n`);
  else if (manualShare > 0)
    process.stdout.write(`ℹ  ${manualShare} of ${all.length} test case(s) rely on manual verification.\n\n`);

  if (pending.length === 0) {
    process.stdout.write('✅ No pending manual TCs — nothing to verify by hand.\n');
    return;
  }

  const meta = loadTCMeta(dir, config);
  const describe = (r) => {
    const m = meta[r.tc_id] || {};
    const head = m.title ? `${r.tc_id} — ${m.title}` : r.tc_id;
    const lines = [head];
    if (m.expected) lines.push(`      Expected: ${m.expected}`);
    lines.push(m.reason ? `      Manual because: ${m.reason}` : `      Manual because: ⚠ no reason given (mark-manual --reason)`);
    return lines.join('\n');
  };

  // Advisory (never blocks): how many pending manual TCs have no stated reason? A
  // reviewer reads this to spot automation an agent quietly pushed to the human.
  const noReason = pending.filter(r => !(meta[r.tc_id] || {}).reason).length;
  if (noReason > 0)
    process.stdout.write(`⚠  ${noReason} of ${pending.length} pending manual TC(s) have no stated reason — a reviewer can't tell a justified manual test from skipped automation. Add one with: aitri tc mark-manual <TC-ID> --reason "..."\n\n`);

  // Non-interactive: print the checklist + how to record; never prompt without a human.
  if (!process.stdin.isTTY) {
    process.stdout.write(`Pending manual test cases (${pending.length}):\n\n`);
    pending.forEach((r, i) => process.stdout.write(`  [${i + 1}] ${describe(r)}\n`));
    process.stdout.write(`\nRecord each (non-interactive): aitri tc verify <TC-ID> --result pass|fail --notes "..."\n`);
    return;
  }

  // Interactive guided loop.
  process.stdout.write(`Manual verification — ${pending.length} test case(s) to check. Answer (p)ass / (f)ail / (s)kip for each.\n\n`);
  let done = 0;
  for (const r of pending) {
    process.stdout.write(`${describe(r)}\n`);
    let ans = '';
    while (!['p', 'f', 's'].includes(ans)) {
      process.stdout.write(`  ${r.tc_id} → (p)ass / (f)ail / (s)kip? `);
      ans = readStdinSync(10).trim().toLowerCase().charAt(0);
    }
    if (ans === 's') { process.stdout.write(`  ↷ skipped (still pending)\n\n`); continue; }
    process.stdout.write(`  note (optional, Enter to skip): `);
    const note = readStdinSync(500).trim();
    const result = ans === 'p' ? 'pass' : 'fail';
    applyResult(d, r, result, note || `Manually verified (${result}).`, null);
    done++;
    process.stdout.write(`  ${result === 'pass' ? '✅' : '❌'} recorded\n\n`);
  }

  if (done > 0) {
    recomputeFRCoverage(d, dir, config);
    fs.writeFileSync(resultsPath, JSON.stringify(d, null, 2));
    config.verifySummary = d.summary;
    saveConfig(dir, config);
  }
  const stillPending = (d.results || []).filter(r => r.status === 'manual').length;
  process.stdout.write(`Done — ${done} recorded, ${stillPending} still pending.\n`);
  if (stillPending === 0 && done > 0) process.stdout.write(`  Next: aitri verify-complete\n`);
}

function tcMarkManual({ dir, args, flagValue, err }) {
  const tcId = args[0];
  if (!tcId) err('TC ID required.\n  Usage: aitri tc mark-manual <TC-ID> [--reason "why it can\'t be automated"]');

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

  // manual_reason (additive, optional): WHY this test can't be automated. It is not
  // a gate — a reviewer reads it to tell a justified manual test (needs real SSO
  // creds, physical device) from automation an agent quietly skipped. Surfaced in the
  // guided checklist; its ABSENCE is flagged there, never blocked.
  const reason = (flagValue && flagValue('--reason') || '').trim();
  const alreadyManual = tc.automation === 'manual';
  if (alreadyManual && !reason) {
    process.stdout.write(`✅ ${tcId} is already marked manual. (no change — pass --reason to add why it can't be automated)\n`);
    return;
  }

  tc.automation = 'manual';
  if (reason) tc.manual_reason = reason;
  fs.writeFileSync(tcsPath, JSON.stringify(d, null, 2));

  // mark-manual is itself the operator authorization for this scoped field
  // edit — re-stamping the Phase 3 hash here is intentional, not the same as
  // `aitri rehash` (which gates over arbitrary content drift).
  if ((config.artifactHashes || {})['3']) {
    const newHash = hashArtifact(fs.readFileSync(tcsPath, 'utf8'));
    config.artifactHashes = { ...config.artifactHashes, '3': newHash };
  }
  saveConfig(dir, config);

  process.stdout.write(`✅ ${tcId} marked as automation: "manual"${reason ? ` — reason: ${reason}` : ''}\n`);
  if (!reason)
    process.stdout.write(`   ⚠ No reason given. Add --reason "why this can't be automated" so a reviewer can tell a justified manual test from skipped automation.\n`);
  process.stdout.write(`   Run: aitri tc verify ${tcId} --result pass|fail --notes "..."  (after manual execution)\n`);
}
