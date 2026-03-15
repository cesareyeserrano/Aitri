/**
 * Module: Command — approve
 * Purpose: Mark phase as approved. Unlocks next phase.
 *          Gate: requires aitri complete <phase> to have passed first.
 */

import fs from 'fs';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, saveConfig, hashArtifact, artifactPath, appendEvent } from '../state.js';

function askChecklist(phase) {
  if (!process.stdin.isTTY) return; // non-interactive — skip (CI/scripts/tests)
  process.stdout.write(
    `\n⚠️  Human Review required before approving Phase ${phase}.\n` +
    `   Check the "Human Review" checklist at the end of the Phase ${phase} briefing.\n` +
    `   Have you completed every checklist item? (y/N): `
  );
  const buf = Buffer.alloc(10);
  const bytes = fs.readSync(0, buf, 0, 10, null);
  const answer = buf.subarray(0, bytes).toString().trim().toLowerCase();
  if (answer !== 'y' && answer !== 'yes') {
    process.stderr.write(
      `\n❌ Approval cancelled — complete the Human Review checklist first.\n` +
      `   Tip: run 'aitri run-phase ${phase}' to see the checklist.\n`
    );
    process.exit(1);
  }
}

export function cmdApprove({ dir, args, err }) {
  const raw   = args[0];
  const phase = OPTIONAL_PHASES.includes(raw) ? raw : parseInt(raw);
  const p     = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri approve <1-5|ux|discovery|review>`);

  const config = loadConfig(dir);
  const artPath = artifactPath(dir, config, p.artifact);

  if (!fs.existsSync(artPath)) {
    err(`Artifact missing. Complete phase ${phase} first.`);
  }

  const completed = new Set(config.completedPhases || []);
  if (!completed.has(phase)) {
    err(`Phase ${phase} has not been validated.\nRun: aitri complete ${phase}  (must pass before approving)`);
  }

  askChecklist(phase);

  config.approvedPhases = [...new Set([...(config.approvedPhases || []), phase])];

  // Store artifact hash at approval time — enables drift detection in status/validate
  try {
    const artifactContent = fs.readFileSync(artPath, 'utf8');
    config.artifactHashes = { ...(config.artifactHashes || {}), [String(phase)]: hashArtifact(artifactContent) };
  } catch { /* non-fatal — drift detection just won't have a baseline */ }

  appendEvent(config, 'approved', phase);
  saveConfig(dir, config);

  const bar = '─'.repeat(60);

  if (OPTIONAL_PHASES.includes(phase)) {
    console.log(`✅ Phase ${phase} (${p.name}) APPROVED`);
    const approved = new Set(config.approvedPhases || []);
    if (phase === 'ux' && approved.has(1)) {
      console.log(`\n${bar}`);
      console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
      console.log(`  aitri run-phase 2\n`);
      console.log(`Do NOT choose a route, skip phases, or implement anything yet.`);
      console.log(`Phase 2 (System Architecture — Software Architect) must run next.`);
      console.log(`The UX spec is now available in the architect's context.`);
      console.log(bar);
    } else if (phase === 'review') {
      console.log(`\n${bar}`);
      console.log(`PIPELINE INSTRUCTION — Code review complete.\n`);
      if (config.verifyPassed) {
        console.log(`  aitri run-phase 5\n`);
        console.log(`Verification passed and code review approved — proceed to Phase 5 (DevOps).`);
      } else if (approved.has(4)) {
        console.log(`  aitri verify-run\n`);
        console.log(`Phase 4 approved — run the test suite next, then aitri verify-complete to unlock Phase 5.`);
      } else {
        console.log(`  aitri run-phase 4\n`);
        console.log(`Complete and approve Phase 4 (Implementation) before proceeding.`);
      }
      console.log(bar);
    } else {
      console.log(`\n→ Continue with optional phases or run: aitri run-phase 1`);
    }
  } else if (phase === 4) {
    console.log(`✅ Phase 4 (${p.name}) APPROVED\n`);
    console.log(bar);
    console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
    console.log(`  aitri verify-run\n`);
    console.log(`Do NOT write code, choose a route, or skip ahead.`);
    console.log(`aitri verify-run executes your test suite — then aitri verify-complete unlocks Phase 5.`);
    console.log(bar);
  } else if (phase < 5) {
    const next = PHASE_DEFS[phase + 1];
    console.log(`✅ Phase ${phase} (${p.name}) APPROVED\n`);
    console.log(bar);
    console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);

    // Phase 1: if UX/visual/audio FRs exist and UX phase not yet approved, require UX before Phase 2
    if (phase === 1) {
      let uxRequired = false;
      try {
        const reqs = JSON.parse(fs.readFileSync(artifactPath(dir, config, '01_REQUIREMENTS.json'), 'utf8'));
        const approved = new Set(config.approvedPhases || []);
        uxRequired = (reqs.functional_requirements || [])
          .some(fr => ['ux', 'visual', 'audio'].includes(fr.type?.toLowerCase()))
          && !approved.has('ux');
      } catch {
        process.stderr.write(
          `[aitri] Warning: Could not read 01_REQUIREMENTS.json to check for UX/visual FRs.\n` +
          `  If your project has UX or visual requirements, run: aitri run-phase ux\n`
        );
      }

      if (uxRequired) {
        console.log(`  aitri run-phase ux\n`);
        console.log(`Do NOT skip to Phase 2.`);
        console.log(`UX/visual/audio FRs detected in Phase 1 — Phase UX (UX/UI Designer) must run before Phase 2.`);
        console.log(`The architect needs the UX spec to design the system correctly.`);
        console.log(`After aitri approve ux → the pipeline will continue to Phase 2 (Architecture).`);
        console.log(bar);
        return;
      }
    }

    console.log(`  aitri run-phase ${phase + 1}\n`);
    console.log(`Do NOT choose a route, skip phases, or implement anything yet.`);
    console.log(`Phase ${phase + 1} (${next.name} — ${next.persona}) must run next.`);
    console.log(`The pipeline decides the route. You execute it.`);
    console.log(bar);
  } else {
    console.log(`🎉 All 5 phases complete and approved!`);
    console.log(`Run: aitri validate`);
  }
}
