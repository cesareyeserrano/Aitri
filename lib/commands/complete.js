/**
 * Module: Command — complete
 * Purpose: Validate artifact + record phase as complete. Gate before approve.
 */

import fs from 'fs';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES, upstreamProducers } from '../phases/index.js';
import { loadConfig, saveConfig, artifactPath, appendEvent, clearDriftPhase, hashArtifact, writeLastSession, cascadeInvalidate, clearCascadePending } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
import { runReview, printReview } from './review.js';
import { requirementsAuditState } from './audit.js';
import { scopeTokens } from '../scope.js';

export function cmdComplete({ dir, args, err, featureRoot, scopeName }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
  const raw       = args[0];
  const checkOnly = args.includes('--check');
  const phase     = OPTIONAL_PHASES.includes(raw) ? raw : PHASE_ALIASES[raw] !== undefined ? PHASE_ALIASES[raw] : parseInt(raw);
  const p         = PHASE_DEFS[phase];
  const key       = p?.alias || phase; // human-readable key for output messages

  if (!p) err(`Usage: aitri complete <requirements|architecture|tests|build|deploy|ux|discovery> [--check]`);

  const config   = loadConfig(dir);
  const artPath  = artifactPath(dir, config, p.artifact);

  if (!fs.existsSync(artPath)) {
    const hint = config.artifactsDir ? ` (looking in ${config.artifactsDir}/${p.artifact})` : '';
    err(`Artifact not found: ${p.artifact}${hint}\nSave the file first, then run: aitri ${sv}complete${sa} ${key}`);
  }

  // Ordering gate (§3.1, rc.64 adopter): a phase cannot be completed on top of an
  // upstream phase that was never validated. Without this, a silently-failed
  // `complete requirements` still lets architecture→…→deploy be completed/approved
  // over a Phase 1 with no stored state, and the pipeline reports "5/5 complete".
  // Each required input must come from a phase that is itself completed.
  const completedSet = new Set((config.completedPhases || []).map(String));
  const unmet = upstreamProducers(phase).filter(u => !completedSet.has(String(u.phase)));
  if (unmet.length) {
    err(
      `Cannot complete ${key} — upstream phase(s) not yet completed: ${unmet.map(u => `${u.alias} (${u.artifact})`).join(', ')}.\n` +
      `  A phase must not be built on an unvalidated upstream. Complete them first:\n` +
      `    ${unmet.map(u => `aitri ${sv}complete${sa} ${u.alias}`).join('\n    ')}`
    );
  }

  // Strip a leading BOM (added by some text editors) — otherwise JSON.parse in the
  // phase validators reports a misleading "markdown fences / trailing commas" cause.
  const content = fs.readFileSync(artPath, 'utf8').replace(/^\uFEFF/, '');

  if (p.validate) {
    try {
      p.validate(content, { dir, config, featureRoot });
    } catch (e) {
      if (checkOnly) {
        // Diagnostic on a non-zero exit → stderr (matches the err() path below and the
        // cancel message at :81); stdout stays the machine-readable channel.
        console.error(`❌ Validation failed for ${p.artifact}:\n  ${e.message}`);
        process.exit(1);
      }
      err(`Artifact validation failed for ${p.artifact}:\n  ${e.message}\n\nFix the artifact and run: aitri ${sv}complete${sa} ${key}`);
    }
  }

  // Cross-artifact review gate — phase 1: source-capture audit (advisory, no errors);
  // phase 3: req→TC checks; phase 5: TC→Results checks. Runs in --check too so a
  // dry run reports the same cross-artifact errors the real run would block on.
  if (phase === 1 || phase === 2 || phase === 3 || phase === 5) {
    const scope = phase === 1 ? 'phase1' : phase === 2 ? 'phase2' : phase === 3 ? 'phase3' : 'phase5';
    const review = runReview(dir, config, scope);
    if (review.errors.length) {
      printReview(review);
      err(`Cross-artifact errors found — fix and run: aitri ${sv}complete${sa} ${key}`);
    }
    if (review.warnings.length) {
      printReview({ errors: [], warnings: review.warnings });
      // In --check the dry run records nothing, so there is no acknowledgement to gate;
      // just surface the warnings. The real run keeps the TTY acknowledge prompt.
      if (!checkOnly && process.stdin.isTTY) {
        process.stdout.write(`\nWarnings found — acknowledge to continue? (y/N): `);
        const answer = readStdinSync(10).trim().toLowerCase();
        if (answer !== 'y' && answer !== 'yes') {
          process.stderr.write(`\n❌ Complete cancelled — resolve warnings or re-run to acknowledge.\n`);
          process.exit(1);
        }
      }
    }
  }

  if (checkOnly) {
    console.log(`✅ ${p.artifact} — validation + cross-artifact review passed (dry run, state not recorded)`);
    return;
  }

  config.currentPhase    = phase;
  config.completedPhases = [...new Set([...(config.completedPhases || []), phase])];

  // Re-opening an APPROVED phase whose content changed. The normal flow
  // (run-phase → complete → approve) is safe because run-phase removes the phase
  // from approvedPhases first. But `complete <phase>` run directly on a phase
  // that is still approved AND whose artifact was edited on disk would otherwise
  // re-stamp the hash (laundering the drift) while leaving downstream phases
  // approved against the old content — bypassing the cascade that `approve`-
  // after-drift and `run-phase` perform. Detect it (stored hash present and
  // differs) and re-open: withdraw approval + cascade-invalidate downstream.
  const newHash        = hashArtifact(content);
  const storedHash     = (config.artifactHashes || {})[String(phase)];
  const wasApproved    = (config.approvedPhases || []).some(x => String(x) === String(phase));
  const contentChanged = !!storedHash && newHash !== storedHash;
  let cascaded = [];
  if (wasApproved && contentChanged) {
    config.approvedPhases = (config.approvedPhases || []).filter(x => String(x) !== String(phase));
    cascaded = cascadeInvalidate(config, phase);
  }

  clearDriftPhase(config, phase);
  clearCascadePending(config, phase);   // C5b: this phase has been re-derived
  // Update artifact hash so hasDrift() returns false after complete — artifact is now in accepted state
  config.artifactHashes = { ...(config.artifactHashes || {}), [String(phase)]: newHash };
  appendEvent(config, 'completed', phase);
  writeLastSession(config, dir, `complete ${key}`);
  saveConfig(dir, config);

  console.log(`✅ Phase ${key} (${p.name}) complete — ${p.artifact}`);
  if (wasApproved && contentChanged) {
    console.log(`\n⚠ Phase ${key} was approved and its content changed — approval withdrawn; it needs re-approval.`);
    if (cascaded.length)
      console.log(`  Downstream invalidated (re-validate after re-approval): ${cascaded.join(', ')}`);
  }
  console.log(`\nReview the output, then:`);
  console.log(`  Approved → aitri ${sv}approve${sa} ${key}`);
  console.log(`  Changes  → aitri ${sv}reject${sa} ${key} --feedback "what to change"`);

  // 3.3 #9 (UX-PRO-0707): `complete 4` validates the build REPORT's structure, not the tests —
  // it can pass while the declared runner is failing right now. Say so, so a green "complete"
  // is not misread as "tests pass"; verify-run is the real test gate.
  if (phase === 4) {
    let runner = 'the declared test suite';
    try { const tr = JSON.parse(content)?.test_runner; if (typeof tr === 'string' && tr.trim()) runner = `\`${tr.trim()}\``; } catch { /* structure already gated above */ }
    console.log(`\n  Note: ${runner} is NOT run here — this validates the build report, not the tests.`);
    console.log(`        aitri ${sv}verify-run${sa} executes it and gates the deploy on the result.`);
  }

  // FB-UXPREVIEW-SKIPPED-0715 (ADR-073 addendum): UX_PREVIEW.html is advisory, and the
  // field showed agents skip it silently. Warn — never block — when it is absent and the
  // spec records no skip reason (`Preview: not generated — <reason>`, per the UX briefing).
  // A hard gate stays rejected (ADR-073 trade-off: false-fires on no-GUI products).
  if (phase === 'ux') {
    const previewPath = artifactPath(dir, config, 'UX_PREVIEW.html');
    const skipRecorded = /preview:\s*not generated/i.test(content);
    if (!fs.existsSync(previewPath) && !skipRecorded) {
      console.log(`\n⚠ UX_PREVIEW.html was not generated and 01_UX_SPEC.md records no skip reason.`);
      console.log(`  The preview is how the human approves look & feel at the UX gate (a hex token is not a look).`);
      console.log(`  Generate it from the spec's Design Tokens — or, if the product has no graphical surface,`);
      console.log(`  record \`Preview: not generated — <reason>\` in 01_UX_SPEC.md. Not blocking.`);
    }
  }

  // D5 (UPLAN-0703): shift-left the intent-coverage audit. Recommend it as a relay step
  // (NOT "run it now" — the audit's documented value is re-derivation in a FRESH session,
  // independent of whoever wrote the requirements; routing it to the same agent seconds
  // after it authored the coverage_map is self-grading). This is a recommendation, not a
  // single-step PIPELINE INSTRUCTION — complete already prints an approve/reject branch.
  if (phase === 1 && !requirementsAuditState(dir, config).fresh) {
    console.log(`\n  Recommended before approving: have a FRESH session/agent run`);
    console.log(`    aitri ${sv}audit${sa} requirements`);
    console.log(`  It re-derives the client's needs independently and lists any the FRs dropped. Advisory — never blocks.`);
  }
  // REQ-RICHNESS-0624 (feedback-channel reminder): an operator who tweaks the artifact via
  // free chat gets no persona re-injection — the agent drifts from (or loses) the phase
  // role, especially after a context compaction. Aitri can't enforce persona fidelity
  // (passive prompt generator), but it can point at the channel that re-anchors it.
  console.log(`\n  Tip: route changes through aitri ${sv}run-phase${sa} ${key} --feedback "..." (re-runs with the phase persona),`);
  console.log(`       not free chat — ad-hoc chat edits drift from the role the phase is supposed to hold.`);
}
