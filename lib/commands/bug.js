/**
 * Module: Command — bug
 * Purpose: First-class QA artifact. Captures bugs with reproduction steps, expected/actual
 *          results, evidence, and environment context. Follows QA best practices.
 *          Owns spec/BUGS.json read/write — does NOT go through state.js.
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
import { execSync } from 'child_process';
import { loadConfig } from '../state.js';
import { readStdinSync } from '../read-stdin.js';

const BUGS_FILE = 'BUGS.json';

// ── Internal helpers ──────────────────────────────────────────────────────────

function bugsFilePath(dir, config) {
  const artifactsDir = config.artifactsDir || '';
  return artifactsDir
    ? path.join(dir, artifactsDir, BUGS_FILE)
    : path.join(dir, BUGS_FILE);
}

function loadBugsFile(filePath) {
  if (!fs.existsSync(filePath)) return { bugs: [] };
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { bugs: [] }; }
}

function saveBugsFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
// (spec/ and .aitri are Aitri's own state — not useful in a bug trail).
function gitDiffFiles(dir, fromSha, toSha) {
  try {
    const out = execSync(`git diff --name-only ${fromSha}..${toSha}`, {
      cwd: dir, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    if (!out) return [];
    return out.split('\n').filter(f =>
      f && !f.startsWith('spec/') && !f.startsWith('.aitri')
    );
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

/**
 * Count of open + fixed bugs (active bugs not yet closed or verified).
 * Returns null if BUGS.json doesn't exist.
 */
export function openBugCount(dir, config) {
  const p = bugsFilePath(dir, config);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (data.bugs || []).filter(b => b.status === 'open' || b.status === 'fixed').length;
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
      .filter(b => b.status === 'open')
      .sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));
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
 * Return bugs that block verify-complete: open bugs with severity critical or high.
 * @returns {Array} blocking bugs (may be empty)
 */
export function getBlockingBugs(dir, config) {
  const p = bugsFilePath(dir, config);
  if (!fs.existsSync(p)) return [];
  try {
    const data = loadBugsFile(p);
    return (data.bugs || []).filter(
      b => b.status === 'open' && (b.severity === 'critical' || b.severity === 'high')
    );
  } catch { return []; }
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

export function cmdBug({ dir, args = [], err }) {
  const sub = args[0];
  const config = loadConfig(dir);
  const fp = bugsFilePath(dir, config);

  if (!sub || sub === 'help') {
    console.log([
      'Usage: aitri bug <subcommand>',
      '',
      'Subcommands:',
      '  add     --title "..." [--severity critical|high|medium|low] [--fr FR-XXX]',
      '          [--tc TC-NNN] [--phase N] [--steps "step1"] [--steps "step2"]',
      '          [--expected "expected result"] [--actual "actual result"]',
      '          [--environment "local/Phase 4"] [--evidence "path/to/screenshot"]',
      '          [--reported-by "name"]',
      '  list    [--status open|fixed|verified|closed] [--fr FR-XXX] [--severity ...]',
      '  fix     <BG-NNN> [--tc TC-NNN]',
      '  verify  <BG-NNN>',
      '  close   <BG-NNN>',
    ].join('\n'));
    return;
  }

  // ── add ────────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    const title = flagVal(args, '--title');
    if (!title) err('--title is required\n  Usage: aitri bug add --title "description" [--severity medium] [--fr FR-XXX]');

    const fr          = flagVal(args, '--fr');
    const severity    = flagVal(args, '--severity') || 'medium';
    const phaseRaw    = flagVal(args, '--phase');
    const tc          = flagVal(args, '--tc');
    const expected    = flagVal(args, '--expected') || '';
    const actual      = flagVal(args, '--actual') || '';
    const environment = flagVal(args, '--environment') || null;
    const evidence    = flagVal(args, '--evidence') || null;
    const reportedBy  = flagVal(args, '--reported-by') || null;
    const steps       = multiFlag(args, '--steps');

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
    if (statusFilter) bugs = bugs.filter(b => b.status === statusFilter);
    else              bugs = bugs.filter(b => b.status === 'open' || b.status === 'fixed');
    if (frFilter)     bugs = bugs.filter(b => b.fr === frFilter);
    if (sevFilter)    bugs = bugs.filter(b => b.severity === sevFilter);

    if (bugs.length === 0) { console.log('No bugs match the filter.'); return; }

    for (const b of bugs) {
      const fr  = b.fr ? ` (${b.fr})` : '';
      const tc  = b.tc_reference ? ` → ${b.tc_reference}` : '';
      const env = b.environment ? ` [${b.environment}]` : '';
      console.log(`  ${b.id}  [${b.severity.padEnd(8)}]  [${b.status.padEnd(8)}]  ${b.title}${fr}${tc}${env}`);
    }
    return;
  }

  // ── fix ────────────────────────────────────────────────────────────────────
  if (sub === 'fix') {
    const id  = args[1];
    const tc  = flagVal(args, '--tc');
    if (!id) err('Usage: aitri bug fix <BG-NNN> [--tc TC-NNN]');
    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);
    bug.status     = 'fixed';
    if (tc) bug.tc_reference = tc;
    bug.updated_at = new Date().toISOString();
    const fixSha = gitHeadSha(dir);
    if (fixSha) {
      bug.fix_commit_sha = fixSha;
      bug.fix_at         = bug.updated_at;
    }
    saveBugsFile(fp, data);
    const shaNote = fixSha ? `  [HEAD: ${fixSha.slice(0, 8)}]` : '';
    console.log(`✅ ${id} → fixed${tc ? `  (TC: ${tc})` : ''}${shaNote}`);
    if (tc) console.log(`   Run aitri verify-run — if ${tc} passes, ${id} will auto-transition to verified.`);
    else    console.log(`   Run aitri bug verify ${id} after confirming the fix manually.`);
    return;
  }

  // ── verify ─────────────────────────────────────────────────────────────────
  if (sub === 'verify') {
    const id = args[1];
    if (!id) err('Usage: aitri bug verify <BG-NNN>');
    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);
    if (bug.status !== 'fixed') {
      process.stderr.write(`  ℹ  ${id} is ${bug.status} — run aitri bug fix ${id} first, then verify.\n`);
    }
    bug.status     = 'verified';
    bug.updated_at = new Date().toISOString();
    saveBugsFile(fp, data);
    console.log(`✅ ${id} → verified`);
    return;
  }

  // ── close ──────────────────────────────────────────────────────────────────
  if (sub === 'close') {
    const id   = args[1];
    if (!id) err('Usage: aitri bug close <BG-NNN>');
    const data = loadBugsFile(fp);
    const bug  = (data.bugs || []).find(b => b.id === id);
    if (!bug) err(`Bug ${id} not found`);
    bug.status     = 'closed';
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
    const shaNote = closeSha ? ` [HEAD: ${closeSha.slice(0, 8)}]` : '';
    console.log(`🔒 ${id} → closed${shaNote}`);
    if (bug.files_changed?.length) {
      console.log(`   Files changed fix→close: ${bug.files_changed.length}`);
    }
    return;
  }

  err(`Unknown subcommand: ${sub}\nRun: aitri bug help`);
}
