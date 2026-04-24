/**
 * Module: Project Snapshot Builder
 * Purpose: Compute a single canonical ProjectSnapshot from disk — the unified
 *          data source consumed by status, resume, validate, and the Hub JSON
 *          contract (future phases).
 *
 * Design:
 *   - Pure function. No stdout, no mutation of state. Deterministic given the
 *     same disk + `now` value.
 *   - Aggregates root pipeline + every `features/<name>/.aitri` sub-pipeline.
 *   - Derives health signals (deployable, stale audit, drift present) from
 *     the composed shape — no persisted health field.
 *   - Malformed artifacts do not crash the builder: each pipeline surfaces
 *     `parseError: true` and the aggregation continues.
 *
 * Consumers:
 *   - status.js     → short pipeline grid + next action (future phase)
 *   - resume.js     → full session briefing (future phase)
 *   - validate.js   → deploy-gate decision (future phase)
 *   - status --json → Hub / external subproducts (future phase)
 *
 * Scope identifier:
 *   `scope`       = 'root' | 'feature:<name>'
 *   `scopeType`   = 'root' | 'feature'
 *   `scopeName`   = null (root) | string (feature name)
 *
 * Invariants preserved:
 *   - Only state.js touches `.aitri` directly — snapshot uses its helpers.
 *   - Artifact reads respect `config.artifactsDir`.
 *   - Phase definitions sourced from lib/phases/index.js (single source of truth).
 */

import fs   from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, readArtifact, artifactPath, hasDrift } from './state.js';
import { PHASE_DEFS, OPTIONAL_PHASES }                       from './phases/index.js';

export const SNAPSHOT_VERSION = 1;

const CORE_PHASES       = [1, 2, 3, 4, 5];
const STALE_AUDIT_DAYS  = 60;
const STALE_VERIFY_DAYS = 14;
const MS_PER_DAY        = 86_400_000;

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Integer days between an ISO timestamp (or ms epoch) and `now`. null if input is falsy/invalid. */
export function daysSince(input, now = Date.now()) {
  if (input == null) return null;
  const t = typeof input === 'number' ? input : new Date(input).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / MS_PER_DAY));
}

/** Safely parse JSON. Returns { ok, data } — never throws. */
function parseJson(raw) {
  if (!raw) return { ok: false, data: null };
  try { return { ok: true, data: JSON.parse(raw) }; }
  catch { return { ok: false, data: null }; }
}

function phaseStatus(approvedSet, completedSet, phaseKey, artifactExists) {
  const k = String(phaseKey);
  if (approvedSet.has(k))  return 'approved';
  if (completedSet.has(k)) return 'completed';
  if (artifactExists)      return 'in_progress';
  return 'not_started';
}

/** Resolve config path used by state.js (flat file or directory). */
function aitriConfigPath(pipelineDir) {
  const p = path.join(pipelineDir, '.aitri');
  try {
    if (fs.statSync(p).isDirectory()) return path.join(p, 'config.json');
  } catch { /* absent — flat path is the candidate */ }
  return p;
}

function hasAitriState(pipelineDir) {
  return fs.existsSync(aitriConfigPath(pipelineDir));
}

// ── Pipeline entry builder ───────────────────────────────────────────────────

/**
 * Build one pipeline entry (root or feature). Returns null if the directory
 * has no `.aitri` at all (orphan feature directory).
 */
export function buildPipelineEntry(pipelineDir, scope) {
  if (!hasAitriState(pipelineDir)) return null;

  const scopeType = scope === 'root' ? 'root' : 'feature';
  const scopeName = scopeType === 'feature' ? scope.slice('feature:'.length) : null;

  // loadConfig is tolerant of malformed JSON (returns defaults). We still
  // flag parseError by inspecting the raw file — malformed config should be
  // visible rather than silently reset.
  let configParseError = false;
  try {
    const raw = fs.readFileSync(aitriConfigPath(pipelineDir), 'utf8').replace(/^\uFEFF/, '');
    JSON.parse(raw);
  } catch {
    configParseError = true;
  }

  const config       = loadConfig(pipelineDir);
  const artifactsDir = config.artifactsDir || '';
  const approvedSet  = new Set((config.approvedPhases  || []).map(String));
  const completedSet = new Set((config.completedPhases || []).map(String));

  const phases = [];

  // Optional phases — include only when artifact exists or already tracked
  for (const key of OPTIONAL_PHASES) {
    const p      = PHASE_DEFS[key];
    const exists = fs.existsSync(artifactPath(pipelineDir, config, p.artifact));
    const tracked = approvedSet.has(String(p.num)) || completedSet.has(String(p.num));
    if (!exists && !tracked) continue;
    const drift = approvedSet.has(String(p.num)) && hasDrift(pipelineDir, config, p.num, p.artifact);
    phases.push({
      key,
      num:      p.num,
      name:     p.name,
      alias:    p.alias || null,
      artifact: p.artifact,
      optional: true,
      exists,
      status:   phaseStatus(approvedSet, completedSet, p.num, exists),
      drift,
    });
  }

  // Core phases — always included
  for (const num of CORE_PHASES) {
    const p      = PHASE_DEFS[num];
    const exists = fs.existsSync(artifactPath(pipelineDir, config, p.artifact));
    const drift  = approvedSet.has(String(num)) && hasDrift(pipelineDir, config, num, p.artifact);
    phases.push({
      key:      num,
      num,
      name:     p.name,
      alias:    p.alias || null,
      artifact: p.artifact,
      optional: false,
      exists,
      status:   phaseStatus(approvedSet, completedSet, num, exists),
      drift,
    });
  }

  const allCoreApproved = CORE_PHASES.every(n => approvedSet.has(String(n)));

  const driftReapprovals = (config.events || [])
    .filter(e => e.event === 'approved' && e.afterDrift)
    .map(e => ({ phase: e.phase, at: e.at }));

  return {
    scope,
    scopeType,
    scopeName,
    path:         pipelineDir,
    projectName:  config.projectName || path.basename(pipelineDir),
    artifactsDir,
    aitriVersion: config.aitriVersion || null,
    createdAt:    config.createdAt || null,
    updatedAt:    config.updatedAt || null,
    phases,
    verify: {
      ran:     !!config.verifyPassed || !!config.verifySummary || !!config.verifyRanAt,
      passed:  !!config.verifyPassed,
      summary: config.verifySummary || null,
      ranAt:   config.verifyRanAt || null,
    },
    auditLastAt:     config.auditLastAt || null,
    rejections:      config.rejections || {},
    driftReapprovals,
    normalizeState:  config.normalizeState?.status === 'pending' ? 'pending' : null,
    normalizeBaseline: config.normalizeState
      ? {
          status:  config.normalizeState.status  || null,
          baseRef: config.normalizeState.baseRef || null,
          method:  config.normalizeState.method  || null,
        }
      : null,
    lastSession:     config.lastSession || null,
    upgradeFindings: Array.isArray(config.upgradeFindings) ? config.upgradeFindings : [],
    allCoreApproved,
    parseError:      configParseError,
  };
}

// ── Feature discovery ────────────────────────────────────────────────────────

function discoverFeaturePipelines(rootDir) {
  const featuresDir = path.join(rootDir, 'features');
  if (!fs.existsSync(featuresDir)) return [];

  const entries = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  const pipelines = [];
  for (const e of entries) {
    const featureDir = path.join(featuresDir, e.name);
    const entry = buildPipelineEntry(featureDir, `feature:${e.name}`);
    if (entry) pipelines.push(entry);
    // Orphan (directory without .aitri) → silently ignored.
  }
  return pipelines;
}

// ── Aggregators ──────────────────────────────────────────────────────────────

function aggregateRequirements(pipelines) {
  const byPipeline = {};
  const openFRs    = [];
  const openNFRs   = [];
  let total = 0;

  for (const pl of pipelines) {
    const raw        = readArtifact(pl.path, '01_REQUIREMENTS.json', pl.artifactsDir);
    const { ok, data } = parseJson(raw);
    if (!ok || !data) continue;
    const frs  = data.functional_requirements     || [];
    const nfrs = data.non_functional_requirements || [];
    byPipeline[pl.scope] = { fr: frs.length, nfr: nfrs.length };
    total += frs.length;
    for (const fr of frs) {
      openFRs.push({
        id:                  fr.id,
        priority:            fr.priority,
        type:                fr.type ?? null,
        title:               fr.title,
        acceptance_criteria: fr.acceptance_criteria || [],
        scope:               pl.scope,
      });
    }
    // Legacy v0.1.65-era schemas used {title, constraint}; current schema is {category, requirement}.
    // Tolerate both so older projects render cleanly until migrated. See FEEDBACK.md A1.
    for (const nfr of nfrs) {
      openNFRs.push({
        id:          nfr.id,
        category:    nfr.category    ?? nfr.title      ?? null,
        requirement: nfr.requirement ?? nfr.constraint ?? null,
        scope:       pl.scope,
      });
    }
  }
  return { total, byPipeline, openFRs, openNFRs };
}

function aggregateTests(pipelines, now = Date.now()) {
  const byPipeline = {};
  const perPipeline = [];
  let pipelinesWithVerify    = 0;
  let pipelinesWithoutVerify = 0;
  let totalFailing           = 0;
  let totalPassing           = 0;
  let totalSkipped           = 0;
  let totalManual            = 0;
  let totalAll               = 0;

  for (const pl of pipelines) {
    const raw = readArtifact(pl.path, '04_TEST_RESULTS.json', pl.artifactsDir);
    const { ok, data } = parseJson(raw);

    const entry = {
      verifyPassed: pl.verify.passed,
      summary:      pl.verify.summary,
      coverage:     [],
      ranAt:        pl.verify.ranAt,
    };

    if (ok && data) {
      const covRaw  = data.fr_coverage;
      const entries = Array.isArray(covRaw)
        ? covRaw.map(c => [c.fr_id, c])
        : Object.entries(covRaw || {});
      entry.coverage = entries.map(([frId, c]) => ({
        fr_id:   frId,
        status:  c.status ?? 'unknown',
        passing: c.tests_passing ?? c.passed ?? 0,
        failing: c.tests_failing ?? c.failed ?? 0,
        skipped: c.tests_skipped ?? 0,
      }));
    }

    byPipeline[pl.scope] = entry;

    if (pl.verify.ran)  pipelinesWithVerify++;
    else                pipelinesWithoutVerify++;

    const s = pl.verify.summary;
    if (s) {
      totalPassing += s.passed  || 0;
      totalFailing += s.failed  || 0;
      totalSkipped += s.skipped || 0;
      totalManual  += s.manual  || 0;
      totalAll     += s.total   || 0;
    }

    perPipeline.push({
      scope:  pl.scope,
      passed: s?.passed ?? null,
      failed: s?.failed ?? null,
      total:  s?.total  ?? null,
      ran:    !!pl.verify.ran,
    });
  }

  const root = pipelines.find(p => p.scopeType === 'root');
  const stalenessDays = root ? daysSince(root.verify.ranAt, now) : null;

  return {
    byPipeline,
    perPipeline,
    totals: {
      passed:  totalPassing,
      failed:  totalFailing,
      skipped: totalSkipped,
      manual:  totalManual,
      total:   totalAll,
    },
    global: { pipelinesWithVerify, pipelinesWithoutVerify, totalPassing, totalFailing },
    stalenessDays,
  };
}

function readJsonList(pl, filename, collectionKey) {
  const raw = readArtifact(pl.path, filename, pl.artifactsDir);
  const { ok, data } = parseJson(raw);
  if (!ok || !data) return [];
  const list = data[collectionKey] || data.items || [];
  return Array.isArray(list) ? list : [];
}

function aggregateBugs(pipelines) {
  const list       = [];
  const byPipeline = {};
  let total    = 0;
  let open     = 0;
  let blocking = 0;

  for (const pl of pipelines) {
    const bugs = readJsonList(pl, 'BUGS.json', 'bugs');
    byPipeline[pl.scope] = bugs.length;
    total += bugs.length;
    for (const b of bugs) {
      const isOpen = b.status === 'open' || b.status === 'in_progress' || b.status === 'fixed';
      const isBlocking = (b.severity === 'critical' || b.severity === 'high') &&
                         (b.status === 'open' || b.status === 'in_progress');
      if (isOpen)     open++;
      if (isBlocking) blocking++;
      list.push({
        id:             b.id,
        title:          b.title,
        severity:       b.severity,
        status:         b.status,
        fr:             b.fr || null,
        phase_detected: b.phase_detected || null,
        scope:          pl.scope,
      });
    }
  }
  return { total, open, blocking, byPipeline, list };
}

function aggregateDebt(pipelines) {
  const list       = [];
  const byPipeline = {};
  let total = 0;

  for (const pl of pipelines) {
    const raw = readArtifact(pl.path, '04_IMPLEMENTATION_MANIFEST.json', pl.artifactsDir);
    const { ok, data } = parseJson(raw);
    if (!ok || !data) { byPipeline[pl.scope] = 0; continue; }
    const debt = data.technical_debt || [];
    byPipeline[pl.scope] = debt.length;
    total += debt.length;
    for (const d of debt) {
      list.push({
        fr_id:         d.fr_id,
        substitution:  d.substitution,
        reason:        d.reason,
        effort_to_fix: d.effort_to_fix,
        scope:         pl.scope,
      });
    }
  }
  return { total, byPipeline, list };
}

function aggregateBacklog(pipelines) {
  const byPipeline = {};
  let open = 0;

  for (const pl of pipelines) {
    const items = readJsonList(pl, 'BACKLOG.json', 'items');
    const pipelineOpen = items.filter(i => i.status !== 'closed').length;
    byPipeline[pl.scope] = pipelineOpen;
    open += pipelineOpen;
  }
  return { open, byPipeline };
}

function computeAudit(rootPipeline, now) {
  const adir = rootPipeline.artifactsDir || 'spec';
  const auditPath = path.join(rootPipeline.path, adir, 'AUDIT_REPORT.md');
  if (!fs.existsSync(auditPath)) {
    return { exists: false, path: null, lastAt: null, stalenessDays: null };
  }
  // Prefer persisted timestamp from .aitri (set by `aitri audit`) — survives
  // git clone, which resets file mtime. Fall back to mtime for legacy projects
  // and reports written without persistence.
  let lastAt = rootPipeline.auditLastAt || null;
  if (!lastAt) {
    try { lastAt = new Date(fs.statSync(auditPath).mtimeMs).toISOString(); }
    catch { /* unreadable */ }
  }
  return {
    exists:        true,
    path:          auditPath,
    lastAt,
    stalenessDays: daysSince(lastAt, now),
  };
}

/**
 * Detect changed source files between the recorded normalize baseline and HEAD.
 *
 * Cheap, opt-in, side-effect free: only runs when method='git' and status='resolved'
 * (status='pending' already implies known unclassified changes — no need to re-count;
 * mtime baselines are skipped to avoid walking the tree on every status call).
 *
 * Returns:
 *   { state, baseRef, method, uncountedFiles }
 *     - state:          'pending' | 'resolved' | null   (verbatim from baseline)
 *     - uncountedFiles: number of off-pipeline source files since baseRef when
 *                       detection ran cleanly; null when baseline is missing,
 *                       method is mtime, or git failed.
 */
export function detectUncountedChanges(rootPipeline) {
  const baseline = rootPipeline?.normalizeBaseline;
  if (!baseline?.baseRef) {
    return { state: null, baseRef: null, method: null, uncountedFiles: null };
  }

  const result = {
    state:          baseline.status || null,
    baseRef:        baseline.baseRef,
    method:         baseline.method || null,
    uncountedFiles: null,
  };

  // Only auto-detect for git baselines in the resolved state — see header.
  if (baseline.method !== 'git' || baseline.status !== 'resolved') return result;

  try {
    const out = execSync(
      `git diff ${baseline.baseRef}..HEAD --name-only --diff-filter=ACMR`,
      { cwd: rootPipeline.path, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    const files = out
      ? out.split('\n').filter(f =>
          f &&
          !f.startsWith('spec/') &&
          !f.startsWith('.aitri') &&
          !f.startsWith('node_modules/'))
      : [];
    result.uncountedFiles = files.length;
  } catch {
    // git command failed (no git, bad ref, etc.) — leave as null (unknown, not zero).
  }
  return result;
}

function readDesignExcerpt(rootPipeline, lines = 80) {
  const raw = readArtifact(rootPipeline.path, '02_SYSTEM_DESIGN.md', rootPipeline.artifactsDir);
  if (!raw) return null;
  return raw.split('\n').slice(0, lines).join('\n');
}

// ── Health signals ───────────────────────────────────────────────────────────

function computeHealth({ project, pipelines, bugs, audit, tests }) {
  const root = pipelines.find(p => p.scopeType === 'root');

  const driftPresent = [];
  for (const pl of pipelines) {
    for (const ph of pl.phases) {
      if (ph.drift) driftPresent.push({ scope: pl.scope, phase: ph.alias || ph.key });
    }
  }

  const staleAudit = audit.exists
    ? (audit.stalenessDays != null && audit.stalenessDays > STALE_AUDIT_DAYS)
    : false;

  // staleVerify: list of pipelines whose persisted verifyRanAt is older than
  // STALE_VERIFY_DAYS. Pipelines with no verifyRanAt are skipped — staleness
  // is undefined, not stale-by-default.
  const staleVerify = [];
  for (const pl of pipelines) {
    if (!pl.verify.ranAt) continue;
    const days = daysSince(pl.verify.ranAt);
    if (days != null && days > STALE_VERIFY_DAYS) {
      staleVerify.push({ scope: pl.scope, days });
    }
  }

  const blockedByBugs = bugs.blocking > 0;

  const activeFeatures = pipelines
    .filter(p => p.scopeType === 'feature')
    .filter(p => !p.allCoreApproved || !p.verify.passed)
    .length;

  // Deployable (root pipeline):
  //   - all core phases approved
  //   - verify passed
  //   - no drift anywhere in root
  //   - no blocking bugs (global — features can block root ship too)
  //   - version matches
  //   - no normalize pending
  const reasons = [];
  if (!root) {
    reasons.push({ type: 'no_root', message: 'No root pipeline found' });
  } else {
    if (!root.allCoreApproved)              reasons.push({ type: 'phases_pending',   message: 'Not all core phases approved' });
    if (!root.verify.passed)                reasons.push({ type: 'verify_not_passed', message: 'verify-complete has not passed' });
    if (root.phases.some(p => p.drift))     reasons.push({ type: 'drift',            message: 'One or more approved phases have drifted' });
    if (root.normalizeState === 'pending')  reasons.push({ type: 'normalize_pending', message: 'Code changes pending classification' });
  }
  if (blockedByBugs)                        reasons.push({ type: 'blocking_bugs',    message: `${bugs.blocking} critical/high bug(s) open` });
  if (project.versionMismatch)              reasons.push({ type: 'version_mismatch', message: `Project v${project.aitriVersion} vs CLI v${project.cliVersion}` });

  // Terminal-state features with verify ran and failed: pipeline signed off
  // but its own tests disagree. WIP features (phases < 5/5) remain independent
  // of root's deploy gate — the block only fires on the "done but broken" case.
  const failedTerminalFeatures = pipelines
    .filter(p => p.scopeType === 'feature' && p.allCoreApproved && p.verify.ran && !p.verify.passed)
    .map(p => p.scopeName);
  if (failedTerminalFeatures.length) {
    reasons.push({
      type:    'feature_verify_failed',
      message: `Feature(s) at 5/5 with verify failed: ${failedTerminalFeatures.join(', ')}`,
      features: failedTerminalFeatures,
    });
  }

  return {
    deployable:       reasons.length === 0,
    deployableReasons: reasons,
    staleVerify,
    staleAudit,
    driftPresent,
    versionMismatch:  project.versionMismatch,
    activeFeatures,
    blockedByBugs,
  };
}

// ── Next actions ─────────────────────────────────────────────────────────────

function phaseCommandKey(phase) {
  // Prefer alias for core phases (v0.1.69+); fall back to number/key.
  return phase.alias || phase.key;
}

function pipelineCommand(pl, verb, phaseRef) {
  if (pl.scopeType === 'root')    return `aitri ${verb} ${phaseRef}`;
  return `aitri feature ${verb} ${pl.scopeName} ${phaseRef}`;
}

function nextPhaseAction(pl) {
  // First drift → re-approve
  const drifted = pl.phases.find(p => p.drift);
  if (drifted) {
    return {
      command: pipelineCommand(pl, 'approve', phaseCommandKey(drifted)),
      reason:  `Drift on ${drifted.name} — re-approval required`,
      severity: 'warn',
    };
  }
  // Phase 4 approved but verify not run
  const phase4 = pl.phases.find(p => p.key === 4);
  if (phase4 && phase4.status === 'approved' && !pl.verify.passed) {
    return {
      command: pl.scopeType === 'root' ? 'aitri verify-run' : `aitri feature verify-run ${pl.scopeName}`,
      reason:  'Phase 4 approved — run verify next',
      severity: 'info',
    };
  }
  // First non-approved core phase
  const nextCore = pl.phases.find(p => !p.optional && p.status !== 'approved');
  if (nextCore) {
    if (nextCore.status === 'completed') {
      return {
        command: pipelineCommand(pl, 'approve', phaseCommandKey(nextCore)),
        reason:  `${nextCore.name} awaiting approval`,
        severity: 'info',
      };
    }
    if (nextCore.status === 'in_progress') {
      return {
        command: pipelineCommand(pl, 'complete', phaseCommandKey(nextCore)),
        reason:  `${nextCore.name} in progress — validate and complete`,
        severity: 'info',
      };
    }
    return {
      command: pipelineCommand(pl, 'run-phase', phaseCommandKey(nextCore)),
      reason:  `${nextCore.name} not started`,
      severity: 'info',
    };
  }
  return null;
}

function computeNextActions(snapshot) {
  const actions = [];
  const { project, pipelines, bugs, audit, health, normalize } = snapshot;
  const root = pipelines.find(p => p.scopeType === 'root');

  // Priority 1 — Version mismatch (root only)
  if (project.versionMismatch || project.versionMissing) {
    actions.push({
      priority: 1,
      scope:    'root',
      command:  'aitri adopt --upgrade',
      reason:   project.versionMismatch
        ? `Project v${project.aitriVersion} vs CLI v${project.cliVersion} — sync before continuing`
        : 'aitriVersion missing — sync project state',
      severity: 'warn',
    });
  }

  // Priority 2 — Drift on approved phases
  for (const pl of pipelines) {
    for (const ph of pl.phases) {
      if (!ph.drift) continue;
      actions.push({
        priority: 2,
        scope:    pl.scope,
        command:  pipelineCommand(pl, 'approve', phaseCommandKey(ph)),
        reason:   `${ph.name} drifted in ${pl.scope} — re-approve required`,
        severity: 'warn',
      });
    }
  }

  // Priority 3 — Blocking bugs
  if (bugs.blocking > 0) {
    actions.push({
      priority: 3,
      scope:    'project',
      command:  'aitri bug list',
      reason:   `${bugs.blocking} critical/high bug(s) open — resolve before proceeding`,
      severity: 'critical',
    });
  }

  // Priority 3 — Unresolved upgrade findings (A1, alpha.3+)
  //
  // `aitri adopt --upgrade` surfaces findings it cannot auto-migrate
  // (multi-FR TCs, free-text NFR titles, etc.). Without persistence, the
  // findings scrolled past in the upgrade report and never surfaced again —
  // projects stayed dirty under a "clean" header. Persisting them in
  // .aitri.upgradeFindings[] lets the next-action ladder remind the operator
  // until they are resolved (a later run of adopt --upgrade clears the array
  // when diagnose() returns empty).
  for (const pl of pipelines) {
    const findings = pl.upgradeFindings || [];
    if (findings.length === 0) continue;
    // Root → `aitri resume` renders the full Unresolved Upgrade Findings
    // section with per-finding reason. Previous version pointed to
    // `aitri status`, which only shows a count line and redirected the
    // operator back to `aitri resume` — a two-hop that added no info.
    // Feature → `aitri feature status` because no `aitri feature resume`
    // command exists; feature-scoped status internally reuses cmdStatus
    // and surfaces the findings count line for that scope.
    actions.push({
      priority: 3,
      scope:    pl.scope,
      command:  pl.scopeType === 'root' ? 'aitri resume' : `aitri feature status ${pl.scopeName}`,
      reason:   `${findings.length} unresolved upgrade finding(s) in ${pl.scope} — artifacts need agent re-authoring`,
      severity: 'warn',
    });
  }

  // Priority 4 — Normalize pending (root)
  if (root && root.normalizeState === 'pending') {
    actions.push({
      priority: 4,
      scope:    'root',
      command:  'aitri normalize',
      reason:   'Code changes outside pipeline — classify before proceeding',
      severity: 'warn',
    });
  } else if (normalize && normalize.uncountedFiles > 0) {
    // Same command, distinct reason: detected at snapshot time but never classified.
    actions.push({
      priority: 4,
      scope:    'root',
      command:  'aitri normalize',
      reason:   `${normalize.uncountedFiles} file(s) changed outside pipeline since last build approval`,
      severity: 'warn',
    });
  }

  // Priority 5/6 — Pending phase work (per pipeline)
  for (const pl of pipelines) {
    // Skip re-drift (already emitted at priority 2)
    if (pl.phases.some(p => p.drift)) continue;
    const next = nextPhaseAction(pl);
    if (!next) continue;
    // Verify-run is priority 5; ordinary phase work is priority 6
    const isVerify = next.command.includes('verify-run');
    actions.push({
      priority: isVerify ? 5 : 6,
      scope:    pl.scope,
      command:  next.command,
      reason:   next.reason,
      severity: next.severity,
    });
  }

  // Priority 7 — Deployable → validate (root)
  //
  // Terminal-state exception (F11): when the project is deployable AND audit is
  // on record AND neither audit nor verify are stale, there is no real next
  // action — every gate has passed recently. Suggesting `aitri validate`
  // reflexively in that case creates low-grade anxiety that something is
  // pending when nothing is. Instead, leave P7 off the list so `resume` prints
  // "_Nothing pending — project is idle._" and `status` prints "(nothing —
  // project is idle)". If P9 (audit) still fires because audit is missing or
  // stale, that is legitimate pending work and the terminal condition does
  // not apply.
  if (health.deployable) {
    const stableTerminal =
      audit.exists &&
      !health.staleAudit &&
      health.staleVerify.length === 0;
    if (!stableTerminal) {
      actions.push({
        priority: 7,
        scope:    'root',
        command:  'aitri validate',
        reason:   'All artifacts approved, verify passed — confirm deployment readiness',
        severity: 'info',
      });
    }
  }

  // Priority 9 — Audit stale or missing
  if (!audit.exists) {
    actions.push({
      priority: 9,
      scope:    'project',
      command:  'aitri audit',
      reason:   'No AUDIT_REPORT.md — run evaluative audit',
      severity: 'info',
    });
  } else if (health.staleAudit) {
    actions.push({
      priority: 9,
      scope:    'project',
      command:  'aitri audit',
      reason:   `Last audit ${audit.stalenessDays} days ago — refresh recommended`,
      severity: 'info',
    });
  }

  actions.sort((a, b) => a.priority - b.priority);
  return actions;
}

// ── Top-level builder ────────────────────────────────────────────────────────

/**
 * Build the canonical ProjectSnapshot for a directory.
 *
 * @param {string} dir — project root (must contain `.aitri`)
 * @param {object} [opts]
 * @param {string} [opts.cliVersion] — current CLI version for mismatch detection
 * @param {number} [opts.now]        — ms epoch, injected for deterministic tests
 * @returns {ProjectSnapshot}
 * @throws  {Error} if `dir` is not an Aitri project root
 */
export function buildProjectSnapshot(dir, opts = {}) {
  const { cliVersion = null, now = Date.now() } = opts;

  if (!hasAitriState(dir)) {
    throw new Error(`Not an Aitri project: no .aitri found at ${dir}`);
  }

  const rootPipeline   = buildPipelineEntry(dir, 'root');
  const featurePipelines = discoverFeaturePipelines(dir);
  const pipelines      = [rootPipeline, ...featurePipelines];

  const project = {
    name:            rootPipeline.projectName,
    dir,
    aitriVersion:    rootPipeline.aitriVersion,
    cliVersion,
    versionMismatch: !!(cliVersion && rootPipeline.aitriVersion && rootPipeline.aitriVersion !== cliVersion),
    versionMissing:  !!(cliVersion && !rootPipeline.aitriVersion),
  };

  const requirements = aggregateRequirements(pipelines);
  const tests        = aggregateTests(pipelines, now);
  const bugs         = aggregateBugs(pipelines);
  const debt         = aggregateDebt(pipelines);
  const backlog      = aggregateBacklog(pipelines);
  const audit        = computeAudit(rootPipeline, now);
  const design       = { excerpt: readDesignExcerpt(rootPipeline) };
  const normalize    = detectUncountedChanges(rootPipeline);

  const partial = {
    snapshotVersion: SNAPSHOT_VERSION,
    generatedAt:     new Date(now).toISOString(),
    project,
    pipelines,
    requirements,
    tests,
    bugs,
    debt,
    backlog,
    audit,
    design,
    normalize,
  };

  const health      = computeHealth(partial);
  const withHealth  = { ...partial, health };
  const nextActions = computeNextActions(withHealth);

  return { ...withHealth, nextActions };
}
