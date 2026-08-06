# `aitri status --json` — Machine-Readable Project Snapshot

**Aitri version:** v2.2.0-rc.8+
**Stability:** Additive-only. Legacy fields (used by Hub pre-v0.1.77) preserved indefinitely.
**Scope:** Single-machine CLI consumers. For remote (GitHub-URL) consumers, use `.aitri` + `spec/` directly per [SCHEMA.md](./SCHEMA.md) / [ARTIFACTS.md](./ARTIFACTS.md).

---

## Purpose

`aitri status --json` emits a **derived projection** of the current project — root pipeline plus any feature sub-pipelines at `features/<name>/.aitri`, with aggregated health signals and a priority-ordered next-action list.

It is the single surface that powers the CLI's `status`, `resume`, and `validate` commands. Subproducts running colocated with the Aitri CLI (local dashboards, IDE plugins) may consume it directly instead of re-deriving aggregation logic.

**Subproducts consuming projects remotely (Hub pulling from GitHub) must continue to read the raw `.aitri` + artifact files.** This surface is not reachable without the `aitri` binary on PATH.

---

## Invocation

```sh
aitri status --json
```

Exit code: `0` on success (even when the project has drift or blocking bugs — health signals are in the payload, not the exit code). Non-zero when `dir` is not an Aitri project, or when the root `.aitri` is unreadable (malformed or merge-conflicted — the refuse-don't-reset rule, v2.0.0-rc.149+).

---

## Top-level shape

```jsonc
{
  // ── Legacy fields (stable since v0.1.64; Hub contract) ───────────────────
  "project": "string",                 // project name (from .aitri)
  "dir": "string",                     // absolute path
  "aitriVersion": "string | null",     // version stamped on the project
  "cliVersion": "string",              // version of the CLI invoking status
  "versionMismatch": boolean,
  "phases": [ /* legacy phase array — see "phases" below */ ],
  "driftPhases": [ /* keys of drifted phases on root */ ],
  "nextAction": "string | null",       // single command — first nextActions[] entry
  "allComplete": boolean,              // all 5 core phases approved on root
  "inHub": boolean,                    // project appears in ~/.aitri-hub/projects.json
  "rejections": { "<phase>": { "at": "ISO", "feedback": "string" } },

  // ── Snapshot-derived extensions (v0.1.77+) ───────────────────────────────
  "snapshotVersion": 1,
  // lastSession (additive, v2.0.0-rc.161+, HUB-CATCHUP-0705): the root pipeline's
  // last session marker — { "at": "ISO", "agent": "string|null", "event": "string",
  // "files_touched"?: [...], "context"?: "string" } — or null when absent.
  // It lives in per-machine .aitri.local; this field is how a SAME-MACHINE consumer
  // (Hub local collector) reads it without touching .aitri.local directly (which
  // SCHEMA.md discourages). Remote consumers: the field reflects the machine that
  // ran the command, never a teammate's session.
  "lastSession": { "at": "ISO", "agent": "string | null", "event": "string" } /* | null */,
  // release (additive, v2.1.0-rc.9+, RELEASE-VERSION-0722): the sealed release identity
  // from 05_TRACEABILITY.json — first consumer of its previously write-only `version`.
  // Present ONLY while phase 5 is APPROVED (a cascade reset un-seals it → null even if
  // the artifact remains on disk); also null when the artifact is absent/malformed.
  // version_source is "manifest" | "team" | "assumed" (null when undeclared).
  // Display-informational, never a gate. The cross-cycle record is .aitri#releaseHistory.
  "release": { "version": "string", "version_source": "string | null" } /* | null */,
  "features": [ /* per-feature summaries — see "features" below */ ],
  // buildPlan (additive, v2.1.0-rc.2+, PLAN-ARTIFACT-0715): advisory epic progress read
  // tolerantly from the ROOT pipeline's BUILD_PLAN.md while Phase 4 is AUTHORIZED (Phase 3
  // approved, Phase 4 not yet approved — the build need not have started; with no
  // BUILD_PLAN.md yet it is null). null otherwise (build not authorized, or the plan is absent /
  // pre-rc.170 free-form / unparseable — tolerant silence by design). DISPLAY-ONLY:
  // BUILD_PLAN.md is an agent-maintained working file (ARTIFACTS.md working-files class,
  // "do NOT treat it as a contract") — a consumer may render this as build progress but
  // MUST NOT gate, verify, or compute compliance from it.
  "buildPlan": { "epics": [ { "id": "EP-01", "title": "string", "status": "pending | in-progress | done | <other, tolerated>" } ], "summary": "string" } /* | null */,
  "bugs":    { "total": N, "open": N, "blocking": N, "bySeverity": { "critical": N, "high": N, "medium": N, "low": N }, "openIds": ["BG-001", "..."], "parseErrors": ["root" /* | "feature:<name>" */] },
  // bugs.parseErrors (additive, v2.0.0-rc.158+): scopes whose BUGS.json EXISTS but failed to
  // parse. Their bugs are INVISIBLE to every counter above (the snapshot degrades by design,
  // rc.149 — the verify/reconcile/validate --ci GATES refuse instead). Non-empty parseErrors
  // means the bug counters (and any deployable verdict built on them) cannot be trusted for
  // those scopes — a consumer MUST surface this rather than render "0 bugs". [] when clean.
  "backlog": { "open": N },
  "audit":   { "exists": bool, "stalenessDays": N | null },
  "tests":   { /* see "tests" below — v0.1.81+ */ },
  "reconcile": { /* see "reconcile" below */ },
  "health":  { /* see "health" below */ },
  "nextActions": [ /* ordered actions — see "nextActions" below */ ]
}
```

---

## `phases[]` (legacy)

Root pipeline phase list. One entry per phase, plus a synthetic `"verify"` entry inserted after phase 4 when phase 4 is approved or verify has passed. Optional phases (`discovery`, `ux`, `review`) appear with **string** keys, and only when their artifact exists or the phase is tracked — `driftPhases[]` can therefore carry those strings too.

```jsonc
{
  "key": 1,                            // number for core phases; string for optional phases; "verify" for the synthetic entry
  "name": "Requirements",
  "artifact": "01_REQUIREMENTS.json",
  "optional": false,
  "exists": true,
  "status": "not_started | in_progress | completed | approved",
  "drift": false
}
```

The `"verify"` entry uses `status: "passed" | "not_run"` and may include a `verifySummary` field — the summary persisted in `.aitri#verifySummary` at verify time, NOT re-read from the results file (it matches the file's `#summary` unless the file was edited after the run — exactly the case `resultsBinding: "mismatch"` flags; canonical shape in [ARTIFACTS.md](./ARTIFACTS.md): `total`, `passed`, `failed`, `skipped`, `skipped_e2e`, `skipped_no_marker`, `manual`, `manual_verified`). Its `drift` is `true` when the results file on disk no longer matches the run-binding stamp (v2.0.0-rc.148+ — previously hardcoded `false`). It also carries an additive `resultsBinding` field: `"bound" | "mismatch" | "no-stamp" | "missing-file"` — the run-binding state of `04_TEST_RESULTS.json` vs `.aitri#verifyResultsHash`. **v2.2.0-rc.7+ (additive, ADR-085):** it also carries `refState`: `"fresh" | "stale" | "dirty" | "unreachable" | "unbound"` — the verdict's binding to the code TREE it certified (`stale`/`unreachable` are deploy-blocking: behavioral code changed since the run, or the certified commit is gone from history; `dirty` = ran over uncommitted code, non-portable warn; `unbound` = non-git project or pre-rc.7 stamp, no gate effect). Consumers MUST NOT treat `status: "passed"` alone as deployable — the deploy gate already folds `refState` into `health.deployable`/`deploy reasons` (`verify_stale_ref`, `verify_ref_unreachable`). `status` stays `"passed"` even on a `"mismatch"` (the flag is sticky); read `drift`/`resultsBinding` for the current disk truth (v2.0.0-rc.148+).

---

## `features[]`

One entry per feature sub-pipeline discovered under
`<layoutRoot>/features/<name>/.aitri` — `aitri/features/` for contained
projects (rc.76+, see `layoutRoot` in [SCHEMA.md](./SCHEMA.md)), `features/`
for legacy flat ones. The `path` field is absolute either way — prefer it over
reconstructing the location.

```jsonc
{
  "name": "string",                    // feature directory name
  "path": "string",                    // absolute path
  "aitriVersion": "string | null",
  "approvedCount": N,                  // count of non-optional approved phases
  "allCoreApproved": boolean,
  "verifyPassed": boolean,
  "driftPresent": boolean,
  "nextPhase": N | null,               // first non-approved core phase key, or null
  "createdAt": "ISO string | null"     // additive v2.2.0-rc.2+ (FEATURE-ORDER-0729): feature
                                       // creation timestamp from the feature's .aitri; null on
                                       // features created before createdAt existed. Lets
                                       // consumers render creation order / a feature timeline
}
```

---

## `health`

Deploy-gate reasoning and global signals.

```jsonc
{
  "deployable": boolean,               // true only when all gates below pass
  "deployableReasons": [               // populated when deployable=false
    { "type": "string", "message": "string" }
  ],
  "staleAudit": boolean,               // AUDIT_REPORT.md older than 60 days
  "blockedByBugs": boolean,            // any critical/high open bug
  "activeFeatures": N,                 // features with unfinished work
  "versionMismatch": boolean,
  "driftPresent": [ { "scope": "root | feature:<name>", "phase": "<alias-or-key>" } ],
  "staleVerify": [ { "scope": "root | feature:<name>", "days": N } ]  // verifyRanAt > 14 days AND pipeline still in flux (see note)
}
```

`staleVerify` lists pipelines whose `verifyRanAt` is older than 14 days **and** that are still in flux — i.e. NOT (all core phases approved AND verify passed AND no drift). A terminal-and-clean pipeline (finished feature or shipped root) is excluded regardless of calendar age: nothing it tracks has changed since the run, so its evidence still holds and re-verifying would only reproduce the same result. Drift is reported separately via `driftPresent` and is the real "evidence is outdated" signal (v2.0.0-rc.84+, STALE-VERIFY-1). This keeps finished work from blocking the project's idle state.

Deploy-gate reason types: `no_root`, `phases_pending`, `verify_not_passed`, `drift`, `reconcile_pending`, `blocking_bugs`, `version_mismatch`, `feature_verify_failed` (v0.1.87+), `results_tampered`, `results_missing`, `feature_results_tampered` (v2.0.0-rc.148+), `artifact_missing` (v2.0.0-rc.149+ — an approved core phase's artifact is absent from disk; approval is a state fact, existence is a disk fact, and the gate now consults both). `results_tampered`/`results_missing` fire when the root's `verifyPassed` is sticky-true but the results file on disk no longer matches its run-binding stamp (edited after the run) or is gone — the deploy gate no longer trusts the sticky flag alone. `feature_results_tampered` is the same check on terminal features (5/5, verify passed) whose results file was edited or removed after its run.

The `feature_verify_failed` and `feature_results_tampered` reasons carry an additional `features: string[]` field listing the affected feature names at phases 5/5. WIP features (phases < 5/5) do not trigger these reasons — by design, a feature still in progress must not block root deploy.

---

## `tests` (v0.1.81+)

Aggregated test counts across root + all feature sub-pipelines. Each pipeline's own `verify.summary` is preserved unchanged for legacy readers; `tests` adds a cross-pipeline projection so Hub-style consumers don't need to re-implement the aggregation.

```jsonc
{
  "totals": {                            // sum across pipelines that have a verify.summary
    "passed":  N,
    "failed":  N,
    "skipped": N,
    "manual":  N,
    "total":   N
  },
  "perPipeline": [                       // one entry per pipeline (root + features)
    {
      "scope":  "root | feature:<name>",
      "passed": N | null,                // null when verify has not run on this pipeline
      "failed": N | null,
      "total":  N | null,
      "ran":    boolean,                 // true when this pipeline has a verify.summary
      // Additive (v2.0.0-rc.161+, HUB-CATCHUP-0705). Sourced from the pipeline's
      // 04_TEST_RESULTS.json ON DISK; null when the file is absent, unparseable, or
      // the field was not written (no gates declared, no structured ACs). The fields
      // themselves predate rc.161 — results files from older verify-runs emit them too.
      // Cross-check the verify entry's `resultsBinding` before trusting these on a
      // drifted pipeline: a post-run rewrite of the results file changes them while
      // the stamped counts (passed/failed/total) stay.
      "quality_gates": [                 // projection — command strings + captured output stay in the artifact
        { "name": "string | null", "status": "pass | fail | error | null", "required": boolean,
          "threshold": N /* coverage gates only */, "measured": N /* coverage gates only */ }
      ] /* | null */,
      "ac_coverage": [                   // pass-through, unchanged from the artifact (ARTIFACTS.md shape)
        { "ac_id": "AC-001", "fr_id": "FR-001", "tests_passing": N, "tests_failing": N,
          "tests_skipped": N, "tests_manual": N, "status": "covered | partial | uncovered | untested" }
      ] /* | null */
    }
  ],
  "stalenessDays": N | null              // days since root pipeline's verifyRanAt (null until v0.1.79+ has run verify-run)
}
```

Semantics:
- `totals.total === 0` when no pipeline has run verify yet. Consumers should treat `totals` as a floor, not a truth — pipelines without verify contribute zero.
- `perPipeline[].ran === false` identifies pipelines whose tests have not been executed at all.
- `perPipeline[].quality_gates` / `ac_coverage` are `null` (never `[]`) when the underlying results file does not carry them — a consumer can distinguish "no data" (`null`) from "ran with zero entries" (`[]`).
- The CLI's text `status` and `resume` views surface `totals` as a `Σ all pipelines` line when at least one feature has a verify summary — Hub-style consumers can mirror that.

---

## `reconcile`

Reflects the off-pipeline code-change baseline recorded when build (phase 4) is approved, plus a snapshot-time detection of changes since that baseline.

```jsonc
{
  "state":          "pending | resolved | null",  // verbatim from .aitri reconcileState.status
  "method":         "git | mtime | null",         // detection method recorded at baseline
  "baseRef":        "string | null",              // git SHA or ISO timestamp at baseline
  "uncountedFiles": N | null                      // off-pipeline source files since baseRef
}
```

Semantics of `uncountedFiles`:
- `null` when no baseline exists, the baseline is `mtime` (skipped to keep snapshot cheap), `state === 'pending'` (already known, no need to re-count), or git failed.
- `0` when the git baseline matches HEAD, **or** when every changed file matches the non-behavioral allowlist (build manifests, docs, dotfiles, CI configs, generated assets — see [exclusions](#allowlist) below).
- `N > 0` when N **behavioral** files (excluding `spec/`, `.aitri`, `node_modules/`, plus the allowlist) have changed since the recorded baseline. Surfaces `aitri reconcile` as a priority-4 next-action with reason `"N file(s) changed outside pipeline since last build approval"`.

### Allowlist

Since v2.0.0-alpha.4, the off-pipeline drift detector treats the following file patterns as **non-behavioral** — they are not counted in `uncountedFiles` and do not trigger the priority-4 reconcile next-action. Single source of truth: `lib/reconcile-patterns.js::isBehavioralFile()`.

- **Build / dependency manifests:** `go.mod`, `go.sum`, `package.json`, `package-lock.json`, `yarn.lock`, `Cargo.toml`, `Cargo.lock`, `Pipfile`, `Pipfile.lock`, `poetry.lock`, `pyproject.toml`, `Gemfile`, `Gemfile.lock`, `composer.lock`, `pom.xml`, `build.gradle`, any `*.lock`.
- **Documentation:** `*.md`, `*.markdown`, `*.rst`, `*.txt`, `*.adoc`, plus the variants `README*`, `LICENSE*`, `LICENCE*`, `AUTHORS*`, `NOTICE*`, `CONTRIBUTING*`, `CHANGELOG*`, `CODE_OF_CONDUCT*`, `SECURITY*`, `MAINTAINERS*`.
- **Dotfiles / config:** `.env`, `.env.*`, `.gitignore`, `.gitattributes`, `.dockerignore`, `.editorconfig`, `.npmrc`, `.nvmrc`, `.node-version`, `.python-version`, `.ruby-version`.
- **CI / infra:** `Dockerfile*`, `docker-compose*.yml/yaml`, `Makefile*`, `GNUmakefile`, `.github/**`, `.gitlab/**`, `.circleci/**`, `ci/**`, `.travis.yml`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `cloudbuild.yaml`.
- **Generated assets:** `**/*.min.js`, `**/*.min.css`, `**/*.bundle.js`, `**/*.bundle.css`, `**/*.map`, anything inside `/dist/`, `/build/`, `/.next/`, `/.nuxt/`, `/out/`.

**Subproduct guidance:** consumers reading `uncountedFiles` will see lower counts on projects with documentation/build-manifest churn after upgrading to v2.0.0-alpha.4 — this is the contract change shipping with that release. No reader behavior changes; the count is more accurate.

---

## `nextActions[]`

Priority-ordered list of suggested commands. Priority is a stable small integer — subproducts can safely sort, filter, or show the top-N.

```jsonc
{
  "priority": 1,                       // 1 = most urgent
  "scope":    "root | project | feature:<name>",
  "command":  "aitri <verb> <args>",
  "reason":   "string",                // human-readable explanation
  "severity": "info | warn | critical"
}
```

### Priority ladder

| Priority | Trigger |
|---:|---|
| 1 | Version mismatch or missing `aitriVersion` |
| 2 | Drift on an approved phase (any pipeline), **or** an approved core artifact missing from disk (`artifact_missing`, v2.0.0-rc.149+ — emits `aitri validate` with severity `critical`) |
| 3 | One or more critical/high bugs open, **or** unresolved upgrade findings (`upgradeFindings[]` non-empty on any pipeline — artifacts need agent re-authoring) |
| 4 | `reconcileState.status === 'pending'` on root, **or** `reconcile.uncountedFiles > 0` (off-pipeline source changes detected at snapshot time). **Suppressed while any critical/high bug is open** — `reconcile --resolve` refuses under blocking bugs, so the ladder directs to priority 3 first |
| 5 | Phase 4 approved but verify not yet passed (any pipeline) |
| 6 | Pending phase work (any pipeline) |
| 7 | All approved + verify passed: `aitri validate` (deploy-readiness confirmation) when the audit is missing/stale, **or** per-pipeline `verify-run` refresh suggestions when the audit is fresh but a pipeline's verify is stale (>14 days) |
| 9 | Audit missing or stale (>60 days) |

A priority can emit more than one action (e.g. several stale pipelines at 7). Consumers should treat the `reason` string as display text, not parse it — the stable fields are `priority`, `scope`, `command`, `severity`.

---

## Versioning

`snapshotVersion` is an integer that bumps when the shape of the snapshot-derived extensions changes in a **breaking** way (field removed, type narrowed, semantic change). Additive changes do not bump `snapshotVersion`.

Legacy fields are governed by [CHANGELOG.md](./CHANGELOG.md) entries, not by `snapshotVersion`.

---

## Known gaps

- `audit.lastAt` falls back to file `mtime` only when `auditLastAt` is absent in `.aitri` (legacy projects or audits written without persistence). Projects on v0.1.79+ that have re-run `aitri audit` use the persisted timestamp, which survives git clone.
- `tests.stalenessDays` is `null` until the root pipeline has run `aitri verify-run` at least once on v0.1.79+ (no retroactive backfill).
- `tests.totals` only counts pipelines that have a `verify.summary` persisted. A feature whose tests have never run contributes zero — it does not show as missing.
