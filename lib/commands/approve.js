/**
 * Module: Command — approve
 * Purpose: Mark phase as approved. Unlocks next phase.
 *          Gate: requires aitri complete <phase> to have passed first.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { loadConfig, saveConfig, hashArtifact, artifactPath, appendEvent, clearDriftPhase, hasDrift, cascadeInvalidate, writeLastSession } from '../state.js';
import { scopeTokens } from '../scope.js';
import { readStdinSync } from '../read-stdin.js';

/**
 * On first approve of Phase 1: absorb IDEA.md into 01_REQUIREMENTS.json
 * (as `original_brief` field) and remove the file from disk. After this,
 * 01_REQUIREMENTS.json is the sole SSoT — re-runs use it as input, not
 * a stale brief.
 *
 * Idempotent: skips if IDEA.md is already absent.
 * Returns true when archive happened (caller logs a notice).
 */
function archiveIdeaIntoRequirements(dir, artPath) {
  const ideaPath = path.join(dir, 'IDEA.md');
  if (!fs.existsSync(ideaPath)) return false;

  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  } catch {
    return false; // artifact malformed — let normal gate flag it; don't lose IDEA.md
  }

  const briefContent = fs.readFileSync(ideaPath, 'utf8');
  artifact.original_brief = briefContent;
  fs.writeFileSync(artPath, JSON.stringify(artifact, null, 2));
  fs.unlinkSync(ideaPath);
  return true;
}

// ── Approval summary builders ────────────────────────────────────────────────
// Per-phase digest of what's being approved. Surfaces enough numerical context
// that the human review prompt is no longer a blind y/N. Each builder returns
// an array of indented lines; `null` means "no summary available".

function fmtCounts(obj) {
  return Object.entries(obj).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none';
}

export function summarizeRequirements(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const frs  = d.functional_requirements     || [];
  const nfrs = d.non_functional_requirements || [];
  const byPriority = frs.reduce((a, fr) => { const k = (fr.priority || 'unknown').toUpperCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
  const byType     = frs.reduce((a, fr) => { const k = (fr.type     || 'unknown').toLowerCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
  const acs = frs.reduce((n, fr) => n + (fr.acceptance_criteria || []).length, 0);
  return [
    `  Functional requirements: ${frs.length} (${fmtCounts(byPriority)})`,
    `    Types: ${fmtCounts(byType)}`,
    `  Non-functional requirements: ${nfrs.length}`,
    `  Acceptance criteria: ${acs} total`,
  ];
}

export function summarizeTestCases(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const tcs = d.test_cases || [];
  const byType     = tcs.reduce((a, tc) => { const k = tc.type     || 'unknown'; a[k] = (a[k] || 0) + 1; return a; }, {});
  const byScenario = tcs.reduce((a, tc) => { const k = tc.scenario || 'unknown'; a[k] = (a[k] || 0) + 1; return a; }, {});
  const linkedFRs = new Set(tcs.map(tc => tc.requirement_id).filter(Boolean)).size;
  return [
    `  Test cases: ${tcs.length}  (linked FRs: ${linkedFRs})`,
    `    Types: ${fmtCounts(byType)}`,
    `    Scenarios: ${fmtCounts(byScenario)}`,
  ];
}

export function summarizeManifest(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const created  = (d.files_created  || []).length;
  const modified = (d.files_modified || []).length;
  const debt     = d.technical_debt   || [];
  const debtLine = debt.length === 0
    ? `  Technical debt: none`
    : `  Technical debt: ${debt.length} substitution${debt.length > 1 ? 's' : ''} (${debt.map(e => e.fr_id).filter(Boolean).join(', ') || 'no fr_id'})`;
  return [
    `  Files created:  ${created}`,
    `  Files modified: ${modified}`,
    debtLine,
  ];
}

export function summarizeCompliance(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const rc      = d.requirement_compliance || [];
  const byLevel = rc.reduce((a, r) => { const k = r.level || 'unknown'; a[k] = (a[k] || 0) + 1; return a; }, {});
  return [
    `  Overall status: ${d.overall_status || '(unset)'}`,
    `  Requirement compliance: ${rc.length} entries (${fmtCounts(byLevel)})`,
    `  Phases completed: ${(d.phases_completed || []).length}`,
  ];
}

export function summarizeMarkdownSections(raw, label = 'Sections') {
  if (!raw) return null;
  const sections = raw.split('\n')
    .filter(l => /^##\s+/.test(l))
    .map(l => l.replace(/^##\s+/, '').trim());
  const out = [`  ${label} (${sections.length}):`];
  for (const s of sections.slice(0, 8)) out.push(`    • ${s}`);
  if (sections.length > 8) out.push(`    … and ${sections.length - 8} more`);
  return out;
}

export function buildApprovalSummary(phase, raw) {
  if (raw == null) return null;
  switch (phase) {
    case 1: return summarizeRequirements(raw);
    case 2: return summarizeMarkdownSections(raw);
    case 3: return summarizeTestCases(raw);
    case 4: return summarizeManifest(raw);
    case 5: return summarizeCompliance(raw);
    case 'ux':        return summarizeMarkdownSections(raw);
    case 'discovery': return summarizeMarkdownSections(raw);
    case 'review':    return summarizeMarkdownSections(raw, 'Review sections');
    default:          return null;
  }
}

function printApprovalSummary(phase, key, p, artPath) {
  if (!process.stdin.isTTY) return;
  let raw = null;
  try { raw = fs.readFileSync(artPath, 'utf8'); } catch { /* unreadable */ }
  const lines = buildApprovalSummary(phase, raw);
  const bar = '─'.repeat(60);
  process.stdout.write(`\n${bar}\n`);
  process.stdout.write(`You are about to approve: ${key} (${p.name})\n`);
  process.stdout.write(`Artifact: ${p.artifact}\n`);
  if (lines && lines.length) {
    process.stdout.write(`\n`);
    for (const l of lines) process.stdout.write(`${l}\n`);
  } else {
    process.stdout.write(`  (no summary available — review the artifact directly)\n`);
  }
  process.stdout.write(`${bar}\n`);
}

function askChecklist(phase, key, sv, sa) {
  if (!process.stdin.isTTY) return; // non-interactive — skip (CI/scripts/tests)
  process.stdout.write(
    `\n⚠️  Human Review required before approving Phase ${key}.\n` +
    `   Check the "Human Review" checklist at the end of the Phase ${key} briefing.\n` +
    `   Have you reviewed the summary above and completed every checklist item? (y/N): `
  );
  const answer = readStdinSync(10).trim().toLowerCase();
  if (answer !== 'y' && answer !== 'yes') {
    process.stderr.write(
      `\n❌ Approval cancelled — complete the Human Review checklist first.\n` +
      `   Tip: run 'aitri ${sv}run-phase${sa} ${key}' to see the checklist.\n`
    );
    process.exit(1);
  }
}

export function cmdApprove({ dir, args, err, featureRoot, scopeName }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
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
    err(`Phase ${key} has not been validated.\nRun: aitri ${sv}complete${sa} ${key}  (must pass before approving)`);
  }

  const driftDetected = hasDrift(dir, config, phase, p.artifact);
  if (driftDetected) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `\n❌ Phase ${key} artifact changed after approval — human review required.\n` +
        `   An agent cannot re-approve after drift.\n` +
        `   Run 'aitri ${sv}approve${sa} ${key}' manually in your terminal after reviewing the artifact.\n`
      );
      process.exit(1);
    }
    // A5 (alpha.3): if `git diff HEAD -- <artifact>` is clean, the drift is
    // bookkeeping-only (stored hash is stale, artifact content matches the
    // committed state). In that case re-approve's cascade is pure re-work —
    // hint the operator to use `aitri rehash` instead.
    const relArt = path.relative(dir, artPath);
    let gitClean = null;
    try {
      const out = execSync(
        `git diff HEAD -- ${JSON.stringify(relArt)}`,
        { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
      ).trim();
      gitClean = out.length === 0;
    } catch { /* git unavailable — skip hint, keep default flow */ }

    process.stdout.write(
      `\n⚠️  DRIFT — ${p.artifact} was modified after approval.\n` +
      `   Review what changed in the artifact before re-approving.\n`
    );
    if (gitClean === true) {
      process.stdout.write(
        `\n   NOTE: git diff HEAD shows no uncommitted changes to this artifact.\n` +
        `         The drift is likely legacy bookkeeping (stale hash from a prior\n` +
        `         Aitri version) rather than new content. To fix bookkeeping only\n` +
        `         (without cascading invalidation to downstream phases), run:\n` +
        `             aitri ${sv}rehash${sa} ${key}\n` +
        `         Re-approving here is correct only if the artifact content\n` +
        `         actually needs a fresh review.\n`
      );
    }
    process.stdout.write(`\n   Proceed with re-approval? (y/N): `);
    const driftAns = readStdinSync(10).trim().toLowerCase();
    if (driftAns !== 'y' && driftAns !== 'yes') {
      process.stderr.write(`\n❌ Re-approval cancelled.\n`);
      process.exit(1);
    }
  }

  printApprovalSummary(phase, key, p, artPath);
  askChecklist(phase, key, sv, sa);

  // First approve of Phase 1 absorbs IDEA.md into the artifact and removes
  // the file. Done before hash recording so the stored hash matches the
  // post-archive content (no false drift on next status check).
  let archivedIdea = false;
  if (phase === 1 && !wasAlreadyApproved) {
    archivedIdea = archiveIdeaIntoRequirements(dir, artPath);
  }

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

  appendEvent(config, 'approved', phase, archivedIdea ? { ideaArchived: true } : driftDetected ? { afterDrift: true } : {});
  writeLastSession(config, dir, `approve ${key}`);
  saveConfig(dir, config);

  const bar = '─'.repeat(60);

  if (archivedIdea) {
    console.log(
      `📝 IDEA.md archived into 01_REQUIREMENTS.json.original_brief and removed.\n` +
      `   Re-runs of Phase 1 will refine the current FRs — IDEA.md is no longer read.\n` +
      `   To start over: delete 01_REQUIREMENTS.json (the original_brief field preserves the seed).\n`
    );
  }

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
      console.log(`  aitri ${sv}run-phase${sa} architecture\n`);
      console.log(`Do NOT choose a route, skip phases, or implement anything yet.`);
      console.log(`Architecture (System Architecture — Software Architect) must run next.`);
      console.log(`The UX spec is now available in the architect's context.`);
      console.log(bar);
    } else if (phase === 'review') {
      console.log(`\n${bar}`);
      console.log(`PIPELINE INSTRUCTION — Code review complete.\n`);
      if (config.verifyPassed) {
        console.log(`  aitri ${sv}run-phase${sa} deploy\n`);
        console.log(`Verification passed and code review approved — proceed to Deploy (DevOps).`);
      } else if (approved.has(4)) {
        console.log(`  aitri ${sv}verify-run${sa}\n`);
        console.log(`Build approved — run the test suite next, then aitri ${sv}verify-complete${sa} to unlock Deploy.`);
      } else {
        console.log(`  aitri ${sv}run-phase${sa} build\n`);
        console.log(`Complete and approve Build (Implementation) before proceeding.`);
      }
      console.log(bar);
    } else {
      console.log(`\n→ Continue with optional phases or run: aitri ${sv}run-phase${sa} requirements`);
    }
  } else if (phase === 4) {
    console.log(`✅ Phase build (${p.name}) APPROVED\n`);
    console.log(bar);
    console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
    console.log(`  aitri ${sv}verify-run${sa}\n`);
    console.log(`Do NOT write code, choose a route, or skip ahead.`);
    console.log(`aitri ${sv}verify-run${sa} executes your test suite — then aitri ${sv}verify-complete${sa} unlocks Deploy.`);
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
          `  If your project has UX or visual requirements, run: aitri ${sv}run-phase${sa} ux\n`
        );
      }

      if (uxRequired) {
        console.log(`  aitri ${sv}run-phase${sa} ux\n`);
        console.log(`Do NOT skip to Architecture.`);
        console.log(`UX/visual/audio FRs detected — UX phase (UX/UI Designer) must run before Architecture.`);
        console.log(`The architect needs the UX spec to design the system correctly.`);
        console.log(`After aitri ${sv}approve${sa} ux → the pipeline will continue to Architecture.`);
        console.log(bar);
        return;
      }
    }

    console.log(`  aitri ${sv}run-phase${sa} ${nextKey}\n`);
    console.log(`Do NOT choose a route, skip phases, or implement anything yet.`);
    console.log(`${next.name} (${next.persona}) must run next.`);
    console.log(`The pipeline decides the route. You execute it.`);
    console.log(bar);
  } else {
    console.log(`🎉 All 5 phases complete and approved!`);
    console.log(`Run: aitri validate`);
  }
}
