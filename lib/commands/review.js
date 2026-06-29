/**
 * Module: Command — review
 * Purpose: Cross-artifact semantic consistency checks.
 *          Checks that artifacts are consistent with each other, not just individually valid.
 *
 * Scopes:
 *   'phase1' — Source-capture audit: idea_context/ assets vs FRs (advisory; called by complete 1)
 *   'phase2' — System Design → MUST FRs: each MUST FR id referenced in the design (advisory; called by complete 2)
 *   'phase3' — Requirements → Test Cases only (called by complete 3)
 *   'phase5' — Test Cases → Test Results only (called by complete 5)
 *   'all'    — phase2 + phase3 + phase5 cross-artifact checks (standalone aitri review)
 *
 * Returns { errors: string[], warnings: string[] } when called programmatically (runReview).
 * Exits with error/0 when called from CLI (cmdReview).
 */

import fs from 'fs';
import { loadConfig, readArtifact, ideaContextSubdir } from '../state.js';
import { listAssets, visualAssets } from '../context-assets.js';
import { isMustRequirement } from '../requirements.js';

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

  // ── Source-capture audit (phase1) ─────────────────────────────────────────
  // The supporting assets in idea_context/ (or feature_context/) are the richest
  // input to the requirements, but nothing downstream measures whether the FR set
  // reflects them — a half-scoped spec passes every mechanical gate (the DSB-AT-POC
  // adopter lost ~50% of scope this way). Aitri cannot judge semantic coverage
  // (zero-dep, no vision), so this is ADVISORY: it surfaces the assets at the gate
  // and asks for explicit confirmation, turning a SILENT omission into a loud one.
  // (TPA-3, third-party adopter 2026-06-05.)
  if (scope === 'phase1') {
    // Root unit context resolves through the layout (aitri/product/idea_context
    // when contained); feature_context only exists inside a feature dir, which
    // stays flat — `dir` here IS the feature dir in feature scope.
    for (const folder of [ideaContextSubdir(config).replace(/\\/g, '/'), 'feature_context']) {
      const assets = listAssets(dir, folder);
      if (!assets.length) continue;
      warnings.push(
        `${assets.length} asset(s) in ${folder}/ — confirm the requirements reflect them ` +
        `(Aitri cannot verify asset coverage mechanically): ${assets.join(', ')}`
      );
      const visuals = visualAssets(assets);
      if (visuals.length) {
        warnings.push(
          `${visuals.length} visual asset(s) (${visuals.join(', ')}) — Aitri cannot read images; ` +
          `confirm each is reflected in a UX-type FR (which triggers the UX phase) or is intentionally out of scope.`
        );
      }
    }
  }

  // ── System Design → MUST requirements (phase2) ────────────────────────────
  // Phase-2 validate() checks only structure (sections + length); it gets no `dir`/config,
  // so it CANNOT see the requirements — a design that silently omits a MUST FR passes every
  // gate (verified gap, 2026-06-28). This closes the read side at the cheap catch point.
  // ADVISORY, not a hard block: the design is prose and may reference a requirement by
  // description rather than its id, so a hard string gate would false-fire on a good design
  // (the no_go_zone-leak trap). Surface each MUST FR whose id is absent from the design; the
  // human confirms at approve 2. Honest ceiling: Aitri checks the id is REFERENCED, never
  // that the design actually addresses it.
  if ((scope === 'phase2' || scope === 'all') && reqRaw) {
    const designRaw = readArtifact(dir, '02_SYSTEM_DESIGN.md', artifactsDir);
    if (designRaw) {
      let reqs = null;
      try { reqs = JSON.parse(reqRaw); } catch { /* phase-1 already gates JSON validity */ }
      if (reqs) {
        // Boundary match, NOT a bare substring: `designRaw.includes('FR-1')` is true inside
        // `FR-12` (digit suffix) AND inside `NFR-1` (letter prefix), so a real omission of
        // FR-1 would be silently missed whenever a higher id or an NFR is mentioned. Require
        // the id not be preceded by a letter and not followed by a digit.
        const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const referenced = (id) => new RegExp(`(?<![A-Za-z])${escapeRe(id)}(?![0-9])`).test(designRaw);
        const unaddressed = (reqs.functional_requirements || [])
          .filter(isMustRequirement)
          .filter(fr => fr.id && !referenced(fr.id));
        for (const fr of unaddressed)
          warnings.push(
            `${fr.id} (${fr.title || 'untitled'}) is a MUST FR but its id is not referenced in ` +
            `02_SYSTEM_DESIGN.md — confirm the design addresses it (Aitri checks the id appears, not ` +
            `that it is fully designed).`
          );
      }
    }
  }

  // ── Requirements → Test Cases ─────────────────────────────────────────────
  if ((scope === 'phase3' || scope === 'all') && reqRaw && tcsRaw) {
    let reqs, tcs;
    try { reqs = JSON.parse(reqRaw); }
    catch { errors.push('01_REQUIREMENTS.json is malformed JSON'); return { errors, warnings }; }
    try { tcs = JSON.parse(tcsRaw); }
    catch { errors.push('03_TEST_CASES.json is malformed JSON'); return { errors, warnings }; }

    const frMap = {};
    for (const fr of (reqs.functional_requirements || [])) {
      frMap[fr.id] = fr;
    }
    // NFR ids are valid TC targets too — phase3's gate accepts (and Three-Amigos
    // demands triplets for) NFR-targeted TCs, so rejecting them here trapped the
    // agent in a contradiction loop (Phase-D canary taskcli, 2026-06-12): one
    // gate said "write 3 TCs for NFR-001", this one said the id doesn't exist.
    const knownReqIds = new Set(Object.keys(frMap));
    for (const nfr of (reqs.non_functional_requirements || [])) {
      if (nfr.id) knownReqIds.add(nfr.id);
    }

    // Build active (non-skip) TC coverage per FR
    const activeTCsByFR = {};
    for (const tc of (tcs.test_cases || [])) {
      if (!tc.requirement_id) {
        warnings.push(`${tc.id ?? '(unknown TC)'} has no requirement_id`);
        continue;
      }
      if (!knownReqIds.has(tc.requirement_id)) {
        errors.push(`${tc.id} references requirement_id "${tc.requirement_id}" which does not exist in 01_REQUIREMENTS.json`);
        continue;
      }
      if (!frMap[tc.requirement_id]) continue; // NFR target — valid, but not part of per-FR coverage below
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
  if ((scope === 'phase5' || scope === 'all') && tcsRaw && resultsRaw) {
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
  if (phaseArg === '2') scope = 'phase2';
  else if (phaseArg === '3') scope = 'phase3';
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
