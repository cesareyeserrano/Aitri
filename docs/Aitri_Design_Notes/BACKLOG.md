# Aitri — Backlog

> Open items only. Closed items are in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

---

## Implementation Strategy

> Scoring: Value × 4 + Severity × 3 + Impact × 2 − Risk. Value is the primary driver.
> Last prioritized: 2026-03-12.

### Tier 1 — Immediate (correctness + foundational input)
Fix active bugs and secure the pipeline's input quality before adding features.

| Rank | Item | Score | Why first |
| ---: | :--- | :---: | :--- |
| ~~1~~ | ~~`status` / `validate` inconsistency + Artifact drift detection~~ | 43 | ✅ **Done v0.1.26** |
| ~~2~~ | ~~Structured IDEA.md template~~ | 40 | ✅ **Done v0.1.29** |
| ~~3~~ | ~~Three Amigos gate (ac_id validation)~~ | 38 | ✅ **Done v0.1.30** |
| ~~4~~ | ~~Requirement Source Integrity (PM persona)~~ | 37 | ✅ **Done (pre-existing)** |
| ~~5~~ | ~~verify-run Vitest / parser fragility~~ | 35 | ✅ **Done (pre-existing)** |

### Tier 2 — Short-term (quality + adoption)
High value, contained implementations. No item here blocks another.

| Rank | Item | Score | Note |
| ---: | :--- | :---: | :--- |
| ~~6~~ | ~~`aitri feature` sub-pipeline~~ | 33 | ✅ **Done v0.1.31** |
| ~~7~~ | ~~Best practice docs injected into briefings~~ | 31 | ✅ **Done v0.1.28** — templates + injection in run-phase.js |
| ~~8~~ | ~~`aitri resume` session handoff~~ | 29 | ✅ **Done (pre-existing)** |
| ~~9~~ | ~~Artifact drift detection~~ | — | ✅ **Merged into Rank 1** |
| ~~10~~ | ~~Artifacts folder (`spec/`)~~ | 28 | ✅ **Done v0.1.26** |

### Tier 3 — Planned (enforce + improve)
Valid, implementable, not urgent. No item blocks the core pipeline.

| Rank | Item | Score | Note |
| ---: | :--- | :---: | :--- |
| ~~11~~ | ~~TC h/f naming convention~~ | 25 | ✅ **Done v0.1.30** — validate() enforces TC id ending in h/f per FR |
| ~~12~~ | ~~README restructure~~ | 23 | ✅ **Done v0.1.35** — progressive disclosure, schemas moved out |
| ~~13~~ | ~~Pipeline close-out clarity~~ | 20 | ✅ **Partially done in v0.1.26** |
| ~~14~~ | ~~`aitri adopt` diagnostic~~ | 20 | ✅ **Done v0.1.34/v0.1.35** — scan + apply + --upgrade |
| ~~15~~ | ~~Discovery Confidence gate~~ | 20 | ✅ **Done v0.1.33** |
| ~~16~~ | ~~`aitri wizard`~~ | 20 | ✅ **Done v0.1.36** — TTY interview, depths quick/standard/deep, writes IDEA.md |
| ~~17~~ | ~~Discovery guided interview (`--guided`)~~ | 20 | ✅ **Done v0.1.36** — injects interview context into discovery briefing |
| ~~18~~ | ~~UX/UI precision — archetype detection~~ | 20 | ✅ **Done v0.1.33** |

### Tier 4 — Deferred
High blast radius or dependency conflicts. Do not schedule until Tiers 1–2 are shipped.

| Rank | Item | Score | Blocker |
| ---: | :--- | :---: | :--- |
| ~~19~~ | ~~`aitri checkpoint`~~ | 13 | ✅ **Done (pre-existing)** |

### Discarded
Items analyzed and explicitly rejected.

| Item | Decision | Reason |
| :--- | :--- | :--- |
| Mutation testing | Discarded indefinitely | Violates zero-dep principle. `verify-run --assertion-density` covers 60% of the same problem at zero cost. Option B (globally-installed stryker) introduces implicit env dependency — worse than explicit dep. ROI does not justify. |

### P-level corrections (vs original backlog labels)
| Item | Was | Now | Reason |
| :--- | :--- | :--- | :--- |
| Three Amigos gate | P2 | P1 | In schema, unenforced, low risk — should ship with other Tier 1 validate() work |
| `aitri feature` | P1 | P2 | High value but high risk — not a correctness bug, requires stable foundation + file locking first |
| verify-run Vitest | P2 | P1 | Adoption blocker confirmed by E2E evaluation — 0 TCs detected on Vitest projects |
| Artifact drift detection | P2 | P1 | Merged with status/validate inconsistency — same root fix |
| Artifacts folder (`spec/`) | Tier 4 | Tier 2 | Blast radius grows linearly with each new command — do before feature/adopt/resume land |

---

## Entry Standard

Every backlog entry must be self-contained — implementable in a future session with zero memory of the original conversation. Before adding an item, verify it answers all of these:

| Question | Why it matters |
| :--- | :--- |
| **What is the user-visible problem?** | Prevents implementing a solution looking for a problem |
| **Which files are affected?** | Implementer knows where to start without exploring |
| **What is the exact behavior change?** | Removes ambiguity about what "done" looks like |
| **Are there technical decisions pre-resolved?** | Captures trade-offs decided during analysis, not during implementation |
| **What does `validate()` or the test need to verify?** | Defines the acceptance criterion at the code level |
| **Are there known conflicts or risks with existing code?** | Prevents regressions on parsers, schemas, or commands |

**Minimum entry format:**
```
- [ ] P? — **Title** — one-line description of the user-visible problem.
  Problem: <why this matters, what breaks without it>
  Files: <lib/..., templates/..., test/...>
  Behavior: <what changes — inputs, outputs, validation rules>
  Decisions: <any trade-offs already resolved>
  Acceptance: <how to verify it works — test or manual check>
```

Entries without `Files` and `Behavior` are considered incomplete and must be expanded before scheduling.

---

## Open

---

### Stabilization

- ✅ **Aitri Stabilization (v0.1.37–v0.1.44)** — Done v0.1.44. Full real-world adopt test (Ultron), wizard agent-mode, idea/ folder, Delivery Summary in all 8 templates, dead code audit, 3 real bugs fixed (resume.js fr_coverage array mismatch, adopt.js buf.slice deprecation, adopt.js process.exit(0) on abort). 443/443 tests passing. No known open bugs.

---

## AitriHub Integration Backlog

> Gestionado desde Aitri hasta que Hub tenga su propio pipeline Aitri activo.
> Reference: `docs/Aitri_Design_Notes/INTEGRATION_CONTRACT.md`
> Hub repo: `/Users/cesareyeserrano/Documents/PROJECTS/AITRI-HUB`

### Bugs (Hub side — correctness)

- ✅ **[Hub] `fr_id` field name** — Not a bug. `test-reader.js` already reads `entry.fr_id` correctly and exposes it as `frId` internally. Confirmed by reading source + tests (2026-03-13).

- ✅ **[Hub] respect `artifactsDir` from `.aitri` config** — Done v0.1.1. `aitri-reader` exposes `artifactsDir` (defaults to `"spec"`). `test-reader` accepts it as param. `collector/index` passes `aitriState?.artifactsDir`. 6 new tests.

- ✅ **[Hub] handle `.aitri` as directory** — Done v0.1.1. `aitri-reader` detects EISDIR and reads `.aitri/config.json` instead. 3 new tests.


### Features (Hub side — new data)

- ✅ **[Hub] read `05_PROOF_OF_COMPLIANCE.json` → compliance badge** — Done Hub v0.1.4. `compliance-reader.js`, Rule 6 in alerts engine, badge on ProjectCard (✓ COMPLIANT / ⚠ PARTIAL / · DRAFT). 13 new tests.

- ~~[ ] P2 — **[Hub] read `05_PROOF_OF_COMPLIANCE.json` → compliance badge**~~ — Hub shows "verify passed ✅" but not the final compliance verdict. `05_PROOF_OF_COMPLIANCE.json` has `overall_compliance` per project.
  Problem: A project can pass all tests but still have `development_only` compliance. Hub currently shows it as healthy. This is misleading for production readiness decisions.
  Files: `AITRI-HUB/lib/collector/` (new `compliance-reader.js`), `AITRI-HUB/lib/alerts/engine.js` (new alert: compliance-blocked), web components (ProjectCard, header badge)
  Behavior: New `complianceSummary: {overall, production_ready: n, partial: n, blocked: n}` in ProjectData. New alert `compliance-blocked` (severity: error) when overall is not `production_ready`. Show badge in project card: `✅ production_ready` / `⚠️ staging_ready` / `❌ blocked`.
  Decisions: Only read if Phase 5 is in `approvedPhases` — don't show stale compliance from previous runs.
  Acceptance: Project card shows compliance level. Alert fires when `overall_compliance !== 'production_ready'`.

- ✅ **[Hub] read `01_REQUIREMENTS.json` → requirements context** — Done Hub v0.1.5. `requirements-reader.js`, FR count + priority breakdown on ProjectCard header. 11 new tests.

- ✅ **[Hub] detect feature sub-pipelines** — Done Hub v0.1.6. `aitri-reader` scans `features/` subdirs for `.aitri` files, exposes `features[]` (max 10, sorted by name). ProjectCard shows "N active" badge with name preview. Refactored `readStateFile()` shared helper. 9 new tests. Note: actual structure is `features/<name>/.aitri`, not `.aitri-feature-*` files — backlog description was incorrect.

### Features (Aitri side — better data for Hub)

- ✅ **[Aitri] event log in `.aitri`** — Done Aitri v0.1.45. `appendEvent()` in `state.js`, called by `approve.js`, `complete.js`, `reject.js`. Cap 20 entries. Hub reads `events[]` via `aitri-reader`, ActivityTab renders timeline. Hub v0.1.3.

- ✅ **[Aitri] `aitri init` auto-registers in Hub if installed** — Done Aitri v0.1.46. Silent, non-blocking. Reads `~/.aitri-hub/projects.json`, appends entry if not already registered. Prints `  Registered in Aitri Hub`.

- ✅ **[Aitri] `aitri status` mentions Hub if project is monitored** — Done Aitri v0.1.46. Silent check of `~/.aitri-hub/projects.json`; prints `  Monitored by Aitri Hub — run: aitri-hub monitor` if project is registered.

---

## Known Technical Debt (design trade-offs — v0.1.44)

> These are not bugs. They are intentional trade-offs that have known failure modes. Documented so they are not rediscovered in future sessions.

- [ ] P3 — **`JSON.parse()` in phase validators produces cryptic errors on malformed agent output**
  Problem: `phase1/3/4/5.validate()` calls `JSON.parse(content)` directly. If the agent produces malformed JSON (truncated, markdown fences, trailing commas), the error message is a raw Node.js SyntaxError with a column number, not a user-actionable message.
  Files: `lib/phases/phase1.js`, `phase3.js`, `phase4.js`, `phase5.js`
  Behavior: Wrap `JSON.parse` in a try/catch inside each `validate()` and throw a friendly error: `"Phase N artifact is not valid JSON — check that the agent did not wrap the output in markdown fences or add trailing commas."` The caller in `complete.js` already has a try/catch but it just re-throws.
  Decisions: `complete.js` try/catch is the right layer for catching IO errors; `validate()` is the right layer for catching semantic errors. Separating them avoids swallowing real crashes.
  Acceptance: `aitri complete 1` with malformed JSON in the artifact shows a readable error, not a raw SyntaxError stack.

- [ ] P3 — **`verify.js` coverage is empty if agent omits `@aitri-tc` markers**
  Problem: `scanTestContent()` in `verify.js` relies on `// @aitri-tc TC-001` markers in test files to map tests to TCs. If the agent writes tests without the markers, `fr_coverage` entries all show `tests_passing: 0` even when tests pass. No warning is emitted.
  Files: `lib/commands/verify.js`, `templates/phases/phase4.md`
  Behavior: After building `frCoverage`, if every entry has `tests_passing === 0` and at least one TC result has `status: 'pass'`, emit a `process.stderr.write` warning: `"[aitri] Warning: all FR coverage is zero but tests passed — @aitri-tc markers may be missing from test files."`. Non-blocking.
  Decisions: Do not make markers mandatory — they are documentation hints, not execution hooks.
  Acceptance: Warning appears in `verify-run` output when markers are missing and tests pass.

- [ ] P3 — **`scanTestHealth` reads full test files with `fs.readFileSync` (no byte limit)**
  Problem: `scanTestHealth()` in `adopt.js` uses `fs.readFileSync(fullPath, 'utf8')` without a size cap. The other two file-walking scanners (`scanCodeQuality`, `scanSecretSignals`) use the `openSync/readSync` pattern with `MAX_FILE_READ_BYTES=50KB`. Inconsistency. On repos with large generated test fixtures, this can slow `adopt scan`.
  Files: `lib/commands/adopt.js` — `scanTestHealth()` function
  Behavior: Replace `fs.readFileSync` with the `openSync/readSync/closeSync` pattern using `MAX_FILE_READ_BYTES`. Same pattern already in `scanCodeQuality` and `scanSecretSignals`.
  Decisions: The empty-file check (`content.trim().length < 80`) still works correctly on truncated content. The skip-marker check may miss markers near end-of-file in very large test files — acceptable since markers usually appear near the top.
  Acceptance: `scanTestHealth` reads at most 50KB per file. No behavioral change on normal repos.

---

## Engineering Integrity (fixed findings — 2026-03-12)

> Source: deep technical audit of v0.1.25. All confirmed fixed.

- ✅ **Atomic write cross-device failure** — Fixed v0.1.26: temp file now in project dir.
- ✅ **`approve.js` UX detection silent fallback** — Fixed v0.1.26: stderr warn on malformed JSON.
- ✅ **`phaseReview.js` missing `extractContext`** — Fixed v0.1.26.
- ✅ **No file locking on `.aitri` state file** — Fixed v0.1.32: O_EXCL lock + stale detection.

---

## Spec-Driven Foundation (all done)

- ✅ **Structured IDEA.md template** — Done v0.1.29
- ✅ **Requirement Source Integrity in PM persona** — Done (pre-existing)
- ✅ **Discovery Confidence gate** — Done v0.1.33
- ✅ **TC happy/failure naming convention (h/f suffix)** — Done v0.1.30
- ✅ **Discovery interview wizard** — Deferred → open item above (P3)

---

## Pipeline Reliability (all done)

- ✅ **`aitri status` / `aitri validate` inconsistency + drift detection** — Done v0.1.26
- ✅ **Phase 4 manifest required fields documented in briefing** — Done (template updated)
- ✅ **verify-run Vitest support** — Done (pre-existing)
- ✅ **Pipeline close-out clarity** — Done v0.1.26

---

## Next Features (all done)

- ✅ **`aitri feature` sub-pipeline** — Done v0.1.31
- ✅ **`aitri resume` session handoff** — Done (pre-existing)
- ✅ **`aitri adopt` — scan + apply + --upgrade** — Done v0.1.34/v0.1.35
- ✅ **Artifacts folder (`spec/`)** — Done v0.1.26
- ✅ **`aitri checkpoint`** — Done (pre-existing)

---

## Engineering Quality (all done)

- ✅ **Best practice docs injected into phase briefings** — Done v0.1.28
- ✅ **Three Amigos gate — Phase 3 TCs must trace to Phase 1 ACs** — Done v0.1.30

---

## Documentation & UX

- ✅ **README restructure** — Done v0.1.35: progressive disclosure, schemas moved to `aitri help`, ASCII art header, commands table with adopt/feature/resume.
