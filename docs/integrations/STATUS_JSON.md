# `aitri status --json` — Machine-Readable Project Snapshot

**Aitri version:** v0.1.77+
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
  "staleVerify": []                    // reserved — requires verifyRanAt (not yet persisted)
}
```

Deploy-gate reason types: `no_root`, `phases_pending`, `verify_not_passed`, `drift`, `normalize_pending`, `blocking_bugs`, `version_mismatch`.

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
| 4 | `normalizeState.status === 'pending'` on root |
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

- `audit.stalenessDays` uses file `mtime`; editing `AUDIT_REPORT.md` without re-running `aitri audit` resets the clock.
- `tests.stalenessDays` (not exposed yet) requires persisted `verifyRanAt`, which is not in `.aitri` today.

Both gaps are tracked in the ADR log ([Aitri_Design_Notes/DECISIONS.md](../Aitri_Design_Notes/DECISIONS.md)).
