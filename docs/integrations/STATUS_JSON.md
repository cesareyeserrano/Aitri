# `aitri status --json` — Machine-Readable Project Snapshot

**Aitri version:** v2.0.0-alpha.4+
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

Exit code: `0` on success (even when the project has drift or blocking bugs — health signals are in the payload, not the exit code). Non-zero only when `dir` is not an Aitri project.

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
  "features": [ /* per-feature summaries — see "features" below */ ],
  "bugs":    { "total": N, "open": N, "blocking": N },
  "backlog": { "open": N },
  "audit":   { "exists": bool, "stalenessDays": N | null },
  "tests":   { /* see "tests" below — v0.1.81+ */ },
  "normalize": { /* see "normalize" below */ },
  "health":  { /* see "health" below */ },
  "nextActions": [ /* ordered actions — see "nextActions" below */ ]
}
```

---

## `phases[]` (legacy)

Root pipeline phase list. One entry per phase, plus a synthetic `"verify"` entry inserted after phase 4 when phase 4 is approved or verify has passed.

```jsonc
{
  "key": 1,                            // number for core phases; "verify" for the synthetic entry
  "name": "Requirements",
  "artifact": "01_REQUIREMENTS.json",
  "optional": false,
  "exists": true,
  "status": "not_started | in_progress | completed | approved",
  "drift": false
}
```

The `"verify"` entry uses `status: "passed" | "not_run"` and may include a `verifySummary: { passed, total, failed, skipped, manual_verified }` field.

---

## `features[]`

One entry per feature sub-pipeline discovered under `features/<name>/.aitri`.

```jsonc
{
  "name": "string",                    // feature directory name
  "path": "string",                    // absolute path
  "aitriVersion": "string | null",
  "approvedCount": N,                  // count of non-optional approved phases
  "allCoreApproved": boolean,
  "verifyPassed": boolean,
  "driftPresent": boolean,
  "nextPhase": N | null                // first non-approved core phase key, or null
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
  "staleVerify": [ { "scope": "root | feature:<name>", "days": N } ]  // verifyRanAt > 14 days
}
```

Deploy-gate reason types: `no_root`, `phases_pending`, `verify_not_passed`, `drift`, `normalize_pending`, `blocking_bugs`, `version_mismatch`, `feature_verify_failed` (v0.1.87+).

The `feature_verify_failed` reason carries an additional `features: string[]` field listing the feature names at phases 5/5 whose verify ran and did not pass. WIP features (phases < 5/5) do not trigger this reason — by design, a feature still in progress must not block root deploy.

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
      "ran":    boolean                  // true when this pipeline has a verify.summary
    }
  ],
  "stalenessDays": N | null              // days since root pipeline's verifyRanAt (null until v0.1.79+ has run verify-run)
}
```

Semantics:
- `totals.total === 0` when no pipeline has run verify yet. Consumers should treat `totals` as a floor, not a truth — pipelines without verify contribute zero.
- `perPipeline[].ran === false` identifies pipelines whose tests have not been executed at all.
- The CLI's text `status` and `resume` views surface `totals` as a `Σ all pipelines` line when at least one feature has a verify summary — Hub-style consumers can mirror that.

---

## `normalize`

Reflects the off-pipeline code-change baseline recorded when build (phase 4) is approved, plus a snapshot-time detection of changes since that baseline.

```jsonc
{
  "state":          "pending | resolved | null",  // verbatim from .aitri normalizeState.status
  "method":         "git | mtime | null",         // detection method recorded at baseline
  "baseRef":        "string | null",              // git SHA or ISO timestamp at baseline
  "uncountedFiles": N | null                      // off-pipeline source files since baseRef
}
```

Semantics of `uncountedFiles`:
- `null` when no baseline exists, the baseline is `mtime` (skipped to keep snapshot cheap), `state === 'pending'` (already known, no need to re-count), or git failed.
- `0` when the git baseline matches HEAD, **or** when every changed file matches the non-behavioral allowlist (build manifests, docs, dotfiles, CI configs, generated assets — see [exclusions](#allowlist) below).
- `N > 0` when N **behavioral** files (excluding `spec/`, `.aitri`, `node_modules/`, plus the allowlist) have changed since the recorded baseline. Surfaces `aitri normalize` as a priority-4 next-action with reason `"N file(s) changed outside pipeline since last build approval"`.

### Allowlist

Since v2.0.0-alpha.4, the off-pipeline drift detector treats the following file patterns as **non-behavioral** — they are not counted in `uncountedFiles` and do not trigger the priority-4 normalize next-action. Single source of truth: `lib/normalize-patterns.js::isBehavioralFile()`.

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
| 2 | Drift on an approved phase (any pipeline) |
| 3 | One or more critical/high bugs open |
| 4 | `normalizeState.status === 'pending'` on root, **or** `normalize.uncountedFiles > 0` (off-pipeline source changes detected at snapshot time) |
| 5 | Phase 4 approved but verify not yet passed (any pipeline) |
| 6 | Pending phase work (any pipeline) |
| 7 | Deployable → `aitri validate` |
| 9 | Audit missing or stale (>60 days) |

---

## Versioning

`snapshotVersion` is an integer that bumps when the shape of the snapshot-derived extensions changes in a **breaking** way (field removed, type narrowed, semantic change). Additive changes do not bump `snapshotVersion`.

Legacy fields are governed by [CHANGELOG.md](./CHANGELOG.md) entries, not by `snapshotVersion`.

---

## Known gaps

- `audit.lastAt` falls back to file `mtime` only when `auditLastAt` is absent in `.aitri` (legacy projects or audits written without persistence). Projects on v0.1.79+ that have re-run `aitri audit` use the persisted timestamp, which survives git clone.
- `tests.stalenessDays` is `null` until the root pipeline has run `aitri verify-run` at least once on v0.1.79+ (no retroactive backfill).
- `tests.totals` only counts pipelines that have a `verify.summary` persisted. A feature whose tests have never run contributes zero — it does not show as missing.
