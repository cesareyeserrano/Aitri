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

**Addendum — 2026-07-05 (rc.159, HUB-CANARY-0705): criterion 2 triggered for on-disk artifact RENAMES only; `.aitri` state cascade stays deferred.** The rc.41 artifact rename (ADR-042, post-dating this ADR) became load-bearing for feature scope: rc.41+ code reads feature artifacts by NEW name (`feature.js` reads `04_BUILD_REPORT.json`), so a root upgrade that leaves `features/*/spec/` under pre-rc.41 names breaks that feature's phase 4/5 silently — and the operator cannot fix it by entering the feature dir, because `adopt --upgrade` is a root-scoped command. First real hit: Aitri Hub upgrade (rc.15 → rc.158, 10 features), which also exposed a second-order effect — the IDEA-ref classifier treated an old-named frozen record as editable narrative. `diagnoseRenamedArtifacts` now walks feature dirs (file renames only, content unchanged); feature `.aitri` state remains untouched, and the full A2 state cascade remains deferred under the same criteria.

Without either, the asymmetry stays. The BACKLOG entry remains as a tracking pointer to this ADR, not as a pending work item.

**Scope of this ADR:** decision-only. No code change. The BACKLOG entry for A2 is updated to reference this ADR; no other action.

**What this ADR does NOT decide:** if criterion (1) or (2) fires, the implementation strategy (parallel vs interactive vs explicit-flag) is open and must be designed against the actual consumer signal at that time. This ADR closes the question "should we implement now?" — not "how should we implement when triggered?".

---

## ADR-031 — 2026-05-03 — Destructive migrations: structural auto-fix where Aitri owns the schema; honor system elsewhere

**Status:** Active.

**Context:** Three consecutive alphas had to converge on the right shape of a single migration:

- **alpha.17** introduced `diagnoseOrphanIdea` which absorbed `IDEA.md` content into `01_REQUIREMENTS.json#original_brief` and unlinked the file. No pre-flight check for downstream artifact references existed. Hub had `04_IMPLEMENTATION_MANIFEST.json::files_modified[i].path === "IDEA.md"`, plus 5 other references across feature artifacts. The unlink succeeded silently; `aitri verify-run` then failed with ENOENT on a Hub TC that grep'd `IDEA.md`.
- **alpha.22** (hotfix, 2026-05-02 PM) — `aitri validate` was gating on `fs.existsSync('IDEA.md')` and falsely reporting `❌ IDEA.md` after absorption. Removal of an incorrect assumption (file-presence ≡ brief-present); not a new abstraction. Justified bypass of velocity gate per CLAUDE.md "Purpose over process" exception.
- **alpha.24** (hotfix, 2026-05-02 night) added `findIdeaPathReferences()` — a regex-based pre-flight scan that emits a `validatorGap` and blocks the unlink when any artifact contains `\bIDEA\.md\b`. Reactive, conservative, all-or-nothing.

The alpha.24 surface is incomplete. It detects, but it does not differentiate. A regex hit on `04_TEST_RESULTS.json` (a frozen record auto-generated by `verify-run`) is treated identically to a hit on `04_IMPLEMENTATION_MANIFEST.json::files_modified[i].path` (a live deliverable pointer). The operator gets a single "6 references" finding and is left to classify them by hand. For a project base growing past a single canary, that cost scales with adopter count: every consumer hitting this case repeats the same manual triage.

**Principle violated by alpha.17 and partially codified by alpha.24:** *destructive on-disk operations in upgrade migrations must pre-flight scan for downstream references before proceeding.* alpha.24 implements the scan but stops at flag-only.

**Refinement decided by this ADR (lands in alpha.25):** the scan must be **schema-aware**, not just regex-based. Each reference is classified into one of three buckets based on where Aitri's authority extends:

1. **`auto_fixable`** — reference lives in a field Aitri owns (documented in `ARTIFACTS.md` and validated by `lib/phases/phase*.js::validate()`). The migration applies a mechanical shape transform (drop array element, drop entry) and re-stamps `artifactHashes[<phase>]`. This is §2-compliant: not semantic inference, but removal of a structurally invalid pointer to a file the migration itself is about to delete.
2. **`narrative`** — reference lives anywhere else: free-form JSON fields (`test_data.*`), project-extension shapes (Hub's `verification.smoke_checks[i].command`), narrative bodies (Markdown `.md`), free-text strings (`technical_debt[i].substitution`). Aitri does not own these. Flag as `validatorGap` advisory; operator decides.
3. **`frozen`** — reference lives in an artifact that is, by design, an immutable historical record: `04_TEST_RESULTS.json` (auto-generated by verify-run), `05_PROOF_OF_COMPLIANCE.json` (Phase 5 evidence). Modifying these falsifies history. **Skip silently** — do not surface as a finding requiring action.

**Decision (operational rules):**

- *Auto-fix is bounded by `validate()` enforcement.* If `phaseN.js::validate()` does not enforce the field's shape, Aitri does not auto-modify it. Free-form fields (`test_data: {}`, project-extension keys) stay narrative. This is the operational reading of §2 ("shape transforms only"): shape is what the validator owns; everything else is content.
- *Pre-flight blocking decision is post-auto-fix.* The migration first applies all `auto_fixable` transforms, then re-evaluates. If `narrative.length > 0`, block the destructive op (preserves alpha.24's safety guarantee). If `narrative.length === 0`, proceed with the destructive op in the same migration run. Frozen refs never count toward the block.
- *Frozen artifacts are silently skipped.* They appear in no finding, no advisory, no telemetry beyond an internal `frozenCount` for tests. Surfacing them encourages bad action (rewriting evidence); silence encourages correct action (leave them alone).
- *Discovery primitive stays as regex (`/\bIDEA\.md\b/`).* Schema-walk drives classification of structured fields; regex drives classification of narrative bodies. Both feed the same three-bucket output.

**Trade-off:** the classifier is wider than alpha.24's scan and requires a per-artifact field-path map. For new artifacts that don't yet appear in the map (a future v2.X artifact added to the chain), the default fallback is "narrative-flag everything" — conservative, the same as alpha.24. New artifacts opt in to `auto_fixable` only when explicitly registered in the classifier.

**Why this ADR is broader than the IDEA.md case:** the principle is parameterized over *(destructive op, ref pattern)*, not over `IDEA.md` specifically. Future migrations that unlink, rename, or move any project-owned file (artifact or otherwise) inherit the same protocol: pre-flight scan classified by schema authority, structural auto-fix where Aitri owns, narrative flag elsewhere, frozen silently skipped. The classifier module (`lib/upgrade/idea-ref-classifier.js`) is named for its first instance but its shape is reusable — when a second case arises, generalize the module rather than duplicate it.

**Why narrow-evidence rule does not block this ADR:** the case it codifies is a *removal of an incorrect assumption*, not a new speculative abstraction. alpha.17's silent unlink + alpha.22 + alpha.24 are three documented incidents; the next migration with the same shape (any future destructive op) inherits the same risk class. Codifying the principle is preventive against a class of bug that has already produced two consecutive hotfixes — not against a hypothetical future. CLAUDE.md "evidence narrow but only where applicable" explicitly carves out *"a removal of an incorrect assumption rather than the addition of a new abstraction"* as exempt from the third-party-canary gate.

**Scope of this ADR:**
- Decides: the three-category model and the auto-fix/block/skip rules.
- Does not decide: the specific field-path map (which fields are `auto_fixable` for any given artifact). That map lives in code (`idea-ref-classifier.js`) and is updated as new auto-fixable cases are identified per consumer signal.
- Does not decide: whether to extend auto-fix to free-form `test_data`. The current answer is no (§2 binding); a future ADR may revisit if a real consumer surfaces a need that narrative-flag cannot cover.

### Addendum — 2026-05-03 (alpha.26) — Post-destructive on-disk audit protocol

ADR-031 codified the **producer side** of the destructive-op contract (the migration that performs the unlink/rename/move). The Ultron blocker reported 2026-05-03 — re-running `aitri run-phase architecture` failed with `Missing required file: IDEA.md` after Phase 1 absorption — surfaced the missing **consumer side**: every code path that previously assumed the file's presence is a latent bug class that survives the producer fix.

**Bug class.** When a destructive on-disk operation ships (here: `lib/commands/approve.js` archives `IDEA.md` into `01_REQUIREMENTS.json#original_brief` and unlinks the file on first approve of Phase 1, since v0.1.89), every callsite that was written before the change and depends on the file's presence becomes a future blocker. The blocker doesn't fire immediately because those callsites typically run BEFORE the destructive op (greenfield projects) or are gated by schema (artifact validators) — they fire on the **second pass**: re-runs, re-validations, re-builds on already-approved projects.

**Three observed instances of this class so far:**
1. `lib/commands/validate.js` gated on `fs.existsSync('IDEA.md')` → falsely reported `❌ IDEA.md` post-absorption. Closed by alpha.22 (`ideaBriefStatus` helper accepts either path).
2. `lib/upgrade/migrations/from-0.1.65.js::diagnoseOrphanIdea` unlinked IDEA.md without scanning downstream artifacts → broke Hub. Closed by alpha.24 (regex pre-flight) + alpha.25 (schema-aware classifier).
3. `lib/phases/phase2.js` and `lib/phases/phaseUX.js` declared `IDEA.md` as a required input, but `buildBriefing` never read `inputs['IDEA.md']`. The `run-phase.js` gate hard-failed on missing inputs even though the briefing was unaffected. Closed by alpha.26 (declaration removed; structural guard test added).

**Three hotfixes on the same producer event = systemic gap, not three coincidences.** Per-incident fixes plug the hole the user just found; the next incident is wherever the next consumer hits the next stale assumption.

**Audit protocol** (mandatory when a destructive on-disk op is added, applied retroactively for the IDEA.md case in alpha.26):

1. Identify the file/path being removed.
2. `grep -rn "<filename>" lib/ templates/ --include='*.js' --include='*.md'` — enumerate every callsite.
3. Classify each callsite:
   - **Pre-destructive consumer** (runs before the destructive op fires): unaffected, no change.
   - **Post-destructive consumer** (runs after): must be updated to read from the new SSoT (e.g. `original_brief`) OR have its dependency on the file removed entirely (dead declaration).
   - **The destructive op itself** (the producer): subject to ADR-031's pre-flight scan rules.
4. Add a **structural guard test** that prevents regression at the type/schema level. For the IDEA.md case: `test/phases/inputs-contract.test.js` walks `PHASE_DEFS` and asserts no post-Phase-1 phase declares IDEA.md as a required input.
5. Functional regression test for at least one real-world reproduction (e.g. `cmdRunPhase('architecture')` on an absorbed-brief fixture must not throw).
6. Document the audit in this addendum so the next destructive op author knows the protocol exists.

**Why this addendum is not a separate ADR.** The producer-side principle (ADR-031) and the consumer-side principle are two halves of the same invariant: *destructive on-disk operations carry a bidirectional audit obligation*. Splitting them into separate ADRs invites someone to read one and miss the other. The producer-side already lives here; the consumer-side joins it as the addendum.

**Scope of this addendum:**
- Decides: the bidirectional obligation is part of ADR-031's contract.
- Decides: the post-destructive audit protocol is the operationalization of "consumer-side coverage".
- Does not decide: whether to add a generic "files Aitri removes" registry that could automate the audit. That's a future enhancement gated on a second destructive op shipping (today only IDEA.md is removed; one data point is insufficient).

### Addendum 2 — 2026-05-03 (alpha.27) — Producer-side at-approve-time pre-flight scan

Addendum 1 codified the consumer-side audit (every callsite that depends on a file's presence must be enumerated when the destructive op ships). Addendum 2 closes the **fourth instance of the same bug class**: `lib/commands/approve.js::archiveIdeaIntoRequirements` (since v0.1.89) unlinks IDEA.md on first approve of Phase 1 without scanning whether downstream artifacts reference the file as a runtime path. Hub paid the cost: TC-015h + TC-018f referenced `IDEA.md` from `tests/integration/hub-web-only.test.js` via `readFileSync`, and `04_IMPLEMENTATION_MANIFEST.json::files_modified[i].path === "IDEA.md"`. After the v0.1.89-shipped approve absorbed and unlinked the file, those refs broke at the next `aitri verify-run` — silently in the spec, loudly in the test runner.

**The four instances of the class** (chronological, all on the IDEA.md producer event):
1. `validate.js` gating on `fs.existsSync('IDEA.md')` → falsely flagged absorbed-brief projects. Closed alpha.22.
2. `lib/upgrade/migrations/from-0.1.65.js::diagnoseOrphanIdea` unlinking without pre-flight scan. Closed alpha.24 (regex pre-flight) + alpha.25 (schema-aware classifier).
3. `lib/phases/{phase2,phaseUX}.js` declaring IDEA.md as required input (dead declaration; gate hard-failed on missing). Closed alpha.26.
4. `lib/commands/approve.js::archiveIdeaIntoRequirements` running the destructive op without scanning. Closed by this release (alpha.27) — producer-side pre-flight scan added to approve.

**Producer-side principle.** Addendum 1 (consumer-side) operates on already-shipped destructive ops, auditing every callsite. **Addendum 2 (producer-side) operates at the destructive op itself, gating it.**

**Operational rule for any destructive on-disk operation in Aitri:**

> Before executing the destructive op (unlink, rename, move), the producing command MUST classify downstream references using the schema-aware classifier (per ADR-031 §main). Apply auto_fixable transforms mechanically. If narrative refs remain, BLOCK the operation with an actionable error listing each ref by file + JSON-path. Frozen evidence is silently skipped.
>
> The destructive op proceeds only when post-classification narrative count is zero.

**Why block instead of warn?** A warning operator can ignore is a future hotfix. The Hub case proved this: the v0.1.89 approve had no scan at all, no warn, no block — pure silent destruction. Addendum 1 retroactively added detection in the migrator (alpha.24/25), but operators who never ran `adopt --upgrade` saw nothing until verify-run failed days later. Hard block at the producer is the only surface that prevents the next case before it ships.

**Auto-fix rules (same as ADR-031 §main):** drop element from documented manifest arrays (`files_created`, `files_modified`, `test_files`); re-stamp `artifactHashes[<phase>]` if the affected phase was approved; emit `approve_preflight_autofix` event with before/after hashes. Auto-fixes apply even when narrative blocks the op — they are independently valid structural cleanup; operator inspects via `git diff` and can revert if intentional.

**No escape hatch for the block.** A `--accept-stale-refs` or `--force-absorb` flag would re-create the silent breakage Addendum 2 is closing. The operator's correct path is: edit refs, then re-run approve. This aligns with the principle established 2026-05-03 by the user: *IDEA.md is transient; refs that depend on its presence must be corrected, not silenced*. The advisory persistence in `diagnoseOrphanIdea`'s "ambiguous case" branch is also kept (no silencer flag). The advisory IS the design.

**Scope of Addendum 2:**
- Decides: at-approve-time pre-flight scan is the producer-side operationalization of ADR-031.
- Decides: hard block on narrative; auto-fix structural; silently skip frozen.
- Decides: no escape flag — the only correct response to the block is to edit refs.
- Implementation note: only the IDEA.md absorption case exists today (`approve.js::archiveIdeaIntoRequirements`). The pattern reuses `lib/upgrade/idea-ref-classifier.js`. When a second destructive op ships, generalize the classifier and apply the same protocol.

**Net effect of ADR-031 + addenda 1 + 2:**
| Phase of destructive op | Coverage |
|---|---|
| Producer-time (when the op fires) | Addendum 2 — pre-flight scan in the command itself; block if refs would break |
| Migration-time (retroactive for old projects) | ADR-031 §main + alpha.24/25 — classify, auto-fix, flag |
| Consumer audit (codepaths assuming file presence) | Addendum 1 — enumerate every callsite, reclassify, structural guard test |

The class is closed for IDEA.md. The pattern generalizes for any future destructive op.

---

## ADR-032 — 2026-05-21 — Seed-input elicitation: provenance contract over honor-system inference

**Context.** Investigation (2026-05-20/21) of a reported regression — "the wizard is nonexistent" — found that in agent mode (the only real operating mode, stdin not a TTY) human input is structurally required at **zero** points:
- The wizard's agent briefing ([wizard.js:165-179]) instructed the agent to *"infer as many fields as possible / only ask follow-ups for fields that genuinely could NOT be inferred"* (introduced v0.1.38). A strong model infers everything and asks nothing — the interview collapses to zero. Verified by code + canaries: every feature seed (Cesar, AITRI-HUB, Zombite) uses the blank `FEATURE_IDEA.md` template filled by the agent; Ultron's discovery is brownfield-derived with self-certified `Confidence: high`.
- Both human surfaces in `approve.js` (`printApprovalSummary`, `askChecklist`) early-return on `!isTTY` — they no-op when an agent runs `approve`.
- The "5-criterion pre-flight" and "Human Review checklists" are template text with **no** mechanical enforcement; the discovery confidence gate is honor-system (agent declares its own confidence).

The seed is the garbage-in/garbage-out point of the whole artifact chain. "Input is the most valuable thing for Aitri to produce good results" (user, 2026-05-20).

**Architectural ceiling (states the boundary honestly).** Aitri only ever talks to the agent, never to the human. It **cannot verify** that a human typed any free text. Therefore no design can *guarantee* human input. The maximum achievable is: (1) make the agent's path of least resistance "ask & confirm"; (2) make assumptions structured, blockable, and propagating; (3) make unconfirmed critical inputs auditable. A false `"confirmed"` is the agent lying — outside Aitri's enforcement boundary.

**Tier model.** Inputs split by *(can the agent infer it reliably?) × (blast radius if wrong?)*:
- **Tier A — must ask** (ground-truth only, high blast radius): `problem, users, baseline, success_metric, no_go_zone` — exactly the five existing IDEA.md Pre-flight criteria.
- **Tier B — infer-then-confirm**: business rules, FR decomposition, North Star/JTBD, stack choice.
- **Tier C — infer silently**: test data, edge cases, code structure, API shape — existing gates suffice.

**Decision (D1 + D2; D3 deferred).**
- **D1 (prompt):** rewrite the seed-creation surfaces (`wizard.js` agent briefing, `templates/IDEA.md`, `templates/FEATURE_IDEA.md`, Phase 1 `requirements.md`) to remove the explicit permission to collapse — present a draft, then confirm each Tier-A field with the user; mark anything inferred as an assumption. Soft (honor-system), necessary but insufficient alone.
- **D2 (gate, the teeth):** optional additive fields `idea_provenance` (per Tier-A field → `confirmed | assumed`) + `idea_gaps` on `01_REQUIREMENTS.json`. `phase1.validate()` blocks on a **fresh seed** (Phase 1 not approved) when provenance is missing/invalid or an `"assumed"` field is not carried in `idea_gaps`. Runs **last** in `validate()`, fires only when a config is supplied (bare `validate(content)` skips → no test churn) and only on fresh seeds (re-runs of approved projects skip → no upgrade migration, existing projects never break). Generalizes the existing discovery-confidence pattern to the seed, which most projects reach without discovery.
- **D3 (deferred):** just-in-time constraint confirmation before Phase 2 (compliance, data residency, deployment target — which Technical Risk Flags is blind to) and brand identity before UX. The efficiency layer; ship after D1+D2 prove out.

**Decision matrix (D2):** Impact High · Value-to-produced-software 8 (seed is the chain's garbage-in point) · Severity Moderate (silent degradation — already the status quo) · Trade-off: provenance of free text is unverifiable (nudge + audit trail, not guarantee); +2 optional contract fields to maintain.

**Anti-theater check.** Not "field present" validation. It changes the default (agent must classify provenance) and makes omitted ground truth a blocking, propagating gap — preventing a verifiable present defect (silent garbage-in seed), not a hypothetical one.

**Objection on record (CLAUDE.md "evidence base").** The collapse is verified today (code + canaries) — that justifies D2 as prevention of a present, code-grounded defect. But whether the provenance contract *improves the software consumer projects produce* depends on real operator behavior that author canaries can only partially validate (they can confirm the gate fires and briefings don't collapse; they cannot confirm a third-party operator answers honestly). Treat tier-1 value as **provisional** until a non-author consumer validates. This does not gate the rc.4 ship (additive, non-breaking, reverts cleanly) but it does gate any future hardening (e.g. making provenance required on re-runs, or adding a status/resume surface) — seek external signal first.

**Scope.**
- Decides: Tier-A vocabulary = the five Pre-flight criteria; provenance is `confirmed|assumed`; gate is fresh-seed-only and additive.
- Decides: no escape flag — the correct response to the block is to confirm with the user or record the gap (same posture as ADR-031 Addendum 2).
- Does not decide: D3 timing/mechanism; whether to surface provenance in `status`/`resume` (deferred, needs a consumer asking); whether to harden `approve`'s TTY-gated checklist (separate finding).

## ADR-033 — 2026-05-23 — `normalize --resolve` requires a clean behavioral working tree (git baselines)

**Context.** Cesar canary, run via **Codex** (cross-agent — prior normalize findings rc.6/rc.7 were Claude), hit a self-inflicted second normalize cycle. `verify-run` forced a code edit (`TC-009f` literal-substring contract broke when a linter reordered imports); the edit was uncommitted when `--resolve` stamped `baseRef = HEAD`; committing the closure then surfaced the edit as fresh off-pipeline drift, costing a full second `normalize` + `--resolve`. Root cause is an asymmetry between commands meant to be used together: `verify-run` validates the **working tree** ([verify.js:436]), while detection and `--resolve` read **committed state only** (`git diff baseRef..HEAD`, [normalize.js:64]) and `--resolve` stamps HEAD ([normalize.js:199]) with no working-tree check. The recommended closure sequence in `templates/normalize.md` / `templates/AGENTS.md` had no "commit first" step, so the SSoT that consumer agents read led directly into the trap.

**Rejected framing — "gate blind spot" (on record).** An intermediate analysis escalated this to a correctness defect: "an uncommitted `fr-change` would pass `--resolve` as accounted-for without anyone seeing it." This is false and self-contradictory. Uncommitted code is unshipped code; everything that ships passes through `baseRef..HEAD`. The re-flag the analysis called "the defect" is the detection *catching* the previously-invisible change — it cannot simultaneously be "the bug" and "what lets changes escape unseen." An uncommitted `fr-change` is surfaced at commit time, never absorbed. Recording the rejection so the false premise is not re-introduced as rationale in a future change: this is a **closure-sequence gap + avoidable friction**, not a safety hole. (The residual — an operator/agent lying to the honor-system TTY confirmation — is the same boundary as ADR-032, unchanged by working-tree state.)

**Decision.** `--resolve` rejects (exit 1) when the working tree holds uncommitted behavioral files, before the TTY confirmation, with an actionable message (commit / `git stash -u`, then re-run). Scope:
- **Git baselines only.** mtime baselines already read the working tree in `detectChanges()` — the asymmetry does not exist for them, and running `git status` there would mislead or fail. Fail-open if git is unavailable.
- **Status semantics mirror detection** (`--diff-filter=ACMR` + untracked; pure deletions excluded — detection never counts them, so they cannot re-trigger). Path scope matches `gitChangedFiles()` (spec/, .aitri, feature pipeline, node_modules, non-behavioral allowlist excluded).
- **Template fix** is the higher-leverage half: `normalize.md` Step 5 + `templates/AGENTS.md` now prescribe commit → verify → resolve and name the gate. The guard backstops agents that ignore prose.

**Reject, not warn (decision on record).** The proportionality argument for warn ("the condition self-heals on the next commit") assumes a human reader who sees the line and acts. The established real consumer is an agent that steamrolls advisory output and answers `y`; a warning prints, `--resolve` exits 0, the agent sees success and proceeds — warn is a no-op on the actual consumer. Only a non-zero exit enters an agent's control loop and forces commit→retry. Independent of the agent point, warn back-loads the full second normalize cycle (the friction reproduced); reject front-loads one commit. The earlier warn position was wrong and is retracted here.

**Anti-theater check.** Not "field present" validation. It prevents a reproduced, code-grounded friction (the double-cycle) and enforces a real coherence property — `baseRef` points to the committed state `verify` validated, not a HEAD missing edits that `verify-run` exercised. Verifiable from code + present case, so CLAUDE.md's "wait for more consumers" reflex does not apply; the cross-agent reproduction (Codex) strengthens but does not gate it.

**Not an architectural change.** No new command, artifact, phase, or schema — a precondition added to an existing command. Logged as an ADR (rather than only CHANGELOG) for the rejected-framing record and the warn-vs-reject rationale, per the decision-log mandate to record objections raised during discussion.

**Scope.**
- Decides: `--resolve` requires a clean behavioral working tree on git baselines; reject over warn; deletions excluded; template prescribes commit-first.
- Does not decide: making detection itself working-tree-aware (rejected — structural, enlarges bug surface, the guard solves the class more cheaply); any change to the honor-system TTY confirmation (ADR-032 boundary, unchanged).

## ADR-034 — 2026-05-25 — Pre-2.0.0 deep audit: prioritize rigor on produced code over documentation rigor; zero-dep correction; theater rejections

**Context.** A full pre-promotion audit (UX, pipeline coherence, command surface, human-validation gates, personas/prompts, security coverage). The audit's organizing conclusion, reaffirmed by the user: **the deliverable is the produced code, not the artifact trail.** Per "Purpose over process," verification of produced code is the tier-1 surface; documentation/artifact-consistency rigor is necessary but ranks below it. Several previously-planned items were re-weighted down because they harden the paper trail, not the code.

**The verification spine (the eje).** The only verification that is not theater is grounded in execution/measurement, never in field presence. Aitri's crown jewel (`verify-run` executes real tests) sits on this axis; the audit found it half-built and half-stack. rc.9 ships the first two:
- **C1 — stack-agnostic coverage (shipped rc.9).** `--coverage-threshold` instrumented node only; now node/`go test`/`pytest`/`jest`/`vitest` via `injectCoverageFlag()`, parsed by an extended `parseCoverageOutput()`, persisted as additive `04_TEST_RESULTS.json#line_coverage`. Serves the non-node canaries (Cesar pytest, Go-on-RPi) that had no coverage signal.
- **C2 — opt-in assertion-density gate (shipped rc.9).** Low-confidence TCs (≤1 assertion) persisted as additive `low_confidence_tcs`; opt-in `.aitri#strictAssertions` makes `verify-complete` block on them. Default unchanged (warning).

**C3 (mutation testing) — DROPPED; zero-dep reasoning corrected (decision on record).** Mutation was already in the immutable Discarded list. Pulling it forward conflicted with that record; surfaced before any code was written. The discard's stated basis was partly a **category error**: it argued mutation "violates zero-dep." It does not. Zero-dep constrains what **Aitri imports**, not what Aitri **orchestrates** — Aitri already spawns project-local tools (pytest, go, Playwright). Orchestrating a *project-declared* mutation tool (in the consumer's own deps) adds zero deps to Aitri, same pattern as the Playwright dispatch. The real, valid basis stands and is why C3 stays dropped: **C2 covers ~60% of the same problem at zero cost, and no adopter has asked.** Disposition: keep dropped on **evidence** grounds, not policy. Re-open criterion: a security/production-critical adopter needing rigor deeper than C2 — implemented then as project-declared orchestration, never a bundled or globally-installed tool. The BACKLOG Discarded entry's reason is corrected accordingly.

**Zero-dep policy itself — KEPT (decision on record).** Question raised: is zero-dep harmful given Aitri builds software? No. It is a real, differentiated security/longevity posture for a tool agents run with write access, and it has never actually blocked Aitri (built-ins suffice for Aitri's language-agnostic job — schema, cross-artifact consistency, output parsing). "Use the best verification tools" is satisfied by **orchestrating the consumer's tools**, which zero-dep fully permits. Even the hardest case (deep multi-language static analysis) resolves to orchestration, not an Aitri dep. The tension was imaginary, born of the import-vs-orchestrate conflation above.

**Dispositions for the remaining audit items (queued, not yet shipped).**
- **A1/A2/A3 (R2) — stack-agnosticism, will ship.** `deploy.md` hardcodes Dockerfile/docker-compose unconditionally (invariant #4 violation); DevOps persona + UX persona (`375px` breakpoints, incl. its own CLI-tool archetype) reinforce web/container assumptions. Fix = local conditionals (consistent with the "Stack-aware project profile" study's "runner dispatch is enough until 2 dimensions appear" stance — no `profile` axis).
- **F1 (R3) — security forcing-function, will ship (narrow).** Security is real but opt-in across the pipeline; Phase 1 will force the agent to *answer* whether security applies (Y/N + why), like it already does for observability/CI/CD. A dedicated security meta-persona (F2) is **deferred** — speculative without a security-sensitive adopter.
- **D1/D2 (R5) — consistency gates, will ship (lowest priority).** D1: Phase 5 `level ≥ complete ⇒ fr_coverage covered` (claim-vs-evidence consistency, not presence). D2: AC-traceability legacy skip → error. These harden the trail; ranked below the code-rigor work per the re-prioritization.
- **B1/B2 (R4) — human gate.** B1: `approve` prints the checklist content always (today it no-ops the summary + checklist on `!isTTY`). B2: **resolved** — default is print-and-proceed (autonomy preserved for CI/agent runs); opt-in `.aitri#humanApprovalGate` makes `approve` block in non-TTY so serious projects get a real review window (humans read/comment/modify; comments via git/PR, modifications caught by existing drift detection). Agent instruction: treat `approve` as a checkpoint, do not auto-chain phases. **Trade-off on record:** with the flag off, a fully-autonomous run can approve all phases without a human; the window is opt-in, not universal — deliberate, to avoid forcing TTY (which would break CI).
- **P1 — reviewer verdict stays advisory (decision on record).** The optional Code Review phase emits PASS/FAIL but does not gate Phase 5. Keep advisory + document it; making an optional phase a hard blocker adds friction with no evidence of a defect it would catch. Real rigor is C1/C2 + the human gate.
- **P2 (R2) — architect persona gets a ❌/✅ ADR example** (only generative persona lacking few-shot).

**Personas/prompts assessment.** Well-built (handoff framing, few-shot, anti-faking, skepticism priming). The one substantive finding: they lean on the LLM's honor-system at the points LLMs are least reliable (reviewer "I read every file"; developer `@aitri-trace`/no-TODO self-attestation). The antidote already exists (ADR-032 provenance contract = mechanical contract over self-attestation) and the fix is mechanical backstop (the C/B work), not prompt rewrites. P3 (Never→Always reframing) and P4 (CONSTRAINTS/REASONING redundancy) deferred — no tier-1 evidence.

**Rejected as theater (on record, so the false premises are not re-introduced).** Each only validates field presence and prevents no real defect — prohibited by CLAUDE.md's "structural gate without defect evidence is theater":
- Phase 2 "does the design mention the FR types?" — a regex over section text cannot judge design quality; "is the design good?" is human by deliberate design.
- Phase 3 vagueness regex on given/when/then — false positives (already seen with domain terms in Phase 1); placeholder gate already exists.
- Phase 4 `@aitri-trace`/TODO presence scan — the agent writes the token; the defect persists.
- verify-run write-ordering nitpick — `verify-complete` already gates afterward.
- TTY-required `approve` — breaks agent mode (the real mode); the right answer is B2's opt-in gate.

**The actual 2.0.0 gate is unchanged and non-code:** at least one third-party adopter validating end-to-end (BACKLOG promotion gate). None of the above substitutes for it.

**Scope.**
- Decides: code-rigor-over-doc-rigor prioritization; C1/C2 shipped; C3 dropped on evidence with zero-dep reasoning corrected; zero-dep kept; B2 print+opt-in-gate; P1 advisory; the theater rejections.
- Does not decide: whether C3/F2 ever ship (gated on a security/production adopter); the `profile` axis (separate study); E1 next-action-marker unification (queued, R6).

---

## ADR-035 — 2026-05-29 — Enforce the canonical TC-id at authoring time; one grammar shared by the Phase 3 gate and the verify-run parser

**Status:** Active

**Context.** Three layers had an opinion about the shape of a TC id and only two agreed in code:
- The **template** (`templates/phases/tests.md`) *teaches* the canonical form (`TC-001h`, `TC-E2E-001h`) and explicitly warns that other shapes "verify-run cannot parse."
- The **`verify-run` parser** (`extractTCId`) *requires* it: a parsed runner-output id is linked to a plan id by string equality (`detected.get(tc.id)` in `lib/commands/verify.js`). An id the parser cannot round-trip is unlinkable.
- **`phase3.validate()`** *did not enforce it.* It checked uniqueness, per-FR `h`/`f` suffixes, types — but never the id grammar itself.

The gap was an honor system between the template and the parser. Hub's `hub-folder-scan` feature exercised it: an agent authored `TC-e2eFolderScan` / `TC-e2eFolderEmpty` (descriptive, no numeric block). They passed Phase 3 (the FR's `h`/`f` quota was met by a separate numbered `TC-021` series), then `verify-run` could not link them and they dropped to `skip`. A green test the system could not credit = degraded produced software. The first response was a half-finished patch that *loosened the parser* to accept digit-free ids — fixing the symptom in the wrong layer: it condoned off-convention naming and widened the parser to match stray `TC-<word>` log tokens (`TC-PASS`, `TC-NOTES`) into phantom TCs.

This closes the **"Phase 3 canonical TC id regex"** item, which had been Discarded (2026-04-23) pending a second evidence case. Hub is that case. Per CLAUDE.md's narrow-evidence rule, the wait-for-more-consumers reflex does **not** apply here: this is a limitation verifiable in code today and a real (author-owned) project producing degraded output — the fix is the removal of an incorrect honor-system assumption, not a speculative abstraction.

**Decision.**
1. The canonical-id grammar becomes a **single source of truth** in `lib/tc-id.js`: `extractTCId` (moved verbatim from `verify.js`, re-exported there for back-compat) and `isCanonicalTCId(id) = extractTCId(id) === id`. A leaf module — `phase3.js` importing it cannot create the cycle that importing `verify.js` would (`verify.js → snapshot.js → phases/index.js → phase3.js`).
2. **Revert** the digit-free parser branch. The numeric block is required on purpose.
3. **Phase 3 gate:** reject any `test_cases[].id` that does not round-trip through the shared parser, naming the offenders and the canonical form. Because the gate and the parser are literally the same function, they cannot drift again.
4. **Deterministic rename suggestion** (`suggestCanonicalTCId`): when the only defect is a glued pure-letter namespace (`TC-NFR010h` → `TC-NFR-010h`), the gate prints the exact fix — the dominant real case (the Hub scan found ~30 such ids, mostly glued NFR forms). It deliberately refuses to guess for (a) digit-bearing namespaces (`TC-E2E001h` — ambiguous, the very reason the separator exists) and (b) descriptive ids with no numeric block (`TC-e2eFolderScan` — a human must assign the number). Every suggestion is re-checked for canonicity before being offered.

**Trade-off.** A project with non-canonical ids will fail `complete 3` where it previously passed (and silently mis-verified later). Acceptable — it converts a silent downstream failure into a loud, fixable authoring error at the right phase, with a message that says how to fix it. Fresh-validation only: existing approved projects are not re-validated until they re-run Phase 3, so no migration is forced (Hub fixes its two ids by hand). The gate enforces an UPPERCASE namespace (the parser normalizes to it); a project using a lowercase namespace must uppercase it — correct, because the lowercase form never actually linked in `verify-run`.

**Why not enforce at the parser instead (the patch's approach).** Loosening the parser would (a) accept ids the convention forbids, eroding the contract the template teaches; (b) re-introduce the phantom-TC false-positive surface the numeric anchor exists to prevent; (c) leave the authoring/linking asymmetry in place for the next non-canonical shape. Enforcing at authoring time keeps the parser strict and makes its strictness safe.

**Second divergent grammar, same fix.** A sweep for other ad-hoc TC-id parsing found one: the `@aitri-tc` marker scanner in `scanTestContent` (`verify.js:283`) used its own `TC-[A-Za-z0-9]+`, which truncated namespaced ids at the second hyphen (`TC-E2E-001h` → `TC-E2E`) and named the wrong TC in the assertion-density (C2) report. Routed through `extractTCId` so the marker scanner shares the SSoT grammar too. All runner-output parsers (`parseVitest`/`parsePytest`/`parseGo`/…) already used `extractTCId`; this was the last divergent reader.

**Scope.**
- Decides: canonical-id grammar is SSoT in `lib/tc-id.js`; Phase 3 enforces it via round-trip; the deterministic rename suggestion; the digit-free parser loosening is reverted; the `@aitri-tc` marker scanner is unified onto the SSoT; the Discarded "Phase 3 canonical TC id regex" item is closed (shipped).
- Does not decide: any change to the grammar itself (namespace casing, suffix vocabulary) — out of scope; this only enforces the existing one.

---

## ADR-036 — 2026-05-30 — Upgrade migrations must transform at apply time, never write a diagnose-time snapshot

**Status:** Active

**Context.** `adopt --upgrade` runs every `diagnose*` function against the current on-disk project, collecting findings. `migrate()` then applies each auto-migratable finding's `apply()` **sequentially, with no re-read between them**. Each artifact-writing finding had captured a full-file `afterContent` at *diagnose* time and its `apply()` did `fs.writeFileSync(full, afterContent)`. When two findings target the same file — `diagnoseNonFunctionalRequirements` (NFR shape rewrite) and the orphan-IDEA absorb in `diagnoseOrphanIdea`, both on `01_REQUIREMENTS.json` — the second `apply()` overwrote the first with a snapshot taken before the first ran. By `diagnose()` order the IDEA absorb always wins, so the NFR rewrite was silently reverted while the upgrade report claimed both applied. Triggers on the exact pre-0.1.89 population the migrator targets (legacy NFRs + an orphan `IDEA.md`). The brief was not lost (absorb wrote last and includes it), but a BLOCKING migration became a reported-success no-op. Found by a defect hunt on the upgrade module.

**Decision.** Artifact-writing migration `apply()`s MUST re-read the file at apply time and mutate the current on-disk content — never persist a diagnose-time snapshot. Codified as `rewriteArtifactInPlace(full, mutate)` in `from-0.1.65.js`: it re-reads, runs `mutate(data)` against fresh content, writes, and returns the actual before/after hashes (which the finding stamps onto itself so the `upgrade_migration` event matches final disk). Each `mutate` is written to be idempotent-safe (it guards the fields it may have already changed), because it now runs against whatever is currently on disk rather than a known snapshot. Destructive side effects (the IDEA `unlinkSync`) run only after a successful write, so a re-read failure cannot lose data.

**Invariant for future migration authors:** if your `apply()` writes a whole artifact file, route it through `rewriteArtifactInPlace` (or re-read equivalently). Writing a precomputed full-file blob is the clobber bug. Diagnose-time `beforeHash`/`afterHash` may still be computed for the dry-run preview, but the real run's recorded hashes come from the apply-time read/write.

**Trade-off.** `apply()` now does one extra read+parse per artifact write (negligible — upgrades are rare and the files are small). The mutate functions must be idempotent-safe, which is slightly more code than a blind overwrite — accepted, because it also makes a double-run safe. Alternative considered and rejected: serialize/merge same-target writes at the `migrate()` orchestration layer — infeasible, because the precomputed-blob design gives the orchestrator no way to merge two full-file snapshots without understanding each transform.

**Scope.**
- Decides: artifact-writing `apply()`s re-read at apply time via `rewriteArtifactInPlace`; the three current writers (TC rename, NFR rewrite, IDEA absorb) are converted; IDEA unlink is gated on write success.
- Does not decide: a broader migration-framework refactor — the helper is the minimal invariant that closes the clobber class; richer migration composition is unneeded until a migration must transform a file a third writer also touches.

---

## ADR-037 — 2026-05-30 — Code-quality gates: the verification spine enforces well-built code, not only passing tests (orchestrate, don't bundle)

**Status:** Active

**Context.** Aitri's verification spine answered one question — *"do the tests pass?"* — via `verify-run` executing the project's real suite and `verify-complete` + `fr_coverage` gating the pipeline on functional behavior (every MUST FR traced to a passing test). That functional layer is strong and is the core of Aitri. But the tool markets itself as **SDLC + CI/CD**, and a serious SDLC gate also asks *"is the code well-built?"* — lint, type-check, security, coverage. None of those were enforced: lint/type-check were honor-system checklist items in the Phase 4 briefing (the agent attests), security was only a yes/no Phase-1 question, coverage was an opt-in flag. A project could pass Aitri end-to-end with green tests and a broken linter, unsafe code, or no type-checking. The author flagged the gap directly: without code QA, Aitri risks being process ceremony that does not raise the floor on the produced software — which contradicts "Purpose over process."

**Decision.** Add **code-quality gates** to the verification spine, built on the pattern already proven by `test_runner`: **Aitri orchestrates the project's declared QA commands and gates on their exit codes — it never bundles or implements analyzers.**

- **Schema (additive):** `04_IMPLEMENTATION_MANIFEST.json#quality_gates: [{ name?, command, required? }]`. The project declares its own `eslint`/`tsc`/`ruff`/`mypy`/`go vet`/`gosec`/etc.
- **Execution:** `runQualityGates` in `verify.js` runs each `command` via `spawnSync` (same as the test runner), judging by **exit code** (0 = pass). A missing tool (ENOENT) is `error` — it could not certify the code, so a `required` error is treated like a fail (a declared-but-uninstalled gate is a setup defect, not a silent pass). Results land in `04_TEST_RESULTS.json#quality_gates`.
- **Gating:** `required` defaults to `true`. A failing `required` gate resets `verifyPassed` and blocks `verify-complete`, exactly like a failing test. `required: false` gates are surfaced but never block (gradual adoption of security/mutation/etc.).
- **Discipline:** the Phase 4 briefing now requires the agent to wire the project's lint/type-check (and offer security) as `quality_gates`, with per-stack examples; `phase4.validate()` emits a non-blocking nudge when none are declared. The seriousness comes from the briefing forcing declaration; the gate enforces it.

**Why orchestrate, not bundle.** Zero-dep constrains what Aitri *imports*, not what it *runs* — Aitri already spawns the project's pytest/playwright. Running the project's declared linter adds zero deps to Aitri and keeps it stack-agnostic (Aitri needs no knowledge of what `ruff` is — only its exit code). Bundling analyzers would violate zero-dep AND couple Aitri to specific stacks; both are non-starters. This is the same import-vs-orchestrate distinction corrected in ADR-034.

**Constitution (CLAUDE.md) impact — clarified, not weakened.** This does not loosen any invariant. It makes the *purpose* explicit: the verification spine includes code-quality gates, orchestrated from project-declared commands. Added as an engineering principle plus a clarifying clause on zero-dep (import vs orchestrate). Model-agnostic, stack-agnostic, persona-ceiling, artifact-chain — all respected (no new persona; no new phase; one additive manifest field + one additive results field).

**Decision matrix.** Impact High (new artifact field + new gate + verify lifecycle change). Value-to-produced-software 9/10 (enforcing lint/type-check/security directly prevents shipped defects — the core deliverable). Severity Moderate, mitigated by additivity (no `quality_gates` declared → behavior unchanged). Trade-off: more manifest surface; honor-system remains on the *declaration* (did the agent declare all available tools? is the linter config strict?) — but execution and gating are mechanical (exit code), which is the same boundary as tests.

**What this does NOT do (honest boundary).** It cannot judge whether the declared linter is a *good* linter, whether the agent declared every available tool, or whether a passing gate is meaningful — those stay human-reviewable (the `approve` gate) and partially mechanical (assertion-density C2 for tests). It is the floor, not a guarantee of quality.

**Scope.**
- Decides: `quality_gates` declared in the manifest, run by `verify-run`, gated by `verify-complete`/`verifyPassed`; `required` defaults true; ENOENT = error = blocking-if-required; Phase 4 briefing forces declaration; orchestrate-not-bundle; the CLAUDE.md clarification.
- Does not decide: folding coverage (`--coverage-threshold`) into `quality_gates` (deferred follow-up — coverage already works via its own mechanism); making code review (reviewer persona) a hard gate (stays advisory per ADR-034 P1); auto-detecting the stack's tools (the project declares them — auto-detection would re-introduce stack assumptions).

---

## ADR-038 — 2026-05-30 — Code-review verdict: opt-in hard gate (`reviewGate`), advisory by default

**Status:** Active

**Context.** ADR-034 P1 kept the optional Code Review phase's PASS/CONDITIONAL_PASS/FAIL verdict **advisory** — not a hard gate on Phase 5 — reasoning that making an optional phase a blocker adds friction with no evidence of a defect it would catch, and that real rigor lives in the mechanical gates (tests, assertion-density) plus the human approve gate. ADR-037 then built the mechanical code-quality gates (lint/type-check/security/coverage) and explicitly deferred "make code-review a hard gate." With the code-QA floor now in place, the author asked to close that follow-up.

**Decision.** Add an **opt-in** gate, not a blanket reversal. `.aitri#reviewGate` (default `false`, absent) — when `true`, a `FAIL` verdict in `04_CODE_REVIEW.md` blocks `aitri verify-complete`. Default behavior is unchanged: the verdict stays advisory (ADR-034 P1 preserved). Same opt-in pattern as `strictAssertions` (ADR-034) and `humanApprovalGate` (rc.12) — serious projects raise the bar; MVPs are unaffected. `CONDITIONAL_PASS`/`PASS` never block; an absent `04_CODE_REVIEW.md` never blocks (review stays optional). The verdict is read from the `## Verdict` section via `extractReviewVerdict` (placeholder menus stripped; worst-verdict precedence).

**Honest boundary (why this is weaker than the mechanical gates).** The verdict is **agent-written** — `reviewGate` makes a *written* FAIL binding, it does not detect review quality or force a review to exist. An agent could write PASS, or skip review entirely, to avoid the gate. So this is a soft/honor-system gate, deliberately opt-in: it has value for a team that runs review and wants its FAIL to be non-ignorable, but it is not a substitute for the mechanical floor (tests + `quality_gates`) or the human approve gate. This is exactly why it is NOT on by default — turning an honor-system verdict into a universal hard block would be the "structural gate without defect evidence" theater CLAUDE.md warns against. As an opt-in, the project that enables it is making an informed choice.

**Scope.**
- Decides: `reviewGate` opt-in flag; FAIL-only blocking at `verify-complete`; default stays advisory (ADR-034 P1 intact); verdict extracted from the `## Verdict` section.
- Does not decide: forcing a code review to exist; gating on CONDITIONAL_PASS; any mechanical verification of review quality (out of reach — the reviewer is an LLM/human judgment layer).

---

## ADR-039 — 2026-05-31 — Intake redesign: IDEA is the raw seed, Discovery is the (proportional) understanding engine

**Status:** Accepted — phased implementation pending (see plan in BACKLOG).

**Context.** The intake layer — where a user's intent becomes the seed for the whole pipeline — is Aitri's highest-leverage and least-coherent surface. A full-pipeline phase audit + a focused 3-agent intake review (2026-05-31) found: (1) IDEA.md (a rich 8-section template) and the optional Discovery phase OVERLAP — both ask problem/users/success, so it is unclear which is input and which is output; (2) in agent mode (the real mode) intent is INFERRED, not elicited — the provenance gate at `complete 1` reads a file the agent wrote alone, and the provenance record dies unread; (3) there is no way to feed a complex project's real context (folders, mockups, prior docs, an existing repo); (4) the `wizard` (the one elicitation tool) is off the agent path entirely; (5) Aitri's artifact names are non-standard vs industry (no PRD/TRD vocabulary). The author confirmed the direction and answered the open product questions.

**Decision.** Re-aim the intake around a clear direction with five pillars:

1. **IDEA = raw input (the intent seed), not a rich template.** Either a one-liner ("an app that does X") or pointers to existing context (a `## Context Sources` section listing folders/repos/docs/URLs). For NEW projects the template becomes thin: the intent in the user's words + Context Sources + (optional) a one-line success statement. Everything structured is DERIVED, not pre-filled.
2. **Discovery = the understanding engine, and it is CANONICAL.** It (a) INGESTS — if IDEA references Context Sources the agent reads them and synthesizes; (b) ELICITS — asks what is missing; (c) CONFIRMS — see pillar 4. Output `00_DISCOVERY.md` is the structured, confirmed understanding. Both artifacts are kept on purpose: IDEA = what the user *said* (immutable raw intent), DISCOVERY = what Aitri *understood* (derived, with provenance) — full intent→understanding traceability.
3. **Proportionality (the author's constraint — do NOT run a giant process for a landing-page MVP, but DO support agile iteration).** Canonical ≠ heavy. Discovery's DEPTH scales to the project: a trivial MVP is a ~30-second confirmation of the three high-stakes inputs; a complex system is ingestion + a real interview. Agile iteration is served by the existing FEATURE pipeline — ship the light MVP, then add features as mini-pipelines (each also proportional). The pipeline is not a one-shot waterfall; the feature loop is the agile loop.
4. **Blocking confirmation of the three irreversible inputs.** Discovery cannot complete without the human confirming the problem, the success metric, and the no-go zone — the inputs whose errors are unrecoverable downstream. This is the deferred ADR-032 "D3 just-in-time confirmation", finally placed where a human is actually present (discovery), not buried in the agent's solo write at `complete 1`. The provenance gate distinguishes confirmed-from-source / confirmed-by-user / assumed. Blocking is only these three (cheap to confirm even for an MVP), NOT all eight fields.
5. **Context ingestion is orchestrated, not built (zero-dep).** Aitri does not implement a file/folder reader — the agent already reads files. Aitri defines the `## Context Sources` convention and the discovery briefing instructs: read the sources first, derive from them, confirm what is not explicit. Same orchestrate-don't-bundle pattern as tests and quality_gates (ADR-037).

**Terminology.** Artifact file names are a public contract (Hub + existing projects) and are NOT renamed. Instead, map them to industry-standard vocabulary in help/docs/human output so they are recognizable: IDEA ≈ project brief/vision; 00_DISCOVERY ≈ product discovery; 01_REQUIREMENTS ≈ PRD/SRS; 01_UX_SPEC ≈ UX/design spec; 02_SYSTEM_DESIGN ≈ TRD/SDD; 03_TEST_CASES ≈ test plan; 05_PROOF_OF_COMPLIANCE ≈ compliance/traceability report. Zero breakage; a UX/docs layer.

**Feature symmetry.** A feature is a mini-project: FEATURE_IDEA (raw seed + context) → feature discovery (ingests the PARENT project + the feature intent) → feature requirements. PLUS a feature-specific capture that exists nowhere today — the regression boundary (`## Touch Points` + `## Must Not Break`), threaded into the feature's Phase 1 so Phase 3 can test against it. This closes the one feature-specific defect class (silent breakage of parent behavior).

**Trade-offs / what is sacrificed.** More intake design surface; discovery becomes load-bearing (a weak discovery degrades everything downstream — mitigated by the blocking confirmation + proportional depth). The blocking confirmation adds a human touch-point that, in fully-autonomous CI runs, must degrade gracefully (a non-TTY fallback: the agent conducts the confirmation and records provenance, same as the wizard's agent-briefing path — never a hard stop that breaks CI).

**What this does NOT do.** It does not build a context-ingestion engine (agent reads files). It does not rename artifacts. It does not force a heavy process on trivial projects (proportionality). It does not introduce a rigid project-`profile` enum (the deferred "Stack-aware profile" study stays deferred) — depth is driven by the intent + a light "this is an MVP, keep it light" signal, not a fixed taxonomy.

**Compatibility.** The thin-IDEA template applies to NEW projects only; existing projects keep their rich IDEA (the provenance gate is fresh-seed-only — no break). The discovery→requirements wiring already shipped (rc.28).

**Scope.**
- Decides: IDEA = raw seed; Discovery = canonical, proportional understanding engine that ingests + elicits + confirms; blocking confirmation of problem/success/no-go (D3 placed in discovery); context ingestion via `## Context Sources` (orchestrated); industry-terminology mapping in docs/help (no rename); feature regression boundary.
- Does not decide: the exact thinning of the IDEA template (pillar 1 — to be finalized in implementation); whether discovery's interview and the wizard interview merge into one code path (likely yes — to be confirmed in implementation); a project-profile enum (stays deferred).

### Addendum 1 — 2026-06-01 — Two planned steps dropped after a first-hand rigor pass

A rigor pass (reading the code directly, not trusting prior subagent analysis) was run before implementing the two remaining pillar-1 steps. Both dissolved against existing code. Recording the reversal, per the rule that objections raised in discussion are logged even when they overturn a prior decision.

- **Step 3b — blocking confirmation gate in discovery — DROPPED as theater.** The decision above placed "blocking confirmation of problem/success/no-go" *in discovery* (the deferred D3). On re-read, `lib/phases/phase1-checks.js::IDEA_PROVENANCE_FIELDS = ['problem','users','baseline','success_metric','no_go_zone']` already gates exactly those three (plus two more) at `aitri complete 1`, before approve. A discovery-side confirmation gate would be a **strict subset** of the existing phase-1 provenance gate AND would share its honor-system hole (an agent can mark `confirmed` without asking — the code cannot tell). Adding a second gate that prevents no defect the first does not already cover is theater (CLAUDE.md prohibition). The confirmation goal is already served by soft levers that shipped: discovery briefing (rc.31) + AGENTS.md guidance (rc.33) tell the agent to confirm; the phase-1 provenance gate is the mechanical contract; provenance is visible at approve (rc.29). No second gate.

- **Step 3 — thin the IDEA template — DROPPED as net-negative.** Two findings: (1) the context-ingestion pillar this step was meant to add (`## Context Sources`) **already exists** — `lib/commands/run-phase.js:161-170` scans the `idea/` folder and lists assets in every phase briefing, `lib/commands/init.js:25-31` creates the folder + README, and `templates/IDEA.md` already documents it under `## Assets`. A new section would duplicate an existing one. (2) Thinning the rich sections removes real scaffolding for solo / fast-path users who skip discovery, and breaks the coupling with `lib/phases/phase1.js:252` (the buildBriefing empty-section warning reads the `Problem / Target Users / Business Rules / Success Criteria` headers). The "IDEA = raw seed" *concept* is already documented (AGENTS.md rc.33, terminology map rc.32). Net: tier-2 tidiness with a real downside and no verifiable defect fixed.

**Disposition.** The intake redesign is substantially complete. Its real value shipped across rc.29–rc.33 (provenance visible at approve, feature regression boundary, discovery ingests context proportionally, industry-terminology map, AGENTS.md "capturing intent" section) plus the pre-existing `idea/`-folder ingestion. The two remaining steps were the speculative tail; the rigor pass dissolved both. Pillar-5b (unify the wizard interview with `--guided` discovery + give `--guided` a non-TTY agent-briefing fallback — `run-phase.js` hard-errors today) stays open in BACKLOG as the one genuine remaining item, gated on a real consumer asking for it.

---

## ADR-040 — 2026-06-01 — Human-in-the-loop checkpoints vs autonomous PTY agents

**Status:** Accepted (thesis + dispositions). Producer-side instruction-hardening and the structured `source` field are scoped but NOT yet implemented — tracked in BACKLOG.

**Context.** The first third-party adopter (Inchcape / DSB-AT-POC, run by GitHub Copilot CLI / Claude Sonnet 4.5) defeated **both** of Aitri's human-in-the-loop checkpoints in a single Phase 1 session — something no author canary surfaced, because the author never auto-answers his own gates:

1. **Approval.** `aitri approve` printed its isTTY confirmation prompt (`Have you reviewed…? (y/N)`); the agent used a `write_powershell` tool to type `y` 15 seconds later. The human never approved ("¿por qué se aprobó? yo no la aprobé").
2. **Content provenance.** The agent populated `01_REQUIREMENTS.json` from a project folder and marked all five Tier-A fields `idea_provenance: "confirmed"`, `idea_gaps: []` — including a `success_metric` (North Star "80% adoption in 6 months") that appears agent-generated, not present in the source docs. The provenance gate passed silently (0 assumed → 0 gaps required).
3. **Source provenance (the author's sharpening).** The folder it ingested (`Pre_Requirements_Definitions/`) was **never designated by the user** — the agent discovered it by scanning the project and assumed it authoritative. It could have been a stale draft, a template, or another project's docs. `AGENTS.md` only instructs "if the user pointed you at a folder…"; it is silent on self-discovered context, and Aitri has a designated channel (the `idea/` folder, auto-listed in briefings) that the agent bypassed.

**Thesis.** Aitri's human checkpoints assume the operator answering them is a human. An autonomous agent driving a PTY breaks that assumption: it can type `y`, and it can write `"confirmed"`. Both are the same root — *an agent decides for the human at an irreversible point* — and both are the honor-system limit that the code already half-acknowledges (`phase1-checks.js`: "Aitri cannot verify provenance of free text"; the isTTY gate protects against non-interactive CI, never against an interactive non-human).

**What is mechanically defensible vs irreducibly honor-system.**

- **Irreducible (document honestly, do not pretend to fix):** Aitri cannot distinguish a human keystroke from an agent-injected keystroke on a TTY, nor verify the honesty of free-text provenance. `humanApprovalGate`'s hard block fires only on `!isTTY` (`approve.js:394`) — correct for CI, defeated by a PTY agent. No in-band mechanism is robust when the agent controls stdin, stdout, and the filesystem; a confirmation the agent can read it can satisfy. Pretending otherwise (a "stronger" prompt, a second gate) is theater of the kind ADR-039 Addendum 1 already rejected.
- **Defensible, producer-side (ship): instruction-hardening.** `AGENTS.md` + the Phase 1 / discovery briefings gain an explicit rule: context the **user designated** (the `idea/` folder, a path they gave) may ground `"confirmed"`; context the agent **self-discovered** is `"assumed"` → `idea_gaps`, and its source is confirmed with the user before it is trusted. This shapes what compliant agents do (tier 1) and adds a distinction that does not exist today — unlike the dropped discovery gate, it is additive, not redundant. It helps every agent that loads its instruction file (Claude Code, Codex, Gemini, and Copilot — `init` already writes `.github/copilot-instructions.md`); it does not help an agent that ignores the file, which is the irreducible part.
- **Defensible, checkpoint-visibility (ship, cheap): louder approve-time signal.** The approve summary already surfaces provenance counts (rc.29). When it is "N confirmed · 0 assumed" *and* context was auto-ingested, nudge the human to verify the high-stakes inputs (esp. `success_metric`) were confirmed *with them*, not inferred from docs.
- **Deferred, pending a second signal: structured `source` on provenance.** Make each `"confirmed"` carry a short `source` ("user said X" / "doc Y"), additive and optional (no type change to the existing enum), surfaced at approve. It raises the cost of a dishonest `"confirmed"` and improves the reviewer's signal — but it is still honor-system at root and adds schema + briefing + approve surface. Per the evidence-base discipline (one third-party data point), hold it until a second consumer confirms the need, exactly as Step 3b/3 were held/dropped.

**Decision.** Ship the two producer-side levers (instruction-hardening + louder approve nudge) as the response to this adopter; document the irreducible limit in the same instruction so operators of autonomous agents know the checkpoints are advisory against a non-human operator and that `humanApprovalGate` + a human running `approve` is the only hard stop. Defer the `source` field. Do **not** add a new mechanical gate that a PTY agent would defeat.

**Trade-off.** Instruction-hardening only reaches agents that honor their instruction files; the Copilot run that triggered this ADR did not visibly honor the `.github/copilot-instructions.md` Aitri generated. The residual risk — an autonomous agent that ignores instructions and auto-answers every checkpoint — is not closable in-band and is stated as such. The alternative (a heavier mechanical gate) buys no real protection against that agent and taxes every honest one.

**Objection logged.** The `source` field could itself become a second honor-system declaration (the agent writes a plausible source for content it invented). That is precisely why it is deferred rather than shipped on a single data point — the same caution that dissolved the ADR-039 discovery gate.

---

## ADR-041 — 2026-06-02 — The `ac_id` traceability chain is half-built (Phase 3 requires a join-key Phase 1 does not enforce)

**Status:** DECIDED 2026-06-02 (rc.36) — **option B shipped.** `ac_id` is now required only when Phase 1 provides structured AC ids; optional otherwise (`lib/phases/phase3.js`, reqs pre-read, presence check gated on `knownAcIds.size > 0`). Option A (finish the full traceability chain) is parked in BACKLOG as a future feature whose load-bearing piece is a real *consumer* (AC-level coverage), gated on a real adopter wanting it. rc.35 added the salience/error mitigations; rc.36 made the structural call.

**Context.** The second third-party session blocked in Phase 3 on `ac_id`. Verified in code, the chain is inconsistent:
- `lib/phases/phase3.js:100` — every test case MUST carry an `ac_id` (hard error, always).
- `lib/phases/phase3.js:207` — the VALUE of `ac_id` is cross-validated against `01_REQUIREMENTS.json` **only when** `user_stories[].acceptance_criteria` carry structured `{ id, ... }` objects. If Phase 1's acceptance_criteria are plain strings (the common case — and what `lib/phases/phase1.js` accepts), the cross-check degrades to a non-blocking warning.
- `lib/phases/phase1.js` does **not** require `user_stories[].acceptance_criteria` to be structured objects with ids — plain strings pass.

So Phase 3 mandates a join-key (`ac_id`) whose target the upstream phase is not required to produce. When Phase 1 has no structured ACs, the agent must still supply an `ac_id` that traces to nothing — busywork that, in the canary, led the agent to invent formats (`AC-FR-001-1`) and stall. This is the "structural gate that prevents no real defect" pattern the constitution warns against, AND a real schema-chain incoherence (the same class the rc.26–28 audit found: a join-key required downstream but unenforced upstream). The rc.13 decision that made `ac_id` unconditionally mandatory predates this evidence.

**Options (not yet chosen).**
- **A — Enforce structured ACs in Phase 1.** When `user_stories` are present, require `acceptance_criteria` to be `[{ id, text }]` (not plain strings). Then `ac_id` always has a real target and the chain is whole. Cost: a Phase 1 schema tightening affecting every project; plain-string ACs (today valid, widely used) would need migration or a grace path. Highest integrity, highest blast radius.
- **B — Make `ac_id` presence conditional.** Align `:100` with `:207`: require `ac_id` only when Phase 1 actually has structured AC ids; otherwise it is optional (trace via `requirement_id` + `user_story_id`, which are already mandatory). Removes the hollow requirement; smallest change; matches the canary's own suggestion. Cost: slightly weaker nominal traceability when Phase 1 is unstructured (but it was nominal anyway — the warning already admitted it can't be validated).
- **C — Status quo + the rc.35 mitigations only.** Keep `ac_id` mandatory, rely on the consolidated briefing + the now-explicit error (lists available ids / tells the agent to use `AC-001` when none exist). Cost: the hollow requirement remains; depends on the agent reading the briefing (the very thing the canary did not do).

**Lean (for discussion, not decided).** B is the most defensible against the constitution (don't require a join-key with no target) and the lowest-risk. A is the "correct" long-term shape if real AC-level traceability is a goal Aitri wants to guarantee — but that is a product decision about how much rigor to force, and it should be made deliberately, ideally with a second consumer signal on whether AC-level traceability is actually used downstream (verify-run keys on FR/NFR ids, not AC ids — so today nothing consumes `ac_id` mechanically, which argues for B).

**Evidence-base note.** The blocker is real and code-verified (agent-independent — any agent writing plain-string ACs hits it). The *behavioural* colour around it (the agent inventing formats, then recommending a gate-skip) is from one agent/OS (Copilot CLI / Sonnet 4.5 / Windows) and is not generalized — consistent with the ADR-040 discipline.

---

## ADR-042 — 2026-06-03 — Naming & vocabulary cleanup: clear names + homologation, not change-for-change

**Status:** DESIGN ACCEPTED — implementation phased and pending (no code yet). This ADR is the blueprint; each phase ships as its own test-verified release.

**Context.** Reviewing Aitri as "an AI product for the IT industry," the author asked whether the artifact/command names are professional and industry-aligned, or "invented." A first-principles analysis (not change-for-change):

- Most names are ALREADY clear AND standard (`01_REQUIREMENTS`, `02_SYSTEM_DESIGN`, `03_TEST_CASES`). The "jargon vs clear" tension is narrow — they are just not the *acronyms* (PRD/SRS/TRD/SDD) some pattern-match on.
- Homologation is PARTIAL: only some artifacts map to an industry document type (requirements→PRD, design→design-doc, tests→test-plan). `04_IMPLEMENTATION_MANIFEST` and `05_PROOF_OF_COMPLIANCE` are Aitri-specific concepts with NO industry equivalent — acronymising cannot fix what feels "invented" about them.
- Modern-AI-product lens: modern tooling uses CLEAR names; the formal acronyms (SRS/SDD/TRD) read as IEEE/waterfall/enterprise-regulated/academic — *dated*, not modern. PRD is the one exception (modern + ubiquitous). So full acronymisation would make Aitri look LESS modern, not more.

**Decisions.**

1. **DO NOT full-acronym-rename the artifact chain.** Clear, descriptive names are more aligned with a modern AI product than academic acronyms, and partial homologation is impossible. The market matters: modern-dev → clear names win; regulated-enterprise → formal acronyms expected. Aitri targets the former by default.

2. **Strengthen the homologation LAYER instead** (gets "explanatory + recognised" without a risky rename): each artifact carries its industry identity prominently (e.g. an internal header "Product Requirements Document (PRD)"); `aitri help`/docs lead with the recognised term where one genuinely exists. Filenames stay clear; recognition comes from context. (Extends the rc.32 `≈` map.)

3. **DO rename `normalize` → `reconcile`** — the single worst command name. "Normalize" communicates nothing about what it does ("detect + classify code changes made outside the pipeline"). `reconcile` does. Full, clean rename (NO alias — per the author's clean-break principle): the command, the `.aitri` state field `normalizeState` → `reconcileState`, the `status --json` contract fields (`normalize`, `normalizeState`, `normalizeBaseline`, reason `normalize_pending` → `reconcile_*`), `lib/normalize-patterns.js` → `reconcile-patterns.js`, `templates/phases/normalize.md` → `reconcile.md`, AGENTS.md, help, docs, and the ~300 test references.

4. **DO rename the two Aitri-specific "weird" artifacts:** `04_IMPLEMENTATION_MANIFEST.json` → `04_BUILD_REPORT.json`; `05_PROOF_OF_COMPLIANCE.json` → `05_TRACEABILITY.json` ("traceability" is the precise industry term for what it is — a requirements traceability/compliance report). Clean rename, no dual-naming.

5. **DO NOT rename** `validate`, `complete`, `rehash`, `tc`. Individually reasonable; rename = churn > value (change-for-change). One doc-only clarification: `complete <phase>` validates one phase vs `validate` checks all for deploy — explain the difference in help, do not rename.

6. **The `idea/` unit-folder structure is NOT part of this ADR** — separate, higher-risk, parked (the `.aitri`/root-identity reshape). This ADR is vocabulary only.

**Migration (verified clean — no re-adopt).** Re-adopting old projects was rejected: `adopt` resets `currentPhase`/`approvedPhases` (`adopt.js:486`), so it would *lose pipeline progress* — costlier than migrating. The migrations are trivial because of how state is keyed:
- `normalizeState → reconcileState`: a one-line field rename in `lib/upgrade/migrations/` — the migrator already does exactly this pattern (`requirement → requirement_id`, etc.).
- Artifact renames (04/05): `.aitri` keys `artifactHashes` by **phase number, not filename** (`artifactHashes["4"]`), so state is unaffected — the migrator just renames the file on disk (`mv 04_IMPLEMENTATION_MANIFEST.json 04_BUILD_REPORT.json`); the phase-keyed hash still matches the unchanged content.
- The `status --json` contract changes are documented in `docs/integrations/` (marked breaking); Hub adapts later (author's call: do not block on Hub).

**The real regression risk is the sweep, not the migration.** ~300 `normalize` references — but NOT all are the command/state: `normalizeAC` (phase1), string normalisation (tc-id) must NOT be touched. The sweep is context-aware (never a blind `sed`), and the full test suite (94 normalize + 75 snapshot tests) is the backstop, run after every block.

**Implementation plan (phased, each a test-verified release).**
1. `normalize → reconcile` (command + state + contract + migration + sweep). Highest-value name fix.
2. `04`/`05` artifact renames + on-disk file-rename migration + contract docs.
3. Homologation layer (industry identity in artifact headers + help/docs).

**Trade-offs.** Clean breaks mean old muscle memory / scripts break — accepted at pre-v2-stable with few projects; the migrator (`adopt --upgrade`) carries existing projects across without re-authoring. The homologation layer adds prose to maintain but is the low-risk way to satisfy "professional + recognised."

**Objections logged.** (a) "Reconcile" is also slightly less common than "normalize" as an English word — but it *describes the action*, which "normalize" does not; clarity wins. (b) Renaming artifacts is a contract change even with Hub freed — mitigated by documenting it in the integration contract so Hub's adaptation is mechanical. (c) Doing nothing was considered — rejected only for the genuinely-opaque names (`normalize`, `04`/`05`); explicitly chosen for everything else (no change-for-change).

---

## ADR-043 — 2026-06-03 — Intake ground-truth: provenance sources (#5) + just-in-time constraint confirmation (#8)

**Status:** DESIGN — approved to build. Both reopened after the author saw their value once separated from each other.

**Context.** Two intake refinements, distinct but both about handling ground-truth honestly:
- **#5 provenance source.** `idea_provenance` records each Tier-A field as `confirmed`/`assumed`, but the human at approve only sees counts. They cannot tell WHICH "confirmed" came from the IDEA vs which the agent inferred and labelled confirmed. rc.44 added the all-confirmed nudge (#4) — a general "double-check" — but not WHICH field is weak.
- **#8 constraints just-in-time.** Constraints (tech stack, budget, deadline, existing systems, compliance) are all asked upfront in IDEA.md. Some are not known at seed time, or asking everything upfront is heavy; and the ones that matter for architecture/UX are best confirmed right before those phases.

**Decision — #5: a new additive `idea_provenance_sources` field (NOT a type change to `idea_provenance`).**
- Schema: additive optional `idea_provenance_sources: { problem, users, baseline, success_metric, no_go_zone }` — each a short string ("IDEA.md states it", "user confirmed in chat", "inferred from product type"). The existing `idea_provenance` enum is unchanged (schema-evolution rule: never change a field's type — new field instead).
- Briefing (`requirements.md`): for each Tier-A field, record where the value came from in `idea_provenance_sources`.
- Validation (`phase1`): on a fresh seed, WARN (not block) when a `confirmed` field has no source. Deliberately a warning, not a gate — the field is honor-system (the agent can fabricate a source), so a hard gate would be theater; the value is VISIBILITY at the human checkpoint, not mechanical enforcement.
- Approve display (`summarizeRequirements`): show the source per field so a weak one (`success_metric ← inferred from product type`) stands out next to a strong one (`problem ← IDEA.md`). This is the concrete upgrade over the rc.44 nudge: the human sees WHICH input is weak, not just "all confirmed, double-check".
- Honesty caveat (logged): still honor-system. It raises the bar (the agent must write a traceable source) and improves the reviewer's catch-rate — it does not prevent a fabricated source. Accepted because it ADDS information to the checkpoint (unlike a redundant gate), at additive-schema cost only.

**Decision — #8: producer-side just-in-time constraint confirmation in the architecture + UX briefings (no schema change, no hard gate).**
- The author's refinement is the core rule: **if the constraint is already clear in `01_REQUIREMENTS.json` (`constraints` + `technology_preferences`), use it — do NOT re-ask. Only if a phase-relevant constraint is missing or vague, confirm it with the user just before that phase.** Same logic as provenance (use what's stated; confirm what's missing), applied to constraints at the moment they bite.
- `architecture.md` gains a "Constraint check before designing" block — categories that shape architecture: tech stack / languages, infrastructure / hosting, budget / cost, timeline / deadline, existing systems to integrate, security / compliance. Instruction: use the ones in requirements; for any missing category, confirm with the user FIRST (they are expensive to change after the design) and mark anything assumed.
- `phaseUX.md` gains the UX-relevant version: design system / branding, accessibility level, device / viewport targets, performance budget.
- Producer-side instruction (like ADR-040 #3), not a gate — low-risk, no pipeline-flow change. The agent that loads its briefing gets the just-in-time prompt; the irreducible residual (agent ignores it) is the same honor-system boundary documented elsewhere.

**Why both are worth it now (vs the rejected #5-as-first-framed).** Separated, each has clear value the author confirmed: #8 is a real workflow improvement (confirm constraints when they matter, reuse the IDEA when present); #5's source makes the IDEA-vs-inferred distinction VISIBLE per field — which is exactly the author's "use it if it's in the idea, flag it if not" instinct, surfaced at the checkpoint. The earlier "defer #5" call was made before that framing; the author's reframing is the new signal.

**Trade-offs.** #5 adds an (additive) schema field + integration-contract surface to maintain. #8 adds briefing prose to keep fresh. Both are honor-system at the irreducible edge (an agent can fabricate a source or ignore the constraint prompt) — accepted because both improve the HONEST agent's output and the human's visibility, which is the realistic lever.

## ADR-044 — 2026-06-04 — Borrowed SDLC/QA methodology provenance: Given/When/Then (BDD, not Gherkin) + MUST/SHOULD/NICE (a MoSCoW variant)

**Status:** ACCEPTED — recording decisions already embedded in the pipeline. Doc-only: no code, template, or schema change; no version bump. These are NOT new gates — adding mechanical enforcement stays out of scope unless a real defect in produced software appears.

**Context.** Aitri borrows two well-known software-methodology conventions but never recorded the lineage or — more load-bearing — the deliberate *boundary*. The mechanism is designed (schema fields + persona + template + briefing) yet `DECISIONS.md` had no entry, so a future agent or adopter can mistake each convention for its better-known full form and "complete" it in a way that breaks a core invariant. This is the CLAUDE.md "discussed but not protected" gap, closed here.

**Decision — 1: Given/When/Then is BDD grammar, embedded as JSON fields, deliberately NOT Gherkin / `.feature` / Cucumber.**
- Acceptance criteria and test cases use `given`/`when`/`then` (`03_TEST_CASES.json` fields; `lib/personas/qa.js`; `templates/phases/tests.md`; requirements ACs). The lineage is BDD (Behaviour-Driven Development).
- It is embedded as plain JSON string fields inside the artifacts — NOT as Gherkin `.feature` files, and NOT wired to Cucumber or any BDD runner. Deliberate, on two invariants:
  - **Zero-dep (principle 1):** a `.feature`/Cucumber pipeline forces a BDD runner into the consumer's toolchain. GWT-as-data forces nothing — the project's own runner executes the tests; Aitri only structures the spec.
  - **Stack-agnostic (principle 4):** Gherkin assumes a step-definition runner. GWT-as-prose-with-concrete-values works for any stack (a Go table test, a pytest function, a Playwright spec) because it is a *writing discipline*, not an execution format.
- **SPEC-SEALED is honor-system BY DESIGN.** The "concrete values, no abstract language" rule (`qa.js`, `tests.md`) is a persona instruction, not a mechanical gate. A vagueness regex over given/when/then was evaluated and **rejected as theater** (recorded earlier in this log under the audit's theater-rejections): it false-positives on legitimate domain terms (already observed on Phase-1 ACs) and a placeholder gate already exists. Re-open only on a real defect in produced software, never "for completeness".
- **Boundary for future agents:** do NOT add `.feature` generation, Cucumber, or a BDD runner. That breaks zero-dep and stack-agnosticism. GWT stays a data + writing convention.

**Decision — 2: `priority: MUST | SHOULD | NICE` is a MoSCoW variant; the enum is a contract — do not widen it to standard MoSCoW.**
- Standard MoSCoW is MUST / SHOULD / COULD / WON'T. Aitri's enum is **MUST / SHOULD / NICE**, with the fourth bucket routed elsewhere:
  - **NICE ≡ MoSCoW COULD** — renamed for plain-language clarity (`templates/phases/requirements.md`).
  - **WON'T-have ≡ `no_go_zone`** — a separate scope artifact (a Tier-A seed input), not a priority value. "Out of scope" is modelled as the no-go boundary, not as a requirement priority.
- `priority === 'MUST'` is a load-bearing read contract across `phase1/3/4/5.js`, `audit.js`, `approve.js`, `resume.js`, `adopt.js`: a MUST FR drives every MUST coverage/compliance gate. An agent or adopter who writes the MoSCoW-standard `COULD` or `WONT` produces a value the pipeline silently treats as non-MUST (dropped from every MUST gate), or that `phase1` validation rejects with a confusing error.
- **Decision: keep the enum as-is and document it; do NOT accept `COULD`/`WONT` as aliases.** Widening a contract for no consumer is the wrong move (same discipline as the rest of this log). The fix for the divergence is *documentation* (this ADR), not a wider enum.
- **Doc inconsistency noted (verified NOT a code defect):** an earlier bug-gating ADR in this log references "MUST/SHOULD/COULD" in prose while the enum is NICE; and the bug-blocking code (`getBlockingBugs`) actually keys on bug `severity` (critical/high), not on linked-FR priority at all. Both are wording drift with no runtime effect — flagged so the prose is read against the code, not the other way around.

**Trade-offs.** Doc-only: the cost is one ADR to keep current; the benefit is two invariants (zero-dep, the priority contract) protected against a plausible "let's finish the standard form" regression, plus a divergence made legible. No mechanical enforcement is added — consistent with the rule that a structural gate without defect evidence is theater. If a real consumer hits the COULD/WONT trap, or genuinely needs Gherkin output, that evidence re-opens the specific question; until then, the convention plus this record is the right level of protection.

## ADR-045 — 2026-06-04 — Split `.aitri` into a shared `.aitri` file + per-machine `.aitri.local` sibling — supersedes ADR-028's deferral

**Status:** ACCEPTED — implemented (rc.51). Reopens ADR-028, which deferred this pending a second signal. The reopening trigger is NOT "architectural discomfort" (the bar ADR-028 set): it is that the current mix **silently breaks Aitri's core guarantee in a team** (below), plus an explicit owner decision to support multi-dev. Hub is not a blocker — owner's call: Hub adapts, provided the integration contract is complete and correct.

**Revised during implementation (directory → sibling).** The first design made `.aitri` a directory (`.aitri/config.json` + `.aitri/local.json`). Implementing it broke ~15 tests + the feature subsystem via `EISDIR`, because much of Aitri's own code and many test fixtures treat `.aitri` as a file. The shipped design keeps `.aitri` a **single file** (shared) and adds a **sibling `.aitri.local`** (per-machine): churn collapsed to the checkpoint tests, Hub is untouched (it reads `.aitri` exactly as before), and the migration needs no file→directory conversion. Same guarantee, far less risk — the risk-mitigation the owner asked for. The directory-collision layout (`.aitri/` already a folder) remains supported as a fallback. The bullets below describe the SHIPPED (sibling) design.

**Context — the real reason (the drift-guarantee chain).** `.aitri` mixes two kinds of state. The per-machine fields (`lastSession`, `reconcileState`) rewrite on nearly every command, so committing `.aitri` creates constant git noise → teams react by gitignoring the whole file (observed on the Hub canary, FEEDBACK H3). But `.aitri` also holds `artifactHashes` — the baseline for **artifact-drift detection** (`hasDrift`, `lib/state.js:311`), which is Aitri's central promise: *the approved spec has not been edited behind Aitri's back*. Gitignoring `.aitri` throws that baseline away, so **a teammate's fresh clone cannot detect spec drift at all** — the core guarantee fails silently in multi-dev. The split lets the baseline be committed (`config.json`) while the noise is ignored (`local.json`). This is tier-1 (the produced-software guarantee), not hygiene — which is why it clears the ADR-028 reopen bar that "architectural discomfort" did not.

**Decision — `.aitri` stays a single file (shared, tracked); per-machine state moves to a sibling `.aitri.local` (gitignored).** `configFilePath()` keeps resolving `.aitri`; a new `localFilePath()` resolves `.aitri.local` (or `.aitri/local.json` in the rare collision layout, still supported).

- **Field partition — denylist, not allowlist.** `LOCAL_FIELDS = ['lastSession', 'reconcileState']`; everything else is shared. New fields default to **shared/committed** — the safe default for the contract (a shared field accidentally going local is invisible to teammates and breaks the contract; the reverse is mere noise). SHARED therefore = `projectName`, `aitriVersion`, `createdAt`, `updatedAt`, `artifactsDir`, `currentPhase`, `approvedPhases`, `completedPhases`, `driftPhases`, `rejections`, `artifactHashes`, `events[]`, `verifyPassed`, `verifySummary`, `verifyRanAt`, `lastVerifyRun`, `auditLastAt`.

- **`reconcileState` → LOCAL (whole object).** `baseRef` is a git SHA *"meaningful only against the local workdir"* (ADR-028's words); `status`/`lastRun` are per-machine. This **decouples the two drift mechanisms**: **artifact drift** (baseline = `artifactHashes`, SHARED → works cross-machine after the split — the tier-1 win) from **code drift** (baseline = `reconcileState.baseRef`, inherently per-workdir → stays local, re-established per clone). The core guarantee rides on artifact drift, which is preserved; code drift is per-machine by nature.

- **Read (`loadConfig`).** Read `.aitri` (shared) and, if present, merge `.aitri.local` over it: `{ ...DEFAULTS, ...shared, ...local }`. The rest of the codebase still sees ONE config object — no call-site changes. A missing `.aitri.local` (legacy project / fresh clone) is the normal case.

- **Write (`saveConfig`) — the load-bearing detail.** Always split: `.aitri.local` is written on every save (gitignored → churn is free); the shared `.aitri` is written **ONLY when a shared field other than `updatedAt` actually changed** (diff the shared partition, excluding `updatedAt`, against on-disk `.aitri`). Otherwise a command that only touched `lastSession` would bump `updatedAt` and re-dirty the tracked file — the exact noise the split removes. An old single-file `.aitri` (per-machine fields inline) auto-migrates on its first save: the shared file is rewritten without them and `.aitri.local` appears. Both writes stay under the existing `dir`-scoped lock.

- **Migration.** New projects (`init`): the first `saveConfig` produces the split (`.aitri` + `.aitri.local`); `init` fixes `.gitignore`. Existing projects (`adopt --upgrade`): no file→directory conversion needed — the file content auto-migrates on the upgrade's `saveConfig`, and `runUpgrade` calls `ensureAitriGitignore` to correct the `.gitignore`. Fresh clone (`.aitri` committed, `.aitri.local` absent): when `reconcile` finds phase 4 approved but no local `reconcileState`, it auto-stamps `baseRef = HEAD` (artifact-drift detection needs no init — it works from the committed `artifactHashes`).

- **`.gitignore` (new responsibility — Aitri previously only *scanned* it).** `lib/gitignore.js::ensureAitriGitignore` — surgical + idempotent: removes a legacy bare `.aitri` (which would hide the now-shared file) and its stale comment, ignores `.aitri.local` + `.aitri.lock`, preserves every other line. Called by `init` and `runUpgrade`; the upgrade report surfaces the change (it touches the user's file).

- **Hub / contract.** Hub reads `.aitri` exactly as before — same path, same shared fields (`updatedAt`, `approvedPhases`, `artifactHashes`, …). Only the two per-machine fields (`lastSession`, `reconcileState`) move out to `.aitri.local`, which Hub never read. So Hub is effectively **unaffected** — a side benefit, not the reason for sibling (the driver was Aitri-internal churn). `status --json` is unchanged (loadConfig merges). SCHEMA.md documents the split + the new `.aitri.local`; integration CHANGELOG records the two fields' relocation.

**Trade-offs.** `.gitignore` rewriting is the most delicate step — kept minimal + surfaced in the upgrade report. Fresh clones re-establish their code-drift baseline (acceptable — code drift is per-workdir; the artifact-drift guarantee is preserved via the committed shared `.aitri`). Cross-machine code-drift history is not shared — by design. The residual git-conflict surface on the shared `.aitri` is real but meaningful (only on genuine concurrent pipeline ops, not the old timestamp noise) and minimized by the conditional-write rule.

**Explicitly NOT changed:** the `events[]` cap (max-20 recent-activity — its consumer, Hub, is well-served; full audit history is a separate, non-existent consumer — see the rc.50-era backlog note). No new gate, no change to produced artifacts. The split is purely about WHERE state lives, to preserve the drift guarantee in teams. **Supersedes ADR-028** (which stays as the record of the deferral and its rationale).

## ADR-046 — 2026-06-10 — Stack-aware project `profile` axis: REJECTED — declaration already covers stack breadth, more expressively

**Status:** REJECTED — not implemented. Closes the "Stack-aware project profile" design study (removed from BACKLOG.md). The first rejection-class ADR; recorded so the question is not re-litigated from zero.

**Context.** Open question: should `.aitri` carry a `profile` enum (`web | cli | service | library | embedded | …`) that conditionally enables/disables phase rules, NFR templates, and runner expectations? The motivating observation is correct and not disputed: Aitri's target spectrum is broad — web/mobile apps, bare endpoints, integrations, data pipelines, Linux binaries, backend-only/no-frontend, libraries/SDKs with no human user, HACS-style components, projects depending on external stacks (React/Node/…), and greenfield vs brownfield. The question is whether a `profile` axis is the right tool for that breadth.

**Decision — do NOT add a profile axis.** Verified against the code, Aitri already absorbs the breadth through **declaration + optionality**, which is strictly more expressive than an enum:

- **Declare, don't assume.** System Design (Phase 2, `architecture.md`) has a `## Deployment Architecture` section where the deployment model is stated explicitly (containerized / binary-native / **package-library** / serverless / static); Phase 5 (`deploy.md`) reads it and packages accordingly — it literally instructs "do NOT default to Docker." `verify-run` runs whatever `test_runner` / e2e runner the project declares, gating on exit code. → covers library, integration, HACS, Linux binary, endpoint, serverless.
- **The human/UX surface is optional or non-blocking.** UX + Discovery are `OPTIONAL_PHASES` → backend-only/library/integration skip them. In Phase 1, the hard-required fields are only FRs + NFRs; `user_personas` and user-stories-per-MUST-FR are **warnings, not gates** (`phase1.js:172-184`) — a project with no human user passes Phase 1, it only gets a nudge. → covers backend-only / library-without-a-human-user.
- **Greenfield vs brownfield is the entry command, not a setting** (`init` / `adopt` / `feature`), already first-class.
- **External deps (React/Node) are the project's,** not Aitri's; the zero-dep invariant is about Aitri itself, which orchestrates the project's own toolchain. Non-issue.

**Why a profile is the wrong tool (not merely unneeded):**
1. **Projects are several types at once** (a backend endpoint that also ships a published client library and a CLI). An enum forces ONE label on a thing that is many; the declaration model expresses combinations natively.
2. **It would duplicate the System Design declaration** → two sources of truth that can contradict (`profile:cli` vs `deployment:container` — which wins?).
3. **It locks the enum to whatever is named first** — HACS, data-pipeline, mobile, serverless do not fit a `{web|cli|service|library|embedded}` set cleanly → perpetual enum churn or wrong-bucketing.
4. It is a `.aitri` contract change Hub must absorb, for no offsetting gain.

**Residual (real, but soft).** Some prompt *examples* lean web/human — the sample persona "End User, tech_level low|mid|high", NFR minimums like "GET /health". Per principle 4 these are acceptable conditional examples, not stack-locked imperatives (no defect). The mitigation — neutralizing those examples — was evaluated and **also declined for now**: changing the most-used phase on a hypothesis carries a real **regression risk to the proven majority (web) case** (the persona/user-story nudges genuinely improve web requirements) and would be guessing blind without a real non-web project in hand. Correct time to neutralize: with a real non-web example to calibrate against, done additively (an escape clause for no-human-user projects) rather than by softening the web nudge.

**When this would be reconsidered (the honest bar).** Only if a stack needs the pipeline to differ **structurally** in a way declaration + optional-phases cannot express: the artifact chain itself must differ, a *core* phase must be added/removed beyond existing optionality, or two runners must run simultaneously. None has been observed.

**Residual concern, folded — not dropped.** The legitimate underlying signal is that Aitri's non-web breadth is "works by design" but **unvalidated end-to-end** — the only third-party validation to date is a web stack (.NET + React). That is **not** a separate backlog item; it belongs to the **v2.0.0 promotion gate** (promotion wants diverse third-party adopters, not only web). Recorded here so the thread survives the study's closure.

**Trade-off.** If a structural divergence later proves real, it is discovered later and fixed then — accepted over building a speculative, less-expressive axis now and freezing it into the `.aitri` contract.

## ADR-047 — 2026-06-10 — `reconcile` post-approve drift nudge: ACCEPTED as-is, not "fixed" — the conservative false-positive is the design

**Status:** ACCEPTED (the current behaviour is the decision). Closes the recurring "reconcile flags the just-approved build as drift after a push" backlog item — removed from BACKLOG.md so it is not re-litigated again (it had been discussed and re-analysed multiple times).

**Behaviour.** After `approve 4`, committing + pushing the build makes `aitri status` nudge "N files changed outside pipeline — run reconcile". Cause: `approve 4` stamps `reconcileState.baseRef = HEAD` while the build is still uncommitted in the working tree; committing it advances HEAD past `baseRef`, so `git diff baseRef..HEAD` surfaces it. Mitigation exists: `aitri reconcile --resolve` advances the baseline (guarded by clean-tree + verify-passed + no-bugs).

**Decision — accept it; do NOT build a fix.** This is conservative-by-design, not a defect: reconcile prefers a **false positive (a recoverable nag)** over a **false negative (silently absorbing real off-pipeline drift)** — the latter would break Aitri's central promise that the approved spec/build was not edited behind its back. A candidate fix was found and weighed (record an approved-build fingerprint at approve time — paths + content hashes — and let reconcile recognise an exact match instead of nagging; genuinely distinct from the three previously-rejected fixes and not blind). It was **declined on value**: the symptom is P3, already recoverable via `--resolve`; the fix means content-hashing the build (incl. untracked files, with binary/line-ending edge cases) inside the already-subtle reconcile mechanism (ADR-045 split), and a bug in that path would trade the safe failure mode for the dangerous one. Value-to-produced-software ≤ 4, severity non-critical → the decision matrix says do not implement.

**Trade-off.** The operator lives with a one-line nag after each approved-build push, cleared by `reconcile --resolve`. Accepted as the permanent cost of keeping drift detection fail-safe. Re-open only if the friction escalates materially AND the fingerprint fix can be made rock-solid (no path to silent absorption).

## ADR-048 — 2026-06-10 — `audit coverage`: an independent requirements-completeness audit (idea→FR fidelity), nudged at resume

**Status:** ACCEPTED — Phase A to build. Adds an audit MODE that checks whether the requirements fully cover the client's original request, run with fresh-session independence. Distinct from the existing code/architecture audit.

**Context — the gap + the evidence.** Aitri's mechanical gates and the existing `audit` verify INTERNAL consistency and CODE quality, never the requirements' FIDELITY to the original intent. The code-auditor explicitly does *"not evaluate against a spec"* ([auditor.js](../lib/personas/auditor.js)). So a requirement set that DROPPED something the client asked for passes every gate — and everything downstream is faithfully built on an incomplete spec. This is **evidenced, not speculative**: round-2 §3.2 — the adopter's root requirements were re-captured **15→25 FRs**; the first capture missed **10 MUST FRs (40%)** at the idea→requirements translation. (The existing rc.59 source-capture audit covers idea_context ASSETS→FR; this covers the IDEA PROSE / discovery / feature-seed → FR — the complement.)

**Why `audit`, not a gate.** A completeness check ("does every client need map to an FR?") is semantic → a mechanical gate would manufacture false confidence (the CLAUDE.md theater warning). `audit` is already advisory and model-judged, so it is the honest home. Two design choices make it trustworthy:
1. **Independence (the load-bearing idea).** The audit is most valuable run in a FRESH session, where the agent did NOT write the requirements → no self-grading bias. So `resume` NUDGES it (conditionally), placing the review at the moment of maximum independence and zero token cost (a suggestion, not an auto-run). This is what makes a model-judged review honest here — it is not the author grading their own work.
2. **Two-stage, false-positive-bounded.** Stage 1 (mechanical, Aitri): feed `{IDEA/00_DISCOVERY + the FR list + the explicit out-of-scope boundaries}`. Stage 2 (model): list client needs with no covering FR. Feeding out-of-scope bounds false positives; advisory output (never auto-fails) makes a false positive a "review this", not a block.

**Decision — Phase A (build now, evidenced):**
- **New meta-persona `coverage-auditor`** (`lib/personas/`) — distrusts requirements COMPLETENESS, not code quality. Posture: adversarial about omission — assume something was dropped until each client need is traced to an FR or an explicit out-of-scope line. Distinct from `auditor` (code-only, "not against a spec"); justified by principle 5 (distinct role, no persona cap).
- **New sub-command `aitri audit coverage`** (`lib/commands/audit.js`) — generates the coverage briefing from `{discovery/idea + FR list + out-of-scope}`; the agent writes findings to a "Requirements Coverage" section of `AUDIT_REPORT.md` (reuse the existing off-pipeline artifact — no new artifact, no schema contract). Findings route to: re-open Phase 1 (add the FR) or record the out-of-scope decision.
- **New template** `templates/phases/auditCoverage.md`.
- **`resume` nudge** — conditional: requirements exist AND (coverage audit never run OR FRs changed since the last one). Persist a marker `coverageAuditLastAt` (additive `.aitri` field, shared, documented in SCHEMA.md) so the nudge stops once run and re-fires when FRs change.

**Decision matrix:**
| Dimension | Evaluation | Justification / Trade-off |
|:---|:---|:---|
| **Impact** | Medium | New audit mode + resume output + 1 additive `.aitri` field. No change to the core 1–5 chain or any gate. |
| **Value to produced software** | 8 | Catches scope loss at the SOURCE (idea→FR), the earliest, highest-leverage point; evidenced (§3.2, 40% under-capture). |
| **Severity** | Moderate | If it fails it under-reports (a missed gap) — same as today; it never blocks, so no false-negative-to-deploy. |
| **Justification** | Fidelity-to-intent is the one thing gates cannot check; `audit` (advisory, model-judged) is the honest vehicle; the fresh-session run removes self-grading bias. |
| **Trade-off** | New persona + sub-command + template to maintain; model-judged → false positives, bounded by feeding out-of-scope + advisory-only; one additive `.aitri` field (Hub-safe); independence holds fully only in a NEW session (the nudge targets session-start resume). |

**Deferred — Phase B (NOT now).** Making the CODE auditor adversarial/staged (mechanical pre-pass → per-dimension deep read → adversarial refute-pass). The right direction for strictness, but there is NO evidence its single-shot form failed — the adopter's defects were planning/coverage, not code-audit misses. Build when evidenced.

## ADR-049 — 2026-06-11 — Contained project layout (`aitri/` container, `product/`+`features/` units) — LAYOUT-1

**Status:** ACCEPTED — Phase A shipped rc.76 (new projects + dual-layout core). Emission surface and the opt-in legacy migration follow in the next rcs. This ADR also formally REJECTS the original `idea/`-as-unit shape.

**Context.** Aitri scattered ~6 entries at a consumer project's root (`IDEA.md`, `idea_context/`, `spec/`, `BACKLOG.md`, `features/`, `.aitri`) — a historical accident of MVP evolution: the root unit's content grew in place while `features/` was born properly contained. Industry peers namespace into one folder (Spec Kit `.specify/`, Kiro `.kiro/`, OpenSpec `openspec/`). The clutter reads invasive/unprofessional at first contact — a product/adoption cost paid during the entire v2-stable era, and a breaking layout change is only acceptable at a major: v2 IS that vehicle, and no v3 cargo exists. Value is tier-2/brand, accepted explicitly by the author as a product call (the decision matrix scores tier-1 value ≈ 1 — engineering alone would not justify this; the matrix measures the wrong axis for a storefront decision).

**Decision — the contained layout (new projects, rc.76+):**
```
<project>/
├── .aitri                  # stays at the root — project identity is layout-independent
├── AGENTS.md CLAUDE.md …   # agent files — agents require them at the root
├── aitri/                  # THE container — everything Aitri-owned
│   ├── product/            #   the root unit: IDEA.md, idea_context/, spec/
│   ├── BACKLOG.md          #   project-level (items become features → lives above the units)
│   └── features/<name>/    #   the increments — interior stays FLAT (already a unit)
└── src/ …                  # user's code — untouched
```
- Schema: `artifactsDir` ABSORBS the unit path (`'aitri/product/spec'`, POSIX) — consumers using the documented `path.join(projectDir, artifactsDir, file)` formula need zero layout knowledge. One additive field `layoutRoot: 'aitri'` (default `''` = flat) covers the non-artifact entries; structure under it is convention, not config.
- Code: layout knowledge lives ONLY in `lib/state.js` helpers (`productSubdir`/`ideaPath`/`ideaContextDir`/`backlogMdPath`/`featuresDir`) — preserving the state.js single-point invariant. The previously-duplicated spec/.aitri prefix filters centralize in `reconcile-patterns.js#isAitriStatePath` (layout-aware SSoT).
- Legacy projects: byte-identical behavior (`layoutRoot` absent → flat). They migrate only via an explicit opt-in `adopt --upgrade` migration (later rc): offered never imposed, clean-git-tree gate, dry-run default, isTTY confirm, idempotency guard. `adopt` keeps producing flat until that rc.

**Rejected — `idea/`-as-unit (the original backlog shape).** Two independent kills: (1) **symmetry paradox** — the safe variant (`.aitri` stays at root) does not achieve the unit symmetry that was its only goal, and the variant that achieves it must move `.aitri` (the root-identity reshape, the highest-risk change available); (2) **name collision** — `idea/` was the legacy assets folder (TPA-3 cost an adopter ~50% scope; `init` actively warns about it), so reusing it would give one name three generations of meaning. The container design dissolves both: containment (not symmetry) is the goal, `.aitri` stays put, and `aitri/product/` collides with nothing. Unit-folder name `product/` chosen over `main/` (git connotation), `core/` (reads as code core next to src/), `idea/` (undersells the content + burned name).

**Trade-offs accepted:** dual-layout support in core until legacy projects migrate (bounded — not forever); `aitri/` ↔ `.aitri` name proximity (documented explicitly in SCHEMA.md and the agent-instruction template; an analysis agent already confused them once); deeper artifact paths; the rc.76 emission surface still prints some flat-era literal paths (templates/AGENTS.md, console strings) until the next rc. Deliberately out of scope (own decision later, post-LAYOUT-1): unifying `FEATURE_IDEA.md`→`IDEA.md` materialization and the `idea_context`/`feature_context` name pair.

## ADR-050 — 2026-06-12 — Unified seed lifecycle: absorb + ARCHIVE (never delete, never duplicate)

**Status:** ACCEPTED — shipped rc.80. Revises the destructive half of ADR-031 and removes the feature materialization mechanism.

**Context.** Two opposite policies existed for the same problem (stale seed briefs contaminating agent context): the root unit's `IDEA.md` was absorbed into `01_REQUIREMENTS.json#original_brief` and DELETED at approve 1 (ADR-031), while a feature's `FEATURE_IDEA.md` was never cleaned up — plus `feature run-phase` materialized a duplicate `IDEA.md` copy so Phase 1 could find the seed under the standard name. Phase-D canary (taskcli, 2026-06-12) surfaced the operator cost: the user saw the product seed "disappear" and the feature seed duplicated, and correctly identified the inconsistency — features accumulate exactly the stale-intent rot the root deletion was meant to prevent. Key code finding: deletion was never load-bearing for the pipeline — re-runs ignore the seed BY CONTENT (01_REQUIREMENTS exists ⇒ SSoT), not by file absence. Deletion only protected against agents browsing the repo, at the cost of losing the human-readable document.

**Decision — one lifecycle for every unit:**
1. The seed is `IDEA.md` (root unit) / `FEATURE_IDEA.md` (feature). **No materialized copy** — phases resolve the seed per scope (`seedPath()` in state.js; the inputs map keeps the `IDEA.md` key so templates stay scope-blind).
2. At approve 1: absorb into `original_brief` (UNCHANGED — audit-coverage intent source + Hub contract intact) and **MOVE the file to `archive/` inside its unit** (`aitri/product/archive/`, `<feature>/archive/`; flat legacy: `<root>/archive/`). Never delete; name collisions get a timestamp suffix; a pre-rc.80 materialized copy is cleaned up when byte-identical.
3. Contamination + token control is the `archive/` convention: Aitri never lists it in briefings (mechanical), and AGENTS.md instructs agents to never read it as current intent and to skip it in reviews (instruction-level — same honor system as all repo browsing, now with a self-describing folder name).
4. The layout migration carries `archive/IDEA.md` file-level (the bare dir name is generic enough to be user-owned).

**Trade-off.** A kept file CAN still be opened by a non-compliant agent (deletion was absolute); accepted — the SSoT-by-content guard plus the folder signal covers the real risk, and the human keeps their document. `validate`'s absorbed-check semantics unchanged (keyed on the live seed path + original_brief).

## ADR-051 — 2026-06-12 — `audit security`: on-demand adversarial security audit + trace-shipping fix (SEC-AUDIT-1 / SEC-TRACE-1)

**Status:** ACCEPTED — shipped rc.83.

**Context.** An external security scan of a deployed site built with Aitri conventions (cesareyeserrano.xyz, 2026-05-29) returned Medium-High risk: public OpenAPI/docs endpoints, verbose health/status (LLM provider + token budget), missing HTTP security headers, an anonymous LLM endpoint with no rate limiting, input-reflecting 422 errors — and `@aitri-trace` comments with FR/UX IDs in the public HTML/CSS/JS. Two verified findings against Aitri itself: (1) **Aitri causes one exposure class directly** — `developer.js` says "Never omit @aitri-trace headers" and `build.md` mandates them with no rule keeping them out of publicly-served assets, so every Aitri web project leaks its internal requirements map by default; (2) **every other finding is deployed-surface class** — invisible to static scanners (bandit/gosec), to the test suite, and to the per-phase security threading (Phase 1 forced NFR decision, Phase 2 Security Design, Phase 3 attack vectors, Phase 4 quality_gates). The pipeline proves *intent*; nothing audits *exposure*. Decision matrix: Impact Medium, Value to produced software 8 (security defects are the most expensive class in consumer projects), Severity Moderate (advisory; transversal baseline already exists).

**Decision.**
1. **SEC-TRACE-1 (fix):** `build.md` + `developer.js` now rule that traces live in SOURCE only — never in assets served verbatim to end users (strip in build or keep server-side); Human Review gains the grep check.
2. **SEC-AUDIT-1 (feature):** `aitri audit security` — third audit sub-command (ADR-048 pattern verbatim: meta-persona, on-demand, advisory, off-pipeline, additive timestamp, conditional resume nudge). New persona `security-auditor` (attacker-first, outside-in, evidence-or-it-doesn't-exist, passive/non-destructive only — defensive boundary explicit). The briefing audits BOTH surfaces: static (code/repo/deps/secrets/build output) and runtime (deployed or locally-run endpoints, headers, exposed docs, shipped assets), with an honest coverage statement when one is unreachable. Findings land as RQ-SEC remediation requirements (priority + attack scenario + evidence + acceptance criteria) in a "Security" section of AUDIT_REPORT.md; `audit plan` routes P0→bug, P1/P2→requirements/backlog. The audit must propose a quality_gate verification script (exit-code checks) so `verify` re-checks the posture mechanically every cycle — the audit is the snapshot, the gate is the permanent protection (principle 8). `build.md` additionally expects a security quality_gate whenever security NFRs are declared (omission requires a declared reason).
3. **Knowledge freshness:** the persona names frameworks/categories (OWASP/ASVS/CWE, supply chain, abuse) and instructs the agent to apply its CURRENT knowledge + the project's own scanners. Deliberately NO embedded vulnerability checklist and NO feed-updating mechanism — both would rot or violate zero-dep (ADR-034/037 division: Aitri orchestrates judgment + project tools, never bundles an analyzer).
4. **Hub integration — Aitri emits signals, Hub composes:** new additive `.aitri` field `securityAuditLastAt`; Hub composes the gap nudge from it + security NFRs + the "### Security" heading (documented in SCHEMA.md/ARTIFACTS.md/integrations CHANGELOG). No status --json change until Hub asks. CLI-side, `resume` nudges once Phase 4 is approved on a project with declared security NFRs and no/stale security audit; projects that explicitly decided security does not apply are never nudged (friction control — the user's design constraint).

**Trade-off.** (a) The audit's judgment half is model-judged, not certified — the output states coverage honestly and the mechanical floor is delegated to the proposed gate; risk of false assurance bounded by the evidence-per-finding and skeptical-pass constraints. (b) Security prompt content rots fastest of all templates — mitigated by anchoring on framework names, not vulnerability lists. (c) Nudge keyed on declared security NFRs misses projects that wrongly declared "not applicable" — accepted: Phase 1 forces that decision explicitly, and overriding it would nudge every CLI tool forever.

## ADR-052 — 2026-06-19 — Runner-result reading is one universal contract, not a parser per stack (FB-MULTI-0619)

**Status:** ACCEPTED — shipped rc.89.

**Context.** rc.85 added TRX + JUnit-XML parsers so `verify-run` could read `.NET`/`dotnet test`, which writes per-test results to a file rather than parseable stdout (the blocker that left every TC `skip` on a C# stack). That fixed .NET, but raised the right question (consumer-style): the next stack with a runner whose output `verify-run` doesn't recognize would hit the same wall, and "add another parser" (NUnit-native, TAP, a new console shape, …) is the same accretion smell — in code this time — that the per-stack briefing tables already taught us to avoid. Aitri should not be on a treadmill of learning every runner's format.

**Decision.** Aitri reads a TC result one of **three universal ways**, and adds no further per-format parsers:
1. **STDOUT marker** — the runner prints the TC id with a pass/fail glyph (`✓/✗ TC-XXX`, or a function/method named after the TC id). Native for most JS/Go/Python runners; any runner can be made to emit it with a tiny custom reporter.
2. **Results FILE — JUnit-XML (preferred) or TRX** — `verify-run --results <file|dir>` (plus mtime-guarded auto-discovery of `.trx` / `TEST-*.xml` / `junit*.xml`). **JUnit-XML is the universal target**: nearly every runner/CI emits it natively or via a reporter, so it — not a growing parser set — is how an otherwise-unrecognized stack is read.
3. **EVIDENCE** — `tc verify <TC> --result pass|fail --evidence <path>` records a result against a real on-disk artifact when neither of the above fits. The manual floor; never a hard wall.

The project adapts its runner to one of these three; Aitri does not adapt to the project's runner. This is the verification-spine application of **orchestrate-don't-bundle** (ADR-034/037, zero-dep): Aitri defines the contract and runs the project's own tools, instead of embedding format knowledge that rots and grows. TRX is grandfathered (a major ecosystem's default, worth frictionless support) and is the **last** bespoke per-format parser; a future "add support for runner X" request is answered by routing X to JUnit-XML / the stdout convention / `--evidence`, not by a new parser — unless X is a major ecosystem whose default cannot emit any of the three (a bar TRX met and almost nothing else will).

**Trade-off.** A runner whose native output is neither stdout-markable nor JUnit-XML-emittable needs a small project-side adapter (a reporter, or `--evidence`) instead of out-of-the-box auto-detection — friction pushed to the rare exotic case, in exchange for never bloating Aitri's parser surface or chasing the format treadmill. Accepted: the contract is stable and documented, the escape valves cover every case, and zero-dep/coherence are preserved. Not built (the over-engineering trap explicitly rejected): a plugin/registry/DSL for declaring custom parsers — capability for stacks that do not exist yet.

## ADR-053 — 2026-06-20 — Fake-pass seam (C1): mutation testing as an opt-in quality_gate + a per-gate timeout + a nudge — NOT an independent-reviewer gate

**Status:** ACCEPTED — shipped rc.103. Re-opens ADR-034 §C3 (mutation, deferred "until a security/production-critical adopter asks") on maintainer request.

**Context.** Aitri mechanically enforces that tests EXIST and are STRUCTURALLY sound (schema, FR coverage, vagueness, placeholder results, Three-Amigos h/f), but cannot mechanically verify they are SEMANTICALLY real — that a passing test actually exercises the behavior its AC names. A mock-only "e2e" test exits 0 while the feature is dead (the "Ledger" lesson); the recurring testing-gap fixes across Aitri's history are symptoms of this one root. A deep design pass (two adversarial reviews) asked whether Aitri could add an impartial verification authority. **It cannot, structurally:** Aitri makes NO API calls (ARCHITECTURE.md), so it can never BE the independent verifier, and any reviewer it orchestrates is authored by the agent that wants to ship — its verdict is honor-system (ADR-038 records this for `reviewGate`). The only impartial check is a MACHINE signal, and the only machine signal that catches the mock-only fake pass is **mutation testing** (mutate the real code, re-run the tests; a surviving mutant proves a test never exercised that code — true even at 100% coverage, where assertion-density and the existing gates are blind).

**Decision.**
1. **Mutation runs as a project-declared `quality_gate`, gated by EXIT CODE — no score parser.** Mutation tools (Stryker, pitest, mutmut, infection) exit non-zero below their configured score threshold; `runQualityGates` already gates on exit code. Aitri does NOT parse mutation-score output — that is the per-stack parser treadmill ADR-052 explicitly closed. The project configures its tool's threshold; Aitri judges the exit code. So the gate itself needs no new Aitri code.
2. **Per-gate `timeout_ms` (additive to `quality_gates`).** The hardcoded 5-min `spawnSync` timeout in `runQualityGates` killed real mutation runs mid-flight. A gate may now declare `timeout_ms` (default 300000). A gate killed at its timeout is `status: "error"` (raise it / something hung), not `"fail"` (the code failed the check). Serves any slow gate; this is the only enabling code change.
3. **Opt-in advisory nudge, NOT a forced gate.** `verify-run` prints one line when a project has automated tests but declares no mutation gate. It never blocks and never forces a tool — mutation tools do not exist for every stack (Go/embedded/Rust are thin/absent), so forcing one would block honest projects, not protect them (principle 4). The omission is made conscious, not silent.

**Rejected (on record, so the false premises are not reintroduced).**
- **A `probe` / fourth result valve** (Aitri re-executes a command against the running system): the agent authors the probe, the system it interrogates, AND the mock — re-execution buys execution integrity, never semantic; also stack-bound (no `localhost` in a library/CLI). Closes the Ledger seam not at all.
- **Promote the reviewer to a blocking gate, or force a Phase-1 "do you have fake-pass protection?" Y/N (the "option B" considered):** both are honor-system — the same agent that wrote the mock-only test authors the review verdict / the Y/N answer. A blocking reviewer would NOT have caught Ledger. Forcing the answer on every project is friction with no mechanical payoff — the CLAUDE.md "structural gate that only validates field presence is theater" warning. **Escalation path:** if real evidence later shows the advisory nudge is ignored and a fake pass ships, revisit the forced question — not before.
- **First-class mutation-score parsing; defaulting `strictAssertions`/`reviewGate`:** parsing re-imports the ADR-052 treadmill; defaulting punishes honest greenfield projects and was deliberately opt-in (ADR-034 B2 / the autonomy-for-CI reasoning). Neither without adopter evidence.

**Trade-off.** Mutation is opt-in and stack-limited, so the seam stays open by default for projects that do not turn it on — accepted, because the only alternatives are impossible (forcing a tool where none exists) or theater (the agent self-attesting). The nudge makes the omission conscious; real mechanical teeth exist for the stacks that have a tool. The deeper finding on record: a passive prompt-generator cannot impose impartiality on the agent it prompts — the verifier-with-conflict is a permanent ceiling, narrowable only by machine signals, not by a stricter persona or an "authority."

**Scope.** Decides: mutation as exit-code quality_gate (no parser); `timeout_ms`; the opt-in nudge; the rejections above. Does not decide: an optional user-key LLM reviewer for the SEMANTIC layer (verifies-the-wrong-thing / TPA-8, which mutation does not catch) — a separate future study, because it would breach the "no API calls" invariant and is an ADR-level decision in its own right.

## ADR-054 — 2026-06-21 — A regression NFR (`category: "Regression"`) is a hard MUST regardless of priority (REG-GATE-0621)

**Status:** ACCEPTED — shipped rc.104.

**Context.** The Must-Not-Break → regression-NFR → forced-test → blocks-deploy chain was the mechanism that protected a preserved behavior when a project modifies a live system (feature, migration, refactor). Reading the code, the entire chain hung on one field, `priority: "MUST"`: the Phase-3 forced-TC gate (`phase3.js`), the Phase-5 traceability-compliance gate (`phase5.js`), and the deploy-time MUST-NFR advisory (`verify.js`) all filtered `priority === "MUST"`. But `category` — the field an author naturally sets to `"Regression"` — was read by **no gate** (display-only, `snapshot.js`/`resume.js`/`audit.js`), and the canonical NFR schema shown to the agent (`requirements.md`) **omitted `priority` entirely** and did not list `"Regression"` as a category. An agent writing a regression NFR per that schema produced `priority: undefined` → it silently escaped all three gates while the artifact looked documented and rigorous. The protection was honor-system on the agent emitting a field the schema didn't show; for non-feature (`adopt`) scope the regression-block prose (`{{#IF_PARENT_REQUIREMENTS}}`) never rendered at all, so the escape was unconditional there. Verified directly from code; confirmed by an independent adversarial pass that also rejected the alternative below.

**Decision.** Treat a requirement as MUST when `priority === "MUST"` **OR** `category === "Regression"`. One source of truth, `lib/requirements.js` `isMustRequirement(r)`, replaces the bare predicate in the three NFR-MUST gates. `"Regression"` is added to the canonical NFR category enum, and the Phase-1/Phase-3 prompts + `templates/AGENTS.md` are corrected to state that a regression NFR is a hard MUST needing the full happy/edge/negative test set (the prose previously implied a single TC sufficed — stale even before this change, since the Three-Amigos gate already fires on any requirement that has TCs).

**Rejected.**
- **Hard-validate `priority` on NFRs in Phase 1** (force every NFR to declare MUST/SHOULD/NICE): would newly-fail greenfield and existing in-flight artifacts — the base schema *told* agents to omit NFR priority — and is asymmetric with FRs, which are not required to declare priority either (`phase1.js` filters MUST-FRs but never requires the field). It closes the hole by breaking valid projects. The category route only ever *adds* protection to an NFR that named `"Regression"`; it never newly-fails one that didn't.
- **Add `priority` to the canonical NFR schema as well** (the adversarial's "fix both" option): rejected as scope creep with a side effect — agents would start marking ordinary NFRs (Performance, Security) `MUST`, tightening the forced-TC gate for all NFRs, friction nobody asked for. Making `category` sufficient resolves the schema/prose contradiction without it.

**Trade-off.** `category: "Regression"`, previously decorative, becomes load-bearing — a project that used it loosely as a label on a non-MUST NFR would now be gated. Accepted: zero such usage exists in the canary/adopter base (grep), and the new posture matches what any author assumes when they write `category: "Regression"`. Exact-string match (`"Regression"`, not `"regression"`) is consistent with the rest of the un-normalized category convention.

**Consumer contract.** Additive shape, semantic broadening. No artifact field added/removed/retyped; consumers read Aitri-*computed* `requirement_compliance`/`fr_coverage` (which only gain rows), not the predicate, so the actual consumer (Hub) does not diverge. A future consumer that independently replicates "is this NFR a MUST" must mirror `priority === "MUST" || category === "Regression"` — documented in `docs/integrations/{ARTIFACTS,CHANGELOG}.md`.

## ADR-055 — 2026-06-21 — `adopt` is bivalent: bring an existing project under Aitri to stabilize it OR to pursue a specific objective

**Status:** ACCEPTED — definition + framing shipped rc.106. The guided-initiation FLOW (how the operator's objective and its supporting docs are captured before the audit) is deliberately DEFERRED to a follow-up; this ADR fixes the MODEL so that flow is not designed from the narrow one.

**Context.** Aitri has two entry models: `init` (greenfield — no code yet, created under Aitri) and `adopt` (a project that already exists). `wizard` is not an entry — it is a seed-capture helper used inside `init`/`feature`. The defect: across the whole project, `adopt` was defined as *stabilization* of an existing codebase, not as adoption-for-any-objective. Verified in four places, including the two operator-facing ones: the help line (`help.js` — "diagnostic + stabilization plan"), the README command table (`IDEA.md` "stabilization brief"), the `adopter` persona (`adopter.js` — "produce a specific stabilization brief … You are not designing anything new"), and the scan template (`scan.md` — "Adoption Stabilization", "No new product features — stabilization only"). The bivalent reality — an operator adopts an existing project to do ONE bounded thing in it (a migration, a feature, a refactor, a security fix), not only to clean it up — existed only in a local, unfinished design note, committed nowhere. A real present consumer (an Umbraco 10→17 migration) is exactly the objective-driven case. The narrowness was self-reinforcing: every reader of the code (human or agent) was told "adopt = stabilize", so the model kept being re-derived narrow — this thread stalled three times on it.

**Decision.** Adopt is **bivalent** by definition: *adoption brings an existing project under Aitri to either (a) stabilize/institutionalize it — no specific objective, the objective emerges from the audit — or (b) achieve a specific objective the operator brings, with the audit serving that objective.* Stabilization is the DEFAULT when no objective is stated, not the only mode. The definition is recorded here and the four framing sites are corrected to state it. Persona and template are corrected at framing level only (bivalent + default-stabilization); the false absolute "You are not designing anything new" is removed, since an objective-driven adoption legitimately designs new behavior.

**Deferred (explicitly NOT in this step).** The guided-initiation FLOW — how the operator's objective and its supporting documentation/annexes are captured *before* the audit, where they live (the `idea_context/` home and its creation ordering relative to `scan`), and the objective-focused adversarial restructure of the scan prompt — is a separate design. For a passive prompt generator the prompt IS the mechanism, so that work is done deliberately, not rushed into a framing pass.

**Rejected.**
- **`adopt --goal` flag / a one-line CLI argument for the objective** — an objective can carry rules, documentation, instructions, and annexes; it is an INPUT artifact, not a scalar parameter. Mechanism belongs to the deferred flow, not the definition.
- **Treating the bivalence as a special case bolted onto a stabilization-first model** — that inversion is what produced the defect. Bivalence is the baseline; stabilization is one branch (the default).

**Trade-off.** Correcting the persona/template framing before the full flow exists leaves an interim where the agent gets the objective from chat context (Aitri's existing honor-system level) rather than from a guaranteed capture step. Accepted: it is strictly better than today — the template no longer FIGHTS a stated objective — and the capture mechanism is the very next step.

**Consumer contract.** No artifact schema, `.aitri` field, or command surface changes — `adopt scan`/`adopt apply` keep their signatures and `IDEA.md` keeps its shape (only its framing generalizes). Pure model + prompt/doc correction. No Hub impact.

## ADR-056 — 2026-06-21 — The adopt FLOW: an objective-focused audit that the phases consume (the flow deferred by ADR-055)

**Status:** ACCEPTED — Stage 1 shipped rc.107 (audit becomes a consumed artifact + rename), Stage 2 shipped rc.108 (guided bare `aitri adopt` entry + pure-IDEA + `apply` relocates a root `idea_context/`). The adopt-initiation thread (ADR-055 model + ADR-056 flow) is closed. Note on capture: the objective is a structured seed the operator fills (+ rich docs in `idea_context/`), NOT a wizard Q&A — an adoption objective carries rules/docs/annexes a one-line interview cannot hold; the wizard's dual-mode machinery was therefore not reused.

**Context.** ADR-055 fixed the adopt MODEL (bivalent: stabilize OR a specific objective) and deferred the FLOW. The flow question: for an objective-driven adoption — how does the operator's objective + its supporting docs get in, how is the audit focused on the objective, where does the objective live, and how do the audit findings reach the plan WITHOUT polluting the operator's intent. An adversarial pass over the first flow draft surfaced these code-verified constraints:
- `IDEA.md` is the operator's PURE intent (ADR-050: the seed is absorbed verbatim into `01_REQUIREMENTS.json#original_brief` and archived, never mutated). The audit must NOT be crammed into it.
- `ADOPTION_SCAN.md` is read by NOTHING today — not a Hub contract (absent from `docs/integrations/`), no `lib/` reader (human-only). Its findings reach the pipeline only because the scan agent distills them into `IDEA.md`, which Phase 1 reads. If `IDEA.md` becomes pure, that indirect path breaks → the audit must reach the phases directly.
- `apply` creates `aitri/product/idea_context/` fresh and does NOT relocate a root `idea_context/` (it only moves root `IDEA.md`, `adopt.js`). So scaffolding the doc home at the project root before `apply` orphans the operator's docs — they never reach a briefing (BLOCKER in the first draft).
- Phases 1, 2, 3 ALREADY receive `idea_context/` in their briefings (`run-phase.js` CONTEXT_PHASES = {discovery,1,ux,2,3}). Phase 2 has NO other optional-input hook (`phase2.js` inputs = `01_REQUIREMENTS.json` + optional `01_UX_SPEC.md`; `architecture.md` has only FEEDBACK/UX_SPEC/BEST_PRACTICES conditional blocks). So the cheapest, no-new-plumbing channel for the audit is `idea_context/` itself.

**Decision (the flow).**
- Rename `ADOPTION_SCAN.md → ADOPTION_AUDIT.md` (names the result, not the `scan` verb; not a contract — no machine consumer, so direct rename is safe).
- The audit becomes a CONSUMED artifact by living in `idea_context/` (which Phases 1/2/3 already list) + a one-line nudge in the Phase-1/2 prompts to read it and ground requirements/design in its findings. No new injection plumbing — the channel exists.
- `apply` relocates a root `idea_context/` into the unit (symmetric with how it already moves root `IDEA.md`) — fixes the orphan and unblocks "provide docs before apply".
- `IDEA.md` stays the operator's pure objective; the audit (findings) is the separate consumed input.
- The guided entry `aitri adopt` (bare) — captures the objective (wizard dual-mode machinery + adopt-specific questions) and scaffolds the doc home — is Stage 2.

**Staged delivery.** Stage 1 (rc.107): rename + audit-in-`idea_context` + Phase-1/2 nudge + `apply` relocates root `idea_context`. This alone makes the audit a consumed artifact (the core tier-1 value: requirements + plan grounded in real findings) with no new command and no ordering bug. Stage 2: the guided `aitri adopt` entry + pure-IDEA capture (where scan stops distilling the audit into IDEA).

**Rejected.**
- **`{{#IF_ADOPTION_AUDIT}}` content-injection into Phase 1 + a new Phase-2 hook** (first draft): more plumbing than the value warrants — `idea_context/` already carries files into Phases 1/2/3. Reserve explicit injection for if the listing proves too weak (no evidence yet).
- **Phase-2-specific audit plumbing**: Phase 2 already receives `idea_context/` and builds on audit-grounded Phase-1 requirements. New hook = most plumbing, least marginal value.
- **Scaffolding the doc home at the project root before `apply`** (first draft): orphans the docs. Fixed by making `apply` relocate root `idea_context/`.
- **Dropping the rename and the guided entry** (the adversarial's leanest): the rename is a low-risk clarity win the maintainer asked for; the guided entry addresses a real operator-friction concern (a dev with a project + objective does not know how to start or where docs go) that is a product judgment, not refutable from code. Kept; the BLOCKER is fixed cleanly, not a reason to cut the entry.

**Trade-off.** The audit reaches the phases as a LISTED context file + a prompt nudge (honor-system, like all of Aitri's passive layer), not a hard-injected input. Accepted: it matches Aitri's enforcement floor and avoids new plumbing; tighten to explicit injection only if a consumer shows the agent skipping it.

**Consumer contract.** `ADOPTION_AUDIT.md` is not a Hub contract (the old name was not either). No `.aitri` field or artifact-chain change. `idea_context/` gains one more file (already a free-form folder). No schema impact.

## ADR-057 — 2026-06-23 — A pending (unverified) manual TC does not satisfy a coverage gate (ADV-0622-01)

**Context:** A `status:"manual"` result in `04_TEST_RESULTS.json` is *pending* — seeded by `verify-run`, not yet verified by a human (`aitri tc verify` records a verified manual TC as `status:"pass"`). Four gates exempted `status:"manual"` from counting as coverage: `verify.js` `isUncovered` (MUST FR), the e2e gate, `buildACCoverage`, and `phase5.js` `OK_EVIDENCE`. The all-manual zero-verification guard only fires when *no* test passes, so the moment any unrelated test passed, a MUST FR/AC/e2e whose only test was a pending manual TC reached `verifyPassed:true` and shipped unverified — a verification-spine false-pass (found in the 2026-06-22 adversarial review, reproduced by running the real CLI in round 3).

**Decision:** Remove the four manual exemptions. A MUST FR needs ≥1 *passing* test; a verified manual TC is `status:"pass"` and counts, a pending one does not. `ac_coverage` no longer emits `"manual"` (a pending-manual criterion is `untested`/`uncovered` and blocks). `fr_coverage[].status:"manual"` is kept as a display value (pending, 0 passing) but no longer exempts the gate. `aitri tc verify` recomputes `ac_coverage` too (R3-8), so a verified-FAIL criterion is reflected at once.

**Trade-off:** Breaking on the *semantics* of an existing field value — a consumer that treated `manual` as covered/safe must update; the `ac_coverage` status enum loses `"manual"` (recorded `breaking` in integrations/CHANGELOG.md). A project that genuinely cannot automate a test must now `tc verify` it (one extra step) rather than marking it manual and shipping — which is the intent: an unverified test is not evidence.

**Objections:** None at the gate-design level — the prior behavior was an unintended false-pass, not a deliberate exemption. The round-3 adversarial verifier confirmed the legitimate verified-manual flow is unaffected (verified manual → `status:"pass"` → covered).

## ADR-058 — 2026-06-23 — Git is never invoked through a shell with interpolated values (R3-15 / R3-4)

**Context:** Several `git` calls used `execSync(\`git … ${value}\`)`, which runs via `/bin/sh -c`. Some interpolated values originate in committed, attacker-controllable state: `artifactsDir` (→ the drift-check path exercised on `aitri resume`/`status`), the reconcile `baseRef`, and `BUGS.json` `fix_commit_sha` (→ `aitri bug close`). A hostile clone could thus achieve zero-interaction RCE on routine commands. `JSON.stringify`-quoting the value did **not** help — shell command-substitution (`$()`, backticks) is active inside double quotes (R3-15 critical, R3-4 high; both found in the round-3 workflow, which the prior two review rounds had missed).

**Decision:** Every git invocation that includes a non-constant value uses `execFileSync('git', [argv…])` (no shell). The revision range (`${baseRef}..HEAD`) and paths pass as literal argv tokens, so a payload reaches git as a bogus revision/pathspec (error), never the shell. `fix_commit_sha` is additionally shape-validated (`/^[0-9a-f]{7,40}$/i`). Fixed-string git calls (`git rev-parse HEAD`, `git status --porcelain`) carry no interpolation and stay `execSync`. Standing invariant: a new git call with interpolated input MUST use `execFileSync`.

**Trade-off:** Slightly more verbose call sites; no shell features were in use, so nothing is lost. Guard tests assert a `$(...)` payload smuggled in committed state does not execute.

**Objections:** None — pure security hardening with no happy-path behavior change (the existing git-repo tests pass unchanged).

## ADR-059 — 2026-06-25 — Feature-scoped requirements audit + `audit coverage` → `audit requirements` rename (AUDIT-COV-FEAT-0625 fork 2)

**Context:** The idea→FR completeness audit (`audit coverage`, ADR-048) was **root-only and feature-blind**. `cmdAuditCoverage` read only the root intent sources + root `01_REQUIREMENTS.json`; it never discovered feature sub-pipelines, and there was no `aitri feature <name> audit <…>` at all (`feature.js` had no `audit` case). Two real consequences, both observed on the Ledger canary: (1) a root need covered by a *feature* FR read as a coverage gap (false positive → wasted re-work), and (2) a feature's own ideation→FR completeness was unauditable, so a need decided in `FEATURE_IDEA.md` but never turned into a feature FR (and not declared out-of-scope) was lost silently — the operator caught Ledger `budget`/D-7 only by tracing intent→FRs by hand. Separately, the sub-command word `coverage` collided with **test coverage** (`verify-run --coverage-threshold`) — the same surface already has a different "coverage", an ambiguity inside Aitri's own CLI.

**Decision:** Two changes, shipped rc.122. **(a) Feature-scoped audit (fork 2):** add `aitri feature <name> audit requirements`, comparing the feature's own intent (live `FEATURE_IDEA.md` pre-approve, absorbed `01_REQUIREMENTS.json#original_brief` post-approve — resolved via `seedPath`, never the archived seed) against the feature's FRs only. `buildIntentSources` gained an optional `featureRoot` arg (additive); the briefing carries a scope note ("audit THIS feature's intent vs THIS feature's FRs; the parent project's FRs are out of scope"). Bounded to `requirements` at feature scope — `plan`/`security`/default code audit run at the project root. This preserves ADR-048's independence/fresh-session posture (same `coverage-auditor` persona, feature-scoped inputs) rather than turning the root audit into a stateful cross-pipeline crawl. **(b) Rename:** `audit coverage` → `audit requirements` (parallel to `audit security`, names what it checks). Non-breaking: `coverage` is kept as a deprecated alias that routes to the same audit and prints a one-line rename note, so existing consumer AGENTS.md instructions and scripts keep working. Internal names unchanged (`coverage-auditor` persona, `coverageAuditLastAt` `.aitri` field — a schema contract, `auditCoverage.md` template).

**Trade-off:** **Fork 1 (widen the root audit's universe so a feature FR counts as covering a root need) was deliberately NOT built.** For an advisory audit whose job is to *find* gaps, over-reporting is the safe failure mode: a loose match marking a root need "covered" by a feature FR when it isn't would **hide a real gap** (the expensive direction) — strictly worse than a spurious gap the operator dismisses. Fork 1 stays deferred, strict-match-only if ever pursued. Fork 3 (a "covered by feature X" provenance link) stays blocked — no modifies/extends relationship is recorded today. On the rename: doing it now (low adoption) is cheaper than at the v2 freeze, but it only partially addresses the freeze naming pass — the `verify`/`verify-run`/`verify-complete` overload still waits for the freeze + evidence of real confusion.

**Objections:** (1) *The rename should wait for the v2-freeze naming pass* (where `verify*` is parked) — countered: `audit coverage` is newer and far less entrenched, the alias makes the change non-breaking and reversible, and I had just propagated the name further with the new feature command, so renaming before it spread was cheaper. (2) *Feature-scoped audit alone doesn't fix the root false positive (fork 1's case)* — accepted and explicit: fork 2 and fork 1 are separate needs; fork 2 has the stronger standalone evidence (budget/D-7) and zero risk to existing behavior, so it ships first while fork 1 waits. (3) *The recurring "requirement decided in ideation but never implemented" pain is only half-addressed* — true: this audit is the independent *backstop* (detector); the mechanical *teeth* is a separate, larger design (a Phase-1 intent-coverage map gate, contract change, its own ADR) recorded under REQ-RICHNESS-0624, not built here. Both adversarially reviewed before commit; the rename review caught four stale `audit coverage` references in the committed `docs/integrations/*` contract (fixed pre-commit).

## ADR-060 — 2026-06-25 — Intent coverage map: externalise the idea→requirement decomposition so a silent drop is catchable by comparison (REQ-RICHNESS-0624)

**Context:** The recurring #1 pain is **silent scope loss** — a need decided in ideation that never becomes an FR and is never declared out-of-scope, so it vanishes with no trace (Ledger `budget`/D-7: a real "reorder" need, covered by no FR, caught only by manual diligence). The Phase-1 briefing ALREADY instructs full decomposition ("a screen with no FR is a gap; a user action with no FR is a gap" — `requirements.md`), and `rc.119` gates `no_go_zone` non-empty — yet D-7 dropped anyway. So a stronger *prompt* won't fix it: the decomposition happens **invisibly** (in the agent's head) and a dropped need leaves nothing to check against. To catch a drop today the human must re-derive the entire need-set from the seed from scratch — expensive, so nobody does, and the drop ships. The independent `audit requirements` pass (ADR-048/059) catches a never-listed need, but it re-derives from scratch (open-ended) and is advisory.

**Decision:** Add `01_REQUIREMENTS.json#coverage_map` (`[{need, disposition}]`) — the agent's decomposition made **explicit and comparable**: every distinct need → an FR/NFR id or `"out_of_scope"`. **Two layers, deliberately split:** (1) a **light Phase-1 gate** (`phase1.js#validateCoverageMap`, fresh-seed only, same lifecycle as the provenance gate → existing approved projects never trip it, no migration) that checks only structural validity — present, non-empty, every disposition a real requirement id or `out_of_scope`. (2) the **teeth — the independent comparison**: `audit requirements` now receives the map and is instructed to re-derive the needs ITSELF first, then DIFF against the map (a: a derived need absent from the map = the silent drop; b: a wrongly-`out_of_scope` entry; c: a hollow FR disposition). The map converts the catch from "re-derive everything" into "compare two lists" — cheap enough that the human (at approve) and the audit actually do it. The gate is **not** the teeth; the comparison is.

**Trade-off:** **The map alone does NOT fix the failure** — the agent fills it, so a need it never surfaces is absent from the map too (the same blind spot that dropped it from the FRs). The value is realised ONLY coupled with the independent comparison; shipping the gate without the audit integration would be exactly the presence-gate theatre this repo warns against, so the two shipped together. Authoring burden: one `{need, disposition}` line per need on every fresh Phase 1 — bounded (≈ FR count) and it externalises decomposition the briefing already requires, not new work. The map is partly redundant with the FR list (covered needs → FR ids); the NEW information is the excluded needs as explicit entries and the agent's *need text* (which can reveal a misread the FR title hides).

**Objections:** (1) *D-7 happened WITH the enumeration prompt; writing it down doesn't fix the blind spot* — correct, and stated as the ceiling: the map does not fix the agent's omission, it lowers the COST of a second party catching it (compare vs re-derive), which changes who-catches-it from "nobody" to "the human/audit". A mechanism change, not words — but a mitigation, not a guarantee (two independent passes can still miss the same need). (2) *This is just `idea_provenance` with extra steps / a presence-gate the backlog calls theatre* — countered: provenance gates a CLOSED set (5 fields) with real teeth; this gates an OPEN set and explicitly does NOT rely on the gate for teeth — the teeth are the comparison. Not theatre **because** the audit integration ships with it; without that integration it WOULD be theatre. (3) *Granularity abuse — a coarse map clears the gate* — true and unforced by the gate (it can't judge granularity); caught by the same independent comparison (the audit re-derives finer needs and flags the gaps) and the human at approve. Stack-agnostic: `{need, disposition}` carries no UI/HTTP assumption (a "need" is any capability the intent expresses). Adversarially reviewed before commit.

## ADR-061 — 2026-06-26 — Sprint planning layer: a Product-Owner phase that groups requirements into prioritised delivery slices, gating Phase 4 on its approval (SPRINT-PLAN-0626)

> **STATUS: WITHDRAWN 2026-06-28** — the sprint/implementation-strategy layer is discarded from the backlog as not executable. Mechanical per-slice verification (Layer 2) is **structurally blocked** (see this ADR's own trade-off below: `fr_coverage` is whole-project, so a per-slice gate is presence-theatre `verify-complete` already covers); Layer 1 alone is an informational plan (panel-killed as build-now). Three reactivation attempts (2026-06-28) each dissolved against that wall — the documented adopter pain was *delivery-structure expression over an already-decomposed backlog*, and the best-evidenced loss is verification-depth, not big-bang. **Re-open only via a NEW ADR** if a real project that built a plan fires the deferral trigger ("verify SL-001 independently"). Originally PROPOSED 2026-06-26 (design record, never implemented) — retained below as the historical record. Do not treat as built or pending.

**Context:** Aitri models the *atoms* of work — FR/NFR in `01_REQUIREMENTS.json`, User Stories (`user_stories[]`, each with `id`, `requirement_id`→FR, structured AC) already first-class in that same artifact, TCs in `03_TEST_CASES.json`, and the FR-centric verification spine (`fr_coverage`, `ac_coverage`). What it has **no** model for is the *planning and delivery* layer above the atoms: which requirements ship together, in what order, prioritised by business value, as verifiable delivery units. An external adopter hit this directly — many User Stories written, no way to express which are executed together, what is delivered partially, or what a unit of execution (not time — a "sprint/session" in the agile sense) commits to. The result is "a backlog without a delivery structure": the atoms exist, the plan over them does not. Today the agent enters Phase 4 against the *whole* approved requirement set with no externalised, user-approved execution plan and no checkpoint for "plan the build before building it" — the moment real teams do sprint planning, once the backlog is refined and acceptance criteria exist.

**Decision (Layer 1 — the Plan; Layer 2 deliberately deferred):** Add an **optional `sprint_plan` phase between Phase 3 and Phase 4**, driven by a new **Product Owner persona** (distinct from the PM: the PM defines *what* to build; the PO decides *what to build first*, by business value, and groups it into deliverable slices). It produces a new off-spine artifact **`SPRINT_PLAN.json`** with **two top-level sections, NESTED — the backlog is the product-level container and the epics live inside it** (corrected 2026-06-26 from an earlier flat `epics[]`+`backlog[]` peer shape): (1) **`backlog`** = `{ epics: [ { id, name, value, rationale, user_stories: [ { us_id, priority } ] } ] }` — the product backlog *contains* epics, each epic *contains* its User Stories (referenced by `us_id`, not duplicated — the full US lives in `01_REQUIREMENTS.json`); the PO prioritises by epic `value` and orders US within an epic by `priority`; (2) **`sprint_plan`** = `{ slices: [ { id, goal, scope: [US ids], deliverables[], verification[], status } ] }` — each slice is a transversal delivery unit that **may cross epics** (a slice has NO `epic_id`; its `scope` pulls US from any epic). **`scope` references User Story ids** (the agile atom, already formalised). In Layer 1 `scope` is **informational** — see revision (a); the US→FR / `fr_coverage` connection is a Layer-2 concern, not a free Layer-1 property. **The gate is the approval, not a per-slice mechanism:** when `SPRINT_PLAN.json` exists and `sprint_plan` is not in `approvedPhases`, **Phase 4 is blocked** — a *conditional* check by phase number at the `run-phase` chokepoint (mirroring `verify-complete`→Phase 5). `backlog`/`sprint_plan` live in `SPRINT_PLAN.json`, **not** in `01_REQUIREMENTS.json` — they are delivery groupings, not requirements; placing them in requirements would feed Phase 2/3 noise outside their level. A read-only `aitri sprint list/show` surfaces the plan; the phase is produced through the normal `run-phase`/`complete`/`approve` lifecycle. The slice's `verification[]` is PO-authored acceptance the agent honours and the user reviews — honour-assisted, **not** mechanically gated.

**Trade-off — Layer 2 (mechanical per-slice verification) is NOT built, and the reason is structural, not scheduling:** `fr_coverage` is computed whole-project (`buildFRCoverage(results, testCases, frIds)` maps all FRs against the full suite — verified in `verify.js`), with **no per-slice attribution**. A `sprint close <id>` gate checking "are this slice's FRs green" would pass as soon as *any* `verify-run` covers them, even built by a different slice — semantically hollow, and exactly the presence-gate theatre this repo warns against, especially since `verify-complete` *already* enforces every MUST FR before Phase 5. Real incremental per-slice verification needs per-slice test scoping in `verify-run` — genuine architecture, deferred until a project that has built the plan hits the wall of "verify SL-001 independently". So Layer 1's honest value is **planning + prioritisation + visibility + an approval checkpoint before build**, which is precisely the adopter's stated pain — not enforced incremental delivery. Authoring burden: one extra phase when opted in; skipped entirely by projects that don't run it (optional, additive, no migration). Cross-feature slice scope (a slice spanning the main pipeline and an `aitri feature` sub-pipeline) is also out of scope for Layer 1 — `verify-run` runs in one context; multi-context slices wait for evidence.

**Objections:** (1) *A plan nobody is mechanically forced to follow is honour-system / theatre.* — Partly true and bounded honestly: the **approval before Phase 4 IS a real gate** (build cannot start until the user approves the plan), and the approved plan enters Phase 4 as input the agent builds against; whole-project `verify-complete` still confirms every FR before Phase 5. What is *not* enforced is per-slice early verification — and that is named as deferred, not disguised as done. (2) *This is a large new surface justified by ONE external project.* — Correct, and the evidence bar is met for "a real project currently degraded" (the adopter hit it end-to-end), but the narrowness still bites: the artifact *shape* rests on one signal, so it ships decomposed (ADR/schema → persona/phase → read-only views → conditional gate) with the schema validated against that real project before the full machinery is trusted. (3) *Optional-phase-that-blocks breaks the `OPTIONAL_PHASES` "never blocks" semantics.* — It does not touch `OPTIONAL_PHASES`; the block is one explicit conditional check by phase number in `run-phase` (mirroring `verify-complete`→Phase 5, which is `if (phase===5 && !config.verifyPassed)` at `run-phase.js:51`), not a new phase category. (4) **Process note, recorded deliberately:** an earlier turn asserted — with false confidence — that User Stories lived in Markdown (`01_UX_SPEC.md`) and that US IDs and the US↔FR link needed to be built; reading `phase1.js`/`requirements.md`/`ARTIFACTS.md` showed they are already first-class in `01_REQUIREMENTS.json` with `requirement_id`→FR and a MUST-FR-without-US warning already shipped. The correction *shrank* this ADR's scope (no requirements-model change; `epics`/`slices` are the only new schema). Logged per the repo's "verify before asserting in design" discipline — the blind spot was caught by reading code, not by self-review.

**Adversarial revision (2026-06-26, independent subagent, file:line verified) — corrections folded in before construction:**
- **(a) US→FR resolution is NOT free, and only matters in Layer 2.** `user_stories[].requirement_id` is a single *optional* id (`phase1.js:247` filters falsy; `ARTIFACTS.md:43` shows a scalar, not array) — a US with no `requirement_id` is legal and only triggers the inverse MUST-FR-without-US warning, never US-without-FR. So `scope:[US]→FR→fr_coverage` breaks silently for any US lacking a FR. **Resolution: in Layer 1 `scope` is informational** (no mechanical gate consumes it — the plan is a visible/approval artifact); the FR-coverage connection is realised only in **Layer 2**, where the `sprint_plan` `complete` gate must either validate every scoped US resolves to a FR or accept FR ids directly. The earlier "connect without new traceability" framing was optimistic and is retracted for Layer 1.
- **(b) The Phase-4 block MUST exclude feature scope.** `feature.js:139-143` dispatches `cmdRunPhase`/`cmdComplete`/`cmdApprove` directly, so a guard added in `run-phase` is inherited by the feature sub-pipeline and would block a feature's own Phase 4 if it carried a `SPRINT_PLAN.json`. The guard is therefore conditioned on `!featureRoot` — cross-feature sprint planning is out of scope for Layer 1 (consistent with the cross-feature-scope deferral already stated). A single guard at the `run-phase` chokepoint (phase === 4) is sufficient and matches how Phase 5 is gated; `complete`/`approve` need no duplicate check, same as Phase 5 today.
- **(c) Re-approving an upstream phase must invalidate the plan.** `CASCADE_DOWNSTREAM['1']` (`state.js:521`) does not include `sprint_plan`, and `cascadeInvalidate` never touches off-spine artifacts, so re-approving Phase 1/2/3 would leave `SPRINT_PLAN.json#slices[].scope` with dangling US ids and no signal. **Resolution: add `sprint_plan` to `CASCADE_DOWNSTREAM['1']`, `['2']`, `['3']`** — a requirements/design/test change drops `sprint_plan` out of `approvedPhases`, forcing a re-plan. This is the mechanical backstop for the user's "a requirements change is a governed change-request" intent; the plan depends on the atoms, so it must re-derive when they move.
- **(d) Slice execution state has no home in Layer 1 — and needs none.** With Layer 2 deferred there is no mechanical slice lifecycle, so `slices[]` is static plan data living entirely in `SPRINT_PLAN.json`; **nothing about slices is written to `.aitri`** until Layer 2 introduces a real per-slice gate. This keeps the `state.js`-single-writer invariant untouched.
- **(e) Construction invariant — do NOT let `sprint_plan` enter Phase 4's `inputs`/`artifact` chain.** `upstreamProducers` derives blocking from `def.inputs`/`def.artifact` (`index.js`); if `sprint_plan`'s artifact were declared a Phase-4 input it would become an *unconditional* upstream producer → `sprint_plan` mandatory for every project. The block must stay the explicit existence-conditional guard in (b), never an inputs-chain edge. Internal maps that DO need a new entry (no behaviour change, just wiring): `TEMPLATE_BY_PHASE`, `CONTEXT_PHASES`/best-practices resolution, and `snapshot.js` next-action so `status`/`resume` surface the block.
- **Contract surfaces to update when each slice ships:** `docs/integrations/ARTIFACTS.md` (new `SPRINT_PLAN.json`), `SCHEMA.md` if any `.aitri` field is added (none in Layer 1 per (d)), `integrations/CHANGELOG.md`, and `templates/AGENTS.md` (new optional phase + command — copied verbatim into consumers).

**To be re-reviewed adversarially after the Layer-1 schema is drafted, and validated against the real external project before the full machinery is trusted.**

---

## ADR-062 — 2026-06-28 — `aitri export`: render the structured artifacts as human-readable Markdown (purpose-fulfilment plan, Tier-1)

**Status:** ACCEPTED — implemented (rc.130, `traceability` slice). Driven by the 4-agent "does Aitri fulfil its purpose?" review (`docs/Aitri_Design_Notes/_purpose-fulfilment-plan-0628.md`).

**Context:** One of Aitri's two first-class outputs is **"documentation across the whole product — product and QA read it without reading code."** The narrative artifacts (00_DISCOVERY, 01_UX_SPEC, 02_SYSTEM_DESIGN, 04_CODE_REVIEW) are Markdown, read directly. But the **structured** artifacts — `01_REQUIREMENTS.json` (PRD), `03_TEST_CASES.json` (test plan), `05_TRACEABILITY.json` (compliance) — are JSON. Their human-readable form was delegated to Hub (`docs/integrations/README.md` "Visual identity … owned by Hub"). Hub is being rebuilt, so **today there is no human-readable path for the structured artifacts from Core**: a PM/QA stares at raw JSON. The deferred `aitri export` (G-3, narrowed-the-claim 2026-06-28) was held until "a consumer needs the rendered form without Hub" — Hub being non-functional IS that need, now.

**Decision:** Add a **read-only** command `aitri export <traceability> [--format md] [--out <file>]` that renders existing artifacts to Markdown. It mutates nothing in the pipeline — it reads the artifacts and writes only the derived export (to stdout, or `--out`). First and highest-value surface: the **traceability matrix** (requirement × test cases × ✓pass/✗fail/⊘skip × coverage × compliance level), the single document a QA lead most needs and the least readable as JSON. The renderer joins `01_REQUIREMENTS.json` (spine) with `03_TEST_CASES.json`, `04_TEST_RESULTS.json#fr_coverage`, and `05_TRACEABILITY.json#requirement_compliance`, and **degrades gracefully** — it builds from whatever artifacts exist (a pre-Phase-5 project shows `—` for compliance). Zero-dep, stack-agnostic, purpose-written Markdown (the `{{KEY}}` `render.js` cannot iterate a table). `requirements`/`tests` renderers are the next slices of the same read→render pattern; feature-scoped export is a follow-up.

**Trade-off / what is sacrificed:** a new public command surface that must track the artifact shapes it reads (a maintained join). Mitigated by: read-only (no schema/gate, fully reversible), additive (no contract change — the export is derived, not part of the artifact chain), and graceful degradation (a missing/renamed field shows `—`, it does not crash). This is **not** Hub: it is a producer emitting a human-readable serialization of what it already produced — within the passive-producer line, not visualization. The boundary to hold: `export` stays read-only and never becomes a gate or a second source of truth.

**Objections recorded:** (1) *Overlaps Hub.* — Partly; Hub renders interactively/visually, `export` emits flat Markdown for offline/CI/no-Hub use. The overlap is acceptable because a first-class output must not depend on a separate, currently-non-functional product. (2) *render.js reuse was claimed, then found false.* — Correct; the G-3 analysis established `render.js` can't build a table, so this is net-new logic — accepted as the real cost of the gap. (3) *No logged PM/QA who hit raw JSON.* — The driver is logical-necessity (the claim names these artifacts as readable; they are JSON; Hub is down), not an imagined user.

---

## ADR-063 — 2026-06-30 — the UX/design spec must reach the builder AND become verifiable (AUDIT-0630)

**Status:** ACCEPTED — implemented (rc.137). Root-caused from the Ledger pilot by forensic trace through the real artifacts.

**Context:** A pilot UI passed **every** gate — 63/63 TCs, smoke, lint, type-check, `verify-complete`, `validate` — yet matched none of the client's approved mockups (a bare bordered table where the design called for semantic color, expand/collapse hierarchy, hover affordances, styled cards). The tempting read was either "the agent misinterpreted the requirements" or "Aitri can't judge visual fidelity (honor-system ceiling)". **Both are wrong.** Tracing the chain:
- The visual design WAS captured, in text, in `01_UX_SPEC.md` (line 6 "color semántico estricto: verde/rojo para semántica monetaria"; line 40 "expande/colapsa Grupo→Categoría→Subcategoría"; line 67 "hover → acciones ＋/✎/🗑").
- `FR-003` (type UX) carried only **structural** acceptance criteria (12 months, sticky column, no clipping at 1440px) — no fidelity criteria. The TRD (`02_SYSTEM_DESIGN.md`) did not carry the design either.
- **Phase 4 (Build) had no `optionalInputs`** — phases 2 and 3 both pull `01_UX_SPEC.md`, but Phase 4, which *writes the UI*, did not. So the build agent built faithfully from FR-003 + TRD + structural TCs; it **never received the design**. Not a misinterpretation — a missing input.
- Phase 3 (Tests) **did** receive the UX spec, but `tests.md` only required state / mobile / contrast TCs — never the declared-design behaviors. So no TC asserted "over-budget is red", and a structural-only suite passed over a UI that ignored the design. Not verifiable.

**Decision:** Close both halves mechanically, within the passive-producer / honor-system identity (Aitri still does not read pixels):
1. **Reach the builder.** Add `01_UX_SPEC.md` to `phase4.optionalInputs` and reinject it in `build.md` under `## UX / Design Spec — the approved visual contract`, with a hard instruction: implement the declared design (semantic color, named affordances, interactions); the structural TCs do NOT guarantee fidelity; open the referenced mockups — tokens alone are not the design.
2. **Make it verifiable.** Add a **Declared-design fidelity TCs** requirement to `tests.md`'s UX block: semantic appearance rules (assert the rendered element's actual styling/state under the triggering condition), declared affordances (present + functional), and key User-Flow interactions — `type: "e2e"`. A colorless / affordance-less build now FAILS `verify-run` instead of passing it.

**Trade-off / what is sacrificed:** the fidelity TCs are still authored by the agent (the harness can require their *category*, not guarantee their *quality*) — the truly-aesthetic last mile ("does it feel like the design") remains human review. What changed is the floor: the design now **reaches** the implementer and its **checkable** properties (color-as-meaning, affordance presence, interaction behavior) become e2e TCs the gate enforces. Both template blocks render only when a UX spec exists (a visual surface), so backend-only / no-UX-phase projects are unaffected (no stack bias leaked — principle 4).

**Objections recorded:** (1) *Still a nudge — the agent can write weak fidelity TCs.* — True; the category is required, the quality is not gateable without judgment Aitri lacks. But the prior state was strictly worse (design absent from build AND from verification); requiring the category turns a silent miss into a checked one. (2) *Why not also strengthen FR-003 acceptance criteria at Phase 1?* — Possible follow-up, but the UX spec is the design's home and now flows to both Tests and Build; forcing every UX FR to restate design in its ACs duplicates the spec. Deferred unless evidence shows the spec alone is insufficient. (3) *DOM-leaning phrasing in the fidelity TC requirement.* — Generalized to "computed style, applied class, or the platform's equivalent"; no worse than the neighboring block's existing "375px viewport" / "contrast ratio".

---

## ADR-064 — 2026-06-30 — Ratify `{ id, given, when, then }` as the canonical structured-AC shape (amends ADR-041's `{ id, text }`)

**Context:** ADR-041 (option A) introduced structured acceptance criteria as `{ id, text }`, the finer join key `03_TEST_CASES.json#test_cases[].ac_id` traces to and `04_TEST_RESULTS.json#ac_coverage` rolls up on. But the `requirements.md` template evolved to emit ACs as `{ id, given, when, then }` (the SPEC-SEALED BDD form, ADR-044) — so a three-way drift accumulated, surfaced by the connectivity audit (AUDIT-0630-E): the **template** emits `{ id, given, when, then }`, **ARTIFACTS.md** documented `{ id, description }`, and **`verify.js` `buildACCoverage`** read `ac.text || ac.description` to populate a criterion-text label. Because the template never emits `text`/`description`, that label always resolved to `''`. **Impact was nil** — every consumer joins purely on the `id`; the label was never carried in the `ac_coverage` entry nor printed in the untested-AC listing. So this is a contract-shape inconsistency with a vestigial code path, not a functional bug.

**Decision:** ratify `{ id, given, when, then }` as the canonical structured-AC shape (the template's SPEC-SEALED form is richer and already ships). Concretely: (a) `buildACCoverage` drops the vestigial `text`/`description` read — `acMeta` now carries only `{ fr_id }`, joining on `id`; (b) ARTIFACTS.md documents `{ id, given, when, then }` as canonical, with `{ id, text }` / `{ id, description }` still **accepted** (only the `id` is load-bearing for the join), so no existing project breaks; (c) `ac_coverage` entries remain `{ ac_id, fr_id, tests_*, status }` — no criterion text is carried, matching reality.

**Trade-off / what is sacrificed:** the option, once implied by ADR-041, of surfacing the criterion *text* in `ac_coverage` (the untested-AC listing names the `ac_id`, not its prose). This was never built and had no consumer; if a future consumer (e.g. Hub) wants the criterion text it should read it from `01_REQUIREMENTS.json#user_stories[].acceptance_criteria` by `id` (the SSoT) rather than have it duplicated into the results artifact. Additive/backward-compatible: `id`-based join is unchanged, legacy `{id,text}`/`{id,description}` still resolve.

**Objection recorded:** *Removing the `text` read narrows a documented capability.* — It removes a capability that never functioned (the label was always empty and never displayed); keeping dead code because a doc once implied it is the drift this audit exists to close. The join contract (`id`) is untouched.

---

## ADR-065 — 2026-07-01 — provided client definitions are authoritative; Aitri decides only for gaps (the _context intake contract)

**Status:** ACCEPTED — Phase-1 + UX implemented. Root-caused from the Ledger pilot after the rc.137/138 fixes did not stop the UI from diverging from the client's mockups.

**Context:** The purpose of `IDEA.md` and the `idea_context/` / `feature_context/` folders is: **when the client already has business definitions, Aitri takes that input as the requirements and BUILDS with it — it does not re-decide or re-invent what the client already closed.** Aitri's own generation (discovery, UX/design, archetype defaults) is for what is **absent or incomplete**, not to override provided decisions. The Ledger trace showed the implementation violated this, and in fact *inverted* it:
- The UX persona ran an "Archetype Detection (mandatory)… non-negotiable defaults" step and derived tokens from `archetype → visual FRs → inferred context` — the **provided mockups were not in the hierarchy at all** and the word "mockup" appeared nowhere in the persona/template. So given precise mockups, the persona *generated* a design from an archetype instead of transcribing the provided one.
- Phase 1 had "never invent (mark [ASSUMPTION])" but no complementary rule to **carry a precise provided decision faithfully** — so a stated "must" (the desktop capture side panel) was silently folded into inline capture and dropped from the FRs.
- `requirements.md` even read *"original_brief … historical only — never use it as an authority."* The pipeline treated **its own derived artifacts as the authority and the client's input as mere context to refine** — the exact opposite of the intent.

Aitri already had the *seed* of the right behavior — `idea_provenance` (`confirmed`/`assumed`) and the **Seed-Input Elicitation** ("if stated, use it; if vague, ask; if inferred, mark assumed") — but **scoped to only the five Tier-A inputs**, and the design layer had no equivalent.

**Decision:** Encode "provided definitions are authoritative, per the client's own maturity" as a principle at the **intake (Phase 1)**, and subordinate every generation framework to it:
1. **Maturity-aware, not threshold-based.** The persona *judges* each provided item's maturity (qualitative, no percentages) and acts: a **precise/closed** decision → transcribe it faithfully into an FR + acceptance_criteria (do not drop, fold away, water down, or replace it); a **partial/ambiguous** one → **ask the user to refine and align** before finalizing (mark `[ASSUMPTION]` only if unavailable); a **genuinely absent** need → derive it, marked `[ASSUMPTION]`. This is the existing Seed-Input Elicitation discipline **generalized from the five Tier-A fields to every definition the client provided** (`lib/personas/pm.js`, `templates/phases/requirements.md`).
2. **UX transcribes a provided design; the archetype is a fallback.** The archetype/heuristics apply only to what a provided design leaves unspecified; a provided design (mockups/prototype/spec) overrides archetype defaults and is the top authority for tokens (`lib/personas/ux.js`, `templates/phases/phaseUX.md`).
3. **Labeling is the existing markers, reused:** an `[ASSUMPTION]`-marked FR / an `assumed` provenance = Aitri-derived (refinable downstream); an unmarked FR carried from provided input = the client's decision (downstream builds it, does not re-open it). No new schema field — the `coverage_map` still makes a *dropped* provided decision visible after the fact, but the rule is to not drop it in the first place.

**Trade-off / what is sacrificed:** the "identify maturity" and "transcribe vs ask vs derive" split is **agent judgment (honor-system)** — the harness cannot mechanically prove the agent classified a firm decision correctly, nor force it to ask instead of guess. It can only (a) instruct the discipline, (b) bias toward asking when unsure, and (c) keep the `confirmed`/`assumed` + `coverage_map` record **visible at `approve`** so a misclassification is inspectable and catchable. This is the same passive-producer ceiling as the rest of Aitri: the drop is made **catchable, not impossible**. Prompt-only by design — no artifact-schema change, no new gate (a gate that "validates the agent used the input" would be theater).

**Objections recorded:** (1) *Prompt-only ⇒ honor-system ⇒ won't reliably work.* — True and stated in the trade-off; the alternative (a mechanical "did you honor the input" gate) is not buildable without judgment Aitri lacks, and the prior state was strictly worse (the prompt actively *inverted* the authority). Making the discipline explicit + the record inspectable is the achievable improvement. (2) *Why not a per-FR "provenance: client_firm|refined|generated" schema field?* — Deferred: the existing `[ASSUMPTION]` marker + `idea_provenance` + `coverage_map` already encode "client vs Aitri" without a contract change; add a field only if a real consumer (a downstream phase or Hub) needs to gate on it. (3) *This won't make the UI pixel-match the mockup.* — Correct; the residual pixel-reproduction ceiling is separate (ADR-063 trade-off). This ADR removes the *upstream* cause (re-invention of provided design), which is necessary but not sufficient for fidelity.

## ADR-066 — 2026-07-01 — the intake INJECTS readable context content; it no longer bets the agent will open a bare path

**Status:** ACCEPTED — implemented in `lib/commands/run-phase.js` (the CONTEXT-phase asset briefing). Root-caused from the Ledger pilot: ADR-065 hardened the *instruction* ("provided definitions are authoritative — transcribe them"), but the pilot still lost provided decisions. The user's own correction of the pilot surfaced why: **the agent self-admitted it never opened the mockups or the `.html` prototype** ("part of the code to use"). ADR-065 was toothless against this because the material it told the agent to honor was never in the prompt.

**Context:** The intake handed every `idea_context/` / `feature_context/` asset to the agent as a **bare path in a list** (`assets.map(f => path)`) — it never injected content. The only provided material that entered the prompt as content was `IDEA.md`. So "transcribe the provided spec faithfully" depended on the agent *choosing* to open each path — honor-system stacked on honor-system. The Ledger trace: the agent opened the `.md` spec (its tokens appear in the output verbatim) but silently skipped the 4 mockup PNGs and the 275 KB `.html` prototype, so their decisions never reached the FRs. Aitri's own code had **already documented this exact bet failing** — the `AUDIT-0630-B` block (`run-phase.js`) says "the Ledger pilot falsified it: a UI built from tokens, ignoring the designated mockups, passed every gate" — but the fix was scoped only to *images at the build phase*. The identical bet for the *textual spec at intake* was still live.

**Decision:** Fix the intake at the source — remove the agent's *ability* to silently skip what Aitri can read, instead of adding a gate that attests it didn't. In the grounding/design phases (`discovery`, `1`/requirements, `ux`):
1. **Inject the FULL content of readable text assets** (`.md/.txt/.json/.html/.css/.js/…`, `INJECTABLE_TEXT_RE`) inline in the briefing, the same way `IDEA.md` is injected. If the material is in the prompt, a skip is impossible. Bounded by a per-file cap (`MAX_INJECT_BYTES` 32 KB) and a per-briefing total cap (`MAX_TOTAL_INJECT_BYTES` 96 KB) so a many-file folder can't blow the context.
2. **What Aitri cannot inline** — images (no vision, zero-dep) and text over the cap (e.g. the 275 KB prototype) — is surfaced as a **loud "OPEN each one before writing — structural review does NOT verify you reflected them" pointer**, porting the `AUDIT-0630-B` fidelity language upstream from build to intake (not the whole block — only the instruction — to avoid duplicating the listing).
3. **Downstream phases (2, 3)** keep the lighter path listing they already had — they build on the *approved* artifacts, so raw context is reference, not primary input.

**Trade-off / what is sacrificed:** the residual is the honest zero-dep/no-vision ceiling: for **binary** assets (the mockups that were actually skipped in Ledger) injection is impossible, so the maximum is the loud instruction — whether the agent truly opens a PNG is still honor-system and unprovable by the harness. This ADR removes the skip for *text* (the majority case) and makes the skip for *binaries* loud instead of silent; it does **not** guarantee a mockup was read. A per-file-content gate ("prove every asset was reflected") was explicitly **rejected as theater** (the adversarial panel confirmed it: an agent that skipped a PNG would list it and mark it `reviewed_not_requirement` without opening it — going green on the same misjudgment, plus false-firing on `ADOPTION_AUDIT.md` and large reference-doc dumps). Context cost is real but bounded by the two caps.

**Objections recorded:** (1) *Injecting content doesn't touch the honor-system core — the agent still decides what to carry into FRs.* — True for the *judgment* of what becomes an FR (that is ADR-065's domain), but this ADR closes the prior, more basic failure: the agent could not carry what it never saw. Availability-by-path was the binding constraint in Ledger (the agent read the injected `.md`, skipped the un-injected assets); injection removes it for text. (2) *Why not also gate `complete 1` on asset accountability?* — Rejected as presence-theater (see trade-off); the existing `review.js phase1` source-capture advisory stays the honest, non-false-firing backstop. (3) *Binaries are still skippable.* — Correct and unclosable without vision; the loud pointer is the ceiling-respecting maximum, consistent with `AUDIT-0630-B`.

## ADR-067 — 2026-07-02 — context-reference relevance is not decided by file extension (the intake-gap conformance sweep)

**Status:** ACCEPTED — implemented in `lib/commands/run-phase.js` (F1) + `lib/phases/context.js` (F2), rc.145. Produced by a conformance sweep of the ADR-066 "intake gap" class across every phase + every gate (9 parallel tracers, each tracing a concrete fixture through `cmdRunPhase` and diffing the ACTUAL briefing against what the prompt/persona claims it needs — the method the earlier audits got wrong by reasoning abstractly). Normative reference: `docs/Aitri_Design_Notes/_flow-invariants-2026-07-02.md` (local-only).

**Context:** The sweep confirmed the exemplar class (ADR-066/065) is **closed** across discovery/1/ux, and the verification spine + isTTY gates are mechanically sound. It surfaced two residuals:
- **F1 (real, narrow):** the build phase's design-reference block (`AUDIT-0630-B`) surfaced context assets to the builder as "open these" pointers **filtered by a fixed extension whitelist** (`visualAssets` = png/jpg/…/pdf/fig/…, plus `.html`). A readable `.md`/`.txt` design doc in `idea_context/` matched nothing, so it reached the builder in **no form** — not injected, not pointed at, no notice. This is the intake-gap class re-manifested one hop past where rc.137/AUDIT-0630-B closed it: a design/spec reference can arrive in ANY form, and an extension whitelist always leaves a gap for the form it didn't enumerate.
- **F2 (parity/hygiene):** `extractRequirements`/`extractRequirementsForCompliance` forwarded `priority` on the FR arm but not the NFR arm.

**Decision:**
1. **At build, list EVERY context asset as a pointer — form-agnostic (F1).** The relevance of a client-provided reference is not decided by its file extension. Because the build block is **pointer-only** (it lists paths, never injects content), there is zero staleness cost to listing all forms — the anti-staleness reason build excludes *raw context* (content) does not apply to a path. Kept: the `01_UX_SPEC.md` gate (backend-only builds retain the deliberate "no context at build" default — broadening to non-UI builds was scoped out as ADR-066-adjacent speculation, not a verified trace), pointer-not-inject, and the `ADOPTION_AUDIT.md` exclusion (its own framed block). This is the honest ceiling for un-injectable material (ADR-066) applied consistently regardless of form.
2. **Forward `nfr.priority` for parity (F2).** Additive; `undefined`/omitted in the canonical case. Explicitly recorded as a **symmetry cleanup, not a live-gap fix** — the canonical NFR MUST signal is `category:"Regression"` (already forwarded), so F2 only carries signal for an author who hand-sets `priority:"MUST"` off-canonical. Coverage was never at risk (the phase-3 gate re-reads priority from disk).

**Trade-off / what is sacrificed:** F1 lists potentially-superseded reference files at build (mitigated by the "ignore anything the approved spec superseded" framing and by `idea_context/` being the curated authoritative set); the honest residual is unchanged from ADR-066 — whether the agent opens a listed binary is still honor-system. F2's value is marginal by design (near no-op on canonical schema); it is justified only as removing an unprincipled FR-vs-NFR asymmetry, and the changelog says so rather than overselling it.

**Objections recorded:** (1) *F1 should also fire for backend builds (a schema/API spec is reference too).* — Deferred: that is ADR-066-adjacent, not the verified F1 trace, and reversing the "no raw context at build" default broadly needs its own decision; the UX-spec gate stays. (2) *F2 fixes nothing on the canonical path.* — Correct and recorded; kept as cheap additive parity, not sold as a gap fix. (3) *A per-extension list was fine — just add `.md`.* — Rejected: that reproduces the same failure mode (the next un-enumerated form falls through); the principle is that a pointer list has no reason to filter by form at all. **F3** (Phase-1 re-run framing "no upstream artifact is approved yet") was investigated and **found to be accurate** (Phase 1 has no approved upstream pipeline artifact) — no change.

## ADR-068 — 2026-07-03 — a *killed* test runner is "did not finish", not a failing suite; per-project `test_runner_timeout_ms`

**Status:** ACCEPTED — implemented in `lib/commands/verify.js` (`cmdVerifyRun`) + `lib/phases/phase4.js` (validation), rc.146.

**Context:** `verify-run` gave the test-runner spawn a hardcoded 5-min timeout (Playwright 10-min) and spawnSync's default 1 MiB capture buffer, but only special-cased a **missing binary** (ENOENT) as "the runner did not run — do not mutate state". Two other kill paths fell straight through and persisted a degraded result: (a) a **timeout** kill, and (b) a **capture-buffer overflow** — a verbose runner (`pytest -v`, `node --test`, `vitest --reporter verbose`) exceeds 1 MiB routinely, at which point Node kills the child (ENOBUFS) and **truncates** stdout. In both, the partial/truncated output was parsed as if the run finished: TC markers past the cut vanished → those TCs went `skipped` → `verifyPassed` flipped false. A **phantom regression** on a healthy suite — verifiable from the code (the `ENOENT`-only guard vs the fall-through), independent of whether a canary had tripped it. This is the exact failure class the ENOENT guard already existed to prevent, left open on its siblings.

**Decision:**
1. **Generalize the runner kill guard to `result.signal || result.error`** (the same shape `runQualityGates` already uses), replacing the initial `ETIMEDOUT`-only cut. One signal-based check covers timeout, buffer overflow, OOM, and any future kill cause; a **clean non-zero exit** (real test failures) sets neither `signal` nor `error` and is still persisted as a genuine failure — the guard never swallows real red. Applied identically to the main runner and the auto-detected Playwright run; both refuse without writing `04_TEST_RESULTS.json` or touching `verifyPassed`.
2. **Raise the capture buffer to 64 MiB** (`RUNNER_MAX_BUFFER`) so a heavy-but-healthy suite is not killed for output volume in the first place; the kill guard is the backstop.
3. **Add optional `04_BUILD_REPORT.json#test_runner_timeout_ms`** (positive number, default `900000` = 15 min), replacing the two hardcoded constants with one project-overridable knob shared by the main runner and Playwright.

**Why configurable + generous default rather than agent-chosen or dynamic:** a timeout is a **hang-catcher, not a speed target**, and the failure is **asymmetric** — too-low kills a healthy slow suite (a confusing phantom regression), too-high only delays killing a genuinely hung process (mildly slower, self-evident). So robustness must not depend on the agent picking a good number. A **generous default** is what the agent obtains by doing nothing; the override exists only for the genuine 20-min suite and only meaningfully goes *up* (there is no incentive to lowball a ceiling — the concern raised was agent stinginess, and this neutralizes it: omit → safe default). An **automatic/dynamic** timeout was rejected — distinguishing "hung" from "merely slow" is not decidable in general, and Aitri keeps no per-project runtime baseline to derive one without adding state; any auto-heuristic is a guess that either kills slow-but-fine suites or lets hung ones run too long.

**Impact:** Medium (verification spine control-flow + additive artifact field). **Value to produced software:** 8 — removes a class of spurious `verifyPassed:false` on real projects (large .NET/integration suites, verbose runners), directly preventing a false "your code regressed" on code that is fine. **Severity:** Moderate — the phantom regression blocks `verify-complete` on a healthy build until the operator diagnoses it.

**Trade-off / what is sacrificed:** one knob is shared by the main runner and the e2e run (a project that sets it low to catch a *unit* hang fast also tightens the *e2e* budget) — accepted over a second field with no consumer asking for it (the generous default makes the low-setting case rare); adding an e2e-specific timeout waits for a real trigger. The 64 MiB buffer costs memory only on a runner that genuinely emits that much.

**Objections recorded:** (1) *Guard only `ETIMEDOUT` — the timeout was the reported problem.* — **Rejected by the standing adversarial-over-the-diff pass**, which caught it as a ship-blocker: the ENOBUFS/buffer kill is the more common trigger and was left wide open, and raising the default timeout would have *increased* exposure to it (longer runs → more output). Generalized to the signal-based check before shipping — the fix must cover the defect *class*, not the one instance named. (2) *Just make the default a bigger fixed number, skip the field.* — The field is cheap and the genuine 20-min-suite case is real; the field is the escape hatch, not the line of defense (that is the default + non-mutating kill handling). (3) *Trust the agent to set the number.* — Rejected: agent stinginess would lowball it; the design deliberately makes the safe value the do-nothing default. Not built without a verified defect — but the defect here is code-verifiable (the fall-through), so it cleared the internal bar without waiting on an external validator.

---

## ADR-069 — 2026-07-03 — the results file is trusted only when mechanically bound to a run (UPLAN-0703 Phase B, B1–B3)

**Status:** ACCEPTED — implemented in `lib/commands/verify.js` (`cmdVerifyComplete`), `lib/commands/tc.js` (`cmdTCVerify` + guided loop), `lib/state.js` (`verifyResultsBinding`), `lib/snapshot.js` (`computeHealth`), `lib/commands/validate.js`, `lib/commands/status.js`, `lib/phases/phase5.js`, rc.148. Work item `UPLAN-0703`.

**Context:** the UPLAN-0703 audit (2026-07-03) found five one-step bypasses of the verification gate. Three are closable mechanically with zero new dependencies, and all three were re-verified first-hand against the code at planning and implementation time:
1. **Fabricated results, no stamp.** `cmdVerifyComplete`'s run-binding was `if (config.verifyResultsHash && hash !== stamp)` — an **absent** stamp passed by design (a `// backward-compatible` comment). Cheapest bypass: hand-write an internally-consistent green `04_TEST_RESULTS.json`, never run a test, `verify-complete` passes. A test pinned the bypass as intended.
2. **Hash-laundering via `tc verify`.** `cmdTCVerify` (and the guided loop) load the results file, apply one entry, then re-stamp `verifyResultsHash` over the **whole** file — never checking the loaded file matched the existing stamp. Edit every `fail`→`pass`, run one legitimate `tc verify`, whole file re-blessed.
3. **Sticky `verifyPassed`.** `validate` hardcoded `drift:false` for the results file, `computeHealth` trusted the boolean, and `04_TEST_RESULTS.json` is not in `artifactHashes` so `hasDrift` never covered it. After one honest pass, the results file could be rewritten and every read surface (status, validate, Hub, Phase 5) stayed green.

These convert "recorded not asserted" from slogan to mechanism. The remaining two bypasses (stdout markers, direct `.aitri` edit) are the honest identity ceiling — documented, not "fixed".

**Decision:**
1. **B1 — `verify-complete` requires the stamp (breaking-ish).** An absent `verifyResultsHash` now blocks with actionable guidance ("no verify-run recorded — run `aitri verify-run`"), and a present-but-mismatched stamp blocks as before. The rc.129–rc.147 backward-compat window is closed in the rc channel; a pre-rc.129 project re-binds by running `verify-run` (or `verify-run --results <file>`) once. Marked `— breaking` in `docs/integrations/CHANGELOG.md`.
2. **B2 — `tc verify` holds the same line as verify-complete: stamp required AND matching.** A stamp-less results file is refused ("no verify-run recorded — run verify-run first"), and a file edited since its stamp is refused — only a bound, unmodified file may receive a new entry and be re-stamped. Applied to both the scriptable path and the guided loop. The stamp-required half was NOT in the original design — the adversarial pass proved the mismatch-only guard left B1 defeatable in one command (see Objections) — and it is safe because `verify-run` has seeded AND stamped the all-manual project since rc.129, so no sanctioned stamp-less file exists on rc.129+.
3. **B3 — one SSoT binding helper, re-checked on every read surface.** `lib/state.js#verifyResultsBinding(dir, config)` returns `'bound' | 'mismatch' | 'no-stamp' | 'missing-file'`; `snapshot` computes it once as `verify.resultsBinding`; `computeHealth.deployable` blocks on `mismatch`/`missing-file` (new reasons `results_tampered`/`results_missing`); `validate` text/`--json` and `status --json` report the real state instead of hardcoded `drift:false`; `phase5.validate` refuses to build a compliance proof over a `mismatch`. Additive to the JSON contracts (new optional `resultsBinding` field + new reason types). This also repairs the "single snapshot SSoT" claim — `validate` had carried its own divergent hardcoded logic.

**Honest ceiling (stated, not overclaimed):** these bind the results file to a *recorded* run; they do NOT make the gate unforgeable. An agent that rewrites BOTH the results file and `.aitri#verifyResultsHash` (both writable) still passes. The value is raising the forgery cost from a trivial/accidental pass to a deliberate edit of a state field the agent is never instructed to touch — defense-in-depth on the already-accepted rc.129 run-binding, not a new guarantee.

**Impact:** Medium (verification-spine gate behavior + additive schema on two JSON contracts). **Value to produced software:** 8 — closes the cheapest paths to a false "verified" on real projects; the deploy gate the whole harness rests on stops trusting a hand-writable file on its own. **Severity:** Moderate — B1 is a one-time re-run for pre-rc.129 projects; the rest is additive.

**Trade-off / what is sacrificed:** B1 blocks a legitimately stamp-less mid-pipeline project once (one `verify-run` re-execution against the same file re-binds it — no CI re-trigger needed). The `no-stamp` state is deliberately NOT a health block (only `mismatch`/`missing-file` are) — B1 owns the stamp-presence gate at `verify-complete`; making health retroactively non-deployable on every pre-rc.129 project would be a second, redundant break. The B9 parser extraction is deferred (optional, not needed to land B1–B3).

**Objections recorded:** (1) *Is B1–B3 theater, since `.aitri` is writable?* — No: it is defense-in-depth on a mechanism the codebase already shipped (rc.129), closing its backward-compat hole; the CHANGELOG/ADR language is held to "raises forgery cost", never "prevents". (2) *Does B1 break legitimate externally-produced results files?* — No: `verify-run --results <file>` binds an external TRX/JUnit file, and `verify-run` seeds + stamps the all-manual project; a truly stamp-less file re-binds in one command. (3) **Adversarial-over-the-diff pass — run before ship, found a SHIP-BLOCKER in the first cut plus three follow-ups, all fixed in the same release:** (a) the first cut's B2 only guarded *mismatch*, skipping the check when no stamp existed ("first writer" rationale) — false on rc.129+, and it let `tc verify` stamp a hand-fabricated green results file, defeating B1's headline scenario in one extra command → B2 now requires the stamp too; (b) `verify-complete`'s own stub-known-gap rewrite re-stamped in memory but persisted only at function end — any gate `err()` in between exited with the disk file rewritten and the stamp stale, leaving the project falsely "tampered" on every surface and locked out of `tc verify` → the stamp is now persisted (`saveConfig`) at the rewrite; (c) B3 gated only the root — a terminal feature (5/5, verify passed) with a rewritten results file stayed invisible → new `feature_results_tampered` deploy reason (same "done but broken" class as `feature_verify_failed`; `no-stamp` stays non-blocking); (d) `hashResultsFile` only trimmed EOF whitespace, so a per-line trim-trailing-whitespace format hook read as "tampered" — now stripped per line (hash-stable for JSON.stringify output; a re-indent remains a documented mismatch, recovered by one `verify-run`). The pass also confirmed: all sanctioned writers stamp; `verifyResultsHash` lives in the shared committed `.aitri` (not `.aitri.local`), so the team git handoff keeps the binding; `no-stamp` correctly excluded from the health block so pre-rc.129 projects are not double-broken.

---

## ADR-070 — 2026-07-03 — state integrity: unknown is never clean, corrupt is never reset, de-blocking carries evidence (UPLAN-0703 Phase B, B4–B8)

**Status:** ACCEPTED — implemented in `lib/commands/reconcile.js`, `lib/state.js` (`loadConfig`), `lib/snapshot.js` (`computeHealth` + next-actions), `lib/commands/bug.js` (+ gate wiring in `verify.js`/`reconcile.js`/`validate.js`), rc.149. Work item `UPLAN-0703`.

**Context:** the UPLAN-0703 audit found a recurring defect CLASS across the state layer: **failure paths that degrade to a reassuring answer.** Five verified instances, each re-checked first-hand at implementation time:
1. **B4** — `reconcile`'s git-path failure fell through to the mtime comparator with a git SHA as the "timestamp": `new Date(sha)` = NaN → `{files: []}` → "✅ No code changes detected" + `status:'resolved'`. A false CLEAN exactly when the tool knows least. And `reconcile --resolve` gated on `config.verifyPassed` as "mechanical proof that the spec's tests still pass" — but nothing cleared that flag when reconcile detected drift, so a verify that PREDATED every drifted commit satisfied the gate.
2. **B5** — `loadConfig`'s merge was `{...DEFAULTS, ...raw, ...local}`: `.aitri.local` won on ANY key, so a shared key that ever landed there (hand edit, old CLI, restored backup) silently shadowed committed team state — and the next `saveConfig` PROMOTED the local value into the committed file. The write side partitioned strictly; the read side undermined it.
3. **B6** — a malformed (non-conflict) `.aitri` warned, backed up, and returned DEFAULTS; the next state-mutating command then SAVED that DEFAULTS-derived object, wiping approvals/hashes/drift baseline. G-4 (rc.128) had closed exactly this for the merge-conflict subcase only.
4. **B7** — `computeHealth` never consulted artifact existence: delete an approved artifact and `status`/`resume`/`status --json` stayed approved/no-drift/deployable while `validate` said MISSING — two surfaces contradicting on the same disk state.
5. **B8** — `bug fix` unconditionally set `fixed` (a fixed bug stops blocking the deploy gate) with no evidence; `bug verify` verified never-fixed bugs after an ℹ note; a malformed `BUGS.json` loaded as `{bugs:[]}` — every blocking bug vanished from every gate, and a subsequent `bug add` would OVERWRITE the corrupt file; severities outside the allowlist (`P0`, `blocker`) were silently non-blocking.

**Decision (one principle, five applications):** *an unknown state is reported as unknown, a corrupt record is refused not replaced, and a transition that unblocks a gate carries evidence.*
1. **B4** — an unreachable baseline refuses with `--init` recovery (`--init` may now replace an UNREACHABLE baseline; a reachable one stays clobber-protected). Entering `pending` with detected files clears `verifyPassed` (+ new `reconcile-pending` event, `verifyPassedCleared` marker) so the resolve gate genuinely requires a fresh verify. Rejected alternative: comparing `verifyRanAt` vs newest commit timestamp — commit timestamps are forgeable/rebase-shifted; clearing matches the cascade philosophy.
2. **B5** — read-side partition: only `LOCAL_FIELDS` merge from `.aitri.local`; ignored shared keys are warned by name.
3. **B6** — every `.aitri` parse failure refuses with git-restore guidance (backup still written); the read-only snapshot keeps the tolerated, `parseError`-flagged path for FEATURE configs (it never writes); corrupt `.aitri.local` stays lenient (per-machine, re-establishable).
4. **B7** — `computeHealth` blocks deploy with `artifact_missing` when an approved core phase's artifact is absent; a priority-2 next-action surfaces it. `phaseStatus`'s `approved` label is deliberately unchanged — approval is a state fact, existence is a disk fact; reporting both is the fix, conflating them is not.
5. **B8** — `bug fix` on a BLOCKING bug requires `--resolution` or `--tc`; `bug verify` requires `fixed`; malformed `BUGS.json` refuses all bug commands and all bug-reading gates (`verify-complete`, `reconcile --resolve`, `validate --ci`); unknown severity/status warn once per file (behavior unchanged — still non-blocking — but no longer silent).

**Impact:** Medium (failure-path behavior across the state layer; two CLI-contract semantics). **Value to produced software:** 7 — every item converts a silent false-green/false-clean into a loud refusal or an evidence requirement; the deploy decision stops resting on reassuring defaults. **Severity:** Moderate — each old path could ship unverified or wipe recorded state.

**Trade-off / what is sacrificed:** friction on legitimate edge flows — a rewritten-history repo needs one `reconcile --init`; scripted `bug fix` on blocking bugs needs a flag; a corrupt `.aitri` blocks all commands until restored (previously "worked" on a wrong base). Display-only bug surfaces refuse rather than degrade (chosen over partial rendering: `bug list` showing "no bugs" over a file that has them is the same lie the gates told). The snapshot's B7 check gates the ROOT only (feature artifact existence is visible per-feature but does not block root deploy — features already gate root only in their terminal states).

**Objections recorded:** (1) *B4's verifyPassed-clear forces a re-verify after any detected drift.* — That is the point; the resolve gate's claim ("tests still pass") was hollow without it. It fires on the pending TRANSITION only (adversarial fix, below). (2) *B6 breaks the "status works on a broken project" resilience.* — Root: yes, deliberately (G-4 posture, rc.128 precedent — an unknowable project state must not render as a fresh pipeline); feature aggregation keeps the tolerated path. (3) *B8's evidence requirement is honor-system text.* — Partially: `--resolution` is a recorded attestation (audit trail, not proof), but `--tc` is mechanical (auto-verifies only when the test passes in a real run). The requirement raises the cost of a bare de-block, leaves a reviewable record either way, and covers BOTH de-blocking transitions (`fix` and `close` — below).

**Adversarial-over-the-diff pass — run before ship; found a SHIP-BLOCKER in the first cut plus four follow-ups, all fixed in the same release:** (a) the first cut's `malformed` marker was an IN-BAND string key — `promptAndRegisterBugs` (verify-run's interactive auto-registration, an unguarded sibling writer of BUGS.json) would save it into the file, both destroying the recorded bugs AND permanently poisoning the now-valid JSON so every gate false-refused forever → the marker is now an out-of-band Symbol (JSON.stringify can never serialize it; a legitimate top-level `"malformed"` key can never false-trip the guard) and `promptAndRegisterBugs` refuses to write over a malformed file; (b) the verifyPassed-clear fired on EVERY detection run, not on the pending transition — re-running `aitri reconcile` (the only way to re-print the briefing) destroyed a verify that POSTDATED the unchanged drift and spammed the 20-capped shared event log → transition-only clear + single event; (c) the B6 refusal leaked as a raw Node stack trace (the bin dispatcher had guidance branches for the other two refusal classes only) → branch added; (d) `validate --ci` asserted bug-file readability for the ROOT only while `aggregateBugs` reads every pipeline — a corrupt FEATURE `BUGS.json` still silently emptied the gate → all pipelines checked; (e) bare `bug close` de-blocked a blocking bug with zero evidence (the direct bypass around the new fix gate) → `close` on a blocking bug requires `--resolution`.

---

## ADR-071 — 2026-07-04 — Phase 4 is plan-first with human checkpoints — briefing-level only, NOT ADR-061 resurrected (UPLAN-0703 C8)

**Status:** ACCEPTED — implemented in `templates/phases/build.md` ({{#IF_PLAN_FIRST}} protocol + split instructions), `lib/personas/developer.js` (per-cluster roadmap), `lib/phases/phase4.js` (PLAN_FIRST flag + FR_SNAPSHOT trim), `templates/AGENTS.md`, rc.151. Work item `UPLAN-0703`.

**Context:** Phase 4 was a monolith — one briefing = implement every FR, with the only long-horizon guidance being a whole-project three-layer roadmap. Two observed consequences: **no mid-build correction point for the human** (operator evidence from real Aitri projects, 2026-07-03: "aitri construye todo de una y entrega un todo terminado … no se puede ver cómo avanza para poder hacer correcciones; al final entrega algo quizá lleno de sorpresas" — the Ledger failure mode restated: feedback arrives when correction is most expensive), and **no session continuity** on large codebases (Umbraco, documented — the agent re-enters the longest phase with no execution structure).

**History guard — why this is NOT ADR-061 (WITHDRAWN) resurrected:** ADR-061 proposed a *phase* + `SPRINT_PLAN.json` + a conditional gate, and was killed because a plan-only artifact had no mechanical consumer (ceremony) and per-slice verify is structurally blocked (`fr_coverage` is whole-project — that wall stands, untouched). This item's consumers are different and REAL: **the agent itself across sessions** (BUILD_PLAN.md is the execution state the briefing does not carry) and **the human during the build** (progress checkpoints) — both served by briefing instructions with ZERO Aitri machinery. No phase, no schema, no gate, no `.aitri` fields, and explicitly NO per-cluster verify. ADR-061's own text says "re-open only via a NEW ADR"; this record exists so no future session relitigates the distinction.

**Decision (briefing-level only):**
1. Fresh build → **Plan-First Build Protocol**: write `BUILD_PLAN.md` (working file in the artifacts dir — FR clusters, order, rationale, per-cluster status; documented in integrations/ARTIFACTS.md as the AUDIT_REPORT.md class), **present the plan to the user before any code** (advisory checkpoint, no gate), implement cluster by cluster with the skeleton→persistence→hardening roadmap applied PER CLUSTER (persona + template rewritten together — the C3 rule), **checkpoint at each cluster boundary** (human present → pause and present progress + incorporate corrections; autonomous/CI → record in BUILD_PLAN.md and continue — an unconditional pause instruction stalls or gets ignored, teaching the agent the protocol is ignorable), resume-by-reading-BUILD_PLAN.md-first.
2. **Correction routing with the honest cost stated:** implementation-level → apply + note; spec-changing → route through the pipeline, briefing states the cascade cost (re-opening Phase 1 wipes ux/2/3/4/5 approvals), and after ANY upstream re-open the agent re-runs `run-phase 4` — never resumes from the stale briefing + old plan (a Phase-3 re-run changes the TC set; stale cluster/TC keys diverge silently).
3. **Debug re-entry renders NEITHER the protocol nor the plan instructions** (a debug-instructions variant renders instead) — "minimal fix, do NOT rewrite working code" and "re-plan first" must never render together.
4. **The one honest dedup:** FR_SNAPSHOT drops its acceptance_criteria echo (kept id/priority/type/title — the AC text was duplicated in the Requirements block below). The originally-claimed "TC_LOCK double-injection (~40% cut)" was a **misdiagnosis caught by the design's adversarial review**: TC_LOCK carries the entire verify-run test-naming contract — deleting it breaks test detection in every consumer project. Untouched.

**Impact:** Medium (briefing/persona behavior; one new documented off-pipeline file). **Value to produced software:** 8 — converts the phase where consumer software is actually written from an opaque batch into reviewable increments; the human corrects at cluster N instead of discovering the surprise at the end. **Severity:** Moderate — the defect it fixes is process-shaped (late feedback), observed on real projects.

**Trade-off / honest ceiling:** the pause-per-cluster is honor-system — Aitri cannot force an agent to stop mid-phase, and the cascade-cost asymmetry creates an incentive to silently absorb spec changes. **Escalation trigger (recorded, not built):** if a real project shows checkpoints systematically skipped or spec changes silently absorbed mid-build, AND that correlates with end-of-build surprises → a NEW ADR re-opens the ADR-061 Layer-1 discussion (a real checkpoint mechanism; Phase G/MCP is where a structured pause could become a typed response). Not before.

## ADR-072 — 2026-07-04 — `aitri challenge` REJECTED: the adversarial method ships as briefing blocks, not a command (UPLAN-0703 Phase E)

**Status:** ACCEPTED (rejection of the planned structural form) — implemented as template/persona edits in `templates/phases/architecture.md` (new adversarial-pass block), `templates/phases/tests.md` (edge-case sweep upgraded to the rc.132 method standard), `lib/personas/reviewer.js` (false independence claim fixed), rc.155. Work item `UPLAN-0703`.

**Context:** Phase E of UPLAN-0703 proposed `aitri challenge <phase>` — a new command emitting a refutation briefing (new `challenger` meta-persona), writing `CHALLENGE_REPORT.md`, surfaced at `approve`. The design doc itself mandated a decision matrix + full adversarial panel before implementation. The panel ran 2026-07-04 (kill seat, GO seat, bar judge — three independent passes, all load-bearing claims verified against the code by the maintainer's agent before ruling).

**Decision: do NOT build the command, the persona, the artifact, or the state fields.** The panel's decisive findings:
1. **The delta-problem is unestablished.** The proven kernel — an independent adversarial pass catches what green tests miss — already ships as the rc.132 inline block in `build.md` (§"Optional — adversarial pass"), and NO evidence exists that the instruction form is insufficient (never observed followed-and-failed, never observed skipped-because-not-a-command). Building the harness first and collecting the evidence after (the design's own exit criterion) inverts the repo's evidence-before-build rule.
2. **Phases 1 and 3 are already occupied by stronger mechanisms.** Phase 1: `audit requirements` + `coverage_map` diff IS a harnessed challenge (independent re-derivation, report artifact, content-hash freshness as of rc.154, approve-side surfacing as of rc.154) — a generic "refute" briefing would be a weaker sibling standing next to it. Phase 3: the inline edge-case sweep + the ADR-053 mutation gate. The one genuinely novel target was `build` — exactly where the rc.132 block already lives.
3. **The approve-surfacing leg risks being net-negative.** In the dominant single-session flow the artifact author writes the challenge report; a surfaced "challenge found no defects" is machine-laundered reassurance injected at the exact point rc.153 just made honest (approve = real review). GO conceded this risk unprompted.
4. **Review-phase overlap at the build target is material.** `reviewer.js` already carries the destructive mandate ("assume the worst — the burden of proof is on the implementation"); `phaseReview.md` already instructs mockup-fidelity refutation (rc.137/138). "Review is constructive, challenge is destructive" did not survive contact with the code.

**What shipped instead (the verified residue, ~2% of the cost):**
- `architecture.md` gains the adversarial-pass block with Phase-2 attack vectors (the FR with no home in any component, the unstated assumption, the UX/context contradiction, the unanswered NFR promise, the invented constraint). This was the one real gap: 176 lines, zero independent-pass instruction.
- `tests.md`'s sweep upgraded to the method standard: refute-what-exists mandate (invented expected values, happy-path-only MUSTs, stub-passable scenarios) + verify-the-adversary's-claims + blast-radius rule. Location and optionality unchanged.
- `requirements.md` deliberately receives NO block — `audit requirements` + coverage_map is Phase 1's challenge mechanism; a generic block at 270 lines would duplicate a stronger tool (recorded here so a future "why not?" reads as decision, not omission).
- `reviewer.js` no longer claims "You were NOT involved in writing the code" (false in the dominant flow) — replaced with the honest conditional: seek real independence (fresh session/subagent); if you authored the code, disclose it in the review's first line so the human knows they are reading the weaker signal.

**Re-open bar for the command form (ALL THREE, concrete and checkable):** (1) the inline block was present in the briefing the agent actually received (project's Aitri version ≥ rc.155), AND (2) a named defect shipped past approve/verify that refutation of the completed artifact would plausibly have caught (named artifact, named attack vector), AND (3) the failure traces to the missing harness (pass skipped-with-no-trace or run-but-unrecorded), not to the method failing — which a command would not fix either. **Independent second trigger:** a real consumer (Hub, an adopter) asks to READ a challenge verdict — that supplies the missing consumer for the output contract and freshness state on its own.

**GO objections recorded (per the decision-log rule — if this rejection later fails, these are the signals that were visible):**
1. *Unobservable compliance is self-sealing:* inline blocks leave no trace of whether the pass runs, so the re-open evidence may never accumulate even under systematic skipping. (Bar's response: manufacturing state to observe compliance is the presence-theater pattern the warning signs reject; most of the honor-system core shares this ceiling.)
2. *Rails left unconsumed:* rc.153/154 built approve-side surfacing + content-hash freshness; the challenge verdict was their natural next consumer.
3. *Symmetric speculation:* the "laundered reassurance" harm is itself unevidenced — the ruling rests on burden-of-proof (the builder carries it), not proof of harm.
4. *Timing cost:* attack-vector templates written now, with the Ledger evidence fresh, would beat ones written later on demand. (Mitigated: the per-phase blocks encode those vectors in the templates anyway.)

**Impact:** Low (template text + one persona). **Value to produced software:** 6 — extends the practice with the best in-repo catch record to the two phases whose defects are most expensive downstream, in the only form whose insufficiency has not been demonstrated; capped by unobservable compliance. **Severity:** Low — advisory text; failure mode = instruction ignored = status quo. **Trade-off:** no output contract, no freshness, no approve surfacing; whether consumers run the pass is invisible. Accepted: that is the identity ceiling (zero-dep, passive, honor-system), not a defect of this form.

## ADR-073 — 2026-07-09 — the UX phase emits an advisory visual preview (`UX_PREVIEW.html`) — a working file that renders the spec, never extends it (FB-UX-MOCKUP-0708)

**Status:** ACCEPTED — implemented as template/persona edits (`templates/phases/phaseUX.md` advisory-output block + Delivery Summary + Human Review lines, `lib/personas/ux.js` one norm constraint), documented in integrations/ARTIFACTS.md as the BUILD_PLAN.md class, rc.169. Work item `FB-UX-MOCKUP-0708`.

**Context:** owner feedback — the stakeholder never SEES the design until Phase 4 build: `phaseUX.md` consumed client-provided mockups but never instructed emitting anything visual, and the Delivery Summary prints hex codes a human cannot evaluate as a look ("un color hexadecimal no dice nada" — owner feedback, verbatim). Correcting look & feel at build is the expensive moment; at the UX approve gate it costs a feedback sentence. An independent adversarial pass ran before implementation and reshaped the design.

**Decision: advisory instruction in the UX briefing — the agent generates ONE self-contained `UX_PREVIEW.html` (a "visual manual of the spec") next to `01_UX_SPEC.md`.** Key rulings:
1. **Tokens-first, renders-not-extends (adversarial finding, accepted).** A components-in-5-states preview is unsatisfiable: rendering components forces micro-decisions the spec does not contain, so the preview would EXTEND the spec — the stakeholder approves the preview, the developer builds the spec, and the mismatch detonates at exactly the Phase-4 moment the feature exists to protect. The preview renders only what the spec contains: swatches with role+hex+reason, type scale at size, spacing/radii, computed contrast badges (makes the accessibility checklist line verifiable at a glance), light/dark panels side-by-side each fixing its own palette. Shape validated against the owner's reference example (T-Ledger palette proposal).
2. **One in-context strip permitted, banner-bound (owner evidence over the adversary's strict fallback).** At most one small composition strip under a visible `ILLUSTRATIVE — non-binding; the spec is the contract` banner — the owner's reference uses exactly this form.
3. **Single skip: no graphical surface (owner call, reversing the adversary's skip-when-provided).** CLI/TUI/library/service skip with a stated reason. Provided-design projects still generate it — as a **transcription read-back**: "this is what I understood; compare against your mockups" turns the element-for-element fidelity checklist line from markdown-vs-images into a visual diff.
4. **Explicit staleness rule (adversarial finding, accepted):** on feedback re-runs the briefing mandates regenerating the preview from the updated spec. Hand-edits outside the pipeline can still stale it — deliberate honor-system ceiling, mitigated by a provenance footer; **non-goal: no freshness state in `.aitri`** (re-open trigger: a real consumer reports stale-preview confusion).
5. **No structural surface:** no chain artifact, no gate (`validate()` untouched), not hashed, no `.aitri` change; un-numbered filename per the off-pipeline convention. Stack-agnostic guard: HTML is only the rendering medium — it does not imply the product is a web app.

**Impact:** Low (template text + one persona line + docs). **Value to produced software:** 7 — moves look-&-feel correction from the most expensive point (built code) to the cheapest (spec approval), and makes two approve-gate checklist lines (accessibility level, provided-design fidelity) verifiable at a glance instead of assumed. **Severity:** Low — advisory; failure mode = instruction ignored = status quo. **Trade-off:** staleness is invisible outside the pipeline loop; whether the agent generates it well is honor-system (the identity ceiling, as ADR-072 records). Protection = the rendered-briefing template pin (guardrails must stay in the briefing), not runtime validation.

## ADR-074 — 2026-07-10 — BUILD_PLAN.md groups user stories into epics with verifiable boundaries — template-level, no new machinery (PLAN-EPIC-0708)

**Status:** ACCEPTED — implemented as template/persona edits (`templates/phases/build.md` Plan-First Build Protocol rewritten, `lib/personas/developer.js` vocabulary, `templates/AGENTS.md` Phase-4 bullet), pinned in `test/rendered-briefing.test.js`, rc.170. Work item `PLAN-EPIC-0708`.

**Context:** external feedback — the generated BUILD_PLAN.md "reads as filler" and names its grouping unit differently every run ("capa"/"item"/"punto"). Root-caused in the template: no output skeleton; the template's own vocabulary collided (grouping unit "cluster", inner steps "layer roadmap", persona "all three layers" — a Spanish-speaking agent renders "layer" as "capa"); user stories never appeared in the plan. During review (2026-07-10) the owner defined the plan's value: **verifiable partial deliveries — act on real results early instead of discovering at the end what should have been adjusted** — and the proportionality principle (a small increment needs no plan ceremony; a large build does).

**Decision — three template-level rulings, ADR-071 preserved (working file, no gate, no schema):**
1. **The epic groups USER STORIES; everything else is a derived reference.** Grouping axis = US (owner call 2026-07-10; the draft's "group the FRs" was the wrong axis). Fixed skeleton per epic with stable field names: `Delivers:` (US ids — the deliverable), `FRs:` (each US's `requirement_id`), `Makes pass:` (those FRs' TCs), `Build steps: skeleton → persistence/integrations → hardening`, status, `Why here:`. FR/TC listed by id only — the plan never restates artifact content (duplicated detail drifts). NFRs are never a grouping axis (they hang off no US), but their TCs are scheduled like any other — the plan is complete only when every TC in the Test Authorship Lock lands in exactly one epic's `Makes pass` (US-less FRs' and NFRs' TCs get an explicit home; the pure US-derivation chain would strand them until the end — adversarial finding, fixed pre-ship). Writing the epic's TCs' test code is part of the epic. "cluster"/"layer roadmap" eliminated ("Build steps" replaces the layer vocabulary).
2. **An epic is `done` only when its `Makes pass` TCs run green** (project's declared runner), and the boundary checkpoint presents the TEST RUN OUTPUT — a verifiable partial delivery, not a narrative summary. This delivers the owner-defined value at template level: `Makes pass` becomes the epic's acceptance criterion instead of decoration. Honor-system by design — Aitri does not run or verify it mid-phase.
3. **The epic count comes from the product, not the protocol.** A small increment is ONE epic → a six-line plan and zero intermediate boundaries (no arbitrary size threshold; ceremony degrades naturally with real structure). Explicit anti-ceremony guard: do not manufacture granularity.

**Explicitly rejected (recorded so a future "why not?" reads as decision):**
- **`epic` field in `01_REQUIREMENTS.json`** — a Hub-contract schema bet with zero consumers; requirements stay FR→US→AC (ARTIFACTS.md pins "flat structure — no epics").
- **Per-epic mechanical verification (`verify --scope epic` gating boundaries)** — ADR-061 territory (withdrawn). Tombstoned with a concrete trigger: a real large multi-session build (e.g. the Umbraco migration's Phase 4) demonstrating that instructed evidence at boundaries is insufficient → re-open with a new ADR. The owner's value definition (2026-07-10) is a strong signal but not yet a real build demanding the machinery.
- **Making BUILD_PLAN.md validated/tracked/Hub-visible** — reverses ADR-071; "reads as filler" establishes a legibility defect, not a defect a gate would prevent.

**Impact:** Low (template text + persona wording). **Value to produced software:** 6 — the operator's most-watched mid-build surface becomes legible and evidence-bearing; corrections move from the most expensive point (after the full build) to per-epic boundaries. Capped by the honor-system ceiling. **Severity:** Low — advisory; instruction ignored = status quo. **Trade-off:** `done` remains a claim Aitri never verifies mid-phase (a lying status is caught only at final verify); accepted as the identity ceiling (ADR-072's reasoning). Protection = the rendered-briefing pins, not runtime validation.

## ADR-075 — 2026-07-11 — Phase 2 requires a per-MUST-FR `## Implementation Approach` section — the gate tightening that stops Phase 4 from guessing the method (RSRCH-ADOPT-0711 W1)

**Status:** ACCEPTED — implemented as `templates/phases/architecture.md` (new required section 5: Method / I-O contract / Failure behavior per MUST FR; section list renumbered to 10; Traceability + Human Review checklists extended) + `lib/phases/phase2.js` `validate()` required-array entry, pinned in `test/phases/phase2.test.js` and `test/rendered-briefing.test.js`, rc.172. Work item `RSRCH-ADOPT-0711` (W1).

**Context:** deep-research benchmark (2026-07-10/11, 3-vote-verified claims). The strongest empirical result on code-generation prompt quality: a test-driven derivation across 4 LLMs and 3 benchmarks (arXiv 2601.13118) found the changes that turn always-failing generated code into test-passing code are all specification details — **Algorithmic Details (57% of optimized prompts), I/O format (44%), exceptions** — and role/persona is not among the 10 that mattered. Aitri's design gate required FR *coverage* ("addressed by at least one component") and component-level failure behavior (Failure Blast Radius), but never the per-FR *how*: Phase 4 receives the full design and guesses the method — the exact failure mode the study measured. Decision matrix: Impact Medium · Value to produced software 8 · Severity-if-fails Low · Trade-off: one more authored section per design, boilerplate risk.

**Decision:** `## Implementation Approach` becomes a required section of `02_SYSTEM_DESIGN.md` (5th in the list of 10, between API Design and Security Design), mechanically enforced by `complete 2`. Per MUST FR: **Method** (named algorithm/technique — "standard logic" is vague), **I/O contract** (inputs → outputs, concrete formats), **Failure behavior** (invalid input / unavailable dependency / partial result). Two guardrails in the template: an anti-over-specification stop ("direction, not pseudo-code" — spec-as-source's "you wrote the program twice" is the documented anti-pattern), and an explicit-skip escape hatch for pure-CRUD FRs ("self-evident from Data Model") so trivial FRs cost one line, never a silent omission.

**Consequence accepted (named so upgraders don't read it as a regression):** `adopt --upgrade`'s TPA-6 gate re-check dry-runs current validators against approved artifacts — existing projects that upgrade will see their approved design flagged "would be REJECTED — missing ## Implementation Approach". Advisory: approvals unchanged; the printed fix is `run-phase 2 → edit → complete → approve`. This is TPA-6's designed behavior for gate evolution.

**Impact:** Medium (template + validator + contract doc). **Value to produced software:** 8 — forces the top measured code-gen quality lever at the artifact that feeds implementation. **Severity:** Low — worst case is authoring effort. **Trade-off:** boilerplate risk (mitigated by the escape hatch + Human Review spot-check line); one more section for every design, including small ones.

## ADR-076 — 2026-07-11 — zero-dep RE-LITIGATED and KEPT; Anthropic-Skills export evaluated and DEFERRED (RSRCH-ADOPT-0711 Q1/Q2)

**Status:** ACCEPTED — owner decisions 2026-07-11, no code. Work item `RSRCH-ADOPT-0711` (Q1/Q2).

**Context:** the owner's standing lean was to remove the zero-dependency invariant ("quitemos eso de una vez", 2026-07-11); both parties agreed to let two deep-research runs be the evidence. Both runs — explicitly instructed to ignore the constraint and think bigger — produced **zero** dependencies whose verified value beats the cost: prompt-regression evals need no dep (scenario-diff over rendered briefings, shipped as `rendered-briefing.test.js` pins); LLM-as-judge tooling is measured invalid (largest study to date: 21 judges, ~541k judgments — reliable yet systematically wrong, rank shifts up to 14 positions across benchmarks); a retrieval/memory layer under-delivers without RL-trained curation (MemAct); Python-ecosystem QA tools (mutmut, Hypothesis, pytest) are already reachable via orchestrate-don't-bundle (child_process + exit code).

**Decision (Q1):** zero-dep **stays an invariant, unchanged**. Owner chose keep with the evidence in hand. Re-litigation path unchanged: a concrete dependency with verified tier-1 value → its own ADR, case by case. Dissent recorded at the time of the original removal lean (identity/security differentiator + the forcing function behind stack-agnosticism) turned out to be moot — nothing needed the removal.

**Decision (Q2):** emitting phase briefings in the Anthropic Skills progressive-disclosure format (optional export, `.claude/skills/…/SKILL.md`) is **DEFERRED with trigger**. For: ~20% absolute accuracy gain with a relevant skill; metadata-only startup cost; can bundle executable helpers (the clean vehicle for Python-side helpers without a Python runtime in the harness). Against: Claude-ecosystem standard → direct tension with the model-agnostic invariant; 40% activation rate when optional (vs 98% forced); and decisive — **no consumer demand** (the owner, walked through it twice, recognized no felt need; per the feedback-protocol warning sign, an artifact nobody asked to read is not built for completeness). **Re-open trigger:** the Skills standard goes cross-vendor (Gemini/Codex adopt it) OR a real Aitri consumer asks. Do not build before then.

**Impact:** none (decision record). **Value:** prevents re-litigating both questions from scratch; the next "should Aitri take a dep / speak Skills" starts from this evidence. **Trade-off:** none today; the Skills deferral forgoes a measured accuracy gain until the trigger fires — accepted to protect model-agnosticism.

## ADR-078 — 2026-07-13 — Promote 2.0.0-rc.174 to 2.0.0 stable

**Status:** Active — executed by the maintainer 2026-07-13 (explicit instruction, after two earlier aborts on 2026-07-11/12).

**Context.** The promotion gate — do NOT promote a breaking major on author-owned canaries alone; at least one third-party adopter validating end-to-end — is met by DSB-AT-POC (Inchcape, .NET + React, GitHub Copilot CLI): round 1 at the rc.34/36 era (ADR-040) and round 2 on rc.64 (8→20 features, deployable, strong end-to-end result), each producing fix batches recorded in the changelog. Before cutting: rc.172–174's new blocking gates were adversarially verified by three independent passes (both SHIP-SOUND; the two silent-pass residuals found were closed in rc.174), and the stray `aitri init` scaffolding that leaked into rc.173 was removed with a recurrence pin (REPO-HYGIENE-0712).

**Objection recorded (the log exists for this).** The gate's folded residual — "promotion wants diverse third-party adopters, not only web" (see the REG-study closure note) — remains OPEN: the only third-party validation is one web stack, and the rc.65–174 delta (including two breaking ADRs 069/070 and the rc.172–174 content gates) has zero third-party exposure. Weighed and accepted: no adopter is in the pipeline, so waiting is indefinite — the over-caution defect, not rigor; the unexposed gates' failure mode is bounded (over-rejection → visible friction → patch), not silent corruption; and the gate's letter, as written and committed, is satisfied. The residual transfers forward: it is the first thing a post-stable adopter report should close.

**Decision.** Bump rc.174 → 2.0.0 (version string + five contract-doc headers only; zero code change), fast-forward merge `feat/upgrade-protocol` into `main`, tag `v2.0.0`, delete the feature branch. npm-registry publishing is a separate maintainer decision, not bundled here.

**Trade-off.** Stable status lands on gates with no external soak; accepted per the objection analysis above. Reversal path if a false-reject epidemic appears: loosen the specific gate in a patch release — gate loosening is reader-compatible.

## ADR-077 — 2026-07-11 — Phase 1 gains a proportional US/AC floor — every MUST FR needs a story, every MUST-linked story needs an acceptance criterion (REQ-RICHNESS-0711)

**Status:** ACCEPTED — implemented as `lib/phases/phase1.js` validate() (A1: MUST-FR-without-story hardened from a warning to a throw; A2: MUST-linked-story-without-AC), `templates/phases/requirements.md` (Depth Protocol states the gate + thin-story→thin-test rationale; Rules mark A1/A2 enforced), `lib/personas/pm.js` REASONING (decompose-deep heuristic), rich `validP1()` + canonical fixtures. Pinned in `test/phases/phase1.test.js` (A1/A2 reject + accept + MUST-only exemption + plain-string presence) and `test/rendered-briefing.test.js`. rc.173. Work item `REQ-RICHNESS-0711`.

**Context:** owner-verified from real use — `01_REQUIREMENTS.json` comes out thin (shallow FRs, weak user stories, thin ACs, few downstream TCs). Root-cause investigation (claims checked against code): the `complete 1` gate enforces only *structure*; *depth* is measured by nothing. Over-determined by (1) floors are the de-facto ceiling — nothing mechanical pulls upward; (2) US/AC depth was fully un-gated — **`user_stories: []` passed** (`![]` is false), MUST-FR-without-US was a warning only, no US-must-have-AC rule; (3) the canonical `validP1()` fixture modeled the floor (3 MUST FRs, one US, that US with zero ACs); (4) the ~6.2k-token briefing front-loaded "don't invent" and buried "decompose fully" at ~63% depth. Phase-3's few TCs are a pure downstream symptom (TC floor = 3 × #MUST FRs; nothing multiplies it by AC/US). Decision matrix: Impact Medium · Value to produced software 8 (front-of-pipeline seed richness, tier-1) · Severity Low · Trade-off: authoring effort on MUST FRs + one more upgrade flag.

**Honest ceiling (recorded so the fix is not overstated):** Aitri cannot mechanically measure "rich enough vs the seed" — the only oracle for what the seed implies is the same model that wrote the thin artifact (coverage_map and `audit requirements` share that blind spot). So the fix gates *structure/presence*, never *sufficiency*; the rest is nudge (prompt prominence, persona heuristic, richer reference fixture). This is why the owner chose "nudge + proportional floor," not a max-mechanical ratio gate.

**Decision — the proportional US/AC floor (MUST-only):**
- **A1:** every MUST FR must have ≥1 linked user story (`requirement_id` === FR.id). The prior non-blocking warning is hardened to a `throw`. SHOULD/NICE FRs are exempt — proportional, no filler stories on nice-to-haves; feature scope obeys the same rule (a feature's MUST FRs are still core behaviors). A MUST behavior with no story is under-decomposed; its Phase-3 tests derive from the story's acceptance criteria.
- **A2:** every user story linked to a MUST FR must carry ≥1 acceptance_criterion. Closes the empty-story hole. **Presence is gated, not FORM** — a plain string, `{id,text}`, or `{id,given,when,then}` all satisfy it; the Given/When/Then shape is pushed by the briefing + persona, never gated (form-gating would reject a legitimate one-line metric AC and tip into presence-theater). Runs AFTER the FR-level content checks (metric/vagueness/title/duplicate-AC) so a malformed FR surfaces its specific error first.
- **Why this is not the presence-theater ADR-061 was withdrawn for** (the CLAUDE.md warning line): a MUST FR with no story, and a story with no AC, produces a thin/underspecified Phase-3 test — it prevents a *real downstream defect*, not merely validates a field's presence.

**Prior art respected:** REQ-RICHNESS-0624 thread — coverage_map (ADR-060, deliberately light, not enforcement), `audit requirements` (ADR-059, advisory), no_go_zone gate (rc.119). C4 anti-anchoring shipped the "floors not targets" prose AND **explicitly deferred a gate-side sizing mechanism "until a real project hits the floor honestly"** — owner use is that trigger. ADR-061 (per-unit mechanical) WITHDRAWN as theater — the new floor stays *presence*, not *sufficiency*, to not repeat it.

**Consequence accepted (named so upgraders don't read it as a regression):** `adopt --upgrade`'s TPA-6 gate re-check will flag existing approved requirements with a MUST FR lacking a story or a story lacking an AC as "would be REJECTED". Advisory — approvals unchanged; fix is `run-phase 1 → enrich → complete → approve`. Same class as ADR-075's W1 gate.

**Impact:** Medium (validator + template + persona + fixtures). **Value to produced software:** 8 — the seed of the whole pipeline gets a mechanical depth floor + a stronger nudge; thin requirements no longer pass silently. **Severity:** Low. **Trade-off:** the floor cannot force *sufficiency* (honest ceiling); authoring effort rises on MUST FRs (proportional, not filler); one more upgrade-time advisory flag.

### Addendum 1 — 2026-07-12 — Two silent-pass residuals closed (rc.174)

A post-ship adversarial review of rc.173 found two residuals inside this ADR's own promise, both the same silent-pass class the gate shipped to close. Fixed at the root in rc.174, shared definitions in `lib/phases/phase1-checks.js`:

1. **`priority` was never validated.** Every MUST-gate consumer filters exact-match (`=== 'MUST'`): phase-1 type/metric/vagueness/US-AC checks, the phase-3 TC floor, the phase-5 compliance proof. A miscased `"must"` or a priority-less FR silently exempted the requirement from all of them while looking prioritized. Now: FR `priority` must be exactly `MUST`/`SHOULD`/`NICE` (`PRIORITIES`); NFR priority stays optional (Regression-by-category unchanged) but canonical when present. The gate immediately caught real drift — the template's completion summary and a smoke fixture used MoSCoW's `COULD`.
2. **A2 (and the FR-level AC check) gated array *length*, not *content*.** `[""]`, `[{}]`, `[null]` satisfied "presence" while carrying nothing a Phase-3 test could assert. Now: ≥1 entry with actual content in any accepted form incl. the legacy `{id,text}`/`{id,description}` (`hasContentfulAC`); form stays ungated — the ADR-061 line holds. `normalizeAC()` was deliberately not reused (`String({})` → `"object object"` would false-pass).

Two adjacent closures in the same pass: the assumptions filter crashed with a raw TypeError on an object-form FR-level AC (pre-existing, now read via `acContent`), and the legacy `{id,description}` AC form — still contract-accepted (ARTIFACTS.md "Structured AC ids") — was initially missed by `acContent` and would have been falsely rejected (caught by both the implementer's self-check and the independent adversarial verification, converging on the same defect). Migration note recorded in both changelogs: MoSCoW's `COULD` now hard-blocks — rename to `NICE`. Same TPA-6 consequence as the base decision: `adopt --upgrade` flags pre-rc.174 artifacts advisorily. Pins: `phase1.test.js` +9, `rendered-briefing.test.js` +1. Suite 2140.
