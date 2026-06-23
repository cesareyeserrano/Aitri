/**
 * Migration module: from v0.1.65 (Ultron baseline) toward current.
 *
 * BLOCKING (artifact shape — FEEDBACK A1/A2/F7):
 *   - test_cases[].requirement → test_cases[].requirement_id
 *     phase3.js:81 throws on missing requirement_id. Strongest grounding
 *     for the upgrade protocol.
 *   - non_functional_requirements[].{title, constraint}
 *     → {category, requirement}
 *     snapshot.js tolerates both shapes via fallback (v0.1.90 defensive
 *     layer); migration removes the underlying drift.
 *
 * STATE-MISSING (.aitri field backfills — fields introduced after v0.1.65):
 *   - updatedAt       v0.1.63+
 *   - lastSession     v0.1.70+
 *   - verifyRanAt     v0.1.79+
 *   - auditLastAt     v0.1.79+
 *   - reconcileState  v0.1.80+
 *
 * VALIDATOR-GAP (report-only — fails current phase1.validate(), no auto-fix):
 *   - v0.1.82 title vagueness:       MUST FR whose title matches BROAD_VAGUE
 *                                    and has <2 substantive tokens left.
 *   - v0.1.82 all-vague ACs:         MUST FR whose every AC is vague with no
 *                                    observable metric.
 *   - v0.1.82 duplicate ACs:         FR pairs with ≥3 ACs each and Jaccard
 *                                    similarity ≥0.9.
 *   - alpha.16 venv-relative runner: 04_BUILD_REPORT.json::test_runner
 *                                    starts with `.venv/`, `venv/`, or `env/`
 *                                    (relative path). Pre-alpha.9 cwd was the
 *                                    project root; alpha.9 (`3603a49`) moved
 *                                    feature verify-run cwd to the feature
 *                                    directory, breaking these manifests with
 *                                    `Command not found`. Walks root + every
 *                                    `features/<name>/` manifest.
 *   Aitri cannot auto-rewrite these — re-authoring is content work owned by
 *   the agent. Findings surface in the upgrade report as ⚠️ items.
 *
 * ADR-027 Addendum §2 (shape-only transforms):
 *   - TC.requirement → requirement_id: mechanical rename WHEN value matches
 *     /^FR-\d+$/. Comma-separated or non-canonical values are FLAGGED for
 *     agent review — splitting a multi-FR TC requires semantic choices
 *     (test naming, AC allocation) that belong to the agent.
 *   - NFR.constraint → NFR.requirement: mechanical rename.
 *   - NFR.title → NFR.category: mechanical rename ONLY when title value is a
 *     case-insensitive match of a known category
 *     (Performance|Security|Reliability|Scalability|Usability). Free-text
 *     titles are FLAGGED.
 *   - State backfills only write when the field is missing AND a deterministic
 *     source exists (an event, a file mtime, a git HEAD). No field is set from
 *     content inference.
 *
 * Idempotence: every finding in diagnose() is gated by field/shape presence.
 * Re-running migrate() on a migrated project is a no-op.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { artifactPath, hashArtifact, appendEvent, seedArchiveDir, seedPath as seedPathOf, featuresDir, readArtifactFile } from '../../state.js';
import { PHASE_DEFS } from '../../phases/index.js';
import {
  BROAD_VAGUE as P1_BROAD_VAGUE,
  HAS_METRIC  as P1_HAS_METRIC,
  TITLE_STOP  as P1_TITLE_STOP,
  normalizeAC as P1_NORMALIZE_AC,
} from '../../phases/phase1-checks.js';
import {
  classifyIdeaReferences,
  applyManifestAutoFix,
  phaseForArtifact,
} from '../idea-ref-classifier.js';

export const FROM_VERSION = '0.1.65';

/**
 * If the phase was approved (hash stored in artifactHashes), update the stored
 * hash to match the post-migration content. Preserves the approval across
 * shape-only migrations — §2 guarantees the agent-approved *content* did not
 * change, only the serialization.
 *
 * If the phase was never approved (no stored hash), leave artifactHashes
 * untouched. Stamping a hash for a non-approved phase would synthesize a
 * baseline where none existed.
 *
 * driftPhases[] is deliberately NOT touched. If a phase was already drifted
 * before the upgrade, it stays drifted — the agent decides what to do.
 */
function updatePhaseHashIfApproved(config, phaseKey, newHash) {
  if (!config.artifactHashes) return;
  if (config.artifactHashes[phaseKey] === undefined) return;
  config.artifactHashes[phaseKey] = newHash;
}

const SINGLE_FR_REGEX = /^FR-\d+$/;

const VALID_NFR_CATEGORIES = ['Performance', 'Security', 'Reliability', 'Scalability', 'Usability'];
const CATEGORY_LOOKUP = new Map(VALID_NFR_CATEGORIES.map(c => [c.toLowerCase(), c]));

/**
 * Inspect the project and return drift findings.
 * Pure read — never mutates config or writes artifacts.
 *
 * @param {string} dir
 * @param {object} config
 * @returns {Array<object>} Findings. Each has: { category, target, transform, autoMigratable, reason?, apply? }
 */
export function diagnose(dir, config) {
  return [
    ...diagnoseTestCases(dir, config),
    ...diagnoseNonFunctionalRequirements(dir, config),
    ...diagnoseUpdatedAt(dir, config),
    ...diagnoseLastSession(dir, config),
    ...diagnoseVerifyRanAt(dir, config),
    ...diagnoseAuditLastAt(dir, config),
    ...diagnoseReconcileState(dir, config),
    ...diagnoseRenamedArtifacts(dir, config),
    ...diagnoseArtifactHashes(dir, config),
    ...diagnoseLegacyTestResults(dir, config),
    ...diagnoseLegacyVenvManifest(dir, config),
    ...diagnoseOrphanIdea(dir, config),
    ...diagnosePhase1Vagueness(dir, config),
    ...diagnosePhase1DuplicateACs(dir, config),
  ];
}

/**
 * Apply auto-migratable findings. Writes artifacts and appends
 * `upgrade_migration` events into config.events (persisted by caller).
 *
 * @param {string} dir
 * @param {object} config
 * @param {string} targetVersion CLI VERSION written into events.
 * @returns {{ migrated: object[], flagged: object[] }}
 */
export function migrate(dir, config, targetVersion) {
  const findings = diagnose(dir, config);
  const migrated = [];
  const flagged  = [];

  for (const f of findings) {
    if (f.autoMigratable) {
      f.apply(config);
      appendEvent(config, 'upgrade_migration', 'upgrade', {
        from_version: FROM_VERSION,
        to_version:   targetVersion,
        category:     f.category,
        target:       f.target,
        transform:    f.transform,
        // Artifact writes carry content hashes; state backfills don't.
        ...(f.beforeHash ? { before_hash: f.beforeHash, after_hash: f.afterHash } : {}),
      });
      migrated.push(f);
    } else {
      flagged.push(f);
    }
  }

  return { migrated, flagged };
}

/**
 * Apply a JSON-artifact transform by RE-READING the file at apply time, mutating
 * the freshly-read object, and writing it back — never a diagnose-time snapshot.
 *
 * Why: `migrate()` applies auto-migratable findings sequentially with no re-read
 * between them. Two findings that target the same file (e.g. the NFR rewrite and
 * the orphan-IDEA absorb, both on `01_REQUIREMENTS.json`) each captured a full
 * `afterContent` at diagnose time; the last writer silently reverted the first.
 * Re-reading here makes same-target writes COMPOSE regardless of order. The
 * caller's recorded hashes are recomputed from the actual before/after content
 * so the `upgrade_migration` event matches final disk.
 *
 * `mutate(data)` should be idempotent-safe (guard fields it may have already
 * changed) since it now runs against whatever is currently on disk.
 *
 * @returns {{ beforeHash: string, afterHash: string } | null} null if the file
 *          could not be read/parsed at apply time (leaves it untouched).
 */
function rewriteArtifactInPlace(full, mutate) {
  let currentRaw;
  try {
    currentRaw = fs.readFileSync(full, 'utf8');
    JSON.parse(currentRaw); // validate before mutating
  } catch { return null; }
  const data  = JSON.parse(currentRaw);
  mutate(data);
  const after = JSON.stringify(data, null, 2);
  fs.writeFileSync(full, after, 'utf8');
  return { beforeHash: hashArtifact(currentRaw), afterHash: hashArtifact(after) };
}

// ── TC: requirement → requirement_id ─────────────────────────────────────────

function diagnoseTestCases(dir, config) {
  const rel  = '03_TEST_CASES.json';
  const full = artifactPath(dir, config, rel);
  if (!fs.existsSync(full)) return [];

  let raw, data;
  try {
    raw  = fs.readFileSync(full, 'utf8');
    data = JSON.parse(raw);
  } catch { return []; }

  const tcs = Array.isArray(data.test_cases) ? data.test_cases : [];
  const renamable = [];   // single-FR: mechanical
  const flagOnly  = [];   // multi-FR or non-canonical: flag

  for (let i = 0; i < tcs.length; i++) {
    const tc = tcs[i];
    if (tc.requirement_id) continue;                      // already on new shape
    if (typeof tc.requirement !== 'string') continue;
    const v = tc.requirement.trim();
    if (SINGLE_FR_REGEX.test(v)) renamable.push({ i, value: v });
    else                          flagOnly.push({ i, value: v });
  }

  const findings = [];

  if (renamable.length > 0) {
    const beforeHash = hashArtifact(raw);
    const newData    = JSON.parse(raw);
    for (const { i, value } of renamable) {
      newData.test_cases[i].requirement_id = value;
      delete newData.test_cases[i].requirement;
    }
    const afterContent = JSON.stringify(newData, null, 2);
    const afterHash    = hashArtifact(afterContent);

    findings.push({
      category:       'blocking',
      target:         rel,
      transform:      `rename test_cases[*].requirement → requirement_id (${renamable.length} TC${renamable.length === 1 ? '' : 's'})`,
      autoMigratable: true,
      beforeHash,   // diagnose-time estimate (dry-run preview); recomputed in apply()
      afterHash,
      apply(config) {
        const r = rewriteArtifactInPlace(full, (d) => {
          for (const { i, value } of renamable) {
            if (!Array.isArray(d.test_cases) || !d.test_cases[i]) continue;
            if (d.test_cases[i].requirement_id) continue; // already migrated
            d.test_cases[i].requirement_id = value;
            delete d.test_cases[i].requirement;
          }
        });
        if (!r) return;
        this.beforeHash = r.beforeHash;
        this.afterHash  = r.afterHash;
        updatePhaseHashIfApproved(config, '3', r.afterHash);
      },
    });
  }

  if (flagOnly.length > 0) {
    findings.push({
      category:       'validatorGap',
      target:         rel,
      transform:      `TCs with non-canonical requirement (${flagOnly.length})`,
      autoMigratable: false,
      reason:         'Value is not a single FR id (e.g. comma-separated or malformed). Splitting a multi-FR TC requires semantic choices; agent must re-author these TCs against the current schema.',
    });
  }

  return findings;
}

// ── NFR: {title, constraint} → {category, requirement} ───────────────────────

function diagnoseNonFunctionalRequirements(dir, config) {
  const rel  = '01_REQUIREMENTS.json';
  const full = artifactPath(dir, config, rel);
  if (!fs.existsSync(full)) return [];

  let raw, data;
  try {
    raw  = fs.readFileSync(full, 'utf8');
    data = JSON.parse(raw);
  } catch { return []; }

  const nfrs = Array.isArray(data.non_functional_requirements) ? data.non_functional_requirements : [];

  const constraintIdx   = [];   // has constraint, no requirement   — mechanical
  const titleMatchIdx   = [];   // title matches valid category     — mechanical
  const titleMissingCat = [];   // has title, no category, not a match — flag

  for (let i = 0; i < nfrs.length; i++) {
    const nfr = nfrs[i];
    if (typeof nfr.constraint === 'string' && !nfr.requirement) {
      constraintIdx.push(i);
    }
    if (typeof nfr.title === 'string' && !nfr.category) {
      const canonical = CATEGORY_LOOKUP.get(nfr.title.trim().toLowerCase());
      if (canonical) titleMatchIdx.push({ i, canonical });
      else           titleMissingCat.push(i);
    }
  }

  const findings = [];
  const mechanicalCount = constraintIdx.length + titleMatchIdx.length;

  if (mechanicalCount > 0) {
    const beforeHash = hashArtifact(raw);
    const newData    = JSON.parse(raw);
    for (const i of constraintIdx) {
      newData.non_functional_requirements[i].requirement = newData.non_functional_requirements[i].constraint;
      delete newData.non_functional_requirements[i].constraint;
    }
    for (const { i, canonical } of titleMatchIdx) {
      newData.non_functional_requirements[i].category = canonical;
      delete newData.non_functional_requirements[i].title;
    }
    const afterContent = JSON.stringify(newData, null, 2);
    const afterHash    = hashArtifact(afterContent);

    const parts = [];
    if (constraintIdx.length) parts.push(`constraint → requirement (${constraintIdx.length})`);
    if (titleMatchIdx.length) parts.push(`title → category via lookup (${titleMatchIdx.length})`);

    findings.push({
      category:       'blocking',
      target:         rel,
      transform:      `rewrite non_functional_requirements[*]: ${parts.join(', ')}`,
      autoMigratable: true,
      beforeHash,   // diagnose-time estimate (dry-run preview); recomputed in apply()
      afterHash,
      apply(config) {
        const r = rewriteArtifactInPlace(full, (d) => {
          const arr = Array.isArray(d.non_functional_requirements) ? d.non_functional_requirements : [];
          for (const i of constraintIdx) {
            if (!arr[i] || typeof arr[i].constraint !== 'string' || arr[i].requirement) continue;
            arr[i].requirement = arr[i].constraint;
            delete arr[i].constraint;
          }
          for (const { i, canonical } of titleMatchIdx) {
            if (!arr[i] || arr[i].category) continue;
            arr[i].category = canonical;
            delete arr[i].title;
          }
        });
        if (!r) return;
        this.beforeHash = r.beforeHash;
        this.afterHash  = r.afterHash;
        updatePhaseHashIfApproved(config, '1', r.afterHash);
      },
    });
  }

  if (titleMissingCat.length > 0) {
    findings.push({
      category:       'validatorGap',
      target:         rel,
      transform:      `NFRs with free-text title, no category (${titleMissingCat.length})`,
      autoMigratable: false,
      reason:         `Title value does not match a known category. Current schema requires category ∈ {${VALID_NFR_CATEGORIES.join(', ')}}. Choosing one is semantic — agent must assign per NFR.`,
    });
  }

  return findings;
}

// ── STATE-MISSING: .aitri field backfills ────────────────────────────────────
//
// Each backfill is idempotent by field-presence: if the field already exists,
// diagnose returns nothing. No hashes are recorded because there is no
// artifact write — only a config field is stamped, persisted by saveConfig at
// the end of runUpgrade (ADR-027 Addendum §1: aitriVersion last).

function diagnoseUpdatedAt(_dir, config) {
  if (config.updatedAt) return [];
  return [{
    category:       'stateMissing',
    target:         '.aitri#updatedAt',
    transform:      'backfill updatedAt to current time',
    autoMigratable: true,
    apply: (c) => { c.updatedAt = new Date().toISOString(); },
  }];
}

function diagnoseLastSession(_dir, config) {
  if (config.lastSession) return [];
  const events = Array.isArray(config.events) ? config.events : [];
  const source = [...events].reverse().find(e =>
    ['complete', 'approve', 'approved', 'verify', 'verify-run', 'verify-complete'].includes(e.event)
  );
  if (!source) return [];  // nothing to derive from

  return [{
    category:       'stateMissing',
    target:         '.aitri#lastSession',
    transform:      `backfill lastSession from most recent ${source.event} event`,
    autoMigratable: true,
    apply: (c) => {
      c.lastSession = {
        at:    source.at,
        agent: 'unknown',
        event: source.event,
      };
    },
  }];
}

function diagnoseVerifyRanAt(dir, config) {
  if (config.verifyRanAt) return [];
  if (!config.verifyPassed) return [];  // nothing to backfill against

  const full = artifactPath(dir, config, '04_TEST_RESULTS.json');
  if (!fs.existsSync(full)) return [];

  let mtime;
  try { mtime = fs.statSync(full).mtime.toISOString(); }
  catch { return []; }

  return [{
    category:       'stateMissing',
    target:         '.aitri#verifyRanAt',
    transform:      'backfill verifyRanAt from 04_TEST_RESULTS.json mtime',
    autoMigratable: true,
    apply: (c) => { c.verifyRanAt = mtime; },
  }];
}

function diagnoseAuditLastAt(dir, config) {
  if (config.auditLastAt) return [];

  const full = artifactPath(dir, config, 'AUDIT_REPORT.md');
  if (!fs.existsSync(full)) return [];

  let mtime;
  try { mtime = fs.statSync(full).mtime.toISOString(); }
  catch { return []; }

  return [{
    category:       'stateMissing',
    target:         '.aitri#auditLastAt',
    transform:      'backfill auditLastAt from AUDIT_REPORT.md mtime',
    autoMigratable: true,
    apply: (c) => { c.auditLastAt = mtime; },
  }];
}

// Artifact file renames (rc.41, ADR-042 Phase 2): the build/deploy artifacts were
// renamed. `.aitri` keys artifactHashes by PHASE NUMBER, not filename, so state is
// unaffected — only the on-disk file must move. Content is unchanged, so the
// phase-keyed hash still matches; approvals are preserved.
const RENAMED_ARTIFACTS = [
  ['04_IMPLEMENTATION_MANIFEST.json', '04_BUILD_REPORT.json'],
  ['05_PROOF_OF_COMPLIANCE.json',     '05_TRACEABILITY.json'],
];

function diagnoseRenamedArtifacts(dir, config) {
  const findings = [];
  for (const [oldName, newName] of RENAMED_ARTIFACTS) {
    const oldFull = artifactPath(dir, config, oldName);
    const newFull = artifactPath(dir, config, newName);
    if (fs.existsSync(oldFull) && !fs.existsSync(newFull)) {
      findings.push({
        category:       'artifactRename',
        target:         newName,
        transform:      `rename artifact file ${oldName} → ${newName} on disk (content unchanged)`,
        autoMigratable: true,
        apply: () => { fs.renameSync(oldFull, newFull); },
      });
    }
  }
  return findings;
}

function diagnoseReconcileState(dir, config) {
  // Field rename (rc.40, ADR-042): the off-pipeline baseline was stored as
  // `normalizeState` before `normalize` was renamed to `reconcile`. Preserve the
  // ORIGINAL baseline (baseRef/method) rather than re-stamping a fresh one below.
  if (config.normalizeState && !config.reconcileState) {
    return [{
      category:       'fieldRename',
      target:         '.aitri#reconcileState',
      transform:      'rename .aitri field normalizeState → reconcileState (preserve baseline)',
      autoMigratable: true,
      apply: (c) => { c.reconcileState = c.normalizeState; delete c.normalizeState; },
    }];
  }
  if (config.reconcileState) return [];

  const approved = new Set((config.approvedPhases || []).map(String));
  if (!approved.has('4') && !approved.has('build')) return [];  // only stamp after Phase 4 approval

  // Prefer git HEAD for baseRef; fall back to an ISO timestamp when git is
  // unavailable (per lib/commands/reconcile.js:127 — keep semantics aligned).
  let baseRef;
  let method = 'initial';
  try {
    baseRef = execSync('git rev-parse HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    method = 'git';
  } catch {
    baseRef = new Date().toISOString();
    method  = 'initial';
  }

  return [{
    category:       'stateMissing',
    target:         '.aitri#reconcileState',
    transform:      `stamp reconcileState baseline (method=${method}) — Phase 4 was approved without one`,
    autoMigratable: true,
    apply: (c) => {
      c.reconcileState = {
        baseRef,
        method,
        status:  'resolved',
        lastRun: new Date().toISOString(),
      };
    },
  }];
}

// ── STATE-MISSING: artifactHashes backfill (Z2, alpha.13) ────────────────────
//
// Projects upgraded from pre-alpha schemas have approvedPhases populated but
// artifactHashes absent. Drift detection silently dies in that state — the
// hasDrift() helper has no baseline to compare against, and `aitri rehash`
// refuses with "no stored hash" because the field is empty rather than stale.
//
// The fix: when approvedPhases.length > 0 AND artifactHashes is absent or
// empty, hash each approved artifact on-disk and stamp it. The premise is
// "this on-disk state IS the approved baseline per the operator's prior
// judgment; lock it in now." Drift before the upgrade is invisible (no prior
// baseline existed) — `lib/upgrade/index.js::printReport` surfaces a caveat
// note to the operator whenever any artifactHashes finding is migrated
// (added alpha.18, after the original alpha.13 comment overstated the
// surfacing as already-implemented).
//
// Surfaced by Zombite canary 2026-04-29 (alpha.4 → alpha.12 upgrade). Root
// pipeline had approvedPhases: [5, "discovery", 1, "ux", 2, 3, 4] but no
// artifactHashes — feature `stabilizacion` (created under modern Aitri) had
// hashes correctly. Bug applies to any project that predates artifactHashes
// or somehow lost the field.

function diagnoseArtifactHashes(dir, config) {
  const approved = (config.approvedPhases || []).map(String);
  if (approved.length === 0) return [];

  const existing = config.artifactHashes && Object.keys(config.artifactHashes).length > 0
    ? config.artifactHashes
    : null;

  const findings = [];
  for (const phaseKey of approved) {
    if (existing && existing[phaseKey] !== undefined) continue;

    // PHASE_DEFS keys are mixed type — '1','2',... numbers in code, strings in
    // approvedPhases. Resolve via direct lookup with both forms.
    const def = PHASE_DEFS[phaseKey] || PHASE_DEFS[Number(phaseKey)];
    if (!def || !def.artifact) continue;  // unknown phase key — skip

    const full = artifactPath(dir, config, def.artifact);
    if (!fs.existsSync(full)) continue;  // artifact missing — cannot backfill

    let content;
    try { content = fs.readFileSync(full, 'utf8'); }
    catch { continue; }
    const hash = hashArtifact(content);

    findings.push({
      category:       'stateMissing',
      target:         `.aitri#artifactHashes[${phaseKey}]`,
      transform:      `backfill artifactHashes[${phaseKey}] from on-disk ${def.artifact}`,
      autoMigratable: true,
      apply: (c) => {
        c.artifactHashes = c.artifactHashes || {};
        c.artifactHashes[phaseKey] = hash;
      },
    });
  }

  return findings;
}

// ── VALIDATOR-GAP: legacy 04_TEST_RESULTS.json schema (Z5, alpha.13) ─────────
//
// Pre-alpha format used `suite_summary` (no `summary`) and lacked `results[]`.
// Post-alpha `verify-run` writes `summary` + `results`. A project that ran
// `verify-complete` under the old format has `verifyPassed: true` in `.aitri`
// pointing at an artifact that current readers (snapshot.js, status, validate)
// cannot consume. `aitri review` flags missing TC results, but `validate`
// reports deployable because the deploy-gate reads `.aitri.verifyPassed`.
//
// Fix per backlog Z5 — Option A (flag only). Auto-migration would synthesize
// empty `results[]`, lossy. Surface in the upgrade report; operator runs
// `aitri verify-run` to regenerate. Cross-cuts with Z1 (verifyPassed reset)
// — the next verify-run will then honestly invalidate verifyPassed if the
// regenerated results don't pass.

function diagnoseLegacyTestResults(dir, config) {
  if (!config.verifyPassed) return [];

  const rel  = '04_TEST_RESULTS.json';
  const full = artifactPath(dir, config, rel);
  if (!fs.existsSync(full)) return [];

  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(full, 'utf8')); }
  catch { return []; }

  const hasResults = Array.isArray(parsed.results);
  const hasSummary = parsed.summary && typeof parsed.summary === 'object';
  if (hasResults && hasSummary) return [];  // modern shape

  return [{
    category:       'validatorGap',
    target:         rel,
    transform:      'legacy 04_TEST_RESULTS.json schema (no results[] / summary)',
    autoMigratable: false,
    reason:         'Pre-alpha format detected. `.aitri.verifyPassed` is true but the artifact lacks `results[]` and/or `summary`, so current readers cannot consume it. Run `aitri verify-run` to regenerate the file in the modern schema; the next verify-complete will re-establish the deploy gate against fresh results.',
  }];
}

// ── VALIDATOR-GAP: legacy venv-relative manifest test_runner (N1, alpha.16) ──
//
// Pre-alpha.9 commit 3603a49 changed the verify-run cwd for feature pipelines
// from the project root to the feature directory. Manifests authored before
// that change commonly stored `test_runner: ".venv/bin/pytest …"` (relative
// to the project root). Under feature scope they now resolve against the
// feature dir and fail with `Command not found`, producing a degraded
// 04_TEST_RESULTS.json (0 passed / N skipped) and flipping verifyPassed=false
// per Z1 — even though the runner never actually executed.
//
// Surfaced by Cesar canary 2026-05-02 (alpha.4 → alpha.15, 9 affected feature
// manifests). Fix path locked: VALIDATOR-GAP at upgrade time. Aitri does NOT
// rewrite the manifest — the operator changes the runner. Preferred target is a
// bare `pytest <args>`: verify-run already auto-detects `.venv/`/`venv/` at the
// project root and rewrites the binary (verify.js ~L399), so this stays portable
// across machines and CI. Absolute paths are the fallback only when the venv
// lives outside the root — and the rc.5 guidance warns they are machine-specific.
// Auto-rewriting the manifest would violate ADR-027 §2 (shape transforms only)
// and is fragile across venv layouts (.venv, venv, ~/venvs, poetry, pipenv).
// A `--cwd` flag was rejected: it puts the burden on every verify-run invocation
// and would undo the alpha.9 scoping fix. Caveat (rc.5): the regex matches only
// the binary prefix, so a finding clearing does not prove the runner executes —
// the test target inside the same string can stay broken (BACKLOG: target-path
// detection).
//
// One finding per offending manifest (root + every features/<name>/ manifest)
// so the operator sees exactly which files to edit. Idempotent: a finding
// disappears as soon as the test_runner string no longer matches the regex.

const VENV_RELATIVE_RUNNER = /^\.?venv\/|^env\/|^\.?venv\\|^env\\/;

function readManifestRunner(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return typeof m.test_runner === 'string' ? m.test_runner : null;
  } catch { return null; }
}

// Path arguments in a feature's test_runner that do not resolve under the feature
// directory. Concrete (file-existence) check, not a heuristic: a relative path that
// exists from the project root but not from the feature dir is root-relative and
// breaks under the alpha.9 feature-dir cwd. Skips flags (`-x`), bare binaries (no
// `/`), absolute paths (operator's deliberate choice), and the venv binary prefix
// (covered by VENV_RELATIVE_RUNNER).
function featureRunnerUnreachablePaths(runner, featDir) {
  const out = [];
  for (const token of runner.split(/\s+/)) {
    if (!token || token.startsWith('-')) continue;          // flag
    if (!token.includes('/')) continue;                     // bare binary / non-path
    if (path.isAbsolute(token) || token.startsWith('~')) continue;  // absolute — deliberate
    if (/^\.?venv\/|^env\//.test(token)) continue;          // venv binary — VENV_RELATIVE_RUNNER
    if (/[*?]/.test(token) || token.includes('...')) continue;     // glob / Go `./...` — not a literal path
    if (!fs.existsSync(path.join(featDir, token))) out.push(token);
  }
  return out;
}

function buildVenvFinding(target, runner, unreachable = []) {
  const targetNote = unreachable.length
    ? ` Root-relative test target(s) that will NOT resolve from the feature directory: ${unreachable.join(', ')} — make these relative to the feature dir or absolute.`
    : '';
  return {
    category:       'validatorGap',
    target,
    transform:      `legacy venv-relative test_runner ("${runner}")`,
    autoMigratable: false,
    reason:         `${targetNote ? `${targetNote.trim()} ` : ''}` + 'Pre-alpha.9 manifests stored runner paths relative to the project root. Since alpha.9, `aitri feature verify-run` runs from the feature directory, so a root-relative binary like `.venv/bin/pytest` is no longer reachable and fails with "Command not found" before any test executes. Preferred fix: set `test_runner` to a bare `pytest <args>` — verify-run auto-detects `.venv/` or `venv/` at the project root and rewrites the binary itself, which stays portable across machines and CI. Only when the virtualenv lives elsewhere (`env/`, poetry, pipenv, conda, ~/venvs) fall back to an absolute path, knowing a machine-specific path committed to the manifest will NOT resolve on another clone or in CI. Note: `test_runner` is the full command including the test target — if the target is also root-relative (e.g. `tests/foo.py`) it stays broken under the feature-dir cwd even after the binary is fixed, so run `aitri feature verify-run <name>` to confirm. This finding clearing only means the binary prefix no longer matches — not that the runner executes.',
  };
}

function diagnoseLegacyVenvManifest(dir, config) {
  const findings = [];

  // Root pipeline.
  const rootRel  = '04_BUILD_REPORT.json';
  const rootRunner = readManifestRunner(artifactPath(dir, config, rootRel));
  if (rootRunner && VENV_RELATIVE_RUNNER.test(rootRunner)) {
    findings.push(buildVenvFinding(rootRel, rootRunner));
  }

  // Feature pipelines — read each feature's own .aitri to honour its
  // artifactsDir; default to 'spec' if the feature has no config or the field
  // is absent (matches snapshot.js feature discovery semantics).
  // Layout-aware (ADV-0622-14): contained projects keep features under <layoutRoot>/features;
  // the flat literal silently skipped them, so a post-containment project's broken venv runners
  // went unflagged on upgrade. Use the featuresDir SSoT.
  const featsRoot = featuresDir(dir, config);
  if (!fs.existsSync(featsRoot)) return findings;

  let entries;
  try { entries = fs.readdirSync(featsRoot, { withFileTypes: true }); }
  catch { return findings; }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const featDir = path.join(featsRoot, e.name);

    let featArtifactsDir = 'spec';
    const featCfgPath = path.join(featDir, '.aitri');
    if (fs.existsSync(featCfgPath)) {
      try {
        const fcfg = JSON.parse(fs.readFileSync(featCfgPath, 'utf8'));
        if (typeof fcfg.artifactsDir === 'string') featArtifactsDir = fcfg.artifactsDir;
      } catch { /* malformed — fall back to default */ }
    }

    const featManAbs = path.join(featDir, featArtifactsDir, '04_BUILD_REPORT.json');
    const runner     = readManifestRunner(featManAbs);
    if (!runner) continue;

    // A feature's verify-run executes from the feature dir (alpha.9). Flag BOTH a
    // root-relative binary prefix AND a root-relative test TARGET — the latter
    // (e.g. `pytest tests/foo.py`) stays broken under the feature-dir cwd even after
    // the binary is fixed, and used to clear the finding prematurely (Cesar canary
    // 2026-05-22: agent fixed the binary, "no findings", verify-run still failed).
    const venvBinary  = VENV_RELATIVE_RUNNER.test(runner);
    const unreachable = featureRunnerUnreachablePaths(runner, featDir);
    if (!venvBinary && unreachable.length === 0) continue;

    const rel = path.posix.join(config?.layoutRoot || '', 'features', e.name, featArtifactsDir, '04_BUILD_REPORT.json');
    findings.push(buildVenvFinding(rel, runner, unreachable));
  }

  return findings;
}

// ── BLOCKING: orphan IDEA.md absorption (alpha.17 + alpha.24 + alpha.25) ─────
//
// `aitri approve 1` archives IDEA.md into 01_REQUIREMENTS.json.original_brief
// and unlinks the file (lib/commands/approve.js::archiveIdeaIntoRequirements,
// landed in v0.1.89, commit fa68794). Projects whose Phase 1 was approved
// before v0.1.89 missed that one-shot absorb — IDEA.md survives every
// subsequent `adopt --upgrade` because no migrator touches it.
//
// Two-phase evolution of the safety surface:
//
//   alpha.17 — introduced the auto-absorb migration. No pre-flight scan for
//              downstream references existed; Hub canary later surfaced six
//              artifacts that still pointed at IDEA.md as a path.
//   alpha.24 — added a regex-based pre-flight scan that emits a single
//              validatorGap and blocks the unlink whenever ANY reference
//              exists. Conservative but coarse: frozen historical records
//              (TEST_RESULTS, TRACEABILITY) counted alongside live
//              path pointers, leaving the operator to triage manually.
//   alpha.25 — refines pre-flight into a three-bucket classification (see
//              ADR-031 + lib/upgrade/idea-ref-classifier.js):
//                auto_fixable  → mechanical drop in fields Aitri owns
//                                (manifest::files_created/files_modified/test_files).
//                                Migration applies the drop AND, when narrative
//                                is empty, proceeds with the absorb in the same
//                                run. §2 compliance: removing a structurally
//                                invalid pointer to a file the same migration
//                                is about to delete is shape, not semantics.
//                narrative     → flag for operator. Blocks the absorb until
//                                resolved (preserves alpha.24's safety).
//                frozen        → silently skipped. Modifying immutable
//                                evidence falsifies history.
//
// Auto-fix runs even when narrative blocks absorb — the structural cleanup
// is independently valid and reduces re-run cost.
//
// Cost shape: classify is one pass over rootNames + features/<x>/spec/*; the
// scanner short-circuits via fs.existsSync. Apply touches one file per
// finding. Idempotent — re-running on a migrated project yields zero auto-
// fixable hits because the array elements were dropped.

function buildAutoFixFinding(dir, config, fileRel, refs) {
  const fullPath  = path.join(dir, fileRel);
  const beforeRaw = fs.readFileSync(fullPath, 'utf8');
  const beforeHash = hashArtifact(beforeRaw);
  const afterContent = applyManifestAutoFix(fullPath, refs);
  const afterHash    = hashArtifact(afterContent);
  const phaseKey = phaseForArtifact(fileRel);

  const fieldPathSummary = refs.map(r => r.fieldPath).sort().join(', ');

  return {
    category:       'blocking',
    target:         fileRel,
    transform:      `drop ${refs.length} stale IDEA.md ref(s) from ${fieldPathSummary}`,
    autoMigratable: true,
    beforeHash,
    afterHash,
    apply: (cfg) => {
      fs.writeFileSync(fullPath, afterContent, 'utf8');
      if (phaseKey) updatePhaseHashIfApproved(cfg, phaseKey, afterHash);
    },
  };
}

function buildNarrativeFinding(narrative, mode /* 'preflight' | 'absorbed' */) {
  const files = [...new Set(narrative.map(r => r.file))].sort();

  if (mode === 'preflight') {
    return {
      category:       'validatorGap',
      target:         'IDEA.md',
      transform:      `absorption blocked: ${files.length} artifact(s) reference IDEA.md in narrative content`,
      autoMigratable: false,
      reason:         `IDEA.md is referenced in narrative content (Markdown body, free-form JSON fields, project-extension shapes) inside ${files.length} artifact(s): ${files.join(', ')}. Aitri does not auto-rewrite narrative content because the meaning differs by context (a verification command is not a manifest path; a system design narrative is not a compliance evidence line). Update or remove those references — frozen historical records (04_TEST_RESULTS.json, 05_TRACEABILITY.json) are intentionally not surfaced and need not be touched. Re-run aitri adopt --upgrade after editing. To accept the breakage and proceed without editing, delete IDEA.md manually before upgrading.`,
    };
  }

  if (mode === 'missing') {
    return {
      category:       'validatorGap',
      target:         'IDEA.md (missing)',
      transform:      `${files.length} downstream artifact(s) reference IDEA.md, but no seed exists and original_brief is empty`,
      autoMigratable: false,
      reason:         `IDEA.md no longer exists at the seed location and 01_REQUIREMENTS.json has no original_brief — the seed was likely deleted by hand before absorption. ${files.length} artifact(s) still reference 'IDEA.md' in narrative fields: ${files.join(', ')}. Update those references, or restore the brief content into 01_REQUIREMENTS.json#original_brief by hand.`,
    };
  }

  // absorbed mode — IDEA.md already gone, references stale on disk
  return {
    category:       'validatorGap',
    target:         'IDEA.md (absorbed)',
    transform:      `${files.length} downstream artifact(s) still reference IDEA.md in narrative content`,
    autoMigratable: false,
    reason:         `IDEA.md was absorbed into 01_REQUIREMENTS.json#original_brief in a prior upgrade and no longer exists at the project root. ${files.length} artifact(s) still reference 'IDEA.md' in narrative fields (free-form JSON values, Markdown bodies, project-extension paths): ${files.join(', ')}. Update those references to read from 01_REQUIREMENTS.json#original_brief, or rewrite them to a different documentation file the project owns. Frozen historical records (04_TEST_RESULTS.json, 05_TRACEABILITY.json) are intentionally not surfaced — they are immutable evidence by design.`,
  };
}

function diagnoseOrphanIdea(dir, config) {
  // Layout-aware (rc.82, adversarial review): the live seed sits at the
  // unit's seed location (aitri/product/IDEA.md when contained), NOT the
  // literal project root — the flat-only check permanently skipped the absorb
  // on migrated projects and emitted a false 'already absorbed' diagnostic.
  const ideaPath = seedPathOf(dir, config);
  const ideaExists = fs.existsSync(ideaPath);

  // Phase 1 must already be approved — otherwise the operator hasn't yet
  // committed to the artifact-as-SSoT model and IDEA.md is still a live input.
  const approved = (config.approvedPhases || []).map(String);
  if (!approved.includes('1')) return [];

  const classification = classifyIdeaReferences(dir, config);

  // STALE-REF DETECTION (post-absorption). IDEA.md is gone; surface any
  // narrative references that remain so an already-broken project can fix
  // forward. Frozen records are silently skipped — they are immutable
  // evidence by design (ADR-031).
  if (!ideaExists) {
    if (classification.narrative.length === 0) return [];
    // Only claim prior absorption when original_brief actually exists —
    // otherwise the seed was deleted by hand and the message would be false.
    let hasBrief = false;
    try {
      const reqs = JSON.parse(readArtifactFile(artifactPath(dir, config, '01_REQUIREMENTS.json')));
      hasBrief = typeof reqs.original_brief === 'string' && reqs.original_brief.length > 0;
    } catch { /* unreadable — treat as no brief */ }
    return [buildNarrativeFinding(classification.narrative, hasBrief ? 'absorbed' : 'missing')];
  }

  const reqRel  = '01_REQUIREMENTS.json';
  const reqFull = artifactPath(dir, config, reqRel);
  if (!fs.existsSync(reqFull)) return [];  // no artifact to populate — nothing to do

  let raw, data;
  try {
    raw  = fs.readFileSync(reqFull, 'utf8');
    data = JSON.parse(raw);
  } catch { return []; }

  // Already-populated original_brief is the only ambiguous case: the brief
  // and the on-disk IDEA.md may have diverged. Flag and let the operator
  // decide rather than overwrite silently.
  if (typeof data.original_brief === 'string' && data.original_brief.length > 0) {
    return [{
      category:       'validatorGap',
      target:         'IDEA.md',
      transform:      'orphan IDEA.md present alongside populated original_brief',
      autoMigratable: false,
      reason:         'Phase 1 is approved and 01_REQUIREMENTS.json already carries `original_brief` from a prior approval, but IDEA.md still exists at the project root. The two may have diverged; Aitri will not overwrite the archived brief silently. Compare the contents and delete IDEA.md once you have decided which is authoritative.',
    }];
  }

  const findings = [];

  // (a) Auto-fix per affected file. Each file gets one finding; runUpgrade's
  // migrateAll loop calls apply() per finding so writes are independent.
  const autoByFile = {};
  for (const r of classification.autoFixable) {
    if (!autoByFile[r.file]) autoByFile[r.file] = [];
    autoByFile[r.file].push(r);
  }
  for (const [fileRel, refs] of Object.entries(autoByFile)) {
    findings.push(buildAutoFixFinding(dir, config, fileRel, refs));
  }

  // (b) Narrative remaining → block absorb. Auto-fix findings stay in the
  // returned array — they apply independently and improve the project's
  // structural state regardless of whether the absorb proceeds. The operator
  // re-runs `aitri adopt --upgrade` after editing the narrative refs.
  if (classification.narrative.length > 0) {
    findings.push(buildNarrativeFinding(classification.narrative, 'preflight'));
    return findings;
  }

  // (c) No narrative → safe to absorb in same run.
  let briefContent;
  try { briefContent = fs.readFileSync(ideaPath, 'utf8'); }
  catch { return findings; }

  const newData      = { ...data, original_brief: briefContent };
  const afterContent = JSON.stringify(newData, null, 2);
  const beforeHash   = hashArtifact(raw);
  const afterHash    = hashArtifact(afterContent);

  findings.push({
    category:       'blocking',
    target:         'IDEA.md',
    transform:      'absorb IDEA.md → 01_REQUIREMENTS.json.original_brief, unlink IDEA.md',
    autoMigratable: true,
    beforeHash,   // diagnose-time estimate (dry-run preview); recomputed in apply()
    afterHash,
    apply(cfg) {
      // Re-read at apply time so a prior same-run write to this file (e.g. the
      // NFR rewrite) is preserved — we merge original_brief into current disk,
      // not a diagnose-time snapshot. Only unlink IDEA.md if the write landed,
      // so a re-read failure can never lose the brief.
      const r = rewriteArtifactInPlace(reqFull, (d) => {
        if (!d.original_brief) d.original_brief = briefContent;
      });
      if (!r) return;
      // rc.80 (ADR-050): MOVE the seed to the unit's archive/ instead of
      // deleting — aligned with the approve-time absorption lifecycle.
      const archiveDir = seedArchiveDir(dir, cfg, null);
      fs.mkdirSync(archiveDir, { recursive: true });
      let archDest = path.join(archiveDir, 'IDEA.md');
      if (fs.existsSync(archDest)) {
        archDest = path.join(archiveDir, `IDEA-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
      }
      fs.renameSync(ideaPath, archDest);
      this.beforeHash = r.beforeHash;
      this.afterHash  = r.afterHash;
      updatePhaseHashIfApproved(cfg, '1', r.afterHash);
    },
  });

  return findings;
}

// ── VALIDATOR-GAP: Phase 1 checks introduced in v0.1.82 ──────────────────────
//
// Rules consumed from lib/phases/phase1-checks.js (single source of truth).
// Phase 1's `validate()` throws on the first violation; this reporter walks
// the whole artifact and emits one VALIDATOR-GAP finding per rule with all
// offenders listed — non-destructive, agent decides what to fix.

function readRequirements(dir, config) {
  const full = artifactPath(dir, config, '01_REQUIREMENTS.json');
  if (!fs.existsSync(full)) return null;
  try { return JSON.parse(fs.readFileSync(full, 'utf8')); }
  catch { return null; }
}

function diagnosePhase1Vagueness(dir, config) {
  const data = readRequirements(dir, config);
  if (!data) return [];

  const frs = Array.isArray(data.functional_requirements) ? data.functional_requirements : [];
  const mustFRs = frs.filter(fr => fr.priority === 'MUST');

  const offenders = [];

  for (const fr of mustFRs) {
    // Title vagueness.
    const title = fr.title || '';
    if (P1_BROAD_VAGUE.test(title)) {
      const substantive = title
        .replace(/\[ASSUMPTION[^\]]*\]/gi, ' ')
        .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/gi, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !P1_TITLE_STOP.test(t) && !P1_BROAD_VAGUE.test(t));
      if (substantive.length < 2) {
        offenders.push({ id: fr.id, kind: 'title', sample: title });
        continue;  // don't double-flag the same FR
      }
    }
    // All-vague ACs.
    const acs = fr.acceptance_criteria || [];
    if (acs.length > 0 && acs.every(c => P1_BROAD_VAGUE.test(c) && !P1_HAS_METRIC.test(c))) {
      offenders.push({ id: fr.id, kind: 'acs', sample: acs[0] });
    }
  }

  if (offenders.length === 0) return [];

  const summary = offenders.map(o => `${o.id} (${o.kind})`).join(', ');
  return [{
    category:       'validatorGap',
    target:         '01_REQUIREMENTS.json',
    transform:      `MUST FRs failing v0.1.82 vagueness check (${offenders.length}): ${summary}`,
    autoMigratable: false,
    reason:         'Title or acceptance_criteria match BROAD_VAGUE without a concrete behavior or metric. Rewriting vague requirements is content work — agent must re-author the listed FRs against the current Phase 1 briefing.',
  }];
}

function diagnosePhase1DuplicateACs(dir, config) {
  const data = readRequirements(dir, config);
  if (!data) return [];

  const frs = Array.isArray(data.functional_requirements) ? data.functional_requirements : [];
  const richFRs = frs.filter(fr => (fr.acceptance_criteria || []).length >= 3);
  const pairs = [];

  for (let i = 0; i < richFRs.length; i++) {
    const a = new Set((richFRs[i].acceptance_criteria || []).map(P1_NORMALIZE_AC).filter(Boolean));
    for (let j = i + 1; j < richFRs.length; j++) {
      const b = new Set((richFRs[j].acceptance_criteria || []).map(P1_NORMALIZE_AC).filter(Boolean));
      if (a.size === 0 || b.size === 0) continue;
      const intersection = [...a].filter(x => b.has(x));
      const unionSize = new Set([...a, ...b]).size;
      const jaccard = intersection.length / unionSize;
      if (jaccard >= 0.9) {
        pairs.push({ a: richFRs[i].id, b: richFRs[j].id, pct: Math.round(jaccard * 100) });
      }
    }
  }

  if (pairs.length === 0) return [];

  const summary = pairs.map(p => `${p.a}↔${p.b} (${p.pct}%)`).join(', ');
  return [{
    category:       'validatorGap',
    target:         '01_REQUIREMENTS.json',
    transform:      `FR pairs with duplicate acceptance_criteria (${pairs.length}): ${summary}`,
    autoMigratable: false,
    reason:         'v0.1.82 requires FRs with ≥3 ACs to differ (Jaccard similarity <0.9). Copy-pasted ACs indicate the FRs are not semantically differentiated — merge them or rewrite ACs to capture distinct behavior.',
  }];
}
