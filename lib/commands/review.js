/**
 * Module: Command — review
 * Purpose: Cross-artifact semantic consistency checks.
 *          Checks that artifacts are consistent with each other, not just individually valid.
 *
 * Scopes:
 *   'phase3' — Requirements → Test Cases only (called by complete 3)
 *   'phase5' — Test Cases → Test Results only (called by complete 5)
 *   'all'    — both checks (standalone aitri review)
 *
 * Returns { errors: string[], warnings: string[] } when called programmatically (runReview).
 * Exits with error/0 when called from CLI (cmdReview).
 */

import fs from 'fs';
import { loadConfig, readArtifact } from '../state.js';

/**
 * Run cross-artifact consistency checks.
 * @param {string} dir - project directory
 * @param {object} config - loaded .aitri config
 * @param {'phase3'|'phase5'|'all'} scope
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function runReview(dir, config, scope = 'all') {
  const artifactsDir = config.artifactsDir || '';
  const errors   = [];
  const warnings = [];

  const reqRaw     = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
  const tcsRaw     = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
  const resultsRaw = readArtifact(dir, '04_TEST_RESULTS.json', artifactsDir);

  // ── Requirements → Test Cases ─────────────────────────────────────────────
  if (scope !== 'phase5' && reqRaw && tcsRaw) {
    let reqs, tcs;
    try { reqs = JSON.parse(reqRaw); }
    catch { errors.push('01_REQUIREMENTS.json is malformed JSON'); return { errors, warnings }; }
    try { tcs = JSON.parse(tcsRaw); }
    catch { errors.push('03_TEST_CASES.json is malformed JSON'); return { errors, warnings }; }

    const frMap = {};
    for (const fr of (reqs.functional_requirements || [])) {
      frMap[fr.id] = fr;
    }

    // Build active (non-skip) TC coverage per FR
    const activeTCsByFR = {};
    for (const tc of (tcs.test_cases || [])) {
      if (!tc.requirement_id) {
        warnings.push(`${tc.id ?? '(unknown TC)'} has no requirement_id`);
        continue;
      }
      if (!frMap[tc.requirement_id]) {
        errors.push(`${tc.id} references requirement_id "${tc.requirement_id}" which does not exist in 01_REQUIREMENTS.json`);
        continue;
      }
      if (tc.status !== 'skip') {
        if (!activeTCsByFR[tc.requirement_id]) activeTCsByFR[tc.requirement_id] = [];
        activeTCsByFR[tc.requirement_id].push(tc.id);
      }
    }

    // Check coverage per FR
    for (const fr of (reqs.functional_requirements || [])) {
      const covered = (activeTCsByFR[fr.id] || []).length > 0;
      if (!covered) {
        if (fr.priority === 'MUST') {
          errors.push(`${fr.id} (MUST) has no active test cases — add at least one TC with status != "skip"`);
        } else if (fr.priority === 'SHOULD') {
          warnings.push(`${fr.id} (SHOULD) has no test cases`);
        }
      }
    }
  }

  // ── Test Cases → Test Results ─────────────────────────────────────────────
  if (scope !== 'phase3' && tcsRaw && resultsRaw) {
    let tcs, results;
    try { tcs = JSON.parse(tcsRaw); }
    catch { errors.push('03_TEST_CASES.json is malformed JSON'); return { errors, warnings }; }
    try { results = JSON.parse(resultsRaw); }
    catch { errors.push('04_TEST_RESULTS.json is malformed JSON'); return { errors, warnings }; }

    const tcIds     = new Set((tcs.test_cases     || []).map(tc => tc.id));
    const resultIds = new Set((results.results    || []).map(r  => r.tc_id));

    for (const tc of (tcs.test_cases || [])) {
      if (!resultIds.has(tc.id)) {
        warnings.push(`${tc.id} has no result entry in 04_TEST_RESULTS.json`);
      }
    }
    for (const r of (results.results || [])) {
      if (!tcIds.has(r.tc_id)) {
        errors.push(`Result for "${r.tc_id}" references a TC that does not exist in 03_TEST_CASES.json`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Print review results to stdout/stderr.
 * @param {{ errors: string[], warnings: string[] }} result
 */
export function printReview({ errors, warnings }) {
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All cross-artifact checks passed');
    return;
  }
  if (errors.length) {
    process.stderr.write(`\n❌ Cross-artifact errors — fix before proceeding:\n`);
    for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
  }
  if (warnings.length) {
    process.stdout.write(`\n⚠ Warnings:\n`);
    for (const w of warnings) process.stdout.write(`  ⚠ ${w}\n`);
  }
}

export function cmdReview({ dir, args, err }) {
  const config = loadConfig(dir);

  const phaseIdx = args.indexOf('--phase');
  const phaseArg = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const frFilter = (() => { const i = args.indexOf('--fr'); return i >= 0 ? args[i + 1] : null; })();

  let scope = 'all';
  if (phaseArg === '3') scope = 'phase3';
  else if (phaseArg === '5') scope = 'phase5';

  let { errors, warnings } = runReview(dir, config, scope);

  // --fr filter: keep only findings that mention the requested FR id
  if (frFilter) {
    errors   = errors.filter(e => e.includes(frFilter));
    warnings = warnings.filter(w => w.includes(frFilter));
  }

  printReview({ errors, warnings });

  if (errors.length) process.exit(1);
}
