# `aitri validate --json` — Machine-Readable Deploy-Readiness Report

**Aitri version:** v2.1.0-rc.3+
**Stability:** Additive-only. The legacy shape (used by early Hub) is preserved indefinitely.
**Scope:** Single-machine CLI consumers (CI steps, local dashboards). For remote (GitHub-URL) consumers, read `.aitri` + artifacts directly per [SCHEMA.md](./SCHEMA.md) / [ARTIFACTS.md](./ARTIFACTS.md).

---

## Purpose

`aitri validate --json` emits a **per-artifact deploy-readiness report** for the root pipeline: which artifacts exist, are approved, and are drift-free, plus the same deploy-gate verdict `status --json` carries. Where [`status --json`](./STATUS_JSON.md) answers "what is the state of everything and what next," `validate --json` answers "is THIS project shippable, artifact by artifact."

It is the machine-readable face of the `aitri validate` command. The shape is a contract — the emitter preserves it for Hub and external consumers.

---

## Invocation

```sh
aitri validate --json          # report only — exit code 0 even when not deployable
aitri validate --json --ci     # CI gate — non-zero exit when the deploy gate is NOT open
```

Exit codes:
- Without `--ci`: `0` on success (deploy-readiness is in the payload, not the exit code). Non-zero when `dir` is not an Aitri project, the root `.aitri` is unreadable (malformed / merge-conflicted), or the command crashes on an unexpected error.
- With `--ci` (v2.0.0-rc.117+, ADV-0622-27): additionally exits `1` when `health.deployable` is `false`, **or** when any pipeline's `BUGS.json` is unreadable (v2.0.0-rc.149+, B8 — a corrupt bug file must not report green; checked for root and every feature). The human notice goes to **stderr**, so stdout stays pure JSON for `JSON.parse`.

---

## Top-level shape

```jsonc
{
  // ── Legacy fields (stable; early-Hub contract) ────────────────────────────
  "project":  "string",                // project name (from .aitri)
  "dir":      "string",                // absolute path
  "allValid": boolean,                 // every REQUIRED artifact: (exists || absorbed) && approved && !drift
  "artifacts": [ /* per-artifact entries — see below */ ],
  "deployFiles": {                     // presence booleans for conventional deploy files at project root
    "Dockerfile": bool, "docker-compose.yml": bool, "DEPLOYMENT.md": bool, ".env.example": bool
  },
  "setupCommands": ["string"],         // 04_BUILD_REPORT.json#setup_commands, [] when absent/unreadable

  // ── Snapshot-derived extensions ───────────────────────────────────────────
  "deployable":        boolean,        // same value as status --json health.deployable
  "deployableReasons": [ { "type": "string", "message": "string" } ],  // same set as STATUS_JSON.md health
  "openBugs":     N,                   // bugs with status open | in_progress | fixed (not yet verified), all severities
  "blockingBugs": N                    // ACTIVE (open | in_progress) critical/high bugs — the deploy-gate blockers
}
```

`deployable` / `deployableReasons` are computed by the same snapshot SSoT as `status --json` — the reason `type` values and their semantics are documented once, in [STATUS_JSON.md § health](./STATUS_JSON.md#health). Consumers must tolerate unknown reason types (additive set).

---

## `artifacts[]`

One entry per root-pipeline artifact. Array order: `IDEA.md` first, then any **present** optional phases (`00_DISCOVERY.md`, `01_UX_SPEC.md`, `04_CODE_REVIEW.md` — note the review entry appears here, before the core entries), then core phases 1–5, then the verify evidence entry. Four entry variants:

```jsonc
// 1. IDEA.md (always first, required)
{ "name": "IDEA.md", "exists": bool,   // literal: seed file on disk
  "approved": bool,                    // true when the file exists OR 01_REQUIREMENTS.json#original_brief is populated (seed absorbed — via approve 1 or the alpha.17 migration)
  "drift": false, "required": true,
  "absorbed": true }                   // additive (v2.0.0-alpha.22+) — present only when approved-via-absorption

// 2. Optional phases (discovery / ux / review) — included ONLY when the artifact exists
{ "name": "00_DISCOVERY.md", "exists": true, "approved": bool, "drift": bool,
  "required": false, "optional": true }

// 3. Core phases 1–5
{ "name": "01_REQUIREMENTS.json", "exists": bool, "approved": bool, "drift": bool, "required": true }

// 4. The verify evidence entry (always present, required)
{ "name": "04_TEST_RESULTS.json",
  "exists": bool,
  "approved": bool,                    // verifyPassed AND file exists AND resultsBinding !== "mismatch"
  "drift": bool,                       // true exactly when resultsBinding === "mismatch" (v2.0.0-rc.148+)
  "required": true,
  "verifyPassed": bool,                // the sticky .aitri flag, boolean-coerced (absent → false)
  "resultsBinding": "bound | mismatch | no-stamp | missing-file" }  // additive, v2.0.0-rc.148+
```

`allValid` is derived from the `required` entries only: every one must have `(exists || absorbed) && approved && !drift`. An absorbed brief counts as satisfied (v2.0.0-rc.160+): `IDEA.md` is archived (moved to `archive/`) at approve 1 by design, so the pre-rc.160 `exists`-only derivation reported `allValid: false` for **every** project past approve 1 — treat `allValid: false` from older versions as unreliable on completed projects. Note `allValid` is artifact-level and is **not** the deploy verdict — `deployable` also folds in blocking bugs, reconcile state, version mismatch, and feature pipelines. A consumer gating a pipeline should read `deployable`; `allValid`/`artifacts[]` explain the artifact-side detail.

---

## Versioning

Additive-only, governed by [CHANGELOG.md](./CHANGELOG.md) entries (`— additive` / `— breaking` markers), same maintenance rule as the other contract documents: any change to this shape updates this file in the same commit.
