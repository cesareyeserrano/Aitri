/**
 * Module: Verify — pure result parsers & derivations
 * Purpose: The stack-agnostic, side-effect-free half of the verification layer —
 *          runner-output parsers (node/vitest/pytest/playwright/go + the regex
 *          TRX/JUnit-XML parser), result-file resolution, fr/ac coverage builders,
 *          and the test-content / assertion-density / coverage scanners.
 *
 * Extracted from lib/commands/verify.js (UPLAN-0703 B9) so the parser matrix that
 * guards the deploy gate — especially the regex XML parser, which has bitten before
 * (rc.99 CDATA) — is independently reviewable. Pure functions only: inputs → outputs,
 * no state.js, no child_process, no pipeline mutation. verify.js imports and re-exports
 * these, so every existing importer keeps its `verify.js` path.
 *
 * Dependencies: fs/path (file-based result resolution + density scan) + the canonical
 * TC-id grammar (tc-id.js). NOTHING from verify.js — this file has no path back, cycle-free.
 */

import fs from 'fs';
import path from 'path';
import { extractTCId, extractAllTCIds } from './tc-id.js';

/**
 * Find output lines that carry MORE THAN ONE planned TC id
 * (VERIFY-TC-VISIBILITY-0706). Every parser above credits only the FIRST id
 * on a line — deliberate: crediting all would let one assertion set bless N
 * TCs (a happy-path run could credit a negative TC). But the drop was silent;
 * verify-run uses this to warn instead. Restricting to PLAN ids keeps the
 * warning precise — two ids in a random log line that aren't planned TCs drop
 * nothing, so they warn nothing.
 *
 * @param {string} output Combined runner output.
 * @param {Set<string>} planIds Canonical ids from 03_TEST_CASES.json.
 * @returns {Array<{line: string, ids: string[]}>} one entry per distinct id-set
 */
export function findMultiTCIdLines(output, planIds) {
  const hits = [];
  const seen = new Set();
  if (!output || !(planIds instanceof Set)) return hits;
  for (const line of output.split('\n')) {
    const ids = extractAllTCIds(line).filter(id => planIds.has(id));
    if (ids.length < 2) continue;
    const key = ids.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ line: line.trim(), ids });
  }
  return hits;
}

/**
 * Parse test runner output for TC-XXX pass/fail markers.
 * Detects lines matching: ✔ TC-XXX or ✖ TC-XXX (node:test format)
 * TC IDs support alphanumeric suffixes and multi-segment namespaces
 * (TC-001, TC-020b, TC-FE-001h, TC-API-USER-010f).
 * @param {string} output - Combined stdout+stderr from test runner
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
// Status precedence when one TC id appears more than once in runner output
// (parametrized pytest, repeated it() blocks, a retried test). A `fail` must
// win even if a passing occurrence printed first — first-occurrence-wins
// silently masked the failure as a pass, crediting a TC (and its FR) as green
// while a real assertion was failing. Higher rank wins; equal rank keeps the
// first (preserving its notes). Only pass/fail/skip are produced by parsers.
const STATUS_RANK = { fail: 3, pass: 2, skip: 1 };

function recordDetected(detected, tcId, entry) {
  if (!tcId) return;
  const prior = detected.get(tcId);
  if (prior && (STATUS_RANK[prior.status] ?? 0) >= (STATUS_RANK[entry.status] ?? 0)) return;
  detected.set(tcId, entry);
}

export function parseRunnerOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = /[✔✖]/.exec(line);
    if (!marker) continue;
    const tcId = extractTCId(line);
    if (!tcId) continue;

    if (marker[0] === '✔') {
      // node:test prints `✔ … # TODO` for a todo (unimplemented) test — the ✔
      // marker is present but it is NOT a real pass. Treat it as skip so an
      // unimplemented placeholder named after a TC is never credited green.
      const status = /#\s*TODO\b/.test(line) ? 'skip' : 'pass';
      recordDetected(detected, tcId, { status, notes: line.trim() });
    } else {
      // Capture error context from following lines
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('AssertionError') || l.includes('Error') || l.startsWith('at '))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      recordDetected(detected, tcId, {
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
    const tcId = extractTCId(line);
    if (!tcId) continue;
    // Anchor the verdict to the LEADING symbol — a fail line whose title happens
    // to contain a ✓ (e.g. "× TC-001f: rejects the ✓ marker") must not be read
    // as a pass because the glyph appears somewhere in the text.
    if (/^\s*[✓✔]/.test(line)) {
      recordDetected(detected, tcId, { status: 'pass', notes: line.trim() });
    } else if (/^\s*[×✕✗]/.test(line)) {
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('Error') || l.includes('Expected') || l.includes('Received'))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      recordDetected(detected, tcId, {
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
 * TC IDs may use underscores in function names (TC_001h) — reconciled to TC-001h.
 * Requires verbose output: `pytest -v` or `python3 -m pytest -v`
 * @param {string} output - Combined stdout+stderr from pytest
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parsePytestOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tcId = extractTCId(line);
    if (!tcId) continue;
    if (/\bPASSED\b/.test(line)) {
      recordDetected(detected, tcId, { status: 'pass', notes: line.trim() });
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
      recordDetected(detected, tcId, {
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
    const tcId = extractTCId(line);
    if (!tcId) continue;
    // Anchor the verdict to the leading symbol (see parseVitestOutput) so a ✓ in
    // a failing test's title cannot flip it to pass.
    if (/^\s*[✓✔]/.test(line)) {
      recordDetected(detected, tcId, { status: 'pass', notes: line.trim() });
    } else if (/^\s*[✗✘✖]/.test(line)) {
      recordDetected(detected, tcId, { status: 'fail', notes: line.trim() });
    }
  }
  return detected;
}

/**
 * Parse `go test -v` output for TC-XXX pass/fail/skip markers (alpha.8).
 *
 * Go test format (`go test -v`):
 *   === RUN   TestTC_NM_001h
 *   --- PASS: TestTC_NM_001h (0.00s)
 *   === RUN   TestTC_NM_003e
 *       sample_test.go:23: assertion failed
 *   --- FAIL: TestTC_NM_003e (0.00s)
 *
 * Subtests appear indented (4 spaces) — `    --- PASS: TestX/SubY (...)`.
 * The anchor `^---` (column 0) excludes them by construction; only top-level
 * test results are captured. Parent reports FAIL when any subtest fails.
 *
 * Naming convention (consumed by extractTCId):
 *   func TestTC_NS_NNN<suffix>(t *testing.T)
 *   - `Test` prefix is mandatory in Go (otherwise the runner does not pick it up)
 *   - `TC_NS_001h` after stripping `Test` → extractTCId reconciles _ → -
 *   - Result: `TC-NS-001h` canonical
 *
 * Without `-v` Go only emits FAIL lines for failures (passes are silent).
 * The runner-hint warning at line ~360 surfaces this when test_runner is
 * `go test` without `-v` so the operator can fix the manifest before
 * verify-complete blocks on 0 detected passes.
 *
 * @param {string} output - Combined stdout+stderr from `go test -v`
 * @returns {Map<string, {status: 'pass'|'fail'|'skip', notes: string}>}
 */
export function parseGoOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // ^--- (column 0) excludes 4-space-indented subtest lines.
    // [A-Za-z0-9_]+ does not match `/` so subtest paths are also excluded by the char class.
    const m = /^---\s+(PASS|FAIL|SKIP):\s+(Test[A-Za-z0-9_]+)\s+\(/.exec(line);
    if (!m) continue;

    const verdict  = m[1];
    const testName = m[2].slice(4); // strip `Test` prefix
    const tcId     = extractTCId(testName);
    if (!tcId) continue;

    let notes = line.trim();
    let status;
    if (verdict === 'PASS')      status = 'pass';
    else if (verdict === 'SKIP') status = 'skip';
    else {
      status = 'fail';
      // Go prints assertion context BEFORE `--- FAIL:` (between `=== RUN` and the FAIL line).
      // Walk backwards collecting indented lines until a boundary (=== / --- / blank).
      const errorContext = [];
      for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
        const l = lines[j];
        if (/^=== /.test(l) || /^---\s/.test(l) || l === '') break;
        if (/^\s{4}/.test(l)) errorContext.unshift(l.trim());
        if (errorContext.length >= 2) break;
      }
      if (errorContext.length) {
        notes = [line.trim(), ...errorContext].join(' | ').slice(0, 400);
      }
    }
    recordDetected(detected, tcId, { status, notes });
  }
  return detected;
}

// Minimal XML attribute-value decode — covers the five predefined entities and
// numeric refs. TC ids almost never carry entities, but a testName like
// "TC_006h &amp; friends" must not break extraction. Zero-dep, no XML library.
function decodeXmlAttr(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/**
 * Parse a Visual Studio TRX result file (`dotnet test --logger trx`, MSTest, NUnit
 * via TRX) for TC-XXX pass/fail/skip. TRX is a FILE format, not stdout — runners
 * like `dotnet test` print no parseable per-test verdict to the console, so the
 * stdout parsers above see nothing and every TC drops to skip. This reads the
 * structured `<UnitTestResult testName="…" outcome="…"/>` rows instead.
 *
 * testName is typically the fully-qualified method (`Ns.Class.TC_006h_Email_Valid`);
 * extractTCId recovers `TC-006h` from it (it normalizes `_`→`-` and ignores the
 * namespace prefix). outcome → status: Passed=pass; Failed/Timeout/Aborted=fail;
 * everything else (NotExecuted, Inconclusive, Pending) = skip.
 *
 * @param {string} xml - TRX file contents
 * @returns {Map<string, {status:'pass'|'fail'|'skip', notes:string}>}
 */
export function parseTrxResults(xml) {
  const detected = new Map();
  if (typeof xml !== 'string') return detected;
  // Match each <UnitTestResult …> opening tag (self-closing or with children).
  // [^>]* stops at the first '>', i.e. the end of the opening tag — testName and
  // outcome are attributes there, so attribute order does not matter.
  const tagRe = /<UnitTestResult\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(xml)) !== null) {
    const tag = m[0];
    const nameM = /\btestName\s*=\s*"([^"]*)"/.exec(tag);
    const outM  = /\boutcome\s*=\s*"([^"]*)"/.exec(tag);
    if (!nameM || !outM) continue;
    const tcId = extractTCId(decodeXmlAttr(nameM[1]));
    if (!tcId) continue;
    const outcome = outM[1];
    let status;
    if (outcome === 'Passed')                                          status = 'pass';
    else if (outcome === 'Failed' || outcome === 'Timeout' || outcome === 'Aborted') status = 'fail';
    else                                                               status = 'skip';
    recordDetected(detected, tcId, { status, notes: `${tcId}: ${outcome} (trx)` });
  }
  return detected;
}

/**
 * Parse a JUnit-XML result file (`<testsuite><testcase .../></testsuite>`) for
 * TC-XXX pass/fail/skip. This one format covers Java (Maven Surefire / Gradle),
 * jest-junit, pytest `--junitxml`, .NET via JUnit loggers, and most CI runners.
 * Like TRX it is a FILE, not stdout.
 *
 * A `<testcase>` with no child = pass; a child `<failure>`/`<error>` = fail; a
 * child `<skipped>` = skip. The TC id may live in `name`, in `classname`, or in
 * the `classname.name` join — all three are tried.
 *
 * @param {string} xml - JUnit-XML file contents
 * @returns {Map<string, {status:'pass'|'fail'|'skip', notes:string}>}
 */
export function parseJUnitXmlResults(xmlRaw) {
  const detected = new Map();
  if (typeof xmlRaw !== 'string') return detected;
  // Strip CDATA + comment bodies BEFORE scanning (FB-MULTI-0619 #5). Runners
  // (jest-junit, pytest, Surefire) wrap captured stdout/stderr in
  // <system-out><![CDATA[ ... ]]></system-out>; that text routinely contains a
  // literal "<testcase" / "<failure" (e.g. a test echoing a JUnit report). Left in,
  // those substrings truncate a body or fake a child — a FALSE PASS (the dangerous
  // direction). Failure detection keys on the <failure>/<error>/<skipped> TAG, never
  // on its CDATA content (a stack trace), so blanking CDATA bodies is safe.
  const xml = xmlRaw
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const openRe = /<testcase\b([^>]*?)(\/?)>/g;
  let m;
  while ((m = openRe.exec(xml)) !== null) {
    const attrs = m[1];
    const selfClosed = m[2] === '/';
    const nameM  = /\bname\s*=\s*"([^"]*)"/.exec(attrs);
    const classM = /\bclassname\s*=\s*"([^"]*)"/.exec(attrs);
    const name  = nameM  ? decodeXmlAttr(nameM[1])  : '';
    const cls   = classM ? decodeXmlAttr(classM[1]) : '';
    let tcId = null;
    for (const cand of [name, cls ? `${cls}.${name}` : '', cls]) {
      if (!cand) continue;
      tcId = extractTCId(cand);
      if (tcId) break;
    }
    if (!tcId) continue;
    let status = 'pass';
    if (!selfClosed) {
      const bodyStart = openRe.lastIndex;
      const closeIdx  = xml.indexOf('</testcase>', bodyStart);
      // Next REAL testcase opening — word-boundary so it never matches `<testcases>`
      // nor a bare `<testcase` substring. Bound the body to THIS testcase only: its
      // own </testcase>, or (when malformed — a missing close tag, FB-MULTI-0619 #5)
      // the next sibling's opening, so an unclosed testcase cannot absorb a SIBLING's
      // <failure> and flip this PASS to FAIL. Genuinely-last unclosed → remainder
      // (its own real child still counts; an absent one stays pass).
      const nextM    = /<testcase[\s/>]/.exec(xml.slice(bodyStart));
      const nextOpen = nextM ? bodyStart + nextM.index : -1;
      let bodyEnd = closeIdx;
      if (bodyEnd === -1 || (nextOpen !== -1 && nextOpen < bodyEnd)) {
        bodyEnd = nextOpen === -1 ? xml.length : nextOpen;
      }
      const body = xml.slice(bodyStart, bodyEnd);
      if (/<failure\b/.test(body) || /<error\b/.test(body)) status = 'fail';
      else if (/<skipped\b/.test(body))                     status = 'skip';
    }
    recordDetected(detected, tcId, { status, notes: `${tcId}: ${status} (junit-xml)` });
  }
  return detected;
}

/**
 * Dispatch an XML result blob to the TRX or JUnit-XML parser by sniffing its
 * root element. Returns an empty Map for anything else (additive: a runner that
 * emits no structured result file is unaffected).
 * @param {string} xml
 * @returns {Map<string, {status:'pass'|'fail'|'skip', notes:string}>}
 */
export function parseXmlResults(xml) {
  if (typeof xml !== 'string') return new Map();
  if (/<UnitTestResult\b/.test(xml)) return parseTrxResults(xml);
  if (/<testcase\b/.test(xml))       return parseJUnitXmlResults(xml);
  return new Map();
}

// Depth-bounded scan for TRX / JUnit-XML result files under an EXPLICIT `--results`
// directory. Returns every result-named file found; the caller applies the
// run-start freshness filter (so a stale guid-named `.trx` from a prior run can't
// mask the current verdict). node_modules/.git/build dirs are skipped.
function collectXmlResultFiles(root, depth = 4) {
  const out = [];
  const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.aitri']);
  const isResultName = (n) => /\.trx$/i.test(n) || /^(?:TEST-.+|junit.*|.+\.junit)\.xml$/i.test(n);
  function walk(d, depthLeft) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depthLeft <= 0 || SKIP.has(e.name)) continue;
        walk(full, depthLeft - 1);
      } else if (e.isFile() && isResultName(e.name)) {
        out.push(full);
      }
    }
  }
  walk(root, depth);
  return out;
}

/**
 * Resolve which TRX/JUnit-XML files to read from the EXPLICIT `--results` flag.
 * Exported for direct testing.
 *  - explicit FILE  → just that file (no mtime guard; the operator chose it, like --evidence)
 *  - explicit DIR   → the single newest result file written by THIS run (mtime >= runStartMs,
 *                     which must be a real timestamp); stale guid-named siblings from prior runs
 *                     are excluded so they cannot mask the current verdict. Only-stale dir → []
 *                     (the caller warns).
 *  - no flag        → [] (NO silent filesystem auto-discovery — see below)
 *
 * No auto-discovery by design (rc.94, FB-MULTI-0619 #1). Hunting the tree for any
 * result-named file could credit a TC PASS from a file this run never wrote — a
 * committed fixture or a stale `.trx` whose mtime merely looked fresh — which turns
 * Aitri's one promise ("the reported result is real") into a lie. No consumer asked
 * for the hunt; the validated path is the explicit one. When no `--results` is given
 * and the runner emitted nothing parseable to stdout, the caller tells the operator
 * how to point at the file instead of guessing.
 * @returns {string[]} file paths to parse
 */
export function resolveResultFiles(dir, resultsFlag, runStartMs) {
  if (!resultsFlag) return [];
  const p = path.isAbsolute(resultsFlag) ? resultsFlag : path.join(dir, resultsFlag);
  let st;
  try { st = fs.statSync(p); } catch { return []; }
  if (st.isDirectory()) {
    // Freshness guard is unconditional: a result file must be at/after the run start
    // to count. runStartMs is always a real Date.now() from cmdVerifyRun; a missing
    // one (NaN) excludes everything rather than silently admitting stale files.
    const files = collectXmlResultFiles(p)
      .map(f => ({ f, mt: (() => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } })() }))
      .filter(x => x.mt >= runStartMs)
      .sort((a, b) => b.mt - a.mt);
    return files.length ? [files[0].f] : [];
  }
  // ADV-0622-11: an explicit --results FILE is a deliberate attestation (same trust class
  // as --evidence) so we honor it rather than drop it — but warn when it predates the run
  // start, since a stale or committed result file silently crediting passes is a likely
  // mistake worth surfacing.
  if (Number.isFinite(runStartMs) && st.mtimeMs < runStartMs) {
    process.stderr.write(
      `[aitri] Warning: --results file ${resultsFlag} was last modified before this run started ` +
      `(${new Date(st.mtimeMs).toISOString()}). It may be stale or committed — confirm it reflects the current run.\n`
    );
  }
  return [p];
}

/**
 * Build fr_coverage from results + Phase 3 TC→FR mapping.
 * @param {Array} results - TC result objects
 * @param {Array} testCases - Phase 3 test_cases
 * @param {Array} frIds - FR ids from Phase 1
 */
export function buildFRCoverage(results, testCases, frIds) {
  const tcToFRs = {};
  for (const tc of testCases) {
    if (Array.isArray(tc.frs) && tc.frs.length > 0) {
      tcToFRs[tc.id] = tc.frs;
    } else if (tc.requirement_id) {
      tcToFRs[tc.id] = [tc.requirement_id];
    }
  }

  const counters = {};
  for (const id of frIds) {
    counters[id] = { passing: 0, failing: 0, skipped: 0, manual: 0 };
  }
  for (const r of results) {
    const frList = tcToFRs[r.tc_id] || [];
    for (const frId of frList) {
      if (!counters[frId]) continue;
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
 * Build ac_coverage — the finer-grained companion to fr_coverage (ADR-041 option A).
 * fr_coverage tells you "FR-001 is covered"; ac_coverage tells you "…but AC-001-3 has
 * NO test." The consumer that makes `ac_id` a real join-key instead of a decorative
 * field: it reads the structured acceptance criteria Phase 1 declares in
 * `user_stories[].acceptance_criteria` (`{ id, given, when, then }`; legacy `{ id, text }` also joins), maps each TC to one via its
 * `ac_id` (Phase 3), and rolls up the runner results per criterion.
 *
 * Returns [] when Phase 1 declares NO structured AC ids — there is then no join target,
 * so there is nothing to measure (ADR-041: do not invent a hollow gate). Additive:
 * fr_coverage is untouched; `untested` flags a criterion that no TC references at all.
 *
 * @param {Array} results       - TC result objects (status: pass|fail|skip|manual)
 * @param {Array} testCases     - Phase 3 test_cases (carry ac_id)
 * @param {object} requirements - parsed 01_REQUIREMENTS.json (user_stories with structured ACs)
 */
export function buildACCoverage(results, testCases, requirements) {
  // ac_id → { fr_id }. The criterion's TEXT is not carried: AC objects are structured
  // as { id, given, when, then } (the template's SPEC-SEALED form — see ARTIFACTS.md /
  // ADR-041 addendum), and ac_coverage joins purely on `id`; the text is never surfaced
  // in the ac_coverage entry or the untested-AC listing, so reading `text`/`description`
  // here (a shape the template never emits) computed a value nothing consumed (connectivity
  // audit 2026-06-30, AUDIT-0630-E). Join on the id; the id is all any consumer keys on.
  const acMeta = {};
  for (const us of (requirements?.user_stories || [])) {
    for (const ac of (us.acceptance_criteria || [])) {
      if (ac && typeof ac === 'object' && typeof ac.id === 'string' && ac.id.trim()) {
        acMeta[ac.id] = { fr_id: us.requirement_id || null };
      }
    }
  }
  const acIds = Object.keys(acMeta);
  if (acIds.length === 0) return [];   // no structured AC ids → no target to measure

  const counters = {};
  for (const id of acIds) counters[id] = { passing: 0, failing: 0, skipped: 0, manual: 0 };
  const tcToAc = {};
  for (const tc of testCases) if (typeof tc.ac_id === 'string' && tc.ac_id) tcToAc[tc.id] = tc.ac_id;
  for (const r of results) {
    const acId = tcToAc[r.tc_id];
    if (!acId || !counters[acId]) continue;
    if (r.status === 'pass')        counters[acId].passing++;
    else if (r.status === 'fail')   counters[acId].failing++;
    else if (r.status === 'manual') counters[acId].manual++;
    else                            counters[acId].skipped++;
  }

  return acIds.map(ac_id => {
    const c = counters[ac_id];
    let status;
    if (c.passing > 0)                                       status = c.failing > 0 ? 'partial' : 'covered';
    else if (c.failing > 0)                                  status = 'uncovered';
    // No 'manual' arm: a *pending* manual TC (seeded, unverified) must not satisfy an AC.
    // A *verified* manual TC is recorded status:"pass" → counted above (ADV-0622-01).
    else if (c.skipped > 0)                                  status = 'uncovered';   // a TC exists but did not run
    else                                                     status = 'untested';    // no TC references this AC
    return {
      ac_id, fr_id: acMeta[ac_id].fr_id,
      tests_passing: c.passing, tests_failing: c.failing, tests_skipped: c.skipped, tests_manual: c.manual,
      status,
    };
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
    // Grab the token after the marker and reconcile it through the shared
    // canonical grammar — NOT an ad-hoc `TC-[A-Za-z0-9]+`, which truncated
    // namespaced ids at the second hyphen (`TC-E2E-001h` → `TC-E2E`) and made
    // the assertion-density report name the wrong TC. Same SSoT as extractTCId.
    const markerMatch = lines[i].match(/(?:\/\/|#)\s*@aitri-tc\s+(\S+)/);
    if (!markerMatch) continue;
    const tc_id = extractTCId(markerMatch[1]);
    if (!tc_id) continue;
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
    // Defense-in-depth: complete-4 now rejects non-string test_files, but a manifest
    // hand-edited after approval could still carry an object/array entry — skip it
    // rather than crash path.join with a raw TypeError.
    if (typeof relPath !== 'string' || !relPath.trim()) continue;
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
 * Parse line coverage % from a test runner's output, stack-agnostic.
 * Tries each known format in order:
 *   - istanbul table ("All files | XX.XX |"): node built-in --coverage, jest, vitest
 *   - go test -cover ("coverage: XX.X% of statements")
 *   - pytest-cov term report ("TOTAL ... XX%")
 * @param {string} output - combined test runner output
 * @returns {number|null} line coverage percentage, or null if not found
 */
export function parseCoverageOutput(output) {
  if (!output) return null;
  // ADV-0622-10: anchor every matcher to the START of a line (leading whitespace only)
  // so an arbitrary log line — e.g. `Copying All files | 100 done` or `coverage: see report` —
  // cannot spoof the figure. Real coverage rows (istanbul/c8 table, `go test -cover`,
  // pytest-cov TOTAL) all begin their line; mid-line matches are noise, not coverage.
  // istanbul / node built-in coverage table — case-insensitive ("all files" / "All files").
  // That row is emitted at column 0, so line-anchoring is safe and blocks a mid-line spoof.
  let m = output.match(/^\s*all files\s*\|\s*([\d.]+)/im);
  if (m) return parseFloat(m[1]);
  // go test -cover — the figure is printed INLINE on the `ok` line
  // (`ok  pkg  0.01s  coverage: 87.5% of statements`), so a line anchor would miss it.
  // Anchor instead on go's signature suffix `% of statements`, which a prose log line
  // ("see the coverage: 100% claim") does not carry — keeping the anti-spoof intent.
  m = output.match(/coverage:\s*([\d.]+)%\s+of\s+statements/i);
  if (m) return parseFloat(m[1]);
  // pytest-cov terminal report TOTAL row — last percentage on the line
  m = output.match(/^TOTAL\b[^\n]*?(\d+(?:\.\d+)?)%/m);
  if (m) return parseFloat(m[1]);
  return null;
}

/**
 * Inject a coverage-collection flag into a test command, per runner family.
 * Stack-agnostic: node built-in runner, go test, pytest (pytest-cov), jest, vitest.
 * The coverage tool must already exist in the PROJECT's own environment (e.g.
 * pytest-cov declared in the project's deps) — Aitri orchestrates it via spawn,
 * it does not bundle it. This is the same pattern as the Playwright dispatch and
 * does not touch Aitri's zero-dep runtime invariant.
 * @param {string} testCmd
 * @param {number} nodeMajor - process major version, for the node coverage flag
 * @returns {{cmd: string, tool: string|null}} - tool is the instrumentation label, or null if unrecognized
 */
export function injectCoverageFlag(testCmd, nodeMajor) {
  const cmd = (testCmd || '').trim();
  if (cmd.startsWith('node ')) {
    if (/--coverage\b|--experimental-test-coverage\b/.test(cmd)) return { cmd, tool: 'node' };
    const flag = nodeMajor >= 22 ? '--coverage' : '--experimental-test-coverage';
    return { cmd: 'node ' + flag + ' ' + cmd.slice('node '.length).trim(), tool: flag };
  }
  if (/\bgo\s+test\b/.test(cmd)) {
    if (/\s-cover\b/.test(cmd)) return { cmd, tool: 'go -cover' };
    return { cmd: cmd.replace(/\bgo\s+test\b/, 'go test -cover'), tool: 'go -cover' };
  }
  if (/\bpytest\b/.test(cmd)) {
    if (/--cov\b/.test(cmd)) return { cmd, tool: 'pytest-cov' };
    return { cmd: cmd + ' --cov=. --cov-report=term', tool: 'pytest-cov' };
  }
  if (/\bjest\b/.test(cmd)) {
    if (/--coverage\b/.test(cmd)) return { cmd, tool: 'jest --coverage' };
    return { cmd: cmd + ' --coverage', tool: 'jest --coverage' };
  }
  if (/\bvitest\b/.test(cmd)) {
    if (/--coverage\b/.test(cmd)) return { cmd, tool: 'vitest --coverage' };
    return { cmd: cmd + ' --coverage', tool: 'vitest --coverage' };
  }
  return { cmd, tool: null };
}
