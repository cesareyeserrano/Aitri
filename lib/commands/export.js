/**
 * Module: Command — export
 * Purpose: Render Aitri's structured (JSON) artifacts as human-readable Markdown so product/QA
 *          can read them WITHOUT code and WITHOUT Hub. Read-only — reads existing artifacts and
 *          writes only the derived export (to stdout, or --out). Never mutates the pipeline.
 *
 * First surface (rc.130): `aitri export traceability` — the requirement × test-case × pass/fail
 * × compliance matrix. It is a QA/verification document, so it does NOT render each field
 * verbatim and trust it: it DERIVES and FLAGS cross-artifact inconsistency (a compliance level
 * that over-claims past the test evidence, an uncovered MUST, an orphan coverage id, an
 * unreadable source). A reassuring cell over a failing reality is worse than no cell.
 *
 * Zero-dep, stack-agnostic. render.js (a {{KEY}} prompt renderer) cannot build a table, so this
 * is purpose-written Markdown. Degrades gracefully — built from whatever artifacts exist.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, readArtifact } from '../state.js';

const SUBCOMMANDS = ['traceability'];

// Artifact-chain files an export must never overwrite via --out (M1 guard).
const ARTIFACT_NAMES = new Set([
  '00_DISCOVERY.md', '01_UX_SPEC.md', '01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md',
  '03_TEST_CASES.json', '04_BUILD_REPORT.json', '04_CODE_REVIEW.md', '04_TEST_RESULTS.json',
  '05_TRACEABILITY.json', 'BUGS.json', 'BACKLOG.json', 'AUDIT_REPORT.md',
]);

// Markdown table cell: a `|` is replaced with its HTML entity (renders as `|`, never breaks the
// column and never double-escapes a pre-existing `\|`); newlines collapse; non-scalars are made
// visible rather than silently coerced to `[object Object]`.
function cell(s) {
  if (s === null || s === undefined) return '';
  const str = (typeof s === 'object') ? JSON.stringify(s) : String(s);
  return str.replace(/\|/g, '&#124;').replace(/\r?\n/g, ' ').trim();
}

// Parse, distinguishing absent (raw null) from present-but-malformed.
function readJson(dir, name, artifactsDir) {
  const raw = readArtifact(dir, name, artifactsDir);
  if (raw == null) return { value: null, present: false, malformed: false };
  try { return { value: JSON.parse(raw), present: true, malformed: false }; }
  catch { return { value: null, present: true, malformed: true }; }
}

export function buildTraceabilityMarkdown(dir, config) {
  const artifactsDir = config.artifactsDir || '';
  const reqsP = readJson(dir, '01_REQUIREMENTS.json', artifactsDir);
  if (!reqsP.value) {
    return { error: reqsP.malformed
      ? '01_REQUIREMENTS.json is malformed JSON — fix it, then re-export.'
      : '01_REQUIREMENTS.json not found — run the pipeline through Phase 1 first.' };
  }
  const reqs = reqsP.value;
  const tcsP = readJson(dir, '03_TEST_CASES.json', artifactsDir);
  const resP = readJson(dir, '04_TEST_RESULTS.json', artifactsDir);
  const trcP = readJson(dir, '05_TRACEABILITY.json', artifactsDir);

  const warnings = [];
  // H4: a present-but-unreadable source is flagged, never silently treated as "no data".
  for (const [name, p] of [['03_TEST_CASES.json', tcsP], ['04_TEST_RESULTS.json', resP], ['05_TRACEABILITY.json', trcP]]) {
    if (p.malformed) warnings.push(`⚠ ${name} is present but unreadable (malformed JSON) — its data is omitted below.`);
  }

  const tcs        = tcsP.value?.test_cases || [];
  const frCov      = new Map((resP.value?.fr_coverage || []).map(c => [c.fr_id, c]));
  const compliance = new Map((trcP.value?.requirement_compliance || []).map(c => [c.id, c]));

  // TCs per requirement id (a TC targets via requirement_id or frs[]).
  const tcsByReq = {};
  for (const tc of tcs) {
    const ids = [tc.requirement_id, ...(Array.isArray(tc.frs) ? tc.frs : [])].filter(Boolean);
    for (const id of new Set(ids)) (tcsByReq[id] ||= []).push(tc.id);
  }

  const isMust = (r) => r.priority === 'MUST' || r.category === 'Regression';
  const reqIds = new Set();
  const rows = [];
  const addReq = (r, kind) => {
    if (!r || !r.id) return;
    reqIds.add(r.id);
    const cov  = frCov.get(r.id);
    const comp = compliance.get(r.id);
    const must = isMust(r);
    // H5: union the live test plan (03) with the compliance record's tc_ids (05) — hide neither.
    const tcIds = [...new Set([...(tcsByReq[r.id] || []), ...((comp?.tc_ids) || [])])];

    const tests = cov
      ? `✓${cov.tests_passing || 0} ✗${cov.tests_failing || 0} ⊘${cov.tests_skipped || 0}` +
        (cov.tests_manual ? ` ✋${cov.tests_manual}` : '')
      : '—';

    // H2: coverage cell ALARMS on an uncovered/partial/failing MUST instead of pacifying.
    let coverage;
    if (!cov) coverage = tcIds.length ? 'not run' : (must ? '⚠ untested' : '—');
    else {
      coverage = cov.status || '—';
      const bad = cov.status === 'uncovered' || cov.status === 'partial' ||
                  (cov.tests_failing || 0) > 0 ||
                  (cov.status === 'covered' && (cov.tests_passing || 0) === 0);
      if (must && bad) coverage = `⚠ ${cov.status || 'no status'}${(cov.tests_failing || 0) > 0 ? ' (failing)' : ''}`;
    }

    // H1: compliance level is cross-checked against the test evidence — a "complete" claim over
    // non-covered / failing coverage is flagged, not printed as authoritative QA truth.
    let level = comp?.level || '—';
    if (comp && (level === 'complete' || level === 'production_ready')) {
      const backed = cov && (cov.status === 'covered' || cov.status === 'manual') && (cov.tests_failing || 0) === 0;
      if (!backed) level = `⚠ ${level} (vs tests)`;
    }

    rows.push([
      r.id, r.title || r.requirement || '',
      r.priority || (r.category === 'Regression' ? 'MUST (reg)' : '—'),
      kind, tcIds.length ? tcIds.join(', ') : '—', tests, coverage, level,
    ]);
  };
  for (const fr  of (reqs.functional_requirements     || [])) addReq(fr,  'FR');
  for (const nfr of (reqs.non_functional_requirements || [])) addReq(nfr, 'NFR');

  // H3: coverage entries referencing a requirement absent from 01 are surfaced, not dropped.
  const orphans = [...frCov.keys()].filter(id => !reqIds.has(id));
  if (orphans.length) {
    warnings.push(`⚠ ${orphans.length} coverage entr${orphans.length === 1 ? 'y references a requirement' : 'ies reference requirements'} ` +
      `not in 01_REQUIREMENTS.json (stale/renamed id): ${orphans.join(', ')}.`);
  }

  const name = config.projectName || reqs.project || 'Project';
  const sources = ['`01_REQUIREMENTS.json`']
    .concat(tcsP.value ? ['`03_TEST_CASES.json`'] : [])
    .concat(resP.value ? ['`04_TEST_RESULTS.json`'] : [])
    .concat(trcP.value ? ['`05_TRACEABILITY.json`'] : []);

  const lines = [`# Traceability Matrix — ${cell(name)}`, ''];
  if (trcP.value) {
    lines.push(`**Overall status:** ${cell(trcP.value.overall_status || '—')} · ` +
               `**Phases completed:** ${cell((trcP.value.phases_completed || []).join(', ') || '—')}`);
  }
  lines.push(`**Requirements:** ${rows.length} · **Sources:** ${sources.join(', ')}`);
  lines.push('');
  if (!rows.length) {
    lines.push('_No requirements found in `01_REQUIREMENTS.json`._');
  } else {
    lines.push('| Requirement | Title | Priority | Type | Test Cases | Tests (✓pass ✗fail ⊘skip) | Coverage | Compliance |');
    lines.push('|:---|:---|:---|:---|:---|:---|:---|:---|');
    for (const row of rows) lines.push('| ' + row.map(cell).join(' | ') + ' |');
  }
  if (warnings.length) {
    lines.push('');
    lines.push('### ⚠ Consistency warnings');
    for (const w of warnings) lines.push(`- ${w}`);
  }
  lines.push('');
  lines.push('> ✓ passing · ✗ failing · ⊘ skipped · ✋ manual · ⚠ flags a value that conflicts with the test evidence. Read-only export — re-run after `verify-run` to refresh.');
  return lines.join('\n');
}

export function cmdExport({ dir, args, flagValue, err }) {
  const sub = args[0];
  if (!SUBCOMMANDS.includes(sub)) {
    err(
      `Usage: aitri export <traceability> [--format md] [--out <file>]\n` +
      `  traceability — requirement × test-case × pass/fail × compliance matrix (Markdown)\n` +
      `  (root scope only; requirements / tests renderers and feature scope are the next slices)`
    );
    return;
  }
  const format = flagValue('--format') || 'md';
  if (format !== 'md') { err(`Unsupported --format "${format}" — only "md" (Markdown) is supported.`); return; }

  const config = loadConfig(dir);
  const built = buildTraceabilityMarkdown(dir, config);
  if (built && typeof built === 'object' && built.error) { err(built.error); return; }

  const outFlag = flagValue('--out');
  if (outFlag) {
    const abs = path.resolve(path.isAbsolute(outFlag) ? outFlag : path.join(dir, outFlag));
    // M1 guard: a read-only export must not clobber a pipeline artifact. Refuse a path inside the
    // artifacts directory, or one whose basename is an artifact-chain file.
    const artifactsAbs = path.resolve(dir, config.artifactsDir || '');
    const insideArtifacts = config.artifactsDir && (abs === artifactsAbs || abs.startsWith(artifactsAbs + path.sep));
    if (insideArtifacts || ARTIFACT_NAMES.has(path.basename(abs))) {
      err(`Refusing --out "${outFlag}": it would write into the artifacts directory or overwrite a pipeline artifact.\n` +
          `  Choose a path outside the spec chain (e.g. --out traceability.md).`);
      return;
    }
    fs.writeFileSync(abs, built + '\n');
    process.stdout.write(`✅ Wrote ${sub} matrix (Markdown) → ${abs}\n`);
  } else {
    process.stdout.write(built + '\n');
  }
}
