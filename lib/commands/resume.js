/**
 * Module: Command — resume
 * Purpose: Print a structured session-handoff briefing to stdout.
 *          Read-only — no state written, no artifacts created.
 *          Designed to be piped or pasted as context for a new agent session.
 */

import path from 'path';
import { loadConfig, readArtifact } from '../state.js';
import { getOpenBugs } from './bug.js';
import { head } from '../phases/context.js';

const CORE_PHASES = [1, 2, 3, 4, 5];

export function cmdResume({ dir, VERSION }) {
  const config       = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';
  const approved     = new Set(config.approvedPhases  || []);
  const completed    = new Set(config.completedPhases || []);
  const projectName  = config.projectName || path.basename(dir);
  const date         = new Date().toISOString().slice(0, 10);

  const versionMismatch = VERSION && config.aitriVersion && config.aitriVersion !== VERSION;
  const versionMissing  = VERSION && !config.aitriVersion;

  const lines = [];
  const section = (title) => { lines.push(''); lines.push(`## ${title}`); };
  const note    = (text)  => lines.push(text);

  lines.push(`# AITRI SESSION RESUME — ${projectName} (${date})`);

  if (versionMismatch || versionMissing) {
    section('⚠ Version Update Required — Run This First');
    if (versionMismatch) {
      note(`Project was initialized with Aitri v${config.aitriVersion}. Current CLI is v${VERSION}.`);
    } else {
      note(`Project is missing aitriVersion. Current CLI is v${VERSION}.`);
    }
    note(`Phase briefings and validation rules have been updated since this project was created.`);
    note(`Sync before continuing the pipeline:`);
    note(``);
    note(`  aitri adopt --upgrade`);
    note(``);
    note(`This is non-destructive: it reconciles your artifacts with the current state,`);
    note(`updates the version, and preserves all approvals and completed phases.`);
    note(`Run \`aitri resume\` again after upgrading to see the clean state.`);
  }

  // ── Pipeline State ──────────────────────────────────────────────────────────
  section('Pipeline State');
  const phaseLabel = (n) => {
    if (approved.has(n))  return '✅ Approved';
    if (completed.has(n)) return '⏳ Awaiting approval';
    return '⬜ Not started';
  };
  for (const n of CORE_PHASES) {
    note(`- Phase ${n}: ${phaseLabel(n)}`);
  }
  if (config.verifyPassed) {
    const s = config.verifySummary || {};
    note(`- Verify: ✅ Passed (${s.passed ?? '?'}/${s.total ?? '?'})`);
  } else if (approved.has(4)) {
    note(`- Verify: ⬜ Not run`);
  }

  // ── Last Session ─────────────────────────────────────────────────────────────
  const ls = config.lastSession;
  if (ls) {
    section('Last Session');
    const when  = ls.at ? new Date(ls.at).toLocaleString() : 'unknown';
    const agent = ls.agent && ls.agent !== 'unknown' ? ` (${ls.agent})` : '';
    note(`- **When:** ${when}${agent}`);
    note(`- **Event:** ${ls.event || 'unknown'}`);
    if (ls.context) note(`- **Context:** ${ls.context}`);
    if (ls.files_touched?.length) {
      note(`- **Files touched:** ${ls.files_touched.join(', ')}`);
    }
  }

  // ── Architecture & Stack Decisions ──────────────────────────────────────────
  section('Architecture & Stack Decisions');
  const design = readArtifact(dir, '02_SYSTEM_DESIGN.md', artifactsDir);
  if (design) {
    note(head(design, 80));
  } else {
    note('_Not yet available — complete Phase 2 first._');
  }

  // ── Open Requirements ────────────────────────────────────────────────────────
  section('Open Requirements');
  const reqRaw = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
  if (reqRaw) {
    try {
      const req = JSON.parse(reqRaw);
      const frs = req.functional_requirements || [];
      if (frs.length) {
        for (const fr of frs) {
          note(`- **${fr.id}** (${fr.priority}, ${fr.type}): ${fr.title}`);
          if (fr.acceptance_criteria?.length) {
            for (const ac of fr.acceptance_criteria) {
              note(`  - AC: ${ac}`);
            }
          }
        }
      } else {
        note('_No functional requirements found._');
      }
      const nfrs = req.non_functional_requirements || [];
      if (nfrs.length) {
        note('');
        note('**Non-functional:**');
        for (const nfr of nfrs) {
          note(`- **${nfr.id}** (${nfr.category}): ${nfr.requirement}`);
        }
      }
    } catch {
      note('_Could not parse 01_REQUIREMENTS.json._');
    }
  } else {
    note('_Not yet available — complete Phase 1 first._');
  }

  // ── Test Coverage ────────────────────────────────────────────────────────────
  section('Test Coverage');
  const resultsRaw = readArtifact(dir, '04_TEST_RESULTS.json', artifactsDir);
  if (resultsRaw) {
    try {
      const results = JSON.parse(resultsRaw);
      const covRaw  = results.fr_coverage;
      const entries = Array.isArray(covRaw)
        ? covRaw.map(c => [c.fr_id, c])
        : Object.entries(covRaw || {});
      if (entries.length) {
        for (const [frId, c] of entries) {
          const passing = c.tests_passing ?? c.passed  ?? 0;
          const failing = c.tests_failing ?? c.failed  ?? 0;
          const skipped = c.tests_skipped ?? 0;
          const total   = (passing + failing + skipped) || (c.total ?? 0);
          note(`- ${frId}: ${c.status ?? 'unknown'} (${passing}/${total} tests passing)`);
        }
      } else {
        note('_No FR coverage data in test results._');
      }
      const s = results.summary || {};
      if (s.total !== undefined) note(`\n_Summary: ${s.passed ?? 0}/${s.total} passed, ${s.failed ?? 0} failed_`);
    } catch {
      note('_Could not parse 04_TEST_RESULTS.json._');
    }
  } else {
    note('_Not yet available — run aitri verify-run first._');
  }

  // ── Technical Debt ───────────────────────────────────────────────────────────
  section('Technical Debt');
  const manifestRaw = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json', artifactsDir);
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw);
      const debt = manifest.technical_debt || [];
      if (debt.length) {
        for (const d of debt) {
          note(`- **${d.fr_id}**: ${d.substitution} — ${d.reason} _(effort: ${d.effort_to_fix})_`);
        }
      } else {
        note('_No technical debt declared._');
      }
    } catch {
      note('_Could not parse 04_IMPLEMENTATION_MANIFEST.json._');
    }
  } else {
    note('_Not yet available — complete Phase 4 first._');
  }

  // ── Open Bugs ────────────────────────────────────────────────────────────────
  const openBugs = getOpenBugs(dir, config);
  if (openBugs.length > 0) {
    section('Open Bugs');
    for (const b of openBugs) {
      const fr  = b.fr ? ` (${b.fr})` : '';
      const ph  = b.phase_detected ? `, Phase ${b.phase_detected}` : '';
      note(`- **${b.id}** [${b.severity}] ${b.title}${fr}${ph}`);
    }
    const blocking = openBugs.filter(b => b.severity === 'critical' || b.severity === 'high');
    if (blocking.length > 0) {
      note('');
      note(`_${blocking.length} critical/high bug(s) will block verify-complete until resolved._`);
    }
  }

  // ── Rejection History ────────────────────────────────────────────────────────
  const rejections = config.rejections || {};
  const rejectedPhases = Object.keys(rejections);
  if (rejectedPhases.length) {
    section('Rejection History');
    for (const n of rejectedPhases) {
      const r = rejections[n];
      const d = new Date(r.at).toLocaleDateString();
      note(`- Phase ${n} (${d}): "${r.feedback}"`);
    }
  }

  // ── Drift Re-approvals ───────────────────────────────────────────────────────
  const driftReapprovals = (config.events || []).filter(e => e.event === 'approved' && e.afterDrift);
  if (driftReapprovals.length) {
    section('⚠ Re-approved After Drift — Verify Content');
    note(`The following phases were re-approved after their artifact changed.`);
    note(`A human approved the change interactively, but content correctness is not guaranteed.`);
    for (const e of driftReapprovals) {
      const d = new Date(e.at).toLocaleDateString();
      note(`- Phase ${e.phase} — re-approved on ${d}`);
    }
    note(``);
    note(`If you are unsure, run: \`aitri run-phase N\` to regenerate the artifact from scratch.`);
  }

  // ── Next Action ──────────────────────────────────────────────────────────────
  section('Next Action');
  const allCoreApproved = CORE_PHASES.every(n => approved.has(n));
  if (versionMismatch || versionMissing) {
    note('1. `aitri adopt --upgrade`   ← do this first (sync version and state)');
    const nextCore = CORE_PHASES.find(n => !approved.has(n)) || 1;
    const nextCmd  = allCoreApproved && config.verifyPassed ? 'aitri validate'
      : CORE_PHASES.filter(n => approved.has(n)).length === 4 && !config.verifyPassed ? 'aitri verify-run'
      : completed.has(nextCore) ? `aitri approve ${nextCore}` : `aitri run-phase ${nextCore}`;
    note(`2. \`${nextCmd}\`   ← then continue here`);
  } else if (allCoreApproved && config.verifyPassed) {
    note('All phases complete. Run: `aitri validate`');
  } else if (CORE_PHASES.filter(n => approved.has(n)).length === 4 && !config.verifyPassed) {
    note('Run: `aitri verify-run`  then `aitri verify-complete`');
  } else {
    const nextCore = CORE_PHASES.find(n => !approved.has(n)) || 1;
    if (completed.has(nextCore)) {
      note(`Run: \`aitri approve ${nextCore}\``);
    } else {
      note(`Run: \`aitri run-phase ${nextCore}\``);
    }
  }

  console.log(lines.join('\n'));
}
