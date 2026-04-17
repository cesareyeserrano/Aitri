/**
 * Module: Command — approve
 * Purpose: Mark phase as approved. Unlocks next phase.
 *          Gate: requires aitri complete <phase> to have passed first.
 */

import fs from 'fs';
import { execSync } from 'child_process';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { loadConfig, saveConfig, hashArtifact, artifactPath, appendEvent, clearDriftPhase, hasDrift, cascadeInvalidate, writeLastSession } from '../state.js';
import { readStdinSync } from '../read-stdin.js';

function askChecklist(phase, key) {
  if (!process.stdin.isTTY) return; // non-interactive — skip (CI/scripts/tests)
  process.stdout.write(
    `\n⚠️  Human Review required before approving Phase ${key}.\n` +
    `   Check the "Human Review" checklist at the end of the Phase ${key} briefing.\n` +
    `   Have you completed every checklist item? (y/N): `
  );
  const answer = readStdinSync(10).trim().toLowerCase();
  if (answer !== 'y' && answer !== 'yes') {
    process.stderr.write(
      `\n❌ Approval cancelled — complete the Human Review checklist first.\n` +
      `   Tip: run 'aitri run-phase ${key}' to see the checklist.\n`
    );
    process.exit(1);
  }
}

export function cmdApprove({ dir, args, err }) {
  const raw   = args[0];
  const phase = OPTIONAL_PHASES.includes(raw) ? raw : PHASE_ALIASES[raw] !== undefined ? PHASE_ALIASES[raw] : parseInt(raw);
  const p     = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri approve <requirements|architecture|tests|build|deploy|ux|discovery|review>`);

  const config = loadConfig(dir);
  const wasAlreadyApproved = (config.approvedPhases || []).map(String).includes(String(phase));
  const artPath = artifactPath(dir, config, p.artifact);

  if (!fs.existsSync(artPath)) {
    err(`Artifact missing. Complete phase ${phase} first.`);
  }

  const completed = new Set(config.completedPhases || []);
  const key = p.alias || phase; // human-readable key for output messages
  if (!completed.has(phase)) {
    err(`Phase ${key} has not been validated.\nRun: aitri complete ${key}  (must pass before approving)`);
  }

  const driftDetected = hasDrift(dir, config, phase, p.artifact);
  if (driftDetected) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `\n❌ Phase ${key} artifact changed after approval — human review required.\n` +
        `   An agent cannot re-approve after drift.\n` +
        `   Run 'aitri approve ${key}' manually in your terminal after reviewing the artifact.\n`
      );
      process.exit(1);
    }
    process.stdout.write(
      `\n⚠️  DRIFT — ${p.artifact} was modified after approval.\n` +
      `   Review what changed in the artifact before re-approving.\n` +
      `   Proceed with re-approval? (y/N): `
    );
    const driftAns = readStdinSync(10).trim().toLowerCase();
    if (driftAns !== 'y' && driftAns !== 'yes') {
      process.stderr.write(`\n❌ Re-approval cancelled.\n`);
      process.exit(1);
    }
  }

  askChecklist(phase, key);

  config.approvedPhases = [...new Set([...(config.approvedPhases || []), phase])];

  // Store artifact hash at approval time — enables drift detection in status/validate
  // NOTE: clearDriftPhase must only run after the hash is updated. If the read fails,
  // re-throw so saveConfig is never called with an inconsistent state (cleared driftPhases
  // but stale hash), which would cause validate to report phantom drift indefinitely.
  try {
    const artifactContent = fs.readFileSync(artPath, 'utf8');
    config.artifactHashes = { ...(config.artifactHashes || {}), [String(phase)]: hashArtifact(artifactContent) };
  } catch (e) {
    process.stderr.write(`\n❌ Could not read artifact to record approval hash: ${e.message}\n`);
    process.exit(1);
  }

  clearDriftPhase(config, phase);
  const cascaded = wasAlreadyApproved ? cascadeInvalidate(config, phase) : [];

  // Record normalize baseline when build is approved.
  // Cleared by cascadeInvalidate when phase 4 is downstream.
  if (phase === 4) {
    let baseRef, method;
    try {
      baseRef = execSync('git rev-parse HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      method  = 'git';
    } catch {
      baseRef = new Date().toISOString();
      method  = 'mtime';
    }
    config.normalizeState = { baseRef, method, status: 'resolved', lastRun: new Date().toISOString() };
  }

  appendEvent(config, 'approved', phase, driftDetected ? { afterDrift: true } : {});
  writeLastSession(config, dir, `approve ${key}`);
  saveConfig(dir, config);

  const bar = '─'.repeat(60);

  if (cascaded.length) {
    console.log(`\n⚠️  Cascade invalidation — downstream phases reset:`);
    for (const p of cascaded) {
      const pDef = PHASE_DEFS[p];
      const pKey = pDef ? (pDef.alias || p) : p;
      console.log(`    ✗ ${String(pKey).padEnd(16)} (needs re-run)`);
    }
  }

  if (OPTIONAL_PHASES.includes(phase)) {
    console.log(`✅ Phase ${key} (${p.name}) APPROVED`);
    const approved = new Set(config.approvedPhases || []);
    if (phase === 'ux' && approved.has(1)) {
      console.log(`\n${bar}`);
      console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
      console.log(`  aitri run-phase architecture\n`);
      console.log(`Do NOT choose a route, skip phases, or implement anything yet.`);
      console.log(`Architecture (System Architecture — Software Architect) must run next.`);
      console.log(`The UX spec is now available in the architect's context.`);
      console.log(bar);
    } else if (phase === 'review') {
      console.log(`\n${bar}`);
      console.log(`PIPELINE INSTRUCTION — Code review complete.\n`);
      if (config.verifyPassed) {
        console.log(`  aitri run-phase deploy\n`);
        console.log(`Verification passed and code review approved — proceed to Deploy (DevOps).`);
      } else if (approved.has(4)) {
        console.log(`  aitri verify-run\n`);
        console.log(`Build approved — run the test suite next, then aitri verify-complete to unlock Deploy.`);
      } else {
        console.log(`  aitri run-phase build\n`);
        console.log(`Complete and approve Build (Implementation) before proceeding.`);
      }
      console.log(bar);
    } else {
      console.log(`\n→ Continue with optional phases or run: aitri run-phase requirements`);
    }
  } else if (phase === 4) {
    console.log(`✅ Phase build (${p.name}) APPROVED\n`);
    console.log(bar);
    console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
    console.log(`  aitri verify-run\n`);
    console.log(`Do NOT write code, choose a route, or skip ahead.`);
    console.log(`aitri verify-run executes your test suite — then aitri verify-complete unlocks Deploy.`);
    console.log(bar);
  } else if (phase < 5) {
    const next = PHASE_DEFS[phase + 1];
    const nextKey = next.alias || (phase + 1);
    console.log(`✅ Phase ${key} (${p.name}) APPROVED\n`);
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
        console.log(`Do NOT skip to Architecture.`);
        console.log(`UX/visual/audio FRs detected — UX phase (UX/UI Designer) must run before Architecture.`);
        console.log(`The architect needs the UX spec to design the system correctly.`);
        console.log(`After aitri approve ux → the pipeline will continue to Architecture.`);
        console.log(bar);
        return;
      }
    }

    console.log(`  aitri run-phase ${nextKey}\n`);
    console.log(`Do NOT choose a route, skip phases, or implement anything yet.`);
    console.log(`${next.name} (${next.persona}) must run next.`);
    console.log(`The pipeline decides the route. You execute it.`);
    console.log(bar);
  } else {
    console.log(`🎉 All 5 phases complete and approved!`);
    console.log(`Run: aitri validate`);
  }
}
