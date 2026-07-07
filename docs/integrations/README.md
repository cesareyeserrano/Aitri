# Aitri — Integration Model

**Version:** v2.0.0-rc.160+
**Owner:** This document is the authoritative description of how the Aitri ecosystem is structured.

---

## Core principle

Aitri is a **passive producer**. It writes structured files to disk and commits them to git. It does not know about any subproduct — Hub or any future tool. Subproducts are **autonomous consumers** that read those files independently.

```
Aitri Core
  │  writes: .aitri  (pipeline state)
  │  writes: <artifactsDir>/  (SDLC artifacts — "aitri/product/spec" rc.76+, "spec" earlier)
  │  commits to: project git repo
  │
  └── Contract: docs/integrations/SCHEMA.md   (schema of .aitri)
                docs/integrations/ARTIFACTS.md (schema of the artifact files)
                docs/integrations/CHANGELOG.md (contract change history)

Subproducts (Hub, future tools)
  │  read .aitri    → per SCHEMA.md
  │  read <artifactsDir>/ → per ARTIFACTS.md
  │  read git log   → per their own implementation
  │  manage their own project registry
  └── no runtime connection to Aitri Core
```

---

## What Aitri provides

| Surface | Location | Description |
|---|---|---|
| Pipeline state | `<project>/.aitri` | Phase progress, approvals, drift, events, hashes |
| Requirements | `<project>/<artifactsDir>/01_REQUIREMENTS.json` | Epics, FRs, User Stories, ACs |
| System Design | `<project>/<artifactsDir>/02_SYSTEM_DESIGN.md` | Architecture decisions |
| Test Cases | `<project>/<artifactsDir>/03_TEST_CASES.json` | Test case definitions |
| Implementation | `<project>/<artifactsDir>/04_BUILD_REPORT.json` | Implementation tracking |
| Test Results | `<project>/<artifactsDir>/04_TEST_RESULTS.json` | Verify-run output |
| Compliance | `<project>/<artifactsDir>/05_TRACEABILITY.json` | FR coverage proof |
| Optional: Discovery | `<project>/<artifactsDir>/00_DISCOVERY.md` | Project diagnosis (adopt flow) |
| Optional: UX | `<project>/<artifactsDir>/01_UX_SPEC.md` | UX specification |
| Optional: Code Review | `<project>/<artifactsDir>/04_CODE_REVIEW.md` | Phase 4 review output |
| Optional: Bugs | `<project>/<artifactsDir>/BUGS.json` | Bug registry — open, fixed, verified, closed |
| Optional: Backlog | `<project>/<artifactsDir>/BACKLOG.json` | Tech-debt / deferred-work registry (priority-ordered) |
| Optional: Audit | `<project>/<artifactsDir>/AUDIT_REPORT.md` | On-demand audit findings: code audit (bugs, backlog, observations), plus optional "Requirements Coverage" (`audit requirements`, alias `audit coverage`) and "Security" (`audit security`) sections |
| Feature pipelines | `<project>/<layoutRoot>/features/<name>/` | Sub-pipelines with same structure — `aitri/features/` for contained projects (rc.76+), `features/` for legacy flat ones (see `layoutRoot` in [SCHEMA.md](./SCHEMA.md)) |
| Derived snapshot (CLI-only) | `aitri status --json` | Aggregated pipeline + features + health + priority-ordered next actions. See [STATUS_JSON.md](./STATUS_JSON.md). Requires the `aitri` binary on PATH — remote consumers must read `.aitri` + `<artifactsDir>/` directly. |
| Deploy-readiness report (CLI-only) | `aitri validate --json` | Per-artifact exists/approved/drift + deploy verdict; `--ci` turns the verdict into the exit code for CI steps. See [VALIDATE_JSON.md](./VALIDATE_JSON.md). |
| Derived export (CLI-only) | `aitri export traceability [--out <path>]` | Human-readable Markdown traceability matrix (requirement × TCs × test evidence × compliance, with claim-vs-evidence flags). Derived read-only from the artifacts above — not a new schema; content anchored to [ARTIFACTS.md](./ARTIFACTS.md). |

---

## How subproducts detect changes

All change detection is **pull-based**. No push notifications. Two mechanisms:

**Local scenario (same machine):**
- Poll `<project>/.aitri` → compare `updatedAt` field → if changed, re-read
- Optionally use `events[]` array to understand what changed (started / completed / approved / rejected)

**Distributed scenario (different machines, GitHub):**
- Fetch `.aitri` from GitHub raw content
- Compare SHA of last commit touching `.aitri` or `<artifactsDir>/` — if changed, re-fetch artifacts
- `updatedAt` field also works: compare stored timestamp with fetched value

**Artifact existence:** check which phases are in `approvedPhases[]` or `completedPhases[]` before fetching a specific artifact file. The `.aitri` state tells you what exists.

**`.aitri` is committed; `.aitri.local` is not (v2.0.0-rc.51+, ADR-045).** State is split: the shared `.aitri` (approvals + `artifactHashes` drift baseline + `updatedAt`, the fields above) is meant to be **committed** so teammates and remote consumers see it; per-machine state (`lastSession`, `reconcileState`) lives in the gitignored sibling `.aitri.local`. **Subproducts read `.aitri` (as before) and never `.aitri.local`.** Before rc.51, the mixed file's per-command noise pushed some owners (including early Aitri Hub) to gitignore the whole `.aitri` — which silently discarded the shared baseline; the split removes that pressure, and `adopt --upgrade` fixes a legacy bare-`.aitri` ignore. A project may still gitignore the whole `.aitri` (owner's choice); then the distributed-scenario mechanism does not apply and subproducts can only read it from the local working tree. (Pre-existing `.aitri/` *folder* layout: read `.aitri/config.json`.)

---

## How subproducts discover projects

Each subproduct manages its own project registry. Aitri does not maintain a global registry. Subproducts register projects via:

- **Manual setup**: user runs `<subproduct> setup` and provides a path or GitHub URL
- **Local scan**: subproduct scans directories for `.aitri` files
- **GitHub URL**: user provides a repo URL; subproduct fetches raw content directly

Aitri's auto-registration in Hub was removed in v0.1.64 to enforce this separation.

---

## Subproduct architecture rules

A compliant Aitri subproduct must:

1. **Never write** to `<project>/.aitri` or `<project>/<artifactsDir>/` — those are Aitri's domain
2. **Be defensive** — all `.aitri` fields are optional; use defaults from SCHEMA.md
3. **Follow SCHEMA.md** — implement against the documented contract, not against Aitri source code
4. **Track CHANGELOG.md** — when the contract version changes, update the subproduct reader
5. **Manage its own state** — project lists, caches, dashboards live in the subproduct's own directory
6. **Gate on integration version** — maintain an internal `INTEGRATION_LAST_REVIEWED` constant (semver string). When the detected Aitri version in any project or the installed CLI exceeds this value, surface a visible alert before rendering any data. The alert must link to `docs/integrations/CHANGELOG.md`. Only bump `INTEGRATION_LAST_REVIEWED` after a developer has reviewed the changelog and confirmed (or implemented) any required reader changes.

```js
// Example — Hub or any subproduct
const INTEGRATION_LAST_REVIEWED = '0.1.82'; // bump after reviewing CHANGELOG.md

function checkIntegrationAlignment(installedAitriVersion) {
  if (semverGt(installedAitriVersion, INTEGRATION_LAST_REVIEWED)) {
    emitAlert({
      severity: 'warning',
      message: `Aitri ${installedAitriVersion} detected — integration not reviewed past ${INTEGRATION_LAST_REVIEWED}`,
      action: 'Review docs/integrations/CHANGELOG.md before trusting displayed data',
    });
  }
}
```

This alert is for **subproduct developers**, not end users — it signals that Hub (or another consumer) may be reading data with an outdated schema understanding.

---

## Contract documents

| Document | Purpose |
|---|---|
| [SCHEMA.md](./SCHEMA.md) | Canonical schema of `.aitri` — all fields, types, defaults, semantics |
| [ARTIFACTS.md](./ARTIFACTS.md) | Schema of each artifact file in `<artifactsDir>/` |
| [STATUS_JSON.md](./STATUS_JSON.md) | Shape of `aitri status --json` (derived snapshot for CLI-colocated consumers) |
| [VALIDATE_JSON.md](./VALIDATE_JSON.md) | Shape of `aitri validate --json` (per-artifact deploy-readiness report) + the `--ci` exit-code gate |
| [CHANGELOG.md](./CHANGELOG.md) | History of breaking and non-breaking contract changes by Aitri version |

---

## Visual identity

Aitri Core is a CLI with no UI. The visual identity of the ecosystem is defined and owned by Hub.

> **UI reference:** [`STYLE_GUIDE.md`](https://github.com/cesareyeserrano/aitri-hub/blob/main/STYLE_GUIDE.md) in the Hub repo — colors, typography, CLI ANSI palette, UI patterns, and spacing. All subproducts with a UI should follow this guide.

---

## Maintenance rule

When `.aitri` schema or any artifact schema changes in Aitri, the relevant document in this directory **must be updated in the same commit**. Partially enforced by `test/release-sync.test.js` (version headers of the five contract documents must match `package.json`, and every CHANGELOG.md entry heading must carry an `additive`/`breaking` marker); the **content** staying truthful is enforced by convention and review.
