# Aitri — Integration Model

**Version:** v0.1.67+
**Owner:** This document is the authoritative description of how the Aitri ecosystem is structured.

---

## Core principle

Aitri is a **passive producer**. It writes structured files to disk and commits them to git. It does not know about any subproduct — Hub, Graph, or any future tool. Subproducts are **autonomous consumers** that read those files independently.

```
Aitri Core
  │  writes: .aitri  (pipeline state)
  │  writes: spec/   (SDLC artifacts)
  │  commits to: project git repo
  │
  └── Contract: docs/integrations/SCHEMA.md   (schema of .aitri)
                docs/integrations/ARTIFACTS.md (schema of spec/ files)
                docs/integrations/CHANGELOG.md (contract change history)

Subproducts (Hub, Graph, CI, IDE, ...)
  │  read .aitri    → per SCHEMA.md
  │  read spec/     → per ARTIFACTS.md
  │  read git log   → per their own implementation
  │  manage their own project registry
  └── no runtime connection to Aitri Core
```

---

## What Aitri provides

| Surface | Location | Description |
|---|---|---|
| Pipeline state | `<project>/.aitri` | Phase progress, approvals, drift, events, hashes |
| Requirements | `<project>/spec/01_REQUIREMENTS.json` | Epics, FRs, User Stories, ACs |
| System Design | `<project>/spec/02_SYSTEM_DESIGN.md` | Architecture decisions |
| Test Cases | `<project>/spec/03_TEST_CASES.json` | Test case definitions |
| Implementation | `<project>/spec/04_IMPLEMENTATION_MANIFEST.json` | Implementation tracking |
| Test Results | `<project>/spec/04_TEST_RESULTS.json` | Verify-run output |
| Compliance | `<project>/spec/05_PROOF_OF_COMPLIANCE.json` | FR coverage proof |
| Optional: Discovery | `<project>/spec/00_DISCOVERY.md` | Project diagnosis (adopt flow) |
| Optional: UX | `<project>/spec/01_UX_SPEC.md` | UX specification |
| Optional: Code Review | `<project>/spec/04_CODE_REVIEW.md` | Phase 4 review output |
| Optional: Bugs | `<project>/spec/BUGS.json` | Bug registry — open, fixed, verified, closed |
| Feature pipelines | `<project>/features/<name>/` | Sub-pipelines with same structure |

---

## How subproducts detect changes

All change detection is **pull-based**. No push notifications. Two mechanisms:

**Local scenario (same machine):**
- Poll `<project>/.aitri` → compare `updatedAt` field → if changed, re-read
- Optionally use `events[]` array to understand what changed (started / completed / approved / rejected)

**Distributed scenario (different machines, GitHub):**
- Fetch `.aitri` from GitHub raw content
- Compare SHA of last commit touching `.aitri` or `spec/` — if changed, re-fetch artifacts
- `updatedAt` field also works: compare stored timestamp with fetched value

**Artifact existence:** check which phases are in `approvedPhases[]` or `completedPhases[]` before fetching a specific artifact file. The `.aitri` state tells you what exists.

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

1. **Never write** to `<project>/.aitri` or `<project>/spec/` — those are Aitri's domain
2. **Be defensive** — all `.aitri` fields are optional; use defaults from SCHEMA.md
3. **Follow SCHEMA.md** — implement against the documented contract, not against Aitri source code
4. **Track CHANGELOG.md** — when the contract version changes, update the subproduct reader
5. **Manage its own state** — project lists, caches, dashboards live in the subproduct's own directory

---

## Contract documents

| Document | Purpose |
|---|---|
| [SCHEMA.md](./SCHEMA.md) | Canonical schema of `.aitri` — all fields, types, defaults, semantics |
| [ARTIFACTS.md](./ARTIFACTS.md) | Schema of each artifact file in `spec/` |
| [CHANGELOG.md](./CHANGELOG.md) | History of breaking and non-breaking contract changes by Aitri version |

---

## Visual identity

Aitri Core is a CLI with no UI. The visual identity of the ecosystem is defined and owned by Hub.

> **UI reference:** [`STYLE_GUIDE.md`](https://github.com/cesareyeserrano/aitri-hub/blob/main/STYLE_GUIDE.md) in the Hub repo — colors, typography, CLI ANSI palette, UI patterns, and spacing. All subproducts with a UI should follow this guide.

---

## Maintenance rule

When `.aitri` schema or any artifact schema changes in Aitri, the relevant document in this directory **must be updated in the same commit**. This is enforced by convention — no tooling.
