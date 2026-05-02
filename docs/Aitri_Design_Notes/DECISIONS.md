# Aitri — Decision Log (ADRs)

> Immutable record of architecture decisions. Each entry explains the context, decision, and trade-off.
> Once written, an entry is not modified — a new entry is added if the decision changes.

---

## ADR-001 — stdout as briefing delivery protocol
**Date:** 2026-03-09
**Status:** Active

**Context:** We needed a mechanism for Aitri to deliver instructions to the agent without coupling to any specific model.

**Decision:** `run-phase` prints the complete briefing to stdout. The agent reads and acts on it.

**Trade-off:** The agent must be able to read stdin or capture stdout. Gain: full portability, CI/CD compatibility, zero coupling.

---

## ADR-002 — Filesystem as IPC between phases
**Date:** 2026-03-09
**Status:** Active

**Context:** Each phase's artifacts are the input of the next. We needed a handoff mechanism between agents.

**Decision:** Artifacts are plain files in the project directory. Handshake: file exists + passes `validate()`.

**Trade-off:** No transactionality or file locking. Gain: simplicity, auditability, compatibility with any agent.

---

## ADR-003 — Zero external dependencies
**Date:** 2026-03-09
**Status:** Active

**Context:** Aitri is installed globally (`npm install -g aitri`). Any dependency is a failure vector.

**Decision:** `"dependencies": {}` permanent. Only Node.js built-ins (`fs`, `path`, `url`, `node:test`, `node:assert`).

**Trade-off:** Cannot use JSON Schema validation libraries (ajv, zod). Validation is manual in `validate()`. Acceptable given the scope.

---

## ADR-004 — extractContext() to minimize context drift
**Date:** 2026-03-09
**Status:** Active

**Context:** Passing full artifacts between phases inflates the agent's context and degrades output quality.

**Decision:** Each phase defines `extractContext()` that filters only the fields the next agent needs. Phase 4 caps the SDD at 120 lines with `head()`.

**Trade-off:** If relevant information falls outside the `head()` cap, the downstream agent won't see it. Mitigated by the SDD section order.

---

## ADR-005 — Artifact validation in aitri complete (not in run-phase)
**Date:** 2026-03-09
**Status:** Active

**Context:** Agents can generate incomplete or malformed artifacts. We needed a hard gate.

**Decision:** `aitri complete N` calls `p.validate(content)` before recording completion. If it fails, the pipeline does not advance.

**Trade-off:** The agent has already written the file before validation. On failure, it must correct and re-call `complete`. No automatic file rollback.

---

## ADR-006 — Typed FRs with measurable acceptance criteria
**Date:** 2026-03-09
**Status:** Active

**Context:** Agents generated FRs with vague acceptance criteria ("works correctly"). Phase 5 validation was a global unverifiable claim.

**Decision:** Each MUST FR has `type` (UX|persistence|security|reporting|logic) with type-specific acceptance criteria. Phase 5 validates per FR, not globally.

**Trade-off:** More work in Phase 1. The PM Persona must be more specific. Gain: real compliance, not declarative.

---

## ADR-007 — Mandatory Technical Debt Declaration in Phase 4
**Date:** 2026-03-09
**Status:** Active

**Context:** Agents made silent substitutions (HTML table instead of chart, JSON instead of DB). The pipeline approved them without a record.

**Decision:** `04_IMPLEMENTATION_MANIFEST.json` requires `technical_debt[]` field. Empty array only if zero substitutions were made. Phase 5 inherits and reports.

**Trade-off:** The agent can declare false or incomplete debt. Better than silence — at least there is a record for human audit.

---

## ADR-008 — English as the single language for all project documentation
**Date:** 2026-03-09
**Status:** Active

**Context:** Design notes and source code comments were mixing Spanish and English (Spanglish). This creates friction for contributors and makes the project less accessible.

**Decision:** All documentation in `docs/`, all code comments, all README content, and all error messages are written in English. No exceptions.

**Trade-off:** Initial translation effort for existing docs. Gain: consistency, contributor accessibility, professional standard.

---

## ADR-009 — Bug storage as `spec/BUGS.json`, not `.aitri` or individual markdown files
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `aitri bug`

**Context:** `aitri bug` needs persistent storage for bug records. Three options were evaluated:
- Option A: Individual markdown files in `spec/bugs/BG-001.md` — human-readable, editable, consistent with SDLC-Studio's pattern
- Option B: Embedded in `.aitri` config (e.g., `config.bugs[]`) — simple, managed by `state.js`
- Option C: Single structured file `spec/BUGS.json` — machine-readable, human-inspectable, sits in the public artifact directory

**Decision:** `spec/BUGS.json` (Option C).

**Reasoning:**
- Bugs are project artifacts, not pipeline state. `.aitri` is the state contract between phases; bugs are a separate concern that begins after deployment.
- `spec/` is the canonical artifact directory already consumed by Hub and Graph. Placing bugs there makes them automatically part of the integration contract without changes to `docs/integrations/ARTIFACTS.md` beyond adding the new schema.
- Individual markdown files (Option A) are unstructured — querying by severity, FR, or status requires text parsing. `BUGS.json` is directly queryable.
- A single file is simpler than a directory of files. Merge conflicts are theoretical (Aitri is not designed for concurrent agent writes on the same project).

**Trade-off:** `BUGS.json` is less human-editable than markdown. Mitigated by the fact that all mutations go through `aitri bug` commands, so direct editing should be rare.

---

## ADR-010 — `bug.js` owns BUGS.json I/O — does not go through `state.js`
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `aitri bug`

**Context:** `state.js` is the single point of read/write for `.aitri/` (invariant). The question was whether bug storage should also route through `state.js` or be managed independently.

**Decision:** `bug.js` owns `spec/BUGS.json` read/write directly. `state.js` is not modified.

**Reasoning:**
- The `state.js` invariant applies specifically to `.aitri/config.json` — it exists to prevent multiple commands from reading/writing the pipeline state in inconsistent ways. It is not a general I/O abstraction for all project files.
- `spec/BUGS.json` is a project artifact (like `01_REQUIREMENTS.json`), not pipeline state. Artifacts are always read directly by commands via `fs` — `validate.js`, `complete.js`, and `verify.js` all read artifacts directly.
- Routing through `state.js` would bloat it with bug domain logic and break the clear separation between pipeline state and project artifacts.

**Trade-off:** Two I/O patterns in the codebase (state.js for pipeline state, direct fs for artifacts). This is already the existing pattern — not new debt.

---

## ADR-011 — `aitri bug verify` requires `--tc` flag; no exception path
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `aitri bug`

**Context:** The bug lifecycle has a `fixed` state that requires a test case reference before closing. The design question was whether `--tc` should be required or optional with a warning.

**Decision:** `--tc TC-XXX` is a required flag for `aitri bug verify`. The command exits with an error if omitted. The user can bypass by calling `aitri bug close` directly (which skips the verified state and prints a warning that no TC was linked).

**Reasoning:**
- The core value proposition of `aitri bug` over `aitri backlog` is exactly this enforcement: a bug must have a test case before it can be considered fixed. Making it optional defeats the purpose.
- `aitri bug close` as an explicit escape hatch is honest — the user is making a conscious choice to close without a test, and the tool records that choice with a warning in the artifact.
- `validate` warns (not errors) on bugs in `fixed` state without a TC reference, so the pipeline does not hard-block on a bypass — human judgment is preserved.

**Trade-off:** Slightly more friction to close a bug. This is intentional — the friction is the feature.

---

## ADR-012 — `aitri review` checks JSON-to-JSON only; no prose parsing
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `aitri review`

**Context:** The initial proposal for `aitri review` included checks against `02_SYSTEM_DESIGN.md` prose (e.g., "FR references a component that doesn't appear in the architecture"). Several cross-document checks were evaluated.

**Decision:** `aitri review` implements only JSON-to-JSON cross-references. All checks involving free-text parsing of markdown documents (`02_SYSTEM_DESIGN.md`) are excluded from this version.

**Checks in scope:**
- `01_REQUIREMENTS.json` ↔ `03_TEST_CASES.json` — FR coverage (MUST: error, SHOULD: warning)
- `03_TEST_CASES.json` ↔ `04_TEST_RESULTS.json` — TC result coverage (missing result: warning, orphan result: error)

**Checks explicitly excluded:**
- FR mentions component not in system design prose → excluded (false positive risk)
- NFR performance target with no test coverage → excluded (no structured field to parse against)
- Module in design with no manifest package → excluded (text matching unreliable)

**Reasoning:** A validator that blocks on false positives destroys trust faster than one that catches fewer real issues. JSON-to-JSON checks are deterministic and do not depend on naming conventions or prose structure. The excluded checks require semantic understanding of unstructured text that cannot be done reliably with built-in Node.js string operations.

**Trade-off:** The cross-document check is incomplete — it does not catch inconsistencies in the design and manifest prose. This is acceptable because those inconsistencies are caught by Phase 5 validation and the human review checklist. The goal of `aitri review` is to surface mechanical inconsistencies early, not to replace human review.

---

## ADR-013 — `aitri review` warnings require explicit human acknowledgement in `complete`
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `aitri review`

**Context:** When `complete 3` auto-runs `review --phase 3` and finds warnings (e.g., SHOULD FR without a TC), the design question was: block, warn silently, or prompt.

**Decision:** Errors block `complete` with no prompt. Warnings print a list and prompt: "Warnings found — acknowledge to continue? (y/N)". If the user answers N, `complete` exits without recording completion. If Y, completion proceeds and warnings are logged to the event stream.

**Reasoning:**
- Hard-blocking on warnings would be over-engineering — a SHOULD FR without a TC is a legitimate product decision, not a defect.
- Silent warnings would be ignored. The pattern from `approve`'s isTTY gate is the right model: force the human to see the warning and make a conscious choice.
- Logging the acknowledgement to the event stream preserves traceability — auditors can see the human was informed.
- Non-TTY environments (CI/agents): warnings are printed but acknowledgement is auto-skipped (same isTTY pattern as approve/reject).

**Trade-off:** One extra prompt in the `complete` flow when warnings exist. Consistent with Aitri's existing human-in-the-loop philosophy.

---

## ADR-014 — `adopt verify-spec` follows the run-phase/complete model; Aitri generates briefing, agent writes stubs
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `adopt verify-spec`

**Context:** The proposal required generating test stubs for uncovered AC items in a brownfield project. The question was whether Aitri should generate the stub code directly (requiring language-specific templates) or follow the existing model.

**Decision:** `adopt verify-spec` is a briefing generator. It prints a structured prompt to stdout listing every uncovered AC item with context. The agent writes the actual stub code in the project's test framework. After writing stubs, the agent calls `aitri adopt verify-spec --complete` to register the new TCs in `03_TEST_CASES.json`.

**Reasoning:**
- Aitri's core model is: generate structured briefing → agent executes → agent calls complete. This is used by every phase (run-phase → agent → complete N). Deviating from this pattern would require Aitri to know the project's test framework, language, and file structure — introducing coupling that violates ADR-003 (zero dependencies) and ADR-001 (stdout as briefing delivery).
- The agent already has full project context from earlier phases. It knows Go from `go.mod`, Python from `pyproject.toml`, TypeScript from `package.json`. The briefing tells it *what* to write; the agent decides *how*.
- User confirmed this model explicitly: "Aitri si debe hacer todo para que el agente lo escriba bien, el agente si sabe de stack."

**Trade-off:** Stub quality depends on the agent, not Aitri. The `"stub": true` flag in `03_TEST_CASES.json` is the mechanical tracking mechanism — whether the stub is well-written is a human review concern.

---

## ADR-015 — Stub TCs (`"stub": true`) are excluded from Phase 3 `complete` validation count
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `adopt verify-spec`

**Context:** `aitri complete 3` validates that every MUST FR has ≥1 TC. Stubs generated by `adopt verify-spec` are TCs with `"stub": true` and `"status": "unverified"`. The question was whether stubs count toward this requirement.

**Decision:** Stubs do NOT count toward the Phase 3 complete validation. A MUST FR covered only by a stub TC is treated the same as a MUST FR with no TC — Phase 3 `complete` requires at least one non-stub TC per MUST FR.

**Reasoning:**
- Stubs are hypotheses — they are written to discover whether the code satisfies the AC, not as evidence that it does. Counting them as coverage would make the Phase 3 gate meaningless for brownfield projects.
- The adopt verify-spec flow is an addendum to the standard pipeline, not a replacement for it. The Phase 3 QA work (writing real TCs) still must happen. Stubs are the starting point for that work, not the end.
- This preserves the invariant: `aitri complete 3` passing means real test coverage exists, regardless of whether the project was greenfield or brownfield.

**Trade-off:** Brownfield projects adopting via `verify-spec` must still write proper TCs in Phase 3. The stubs become the scaffolding for those TCs, not the TCs themselves. This is more work but produces a trustworthy pipeline.

---

## ADR-016 — `aitri bug` severity is informational; pipeline gates on status + FR type, not severity
**Date:** 2026-03-18
**Status:** Active — pending implementation
**Feature:** `aitri bug`

**Context:** When designing the `verify-complete` gate for bugs, the question was whether critical/high severity bugs should always block, regardless of FR linkage.

**Decision:** Pipeline gates (verify-complete, validate) operate on bug `status` and linked `fr` type (MUST/SHOULD/COULD), not on `severity`. A `critical` bug not linked to any FR does not block. A `medium` bug linked to a MUST FR does block `verify-complete` if its status is `open` or `fixed`.

**Reasoning:**
- Severity is the user's assessment of impact — it is a communication tool, not a mechanical enforcement mechanism. The FR linkage is the authoritative signal: if the bug breaks a must-have requirement, the pipeline should not advance.
- Blocking on severity alone would create false alarms for bugs that are cosmetically critical (e.g., "logo renders at wrong size" rated high) but not pipeline-blocking.
- The existing pipeline model already has this principle: what matters is whether the requirement is satisfied, not how bad the symptom feels.

**Trade-off:** A critical bug with no FR linkage does not auto-block. The human is expected to either link it to a FR or consciously decide it is safe to ship. `validate` will warn on all open bugs regardless of severity, ensuring visibility.

---

## ADR-017 — All Ultron-AP feedback features ship as a single version; no staggered releases
**Date:** 2026-03-18
**Status:** Active — pending implementation

**Context:** The four features from the Ultron-AP feedback session (`aitri bug`, `aitri review`, `adopt verify-spec`, TDD recommendation in Phase 4) were initially planned as separate version bumps (v0.1.66, v0.1.67, v0.1.68). The user decided to consolidate.

**Decision:** All four features ship together as a single version bump from v0.1.65.

**Reasoning:**
- The features are thematically coherent: they all address gaps in pipeline integrity discovered in a single real-world project run. They belong together as a release.
- `aitri review` and `aitri bug` have integration points (`complete 3` runs review, `verify-complete` checks bugs). Shipping them together avoids a release where the integration is half-wired.
- Single version = single `npm run test:all` gate. The test suite runs once on the full feature set, not three times on partial implementations.

**Trade-off:** Larger implementation session. Acceptable — each feature is independently implementable from its BACKLOG.md entry.

---

## ADR-018 — Design Tokens are always required in 01_UX_SPEC.md; no conditional path
**Date:** 2026-04-15
**Status:** Active
**Version:** v0.1.75

**Context:** Phase UX previously required Design Tokens only "when any UX/visual FR specifies visual attributes." The conditional path allowed agents to produce a UX spec without any color, typography, or spacing definitions if they judged the FRs insufficiently visual. This created two problems:
1. Every product has a visual layer that Phase 4 must implement. Without tokens, the developer has no source of truth and improvises — breaking the spec-as-contract model.
2. The conditional gave the agent an escape route from the hardest design work. Agents consistently underspecified aesthetics when given the option.

**Decision:** `## Design Tokens` is always a required section in `01_UX_SPEC.md`. `validate()` now throws if it is missing. The constraint in `ux.js` is unconditional. Tokens must be derived from: (1) archetype defaults, (2) explicit visual FRs if present, (3) product context otherwise. Every token must state its reason.

**Reasoning:**
- Aitri drives production of real code. The developer persona in Phase 4 implements exactly what the spec says. If the spec has no visual contract, the developer makes aesthetic decisions that are undocumented, non-reviewable, and non-reversible at the UX gate.
- The archetype system already establishes sensible defaults for every product type. There is no legitimate case where a product has zero visual layer — even a CLI tool has a terminal color scheme if it has a UX spec at all.
- Making tokens always required also forces the agent to declare the archetype reasoning explicitly, which improves the quality of the entire spec.

**Trade-off:** Existing `01_UX_SPEC.md` artifacts without a `## Design Tokens` section will fail `aitri complete ux`. Projects must re-run Phase UX or add the section manually. This is acceptable — the missing section was always a spec deficiency, not a valid state.

---

## ADR-019 — Phase 3 injects 01_UX_SPEC.md as optional input; UI TCs required when present
**Date:** 2026-04-15
**Status:** Active
**Version:** v0.1.75

**Context:** Phase 3 (QA) previously had no awareness of the UX spec. It received only requirements and system design. When a UX spec existed, the QA agent had no explicit instruction to write TCs for component states, mobile behavior, or design token compliance — even though these are verifiable behaviors that Phase 4 must implement.

**Decision:** Phase 3's `inputs` array now includes `01_UX_SPEC.md`. When present, `tests.md` renders an additional section requiring: (1) component state TCs (loading/error/empty per component in the Component Inventory), (2) mobile behavior TCs per screen at 375px, (3) design token compliance TC (contrast ratio, touch targets). These TCs must use `type: "e2e"`.

**Reasoning:**
- The existing gate "FR type UX: must include test for responsive layout at 375px viewport" was correct but insufficient. It applied only to FRs explicitly typed as UX. The new section covers the component-level behavior that the spec defines regardless of FR type granularity.
- Design Tokens are now always required in the spec (ADR-018). It follows that Phase 3 must verify at least one token — otherwise the spec has a constraint with no enforcement path.
- Phase 3 already has the pattern of conditional injection (feedback, bestPractices). Adding UX_SPEC is consistent with the existing architecture.

**Trade-off:** Phase 3 briefings for projects with a UX spec are longer. The agent must generate more TCs. This is the correct trade-off — more spec coverage means more Phase 4 accountability.

---

## ADR-020 — `files_modified` added to Phase 4 manifest; gate accepts either field
**Date:** 2026-04-16
**Status:** Active
**Version:** v0.1.76

**Context:** Phase 4's `validate()` required `files_created` to be a non-empty array. This assumption — that every build phase creates at least one new file — is false for modification or redesign work (refactors, configuration changes, UI overhauls where all files already exist). In the `/Cesar` project, a feature that only modified existing files was blocked at `aitri complete 4` because `files_created` was empty.

**Decision:** Add `files_modified: []` as an optional sibling field to `files_created`. The gate changes from "files_created must be non-empty" to "files_created OR files_modified must be non-empty". `files_created` is no longer strictly required — projects doing modification-only work can omit it entirely.

**Reasoning:**
- The original gate modeled greenfield development exclusively. Real projects include modification phases.
- Both fields have different semantics: `files_created` = net-new files; `files_modified` = existing files changed. Keeping them separate preserves auditability and lets Phase 5 / subproducts distinguish between the two.
- The gate remains strict: at least one must be non-empty. An agent cannot ship an empty manifest.

**Trade-off:** The schema surface grows by one field. Subproducts reading `04_IMPLEMENTATION_MANIFEST.json` must now handle both fields. Documented in `docs/integrations/CHANGELOG.md` and `ARTIFACTS.md`.

---

## ADR-021 — Phase 3 validate() emits actionable error when TC references NFR id
**Date:** 2026-04-16
**Status:** Active
**Version:** v0.1.76

**Context:** When an agent writes test cases for non-functional requirements (NFR-xxx), Phase 3 `validate()` would run the min-3 / happy_path / negative gate against the NFR id and produce a confusing error: "NFR-001 has 1 test case(s) — min 3 required". The error didn't explain the model: NFRs are not valid TC targets in Aitri.

**Decision:** Before the `byReq` loop, pre-build `knownFRIds` from `01_REQUIREMENTS.json` (if available). If a TC's `requirement_id` is not in `knownFRIds`, throw an actionable error explaining that NFRs must be modeled as FRs to get test coverage.

**Reasoning:**
- NFRs in Aitri inform Phase 2 (architecture constraints). They are not tested directly. Test coverage for NFR behavior flows through FRs (e.g. type: "security" for auth requirements).
- The existing error message gave no guidance. The agent would not know why it failed or how to fix it.
- The fix adds no new model concept — it just surfaces the existing model more clearly at validation time.

**Trade-off:** The check requires reading `01_REQUIREMENTS.json` one additional time (before the existing cross-phase check also reads it). The cost is a single `fs.readFileSync` during `aitri complete 3`, which is a one-time operation with negligible overhead.

---

## ADR-022 — `buildProjectSnapshot()` as the single source of truth for observer commands
**Date:** 2026-04-17
**Status:** Active — Phase 1 of a multi-phase refactor (`status`, `resume`, `validate` rewrites follow)
**Module:** `lib/snapshot.js`
**Version:** none (internal addition, no observable CLI behavior; version bump will accompany the first consumer in a later phase)

**Context:** `status`, `resume`, and `validate` each re-implement the same traversal of `.aitri` + `spec/` artifacts, and each reads only the root pipeline. Features created via `aitri feature init` live in `features/<name>/.aitri` and are invisible to these commands. Once a project's root pipeline is approved, subsequent feature work never updates what these commands report, producing an "initial-build snapshot" effect that Hub also inherits as a consumer of `.aitri`.

Two secondary problems compound this:
1. `status.js:193` and `resume.js:229` diverge in how they compute the next action — `status` suggests `aitri validate` when all core phases are approved without checking `verifyPassed`, while `resume` correctly gates on verify. The same pipeline state produces contradictory recommendations.
2. There is no aggregated health signal for the project: audit freshness, drift across pipelines, blocking bugs across pipelines, and deploy-readiness are all computable from artifacts but never composed.

**Decision:** Introduce a single pure function `buildProjectSnapshot(dir, { cliVersion, now })` in a new module `lib/snapshot.js`. It computes a canonical `ProjectSnapshot` object that aggregates:
- The root pipeline plus every `features/*/.aitri` sub-pipeline.
- Requirements, test coverage, bugs, technical debt, and backlog items across all pipelines.
- Audit freshness derived from `fs.statSync(AUDIT_REPORT.md).mtime`.
- Derived health signals (`deployable`, `deployableReasons`, `staleAudit`, `driftPresent`, `blockedByBugs`, `activeFeatures`, `versionMismatch`).
- A priority-ordered `nextActions[]` covering all pipelines and all signals in a single list.

The builder is pure (no stdout, no mutation of `.aitri`, no side effects beyond `fs` reads), deterministic given the same disk and `now`, and tolerant of malformed artifacts (each pipeline carries a `parseError` flag; aggregations skip malformed JSON silently).

Observer commands (`status`, `resume`, `validate`) will be rewritten in later phases as thin projections over the snapshot. Phase 1 changes no command behavior and requires no version bump.

**Reasoning:**
- Three user intents — "where am I?" (status), "retake my work with full context" (resume), "can I ship?" (validate) — answer the same data sliced differently. A single builder eliminates the duplicated traversal code and the class of divergence bugs that arise when two commands compute the same predicate independently.
- The current commands answer "how did the initial build go?", not "how is the project today?". Aggregating features and health signals into one object is what makes these commands reflect current reality.
- A pure function is trivially unit-testable and cacheable. Hub can eventually consume the snapshot's JSON form (via `status --json` in a future phase) without coupling to Aitri's internal disk layout — replacing the current contract where Hub reads `.aitri` directly and re-implements discovery rules.
- Keeping the snapshot in its own module (`lib/snapshot.js`) rather than growing `state.js` preserves the established separation: `state.js` exposes primitives (`loadConfig`, `readArtifact`, `hasDrift`); `snapshot.js` is composition. The invariant "only `state.js` touches `.aitri` directly" is preserved — `snapshot.js` uses its helpers.

**Trade-off:** The builder becomes a central spine — a bug in it would affect `status`, `resume`, and `validate` simultaneously when the later phases ship. Mitigations: strict purity, broad unit test coverage with an injected `now`, and graceful degradation on malformed input. A regression is caught by the ~20 unit tests in `test/snapshot.test.js` before any command change.

Audit freshness uses `fs.statSync(...).mtime` rather than a persisted `config.auditLastAt` field. Rationale: audit staleness is informational, not a deploy gate, so it does not justify extending the `.aitri` schema contract (`docs/integrations/SCHEMA.md`) or a version bump. `mtime` is manipulable (e.g., `git clone` resets it), but for an informational signal this is acceptable. If audit ever becomes gate-material, `config.auditLastAt` can be added in a dedicated ADR.

Verify freshness (`tests.stalenessDays`) returns `null` in Phase 1 because `.aitri` does not persist a verify timestamp — `updatedAt` is bumped on every `saveConfig` and is not a reliable proxy. Documented as a known gap in `lib/snapshot.js`. If verify staleness becomes gate-material, `config.verifyRanAt` can be added in a future phase with an accompanying ADR and schema update.

**Follow-up phases (sequence, not scope of this ADR):**
- Phase 2: rewrite `status.js` over the snapshot (short view + `--json` for Hub).
- Phase 3: expand `resume.js` to cover features, health signals, and the priority-ordered next actions.
- Phase 4: rewrite `validate.js` over the snapshot; add `--explain` that lists `deployableReasons`.
- Phase 5: migrate Hub to consume `aitri status --json` (the full snapshot) instead of parsing `.aitri` directly. Update `docs/integrations/*`.
- Phase 6: make `aitri` with no arguments invoke `status` (change `bin/aitri.js:117` default branch).

---

## ADR-023 — 2026-04-17 — Observer command unification (phases 2–6 landed)

**Context:** ADR-022 introduced `buildProjectSnapshot()` as the single source of truth for observer commands and laid out a six-phase rollout. Phases 2–6 completed together in v0.1.77. This ADR closes the loop and records deviations from the original plan.

**What shipped:**
- `lib/commands/status.js`, `lib/commands/resume.js`, and `lib/commands/validate.js` are now thin projections over `buildProjectSnapshot()`. The deploy-gate divergence bug (status suggesting `aitri validate` when phase 4 was approved without checking `verifyPassed`, while resume gated correctly) is resolved — all three commands share `snapshot.nextActions[]`.
- `aitri resume` gained per-feature entries, a Health section for non-deployable projects, and a priority-ordered next-action list (up to 5).
- `aitri validate` gained `--explain` and additive JSON fields (`deployable`, `deployableReasons`, `openBugs`, `blockingBugs`).
- `aitri status --json` gained snapshot extensions (`snapshotVersion`, `features`, `bugs`, `backlog`, `audit`, `health`, `nextActions`) while preserving every legacy field consumed by Hub.
- Bare `aitri` invoked inside a project now runs `aitri status`; outside a project it still shows help.

**Deviation from ADR-022's Phase 5:** The original plan said "migrate Hub to consume `aitri status --json`". That phrasing was too strong. Hub serves both local and remote (GitHub-URL) projects, and `aitri status --json` is only reachable when the CLI is on PATH. Forcing Hub onto that surface would break its remote-project path. Decision: keep `.aitri` + `spec/` as the authoritative contract for remote consumers per `docs/integrations/SCHEMA.md` and `ARTIFACTS.md`; document `aitri status --json` as an **additive, CLI-only** surface in a new `docs/integrations/STATUS_JSON.md` that CLI-colocated consumers *may* use to avoid re-implementing aggregation. No Hub migration is required — it may adopt the new surface opportunistically.

**Reasoning:**
- Additive-only changes let existing Hub readers stay on their `INTEGRATION_LAST_REVIEWED = '0.1.76'` gate without surfacing an alert for a change that does not affect them.
- Splitting "authoritative contract" from "convenience projection" keeps the remote-consumer guarantee intact (Hub never requires the `aitri` binary) while still giving local consumers a way to avoid duplicated logic.

**Trade-off:** Two surfaces (raw files + `status --json`) must be kept in sync — any change to what the snapshot computes must be reflected in both `STATUS_JSON.md` and (if the change affects the raw files it reads) `SCHEMA.md` / `ARTIFACTS.md`. The maintenance cost is small because the snapshot is pure over the same inputs.

**Follow-ups (not blocking):**
- Persist `verifyRanAt` in `.aitri` so `tests.stalenessDays` becomes non-null. Requires a SCHEMA.md bump — separate ADR when prioritized. **Closed v0.1.79** — `verifyRanAt` and `auditLastAt` both persisted; both survive git clone (mtime fallback retained for legacy projects).
- Consider moving `audit.stalenessDays` from `fs.mtime` to a persisted `auditLastAt` field if audit freshness ever becomes a deploy gate. **Closed v0.1.79** — same commit.

---

## ADR-024 — 2026-04-19 — Off-pipeline change detection via `normalizeState` (v0.1.80)

**Context:** After Phase 4 is approved and `verify-complete` has passed, nothing in Aitri prevented the user or agent from editing source code without re-running the pipeline. The next `aitri validate` / `status` would still report the project as deployable because approvals and verify results are point-in-time snapshots of artifact state, not continuous contracts over the source tree. Silent drift in the code → approved state divergence undermined the deployment-readiness claim.

**Options considered:**

1. **Ignore** — document the limitation; push responsibility to git review.
2. **Hash the entire source tree on every status call** — expensive; would walk `src/` / project root on every `status --json` poll from Hub.
3. **Git-based baseline** — record the HEAD SHA at `approve 4` time; diff against current HEAD to detect changes. Fast, idiomatic, integrates with existing git workflows.
4. **mtime-based baseline** — record an ISO timestamp at `approve 4` time; check mtime of source files. Works in non-git projects but unreliable (mtime resets on clone).
5. **Block the next operation until the user acknowledges the change** — disruptive; doesn't match Aitri's passive-observer philosophy.

**Decision:** Hybrid baseline approach. On `approve 4`:
- If the project is a git repo: store `{ method: "git", baseRef: "<HEAD-SHA>" }` in `.aitri.normalizeState`.
- Otherwise: store `{ method: "mtime", baseRef: "<ISO>" }`.

A new command `aitri normalize` re-baselines after the user has classified the changes (by adding to BUGS.json, BACKLOG.json, starting a feature, or acknowledging them as trivial). The snapshot surfaces off-pipeline changes as a priority-4 next-action — informational, non-blocking — with two distinct reasons: `normalizeState.status === 'pending'` (explicitly requested) OR `normalize.uncountedFiles > 0` (git-detected at snapshot time).

**Reasoning:**
- Git-first keeps the common case cheap (one `git rev-list` comparison, no tree walk).
- mtime fallback is honest about its unreliability — STATUS_JSON.md documents that `uncountedFiles` is `null` when `method: "mtime"` to avoid false signals.
- Not blocking preserves the passive-observer philosophy (ADR-001, ADR-023). The user decides what to do about off-pipeline changes; Aitri surfaces the signal, no more.
- Splitting "pending" (user explicitly ran `aitri normalize` and bailed out) from "uncountedFiles > 0" (snapshot-time detection) gives Hub two distinct dashboard states.

**Trade-off:** Two detection paths mean two edge cases to test. mtime method doesn't survive git clone — the `uncountedFiles` count is `null` for non-git projects rather than wrong, which is the right call but requires consumers to handle the null. Added one `.aitri` field (`normalizeState`) — SCHEMA.md bumped, readers must stay defensive.

**Scope note:** `normalize` is distinct from *drift* (ADR-012 era). Drift is "approved artifact was edited after approval"; normalize is "source code changed after the last build approval". Drift surfaces on artifacts (`01_REQUIREMENTS.json`, `04_IMPLEMENTATION_MANIFEST.json`, etc.); normalize surfaces on source files outside `spec/`. Both can be true at once; they do not overlap.

---

## ADR-025 — 2026-04-20 — Cross-pipeline test aggregation in observer surfaces (v0.1.81)

**Context:** ADR-022 established `buildProjectSnapshot()` as the source of truth for observer commands, but `aggregateTests()` only surfaced per-pipeline `verify.summary` objects. A project with a root pipeline plus 8 feature sub-pipelines (e.g. 30 tests on root, ~256 across features) displayed `30/30` on `aitri status` — technically correct for the root scope, but misleading as a project-wide answer. Users and intermediating agents consistently misinterpreted the top-line number as the project total.

**Decision:** Extend `aggregateTests()` to produce a `tests.totals` (sum across all pipelines with a verify.summary) and `tests.perPipeline` (list of `{ scope, passed, failed, total, ran }`). Surface `Σ all pipelines: Passed (N/M)` as a new line in `status` / `resume` text output whenever at least one feature has a verify summary. Add per-feature counts (`verify ✅ (53/61)`) to the feature listing. Emit a new top-level `tests` block in `status --json` — additive; existing `verify.summary` per pipeline preserved unchanged.

**Reasoning:**
- The data already existed inside the snapshot builder — the gap was purely display.
- Additive JSON contract means Hub readers on `INTEGRATION_LAST_REVIEWED <= 0.1.80` see no change; Hub can opt into the new `tests` block when ready.
- Pipelines without a verify summary contribute zero to `totals` (honest floor, not an estimate). `perPipeline[].ran = false` identifies them explicitly so consumers can distinguish "not run yet" from "zero tests".

**Trade-off:** The text output now has one more line when features exist. Legacy smoke tests that compared exact strings would break if they asserted on the absence of `Σ` — acceptable because the change is opt-visible (only when features are present) and the added line is semantically correct for those projects.

---

## ADR-026 — 2026-04-20 — Semantic validation hardening in Phase 1 (v0.1.82)

**Context:** ADR-006 established typed FRs with measurable acceptance criteria, and subsequent changes hardened `validate()` with vagueness checks on ACs (`BROAD_VAGUE` regex). But two gaps remained: vague *titles* ("La app debe funcionar correctamente") passed validation when ACs were specific, and copy-paste of the same AC set across multiple FRs (an anti-pattern of undifferentiated requirements) was not detected. Both were listed as examples in the "Calidad semántica de artifacts" Design Study from v0.1.55 era.

**Decision:**
- Extend the existing `BROAD_VAGUE` loop to also check `fr.title`. Rule: if the title matches `BROAD_VAGUE` AND fewer than 2 substantive tokens remain after stopword/vague-word removal, throw. A substantive token is ≥3 characters, not in the stopword list, and not in `BROAD_VAGUE`. Applied only to MUST FRs (same scope as the existing AC check).
- Detect duplicate ACs across FRs via Jaccard similarity (≥0.9 threshold) on normalized AC sets (lowercase, punctuation stripped, whitespace collapsed). Applied to FRs with ≥3 ACs, any priority. Threshold 0.9 chosen so that legitimately parallel CRUD FRs (1 AC different out of 5) pass, but literal copy-paste (≤1 difference) fails.
- Extend `BROAD_VAGUE` with Spanish qualifiers (`correctamente`, `adecuadamente`, etc.). Aitri targets bilingual projects (CLAUDE.md is ES-written); excluding Spanish was an implicit bias, not a design principle.

**Reasoning:**
- Both gaps had concrete false-positive floors: title vagueness requires a match AND token-count failure; duplicate AC detection requires ≥3 ACs on each side and ≥90% similarity. Neither triggers on legitimate edge cases (short titles without vague words, FRs with partial AC overlap).
- The Design Study's broader question ("¿hasta dónde debe llegar Aitri?") had been answered de facto by the validation model of 2026-03-14 (mechanical checks only, human judges content). These two checks are mechanical and fall within that boundary.
- The remaining gap from the original study — NFR traceability in Phase 2 — does not have a mechanical implementation with low false-positive risk and was left as an open Design Study with a maturation criterion (a real incident).

**Trade-off:** Tightens the gate on Phase 1 — existing projects with vague titles or duplicated ACs will fail `complete 1` after upgrading. No retroactive re-validation (existing approvals untouched), so the gate only fires on the next Phase 1 run. Acceptable because both patterns were always wrong; the gate now surfaces the mistake earlier.

**Scope note:** No schema change. `01_REQUIREMENTS.json` shape is identical. Readers need no updates. ARTIFACTS.md documents the new constraints; CHANGELOG.md flags the gate tightening for Hub review.

---

## ADR-027 — 2026-04-23 — `adopt --upgrade` as reconciliation protocol (v2.0.0)

**Status:** Accepted. Implementation pending.

**Context:** The original design intent of `aitri adopt --upgrade` was to keep existing Aitri-managed projects **functionally and technically current** as Aitri Core evolves. The name "adopt" reflects that: adopt the new contract, absorb the new capabilities, carry forward bug fixes and invariants. In practice, the command that exists does only two things: bump `aitriVersion` in `.aitri/config.json`, and infer `completedPhases` by walking artifact files on disk. Everything else — schema migration, state backfill (normalizeState, verifyRanAt, …), re-validation against new rules, capability opt-in — requires out-of-band manual intervention by the user.

The v0.1.90 Ultron E2E session made this concrete: an Ultron project adopted at v0.1.65 needed **three separate commands** to be genuinely "at v0.1.90" — `adopt --upgrade`, then `normalize --init`, then manual rename of `tc.requirement` → `tc.requirement_id`. Each gap was fixed in v0.1.90 as an individual symptom (A1, A2, A3, A4 in FEEDBACK.md). That work was correct and still stands, but it reveals the architectural gap: **there is no orchestrator.** The gap-fills live as defensive reader tolerance (A1), pre-destruction guards (A2), manual-message corrections (A3), and side-channel flags (A4, `normalize --init`). They are belt-and-suspenders, not a protocol.

`adopt --upgrade` is supposed to BE the protocol. Today it is not — it is a stub that the honest v0.1.90 message finally acknowledges ("bumps the version; artifacts are not migrated").

**Options considered:**

1. **Keep `adopt --upgrade` as cosmetic version sync; expose a separate `aitri migrate` command for actual reconciliation.** Splits the burden across two commands the user must remember to run. Contradicts the user's original design intent.
2. **Auto-reconcile on every CLI invocation when `versionMismatch` is detected.** Low friction, but violates the "no silent writes" principle — Aitri would modify user artifacts without explicit consent.
3. **Redesign `adopt --upgrade` into a full diagnose → plan → confirm → migrate → report protocol.** The command does what its name claims. User runs it consciously when prompted by the `versionMismatch` banner. Explicit, auditable, non-silent. **Selected.**
4. **Block the entire CLI on `versionMismatch` until the user reconciles.** Disruptive. A user who just installed a new CLI on an old project should be able to run `aitri status` and see the mismatch before deciding to upgrade.

**Decision:** In Aitri v2.0.0, `aitri adopt --upgrade` is redesigned into a **five-phase reconciliation protocol**:

1. **DIAGNOSE** — compare the project's current on-disk state against what the running CLI version expects. Produce a catalog of drift across five categories:
   - 🔴 BLOCKING — artifact shapes that downstream commands cannot read (e.g. legacy `tc.requirement` without `requirement_id`, legacy NFR `{title, constraint}` without `{category, requirement}`, misconfigured `artifactsDir`).
   - 🟡 STATE-MISSING — `.aitri` fields introduced in later versions that the project lacks (`normalizeState`, `verifyRanAt`, `auditLastAt`, `lastSession`, `updatedAt`).
   - 🟠 VALIDATOR-GAP — artifacts that pass their original validator but would fail the current one (e.g. FR titles that would fail v0.1.82 vagueness checks, TC IDs that will fail the canonical regex gate).
   - 🔵 CAPABILITY-NEW — features introduced after the project was adopted that are opt-in-able mechanically (multi-FR `frs[]` array, bug audit trail fields for bugs closed after this run, agent instruction files).
   - ⚪ STRUCTURE — project-layout inconsistencies (`artifactsDir` pointing to an empty directory, agent files missing, path capitalization mismatches internal to Aitri).

2. **PLAN + REPORT** — print a human-readable plan grouped by drift category, separating what Aitri will migrate automatically (mechanical transformations) from what requires user or agent decision (content-judgment).

3. **CONFIRM** — isTTY-gated `[y/N]` before any write. Non-interactive callers (CI) must pass `--yes`. `--dry-run` exits after the report. `--only <categories>` limits scope (e.g. `--only BLOCKING,STATE-MISSING`).

4. **MIGRATE** — apply confirmed migrations atomically. Each migration registers a `.aitri.events[].upgrade_migration` entry with `from_version`, `to_version`, `category`, `target` (artifact path or config field), `before_hash`, `after_hash`, and `timestamp`. If any migration fails, the run rolls back all migrations applied in this invocation. `aitriVersion` is written **last** as the atomic commit point.

5. **REPORT** — summary of applied migrations, items flagged for agent review, and next-step commands.

Migration logic is organized in `lib/upgrade/migrations/` as a directory of versioned modules (`from-0.1.65.js`, `from-0.1.70.js`, etc.). Each module exports `diagnose(dir, config)` and `migrate(dir, config, plan)`. `adopt --upgrade` composes them in order — a v0.1.65 project upgrading to v2.0.0 runs all intermediate migrations in sequence.

**Reasoning:**

- The original design intent is sound and addresses a real pain: users upgrading Aitri should be able to bring their projects forward as a conscious act, not as a series of manual rituals discovered by trial.
- The passive-producer invariant is preserved because every write is declared in the plan before it executes, and the user approves explicitly. Aitri migrates *shape*, never *meaning* — multi-FR TCs with comma-separated values are flagged for agent review, not auto-split.
- The individual v0.1.90 fixes (A1 reader tolerance, A2 precondition) remain as **defensive layers** even when upgrade is run. Belt-and-suspenders is correct here: a precondition that rarely fires because upgrade would have fixed the drift is still valuable for the case where the user ran CLI commands before running upgrade.
- `aitri normalize --init` is absorbed as a STATE-MISSING migration step inside upgrade. The standalone flag can remain for power users who want to stamp a baseline without running the full protocol, but the common path is through upgrade.
- Event logging in `.aitri.events[]` keeps migrations auditable and gives Hub a signal it can surface ("3 migrations applied on upgrade from v0.1.65 → v2.0.0").
- Staging migrations by source version (`from-0.1.65.js`, not `to-2.0.0.js`) means every past version has a defined migration path forward. New Aitri releases add new `from-*.js` modules; old ones are immutable history.

**Trade-off:**

- Significant implementation cost. Each migration must be designed, tested, and documented. The initial catalog (v0.1.65 → v2.0.0) has ~15 known migration points.
- Doubles as a forcing function: Aitri maintainers must now declare migrations when they change contracts. A schema change without a corresponding migration in `lib/upgrade/migrations/` is a half-finished feature. This becomes a gate enforced by a new test (`test/upgrade-coverage.test.js`) similar to `test/release-sync.test.js`.
- Increases surface area visible to Hub. New `.aitri.events[].upgrade_migration` entries extend the event log — Hub readers must tolerate unknown event types (they already do).
- Breaking for any external script that assumed `adopt --upgrade` was silent/fast. The new command is interactive by default. Documented; `--yes` flag preserves non-interactive paths.

**Scope note:**

- This is the headline change of v2.0.0. Other v2.0.0 work (IDEA.md → spec/, TC ID canonical regex, command-surface audit outcomes) batches alongside it because v2.0.0 is already a breaking version.
- The v0.1.90 defensive fixes (reader tolerance, verify-run precondition, normalize --init, honest adopt message, deployable banner, bug SHA audit, Docker deagnostic validate, agent-files guidance) **remain in place** in v2.0.0. None are removed. They become the fallback layer for cases where the upgrade protocol did not run or was skipped.
- `lib/commands/normalize.js --init` flag is preserved as a direct-invocation path; the upgrade protocol calls the same underlying stamping logic.
- `adopt scan` / `adopt apply` (greenfield adoption from existing code) are untouched. Only `adopt --upgrade` is redesigned.
- `aitri init` is also untouched. Greenfield projects never need upgrade on creation; they are born on the current version.

**Implementation gate:** An ADR acceptance does not authorize implementation. A v2.0.0 feature branch, an explicit catalog of known migrations, and a staged delivery plan (one migration module at a time, with its own tests) are prerequisites. The current v0.1.90 release stands; v2.0.0 starts from it.

**Operational decisions (confirmed 2026-04-23):**

1. **Feature branch.** Work happens on a dedicated branch (`v2.0.0` or `feat/upgrade-protocol`), not on `main`. After the feature is complete and tested end-to-end (including a re-run of the Ultron brownfield scenario against the new protocol), branch merges to `main`.
2. **Granular commit history.** Each migration module lands as its own commit. No squash at merge. Rationale: a future migration that turns out wrong should be revertible without disturbing adjacent ones.
3. **Staged delivery via pre-releases.** Catalog shipped in tandas, not as a single v2.0.0 release. Sequence: `v2.0.0-alpha.1` = BLOCKING migrations only; `v2.0.0-alpha.2` = STATE-MISSING added; `v2.0.0-alpha.3` = VALIDATOR-GAP reporting; `v2.0.0-alpha.4` = CAPABILITY-NEW + STRUCTURE. Each alpha re-validates against a real brownfield project (Ultron is the canary) before the next tanda begins. Final `v2.0.0` promotes the last alpha.
4. **No intermediate v0.2.0.** The jump is directly from v0.1.x to v2.0.0. Rationale: the semantic shift (stub → protocol) warrants the major bump; diluting it into v0.2.0 first would send an incorrect signal about the magnitude of the change.

**Next-session entry point:** fresh session starts by reading `CLAUDE.md` + this ADR (including the addendum below) + the v2.0.0 catalog in `BACKLOG.md`. First code change: create the branch, scaffold `lib/upgrade/` with `diagnose.js` + `index.js` skeletons (no migrations yet), and wire `adopt --upgrade` to call the new module as a clean replacement of the current legacy logic (see Addendum point 3). First migration module: `lib/upgrade/migrations/from-0.1.65.js` with the three BLOCKING transforms from Ultron (TC `requirement` rename, NFR shape rewrite, `artifactsDir` recovery). Tests before merge of each module.

---

### ADR-027 Addendum — 2026-04-23 — Implementation prerequisites

Three technical details must be decided before the first line of code on the feature branch. They refine — not contradict — the main decision above.

**Branch reminder:** all of the following is implemented on a dedicated branch (`feat/upgrade-protocol` preferred). `main` stays on v0.1.x until the branch merges.

#### 1. Rollback mechanism — ordered writes + recovery message (no transactional rollback)

The original decision text (line 514) says "If any migration fails, the run rolls back all migrations applied in this invocation" with `before_hash` as the anchor. That phrasing overclaims what Node on POSIX can guarantee for a sequence of `fs.writeFileSync` calls across multiple artifacts.

**Refinement:** the MIGRATE phase does **not** promise transactional atomicity. It promises **ordered writes with a deferred version commit**:

- Migrations execute in a deterministic order (BLOCKING → STATE-MISSING → CAPABILITY-NEW → STRUCTURE; VALIDATOR-GAP is report-only and does not write).
- Each migration records `before_hash` in `.aitri.events[].upgrade_migration` **before** its write, and `after_hash` on success.
- `aitriVersion` in `.aitri/config.json` is the **last** write of the entire run. If any migration throws mid-run, `aitriVersion` is not advanced — the project remains on the previous version in the eyes of every other Aitri command.
- On mid-run failure: print the list of completed migrations, the failed one, and a recovery message: `Run: git checkout -- spec/ .aitri/ to restore pre-upgrade state, then re-run aitri adopt --upgrade after resolving the cause.` No auto-undo.

**Why:** real atomicity across N JSON artifacts would require either a write-to-tmp + swap pattern per file (complicates migration authoring) or a journal-replay scheme (introduces its own failure modes). Neither is worth the added complexity when git already serves as the user's rollback mechanism for the common brownfield case.

**Invariant:** no partial write to `.aitri/config.json`. `aitriVersion` is never advanced on a failed run.

#### 2. Migrations transform shape, never meaning

Every migration module must uphold: **mechanical shape transformations only.** No migration infers semantic content.

Examples of permitted shape transforms:
- Field rename: `tc.requirement` → `tc.requirement_id`.
- Shape rewrite: NFR `{title, constraint}` → `{category, requirement}` where `category` is mapped by a finite lookup and `requirement` is a string copy.
- Backfill from deterministic source: `updatedAt` ← current time; `verifyRanAt` ← newest `04_TEST_RESULTS.json` mtime.

Examples of **forbidden** auto-transforms — these must flag for agent review instead:
- Multi-FR TC with comma-separated `requirement_id` (e.g. `"FR-001, FR-002"`) → do **not** auto-split. Flag as VALIDATOR-GAP with the suggestion: "re-run Phase 3 with current briefing to re-author these TCs."
- FR titles that would fail the v0.1.82 `BROAD_VAGUE` check → do **not** auto-rewrite. Flag, report, let the agent re-author.
- TC IDs non-canonical under the future regex gate → do **not** auto-rename. Flag, report. Consumers reference TCs by ID; Aitri cannot safely rewrite references it does not own.

**Why:** Aitri is a passive producer. Inferring meaning (splitting, paraphrasing, renaming references) crosses into content-authoring — the agent's job. A migration that guesses is worse than one that reports; a wrong guess corrupts the artifact chain silently.

**Invariant in code:** each migration module comment block must declare `shape-only: true` and describe the transform in one sentence. Reviewers reject any module that derives new semantic content from existing content.

#### 3. Clean replacement, not parallel execution

The main-decision text ("call the new module alongside [not instead of] the current legacy logic") is revised to a clean replacement:

- The current `adoptUpgrade` function in `lib/commands/adopt.js:637-723` contains two real migration-like behaviors today: `artifactsDir` recovery (lines 643-661) and `writeAgentFiles` regeneration (lines 714-722). Both are **moved into the new module**, not duplicated.
- After the move, `adoptUpgrade` in `adopt.js` becomes a thin dispatcher: `return runUpgrade(dir, config, { VERSION, rootDir, ...flags });`.
- The phase-inference logic currently in `adoptUpgrade` (lines 663-677, walking artifacts to populate `completedPhases`) also moves into the new module as a STATE-MISSING or STRUCTURE step, depending on whether the project was adopted pre-pipeline (STRUCTURE) or simply has completedPhases drift (STATE-MISSING). Decide at implementation time per the actual logic.

**Why:** parallel paths complicate reasoning about invariants ("which code path runs if both fire?"). A single code path with all behavior consolidated is easier to test, review, and extend.

**Invariant in code:** `lib/commands/adopt.js` contains no upgrade logic after the refactor, only the dispatcher. The file `lib/upgrade/index.js` is the single entry point.

#### 4. Shape-only migrations preserve approval (no post-upgrade drift) — added 2026-04-24

**Discovered by canary on real Ultron** (v0.1.89 → v0.1.90), not by fixture testing. The first Ultron run revealed that migrating 16 TCs + 4 NFRs changed their content hashes, which tripped `hasDrift` on every migrated phase. Immediately after upgrade, `aitri status` demanded re-approval of `requirements` + `tests`. That is semantically wrong under §2 — the agent-approved *content* did not change, only the serialization.

**Refinement:** every shape-only migration that writes an approved artifact must also update `config.artifactHashes[phaseKey]` to match the new content, preserving the approval across the migration.

**Rules:**

- **Only update the hash when a hash was already stored.** If the phase was never approved (no entry in `config.artifactHashes`), do NOT synthesize a baseline. Stamping a hash on a non-approved phase would fake an approval that never existed.
- **Do NOT touch `config.driftPhases[]`.** If a phase was already in drift (the user had modified the artifact outside the pipeline before running upgrade), the drift stays. The agent decides what to do with it — the migration does not silently clear the signal.
- **The hash update happens INSIDE the migration's `apply(config)`**, right after the `fs.writeFileSync` for the new content. Same call, same closure, same `afterHash`. Reuses the hash computed during `diagnose()`.

**Scope:**

- Applies to every BLOCKING migration that rewrites an artifact tracked by `artifactHashes` (today: `01_REQUIREMENTS.json` → key `"1"`, `03_TEST_CASES.json` → key `"3"`). Future per-version modules that rewrite other phase artifacts must follow the same discipline.
- Does NOT apply to STATE-MISSING backfills (no artifact write) or VALIDATOR-GAP findings (no write at all).

**Why this is §2-compatible, not a §2 violation:**

§2 says migrations transform *shape* and never *meaning*. An approval is semantic consent on *meaning*. Preserving the hash after a shape-only rewrite means "the approval you gave on the content still holds; only the serialization changed." If a migration ever infers content (e.g. splits a multi-FR TC), that's a §2 violation regardless of what we do with hashes — the hash preservation rule does not licence semantic changes.

**Invariant in code:** the helper `updatePhaseHashIfApproved(config, phaseKey, newHash)` is the only legitimate writer of `config.artifactHashes` from inside a migration module. It checks `config.artifactHashes[phaseKey] !== undefined` before writing. Test coverage in `test/upgrade.test.js` asserts (a) hash is updated when approved, (b) hash is NOT stamped when not approved, (c) `driftPhases[]` is never modified.

**Evidentiary note:** this rule exists because a real canary surfaced it. Fixture tests (which I designed to match my own code) did not — they all used non-approved phases, so the drift never triggered. When Hub becomes a canary target, the same discipline applies: if Hub surfaces a new class of post-upgrade surprise, the rule-set expands. Do not paper over real-project signals to preserve a green run.

#### 5. `test/upgrade-coverage.test.js` gate — not implemented, by decision — added 2026-04-24

The main-decision "Trade-off" section (see above) committed to a new CI gate analogous to `test/release-sync.test.js`: any change to `lib/phases/phase*.js validate()`, artifact schemas, or `.aitri` field set without a corresponding entry in the most recent `from-*.js` migration module would block CI. It does not exist and will not be written as part of `v2.0.0-alpha.1`.

**Why not:**

- `release-sync.test.js` (55 lines) validates mechanical regex equality: two constants match, four doc headers match a pattern. It is a real gate because the check is binary and local. The proposed upgrade-coverage gate is structurally different: it would need to decide whether a schema change is *additive-only* (no migration needed) or *breaking* (migration required). That is semantic judgment, not regex equality.
- A naive implementation (e.g. "any diff in `lib/phases/phase*.js::validate()` without a touched migration module"). A version of this that forces all additive changes through a no-op migration entry becomes a checkbox test. Within 2-3 releases it is ignored or commented out. Then it is theater blocking CI.
- No corresponding gate exists today for the other schema-drift risks Aitri tolerates (NFR tolerant reads, multiple TC shape aliases). Adding a heavyweight gate for upgrade migrations specifically is inconsistent.

**What replaces it (softer forcing functions):**

- **`docs/integrations/CHANGELOG.md` + ARTIFACTS.md + SCHEMA.md update discipline.** The CLAUDE.md rule already says schema changes must land with doc updates in the same commit. Enforced by human code review, not by CI.
- **Canary on a second real project.** Evidence beats static check: a real brownfield project (Ultron, then Hub, then others) catches omissions the gate could only partially detect. This is the stronger signal.
- **Test: each migration module has its own regression test in `test/upgrade.test.js`.** If someone adds a new migration without a test, the `test/upgrade.test.js` structure makes the omission visually obvious on review.

**Reconsider if:** a future release introduces a schema change without a migration module and that omission reaches a real project. Evidence of the specific defect the gate was meant to prevent would justify writing it. Without that evidence, the gate is preventive architecture — exactly the kind of noise CLAUDE.md warns against.

#### Summary of addendum decisions

| # | Topic | Decision |
|:---|:---|:---|
| 1 | Rollback | Ordered writes + `aitriVersion` last + recovery message. No transactional atomicity. |
| 2 | Shape vs meaning | Migrations transform shape only. Ambiguous content → flag for agent, never auto-resolve. |
| 3 | Legacy coexistence | Clean replacement. Existing behaviors in `adoptUpgrade` absorb into the new module. |
| 4 | Approval preservation | Shape-only migrations update `artifactHashes[phase]` to avoid post-upgrade drift. Only when phase was approved. `driftPhases[]` untouched. |
| 5 | Coverage gate | `test/upgrade-coverage.test.js` is NOT written. Semantic judgment cannot be collapsed to regex equality. Doc discipline + real-project canary carry the load. Revisit if evidence of the specific defect emerges. |

These five points are binding on the implementation. If during alpha.1 any of them proves wrong, a new addendum amends the specific point — none is silently discarded.

### ADR-027 Amendment — 2026-05-02 — Migration module naming is heuristic, not contract

**Context:** The original ADR text describes migration modules as `from-0.1.65.js`, `from-0.1.70.js`, etc. — implying per-source-version boundaries. In practice, a single module (`from-0.1.65.js`) has accumulated migrations introduced across v0.1.63 through v2.0.0-alpha.17. No splits have happened despite multiple version boundaries crossed.

**Why it works without splits:** every diagnose function gates on **field presence** in the current `.aitri` or artifact, not on the source version of the project. A v0.1.65 project and a v0.1.80 project both run through the same diagnose chain; each finding either fires (field absent or shape legacy) or no-ops (field already canonical). The file name `from-0.1.65.js` documents the lowest source version the module aims to lift, not a strict per-version boundary.

**Decision:** the `from-X.Y.Z.js` naming is a heuristic for the lowest source version covered, **not a contract** that each per-version delta gets its own file. Splits happen organically when a new module is naturally cohesive (e.g. a v2.x schema cluster that has no field-presence overlap with the existing module). Splitting prematurely — purely to honor the original per-boundary implication — would be cosmetic and would not improve the gating logic.

**Trade-off:** the naming becomes informational rather than load-bearing. Future readers must know that field-presence gating is the actual contract, not the file name. This amendment makes that explicit so the discrepancy is no longer a recurring backlog item.

**Re-open criterion:** if a future schema cluster (e.g. v0.2.0+ coordinated change) produces a natural split where field-presence patterns no longer overlap with the existing module, create `from-0.2.0.js` (or appropriate name). Until that organic split appears, the existing module is correct as-is.

---

## ADR-028 — 2026-04-24 — Open question: `.aitri` mixes shared and per-machine state

**Status:** Open — no action until a second real signal.

**Context:** During the Hub canary for v2.0.0-alpha.1 (FEEDBACK H3), Hub was observed to have `.aitri` listed in `.gitignore` with the comment `# Aitri config (project-specific, not shared)`. This creates an asymmetry with the integration contract:

- Hub reads `.aitri` from other projects for pull-based change detection (per SCHEMA.md `updatedAt`).
- Hub's own `.aitri` is not tracked, so any consumer of Hub-as-project sees nothing on a fresh clone.
- `normalizeState.baseRef` is a git SHA but the file that stores it is not in git.

The deeper issue: `.aitri/config.json` serializes two kinds of state in one file.

**Shared state** (makes sense committed — Hub and future consumers depend on it):
`approvedPhases`, `completedPhases`, `artifactHashes`, `events[]`, `updatedAt`, `verifyPassed`, `verifySummary`, `verifyRanAt`, `auditLastAt`, `rejections`, `aitriVersion`, `createdAt`, `projectName`.

**Per-machine state** (noisy if committed):
`lastSession.when` (local timestamp), `lastSession.agent` (detected env), `normalizeState.lastRun` (local event time), `normalizeState.baseRef` (meaningful only against the local workdir).

When `.aitri` is committed, every `verify-run` / `complete` / `approve` / `checkpoint` rewrites per-machine fields and creates commit noise. That noise is the trigger a team cites when they decide to gitignore the file — at which point they lose the shared-state contract without realizing it.

**Options considered:**

1. **Split into `.aitri/config.json` (shared, tracked) + `.aitri/local.json` (per-machine, gitignored).** Clean design. Eliminates the trade-off entirely. Requires: breaking schema change, migration category in `lib/upgrade/`, update to SCHEMA.md, Hub contract update. Cost is moderate; the evidence is a single canary signal.
2. **Document the current mixed schema + recommend commit + accept the noise.** Free. Teams make the choice consciously. Does not fix the underlying mix. Selected for now.
3. **Do nothing — treat as Hub's local decision.** Dismissive. The mix is real; Hub's gitignoring is a predictable reaction, not a misconfiguration. Any team with more than one operator will hit the same trade-off.

**Decision:** Option 2 now (documented in SCHEMA.md §"Should `.aitri` be committed?"). Option 1 stays open as an ADR-tracked question.

**Rationale for deferring Option 1:**

- **Single-canary evidence.** The `IDEA.md → spec/` move was dropped from v2.0.0 for exactly this reason — "opportunistic colado in the breaking-version window". Doing it with one signal would repeat that error.
- **The cost is not trivial.** Splitting reshapes the file that every Aitri command and every subproduct reads. A breaking change here reverberates through Hub and any future consumer.
- **The current trade-off is honest, not broken.** Documentation makes the choice explicit. Teams that care can gitignore and accept the consequences; teams that don't can commit and accept the noise.

**Criterion to reopen (either condition):**

- A second real project surfaces the same asymmetry (another team chooses to gitignore, or another consumer needs to read a gitignored `.aitri`).
- A consumer (Hub or another subproduct) explicitly requests the split because the mix blocks a concrete feature.

Without either, the gate is "architectural discomfort" — insufficient under the evidence-before-breakage discipline.

**Scope of this ADR:** documentation only. No code changes, no test changes, no migration module. When reopened, this ADR is superseded by a new one that records the breaking-change decision.

---

## ADR-029 — 2026-04-28 — Output-contract tests must execute against the consumer, not string-match a designed shape

**Status:** Active.

**Context:** v2.0.0-alpha.6 shipped a fix for the Ultron-canary destructive bug (alpha.4: scope-blind `PIPELINE INSTRUCTION` could overwrite the parent's approved UX spec). The fix introduced `commandPrefix(featureRoot, scopeName) → 'feature <name> '` placed before the verb, producing strings like `aitri feature network-monitoring complete ux`. The full test suite (1012/1012 green) included new feature-context assertions in `approve.test.js`, `complete.test.js`, `reject.test.js`, `verify.test.js`, and `phaseUX.test.js` — every one passed.

The Ultron canary on alpha.6 caught the regression at handoff #1: literal copy-paste of the emitted command failed with `Feature "complete" not found`. Reason — `feature.js:42-50` parses the **first token after `feature` as the verb**, not as the name. The actual CLI grammar is `aitri feature <verb> <name> <phase>`, not the inverted form alpha.6 emitted. 8/8 handoffs in the canary reported the same broken pattern; promotion of alpha.6 to v2.0.0 stable would have shipped the bug.

**Why every test passed.** Each new assertion was of the form `assert.ok(out.includes('aitri feature foo run-phase architecture'))` — verifying that the output matched the string the test author **designed**. The author of the test was the same agent that designed the helper. Both held the same wrong mental model (single prefix before the verb). The test confirmed self-consistency, not correctness against the actual parser.

**Decision:** When a test asserts properties of an output that another part of the system will parse, the assertion must execute the output against the actual parser logic (or a faithful local mirror of it), not match a string the test author chose. "The output must be parseable by the consumer" is the contract; "the output looks like X" is a proxy that fails when author and consumer mental models drift.

**Implementation in alpha.7:** new `test/scope.test.js` block extracts every `aitri feature <X> <Y>` from a synthetic output stream and applies the dispatch logic from `feature.js` (first-token-is-verb) to verify `<X>` is a recognized verb. If the alpha.6 inversion ever reappears, this test fails on the first occurrence — without waiting for an external canary.

**Trade-off:** more setup per output-contract test (the test must know enough about the consumer to reproduce its parse). Mitigation: when the consumer is internal (feature.js, phase validators, etc.), import its actual logic rather than mirror it. The cost is acceptable; the alternative — alpha.6 — is shipping broken contracts that pass green CI.

**Where else this principle applies (radar, not commitments):**

- **Manifest schema → `phase4.js::validate()`.** The build briefing presents fields as optional; the validator rejects when missing. Today's tests check the validator, not the briefing-against-validator pair. A round-trip test would assert that a manifest produced by following the briefing literally passes `validate()`. The Ultron canary's "alpha.7 manifest schema drift" finding is exactly this gap.
- **Briefing → state transitions.** Tests check that `complete` updates state correctly when given a valid artifact. Less tested: the briefing the agent receives produces an artifact that the validator accepts.
- **`status --json` → Hub readers.** ARTIFACTS.md and STATUS_JSON.md are the contracts; consumer code parses against them. A round-trip test would generate a representative snapshot, write it as `status --json` would, and parse it through Hub's reader (or a local mirror).

**Rule for the test suite going forward:** when adding a test for any output Aitri produces that another piece of code or external consumer will read, the assertion shape must be "the consumer can parse this output correctly", not "this output contains the string I expected". If the consumer is internal, import or mirror the parse. If external, document the parse as part of the contract.

**Scope of this ADR:** principle binding on future tests. Existing tests are not retroactively rewritten — they migrate to the new shape when their surface produces a defect that the round-trip variant would have caught.

**Evidentiary note:** the alpha.6 → alpha.7 cycle is the third instance in this project where canary signal exposed a defect that internal tests missed (others: ADR-027 §4 hash-preservation, ADR-026 Phase 1 vagueness rule). The pattern — "tests written by the implementer, against fixtures the implementer chose, passing while real-project use exposes the defect" — is now explicit. The round-trip principle is the structural counter to the pattern, but it works only if applied; vigilance over each new test is required.

---

## ADR-030 — 2026-05-02 — A2 (cascading root → features upgrade) deferred indefinitely

**Status:** Active (Deferred indefinitely with explicit re-open criteria).

**Context:** `aitri adopt --upgrade` invoked at the project root operates on the root `.aitri` only. Sub-pipelines under `features/<name>/.aitri` are not touched — their `aitriVersion` and any pending migrations remain at whatever state they were last written. The asymmetry was first observed in the Zombite canary 2026-04-29 (`stabilizacion` feature kept `aitriVersion: null` after root upgrade).

**Three reconfirmations, no consumer signal of harm:**

1. **Zombite (2026-04-29, alpha.4 → alpha.13):** root upgrade produced normal results; `stabilizacion` feature `.aitri` left at the pre-upgrade state. Surfaced as A2. Operator was not blocked — feature commands continued to work because the gates the feature actually exercises are state-presence gates, not version-comparison gates.
2. **Cesar shallow canary (2026-05-02 AM, alpha.4 → alpha.15 dry-run):** same shape — root mutates, 9 features remain INTACT. No defect surfaced; tooling continued to function.
3. **Cesar deepening canary (2026-05-02 PM, alpha.4 → alpha.15 real):** confirmed for the third time. All 9 feature `.aitri` md5s INTACT after root upgrade. No defect. The N1 finding (legacy `.venv/`-relative manifest paths) was an alpha.9 cwd-change interaction that fired identically on root and on features when each was eventually upgraded — A2 cascading would not have helped the operator catch it earlier.

**Decision:** A2 is deferred indefinitely. The original BACKLOG entry framed it as "Re-open for v2.0.0 pre-stable or v2.0.1" — that timeline came and went without action across alphas 3–18, and the case has accumulated negative evidence ("we keep finding it but no operator gets hurt").

**Why deferral is the correct posture, not implementation:**

- **No consumer harm in three observations.** The asymmetry exists; the consequences do not. Aitri's gates are field-presence based, so a feature `.aitri` at a stale `aitriVersion` continues to satisfy gates as long as the field shapes match what the running CLI expects (which migrations would have ensured at the project root anyway, since features and root share the same `lib/upgrade/migrations/` rules when invoked).
- **Implementation cost is moderate-to-high.** Cascading requires deciding how `diagnose()` composes findings across scopes, how the report aggregates per-feature output, how `--dry-run` previews multi-scope changes without confusion, and whether per-feature confirmation is required (operators may want to upgrade root but skip a stale feature). None of these decisions has obvious right answers without consumer input.
- **Premature implementation locks in answers without evidence.** The "right" composition rule depends on what consumers actually want: parallel cascade (all features at once), interactive per-feature, root-only with explicit `--features` flag, etc. Picking now is design-by-imagination per CLAUDE.md.

**Re-open criteria (either condition):**

1. A third-party adopter explicitly requests cascading because the current asymmetry blocks a concrete workflow they need (operator running `--upgrade` once at root and expecting features to follow).
2. A future migration becomes load-bearing for feature-scope state in a way that the operator cannot reasonably trigger by entering each feature dir manually (e.g. a state field that drives a verify/approve gate in a way that fails silently when stale).

Without either, the asymmetry stays. The BACKLOG entry remains as a tracking pointer to this ADR, not as a pending work item.

**Scope of this ADR:** decision-only. No code change. The BACKLOG entry for A2 is updated to reference this ADR; no other action.

**What this ADR does NOT decide:** if criterion (1) or (2) fires, the implementation strategy (parallel vs interactive vs explicit-flag) is open and must be designed against the actual consumer signal at that time. This ADR closes the question "should we implement now?" — not "how should we implement when triggered?".
