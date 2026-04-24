/**
 * Module: Command — resume
 * Purpose: Print a structured session-handoff briefing to stdout.
 *          Read-only projection of `buildProjectSnapshot()` — no traversal
 *          logic lives here. Adds feature awareness, health summary, and a
 *          priority-ordered next-action list on top of the legacy layout.
 *
 * Modes:
 *   brief (default) — "what do I do next?" focus. Omits reference sections
 *                     that already live in artifacts (architecture dump,
 *                     per-FR lists, per-FR test coverage, technical debt).
 *   --full          — adds the reference sections. Useful on re-entry after
 *                     a long absence when context must be rebuilt.
 *
 * Sections (in order; brief = default, * = full-only):
 *   - Version Update Required (conditional)
 *   - Pipeline State
 *   - Features (conditional — only when feature sub-pipelines exist)
 *   - Last Session
 *   * Architecture & Stack Decisions
 *   * Open Requirements
 *   * Test Coverage (brief shows summary line only, via Pipeline State)
 *   * Technical Debt
 *   - Open Bugs (conditional)
 *   - Rejection History (conditional)
 *   - Re-approved After Drift (conditional)
 *   - Health (conditional — shown when project is not deployable)
 *   - Code Outside Pipeline (conditional)
 *   - Next Action
 */

import { buildProjectSnapshot } from '../snapshot.js';
import { head }                 from '../phases/context.js';

const CORE_PHASES = [1, 2, 3, 4, 5];

export function cmdResume({ dir, VERSION, args = [] }) {
  const full = Array.isArray(args) && args.includes('--full');
  const snapshot = buildProjectSnapshot(dir, { cliVersion: VERSION });
  const {
    project, pipelines, requirements, tests, debt, bugs, design,
    health, nextActions, normalize,
  } = snapshot;
  const root     = pipelines.find(p => p.scopeType === 'root');
  const features = pipelines.filter(p => p.scopeType === 'feature');
  const date     = new Date().toISOString().slice(0, 10);

  const lines = [];
  const section = (title) => { lines.push(''); lines.push(`## ${title}`); };
  const note    = (text)  => lines.push(text);

  lines.push(`# AITRI SESSION RESUME — ${project.name} (${date})`);

  // ── Version sync (conditional) ──────────────────────────────────────────────
  if (project.versionMismatch || project.versionMissing) {
    section('⚠ Version Update Required — Run This First');
    if (project.versionMismatch) {
      note(`Project was initialized with Aitri v${project.aitriVersion}. Current CLI is v${project.cliVersion}.`);
    } else {
      note(`Project is missing aitriVersion. Current CLI is v${project.cliVersion}.`);
    }
    note(`Phase briefings and validation rules have been updated since this project was created.`);
    note(`Sync before continuing the pipeline:`);
    note(``);
    note(`  aitri adopt --upgrade`);
    note(``);
    note(`What it does: bumps \`aitriVersion\` and infers completed phases from artifacts on disk.`);
    note(`Preserves existing approvals. Does **not** migrate artifact schemas or re-verify.`);
    note(``);
    note(`If this project predates v0.1.80 and Phase 4 is already approved, also run:`);
    note(``);
    note(`  aitri normalize --init    # baselines post-build code drift`);
    note(``);
    note(`After upgrade + init, run \`aitri resume\` again to see the clean state.`);
  }

  // ── Pipeline State ──────────────────────────────────────────────────────────
  section('Pipeline State');
  for (const n of CORE_PHASES) {
    const ph = root.phases.find(p => p.key === n);
    note(`- Phase ${n}: ${phaseLabel(ph)}`);
  }
  if (root.verify.passed) {
    const s = root.verify.summary || {};
    note(`- Verify: ✅ Passed (${s.passed ?? '?'}/${s.total ?? '?'})`);
  } else {
    const phase4 = root.phases.find(p => p.key === 4);
    if (phase4 && phase4.status === 'approved') note(`- Verify: ⬜ Not run`);
  }
  const featureVerifyCount = features.filter(f => f.verify.summary).length;
  if (featureVerifyCount > 0 && tests?.totals?.total > 0) {
    const t = tests.totals;
    note(`- Σ All pipelines: Passed (${t.passed}/${t.total})`);
  }

  // F1: surface deployable=false alongside the phase table so the reader doesn't
  // interpret a row of ✅ as "ready to ship" when blocking reasons exist. Details
  // remain in the Health section below — this line is the signal, not the list.
  const _hasProgressForBanner = root.phases.some(p => !p.optional && p.status !== 'not_started');
  if (_hasProgressForBanner && !health.deployable) {
    const n = (health.deployableReasons || []).length;
    const label = n === 1 ? '1 blocker' : `${n} blockers`;
    note(`- **Deployable:** ❌ Not ready — ${label} (see Health below)`);
  } else if (_hasProgressForBanner && health.deployable) {
    note(`- **Deployable:** ✅ Ready`);
  }

  // ── Features (conditional) ──────────────────────────────────────────────────
  if (features.length) {
    section('Features');
    for (const f of features) {
      const approvedCount = f.phases.filter(p => !p.optional && p.status === 'approved').length;
      const driftMark = f.phases.some(p => p.drift) ? ' ⚠️  drift' : '';
      const vs = f.verify.summary;
      const counts = vs && vs.total != null ? ` (${vs.passed ?? 0}/${vs.total})` : '';
      const verifyMark = f.allCoreApproved
        ? (f.verify.passed ? ` verify ✅${counts}` : ' verify ⬜')
        : '';
      const next = nextActionFor(f, nextActions);
      const nextLine = next ? `  → ${next.command}` : '';
      note(`- **${f.scopeName}** — phases ${approvedCount}/5${verifyMark}${driftMark}${nextLine}`);
    }
  }

  // ── Last Session (conditional) ──────────────────────────────────────────────
  const ls = root.lastSession;
  if (ls) {
    section('Last Session');
    const when  = ls.at ? new Date(ls.at).toLocaleString() : 'unknown';
    const agent = ls.agent && ls.agent !== 'unknown' ? ` (${ls.agent})` : '';
    note(`- **When:** ${when}${agent}`);
    note(`- **Event:** ${ls.event || 'unknown'}`);
    if (ls.context) note(`- **Context:** ${ls.context}`);
    if (ls.files_touched?.length) note(`- **Files touched:** ${ls.files_touched.join(', ')}`);
  }

  // ── Architecture & Stack Decisions (full only) ──────────────────────────────
  // These four sections are reference material already on disk (02_SYSTEM_DESIGN.md,
  // 01_REQUIREMENTS.json, 04_TEST_RESULTS.json, 04_IMPLEMENTATION_MANIFEST.json).
  // In brief mode we trust the operator to re-read them on demand; F8 showed that
  // dumping them on every resume turned the common "what's next?" view into 220
  // lines of noise.
  if (full) {
    section('Architecture & Stack Decisions');
    if (design.excerpt) note(head(design.excerpt, 80));
    else                note('_Not yet available — complete Phase 2 first._');

    section('Open Requirements');
    const rootFRs  = requirements.openFRs.filter(fr => fr.scope === 'root');
    const rootNFRs = requirements.openNFRs.filter(nfr => nfr.scope === 'root');
    if (rootFRs.length) {
      for (const fr of rootFRs) {
        const meta = [fr.priority, fr.type].filter(Boolean).join(', ');
        const head = meta ? `**${fr.id}** (${meta})` : `**${fr.id}**`;
        note(`- ${head}: ${fr.title ?? '_(no title)_'}`);
        for (const ac of fr.acceptance_criteria) note(`  - AC: ${ac}`);
      }
    } else if (root.phases.find(p => p.key === 1)?.exists) {
      note('_No functional requirements found._');
    } else {
      note('_Not yet available — complete Phase 1 first._');
    }
    if (rootNFRs.length) {
      note('');
      note('**Non-functional:**');
      for (const nfr of rootNFRs) {
        const head = nfr.category ? `**${nfr.id}** (${nfr.category})` : `**${nfr.id}**`;
        note(`- ${head}: ${nfr.requirement ?? '_(no description)_'}`);
      }
    }

    section('Test Coverage');
    const rootTests = tests.byPipeline.root;
    if (rootTests && rootTests.coverage.length) {
      for (const c of rootTests.coverage) {
        const total = c.passing + c.failing + c.skipped;
        note(`- ${c.fr_id}: ${c.status} (${c.passing}/${total} tests passing)`);
      }
      const s = rootTests.summary;
      if (s && s.total !== undefined) {
        note(`\n_Summary: ${s.passed ?? 0}/${s.total} passed, ${s.failed ?? 0} failed_`);
      }
    } else {
      note('_Not yet available — run aitri verify-run first._');
    }

    section('Technical Debt');
    const rootDebt = debt.list.filter(d => d.scope === 'root');
    if (rootDebt.length) {
      for (const d of rootDebt) {
        note(`- **${d.fr_id}**: ${d.substitution} — ${d.reason} _(effort: ${d.effort_to_fix})_`);
      }
    } else if (root.phases.find(p => p.key === 4)?.exists) {
      note('_No technical debt declared._');
    } else {
      note('_Not yet available — complete Phase 4 first._');
    }
  }

  // ── Unresolved Upgrade Findings (A1, alpha.3+) ──────────────────────────────
  // Present in brief mode because this is tier-1 signal: if absent, the
  // operator forgets the items the upgrade flagged. One block per pipeline.
  for (const pl of pipelines) {
    const findings = pl.upgradeFindings || [];
    if (findings.length === 0) continue;
    const label = pl.scopeType === 'root' ? '' : ` (${pl.scopeName})`;
    section(`⚠ Unresolved Upgrade Findings${label}`);
    note(`${findings.length} item(s) the upgrade protocol could not auto-migrate.`);
    note(`Re-author per schema, then re-run \`aitri adopt --upgrade\` to clear.`);
    for (const f of findings) {
      note(`- **${f.target}** — ${f.transform}`);
      if (f.reason) note(`  ${f.reason}`);
    }
  }

  // ── Open Bugs (conditional) ─────────────────────────────────────────────────
  const openBugs = bugs.list.filter(b => b.status === 'open' || b.status === 'in_progress' || b.status === 'fixed');
  if (openBugs.length) {
    section('Open Bugs');
    for (const b of openBugs) {
      const fr    = b.fr ? ` (${b.fr})` : '';
      const ph    = b.phase_detected ? `, Phase ${b.phase_detected}` : '';
      const scope = b.scope === 'root' ? '' : ` [${b.scope}]`;
      note(`- **${b.id}** [${b.severity}] ${b.title}${fr}${ph}${scope}`);
    }
    if (bugs.blocking > 0) {
      note('');
      note(`_${bugs.blocking} critical/high bug(s) will block verify-complete until resolved._`);
    }
  }

  // ── Rejection History (conditional) ─────────────────────────────────────────
  const rejections = root.rejections || {};
  const rejectedPhases = Object.keys(rejections);
  if (rejectedPhases.length) {
    section('Rejection History');
    for (const n of rejectedPhases) {
      const r = rejections[n];
      const d = new Date(r.at).toLocaleDateString();
      note(`- Phase ${n} (${d}): "${r.feedback}"`);
    }
  }

  // ── Drift re-approvals (conditional) ────────────────────────────────────────
  if (root.driftReapprovals.length) {
    section('⚠ Re-approved After Drift — Verify Content');
    note(`The following phases were re-approved after their artifact changed.`);
    note(`A human approved the change interactively, but content correctness is not guaranteed.`);
    for (const e of root.driftReapprovals) {
      const d = new Date(e.at).toLocaleDateString();
      note(`- Phase ${e.phase} — re-approved on ${d}`);
    }
    note(``);
    note(`If you are unsure, run: \`aitri run-phase N\` to regenerate the artifact from scratch.`);
  }

  // ── Health (conditional — only when not deployable AND pipeline has progress) ─
  const hasProgress = root.phases.some(p => !p.optional && p.status !== 'not_started');
  if (hasProgress && !health.deployable) {
    section('Health');
    for (const r of health.deployableReasons) note(`- ⚠ ${r.message}`);
    if (health.staleAudit) note(`- ⚠ Audit stale (${snapshot.audit.stalenessDays} days old)`);
  }

  // ── Normalize pending (conditional) ─────────────────────────────────────────
  if (root.normalizeState === 'pending') {
    section('⚠ Code Outside Pipeline');
    note(`Code changes were detected outside the Aitri pipeline since last build approval.`);
    note(`Run \`aitri normalize\` to classify and route each change.`);
  } else if (normalize && normalize.uncountedFiles > 0) {
    section('⚠ Code Outside Pipeline');
    note(`${normalize.uncountedFiles} file(s) changed outside the pipeline since last build approval and have not been classified.`);
    note(`Run \`aitri normalize\` to classify and route each change.`);
  }

  // ── Next Action ─────────────────────────────────────────────────────────────
  section('Next Action');
  if (!nextActions.length) {
    note('_Nothing pending — project is idle._');
  } else {
    const [first, ...rest] = nextActions;
    note(`1. \`${first.command}\`${first.reason ? `   — ${first.reason}` : ''}`);
    for (let i = 0; i < Math.min(rest.length, 4); i++) {
      const a = rest[i];
      note(`${i + 2}. \`${a.command}\`${a.reason ? `   — ${a.reason}` : ''}`);
    }
  }

  // Footer hint — only in brief mode, so operators know the reference data exists
  // without having to discover the flag from docs alone.
  if (!full) {
    lines.push('');
    lines.push('_Run `aitri resume --full` for architecture, requirements, and test coverage detail._');
  }

  console.log(lines.join('\n'));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function phaseLabel(ph) {
  if (!ph) return '⬜ Not started';
  if (ph.status === 'approved')    return '✅ Approved';
  if (ph.status === 'completed')   return '⏳ Awaiting approval';
  if (ph.status === 'in_progress') return '🔄 In progress';
  return '⬜ Not started';
}

function nextActionFor(pipeline, actions) {
  return actions.find(a => a.scope === pipeline.scope) || null;
}
