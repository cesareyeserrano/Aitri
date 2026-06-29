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
import { loadConfig, saveConfig, artifactPath, readArtifactFile, atomicWrite, hashArtifact } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
// Pure result-file parser + fr_coverage builder, reused so --evidence can mechanically
// confirm a claim and so recording a result keeps fr_coverage in sync with the summary
// (verify.js does not import tc.js — no cycle).
import { parseXmlResults, buildFRCoverage, buildACCoverage } from './verify.js';

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
    const tcs  = JSON.parse(readArtifactFile(artifactPath(dir, config, '03_TEST_CASES.json')));
    const reqs = JSON.parse(readArtifactFile(artifactPath(dir, config, '01_REQUIREMENTS.json')));
    const frIds = (reqs.functional_requirements || []).map(fr => fr.id).filter(Boolean);
    if (!frIds.length) return;
    d.fr_coverage = buildFRCoverage(d.results || [], tcs.test_cases || [], frIds);
  } catch { /* non-fatal — keep existing fr_coverage */ }
}

// Twin of recomputeFRCoverage for the skip partition. ARTIFACTS.md documents the invariant
// skipped_e2e + skipped_no_marker === skipped. recomputeSummary recomputes `skipped` from
// current statuses but carries the two partition fields forward stale (the spread keeps the
// verify-run snapshot) — so a skip→pass/fail transition via `tc verify` left
// skipped_e2e + skipped_no_marker > skipped (C-2, 2026-06-28). Reclassify the current skip
// results by TC type exactly as verify.js does at write time. Only when the partition fields
// already exist (never invent them on an artifact that lacked them — matches recomputeACCoverage).
function recomputeSkipPartition(d, dir, config) {
  if (!d.summary || !('skipped_e2e' in d.summary)) return;
  // Build the TC-type map best-effort; an absent/malformed 03_TEST_CASES leaves it empty.
  let typeById = new Map();
  try {
    const tcs = JSON.parse(readArtifactFile(artifactPath(dir, config, '03_TEST_CASES.json')));
    typeById = new Map((tcs.test_cases || []).map(tc => [tc.id, tc.type]));
  } catch { /* non-fatal — type unknown; every skip falls to no_marker below */ }
  // Recompute UNCONDITIONALLY (outside the try): recomputeSummary already refreshed `skipped`,
  // so the partition MUST follow or the invariant skipped_e2e + skipped_no_marker === skipped
  // breaks again — the exact bug C-2 fixes. With an empty map every skip falls to no_marker
  // (undefined type !== 'e2e'), matching how verify.js classifies a TC missing from
  // 03_TEST_CASES — so the partition stays consistent even when the type map is unavailable.
  const skipped = (d.results || []).filter(r => r.status === 'skip');
  d.summary.skipped_e2e       = skipped.filter(r => typeById.get(r.tc_id) === 'e2e').length;
  d.summary.skipped_no_marker = skipped.filter(r => typeById.get(r.tc_id) !== 'e2e').length;
}

// Twin of recomputeFRCoverage for AC-level coverage (ADR-041). tc verify recomputed
// fr_coverage but NOT ac_coverage, so a tc-verified FAIL on the only test of an acceptance
// criterion stayed "covered" in ac_coverage and shipped deployable (R3-8). Only recompute
// when the artifact already carries ac_coverage (structured ACs declared) — never invent it.
function recomputeACCoverage(d, dir, config) {
  if (!Array.isArray(d.ac_coverage) || d.ac_coverage.length === 0) return;
  try {
    const tcs  = JSON.parse(readArtifactFile(artifactPath(dir, config, '03_TEST_CASES.json')));
    const reqs = JSON.parse(readArtifactFile(artifactPath(dir, config, '01_REQUIREMENTS.json')));
    const rebuilt = buildACCoverage(d.results || [], tcs.test_cases || [], reqs);
    if (rebuilt.length) d.ac_coverage = rebuilt;
  } catch { /* non-fatal — keep existing ac_coverage */ }
}

// Interpret one keystroke-line from the guided checklist. Exported + pure so the EOF
// path is testable without a TTY. A 0-byte read means stdin is CLOSED (Ctrl-D / piped
// EOF): readStdinSync returns '' with no EAGAIN, so re-prompting on it busy-spins
// forever (FB-MULTI-0619 #4). Distinguish that ('eof') from a blank Enter ('' after
// trim, but a real '\n' byte → null = re-prompt) and from a valid answer.
//   raw === ''           → 'eof'   (stop, don't spin)
//   trimmed first char p/f/s → that letter
//   anything else (incl. blank Enter) → null (re-prompt)
export function parseGuidedAnswer(raw) {
  if (raw === '') return 'eof';
  const c = raw.trim().toLowerCase().charAt(0);
  return ['p', 'f', 's'].includes(c) ? c : null;
}

// Join 03_TEST_CASES.json so the guided checklist can tell the human WHAT to check.
function loadTCMeta(dir, config) {
  const meta = {};
  try {
    const tcs = JSON.parse(readArtifactFile(artifactPath(dir, config, '03_TEST_CASES.json')));
    for (const tc of (tcs.test_cases || [])) {
      meta[tc.id] = { title: tc.title || '', expected: tc.expected_result || tc.expected || '', reason: tc.manual_reason || '', downgraded: tc.downgraded_from || '' };
    }
  } catch { /* non-fatal — guided mode still works with ids alone */ }
  return meta;
}

// Scope-aware next-step command strings. Root → `aitri tc verify`; feature →
// `aitri feature tc <name> verify` (the name precedes the tc sub-verb, per the
// `feature <verb> <name> [rest]` grammar). cmdTC is dispatched with featureCtx in
// feature scope, so its OWN hints must self-scope — emitting the root form from a
// feature would point the operator at the wrong pipeline (FEAT-PARITY-0620).
function scopeCmds(featureRoot, scopeName) {
  const sv = featureRoot ? 'feature ' : '';
  const sa = featureRoot ? ` ${scopeName}` : '';
  const tcBase = featureRoot ? `aitri feature tc ${scopeName}` : 'aitri tc';
  return {
    tcVerify:       `${tcBase} verify`,
    tcMarkManual:   `${tcBase} mark-manual`,
    verifyComplete: `aitri ${sv}verify-complete${sa}`,
    verifyRun:      `aitri ${sv}verify-run${sa}`,
  };
}

export function cmdTC({ dir, args, flagValue, err, featureRoot, scopeName }) {
  const sub = args[0];
  if (sub === 'verify')      return tcVerify({ dir, args: args.slice(1), flagValue, err, featureRoot, scopeName });
  if (sub === 'mark-manual') return tcMarkManual({ dir, args: args.slice(1), flagValue, err, featureRoot, scopeName });
  const c = scopeCmds(featureRoot, scopeName);
  err(
    `Unknown tc sub-command: "${sub || '(none)'}"\n\n` +
    `Usage:\n` +
    `  ${c.tcVerify}                                            (guided — walk the pending manual TCs)\n` +
    `  ${c.tcVerify} <TC-ID> --result pass|fail --notes "..." [--evidence <path>]\n` +
    `  ${c.tcMarkManual} <TC-ID> [--reason "why it can't be automated"]`
  );
}

function tcVerify({ dir, args, flagValue, err, featureRoot, scopeName }) {
  const tcId = args[0];
  // No TC id → guided checklist mode (the human-friendly path: aitri lists what to
  // check and the human answers p/f/s per item). The explicit per-TC form below
  // stays for scripts/agents (fully scriptable — non-TTY never prompts).
  if (!tcId) return tcVerifyGuided({ dir, err, featureRoot, scopeName });

  const c = scopeCmds(featureRoot, scopeName);
  const result = flagValue('--result');
  if (!result) err('--result is required.\n  Values: pass | fail');
  if (result !== 'pass' && result !== 'fail')
    err(`--result must be "pass" or "fail", got: "${result}"`);

  const notes = flagValue('--notes');
  if (!notes || !notes.trim())
    err(`--notes is required — describe what you observed during manual execution.\n  Example: ${c.tcVerify} TC-002f --result pass --notes "pip freeze on 3.12 vs 3.14 differs in 8 packages"`);

  const config   = loadConfig(dir);
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');

  if (!fs.existsSync(resultsPath))
    err(`04_TEST_RESULTS.json not found — run: ${c.verifyRun} first`);

  let d;
  try { d = JSON.parse(readArtifactFile(resultsPath)); }
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
      `  • re-run with a structured result file: ${c.verifyRun} --results <file|dir>, or\n` +
      `  • record it against evidence: ${c.tcVerify} ${tcId} --result ${result} --notes "..." --evidence <path>`
    );

  applyResult(d, entry, result, notes, evidenceFlag);
  recomputeFRCoverage(d, dir, config);
  recomputeACCoverage(d, dir, config);
  recomputeSkipPartition(d, dir, config);

  const resultsJson = JSON.stringify(d, null, 2);
  atomicWrite(resultsPath, resultsJson);

  // Sync verifySummary in .aitri so aitri resume shows updated numbers, and re-stamp the
  // run-binding hash so verify-complete still accepts this file after a legitimate manual
  // verification edit (Finding 1) — tc verify is an authorized writer of the results file.
  config.verifySummary = d.summary;
  config.verifyResultsHash = hashArtifact(resultsJson);
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
    process.stdout.write(`  Run: ${c.tcVerify}  (guided) — or: ${c.tcVerify} <TC-ID> --result pass|fail --notes "..."\n`);
  } else {
    const all = d.results || [];
    const totalPassed = all.filter(r => r.status === 'pass').length;
    process.stdout.write(`\n  All manual TCs verified. Total passing: ${totalPassed}/${all.length}\n`);
    process.stdout.write(`  Run: ${c.verifyComplete}\n`);
  }
}

// Guided manual verification: list the pending manual TCs with WHAT to check, and
// (when a human is at the terminal) walk them one by one — p/f/s per item — instead
// of making the human type a long command per TC. Non-TTY prints the checklist and
// the explicit command, never prompts (stays scriptable).
function tcVerifyGuided({ dir, err, featureRoot, scopeName }) {
  const c = scopeCmds(featureRoot, scopeName);
  const config = loadConfig(dir);
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  if (!fs.existsSync(resultsPath))
    err(`04_TEST_RESULTS.json not found — run: ${c.verifyRun} first`);

  let d;
  try { d = JSON.parse(readArtifactFile(resultsPath)); }
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
    if (m.downgraded) lines.push(`      ⚠ downgraded from "${m.downgraded}" — a runner reported this TC as ${m.downgraded}; verify it honestly`);
    return lines.join('\n');
  };

  // Advisory (never blocks): how many pending manual TCs have no stated reason? A
  // reviewer reads this to spot automation an agent quietly pushed to the human.
  const noReason = pending.filter(r => !(meta[r.tc_id] || {}).reason).length;
  if (noReason > 0)
    process.stdout.write(`⚠  ${noReason} of ${pending.length} pending manual TC(s) have no stated reason — a reviewer can't tell a justified manual test from skipped automation. Add one with: ${c.tcMarkManual} <TC-ID> --reason "..."\n\n`);

  // Non-interactive: print the checklist + how to record; never prompt without a human.
  if (!process.stdin.isTTY) {
    process.stdout.write(`Pending manual test cases (${pending.length}):\n\n`);
    pending.forEach((r, i) => process.stdout.write(`  [${i + 1}] ${describe(r)}\n`));
    process.stdout.write(`\nRecord each (non-interactive): ${c.tcVerify} <TC-ID> --result pass|fail --notes "..."\n`);
    return;
  }

  // Interactive guided loop.
  process.stdout.write(`Manual verification — ${pending.length} test case(s) to check. Answer (p)ass / (f)ail / (s)kip for each.\n\n`);
  let done = 0;
  let eofAbort = false;
  for (const r of pending) {
    process.stdout.write(`${describe(r)}\n`);
    let ans = null;
    while (ans === null) {
      process.stdout.write(`  ${r.tc_id} → (p)ass / (f)ail / (s)kip? `);
      const decision = parseGuidedAnswer(readStdinSync(10));
      if (decision === 'eof') { eofAbort = true; break; }   // closed stdin (Ctrl-D) — do NOT spin
      if (decision) ans = decision;                          // 'p'/'f'/'s' → proceed; null → re-prompt
    }
    if (eofAbort) {
      process.stdout.write(`\n  ↷ input closed (EOF) — stopping; remaining TC(s) still pending.\n`);
      break;
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
    recomputeACCoverage(d, dir, config);
    recomputeSkipPartition(d, dir, config);
    const resultsJson = JSON.stringify(d, null, 2);
    atomicWrite(resultsPath, resultsJson);
    config.verifySummary = d.summary;
    config.verifyResultsHash = hashArtifact(resultsJson); // re-stamp run-binding (Finding 1)
    saveConfig(dir, config);
  }
  const stillPending = (d.results || []).filter(r => r.status === 'manual').length;
  process.stdout.write(`Done — ${done} recorded, ${stillPending} still pending.\n`);
  if (stillPending === 0 && done > 0) process.stdout.write(`  Next: ${c.verifyComplete}\n`);
}

function tcMarkManual({ dir, args, flagValue, err, featureRoot, scopeName }) {
  const c = scopeCmds(featureRoot, scopeName);
  const tcId = args[0];
  if (!tcId) err(`TC ID required.\n  Usage: ${c.tcMarkManual} <TC-ID> [--reason "why it can't be automated"]`);

  const config  = loadConfig(dir);
  const tcsPath = artifactPath(dir, config, '03_TEST_CASES.json');

  if (!fs.existsSync(tcsPath))
    err('03_TEST_CASES.json not found — Phase 3 has not produced test cases yet.');

  let d;
  try { d = JSON.parse(readArtifactFile(tcsPath)); }
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

  // ADV-0622-05: downgrading a TC the runner already reported as FAIL or SKIP to "manual" is the
  // laundering move (relabel a failing automated test, then self-attest it pass). Require a --reason
  // for it and stamp the prior verdict on the TC, so the conversion leaves an audit trail the reviewer
  // and the guided checklist surface. (P0-4 already makes the edit show up as Phase-3 drift.)
  let priorStatus = null;
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  if (fs.existsSync(resultsPath)) {
    try {
      const res = JSON.parse(readArtifactFile(resultsPath));
      const prior = (res.results || []).find(r => r.tc_id === tcId);
      if (prior && (prior.status === 'fail' || prior.status === 'skip')) priorStatus = prior.status;
    } catch { /* malformed results — treat as no prior verdict */ }
  }
  if (priorStatus && !reason)
    err(
      `"${tcId}" has a recorded "${priorStatus}" result — converting a non-passing automated test to ` +
      `manual requires --reason (so a reviewer can tell a justified manual test from a laundered failure).\n` +
      `  ${c.tcMarkManual} ${tcId} --reason "why this genuinely cannot be automated"`
    );

  tc.automation = 'manual';
  if (reason) tc.manual_reason = reason;
  if (priorStatus) tc.downgraded_from = priorStatus;
  atomicWrite(tcsPath, JSON.stringify(d, null, 2));

  // Do NOT re-stamp the Phase-3 hash here. mark-manual mutates 03_TEST_CASES.json
  // (automation→"manual") — a real content change. Silently re-stamping hid an
  // automation downgrade from drift detection: an agent could relabel a failing
  // automated test as manual with zero signal (the trace-hiding half of the verify
  // laundering chain, R3-24). Leaving the stored hash stale makes the edit surface
  // as Phase-3 drift → TTY-gated re-approval (or an explicit `aitri rehash`).

  process.stdout.write(`✅ ${tcId} marked as automation: "manual"${reason ? ` — reason: ${reason}` : ''}\n`);
  if (priorStatus)
    process.stdout.write(`   ⚠ Recorded downgraded_from:"${priorStatus}" — a runner had reported this TC as ${priorStatus}; the conversion is on the record for the reviewer.\n`);
  if (!reason)
    process.stdout.write(`   ⚠ No reason given. Add --reason "why this can't be automated" so a reviewer can tell a justified manual test from skipped automation.\n`);
  // TC-DRIFT-0625: mark-manual edits 03_TEST_CASES.json without re-stamping the hash
  // (anti-laundering, R3-24 — see the note above). When Phase 3 is already approved that
  // surfaces as drift and forces a TTY-gated re-approval, which surprises an operator who
  // just used the intended tool. Explain it at the call site so the drift reads as the
  // designed audit trail, not a glitch. Only when Phase 3 is approved (otherwise no hash
  // is stored yet → no drift to explain).
  if ((config.approvedPhases || []).some(x => String(x) === '3')) {
    const sv = featureRoot ? 'feature ' : '';
    const sa = featureRoot ? ` ${scopeName}` : '';
    process.stdout.write(
      `   ℹ This re-labels a test case in an APPROVED plan, so Phase 3 will now show drift — by design ` +
      `(a relabel must leave a trace, not re-seal silently). Review the change, then re-seal: ` +
      `aitri ${sv}rehash${sa} 3 (or re-approve: aitri ${sv}approve${sa} 3).\n`
    );
  }
  process.stdout.write(`   Run: ${c.tcVerify} ${tcId} --result pass|fail --notes "..."  (after manual execution)\n`);
}
