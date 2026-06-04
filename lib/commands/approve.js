/**
 * Module: Command — approve
 * Purpose: Mark phase as approved. Unlocks next phase.
 *          Gate: requires aitri complete <phase> to have passed first.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { loadConfig, saveConfig, hashArtifact, artifactPath, appendEvent, clearDriftPhase, hasDrift, cascadeInvalidate, writeLastSession, stampReconcileBaseline } from '../state.js';
import { scopeTokens } from '../scope.js';
import { readStdinSync } from '../read-stdin.js';
import { extractHumanReview } from '../prompts/render.js';

// Phase key → template path (without .md). Used to print the real Human Review
// checklist at approval time from its single source (the phase template).
const TEMPLATE_BY_PHASE = {
  1: 'phases/requirements', 2: 'phases/architecture', 3: 'phases/tests',
  4: 'phases/build', 5: 'phases/deploy',
  ux: 'phases/phaseUX', discovery: 'phases/phaseDiscovery', review: 'phases/phaseReview',
};
import {
  classifyIdeaReferences,
  applyManifestAutoFix,
  phaseForArtifact,
} from '../upgrade/idea-ref-classifier.js';

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

// ── alpha.27 producer-side pre-flight (ADR-031 addendum 2) ───────────────────
//
// Approving Phase 1 archives IDEA.md and unlinks the file. Downstream artifacts
// (manifest entries, test_data arrays, narrative bodies) that referenced IDEA.md
// as a path break post-archive. alpha.25 closed the migration-time scan for
// already-broken projects; alpha.27 closes the at-approve-time scan to prevent
// new projects from entering that state.
//
// Three buckets per ADR-031 (reuses lib/upgrade/idea-ref-classifier.js):
//   auto_fixable — drop element from manifest arrays (files_created, files_modified,
//                  test_files); re-stamp artifactHashes for affected phase if approved.
//   narrative   — flag and BLOCK approve until operator edits.
//   frozen      — silently skip (immutable evidence by design).
//
// Auto-fixes are applied even when narrative blocks the approve — they are
// independently valid structural cleanup. Operator inspects via git diff and
// can revert if intentional.

function setPhaseHashIfApproved(config, phaseKey, newHash) {
  if (!config.artifactHashes) return;
  if (config.artifactHashes[phaseKey] === undefined) return;
  config.artifactHashes[phaseKey] = newHash;
}

function applyPreflightAutoFixes(dir, config) {
  const classification = classifyIdeaReferences(dir, config);

  const byFile = {};
  for (const r of classification.autoFixable) {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r);
  }

  const appliedFiles = [];
  for (const [fileRel, refs] of Object.entries(byFile)) {
    const fullPath = path.join(dir, fileRel);
    const beforeRaw = fs.readFileSync(fullPath, 'utf8');
    const beforeHash = hashArtifact(beforeRaw);
    const afterContent = applyManifestAutoFix(fullPath, refs);
    const afterHash = hashArtifact(afterContent);
    fs.writeFileSync(fullPath, afterContent, 'utf8');

    const phaseKey = phaseForArtifact(fileRel);
    if (phaseKey) setPhaseHashIfApproved(config, phaseKey, afterHash);

    appendEvent(config, 'approve_preflight_autofix', null, {
      target:      fileRel,
      transform:   `drop ${refs.length} stale IDEA.md ref(s) from ${refs.map(r => r.fieldPath).sort().join(', ')}`,
      before_hash: beforeHash,
      after_hash:  afterHash,
    });
    appliedFiles.push({ file: fileRel, count: refs.length });
  }

  return {
    appliedFiles,
    narrative:    classification.narrative,
    frozenCount:  classification.frozenCount,
  };
}

function buildPreflightBlockMessage(narrative) {
  const byFile = {};
  for (const r of narrative) {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r.fieldPath);
  }
  const fileSection = Object.entries(byFile)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, paths]) => {
      const pathLines = [...new Set(paths)].sort().map(p => `      ${p}`).join('\n');
      return `    ${file}:\n${pathLines}`;
    })
    .join('\n');

  return (
    `Cannot approve Phase 1 — IDEA.md absorption would break downstream artifacts.\n\n` +
    `   ${narrative.length} reference(s) to IDEA.md found in ${Object.keys(byFile).length} artifact(s):\n\n${fileSection}\n\n` +
    `   Approving Phase 1 archives IDEA.md content into 01_REQUIREMENTS.json#original_brief\n` +
    `   and removes the file. The references above would break at runtime (ENOENT,\n` +
    `   missing path, failed grep) or leave stale narrative.\n\n` +
    `   What to do:\n` +
    `     1. Edit each reference. For live runtime usages (test_data.files, command\n` +
    `        grep, manifest paths), point to docs that exist or remove the entry.\n` +
    `        For narrative mentions, rewrite to reflect that the brief now lives in\n` +
    `        01_REQUIREMENTS.json#original_brief (or remove the mention entirely).\n` +
    `     2. Re-run: aitri approve 1\n\n` +
    `   Frozen historical records (04_TEST_RESULTS.json, 05_TRACEABILITY.json)\n` +
    `   are not surfaced — they record past state and are immutable by design.\n\n` +
    `   See ADR-031 § addendum 2 (post-destructive on-disk audit protocol).\n`
  );
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
  const lines = [
    `  Functional requirements: ${frs.length} (${fmtCounts(byPriority)})`,
    `    Types: ${fmtCounts(byType)}`,
    `  Non-functional requirements: ${nfrs.length}`,
    `  Acceptance criteria: ${acs} total`,
  ];
  // Seed provenance at the human checkpoint (ADR-039). The provenance gate fires
  // at `complete 1` on a file the agent wrote alone; `approve` is the one place a
  // human plausibly looks. Surface "N confirmed · M assumed" so a silent
  // "5 confirmed, 0 questions asked" is VISIBLE instead of buried in JSON — and so
  // assumed inputs and open gaps travel to whoever approves.
  const prov = d.idea_provenance;
  if (prov && typeof prov === 'object' && !Array.isArray(prov)) {
    const fields    = Object.keys(prov);
    const assumed   = fields.filter(f => prov[f] === 'assumed');
    const confirmed = fields.filter(f => prov[f] === 'confirmed').length;
    lines.push(`  Seed provenance: ${confirmed} confirmed · ${assumed.length} assumed${assumed.length ? ` — ${assumed.join(', ')}` : ''}`);
    // Per-field source (ADR-043 #5) — a weak "inferred …" stands out next to "IDEA.md",
    // and a "confirmed" with no source is flagged. Shown only when sources are provided.
    const srcs = (d.idea_provenance_sources && typeof d.idea_provenance_sources === 'object' && !Array.isArray(d.idea_provenance_sources))
      ? d.idea_provenance_sources : null;
    if (srcs) {
      for (const f of fields) {
        const src = typeof srcs[f] === 'string' && srcs[f].trim() ? srcs[f].trim() : null;
        const flag = prov[f] === 'confirmed' && !src ? '  ⚠ confirmed with no source' : '';
        lines.push(`    ${f}: ${prov[f]}${src ? ` ← ${src}` : ''}${flag}`);
      }
    }
    // Nudge on the all-confirmed-no-gaps case — the exact shape an over-eager agent
    // produces by marking everything "confirmed" with zero questions asked (the gate
    // cannot tell honest confirmation from inference). Prompt the human to double-check.
    if (fields.length > 0 && assumed.length === 0)
      lines.push(`  ⚠ All ${confirmed} ground-truth inputs are "confirmed" with 0 gaps — verify YOU confirmed these (especially the success metric), not the agent inferring them from docs.`);
    const gaps = Array.isArray(d.idea_gaps)
      ? d.idea_gaps
      : (Array.isArray(d.project_summary?.idea_gaps) ? d.project_summary.idea_gaps : []);
    if (gaps.length)
      lines.push(`  Open seed gaps (confirm before relying on them): ${gaps.length}`);
  }
  return lines;
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

// B1 (rc.12): print the approval summary on EVERY approve — TTY and agent mode.
// Previously this no-op'd on !isTTY, so an agent running approve surfaced nothing
// and the content-judgment surface collapsed. The summary now lands in the log /
// PR for a human to review regardless of who runs the command.
function printApprovalSummary(phase, key, p, artPath) {
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

// B1 (rc.12): print the real Human Review checklist from the phase template's
// single source, so the human sees the exact items without re-opening the briefing.
function printHumanReviewChecklist(phase) {
  const tmpl = TEMPLATE_BY_PHASE[phase];
  if (!tmpl) return;
  const checklist = extractHumanReview(tmpl);
  if (checklist) process.stdout.write(`\n${checklist}\n`);
}

function askChecklist(phase, key, sv, sa) {
  if (!process.stdin.isTTY) {
    // Agent mode with humanApprovalGate OFF (the gate is enforced earlier): approval
    // proceeds, but this is still a human-review checkpoint. Surface it so the agent
    // relays it to the user instead of silently chaining to the next phase.
    process.stdout.write(
      `\n⚠️  HUMAN REVIEW CHECKPOINT — Phase ${key}\n` +
      `   The checklist above is for a human. Present this approval and the artifact to\n` +
      `   the user; do not chain to the next phase without their confirmation.\n` +
      `   For a hard stop in agent mode (large projects), set "humanApprovalGate": true in .aitri.\n`
    );
    return;
  }
  process.stdout.write(
    `\n⚠️  Human Review required before approving Phase ${key}.\n` +
    `   Confirm every item in the checklist above before approving.\n` +
    `   Have you reviewed the summary and completed every checklist item? (y/N): `
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

  printApprovalSummary(phase, key, p, artPath);   // B1 — always (TTY + agent)
  printHumanReviewChecklist(phase);                // B1 — real items from the template

  // B2 (rc.12): opt-in hard human gate. Default is print-and-proceed (autonomy for
  // CI / agent runs / MVPs — equally valid). A project that wants a human at every
  // approval (typically larger projects) sets "humanApprovalGate": true in .aitri;
  // then agent-mode approval blocks and a human must run it after review.
  if (!process.stdin.isTTY && config.humanApprovalGate) {
    err(
      `humanApprovalGate is ON — Phase ${key} approval requires a human.\n` +
      `   Review the artifact and the Human Review checklist above, then run\n` +
      `   'aitri ${sv}approve${sa} ${key}' manually in your terminal.`
    );
  }

  askChecklist(phase, key, sv, sa);

  // First approve of Phase 1 absorbs IDEA.md into the artifact and removes
  // the file. Done before hash recording so the stored hash matches the
  // post-archive content (no false drift on next status check).
  //
  // Pre-flight scan (alpha.27 + ADR-031 addendum 2): classify downstream refs
  // to IDEA.md before the destructive op. Apply auto-fixes mechanically; block
  // the approve if narrative refs remain. Prevents new projects from getting
  // into the post-absorbed-broken state Hub had to recover from.
  let archivedIdea = false;
  if (phase === 1 && !wasAlreadyApproved) {
    const ideaPath = path.join(dir, 'IDEA.md');
    if (fs.existsSync(ideaPath)) {
      const { appliedFiles, narrative } = applyPreflightAutoFixes(dir, config);

      if (appliedFiles.length > 0) {
        console.log('\nℹ️  Pre-flight auto-fixed (drop stale IDEA.md refs from documented arrays):');
        for (const a of appliedFiles) {
          console.log(`     ✓ ${a.file} — ${a.count} ref${a.count === 1 ? '' : 's'} dropped`);
        }
      }

      if (narrative.length > 0) {
        // Persist auto-fix mutations + events even on block — they are
        // independently valid structural cleanup. err() handles exit/throw
        // (testable surface).
        saveConfig(dir, config);
        err(buildPreflightBlockMessage(narrative));
      }

      archivedIdea = archiveIdeaIntoRequirements(dir, artPath);
    }
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
  // Approving resolves any prior rejection of this phase — clear the stale
  // advisory so status/resume stop showing a rejection that was addressed.
  if (config.rejections && config.rejections[String(phase)]) delete config.rejections[String(phase)];
  const cascaded = wasAlreadyApproved ? cascadeInvalidate(config, phase) : [];

  // Record reconcile baseline when build is approved.
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
    config.reconcileState = { baseRef, method, status: 'resolved', lastRun: new Date().toISOString() };

    // Cross-scope advance: when approving in feature scope, root project's
    // reconcile baseline must also advance to the same SHA. Otherwise root
    // drift detection flags every feature-implementation file (which lives at
    // root in flat-codebase projects like Go monoliths) as off-pipeline change.
    // Conceptual model: root baseline = last point where ANY pipeline sealed
    // its code state. Approving any Phase 4 seals that pipeline's code.
    // See BACKLOG.md "Pre-promotion findings (Codex canary 2026-05-11)" P1.
    if (featureRoot) {
      stampReconcileBaseline(featureRoot);
    }
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
