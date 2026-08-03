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
 *   - The `.aitri` PATH is resolved by state.js (`configFilePath`/`configExists`) — snapshot
 *     never duplicates the layout logic. The one direct `fs.readFileSync` here reads that
 *     resolved path RAW, solely to detect a parse error that `loadConfig` deliberately
 *     swallows (it returns defaults on malformed JSON); all real reads go through state.js.
 *   - Artifact reads respect `config.artifactsDir`.
 *   - Phase definitions sourced from lib/phases/index.js (single source of truth).
 */

import fs   from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { loadConfig, readArtifact, artifactPath, hasDrift, featuresDir as resolveFeaturesDir, configFilePath, configExists, verifyResultsBinding } from './state.js';
import { hasUxRequiringFr } from './requirements.js';
import { PHASE_DEFS, OPTIONAL_PHASES }                       from './phases/index.js';
import { isBehavioralFile, isAitriStatePath }                from './reconcile-patterns.js';
// Bug-state predicates SSoT (AUDIT-0629-G): the root deploy gate (this aggregator) and the feature
// gate (bug.getBlockingBugs) share ONE definition of active/blocking so they cannot drift apart.
import { isActiveBug, isBlockingBug, bugSeverity, bugStatus } from './commands/bug.js';
import { parseBuildPlan, summarizeEpicProgress } from './build-plan.js';

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

// ── Pipeline entry builder ───────────────────────────────────────────────────

/**
 * Build one pipeline entry (root or feature). Returns null if the directory
 * has no `.aitri` at all (orphan feature directory).
 */
export function buildPipelineEntry(pipelineDir, scope, { tolerateConflict = false } = {}) {
  if (!configExists(pipelineDir)) return null;

  const scopeType = scope === 'root' ? 'root' : 'feature';
  const scopeName = scopeType === 'feature' ? scope.slice('feature:'.length) : null;

  // loadConfig REFUSES on any unreadable config — malformed JSON or merge-conflict markers
  // (B6/ADR-070 extended G-4 to every parse failure). With tolerateConflict it returns
  // DEFAULTS instead — so one bad FEATURE config degrades to a flagged parseError entry
  // rather than aborting the whole aggregation (the resilience contract at the top of this
  // file). A broken ROOT config is NOT tolerated (tolerateConflict stays false): the project
  // state is unknowable, so it refuses with restore guidance like any other command. We
  // still flag parseError by inspecting the raw file — a malformed/conflicted config should
  // be visible rather than silently reset.
  let configParseError = false;
  try {
    const raw = fs.readFileSync(configFilePath(pipelineDir), 'utf8').replace(/^\uFEFF/, '');
    JSON.parse(raw);
  } catch {
    configParseError = true;
  }

  const config       = loadConfig(pipelineDir, { tolerateConflict });
  const artifactsDir = config.artifactsDir || '';
  const approvedSet  = new Set((config.approvedPhases  || []).map(String));
  const completedSet = new Set((config.completedPhases || []).map(String));
  const cascadedSet  = new Set((config.cascadedPhases  || []).map(String));   // C5b

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
      cascadePending: cascadedSet.has(String(p.num)),
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
      cascadePending: cascadedSet.has(String(num)),
    });
  }

  const allCoreApproved = CORE_PHASES.every(n => approvedSet.has(String(n)));

  // ADV-0622-29: UX/visual/audio FRs require the UX phase to run BEFORE Architecture.
  // The `approve requirements` message already steers to `run-phase ux`; the next-action
  // ladder must agree, or a later `status`/`resume` contradicts it by pointing straight
  // at Architecture (the architect would then design without the UX spec). The FR-type
  // detection is now the shared hasUxRequiringFr predicate (UPLAN-0703 D4) — approve.js
  // consumes the SAME function, so the two can no longer drift (the divergence this
  // "Mirror the exact detection" comment used to warn about is now structural, not manual).
  let uxRequired = false;
  if (approvedSet.has('1') && !approvedSet.has('ux')) {
    try {
      const reqs = JSON.parse(readArtifact(pipelineDir, '01_REQUIREMENTS.json', artifactsDir));
      uxRequired = hasUxRequiringFr(reqs);
    } catch { /* no/invalid requirements → no UX steer */ }
  }

  // AUDIT-0629-D: guard the element against null/non-object. The builder's header invariant is
  // "malformed artifacts do not crash the builder"; a single null in a hand-edited events[] (valid
  // JSON, so coerceArrayFields lets it through) would otherwise throw and abort the whole snapshot,
  // hard-failing status/resume/validate.
  const driftReapprovals = (config.events || [])
    .filter(e => e && e.event === 'approved' && e.afterDrift)
    .map(e => ({ phase: e.phase, at: e.at }));

  // Latest verify-run summary. verifySummary is only persisted on verify-complete
  // success, but resume must also know what verify-run produced when complete has
  // not passed — otherwise it loops recommending verify-run after a no-op all-skip
  // run. Prefer the first-class `lastVerifyRun` field (rc.25+, survives event-log
  // eviction); fall back to scanning the 20-capped event log for older projects.
  let lastRunSummary = null;
  const lv = config.lastVerifyRun;
  if (lv && typeof lv === 'object') {
    lastRunSummary = {
      passed:  lv.passed  || 0,
      failed:  lv.failed  || 0,
      skipped: lv.skipped || 0,
      manual:  lv.manual  || 0,
    };
  } else {
    for (let i = (config.events || []).length - 1; i >= 0; i--) {
      const e = config.events[i];
      if (e && e.event === 'verify-run') {   // AUDIT-0629-D: tolerate a null element (see above)
        lastRunSummary = {
          passed:  e.passed  || 0,
          failed:  e.failed  || 0,
          skipped: e.skipped || 0,
          manual:  e.manual  || 0,
        };
        break;
      }
    }
  }

  // PLAN-ARTIFACT-0715 S3: advisory epic progress from BUILD_PLAN.md while the build is
  // in flight. "In flight" = build AUTHORIZED but not approved (3 approved, 4 not) — NOT
  // phase-4 artifact existence: 04_BUILD_REPORT.json is written at the END of the build,
  // so an existence-based condition would be null for the entire mid-build window the
  // feature exists for (adversarial BLOCKER finding). Requiring 3-approved also hides a
  // stale plan while a cascade re-runs phases 1–3. Display-only — the plan is an
  // agent-maintained working file, never a gate input; malformed/legacy/absent parses to
  // null (tolerant posture, lib/build-plan.js), and an unreadable file (EISDIR/EACCES)
  // must degrade too — the snapshot never crashes on an advisory read.
  let buildPlan = null;
  {
    const approvedSet = new Set((config.approvedPhases || []).map(String));
    if (approvedSet.has('3') && !approvedSet.has('4')) {
      let planRaw = null;
      try { planRaw = readArtifact(pipelineDir, 'BUILD_PLAN.md', artifactsDir); } catch { /* advisory — degrade to null */ }
      const parsed = planRaw ? parseBuildPlan(planRaw) : null;
      if (parsed) {
        buildPlan = {
          epics: parsed.epics.map(e => ({ id: e.id, title: e.title, status: e.status })),
          summary: summarizeEpicProgress(parsed),
        };
      }
    }
  }

  // RELEASE-VERSION-0722 (rc.9): the sealed release identity from 05_TRACEABILITY.json.
  // The `version` field was REQUIRED since the artifact existed but write-only — no
  // surface ever read it, so agents filled it with "1.0.0" forever. Tolerant read:
  // null when the artifact is absent/malformed; `version_source` is null on legacy
  // artifacts (the deploy template now mandates "manifest" | "team" | "assumed").
  // Gated on phase-5 APPROVED (skeptic finding): after a cascade reset the artifact
  // stays on disk but the release is no longer sealed — showing "Sealed version" then
  // would overstate the state (same windowing discipline as buildPlan above).
  let release = null;
  const _p5 = phases.find(p => String(p.key) === '5');
  if (_p5 && _p5.status === 'approved') {
    let tRaw = null;
    try { tRaw = readArtifact(pipelineDir, '05_TRACEABILITY.json', artifactsDir); } catch { /* advisory — degrade to null */ }
    if (tRaw) {
      try {
        const t = JSON.parse(tRaw);
        if (typeof t.version === 'string' && t.version.trim()) {
          release = {
            version: t.version.trim(),
            version_source: typeof t.version_source === 'string' ? t.version_source : null,
          };
        }
      } catch { /* malformed — no release info */ }
    }
  }

  return {
    scope,
    scopeType,
    scopeName,
    path:         pipelineDir,
    projectName:  config.projectName || path.basename(pipelineDir),
    artifactsDir,
    layoutRoot:   config.layoutRoot || '',
    aitriVersion: config.aitriVersion || null,
    // FEATURE-QUEUE-0722: normalized at the SOURCE — .aitri is hand-editable committed
    // JSON, and a numeric/garbage createdAt must degrade to null for every snapshot
    // consumer (the rc.2 fix guarded only the status render sites; the ladder's FIFO
    // tiebreak below made the missing source guard a 4-command crash).
    createdAt:    typeof config.createdAt === 'string' && config.createdAt ? config.createdAt : null,
    updatedAt:    config.updatedAt || null,
    phases,
    buildPlan,
    release,
    verify: {
      ran:            !!config.verifyPassed || !!config.verifySummary || !!config.verifyRanAt,
      passed:         !!config.verifyPassed,
      // Run-binding state of the results file on disk vs the stamp (UPLAN-0703 B3) — SSoT
      // for every surface. `passed` is a sticky flag that survives a post-run rewrite of the
      // results file; `resultsBinding` reflects the CURRENT disk truth ('bound' | 'mismatch'
      // | 'no-stamp' | 'missing-file'). The deploy gate requires 'bound', not just `passed`.
      resultsBinding: verifyResultsBinding(pipelineDir, config),
      summary:        config.verifySummary || null,
      lastRunSummary,
      ranAt:          config.verifyRanAt || null,
    },
    auditLastAt:     config.auditLastAt || null,
    rejections:      config.rejections || {},
    driftReapprovals,
    reconcileState:  config.reconcileState?.status === 'pending' ? 'pending' : null,
    reconcileBaseline: config.reconcileState
      ? {
          status:  config.reconcileState.status  || null,
          baseRef: config.reconcileState.baseRef || null,
          method:  config.reconcileState.method  || null,
        }
      : null,
    lastSession:     config.lastSession || null,
    sessionContext:  config.sessionContext || null,
    upgradeFindings: Array.isArray(config.upgradeFindings) ? config.upgradeFindings : [],
    allCoreApproved,
    uxRequired,
    parseError:      configParseError,
  };
}

// ── Feature discovery ────────────────────────────────────────────────────────

function discoverFeaturePipelines(rootDir) {
  // The root config is already loaded (and a conflicted root already refused) by the root
  // buildPipelineEntry in buildProjectSnapshot, which runs before this — so a plain load is safe.
  const featuresDir = resolveFeaturesDir(rootDir, loadConfig(rootDir));
  if (!fs.existsSync(featuresDir)) return [];

  const entries = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  const pipelines = [];
  for (const e of entries) {
    const featureDir = path.join(featuresDir, e.name);
    // tolerateConflict: a conflicted feature config is flagged (parseError) and skipped,
    // never aborting discovery of the root + sibling features (adversarial finding #1).
    const entry = buildPipelineEntry(featureDir, `feature:${e.name}`, { tolerateConflict: true });
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

      // HUB-CATCHUP-0705 (rc.161, additive): carry verify-run's quality surfaces
      // through the snapshot so machine consumers (Hub) stop re-reading the
      // artifact per pipeline. quality_gates is projected (name/status/required
      // + coverage threshold fields) — command strings and captured output stay
      // in the artifact. ac_coverage passes through unchanged (already compact).
      // Absent in the results file → null, so old files add no field noise.
      if (Array.isArray(data.quality_gates)) {
        entry.qualityGates = data.quality_gates.map(g => ({
          name:     typeof g?.name === 'string' ? g.name : null,
          status:   typeof g?.status === 'string' ? g.status : null,
          // Truthy, not === true: verify-complete blocks on truthy `required`
          // (verify.js), so the projection must agree with the gate on a
          // hand-edited file (e.g. required: 1) — never report "advisory"
          // for a gate the CLI would refuse on.
          required: !!g?.required,
          ...(g?.threshold != null ? { threshold: g.threshold } : {}),
          ...(g?.measured  != null ? { measured:  g.measured  } : {}),
        }));
      }
      if (Array.isArray(data.ac_coverage)) entry.acCoverage = data.ac_coverage;
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
      // Artifact pass-through fields keep their 04_TEST_RESULTS.json names.
      quality_gates: entry.qualityGates ?? null,
      ac_coverage:   entry.acCoverage   ?? null,
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
  if (raw === null || raw === undefined) return { list: [], parseError: false };
  const { ok, data } = parseJson(raw);
  // parseError = a file EXISTS but is unreadable. The snapshot stays a degrading display
  // surface (rc.149: the GATES refuse; display must not crash) — but degrading silently
  // left machine-readable consumers (Hub) unable to tell "no bugs" from "corrupt bug file"
  // while health.deployable read true (INTEG-0704 #2). Surface the flag; counters stay 0.
  if (!ok || !data) return { list: [], parseError: true };
  const list = data[collectionKey] || data.items || [];
  // Shape corruption is the same failure class as syntax corruption: a file whose
  // collection is not an array (e.g. {"bugs": 42}) hides its content from the counters
  // exactly like invalid JSON does. An absent/null collection key ({}) falls through the
  // || chain to [] and stays a legitimate empty list, as it always was.
  if (!Array.isArray(list)) return { list: [], parseError: true };
  return { list, parseError: false };
}

function aggregateBugs(pipelines) {
  const list       = [];
  const byPipeline = {};
  // FB-SCOPE-BLIND-0724: open count PER SCOPE (same isOpen predicate as `open` below).
  // byPipeline holds totals; the status render needs to say WHERE the open bugs live,
  // or an aggregated count over a root-scoped `aitri bug list` reads as stale state.
  const openByPipeline = {};
  const blockingByPipeline = {};
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const openIds    = [];
  let total    = 0;
  let open     = 0;
  let blocking = 0;

  const parseErrors = [];
  for (const pl of pipelines) {
    const { list: bugs, parseError } = readJsonList(pl, 'BUGS.json', 'bugs');
    if (parseError) parseErrors.push(pl.scope);
    byPipeline[pl.scope] = bugs.length;
    openByPipeline[pl.scope] = 0;
    blockingByPipeline[pl.scope] = 0;
    total += bugs.length;
    for (const b of bugs) {
      // Shared bug-state predicates (AUDIT-0629-G) — case-folded so a hand-written "Critical"/"Open"
      // in BUGS.json can't false-pass the deploy gate. `isOpen` (open|in_progress|fixed) keeps `fixed`
      // for the open count; `bySeverity`/`openIds` use isActiveBug (open|in_progress only) — `fixed`
      // is excluded (the dev claims it's resolved; it stops degrading as soon as it leaves active).
      const status   = bugStatus(b);
      const severity = bugSeverity(b);
      const isOpen = isActiveBug(b) || status === 'fixed';
      if (isOpen)            { open++; openByPipeline[pl.scope]++; }
      if (isBlockingBug(b))  { blocking++; blockingByPipeline[pl.scope]++; }
      if (isActiveBug(b) && bySeverity[severity] !== undefined) {
        bySeverity[severity]++;
        if (b.id) openIds.push(b.id);
      }
      list.push({
        id:             b.id,
        title:          b.title,
        // AUDIT-0629-B: emit the NORMALIZED severity/status so every list[] consumer (resume's
        // "Open Bugs" section, Hub) stays consistent with the normalized counters. Leaving these raw
        // made `resume` self-contradict on a capitalized "Open"/"Critical" bug — bugs.blocking said
        // "1 blocker" while the Open Bugs section (a case-sensitive list[] filter) showed none.
        severity:       severity,
        status:         status,
        fr:             b.fr || null,
        phase_detected: b.phase_detected || null,
        scope:          pl.scope,
      });
    }
  }
  // Deterministic ordering across runs — Hub renders openIds as clickable links
  // and same-snapshot byte-equality matters for cache hits.
  openIds.sort();
  return { total, open, blocking, bySeverity, openIds, byPipeline, openByPipeline, blockingByPipeline, list, parseErrors };
}

function aggregateDebt(pipelines) {
  const list       = [];
  const byPipeline = {};
  let total = 0;

  for (const pl of pipelines) {
    const raw = readArtifact(pl.path, '04_BUILD_REPORT.json', pl.artifactsDir);
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
    const { list: items } = readJsonList(pl, 'BACKLOG.json', 'items');
    // Case-folded like the bug predicates (FB-SCOPE-BLIND-0724): a hand-written
    // "Closed" must not count as open forever.
    const pipelineOpen = items.filter(i => String(i.status).toLowerCase() !== 'closed').length;
    byPipeline[pl.scope] = pipelineOpen;
    open += pipelineOpen;
  }
  return { open, byPipeline };
}

/**
 * Provenance for an aggregated open-count line (FB-SCOPE-BLIND-0724).
 *
 * The backlog/bugs counts sum ALL pipelines, but the drill-down commands are
 * scope-local — an aggregate over a root-scoped pointer reads as "state didn't
 * update" the moment the open items live in a feature (field: T-Ledger, root
 * backlog fully closed, status kept saying "4 open" from a feature's file while
 * `aitri backlog` said none). When any open item lives outside root, name the
 * scopes and point at the command(s) that can actually see them. Consumers:
 * status render, validate's open-bug warning — every surface that prints an
 * aggregated count next to a drill-down command.
 *
 * @param {Object<string,number>} byScope open count per pipeline scope ('root'|'feature:<name>')
 * @param {string} rootCmd    root-scoped drill-down command
 * @param {string} featureCmd feature-scoped drill-down command with a literal '<name>' slot
 * @returns {{detail: string, run: string}} suffix for the count + the run pointer
 */
export function scopeProvenance(byScope, rootCmd, featureCmd) {
  const open     = Object.entries(byScope || {}).filter(([, n]) => n > 0);
  const features = open.filter(([scope]) => scope !== 'root');
  // All open items in root (or none open at all) — the root pointer is already right.
  if (features.length === 0) return { detail: '', run: rootCmd };

  const name  = ([scope]) => scope === 'root' ? 'root' : scope.slice('feature:'.length);
  // Single scope: the total IS that scope's count — name it without repeating the number.
  const parts = open.length === 1
    ? [name(open[0])]
    : open.map(e => `${name(e)} ${e[1]}`);
  const shown = parts.slice(0, 4).join(' · ') + (parts.length > 4 ? ` · +${parts.length - 4} more` : '');

  const cmds = [];
  if (open.some(([scope]) => scope === 'root')) cmds.push(rootCmd);
  cmds.push(featureCmd.replace('<name>', features.length === 1 ? name(features[0]) : '<name>'));
  return { detail: ` [${shown}]`, run: cmds.join(' · ') };
}

/**
 * Cross-scope open-work counts for the scope-local list commands (FB-SCOPE-BLIND-0724).
 *
 * `aitri backlog` / `aitri bug list` at root read ONE file; printing "no open items"
 * while a feature scope holds open work is a project-wide emptiness claim the command
 * cannot make. This helper lets their empty state say where the open items actually
 * live, from the same aggregation the status snapshot uses (single source — no
 * per-command re-implementation of feature discovery or open predicates).
 *
 * Returns { backlog: {scope: openCount}, bugs: {scope: openCount} } keyed like
 * pipeline scopes ('root' | 'feature:<name>'), or null when the project state is
 * unreadable — callers hint on best effort and MUST degrade silently on null.
 */
export function openWorkByScope(rootDir) {
  try {
    const root = buildPipelineEntry(rootDir, 'root', { tolerateConflict: true });
    if (!root) return null;
    const pipelines = [root, ...discoverFeaturePipelines(rootDir)];
    return {
      backlog: aggregateBacklog(pipelines).byPipeline,
      bugs:    aggregateBugs(pipelines).openByPipeline,
    };
  } catch {
    return null;
  }
}

function computeAudit(rootPipeline, now) {
  // Same resolution as audit.js auditReportPath / artifactPath — empty artifactsDir
  // (legacy root-artifact projects) means the report lives in the project root, not spec/.
  const adir = rootPipeline.artifactsDir || '';
  const auditPath = adir
    ? path.join(rootPipeline.path, adir, 'AUDIT_REPORT.md')
    : path.join(rootPipeline.path, 'AUDIT_REPORT.md');
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
 * Detect changed source files between the recorded reconcile baseline and HEAD.
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
  const baseline = rootPipeline?.reconcileBaseline;
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
    // execFileSync (no shell) — baseRef comes from committed `.aitri`/reconcile state and must
    // never be interpolated into a shell string (RCE on `aitri resume`; R3-15).
    const out = execFileSync(
      'git', ['diff', `${baseline.baseRef}..HEAD`, '--name-only', '--diff-filter=ACMR'],
      { cwd: rootPipeline.path, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    const files = out
      ? out.split('\n').filter(f =>
          f &&
          !isAitriStatePath(f, rootPipeline) &&
          isBehavioralFile(f))
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
  //
  // Terminal-and-clean exception (STALE-VERIFY-1, Cesar canary 2026-06-13): a
  // pipeline that is all-core-approved, verify-passed, and carries NO drift has
  // evidence that still HOLDS — nothing it tracks changed since the run, so the
  // calendar alone does not make it stale. Re-running verify would reproduce the
  // same result; the nudge was pure noise that kept finished features (and the
  // root) from ever reaching idle. Drift (priority 2) is the real "evidence is
  // outdated" signal; calendar staleness now applies only while a pipeline is
  // still in flux (incomplete, verify not passed, or drifted).
  const staleVerify = [];
  for (const pl of pipelines) {
    if (!pl.verify.ranAt) continue;
    const terminalAndClean =
      pl.allCoreApproved && pl.verify.passed && !pl.phases.some(p => p.drift);
    if (terminalAndClean) continue;
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
  //   - no reconcile pending
  const reasons = [];
  if (!root) {
    reasons.push({ type: 'no_root', message: 'No root pipeline found' });
  } else {
    if (!root.allCoreApproved)              reasons.push({ type: 'phases_pending',   message: 'Not all core phases approved' });
    if (!root.verify.passed)                reasons.push({ type: 'verify_not_passed', message: 'verify-complete has not passed' });
    // Artifact existence (UPLAN-0703 B7): `approved` is a state fact; existence is a disk
    // fact — health must consult BOTH. Without this, deleting an approved artifact left
    // status/resume reporting approved/no-drift/deployable while `validate` said MISSING —
    // two surfaces contradicting on the same disk state (hasDrift returns false on a read
    // error, so drift never caught it). phaseStatus's 'approved' label is deliberately NOT
    // changed — reporting both facts is the fix; conflating them is not.
    const missingApproved = root.phases.filter(p => !p.optional && p.status === 'approved' && !p.exists);
    if (missingApproved.length)
      reasons.push({
        type: 'artifact_missing',
        message: `Approved artifact(s) missing from disk: ${missingApproved.map(p => p.artifact).join(', ')} — restore from git`,
      });
    // Run-binding re-check (UPLAN-0703 B3): `verify.passed` is sticky — it survives a
    // post-run rewrite of 04_TEST_RESULTS.json. When verify has passed, the results file on
    // disk must still match the stamp; a 'mismatch' (edited after the run) or 'missing-file'
    // (deleted) is a hard deploy block that the sticky flag would otherwise hide.
    else if (root.verify.resultsBinding === 'mismatch')
      reasons.push({ type: 'results_tampered', message: '04_TEST_RESULTS.json was edited after the last verify-run (results-hash mismatch) — re-run verify-run' });
    else if (root.verify.resultsBinding === 'missing-file')
      reasons.push({ type: 'results_missing', message: '04_TEST_RESULTS.json is missing from disk though verify passed — restore it or re-run verify-run' });
    if (root.phases.some(p => p.drift))     reasons.push({ type: 'drift',            message: 'One or more approved phases have drifted' });
    if (root.reconcileState === 'pending')  reasons.push({ type: 'reconcile_pending', message: 'Code changes pending classification' });
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

  // Run-binding on terminal features (UPLAN-0703 B3, adversarial-pass follow-up): a feature
  // signed off at 5/5 with verify passed whose results file was edited or deleted AFTER its run
  // is the same "done but broken evidence" class as feature_verify_failed — the sticky flag
  // must not hide it from the root ship decision. `no-stamp` stays non-blocking (legacy scope,
  // same as the root rule above).
  const tamperedTerminalFeatures = pipelines
    .filter(p => p.scopeType === 'feature' && p.allCoreApproved && p.verify.passed &&
                 (p.verify.resultsBinding === 'mismatch' || p.verify.resultsBinding === 'missing-file'))
    .map(p => p.scopeName);
  if (tamperedTerminalFeatures.length) {
    reasons.push({
      type:    'feature_results_tampered',
      message: `Feature(s) at 5/5 whose 04_TEST_RESULTS.json was edited or removed after verify-run: ${tamperedTerminalFeatures.join(', ')} — re-run feature verify-run`,
      features: tamperedTerminalFeatures,
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

/**
 * Is the drifted artifact clean vs git HEAD? Mirrors the approve.js drift hint
 * (A5, alpha.3): `git diff HEAD -- <artifact>` empty means the on-disk content
 * matches the committed state, so the drift is bookkeeping-only (a stale stored
 * hash from a prior Aitri version), NOT a real content edit.
 *
 * Returns true (bookkeeping drift), false (real content change), or null when
 * git is unavailable / not a repo — caller treats null like false (default to
 * the conservative human-review path).
 */
function artifactGitClean(pipelinePath, artifactsDir, artifactFile) {
  const rel = path.join(artifactsDir || '', artifactFile);
  try {
    // An untracked / never-committed artifact shows an EMPTY `git diff HEAD`
    // (git does not diff untracked files) — a false "clean". Require the file to
    // be tracked first, otherwise we would steer un-reviewed content to `rehash`
    // (which re-baselines the hash) instead of human re-approval. ls-files
    // --error-unmatch exits non-zero (throws) when the path is untracked.
    // execFileSync (no shell): `rel` derives from artifactsDir in committed `.aitri`. A shell
    // string + JSON.stringify does NOT stop $(...)/backticks inside double-quotes → RCE (R3-15).
    execFileSync(
      'git', ['ls-files', '--error-unmatch', '--', rel],
      { cwd: pipelinePath, stdio: ['ignore', 'ignore', 'ignore'] },
    );
    const out = execFileSync(
      'git', ['diff', 'HEAD', '--', rel],
      { cwd: pipelinePath, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' },
    ).trim();
    return out.length === 0;
  } catch {
    return null;  // git unavailable OR file untracked — cannot verify; conservative
  }
}

/**
 * Next action for a drifted approved phase (C5a). `approve` is isTTY-gated and
 * hard-blocks an agent, so steering an agent to bare `approve` after drift dead-
 * ends the loop. Resolve by drift kind:
 *   - bookkeeping drift (artifact matches git HEAD) → `rehash`, which IS agent-
 *     runnable and clears the stale hash without cascade re-work.
 *   - real content change (or git unknown) → `approve`, but the reason states it
 *     must run in a human terminal (an agent cannot re-approve after a real edit).
 */
function driftAction(pl, ph) {
  const clean = artifactGitClean(pl.path, pl.artifactsDir, ph.artifact);
  if (clean === true) {
    return {
      command:  pipelineCommand(pl, 'rehash', phaseCommandKey(ph)),
      reason:   `Bookkeeping drift on ${ph.name} (artifact matches git HEAD) — rehash clears the stale hash without cascade`,
      severity: 'warn',
    };
  }
  return {
    command:  pipelineCommand(pl, 'approve', phaseCommandKey(ph)),
    reason:   clean === false
      ? `${ph.name} artifact changed after approval — re-approve in a human terminal (an agent cannot re-approve after drift)`
      : `Drift on ${ph.name} — re-approval required (run in a human terminal; approve is interactive)`,
    severity: 'warn',
  };
}

function nextPhaseAction(pl) {
  // First drift → re-approve / rehash (C5a: kind-aware steering)
  const drifted = pl.phases.find(p => p.drift);
  if (drifted) {
    return driftAction(pl, drifted);
  }
  // Phase 4 approved but verify not run
  const phase4 = pl.phases.find(p => p.key === 4);
  if (phase4 && phase4.status === 'approved' && !pl.verify.passed) {
    // No-op verify-run loop guard (alpha.12): once verify-run has produced a
    // result with 0 passed + 0 failed + ≥1 skipped, re-running it is pointless
    // (same code → same skip-only output). Route to verify-complete, which
    // emits the actionable diagnostic ("All N skipped — at least 1 must pass").
    // Hits any project where Phase 4 was approved with skeleton tests, missing
    // @aitri-tc markers, or a misconfigured runner — not a project-specific fix.
    const last = pl.verify.lastRunSummary;
    // All-manual seed (FB-MULTI-0619 #2): verify-run produced only manual-pending
    // results (no automated pass/fail/skip) — there is no runner to re-run, so don't
    // loop the operator back to verify-run. The next step is human verification.
    // Root AND feature (FEAT-PARITY-0620): `aitri feature tc <name> verify` exists now.
    if (last && last.passed === 0 && last.failed === 0 && last.skipped === 0 && last.manual > 0) {
      return {
        command: pl.scopeType === 'root' ? 'aitri tc verify' : `aitri feature tc ${pl.scopeName} verify`,
        reason:  `${last.manual} manual TC(s) pending — verify each by hand (no automated runner)`,
        severity: 'info',
      };
    }
    if (last && last.passed === 0 && last.failed === 0 && last.skipped > 0) {
      return {
        command: pl.scopeType === 'root' ? 'aitri verify-complete' : `aitri feature verify-complete ${pl.scopeName}`,
        reason:  `verify-run produced 0 passed / ${last.skipped} skipped — verify-complete reports what's missing`,
        severity: 'warn',
      };
    }
    return {
      command: pl.scopeType === 'root' ? 'aitri verify-run' : `aitri feature verify-run ${pl.scopeName}`,
      reason:  'Phase 4 approved — Aitri now re-runs the tests independently (the build report is agent-attested)',
      severity: 'info',
    };
  }
  // First non-approved core phase
  const nextCore = pl.phases.find(p => !p.optional && p.status !== 'approved');
  // ADV-0622-29: when UX is required and Architecture has not been started yet, the
  // next step is the UX phase — agreeing with the `approve requirements` message instead
  // of contradicting it. Steer to the right point in the UX lifecycle (run → complete →
  // approve) so a started-but-unapproved UX phase is not looped back to `run-phase ux`.
  // Only override before Architecture begins; if the operator already started Architecture,
  // fall through to the normal ladder rather than steer backwards.
  if (pl.uxRequired && nextCore && nextCore.num === 2 && nextCore.status === 'not_started') {
    const uxPhase = pl.phases.find(p => p.key === 'ux');
    const uxStatus = uxPhase ? uxPhase.status : 'not_started';
    if (uxStatus === 'completed') {
      return {
        command: pipelineCommand(pl, 'approve', 'ux'),
        reason:  'UX spec complete — approve it before Architecture',
        severity: 'info',
      };
    }
    if (uxStatus === 'in_progress') {
      // A cascade-reset UX phase must be re-derived (run-phase), not merely re-validated.
      const cmd = uxPhase && uxPhase.cascadePending ? 'run-phase' : 'complete';
      return {
        command: pipelineCommand(pl, cmd, 'ux'),
        reason:  cmd === 'run-phase'
          ? 'UX phase reset by an upstream change — re-run it before Architecture'
          : 'UX spec in progress — validate and complete it before Architecture',
        severity: 'info',
      };
    }
    return {
      command: pipelineCommand(pl, 'run-phase', 'ux'),
      reason:  'UX/visual/audio FRs detected — the UX phase must run before Architecture',
      severity: 'info',
    };
  }
  if (nextCore) {
    if (nextCore.status === 'completed') {
      return {
        command: pipelineCommand(pl, 'approve', phaseCommandKey(nextCore)),
        // FB-APPROVE-VERIFY-LEGIBILITY-0715: at phase 4 "approve" reads as final
        // sign-off in the field — state what it is (build-phase review) and what
        // follows (Aitri's independent verify).
        reason:  nextCore.num === 4
          ? 'Build complete — approve the BUILD PHASE (not the product: Aitri re-runs the tests independently after)'
          : `${nextCore.name} awaiting approval`,
        severity: 'info',
      };
    }
    if (nextCore.status === 'in_progress') {
      // C5b: an artifact on disk that was reset by a cascade (real upstream
      // change) must be RE-DERIVED with the new context — `complete` only
      // re-validates and would launder a stale downstream artifact (phase-2
      // validate is structural; it does not cross-check the changed FRs). A
      // genuinely mid-authored phase (never approved) just needs `complete`.
      if (nextCore.cascadePending) {
        return {
          command: pipelineCommand(pl, 'run-phase', phaseCommandKey(nextCore)),
          reason:  `${nextCore.name} reset by an upstream change — re-run with the new context (do not just re-validate)`,
          severity: 'warn',
        };
      }
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

// FEATURE-QUEUE-0722: proposal order for the WORK rungs (P5/P6 phase work, P7
// stale-verify) — root first, then features oldest-first: createdAt ascending with
// scopeName tiebreak, undated features AFTER dated ones by name (the exact rule the
// status Features render uses, so the ladder and the display never disagree on order).
// Deliberately local to the emission loops: reordering the discovery array itself would
// change every snapshot consumer (`--json features[]`/`tests.perPipeline` order, resume
// sections, drift/upgrade rung order) — the verified defect is only WHICH tie wins the
// top proposal, which today falls to readdirSync order: arbitrary AND non-deterministic
// across filesystems, so two clones of the same committed state can propose different
// next actions. createdAt is normalized to string-or-null at buildPipelineEntry.
export function proposalOrder(pipelines) {
  const feats   = pipelines.filter(p => p.scopeType !== 'root');
  const dated   = feats.filter(p => p.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.scopeName.localeCompare(b.scopeName));
  const undated = feats.filter(p => !p.createdAt)
    .sort((a, b) => a.scopeName.localeCompare(b.scopeName));
  return [...pipelines.filter(p => p.scopeType === 'root'), ...dated, ...undated];
}

function computeNextActions(snapshot) {
  const actions = [];
  const { project, pipelines, bugs, audit, health, reconcile } = snapshot;
  const root = pipelines.find(p => p.scopeType === 'root');
  const workOrder = proposalOrder(pipelines);

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

  // Priority 2 — Drift on approved phases (C5a: rehash vs human-terminal approve)
  // Proposal order (FEATURE-QUEUE-0722 adversarial find): a within-priority tie here is
  // the same readdir-nondeterminism class as P5/P6 — two drifted features must propose
  // in the same order on every clone.
  for (const pl of workOrder) {
    for (const ph of pl.phases) {
      if (!ph.drift) continue;
      const da = driftAction(pl, ph);
      actions.push({
        priority: 2,
        scope:    pl.scope,
        command:  da.command,
        reason:   `${da.reason} [${pl.scope}]`,
        severity: da.severity,
      });
    }
  }

  // Priority 2 — Approved artifact missing from disk (B7): same blocker class as drift —
  // the recorded state and the disk disagree. `aitri validate` renders the MISSING detail;
  // the fix is a git restore, which Aitri never performs itself.
  const artifactMissing = (health.deployableReasons || []).find(r => r.type === 'artifact_missing');
  if (artifactMissing) {
    actions.push({
      priority: 2,
      scope:    'root',
      command:  'aitri validate',
      reason:   artifactMissing.message,
      // 'critical' — the documented severity enum is info|warn|critical (STATUS_JSON.md);
      // rc.149 shipped 'blocker' here, an out-of-contract value consumers can't switch on.
      severity: 'critical',
    });
  }

  // Priority 3 — Blocking bugs. The command must reach the scope that holds them
  // (FB-SCOPE-BLIND-0724): blockers only in a feature made this action point at a
  // root `aitri bug list` that showed nothing.
  if (bugs.blocking > 0) {
    const blockingScopes = Object.entries(bugs.blockingByPipeline).filter(([, n]) => n > 0);
    const soleFeature = blockingScopes.length === 1 && blockingScopes[0][0] !== 'root'
      ? blockingScopes[0][0].slice('feature:'.length)
      : null;
    const inScopes = blockingScopes.some(([s]) => s !== 'root') && !soleFeature
      ? ` (in: ${blockingScopes.map(([s]) => s === 'root' ? 'root' : s.slice('feature:'.length)).join(', ')})`
      : '';
    actions.push({
      priority: 3,
      scope:    'project',
      command:  soleFeature ? `aitri feature bug ${soleFeature} list` : 'aitri bug list',
      reason:   `${bugs.blocking} critical/high bug(s) open${inScopes} — resolve before proceeding`,
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
  for (const pl of workOrder) {   // proposal order — same tie rule as every other rung
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

  // Priority 4 — Reconcile pending (root)
  //
  // Suppressed when blocking bugs exist: `aitri reconcile --resolve` refuses to
  // run while `bugs.blocking > 0` (see lib/commands/reconcile.js gate), so
  // suggesting it here is theater — the operator follows the ladder, runs the
  // command, gets rejected, fixes bugs, returns to the ladder, sees reconcile
  // suggested again (visible deadlock). The blocking-bug action already
  // surfaced above at priority 3; reconcile re-emerges automatically once
  // bugs close. See BACKLOG.md "Pre-promotion findings (Codex canary 2026-05-11)"
  // P1 downstream.
  if (bugs.blocking === 0) {
    if (root && root.reconcileState === 'pending') {
      // Pending = `aitri reconcile` already ran (it printed the briefing and set
      // this state). Plain `reconcile` is a fixed point here — re-running it never
      // advances the baseline, so suggesting it is the loop trap. The closer is
      // `--resolve` (or routing fr-changes through the pipeline); --resolve's own
      // TTY gate enforces the refactor/registered classification and blocks
      // fr-change/new-feature, so it is safe to suggest as the next step.
      actions.push({
        priority: 4,
        scope:    'root',
        command:  'aitri reconcile --resolve',
        reason:   'Off-pipeline changes detected — resolve to advance the baseline (refactor/registered), or route any fr-change/new-feature through the pipeline',
        severity: 'warn',
      });
    } else if (reconcile && reconcile.uncountedFiles > 0) {
      // Resolved baseline with freshly-detected changes: classify first via plain
      // `aitri reconcile` (prints the briefing, moves state to pending). The
      // pending branch above then points to --resolve to close.
      actions.push({
        priority: 4,
        scope:    'root',
        command:  'aitri reconcile',
        reason:   `${reconcile.uncountedFiles} file(s) changed outside pipeline since last build approval — classify them`,
        severity: 'warn',
      });
    }
  }

  // Priority 5/6 — Pending phase work (per pipeline, in proposal order — the tie for
  // the top action resolves by root-then-oldest-feature, not directory order)
  for (const pl of workOrder) {
    // Skip re-drift (already emitted at priority 2)
    if (pl.phases.some(p => p.drift)) continue;
    const next = nextPhaseAction(pl);
    if (!next) continue;
    // Verify-run / verify-complete / tc verify (all-manual verify stage) are priority 5;
    // ordinary phase work is priority 6. `tc verify` appears as `aitri tc verify`
    // (root) or `aitri feature tc <name> verify` — match both (tc … verify).
    const isVerify = next.command.includes('verify-run') || next.command.includes('verify-complete')
      || /\btc\b[\s\S]*\bverify\b/.test(next.command);
    actions.push({
      priority: isVerify ? 5 : 6,
      scope:    pl.scope,
      command:  next.command,
      reason:   next.reason,
      severity: next.severity,
    });
  }

  // Priority 7 — Deployable: per-pipeline verify-run | validate checkpoint | idle
  //
  // Terminal-state exception (F11, alpha.2): when the project is deployable
  // AND audit is fresh AND verify is fresh, there is no real next action.
  // No P7 is emitted; `resume`/`status` render their own "idle" message.
  //
  // Refinement (rc.3, Hub canary 2026-05-12): when staleVerify is the only
  // obstruction to terminal, the legacy P7 emitted `aitri validate` — but
  // validate does not refresh verifyRanAt, so the operator entered a stable
  // loop (status → validate → status → validate). The action must resolve the
  // condition that triggered it. Now:
  //   - audit fresh + stale verify  → emit `verify-run` per stale pipeline
  //     (root or feature). Validate is suppressed; running it would not progress.
  //   - audit missing/stale         → emit `validate` (legitimate readiness
  //     checkpoint). P9 also emits `aitri audit`. Stale verify (if any) is
  //     surfaced in the status display warning rather than in the ladder.
  //   - audit fresh + verify fresh  → idle, no P7.
  if (health.deployable) {
    const auditFresh = audit.exists && !health.staleAudit;
    const stalePipelines = health.staleVerify || [];

    if (auditFresh) {
      // Proposal order here too (FEATURE-QUEUE-0722) — same determinism rule as P5/P6.
      for (const pl of workOrder) {
        const sv = stalePipelines.find(s => s.scope === pl.scope);
        if (!sv) continue;
        actions.push({
          priority: 7,
          scope:    pl.scope,
          command:  pl.scopeType === 'root'
            ? 'aitri verify-run'
            : `aitri feature verify-run ${pl.scopeName}`,
          reason:   `verify on ${pl.scope} last ran ${sv.days} days ago — refresh before declaring idle`,
          severity: 'info',
        });
      }
    } else {
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
  // 3.3 #1 (UX-PRO-0707): the "No AUDIT_REPORT.md" nag used to fire from minute zero of an
  // empty project — before there is anything to audit. The evaluative audit only has meaning
  // once the pipeline has produced something (a completed/approved phase), so suppress it
  // until then. Once there IS progress, the missing-audit advisory returns unchanged.
  const anyProgress = !!root && (root.phases || []).some(ph => ph.status === 'completed' || ph.status === 'approved');
  if (!audit.exists) {
    if (anyProgress) {
      actions.push({
        priority: 9,
        scope:    'project',
        command:  'aitri audit',
        reason:   'No AUDIT_REPORT.md — run evaluative audit',
        severity: 'info',
      });
    }
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

  if (!configExists(dir)) {
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
  const reconcile    = detectUncountedChanges(rootPipeline);

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
    reconcile,
  };

  const health      = computeHealth(partial);
  const withHealth  = { ...partial, health };
  const nextActions = computeNextActions(withHealth);

  return { ...withHealth, nextActions };
}

// 2.3 (UX-PRO-0707): a phase-gate rejection must point at the REAL next step, not a
// command that itself fails (verify-run at phase 1 used to say "approve 4" → fails →
// "complete 4" → fails → a 4-hop backwards chain to discover run-phase). This module
// already owns next-action logic (SSoT invariant), so gates read its top action instead
// of duplicating the ladder. Best-effort — any failure returns null and the caller falls
// back to a scope-safe pointer.
export function topNextAction(dir) {
  try {
    return (buildProjectSnapshot(dir).nextActions || [])[0] || null;
  } catch { return null; }
}
