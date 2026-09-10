/**
 * Module: Command — bug
 * Purpose: First-class QA artifact. Captures bugs with reproduction steps, expected/actual
 *          results, evidence, and environment context. Follows QA best practices.
 *          Owns BUGS.json read/write (root: <artifactsDir>/BUGS.json; feature scope:
 *          features/<name>/spec/BUGS.json) — does NOT go through state.js.
 *
 * Lifecycle: open → fixed → verified → closed
 *   fixed:    developer marks it resolved (aitri bug fix)
 *   verified: auto-set by verify-run when linked TC passes, OR manually (aitri bug verify)
 *   closed:   archived
 *
 * Blocking: critical/high open bugs block verify-complete.
 * Resume:   open + fixed bugs shown in aitri resume.
 *
 * Schema fields:
 *   id, title, description, steps_to_reproduce[], expected_result, actual_result,
 *   environment, severity, status, fr, tc_reference, phase_detected,
 *   detected_by, evidence, reported_by, created_at, updated_at, resolution
 */

import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { loadConfig, atomicWrite, featuresDir, saveConfig, writeLastSession, configExists } from '../state.js';
import { gitShowPrefix, gitDiffNames, isAitriStateInFrame, toPipelinePath } from '../git-frame.js';
import { readStdinSync } from '../read-stdin.js';
import { scopedCmd } from '../scope.js';

const BUGS_FILE = 'BUGS.json';

// ── Internal helpers ──────────────────────────────────────────────────────────

function bugsFilePath(dir, config) {
  const artifactsDir = config.artifactsDir || '';
  return artifactsDir
    ? path.join(dir, artifactsDir, BUGS_FILE)
    : path.join(dir, BUGS_FILE);
}

// Severity/status values outside these sets are treated as non-blocking / non-active by the
// case-folded predicates below — silently, before UPLAN-0703 B8. Warn once per file per
// process so a hand-written "P0"/"blocker" is visible instead of quietly toothless.
const KNOWN_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const KNOWN_STATUSES   = new Set(['open', 'in_progress', 'fixed', 'verified', 'closed']);
const warnedBugFiles   = new Set();

// Out-of-band malformed marker (UPLAN-0703 B8, adversarial-pass fix): a Symbol key is
// invisible to JSON.stringify, so even if a marked object were ever saved, the marker cannot
// leak into the file — and a legitimate BUGS.json that happens to contain a top-level
// "malformed" key cannot false-trip the guard. Never use a string key for this.
const MALFORMED = Symbol('bugs-file-malformed');
export function isMalformedBugs(data) { return data === null || data === undefined || data[MALFORMED] === true; }

function loadBugsFile(filePath) {
  if (!fs.existsSync(filePath)) return { bugs: [] };
  let data;
  // A MALFORMED file is marked, not silently emptied (UPLAN-0703 B8): `{bugs:[]}` made every
  // registered bug vanish from every gate, and a subsequent `bug add` would then OVERWRITE
  // the corrupt file with a one-bug list — destroying the record. Callers that mutate or
  // gate must refuse on the marker; display-only callers may degrade.
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { bugs: [], [MALFORMED]: true }; }
  if (!warnedBugFiles.has(filePath)) {
    const unknown = (data.bugs || []).filter(b =>
      (b?.severity && !KNOWN_SEVERITIES.has(bugSeverity(b))) ||
      (b?.status   && !KNOWN_STATUSES.has(bugStatus(b))));
    if (unknown.length) {
      warnedBugFiles.add(filePath);
      const detail = unknown.slice(0, 5).map(b => `${b.id || '(no id)'}: severity="${b.severity}" status="${b.status}"`).join('; ');
      process.stderr.write(
        `[aitri] Warning: ${unknown.length} bug(s) in ${path.basename(filePath)} carry unrecognized severity/status ` +
        `(${detail}) — they are treated as NON-blocking/NON-active by every gate. ` +
        `Use severity critical|high|medium|low and status open|in_progress|fixed|verified|closed.\n`
      );
    }
  }
  return data;
}

/**
 * Gate-side guard (UPLAN-0703 B8): commands that GATE on bug state (verify-complete,
 * reconcile --resolve, validate --ci) must not run over an unreadable BUGS.json — a parse
 * failure would make every blocking bug vanish from the gate (false green). Calls `err`
 * (caller-supplied, throws/exits) when the file exists but does not parse.
 */
export function assertBugsReadable(dir, config, err) {
  const fp = bugsFilePath(dir, config);
  if (isMalformedBugs(loadBugsFile(fp)))
    err(
      `BUGS.json is malformed JSON: ${fp}\n` +
      `  Gates cannot run with unreadable bug state — a parse failure would silently drop every\n` +
      `  blocking bug from the gate. Fix the JSON by hand or restore it from git.`
    );
}

/**
 * Stamp `lastSession` after a bug mutation (BUG-STATE-VISIBLE-0909). `resume` flags the saved
 * narrative as stale when a later action post-dates it — but only approve/complete/verify/
 * reconcile wrote lastSession, so `bug fix|verify|close` (the commands that invalidate a
 * narrative's "BG-023 still open") never tripped the flag. Per-machine (.aitri.local); the
 * shared .aitri is untouched. Never fatal — the BUGS.json write already succeeded.
 */
function touchSession(dir, config, event) {
  // Never CREATE state: saveConfig writes a fresh .aitri when none exists, and the root
  // dispatcher falls back to cwd when no project is found upward — a `bug add` from ~
  // must not leave ~/.aitri behind (adversarial finding, rc.14).
  if (!configExists(dir)) return;
  try { writeLastSession(config, dir, event); saveConfig(dir, config); } catch { /* advisory stamp only */ }
}

/** Append a dated entry to the bug's append-only `log[]` (refusing a hand-written non-array). */
function appendLog(bug, text, err, id) {
  if (bug.log != null && !Array.isArray(bug.log))
    err(`${id}.log is not an array (hand-edited?) — refusing to overwrite it. Make it a list of { at, text } entries and retry.`);
  if (!Array.isArray(bug.log)) bug.log = [];
  const at = new Date().toISOString();
  bug.log.push({ at, text: String(text) });
  return at;
}

function saveBugsFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWrite(filePath, JSON.stringify(data, null, 2));
}

function nextId(bugs) {
  const nums = (bugs || []).map(b => {
    const m = b.id?.match(/^BG-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return `BG-${String((nums.length > 0 ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function flagVal(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

// Best-effort git HEAD capture. Returns null if not a git repo, no commits yet,
// or git is unavailable. Bug lifecycle must work in non-git projects too — this
// is an audit trail enhancement, not a precondition.
function gitHeadSha(dir) {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: dir, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim() || null;
  } catch { return null; }
}

// git diff --name-only <from>..<to>, filtered to code-relevant paths
// (Aitri's own state — artifact dir, contained-layout container, .aitri —
// is not useful in a bug trail; SSoT: reconcile-patterns.js).
// A commit SHA is hex (7-40 chars). fromSha/toSha can come from committed BUGS.json
// (fix_commit_sha) — untrusted — so validate the shape AND run git without a shell. A shell
// string would let `fix_commit_sha: "$(...)"` execute on `aitri bug close` (RCE; R3-4).
const SHA_RE = /^[0-9a-f]{7,40}$/i;
function gitDiffFiles(dir, fromSha, toSha) {
  if (!SHA_RE.test(fromSha) || !SHA_RE.test(toSha)) return [];
  try {
    // Frame-aware (rc.11): the raw repo-relative filter listed Aitri's own `.aitri`/artifacts
    // in the bug trail for subdir projects and features; `-z` keeps non-ASCII paths raw.
    const config = loadConfig(dir);
    const prefix = gitShowPrefix(dir) || '';
    return gitDiffNames(dir, `${fromSha}..${toSha}`)
      .filter(f => !isAitriStateInFrame(f, prefix, config))
      .map(f => toPipelinePath(f, prefix));
  } catch { return []; }
}

/** Collect all values for a repeatable flag (e.g. --steps "..." --steps "..."). */
function multiFlag(args, flag) {
  const result = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) result.push(args[i + 1]);
  }
  return result;
}

/**
 * Attempt to find a Playwright test-results artifact for a given TC id.
 * Playwright writes failing test artifacts to test-results/<folder-containing-tc-id>/
 * @returns {string|null} relative path to screenshot/video, or null
 */
function findPlaywrightEvidence(dir, tcId) {
  const testResultsDir = path.join(dir, 'test-results');
  if (!fs.existsSync(testResultsDir)) return null;
  try {
    const entries = fs.readdirSync(testResultsDir);
    const tcFolder = entries.find(e => e.includes(tcId));
    if (!tcFolder) return null;
    const folderPath = path.join(testResultsDir, tcFolder);
    if (!fs.statSync(folderPath).isDirectory()) return null;
    const files = fs.readdirSync(folderPath);
    const screenshot = files.find(f => f.endsWith('.png'));
    if (screenshot) return `test-results/${tcFolder}/${screenshot}`;
    const video = files.find(f => f.endsWith('.webm'));
    if (video) return `test-results/${tcFolder}/${video}`;
  } catch { /* non-fatal */ }
  return null;
}

// ── Exported helpers (used by verify.js, status.js, resume.js) ───────────────

// ── Bug-state predicates — the single definition of how a bug's status/severity is read ──────────
// SSoT so the deploy gate (getBlockingBugs → verify-complete, the feature gate) and the project
// snapshot (snapshot.aggregateBugs, the root gate) cannot drift apart — they did: AUDIT-0629-B had
// to fix the SAME case-fold in two places. Case-folded because BUGS.json is agent/tool-written: a
// hand-typed "Critical"/"Open" must not slip a blocking bug past the gate (`bug add` enforces a
// lowercase allowlist, but the artifact is writable directly). Pure (operate on a bug object) so
// any reader — including snapshot.js — imports the predicate instead of re-deriving it.
export function bugSeverity(b) { return String(b?.severity || '').toLowerCase(); }
export function bugStatus(b)   { return String(b?.status   || '').toLowerCase(); }
// ACTIVE = still degrading the project (open or in_progress). `fixed`/`verified`/`closed` are not.
export function isActiveBug(b) { const s = bugStatus(b); return s === 'open' || s === 'in_progress'; }
// BLOCKING = active AND critical/high — the deploy-gate predicate (verify-complete + reconcile).
export function isBlockingBug(b) { return isActiveBug(b) && (bugSeverity(b) === 'critical' || bugSeverity(b) === 'high'); }

/**
 * Count of open + fixed bugs (active bugs not yet closed or verified).
 * Returns null if BUGS.json doesn't exist.
 */
export function openBugCount(dir, config) {
  const p = bugsFilePath(dir, config);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (data.bugs || []).filter(b => bugStatus(b) === 'open' || bugStatus(b) === 'fixed').length;
  } catch { return null; }
}

/**
 * Return open bugs by severity for resume display.
 * @returns {Array} open bugs (status === 'open'), sorted critical→high→medium→low
 */
export function getOpenBugs(dir, config) {
  const p = bugsFilePath(dir, config);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (data.bugs || [])
      .filter(b => bugStatus(b) === 'open')
      .sort((a, b) => (order[bugSeverity(a)] ?? 99) - (order[bugSeverity(b)] ?? 99));
  } catch { return []; }
}

/**
 * Auto-transition fixed → verified when the linked TC passed in verify-run.
 * Called at end of cmdVerifyRun after writing 04_TEST_RESULTS.json.
 * @param {string} dir
 * @param {object} config
 * @param {Array<{tc_id: string, status: string}>} results - parsed TC results
 */
export function autoVerifyBugs(dir, config, results) {
  const p = bugsFilePath(dir, config);
  if (!fs.existsSync(p)) return;
  try {
    const data = loadBugsFile(p);
    let changed = false;
    for (const bug of (data.bugs || [])) {
      if (bug.status !== 'fixed' || !bug.tc_reference) continue;
      const result = results.find(r => r.tc_id === bug.tc_reference);
      if (result && result.status === 'pass') {
        bug.status = 'verified';
        bug.updated_at = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) saveBugsFile(p, data);
  } catch { /* non-fatal — bug state is not pipeline-critical */ }
}

/**
 * Return bugs that block verify-complete / reconcile --resolve: critical or high bugs
 * that are still ACTIVE — status `open` OR `in_progress`. Matches the snapshot deploy
 * gate (snapshot.js) and AGENTS.md; before rc.110 this checked `open` only, so an
 * in-progress critical bug passed verify-complete/reconcile while the deploy gate blocked
 * it (R3-12/R3-22 divergence).
 * @returns {Array} blocking bugs (may be empty)
 */
export function getBlockingBugs(dir, config) {
  const p = bugsFilePath(dir, config);
  if (!fs.existsSync(p)) return [];
  try {
    const data = loadBugsFile(p);
    // The feature deploy gate (verify-complete → getBlockingBugs). Uses the shared isBlockingBug
    // predicate (AUDIT-0629-G) so it can never diverge from the snapshot root gate again.
    return (data.bugs || []).filter(isBlockingBug);
  } catch { return []; }
}

/**
 * ROOT-gate input set (GATE-SCOPE-BLIND-0805, ADR-086): blocking bugs across ALL scopes
 * — root plus every feature. The root gates' contract always claimed this set
 * (AGENTS.md, the snapshot deploy spec "global — features can block root ship too",
 * and rc.110's alignment intent); only the input was scope-local — an in-progress
 * critical FEATURE bug let root verify-complete flip `verifyPassed` and `--resolve`
 * stamp the baseline while status said blocked, and the Phase-5 sealing path gates on
 * `verifyPassed` alone. Feature gates deliberately stay scope-local (root bugs never
 * block a feature's own verification — the WIP-feature asymmetry the snapshot already
 * encodes); this helper is for ROOT callers only.
 *
 * B8 doctrine per scope: an unreadable BUGS.json refuses via `err` (a parse failure
 * would silently drop that scope's blockers from the gate — false green).
 * Returns [{ scope: 'root'|'feature:<name>', scopeName: null|string, bug }].
 */
export function getBlockingBugsAllScopes(rootDir, rootConfig, err) {
  const out = [];
  assertBugsReadable(rootDir, rootConfig, err);
  for (const bug of getBlockingBugs(rootDir, rootConfig)) {
    out.push({ scope: 'root', scopeName: null, bug });
  }
  const fdir = featuresDir(rootDir, rootConfig);
  if (!fs.existsSync(fdir)) return out;
  for (const e of fs.readdirSync(fdir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const featureDir = path.join(fdir, e.name);
    if (!fs.existsSync(path.join(featureDir, '.aitri'))) continue;  // orphan dir — not a pipeline
    const fc = loadConfig(featureDir);
    assertBugsReadable(featureDir, fc, err);
    for (const bug of getBlockingBugs(featureDir, fc)) {
      out.push({ scope: `feature:${e.name}`, scopeName: e.name, bug });
    }
  }
  return out;
}

/**
 * If failing TCs are detected in verify-run and the session is interactive,
 * prompt the user to register them as bugs. Auto-populates from TC and Playwright data.
 * Non-TTY: silent (no prompt, no bug created).
 *
 * @param {string} dir
 * @param {object} config
 * @param {Array<{tc_id, status, notes}>} failedResults - only failed TCs
 * @param {object} opts
 * @param {boolean} opts.isPlaywright - whether Playwright was part of the run
 * @param {Array}   opts.testCaseList - TC objects from 03_TEST_CASES.json
 */
export function promptAndRegisterBugs(dir, config, failedResults, { isPlaywright = false, testCaseList = [] } = {}) {
  if (!failedResults || failedResults.length === 0) return;
  if (!process.stdin.isTTY) return;

  const fp = bugsFilePath(dir, config);
  process.stdout.write(`\n⚠ ${failedResults.length} test(s) failed. Register as bugs? [y/N]: `);

  let answer = '';
  try { answer = readStdinSync(10).trim().toLowerCase(); }
  catch { return; }

  if (answer !== 'y' && answer !== 'yes') return;

  const data = loadBugsFile(fp);
  // B8 (adversarial-pass fix): this sibling writer must hold the same line as `bug add` —
  // saving over a malformed file would destroy the recorded bugs. Warn and skip; the
  // failures are still in the runner output and can be registered after the file is fixed.
  if (isMalformedBugs(data)) {
    process.stderr.write(
      `[aitri] BUGS.json is malformed JSON: ${fp}\n` +
      `        Cannot auto-register the failure(s) — writing would overwrite the recorded bugs.\n` +
      `        Fix the JSON (or restore from git), then register with: aitri bug add\n`
    );
    return;
  }
  const now = new Date().toISOString();
  const detected_by = isPlaywright ? 'playwright' : 'verify-run';
  const environment  = isPlaywright ? 'Phase 4 / playwright' : 'Phase 4 / verify-run';

  for (const result of failedResults) {
    const id = nextId(data.bugs);
    const tc = testCaseList.find(t => t.id === result.tc_id);
    const title = tc ? `${result.tc_id} failed: ${tc.title}` : `${result.tc_id} failed`;
    const expected_result = tc?.then_result || tc?.then || '';
    const actual_result   = result.notes || '';
    const evidence = isPlaywright ? findPlaywrightEvidence(dir, result.tc_id) : null;
    const fr = tc?.requirement_id || null;

    data.bugs.push({
      id,
      title,
      description:         '',
      steps_to_reproduce:  [],
      expected_result:     expected_result || '',
      actual_result:       actual_result || '',
      environment,
      severity:            'high',
      status:              'open',
      fr,
      tc_reference:        result.tc_id,
      phase_detected:      4,
      detected_by,
      evidence,
      reported_by:         'aitri',
      created_at:          now,
      updated_at:          now,
      resolution:          null,
    });

    process.stderr.write(`[aitri] Bug registered: ${id} — ${title}\n`);
  }

  saveBugsFile(fp, data);
  process.stderr.write(`[aitri] ${failedResults.length} bug(s) written to BUGS.json\n`);
}

// ── Command ───────────────────────────────────────────────────────────────────

/**
 * Open-bug counts per feature scope, for the root list's empty-state hint
 * (FB-SCOPE-BLIND-0724). Built HERE — not imported from snapshot.js — because
 * snapshot.js already imports this module's predicates and the reverse import
 * would create a cycle; the predicates used are this module's own SSoT, and
 * feature location comes from state.js `featuresDir` (its SSoT). Best-effort:
 * a feature whose state is unreadable is skipped, never breaking the list.
 *
 * @returns {Array<[string, number]>} [featureName, openCount], openCount > 0 only
 */
function featureOpenBugCounts(dir, config) {
  const out = [];
  let fdir, entries;
  try {
    fdir = featuresDir(dir, config);
    if (!fs.existsSync(fdir)) return out;
    entries = fs.readdirSync(fdir, { withFileTypes: true }).filter(e => e.isDirectory());
  } catch { return out; }

  for (const e of entries) {
    try {
      const featDir = path.join(fdir, e.name);
      const fcfg = loadConfig(featDir);
      if (!fcfg || !fcfg.projectName) continue;   // orphan dir without .aitri
      // Raw silent read — loadBugsFile's unknown-status warning belongs to the
      // scope that owns the file, not to a root-level hint.
      const raw = JSON.parse(fs.readFileSync(bugsFilePath(featDir, fcfg), 'utf8'));
      const n = (raw.bugs || []).filter(b => isActiveBug(b) || bugStatus(b) === 'fixed').length;
      if (n > 0) out.push([e.name, n]);
    } catch { /* missing/corrupt/conflicted feature state — skip */ }
  }
  return out;
}

export function cmdBug({ dir, args = [], err, featureRoot, scopeName }) {
  const sub = args[0];
  const config = loadConfig(dir);
  const fp = bugsFilePath(dir, config);
  // Scope-aware command strings for hints — `aitri bug …` at root,
  // `aitri feature bug <name> …` in feature scope (FEAT-PARITY-0620 part 2).
  const bugCmd       = scopedCmd(featureRoot, scopeName, 'bug');
  const verifyRunCmd = scopedCmd(featureRoot, scopeName, 'verify-run');

  if (!sub || sub === 'help') {
    console.log([
      `Usage: ${bugCmd} <subcommand>`,
      '',
      'Subcommands:',
      '  add     --title "..." [--severity critical|high|medium|low] [--fr FR-XXX]',
      '          [--tc TC-NNN] [--phase N] [--steps "step1"] [--steps "step2"]',
      '          [--expected "expected result"] [--actual "actual result"]',
      '          [--environment "local/Phase 4"] [--evidence "path/to/screenshot"]',
      '          [--reported-by "name"]',
      '  list    [--status open|fixed|verified|closed] [--fr FR-XXX] [--severity ...]',
      '  fix     <BG-NNN> [--tc TC-NNN] [--resolution "how it was fixed"]',
      '          (a BLOCKING bug — critical/high, active — requires --resolution or --tc)',
      '  verify  <BG-NNN>   (only a fixed bug can be verified)',
      '  close   <BG-NNN> [--resolution "how it was resolved (or why closed without a fix)"]',
      '          (a BLOCKING bug still open/in_progress requires --resolution to close)',
      '  note    <BG-NNN> --text "..."     append a dated entry to the bug\'s log (append-only)',
      '  update  <BG-NNN> [--title ...] [--description ...] [--severity ...] [--fr FR-XXX] [--tc TC-NNN]',
      '          [--steps "..."]... [--expected ...] [--actual ...] [--environment ...] [--evidence ...] [--phase N]',
      '          [--reason "..."]  correct the record in place; never --status (lifecycle = fix/verify/close)',
      '          nor --resolution (fix/close). Lowering a BLOCKING bug out of critical/high requires --reason;',
      '          every severity change is journaled in log[].',
    ].join('\n'));
    return;
  }

  // UPLAN-0703 B8: no subcommand may operate over an unreadable BUGS.json. A mutation
  // (add/fix/verify/close) would OVERWRITE the corrupt file — destroying the recorded bugs —
  // and a listing would render "no bugs" over a file that has them.
  if (isMalformedBugs(loadBugsFile(fp)))
    err(
      `BUGS.json is malformed JSON: ${fp}\n` +
      `  Fix the JSON by hand or restore it from git. Aitri will NOT overwrite it — that would\n` +
      `  destroy the recorded bugs.`
    );

  // ── add ────────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    const title = flagVal(args, '--title');
    if (!title) err(`--title is required\n  Usage: ${bugCmd} add --title "description" [--severity medium] [--fr FR-XXX]`);

    const fr          = flagVal(args, '--fr');
    const severity    = flagVal(args, '--severity') || 'medium';
    const phaseRaw    = flagVal(args, '--phase');
    const tc          = flagVal(args, '--tc');
    const expected    = flagVal(args, '--expected') || '';
    const actual      = flagVal(args, '--actual') || '';
    const environment = flagVal(args, '--environment') || null;
    const evidence    = flagVal(args, '--evidence') || null;
    const reportedBy  = flagVal(args, '--reported-by') || null;
    const steps       = multiFlag(args, '--steps').map(s => String(s).trim()).filter(Boolean);

    const validSev = ['critical', 'high', 'medium', 'low'];
    if (!validSev.includes(severity)) err(`--severity must be one of: ${validSev.join(', ')}`);

    const data = loadBugsFile(fp);
    const id   = nextId(data.bugs);
    const now  = new Date().toISOString();

    data.bugs.push({
      id,
      title,
      description:        '',
      steps_to_reproduce: steps,
      expected_result:    expected,
      actual_result:      actual,
      environment,
      severity,
      status:             'open',
      fr:                 fr || null,
      tc_reference:       tc || null,
      phase_detected:     phaseRaw ? parseInt(phaseRaw, 10) : null,
      detected_by:        'manual',
      evidence,
      reported_by:        reportedBy,
      created_at:         now,
      updated_at:         now,
      resolution:         null,
    });

    saveBugsFile(fp, data);
    console.log(`✅ ${id} created — status: open`);
    return;
  }

  // ── list ───────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const data        = loadBugsFile(fp);
    const statusFilter = flagVal(args, '--status');
    const frFilter    = flagVal(args, '--fr');
    const sevFilter   = flagVal(args, '--severity');

    let bugs = data.bugs || [];
    // FB-SCOPE-BLIND-0724: filters go through the case-folded predicates and the default
    // view matches the snapshot's isOpen (open|in_progress|fixed). The old raw
    // `b.status === 'open' || 'fixed'` hid in_progress (and any capitalized hand-written
    // status) from the very list `aitri status` points at for its active-bug count.
    if (statusFilter) bugs = bugs.filter(b => bugStatus(b) === String(statusFilter).toLowerCase());
    else              bugs = bugs.filter(b => isActiveBug(b) || bugStatus(b) === 'fixed');
    if (frFilter)     bugs = bugs.filter(b => b.fr === frFilter);
    if (sevFilter)    bugs = bugs.filter(b => bugSeverity(b) === String(sevFilter).toLowerCase());

    if (bugs.length === 0) {
      console.log('No bugs match the filter.');
      // Root default view reads ONE scope's file — say where the open bugs live
      // instead of implying project-wide emptiness (FB-SCOPE-BLIND-0724).
      if (!featureRoot && !statusFilter && !frFilter && !sevFilter) {
        const others = featureOpenBugCounts(dir, config);
        if (others.length > 0) {
          const parts  = others.map(([name, n]) => `${name} ${n}`).join(' · ');
          const target = others.length === 1 ? others[0][0] : '<name>';
          console.log(`  (open in features: ${parts} — run: aitri feature bug ${target} list)`);
        }
      }
      return;
    }

    for (const b of bugs) {
      const fr  = b.fr ? ` (${b.fr})` : '';
      const tc  = b.tc_reference ? ` → ${b.tc_reference}` : '';
      const env = b.environment ? ` [${b.environment}]` : '';
      // Render through the case-folded predicates: the default filter now admits
      // hand-written entries ('Open', missing severity) — raw `b.severity.padEnd`
      // crashed on exactly those (FB-SCOPE-BLIND-0724 adversarial finding).
      const notes = Array.isArray(b.log) && b.log.length ? `  (${b.log.length} note${b.log.length > 1 ? 's' : ''})` : '';
      console.log(`  ${b.id}  [${bugSeverity(b).padEnd(8)}]  [${bugStatus(b).padEnd(8)}]  ${b.title}${fr}${tc}${env}${notes}`);
    }
    return;
  }

  // ── fix ────────────────────────────────────────────────────────────────────
  if (sub === 'fix') {
    const id  = args[1];
    const tc  = flagVal(args, '--tc');
    const resolution = flagVal(args, '--resolution');
    if (!id) err(`Usage: ${bugCmd} fix <BG-NNN> [--tc TC-NNN] [--resolution "how it was fixed"]`);
    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);
    // BUG-STATE-VISIBLE-0909: `fix` on an already-fixed bug re-stamped fix_commit_sha/fix_at
    // to the CURRENT HEAD — falsifying the fix trail — and was the only way to attach a TC
    // after the fact. The post-fix edits have their own verbs now.
    if (['fixed', 'verified', 'closed'].includes(bugStatus(bug)))
      err(
        `${id} is already ${bugStatus(bug)} — re-running fix would re-stamp fix_commit_sha to the current HEAD and falsify the fix trail.\n` +
        `  Link the proving test:   ${bugCmd} update ${id} --tc TC-NNN\n` +
        `  Add to the record:       ${bugCmd} note ${id} --text "..."\n` +
        `  Confirm the fix:         ${bugCmd} verify ${id}`
      );
    // UPLAN-0703 B8: a BLOCKING bug (critical/high, active) gates verify-complete,
    // reconcile --resolve, and the deploy gate — de-blocking it must carry evidence, not a
    // bare state flip. Require the "how" (--resolution) or the test that proves it (--tc).
    // Non-blocking bugs keep the light path.
    if (isBlockingBug(bug) && !tc && !resolution)
      err(
        `${id} is a BLOCKING bug (${bugSeverity(bug)}, ${bugStatus(bug)}) — fixing it unblocks the deploy gate,\n` +
        `so the fix must carry evidence. Provide at least one of:\n` +
        `  --resolution "how it was fixed"     (the human-readable record)\n` +
        `  --tc TC-NNN                          (the test that proves it — auto-verifies on the next verify-run)`
      );
    bug.status     = 'fixed';
    if (tc) bug.tc_reference = tc;
    // resolution: the human-readable "how it was fixed", the word-level companion to the
    // fix/close SHA trail. Seeded null at creation and, until AUDIT-0630-E, never written
    // by any command — a documented lifecycle field the CLI left inert. Set it here (fix is
    // where the resolution is known); persists through verify → close.
    if (resolution) bug.resolution = resolution;
    bug.updated_at = new Date().toISOString();
    const fixSha = gitHeadSha(dir);
    if (fixSha) {
      bug.fix_commit_sha = fixSha;
      bug.fix_at         = bug.updated_at;
    }
    saveBugsFile(fp, data);
    touchSession(dir, config, `bug fix ${id}`);
    const shaNote = fixSha ? `  [HEAD: ${fixSha.slice(0, 8)}]` : '';
    console.log(`✅ ${id} → fixed${tc ? `  (TC: ${tc})` : ''}${resolution ? `  — ${resolution}` : ''}${shaNote}`);
    if (tc) console.log(`   Run ${verifyRunCmd} — if ${tc} passes, ${id} will auto-transition to verified.`);
    else    console.log(`   Run ${bugCmd} verify ${id} after confirming the fix manually.`);
    return;
  }

  // ── verify ─────────────────────────────────────────────────────────────────
  if (sub === 'verify') {
    const id = args[1];
    if (!id) err(`Usage: ${bugCmd} verify <BG-NNN>`);
    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);
    // UPLAN-0703 B8: verifying a never-fixed bug skipped the fix step entirely — the old ℹ
    // note then verified it anyway, so open → verified in one command with zero fix record.
    // Refuse instead; the lifecycle is open → fixed (with evidence when blocking) → verified.
    if (bugStatus(bug) !== 'fixed')
      err(`${id} is ${bug.status}, not fixed — run ${bugCmd} fix ${id} first, then verify.`);
    bug.status     = 'verified';
    bug.updated_at = new Date().toISOString();
    saveBugsFile(fp, data);
    touchSession(dir, config, `bug verify ${id}`);
    console.log(`✅ ${id} → verified`);
    return;
  }

  // ── close ──────────────────────────────────────────────────────────────────
  if (sub === 'close') {
    const id   = args[1];
    const resolution = flagVal(args, '--resolution');
    if (!id) err(`Usage: ${bugCmd} close <BG-NNN> [--resolution "how it was resolved / won't-fix reason"]`);
    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);
    // B8 (adversarial-pass fix): `close` is the OTHER transition that de-blocks the deploy
    // gate (closed → not active → not blocking). Without this, an agent refused by the
    // fix-evidence gate could bare-`close` the blocking bug instead. A blocking bug closed
    // WITHOUT a code fix must state why (won't-fix, duplicate, obsolete) — same evidence
    // contract as fix. A close after fix/verify keeps the light path (evidence already given).
    if (isBlockingBug(bug) && !resolution)
      err(
        `${id} is a BLOCKING bug (${bugSeverity(bug)}, ${bugStatus(bug)}) — closing it unblocks the deploy gate,\n` +
        `so a close without a code fix must state why:\n` +
        `  --resolution "won't-fix / duplicate of BG-NNN / obsolete because ..."\n` +
        `(To close it as genuinely fixed: aitri bug fix ${id} --resolution "..." → verify → close.)`
      );
    bug.status     = 'closed';
    // Also settable at close for a bug that skipped `fix` (won't-fix, duplicate, obsolete) —
    // records why it was closed without a code fix. Does not overwrite an existing resolution
    // unless one is supplied here.
    if (resolution) bug.resolution = resolution;
    bug.updated_at = new Date().toISOString();
    const closeSha = gitHeadSha(dir);
    if (closeSha) {
      bug.close_commit_sha = closeSha;
      bug.close_at         = bug.updated_at;
      if (bug.fix_commit_sha && bug.fix_commit_sha !== closeSha) {
        const files = gitDiffFiles(dir, bug.fix_commit_sha, closeSha);
        if (files.length) bug.files_changed = files;
      }
    }
    saveBugsFile(fp, data);
    touchSession(dir, config, `bug close ${id}`);
    const shaNote = closeSha ? ` [HEAD: ${closeSha.slice(0, 8)}]` : '';
    console.log(`🔒 ${id} → closed${resolution ? `  — ${resolution}` : ''}${shaNote}`);
    if (bug.files_changed?.length) {
      console.log(`   Files changed fix→close: ${bug.files_changed.length}`);
    }
    return;
  }

  // ── note ───────────────────────────────────────────────────────────────────
  // BUG-STATE-VISIBLE-0909 (parity with `backlog note`, ADR-090): an append-only journal on
  // the bug. Before this, findings that post-dated `add` — a corrected root cause, a
  // reproduction result, "the title is wrong, read the resolution" — had no home in the
  // record and were parked in the session narrative, which has no id and never closes.
  if (sub === 'note') {
    const id   = args[1];
    const text = flagVal(args, '--text');
    if (!id) err(`Usage: ${bugCmd} note <BG-NNN> --text "..."`);
    if (!text || !String(text).trim()) err(`--text is required — e.g.: ${bugCmd} note ${id} --text "what was learned"`);
    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);
    const at = appendLog(bug, text, err, id);
    bug.updated_at = at;
    saveBugsFile(fp, data);
    touchSession(dir, config, `bug note ${id}`);
    console.log(`✅ ${id}: note #${bug.log.length} added`);
    return;
  }

  // ── update ─────────────────────────────────────────────────────────────────
  // Correct the record in place (a false title written on a wrong hypothesis could not be
  // fixed from the CLI — the correction lived in the narrative with "do not trust the
  // title"). Lifecycle fields stay with their verbs: never --status (fix/verify/close) nor
  // --resolution (fix/close). Severity is the deploy gate's input, so unlike backlog
  // update (ADR-090: no history, "neither a gate nor an audit record") every severity
  // change is journaled in log[] and lowering a BLOCKING bug out of critical/high requires
  // --reason — the same evidence contract as fix/close (B8, ADR-086's "severity gaming").
  if (sub === 'update') {
    const id = args[1];
    if (!id) err(`Usage: ${bugCmd} update <BG-NNN> --<field> "..." [--reason "..."]`);
    if (args.includes('--status'))
      err(`--status is not an update field — the lifecycle is ${bugCmd} fix|verify|close <id>.`);
    if (args.includes('--resolution'))
      err(`--resolution is set by ${bugCmd} fix|close <id> --resolution "..." — not by update.`);

    const FIELDS = {
      '--title':       'title',
      '--description': 'description',
      '--severity':    'severity',
      '--fr':          'fr',
      '--tc':          'tc_reference',
      '--expected':    'expected_result',
      '--actual':      'actual_result',
      '--environment': 'environment',
      '--evidence':    'evidence',
      '--phase':       'phase_detected',
    };
    const changes = {};
    for (const [flag, field] of Object.entries(FIELDS)) {
      if (!args.includes(flag)) continue;
      const val = flagVal(args, flag);
      if (val === null || val === undefined || !String(val).trim()) err(`${flag} needs a value`);
      if (field === 'severity') {
        const sev = String(val).toLowerCase();
        if (!KNOWN_SEVERITIES.has(sev)) err(`--severity must be one of: ${[...KNOWN_SEVERITIES].join(', ')}`);
        changes.severity = sev;
      } else if (field === 'phase_detected') {
        const n = parseInt(val, 10);
        if (Number.isNaN(n)) err(`--phase must be a number`);
        changes.phase_detected = n;
      } else {
        changes[field] = String(val);
      }
    }
    if (args.includes('--steps')) {
      const steps = multiFlag(args, '--steps').map(s => String(s).trim()).filter(Boolean);
      if (!steps.length) err(`--steps needs at least one non-empty step`);
      changes.steps_to_reproduce = steps;
    }
    if (Object.keys(changes).length === 0)
      err(`Nothing to update — pass at least one of: ${Object.keys(FIELDS).join(' ')} --steps`);

    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);

    const reason = String(flagVal(args, '--reason') || '').trim() || null;
    if (changes.severity !== undefined && changes.severity !== bugSeverity(bug)) {
      const wasBlocking = isBlockingBug(bug);
      const nowBlocking = isActiveBug(bug) && (changes.severity === 'critical' || changes.severity === 'high');
      if (wasBlocking && !nowBlocking && !reason)
        err(
          `${id} is a BLOCKING bug (${bugSeverity(bug)}, ${bugStatus(bug)}) — lowering it to ${changes.severity} unblocks the deploy gate,\n` +
          `so the change must carry its reason:  ${bugCmd} update ${id} --severity ${changes.severity} --reason "..."`
        );
      appendLog(bug, `severity ${bugSeverity(bug) || '(none)'} → ${changes.severity}${reason ? `: ${reason}` : ''}`, err, id);
    } else if (changes.severity !== undefined) {
      delete changes.severity; // no-op change — do not journal it
      if (Object.keys(changes).length === 0) { console.log(`  ${id}: severity already ${bugSeverity(bug)} — nothing to update.`); return; }
    }

    Object.assign(bug, changes);
    bug.updated_at = new Date().toISOString();
    saveBugsFile(fp, data);
    touchSession(dir, config, `bug update ${id}`);
    console.log(`✅ ${id}: updated ${Object.keys(changes).join(', ')}`);
    if (changes.tc_reference && bugStatus(bug) === 'fixed')
      console.log(`   Run ${verifyRunCmd} — if ${changes.tc_reference} passes, ${id} will auto-transition to verified.`);
    return;
  }

  err(`Unknown subcommand: ${sub}\nRun: ${bugCmd} help`);
}
