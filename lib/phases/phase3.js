/**
 * Module: Phase 3 — QA Test Design
 * Purpose: QA Engineer persona. Creates comprehensive test plan from requirements and design.
 * Artifact: 03_TEST_CASES.json
 */

import fs from 'fs';
import { extractTestIndex } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/qa.js';
import { render } from '../prompts/render.js';
import { artifactPath, readArtifactFile } from '../state.js';
import { isCanonicalTCId, suggestCanonicalTCId } from '../tc-id.js';
import { isMustRequirement } from '../requirements.js';

export default {
  num: 3,
  alias: 'tests',
  name: 'Test Cases',
  persona: 'QA Engineer',
  artifact: '03_TEST_CASES.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md'],
  optionalInputs: ['01_UX_SPEC.md'],

  extractContext: extractTestIndex,

  validate(content, ctx = {}) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('03_TEST_CASES.json is not valid JSON — check that the agent did not wrap output in markdown fences, add trailing commas, or save the file with a leading byte-order mark (BOM).');
    }
    if (!d.test_plan) throw new Error('test_plan field is required — the artifact is invalid without it');
    if (!d.test_cases?.length) throw new Error('test_cases array is required and cannot be empty');

    // Z4 (alpha.13) — duplicate-id detection. Without this guard, downstream
    // counts diverge silently: `summary.manual = manualTCIds.size` (Set of
    // unique ids) vs `results.length` (array iteration). Surfaced by Zombite
    // canary 2026-04-29 — feature `stabilizacion` had `TC-STB-006h` listed
    // 6 times across 51 entries (46 unique). Display showed `46 ⊘` while
    // verify-complete narration said "49 manual" — both correct given broken
    // input, but operator-confusing.
    {
      const seen = new Map();
      for (const tc of d.test_cases) {
        if (!tc || typeof tc.id !== 'string') continue;
        seen.set(tc.id, (seen.get(tc.id) || 0) + 1);
      }
      const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} (×${n})`);
      if (dupes.length) {
        throw new Error(
          `Duplicate TC id(s) in test_cases: ${dupes.join(', ')} — every test case must have a unique id. ` +
          `Rename the duplicates — either a letter suffix (TC-001a / TC-001b) or, to avoid colliding with ` +
          `existing ids (e.g. when adding a feature's TCs to a shared suite), a namespaced prefix ` +
          `(TC-AUTH-001, TC-PAY-001) — then re-run aitri complete 3.`
        );
      }
    }

    // Canonical TC-id gate. verify-run links a parsed runner-output id to a plan
    // id by string equality (lib/commands/verify.js `detected.get(tc.id)`), so a
    // plan id that the shared parser cannot round-trip is silently unlinkable and
    // drops to "skip". The template teaches the canonical form (templates/phases/
    // tests.md), but until now nothing enforced it — Hub's `hub-folder-scan`
    // feature authored `TC-e2eFolderScan` / `TC-e2eFolderEmpty` (no numeric block),
    // passed Phase 3, then verify-run could not link them. `isCanonicalTCId` is the
    // SAME grammar verify-run parses with, so gate and parser cannot drift apart.
    {
      const nonCanonical = d.test_cases
        .filter(tc => tc && typeof tc.id === 'string')
        .filter(tc => !isCanonicalTCId(tc.id))
        .map(tc => tc.id);
      if (nonCanonical.length) {
        // Per id: show the deterministic canonical form when one exists (a glued
        // namespace just needs the separator), otherwise tell the agent it must
        // assign a numeric block itself (descriptive ids have nothing to anchor on).
        const lines = nonCanonical.map(id => {
          const fix = suggestCanonicalTCId(id);
          return fix
            ? `  ${id} → ${fix}`
            : `  ${id} → (assign a numeric block, e.g. TC-E2E-001h)`;
        });
        throw new Error(
          `Non-canonical TC id(s) — every id must be TC + optional UPPERCASE ` +
          `namespace + a numeric block + suffix (e.g. TC-001h, TC-E2E-001h, ` +
          `TC-API-USER-010f). Ids without a numeric block (TC-e2eFolderScan) or with ` +
          `a glued/lowercase namespace (TC-NFR010h, TC-fe-001h) cannot be linked to ` +
          `runner output by verify-run and would silently drop to skip. Suggested ` +
          `renames:\n${lines.join('\n')}\nRename them and re-run aitri complete 3.`
        );
      }
    }

    const VALID_TYPES     = new Set(['unit', 'integration', 'e2e']);
    const VALID_SCENARIOS = new Set(['happy_path', 'edge_case', 'negative']);

    const invalidTypes = d.test_cases.filter(tc => !VALID_TYPES.has(tc.type));
    if (invalidTypes.length)
      throw new Error(`Invalid type value(s) in test_cases: ${invalidTypes.map(tc => `"${tc.type}" (${tc.id})`).join(', ')}. Must be one of: unit | integration | e2e`);

    const invalidScenarios = d.test_cases.filter(tc => !VALID_SCENARIOS.has(tc.scenario));
    if (invalidScenarios.length)
      throw new Error(`Invalid scenario value(s) in test_cases: ${invalidScenarios.map(tc => `"${tc.scenario}" (${tc.id ?? '?'})`).join(', ')}. Must be one of: happy_path | edge_case | negative`);

    // Pre-read 01_REQUIREMENTS.json once: known FR/NFR ids (requirement targets) and
    // known AC ids (acceptance_criteria with structured `{id}` — the only join target
    // for ac_id). ADR-041 (option B): Phase 1 is NOT required to emit structured ACs,
    // so when none carry ids there is no target — requiring ac_id then is a hollow gate
    // (it traces to nothing, and nothing downstream consumes it: verify-run/phase5 key
    // on FR/NFR ids). So ac_id is required ONLY when Phase 1 provides AC ids; otherwise
    // it is optional (traceability still holds via requirement_id + user_story_id, both
    // always required). When AC ids exist, ac_id is required AND value-checked below.
    const { dir, config } = ctx;
    let knownFRIds  = null;
    let knownNFRIds = null;
    // null = requirements not read (no dir / malformed) → conservative default.
    // true = the surface has a UI (a UX/visual/audio FR); false = backend-only.
    // Drives the e2e gate below (TPA-7): a backend-only surface has no browser flow.
    let hasUiFr     = null;
    const knownAcIds = new Set();
    if (dir) {
      const reqPath = artifactPath(dir, config || {}, '01_REQUIREMENTS.json');
      if (fs.existsSync(reqPath)) {
        try {
          const reqs  = JSON.parse(readArtifactFile(reqPath));
          knownFRIds  = new Set((reqs.functional_requirements      || []).map(fr  => fr.id ).filter(Boolean));
          knownNFRIds = new Set((reqs.non_functional_requirements  || []).map(nfr => nfr.id).filter(Boolean));
          hasUiFr     = (reqs.functional_requirements || [])
            .some(fr => ['ux', 'visual', 'audio'].includes(String(fr.type || '').toLowerCase()));
          for (const us of (reqs.user_stories || []))
            for (const ac of (us.acceptance_criteria || []))
              if (ac && ac.id) knownAcIds.add(ac.id);
        } catch { /* malformed — skip */ }
      }
    }

    if (knownAcIds.size > 0) {
      const missingAcId = d.test_cases.filter(tc => !tc.ac_id || typeof tc.ac_id !== 'string');
      if (missingAcId.length)
        throw new Error(`Missing ac_id in test_cases: ${missingAcId.map(tc => tc.id ?? '(unknown)').join(', ')} — 01_REQUIREMENTS.json declares acceptance-criterion ids, so each TC must trace to one via ac_id`);
    }

    const missingUsId = d.test_cases.filter(tc => !tc.user_story_id || typeof tc.user_story_id !== 'string');
    if (missingUsId.length)
      throw new Error(`Missing user_story_id in test_cases: ${missingUsId.map(tc => tc.id ?? '(unknown)').join(', ')} — each TC must trace to a specific user story`);

    // Placeholder expected_result detection
    const PLACEHOLDER_RESULTS = new Set([
      'it works', 'should work', 'test passes', 'passes', 'succeeds',
      'works correctly', 'returns successfully', 'is correct', 'is valid', 'ok',
    ]);
    const vagueResults = d.test_cases.filter(tc =>
      typeof tc.expected_result === 'string' &&
      PLACEHOLDER_RESULTS.has(tc.expected_result.trim().toLowerCase())
    );
    if (vagueResults.length)
      throw new Error(
        `Placeholder expected_result in test cases: ${vagueResults.map(tc => tc.id).join(', ')}\n` +
        `  expected_result must describe a specific, observable outcome — not "${vagueResults[0].expected_result}".`
      );

    // (knownFRIds / knownNFRIds / knownAcIds were pre-read once above — ADR-041.)
    const byReq = {};
    for (const tc of d.test_cases) {
      // A TC targets one FR via `requirement_id` OR several via `frs[]` — the
      // schema-sanctioned multi-FR form that verify-run PREFERS (ARTIFACTS.md +
      // lib/commands/verify.js). frs wins when present. Bucket the TC into EACH
      // target so per-FR coverage and the FR-MUST gap below count it for every FR
      // it covers, matching verify-run's fr_coverage (they used to diverge:
      // phase3 rejected frs outright, so the documented form was uncompletable).
      const targets = (Array.isArray(tc.frs) && tc.frs.length)
        ? tc.frs
        : (typeof tc.requirement_id === 'string' && tc.requirement_id ? [tc.requirement_id] : []);
      if (!targets.length)
        throw new Error(`${tc.id ?? '(unknown TC)'} has no requirement_id and no frs[] — every TC must target at least one FR/NFR id (e.g. "requirement_id": "FR-001", or "frs": ["FR-001","FR-002"]).`);
      for (const t of targets) {
        if (typeof t !== 'string' || !t.trim())
          throw new Error(`${tc.id ?? '(unknown TC)'} has an invalid requirement target — each must be a non-empty FR/NFR id string.`);
        if (!byReq[t]) byReq[t] = [];
        byReq[t].push(tc);
      }
    }
    // §3.4 (rc.64 adopter): collect every Three-Amigos coverage shortfall — per FR AND
    // across FRs — and report them in one error, so the agent fixes them in a single
    // pass instead of one FR (and one sub-check) per `complete 3` cycle. The structural
    // checks (comma id / unknown requirement_id) stay fail-fast: they mean a malformed
    // plan, not a coverage gap.
    const coverageIssues = [];
    for (const [reqId, cases] of Object.entries(byReq)) {
      if (reqId.includes(','))
        throw new Error(`requirement_id must be a single FR id — got "${reqId}". Use one test case per requirement, not comma-separated ids.`);
      const matchesFR  = knownFRIds  && knownFRIds.has(reqId);
      const matchesNFR = knownNFRIds && knownNFRIds.has(reqId);
      const haveAnyKnown = (knownFRIds && knownFRIds.size > 0) || (knownNFRIds && knownNFRIds.size > 0);
      if (haveAnyKnown && !matchesFR && !matchesNFR)
        throw new Error(
          `TC requirement_id "${reqId}" does not match any requirement in 01_REQUIREMENTS.json.\n` +
          `  Acceptable values: functional_requirements[*].id (FR-xxx) or non_functional_requirements[*].id (NFR-xxx).\n` +
          `  If "${reqId}" is a real requirement, add it to 01_REQUIREMENTS.json before completing Phase 3.`
        );
      if (cases.length < 3) {
        // The gate enforces a happy_path and a negative case (below); the third is expected
        // to be an edge case but is not enforced as a distinct scenario — don't imply it is.
        coverageIssues.push(`${reqId} has ${cases.length} test case(s) — min 3 required (happy_path + negative are enforced; add an edge case as the third)`);
        continue; // the mandatory scenarios cannot exist below the minimum — fix the count first
      }
      const scenarios = new Set(cases.map(tc => tc.scenario));
      if (!scenarios.has('happy_path'))
        coverageIssues.push(`${reqId} has no happy_path test case — Three Amigos gate: every FR needs at least one h_ (happy_path) scenario`);
      if (!scenarios.has('negative'))
        coverageIssues.push(`${reqId} has no negative test case — Three Amigos gate: every FR needs at least one f_ (negative/failure) scenario`);
      const hasH = cases.some(tc => typeof tc.id === 'string' && tc.id.endsWith('h'));
      const hasF = cases.some(tc => typeof tc.id === 'string' && tc.id.endsWith('f'));
      if (!hasH)
        coverageIssues.push(`${reqId} has no TC id ending in 'h' — add a happy-path TC (e.g. TC-001h)`);
      if (!hasF)
        coverageIssues.push(`${reqId} has no TC id ending in 'f' — add a failure TC (e.g. TC-001f)`);
    }
    if (coverageIssues.length)
      throw new Error(`Three Amigos coverage gaps — fix all and re-run aitri complete 3:\n  ${coverageIssues.join('\n  ')}`);
    // Critical-flow coverage gate (TPA-7, third-party adopter §4.6/A2). A UI surface
    // (any UX/visual/audio FR) needs real end-to-end tests. A BACKEND-ONLY surface has
    // no browser flow, so API-level integration tests ARE its critical-flow coverage —
    // accept e2e OR integration there, instead of forcing authors to mislabel
    // integration as `e2e` to clear the gate (which corrupts the type taxonomy other
    // gates read). When requirements can't be read (hasUiFr === null), stay conservative
    // and require e2e. This only ever RELAXES the gate for a verified backend-only
    // surface — no project that passes today newly fails.
    if (hasUiFr === false) {
      const criticalFlow = d.test_cases.filter(tc => tc.type === 'e2e' || tc.type === 'integration').length;
      if (criticalFlow < 2)
        throw new Error(
          `Only ${criticalFlow} critical-flow test(s) found — min 2 required. This is a backend-only ` +
          `surface (no UX/visual/audio FR), so API-level integration tests count; label them ` +
          `type "integration" (do not mislabel as "e2e").`
        );
    } else {
      const e2eCount = d.test_cases.filter(tc => tc.type === 'e2e').length;
      if (e2eCount < 2)
        throw new Error(`Only ${e2eCount} e2e test(s) found — min 2 required for critical UI flows`);
    }

    // Cross-phase check: verify each ac_id exists in 01_REQUIREMENTS.json
    if (dir) {
      const reqPath = artifactPath(dir, config || {}, '01_REQUIREMENTS.json');
      if (fs.existsSync(reqPath)) {
        let reqs;
        try { reqs = JSON.parse(readArtifactFile(reqPath)); } catch { /* malformed — skip */ }
        if (reqs) {
          // ac_id VALUE cross-check — uses the pre-read knownAcIds (ADR-041). Runs only
          // when Phase 1 has structured AC ids; otherwise ac_id was optional (see above)
          // and there is nothing to validate against.
          if (knownAcIds.size > 0) {
            const badAcRefs = d.test_cases
              .filter(tc => tc.ac_id && tc.requirement_id && !knownAcIds.has(tc.ac_id))
              .map(tc => `${tc.id}: ac_id "${tc.ac_id}" not found in ${tc.requirement_id}`);
            if (badAcRefs.length)
              throw new Error(
                `Three Amigos gate — AC references not found in 01_REQUIREMENTS.json:\n  ${badAcRefs.join('\n  ')}\n` +
                `  Available ac_id values in 01_REQUIREMENTS.json (user_stories[].acceptance_criteria[].id): ${[...knownAcIds].sort().join(', ')}\n` +
                `  Use one of these — do not invent an ac_id format.`
              );
          } else {
            // ADR-041 (option B): Phase 1 has no structured acceptance_criteria with ids,
            // so ac_id was NOT required above and there is nothing to validate against. If
            // the agent supplied ac_id anyway, the values are decorative — surface that as
            // an informational warning + the path to real AC-level traceability (option A).
            const tcsWithAc = d.test_cases.filter(tc => tc.ac_id);
            if (tcsWithAc.length > 0)
              process.stderr.write(
                `[aitri] Note: ${tcsWithAc.length} test case(s) declare ac_id, but 01_REQUIREMENTS.json ` +
                `has no structured acceptance_criteria with ids — these ac_id values are not validated.\n` +
                `  For real AC-level traceability, add { "id": "AC-…", "text": "…" } entries to user_stories[].acceptance_criteria.\n`
              );
          }

          // MUST gap: every MUST requirement must have at least one TC. NFRs are
          // first-class testable targets (a TC's requirement_id may be an NFR id),
          // so a priority:MUST NFR with zero TCs must also be caught — it was not
          // (audit Tier-2): the check only scanned functional_requirements.
          // isMustRequirement also treats a regression NFR (category:"Regression")
          // as MUST even without priority (REG-GATE-0621) — a Must-Not-Break item
          // written per the base schema (no priority) used to escape this gate.
          const mustFRIds = [
            ...(reqs.functional_requirements     || []),
            ...(reqs.non_functional_requirements || []),
          ].filter(isMustRequirement).map(r => r.id);
          if (mustFRIds.length > 0) {
            // byReq keys already include every requirement_id AND every frs[]
            // target — so a MUST requirement covered only by a multi-FR TC counts
            // as covered (consistent with verify-run's fr_coverage).
            const coveredFRIds = new Set(Object.keys(byReq));
            const uncovered = mustFRIds.filter(id => !coveredFRIds.has(id));
            if (uncovered.length > 0)
              throw new Error(
                `${uncovered.length} MUST requirement(s) have no test cases in 03_TEST_CASES.json:\n` +
                uncovered.map(id => `  ${id}`).join('\n') + '\n' +
                `  Every MUST requirement (FR or NFR, including any category:"Regression" NFR) must have at least one test case. Add TCs, or down-scope (change priority/category).`
              );
          }
        }
      } else {
        process.stderr.write(`[aitri] Warning: 01_REQUIREMENTS.json not found — skipping AC cross-reference check.\n`);
      }
    }
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, bestPractices, scopeVerb = '', scopeArg = '' }) {
    return render('phases/tests', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      SYSTEM_DESIGN: inputs['02_SYSTEM_DESIGN.md'],
      UX_SPEC: inputs['01_UX_SPEC.md'] || '',
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
