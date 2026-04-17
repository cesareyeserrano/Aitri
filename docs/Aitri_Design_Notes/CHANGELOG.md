# Aitri — Changelog

> Published version history. Format: [version] — date — what shipped.
> Version scheme: `0.1.x` (npm canonical). Previous entries used `2.0.x` — those entries are preserved below for history.

---

## [0.1.79] — 2026-04-17

- **feat:** `.aitri` now persists `verifyRanAt` (set by every `aitri verify-run`) and `auditLastAt` (set by `aitri audit`). Both ISO 8601 strings. Additive — old projects without these fields keep working.
- **feat:** `health.staleVerify` in the snapshot now lists pipelines whose `verifyRanAt` is older than 14 days — previously reserved-but-empty (Fase 1 gap from v0.1.77).
- **feat:** `tests.stalenessDays` now returns an integer for the root pipeline (was always `null`).
- **fix:** `audit.lastAt` and `audit.stalenessDays` prefer the persisted `auditLastAt` over file mtime — eliminates false "stale audit" signals after a fresh `git clone` (mtime resets to clone time). Mtime fallback retained for legacy projects.
- **chore:** Removed undocumented `verifyTimestamp` field set by `verify-complete` — never read by any consumer; superseded by `verifyRanAt`.
- **chore:** Backlog cleanup — discarded "Aitri CI", "Aitri IDE", "Aitri Report", and ecosystem-level "Aitri Audit" (decisions recorded in BACKLOG.md `Discarded` table). IDEA.md/ADOPTION_SCAN.md → `spec/` relocation kept as the only remaining v0.2.0 breaking change.

---

## [0.1.78] — 2026-04-17

- **fix:** Interactive prompts broken on Node 24+. Node 24 leaves TTY stdin in non-blocking mode; `fs.readSync(0, ...)` throws `EAGAIN` instead of blocking, making every interactive confirmation unreachable (approve checklist, drift re-approval, complete warnings, verify-complete known gaps, bug registration on failed tests, wizard discovery interview, run-phase re-run, `adopt apply` / `adopt --from N` confirmation).
- **fix:** New module `lib/read-stdin.js` — `readStdinSync(maxBytes)` wraps `fs.readSync` with an `EAGAIN` retry loop using `Atomics.wait` on a `SharedArrayBuffer` for synchronous sleep (zero-dep; zero CPU spin). All 7 commands that prompted interactively migrated to the helper.
- **fix:** `adopt apply` / `adopt --from N` now accept `y` or `yes` (previously only `y`) and consume the full line — removes a latent bug where typing `yes` left `es\n` in stdin and contaminated the next read.
- **refactor:** Eight near-duplicated inline stdin readers collapsed into one helper — reduces surface area for the same class of bug in the future.

---

## [0.1.77] — 2026-04-17

- **refactor:** Introduced `lib/snapshot.js` — `buildProjectSnapshot()` is now the single source of truth for `status`, `resume`, and `validate`. Aggregates root pipeline + `features/<name>/.aitri` sub-pipelines, derives health signals, produces priority-ordered next actions. Pure function with injectable `now`. See ADR-022 in DECISIONS.md.
- **fix:** `status`/`resume`/`validate` no longer diverge on their "next action" recommendation. Previously `status` suggested `aitri validate` when phase 4 was approved without checking `verifyPassed`, while `resume` correctly gated on it. All three commands now project from `snapshot.nextActions[]` (priority ladder documented in `docs/integrations/STATUS_JSON.md`).
- **feat:** `aitri resume` — new `## Features` section per feature sub-pipeline (progress, verify, drift, per-feature next action), new `## Health` section when project is not deployable, Next Action now shows up to 5 priority-ordered commands.
- **feat:** `aitri validate --explain` — enumerates deploy-gate reasons inline (passing or blocking).
- **feat:** `aitri validate --json` — additive `deployable`, `deployableReasons[]`, `openBugs`, `blockingBugs` fields. Legacy shape unchanged.
- **feat:** `aitri status --json` — additive `snapshotVersion`, `features[]`, `bugs`, `backlog`, `audit`, `health`, `nextActions[]`. Legacy fields preserved for Hub compatibility.
- **feat:** Bare `aitri` (no subcommand) now runs `aitri status` when invoked inside an Aitri project; otherwise falls back to help.
- **docs:** New integration surface documented at `docs/integrations/STATUS_JSON.md`. Changelog entry + README row added to `docs/integrations/`.

---

## [0.1.69] — 2026-03-26

- **feat:** Named phase aliases — `1→requirements`, `2→architecture`, `3→tests`, `4→build`, `5→deploy`. Numbers still accepted (backward compatible). `PHASE_ALIASES` exported from `lib/phases/index.js`.
- **feat:** All commands (run-phase, complete, approve, reject) resolve aliases before numeric parse.
- **feat:** `aitri status` uses alias in key column and Run:/Next: suggestions.
- **feat:** `approve.js` pipeline instructions use aliases.
- **feat:** `templates/phases/` renamed to match aliases (e.g. `phase1.md` → `requirements.md`).
- **feat:** Phase display names updated: "PM Analysis" → "Requirements", "QA Test Design" → "Test Cases".
- **fix:** `validate.js` drift note shows `aitri approve tests` instead of `aitri approve 3` (2026-03-30).
- **fix:** `status.js` re-approval history shows alias instead of phase number (2026-03-30).

---

## [0.1.68] — 2026-03-25

- **feat(phase1):** Requirement Depth Protocol — 6 systematic probing questions. AC depth rules per FR type (security/persistence/logic/reporting require ≥2 ACs). Warns (non-blocking) when MUST FR has no linked user story.
- **feat(context.js):** `extractRequirementsForCompliance()` — minimal FR/NFR extract for phase 5 (token reduction).
- **refactor:** Phase 2, 4, 5 inject `extractRequirements()` instead of raw JSON.

---

## [0.1.67] — 2026-03-22

- **feat(bug):** Redesign as first-class QA artifact. New schema: `steps_to_reproduce[]`, `expected_result`, `actual_result`, `environment`, `detected_by`, `evidence`, `reported_by`.
- **feat(bug):** Lifecycle simplified: `open → fixed → verified → closed` (`in_progress` removed).
- **feat(bug):** `getBlockingBugs` now severity-based (critical/high) — was MUST FR-linked.
- **feat(verify-run):** Prompts `[y/N]` on test failure to register bug; auto-populates from Playwright evidence (`test-results/`).
- **feat(resume):** Open Bugs section with severity sort.

---

## [0.1.66] — 2026-03-21

- **feat:** `aitri review` — cross-artifact semantic consistency checks. `complete 3` and `complete 5` auto-run review; errors block, warnings prompt y/N.
- **feat:** `aitri bug` — formal bug lifecycle with FR traceability. `verify-complete` blocks on open MUST FR bugs. `validate` warns on fixed bugs without TC reference.
- **feat:** `adopt verify-spec` — brownfield TC stub generator. `--complete` registers stubs and updates phase 3 hash baseline.
- **feat(phase4):** TDD recommendation block — `buildTDDRecommendation()` heuristic injected as `{{TDD_RECOMMENDATION}}` in phase 4 briefing.
- **fix(approve):** Atomically updates `artifactHashes` + emits `afterDrift:true` event on drift-recovery approval.

---

## [0.1.65] — 2026-03-20

- **feat:** `aitri backlog` — project-level backlog management. Storage: `spec/BACKLOG.json`.
- **feat:** `aitri backlog add --title --priority --problem [--fr]`, `aitri backlog list [--all]`, `aitri backlog done <id>`.
- **feat:** `aitri status` shows open backlog count when `BACKLOG.json` exists.

---

## [0.1.64] — 2026-03-20

- **feat:** Ecosystem integration model — Aitri is now a passive producer. Subproducts (Hub, Graph) are autonomous consumers.
- **refactor:** `init.js` and `adopt.js` no longer write to `~/.aitri-hub/projects.json`. Hub manages its own registry.
- **docs:** `docs/integrations/` — canonical contract: `README.md`, `SCHEMA.md`, `ARTIFACTS.md`, `CHANGELOG.md`.

---

## [0.1.63] — 2026-03-19

- **fix:** `complete.js` updates `artifactHashes` after successful validation — prevents `hasDrift()` false positive on subsequent `approve`. Before: completing an artifact left the hash stale, causing the drift gate to fire even on legitimate human-authorized changes.

---

## [0.1.62] — 2026-03-19

- **feat(run-phase):** Gate blocks agents from re-running core phases when all 5 are approved. Non-TTY: error + redirect to `aitri feature init`. isTTY: confirmation prompt. Gate skipped inside feature sub-pipelines.

---

## [0.1.61] — 2026-03-18

- **feat:** `templates/AGENTS.md` — pipeline guardrails for any agent (Claude, Codex, Gemini). Created by `init`, `adopt apply`, `adopt --upgrade`.

---

## [0.1.60] — 2026-03-18

- **feat(approve):** Drift re-approval gate — non-TTY blocks agent re-approval when artifact has drifted; isTTY prompts confirmation before checklist. Event marked `afterDrift: true`.
- **feat(status):** Shows re-approved-after-drift warning from `events[]`.
- **feat(resume):** Dedicated section when phases were re-approved after drift.
- **refactor(state):** `hasDrift()` exported from `state.js` (was duplicated in validate/status).

---

## [0.1.59] — 2026-03-17

### Features — Pipeline quality (from AITRI-GRAPH real-project audit)
- **feat(verify.js):** `cmdVerifyRun` auto-detects `playwright.config.js` / `playwright.config.ts` — runs Playwright E2E automatically without `--e2e` flag. `--e2e` kept as no-op for backward compat. Failure logged as `status: fail` in notes — no silent skip.
- **feat(verify.js):** `cmdVerifyComplete` E2E gate — if Phase 3 has TCs with `type: "e2e"` and none have `status: "pass"`, blocks with list of affected TCs. Prevents approving a phase with all E2E tests skipped.
- **feat(templates/phase1.md):** IDEA.md pre-flight evaluation block — 5 criteria evaluated before writing `01_REQUIREMENTS.json`. 2+ fails → block with list of failing criteria + `aitri wizard` instruction. 1 fail → proceed with `idea_gaps` in `project_summary`.
- **feat(templates/phase1.md):** Operational NFR categories — PM must cover or explicitly declare not applicable: Observability (request logging), CI/CD (pipeline runs test_runner + Playwright), API security (input whitelist), Healthcheck (`GET /health`). Silently omitting a category is invalid.
- **feat(templates/phase3.md):** Security multi-vector rule — each NFR with `type: security` requires ≥3 distinct attack vectors (e.g. traversal + absolute path + encoding). Organized by control type with Bad/Good examples. 2 new Human Review checklist items.
- **feat(templates/phase3.md):** Test portability rule — fixtures must use relative paths, `process.cwd()`, `path.join(__dirname, ...)`, or `os.tmpdir()`. Absolute paths with machine-specific user dirs are invalid.
- **feat(templates/phase3.md):** Behavior vs implementation rule — tests verify observable behavior, not source code text. Explicit Bad/Good examples. `manual verification required` as valid alternative for hard-to-observe behaviors.
- **feat(templates/phase4.md):** CI/CD deliverable — when `01_REQUIREMENTS.json` has a CI/CD NFR, `implementation_files` must include the workflow file path with the full test command. No hardcoded absolute paths in test fixtures.
- **feat(templates/phase5.md):** CI/CD verification — checks workflow file exists, trigger fires on push/PR to main, installs deps, runs `test_runner` from manifest, includes Playwright if `playwright.config.js` exists. Gaps reported as compliance entries with level `"partial"`.
- **feat(resume.js):** Version mismatch detection — reads `aitriVersion` from `.aitri`, compares to current VERSION. Prepends "⚠ Version Update Required" section with `aitri adopt --upgrade` instruction when mismatch or field missing. Next Action shows `adopt --upgrade` as step 1.
- **feat(resume.js):** Bug fix — phase completed but not yet approved now correctly shows `aitri approve N` as Next Action (was: `aitri run-phase N`).
- **feat(status.js):** Version mismatch warning updated to recommend `aitri adopt --upgrade` (was: `aitri init`). Added `aitri resume` as complementary suggestion.
- **feat(README.md):** "Resuming a Project" section — documents the `aitri resume` → detect version → `adopt --upgrade` → clean resume flow.
- **feat(.github/workflows/ci.yml):** CI for Aitri repo — runs `npm run test:all` on Node 20/22/24 on push and PR to main.

### Tests
- **test(resume):** Fixed assertion — phase completed but not approved → Next Action is `aitri approve 3`, not `aitri run-phase 3`.
- **test(init):** Fixed 2 assertions — version mismatch suggestion updated from `aitri init` to `aitri adopt --upgrade`.
- **Total: 505/505 passing (unchanged count — existing tests fixed, no new tests added)**

---

## [0.1.58] — 2026-03-16

### Features
- **feat(state.js):** `setDriftPhase(config, phase)` / `clearDriftPhase(config, phase)` — helpers for managing stored drift state in `.aitri`.
- **feat(run-phase):** sets `driftPhases[phase]` in `.aitri` when re-running an already-approved phase; clears on fresh first runs.
- **feat(complete, approve):** clear `driftPhases[phase]` on completion and approval — artifact hash is re-anchored.
- **feat(status):** `hasDrift()` fast-paths to `true` if phase is in stored `driftPhases[]`, then always falls through to dynamic hash check (catches direct file modifications outside of `run-phase`). Hub can now read `.aitri` directly to detect drift without shelling out to `aitri status --json`.
- **docs(HUB_INTEGRATION.md):** `driftPhases[]` field added to schema. Updated `hasDrift()` contract with two-path logic.

### Tests
- **test(status):** 1 new test — stored `driftPhases[]` path (field present in `.aitri`).
- **Total: 505/505 passing (was 504)**

---

## [0.1.57] — 2026-03-16

### Features
- **feat(verify.js):** `parsePytestOutput()` — pytest -v output parser. Detects `TC_XXX` (underscore, Python function naming) and `TC-XXX` (hyphen) in pytest PASSED/FAILED lines, normalizes to canonical `TC-XXX` format. Activated in `cmdVerifyRun` fallback chain after Vitest/Jest parser. Python projects can now use `pytest -v` as `test_runner` and have TCs auto-detected by `verify-run` without rewriting tests in node:test. Convention: name pytest functions `test_TC_001h_description`.

### Tests
- **test(verify):** 10 new tests for `parsePytestOutput()` — PASSED/FAILED detection, underscore normalization, multi-line output, error context capture from `E ` lines, first-occurrence-wins deduplication, no false positives on non-TC test names.
- **Total: 504/504 passing (was 494)**

---

## [0.1.56] — 2026-03-16

### Bug Fixes
- **fix(templates/adopt/scan.md):** IDEA.md output format updated to use Phase 1 expected sections (`## Problem`, `## Target Users`, `## Business Rules`, `## Success Criteria`) instead of scan-specific sections (`## What this project does`, `## Stabilization goals`, `## Out of scope`) that caused 4 warnings on `aitri run-phase 1`.
- **fix(status.js):** `aitri status` next-step now shows `aitri approve N` when a core phase is completed but not yet approved (was always showing `aitri run-phase N`). Fixed in both human-readable and `--json` output (`nextAction` field).

### Tests
- **Total: 494/494 passing (unchanged — display/template fixes)**

---

## [0.1.55] — 2026-03-16

### Features — Adopt Redesign: Stabilization-First Pipeline
- **feat(adopt.js):** `adopt scan` redesigned — produces two files: `ADOPTION_SCAN.md` (technical diagnostic: priority actions, code quality, test health, security, infrastructure) + `IDEA.md` (stabilization brief for Phase 1 using standard sections). Replaces single `ADOPTION_PLAN.md` output. No more fake phase completion injection.
- **feat(adopt.js):** `adopt apply` simplified — initializes `.aitri` + `spec/`, uses `IDEA.md` from scan as Phase 1 input, prints `aitri run-phase 1` as next step. `parsePlan()` removed entirely. Stabilization runs through the real P1→P5 pipeline, producing the project's first formal Aitri artifacts.
- **feat(adopt.js):** `buildFileTree` — `MAX_TREE_LINES=150` cap + `ASSET_EXTS` filter (png, jpg, svg, ico, woff, mp3, map, lock, etc.). Prevents briefing explosion on projects with web assets (1884 → 442 line briefing on real Go project).
- **feat(adopt.js):** `adoptScan` warns when project already has `.aitri` (shows version + approved phase count). `adoptApply` warns when `.aitri` exists and shows `aitri status` as next step for already-initialized projects.
- **feat(personas/adopter.js):** ROLE, CONSTRAINTS, REASONING rewritten to match two-file output. Removed `ADOPTION_PLAN.md` references and stale Phase 2 artifact-mapping logic.

### Bug Fixes (post real-project test)
- Fixed: adoptApply showed "IDEA.md found (from scan)" for pre-existing IDEA.md — changed to "IDEA.md found"
- Fixed: adoptApply said "Next: run-phase 1" on already-initialized projects with approved phases

### Tests
- **test(adopt):** All old `adopt apply` tests rewritten to match new behavior — no ADOPTION_PLAN.md dependency, no completedPhases injection, node:test placeholder creation, no-overwrite.
- **test(smoke):** Updated scan + apply assertions for new two-file output.
- **Total: 494/494 passing (was 482)**

---

## [0.1.54] — 2026-03-14

### Features
- **feat(validate.js):** `aitri validate --json` — machine-readable validation output. Returns `{project, dir, allValid, artifacts[], deployFiles{}, setupCommands[]}`. `artifacts[]` includes `{name, exists, approved}` per artifact. Enables CI/CD integration and Hub readers to query pipeline completeness programmatically.
- **docs(README):** Added sections for `aitri wizard`, `aitri status --json`, `aitri validate --json`, `aitri adopt apply --from`, and "Adopting an Existing Project" guide. Machine-readable design principle documented.
- **docs(BACKLOG):** P1 entry for `aitri adopt` deep review — 5 friction points identified, decision tree for `adopt scan` vs `--from` as primary path.

### Tests
- **Total: 497/497 passing (unchanged)**

---

## [0.1.53] — 2026-03-14

### Features
- **feat(verify.js):** `cmdVerifyRun` — 3 friction fixes: (1) raw output capped at 200 lines with truncation notice, prevents massive suites flooding agent context; (2) when 0 TCs detected, prominent section in briefing output (not just stderr) with exact naming convention, examples, and all 3 detection patterns; (3) manifest incomplete warning when `test_runner` or `test_files` missing from `04_IMPLEMENTATION_MANIFEST.json`.

### Tests
- **Total: 497/497 passing (unchanged — display-layer changes, no exported logic)**

---

## [0.1.52] — 2026-03-14

### Features
- **feat(status.js):** `aitri status --json` — machine-readable pipeline state. Output fields: `project`, `dir`, `aitriVersion`, `cliVersion`, `versionMismatch`, `phases[]` (key, name, artifact, optional, exists, status, drift), `driftPhases[]`, `nextAction`, `allComplete`, `inHub`, `rejections`. Phase status values: `approved | completed | in_progress | not_started`. Verify pseudo-phase included when Phase 4 is approved. `driftPhases[]` is a convenience array of phase keys where `drift: true` — Hub can read it directly without filtering `phases[]`.

### Tests
- **test(status):** New `test/commands/status.test.js` — 15 unit tests covering JSON schema, phase status values, drift detection, driftPhases, versionMismatch, verify phase, allComplete, optional phase absence, text output unaffected by --json.
- **Total: 497/497 passing (was 482)**

---

## [0.1.51] — 2026-03-14

### Features
- **feat(docs):** `docs/HUB_INTEGRATION.md` — canonical Aitri ↔ Hub integration contract. Covers `.aitri` schema (all fields, types, defaults for backward compat), artifact path resolution via `artifactsDir`, drift detection algorithm (sha256 of current artifact vs `artifactHashes[phase]` — no stored `hasDrift` field), `~/.aitri-hub/projects.json` entry schema. Rule: Hub maintainers must consult this doc before modifying any reader or alert rule.
- **feat(adopt.js):** `adoptUpgrade` now registers project in Hub after upgrading, if Hub is installed and project not already in registry. Same silent/defensive pattern as `init.js`. Fixes gap: projects initialized before Hub was installed were never registered.
- **docs(AITRI-HUB):** `spec/02_SYSTEM_DESIGN.md` updated with explicit section directing Hub maintainers to consult `docs/HUB_INTEGRATION.md` before touching readers or alert rules.

### Tests
- **Total: 482/482 passing (unchanged)**

---

## [0.1.50] — 2026-03-14

### Features
- **feat(adopt.js):** `aitri adopt apply --from <N>` — new flag. Initializes project at phase N without requiring `ADOPTION_PLAN.md`. Marks phases 1..N-1 as completed, auto-infers from existing artifacts in `spec/`. Writes `IDEA.md` from README → ADOPTION_PLAN.md → placeholder (in that priority). Entry phase guidance: no prior work → `--from 1`; has requirements only → `--from 2`; has requirements + design → `--from 3`; has code but no tests → `--from 4`; has code + tests, needs CI → `--from 5`.
- **feat(adopt.js):** `inferFromArtifacts(dir, config)` — shared helper used by both `adoptApply` and `adoptApplyFrom`. Scans `spec/` for existing Aitri artifacts and auto-marks corresponding phases as completed.
- **feat(adopt.js):** `adoptApply` (standard path) now runs `inferFromArtifacts` at the end — upgrade scan for projects whose ADOPTION_PLAN.md may have missed artifacts already present.
- **feat(adopt.js):** 0-phases-inferred warning now suggests `--from` as an alternative to `--upgrade`.
- **feat(templates/adopt/scan.md):** Instructions step 5 updated to recommend `--from N` with decision guide table.

### Tests
- **test(adopt):** 7 new tests for `--from` behavior — valid phases 1–5, invalid phase, missing phase argument, IDEA.md priority (README → ADOPTION_PLAN.md → placeholder).
- **Total: 482/482 passing (was 459)**

---

## [0.1.49] — 2026-03-14

### Features
- **feat(templates/phase3.md):** "Fidelity rule" (UX/visual/audio only) replaced with broad "Specificity rule" covering all FR types. Includes Bad→Good examples per type: negative (specific error code), logic (exact return value), persistence (real DB check), security (token/session specifics), qualitative (measurable metric). Two new Human Review checklist items: (1) negative TCs include specific error code/message — not just "fails"; (2) mutation check — if core logic were deleted, would the test catch it?
- **feat(phase3.js `validate`):** Mutation resistance framing added to `complete 3` validator comments (no behavior change — enforced via briefing).

### Tests
- **Total: 459/459 passing (unchanged)**

---

## [0.1.48] — 2026-03-14

### Features — Semantic Quality Validation
- **feat(phase1.js `validate`):** Broad vagueness check for ALL MUST FRs (not just qualitative types). If all `acceptance_criteria` for a MUST FR match the `BROAD_VAGUE` pattern (`good|nice|fast|properly|correctly|efficiently|reliably|securely|safely|...`) and none contain a measurable metric, throws with the FR id and first vague criterion. Forces specific, testable ACs.
- **feat(phase3.js `validate`):** Placeholder `expected_result` detection. Blocks on: `'it works'`, `'should work'`, `'test passes'`, `'passes'`, `'succeeds'`, `'works correctly'`, `'returns successfully'`, `'is correct'`, `'is valid'`, `'ok'`. Error names all offending TC ids.
- **feat(phase3.js `validate`):** FR-MUST gap detection (cross-artifact). Reads `01_REQUIREMENTS.json` and throws if any MUST FR has no test case in `03_TEST_CASES.json`. Every MUST requirement must have ≥1 TC.
- **feat(phase5.js `validate`):** FR-MUST compliance gap detection (cross-artifact). Reads `01_REQUIREMENTS.json` and throws if any MUST FR is absent from `requirement_compliance[]` in `05_PROOF_OF_COMPLIANCE.json`.

### Design principle established
- Aitri enforces mechanical/structural correctness (schema, coverage, vagueness, placeholders). Human gates enforce content quality (are requirements correct? is the design good?). Heuristics raise the floor; humans set the ceiling.

### Tests
- **test(phase1):** 4 new tests for broad vague check — all-vague MUST FRs throw, FRs with metrics pass, SHOULD FRs exempt, mixed ACs pass.
- **test(phase3):** 3 new expected_result tests + 3 new FR-MUST gap tests.
- **test(phase5):** 4 new cross-artifact tests using real filesystem (os.tmpdir).
- **Total: 459/459 passing (was 446)**

---

## [0.1.47] — 2026-03-14

### Bug Fixes
- **fix(run-phase.js):** `started` event was saved before `buildBriefing()` executed — could log phantom starts if template rendering threw. Moved `appendEvent + saveConfig` to after `console.log(briefing)`. Requires second save but guarantees event only fires when briefing reaches stdout.
- **fix(adopt.js):** `process.exit(1)` on user abort reverted to `process.exit(0)`. User cancelling a prompt is not an error. The v0.1.44 change was incorrect — "aitri adopt apply && next_cmd" not running after N is the expected behavior, which exit(0) achieves correctly.
- **fix(phase4.js):** `validate()` now accepts `{ dir }` as second argument (already passed by `complete.js`). Emits `[aitri] Warning` in stderr for each `test_files` entry not found on disk. Non-blocking — enforcement remains in `verify-run`.
- **fix(feature.js):** `aitri feature run-phase` now errors explicitly if `FEATURE_IDEA.md` doesn't exist, with the exact path to create. Previously the briefing was generated with empty feature context and the agent received no feature description.
- **fix(adopt.js):** `adoptApply` now emits `[aitri] Warning` in stderr when zero completed phases could be inferred from `ADOPTION_PLAN.md`, with instructions to use `aitri adopt --upgrade` as fallback.

### Features
- **feat(approve.js):** `aitri approve review` now has explicit routing: if `verifyPassed` → suggests `run-phase 5`; if Phase 4 approved → suggests `verify-run`; otherwise → suggests `run-phase 4`. Non-blocking — review remains an optional phase.
- **feat(run-phase.js):** `appendEvent(config, 'started', phase)` emitted after briefing is confirmed. Hub now has full timeline: started → completed → approved/rejected.
- **feat(verify.js):** `appendEvent(config, 'verify-run', 'verify', { passed, failed, skipped })` and `appendEvent(config, 'verify-complete', 'verify', { passed, failed })` added. Hub can read verify outcomes from event log.
- **feat(init.js):** isTempDir regex extended with `/private/tmp/` — covers macOS symlink resolution edge case.

### Technical Debt (P3 — resolved)
- **fix(phase1,3,4,5 validate):** `JSON.parse()` now wrapped with friendly error message. Malformed agent output (markdown fences, trailing commas, truncation) produces actionable error instead of raw SyntaxError stack.
- **fix(verify.js):** Warning emitted when all `fr_coverage` entries have `tests_passing === 0` but tests did pass — signals missing `@aitri-tc` markers in test files.
- **fix(adopt.js):** `scanTestHealth` now uses `openSync/readSync` with `MAX_FILE_READ_BYTES` cap, consistent with `scanCodeQuality` and `scanSecretSignals`.

### Tests
- **feat(adopt.test.js):** 13 new unit tests for `scanCodeQuality`, `scanSecretSignals`, `scanInfrastructure`, `scanTestHealth`. Scanners exported as named exports.
- **feat(init.test.js):** 3 new tests for isTempDir classification (temp paths excluded, real paths included).
- **Total: 459/459 passing** (was 443 at v0.1.44)

---

## [0.1.46] — 2026-03-13

### Features
- **feat(init.js):** Auto-register project in Aitri Hub (`~/.aitri-hub/projects.json`) on `aitri init`. Silent, non-blocking. Skips temp/system directories.
- **feat(status.js):** Shows `Monitored by Aitri Hub` line when project is registered in Hub.

### Bug Fixes
- **fix(init.js):** isTempDir guard added to skip Hub registration for temp/system directories (`/tmp/`, `/var/folders/`, `/private/var/`, `/var/tmp/`). Prevents test dirs from polluting Hub registry.

### Tests
- **Total: 446/446 passing** (was 443 at v0.1.44 — 3 new tests for isTempDir)

---

## [0.1.45] — 2026-03-13

### Features
- **feat(state.js):** `appendEvent(config, event, phase, extra)` — appends pipeline activity events to `config.events[]`, capped at 20. Called by `approve.js`, `complete.js`, `reject.js`.
- **feat(approve.js, complete.js, reject.js):** All three now call `appendEvent` before `saveConfig`. Event types: `'approved'`, `'completed'`, `'rejected'`.

### Tests
- **Total: 443/443 passing (unchanged)**

---

## [0.1.44] — 2026-03-13

### Bug Fixes (deep stability audit — v0.1.44)
- **fix(resume.js):** `fr_coverage` was treated as an object with `Object.keys()`, but `verify.js` writes it as an array `[{fr_id, tests_passing, tests_failing, ...}]`. `aitri resume` was showing `- 0: unknown (0/0 tests passing)` instead of `- FR-001: covered (3/3 tests passing)`. Now handles both array and legacy object formats. Test fixture updated to match the real artifact structure.
- **fix(adopt.js):** `buf.slice()` → `buf.subarray()` in `scanCodeQuality` and `scanSecretSignals`. `wizard.js` was already using `buf.subarray()` — brings all three into alignment.
- **fix(adopt.js):** `process.exit(0)` on user abort in `adoptApply` changed to `process.exit(1)`. _(Note: reverted to `exit(0)` in v0.1.47 — the original reasoning was incorrect.)_

### Docs
- **docs(BACKLOG.md):** Stabilization item closed. Added `## Known Technical Debt` section documenting 3 design trade-offs: JSON.parse error quality in validators, missing `@aitri-tc` marker silent failure in verify, and `scanTestHealth` byte-limit inconsistency.

### Tests
- **Total: 443/443 passing (unchanged)**

---

## [0.1.39] — 2026-03-13

### Bug Fix (discovered in production — real-world adopt test on Ultron project)
- **fix(state.js):** `EISDIR` crash when `.aitri` already exists as a directory. Added `configFilePath()` — when `.aitri` is a directory, config is stored at `.aitri/config.json` instead of overwriting the directory. Affects projects that use `.aitri/` as a docs/config folder before adopting Aitri.

---

## [0.1.41] — 2026-03-13

### Features
- **feat(adopt/scan):** Deep technical health audit. `adopt scan` now pre-scans 6 dimensions programmatically (code quality markers, .gitignore coverage, env/secrets, credential signals, infrastructure readiness, test health) and passes results to the agent. `ADOPTION_PLAN.md` now requires a `## Technical Health Report` section with 7 subsections + Priority Actions (CRITICAL/HIGH/MEDIUM/LOW).
- **feat(personas/adopter):** Role expanded to Senior Software Architect + Technical Auditor. REASONING updated with 4-phase analysis process.

### Tests
- **Total: 443 tests (unchanged)**

---

## [0.1.40] — 2026-03-13

### Fix
- **fix(feature/init):** `aitri feature init` output now explains what a feature sub-pipeline is, lists all commands, and shows the full workflow — previously only showed 2 lines.

---

## [0.1.39] — 2026-03-13

### Bug Fix (discovered in production — real-world adopt test on Ultron project)
- **fix(state.js):** `EISDIR` crash when `.aitri` already exists as a directory. Added `configFilePath()` — when `.aitri` is a directory, config is stored at `.aitri/config.json`. Affects projects that use `.aitri/` as a docs/config folder before adopting Aitri.

---

## [0.1.38] — 2026-03-13

### Features
- **feat(wizard/agent-mode):** `aitri wizard` no longer errors when stdin is not a TTY. In non-TTY contexts (Claude Code, pipelines), prints a structured briefing instructing the agent to conduct the interview, infer fields from rich answers, and confirm the IDEA.md draft before writing.
- **feat(init):** `aitri init` now creates `idea/` folder alongside `IDEA.md` and `spec/`. Drop mockups, Figma exports, PDFs, or reference docs there — `aitri run-phase` automatically lists them in every phase briefing.
- **feat(templates/IDEA.md):** Added `## Assets` section for Figma links, mockup paths, and reference docs.
- **feat(templates/phases):** All 8 phase templates now include a `## Delivery Summary` section — structured phase report after each artifact so the user can approve without opening the file.
- **fix(wizard):** Replaced deprecated `buf.slice()` with `buf.subarray()`.
- **fix(adopt/parsePlan):** Section heading aliases — accepts `## Project Overview`, `## Summary`, `## Decision`, `## Recommendation`, `## Inferred Phases`, `## Phases` in addition to canonical names.
- **fix(help):** `WORKFLOW:` now documents `idea/` folder and `aitri wizard` as alternative to manual IDEA.md editing.

### Tests
- **test(wizard):** Updated agent-mode test — verifies briefing output instead of TTY error.
- **Total: 443 tests (unchanged)**

---

## [0.1.37] — 2026-03-13

### Stabilization
- **fix(bin/aitri.js):** `aitri adopt scan` and `aitri adopt apply` now always use the current working directory instead of `findProjectDir(cwd)`. Previously, if any parent directory (including home dir) contained a `.aitri` file, scan/apply would silently run against that parent dir instead of the intended project. `adopt --upgrade` is unaffected (it intentionally finds an existing Aitri project).
- **fix(run-phase):** Missing required file error now names the exact phase to run — e.g. "Missing required file: 01_REQUIREMENTS.json\nRun: aitri run-phase 1" instead of generic "Run previous phases first."
- **fix(adopt/parsePlan):** Parser now accepts `###` headings (not just `##`); Adoption Decision check uses `\bready\b`/`\bblocked\b` regex (not fragile `startsWith`); Completed Phases now falls back to bullet list (`- Phase 1`) and comma-separated formats in addition to JSON array.
- **fix(help):** Added FEATURE WORKFLOW section — `aitri feature init/run-phase/complete/approve` were undocumented in `aitri help` output.

### Tests
- **test(smoke):** 13 new smoke tests — `aitri adopt scan`, `aitri adopt apply` (well-formed, `###` headings, bullet-list phases), `aitri adopt --upgrade`, `aitri feature init`, `aitri feature list`, `aitri feature status`, `aitri feature init` error cases.
- **Total: 443 tests (up from 430)**

---

## [0.1.36] — 2026-03-12

### Features
- **feat(wizard):** `aitri wizard [--depth quick|standard|deep]` — synchronous TTY interview (zero deps, `fs.readSync` char-by-char). Writes filled `IDEA.md` from user answers. Depths: quick (6 questions), standard (+constraints/tech stack), deep (+urgency/no-go/risks). Aborts if `IDEA.md` exists unless user confirms overwrite.
- **feat(run-phase/discovery):** `aitri run-phase discovery --guided` — runs quick interview before printing briefing, injects answers as `## Interview Context` block. Backward-compatible: without `--guided`, zero behavior change.

### Tests
- **test(wizard):** 21 new tests — `collectInterview`, `buildIdeaMd`, `buildInterviewContext`, `runDiscoveryInterview`, `cmdWizard` (TTY gate, overwrite confirm/abort, depth validation), `run-phase discovery --guided` integration.
- **Total: 430 tests (up from 409)**

---

## [0.1.35] — 2026-03-12

### Features
- **feat(adopt/scan):** `aitri adopt scan` — scans project file tree, `package.json`, `README`, test files → outputs briefing for agent → agent produces `ADOPTION_PLAN.md`.
- **feat(adopt/apply):** `aitri adopt apply` — reads `ADOPTION_PLAN.md`, isTTY gate, initializes `.aitri` + `spec/` + `IDEA.md` from Project Summary, marks inferred `completedPhases`.
- **feat(README):** Restructured — ASCII art header, pipeline diagram, 5-step Quick Start, commands table (adopt/feature/resume/wizard), agents table. Reduced from 354 to ~100 lines. Schemas removed (available via `aitri help`).

### Tests
- **test(adopt):** 21 new tests — scan output structure, apply initialization, --upgrade sync, error conditions, parsePlan section parsing.
- **Total: 409 tests (up from 388)**

---

## [0.1.34] — 2026-03-12

### Features
- **feat(adopt/--upgrade):** `aitri adopt --upgrade` — non-destructive sync for existing Aitri projects: iterates all PHASE_DEFS artifacts, adds to `completedPhases` if present on disk, updates `aitriVersion`. Never removes state.
- **feat(init/status):** `aitriVersion` field stored in `.aitri` on every `init`. `aitri status` warns if project was initialized with a different CLI version: "⚠️ Project initialized with vX.Y.Z — CLI is vA.B.C. Run: aitri init to update (non-destructive)".
- **feat(personas):** New `lib/personas/adopter.js` — Senior Software Architect persona for reverse-engineering adoption analysis.
- **feat(templates):** New `templates/adopt/scan.md` — briefing template for `adopt scan` with FILE_TREE, PKG_JSON, README, TEST_SUMMARY placeholders and structured ADOPTION_PLAN.md output format (6 required sections).

### Tests
- **test(init):** 6 new tests — `aitriVersion` stored on init, version mismatch warning in status, no warning when versions match, no warning when aitriVersion absent (graceful).
- **Total: 388 tests (up from 382)**

---

## [0.1.33] — 2026-03-12

### Features
- **feat(phaseDiscovery):** Discovery Confidence gate — `aitri complete discovery` now validates `00_DISCOVERY.md` has ≥ 5 Evidence sections and a Confidence score. Low confidence blocks with actionable message.
- **feat(approve/phaseUX):** UX archetype detection — `aitri approve ux` detects `UX`, `visual`, `audio` FRs in `01_REQUIREMENTS.json` and enforces Phase UX must run before Phase 2. Prevents skipping UX phase silently.

### Tests
- **test(phaseDiscovery):** 6 new tests — confidence gate pass/fail, evidence count validation, missing confidence score.
- **test(phaseUX):** 4 new tests — archetype detection in approve flow.
- **Total: 382 tests (up from 370)**

---

## [0.1.30] — 2026-03-12

### Features
- **feat(phase3):** Rank 3 — Three Amigos gate complete. Cross-phase AC check: `aitri complete 3` now verifies each TC's `ac_id` exists in `user_stories[*].acceptance_criteria[*].id` from `01_REQUIREMENTS.json`. Missing file → stderr warning + skip (non-blocking). Invalid ac_id → exit 1 with specific TC reference.
- **feat(complete):** `p.validate(content, { dir, config })` — context object passed to all phase validators, enabling cross-phase file reads without signature breakage.

### Tests
- **test(phase3):** 5 new cross-phase tests: backward compat (no dir), missing requirements file (graceful), valid ac_ids pass, invalid ac_id fails, briefing mentions ac_id.
- **Total: 313 tests (up from 308)**

---

## [0.1.29] — 2026-03-12

### Features
- **feat(phase1/templates):** Rank 2 — Structured IDEA.md template complete. `templates/IDEA.md` has 8 sections (Problem, Target Users, Current Pain, Business Rules, Success Criteria, Hard Constraints, Out of Scope, Tech Stack) with instructional HTML comments. `buildBriefing()` warns on stderr (non-blocking) when any required section is absent or contains only placeholder comment text.

### Tests
- **test(phase1):** 5 new tests for empty-section warnings: absent section fires warning, comment-only section fires warning, populated sections produce no warning, warning is non-blocking (buildBriefing still returns briefing string)
- **Total: 308 tests (up from 303)**

---

## [0.1.26] — 2026-03-12

### Bug Fixes
- **fix(state):** Atomic write temp file moved from `os.tmpdir()` to project directory — eliminates `EXDEV: cross-device link not permitted` on systems where `/tmp` is a separate tmpfs mount. Removes `os` import from `state.js`; replaces with per-pid temp name `.aitri-<pid>.tmp` in project dir.
- **fix(approve):** UX/visual FR detection silent catch replaced with explicit stderr warning — when `01_REQUIREMENTS.json` fails to parse, user now sees: "Could not read 01_REQUIREMENTS.json to check for UX/visual FRs. If your project has UX or visual requirements, run: aitri run-phase ux". Previously a silent `catch {}` skipped the gate with no feedback.
- **fix(phaseReview):** Added missing `extractContext: (content) => head(content, 80)` — phaseReview was the only phase not implementing the `extractContext` contract. TypeError would have occurred if review artifact was used as input via `run-phase.js` line 49. Now consistent with all other 7 phases.

### Features
- **feat(state):** New export `hashArtifact(content)` — SHA-256 hash of artifact content via `node:crypto`. Used for drift detection.
- **feat(approve):** Stores `artifactHashes[phase]` in `.aitri` at approval time — SHA-256 of the artifact file content at the moment the human approves.
- **feat(status):** Drift detection — if an approved artifact's current hash differs from the stored approval hash, displays `⚠️ DRIFT: artifact modified after approval` inline with the phase row.
- **feat(validate):** Drift detection — same hash check as `status`; drift causes `allGood = false` and blocks the "Pipeline complete" message. Both commands now derive from the same source of truth (resolves the `status`/`validate` inconsistency).
- **feat(validate):** Close-out message updated — "Pipeline complete. Your project is ready to deploy." → "Pipeline complete. Deployment artifacts are ready — run your deploy commands to ship." Distinguishes pipeline completion from actual deployment.

### Tests
- **test(state):** `saveConfig() — atomic write location` — verifies `.aitri` is written to project dir and no `.aitri-*.tmp` file remains after save.
- **test(state):** `hashArtifact()` — 4 tests: hex format, determinism, collision resistance, empty string.
- **test(smoke):** `[v0.1.26] approve stores artifactHashes in .aitri` — SHA-256 hash persisted after `approve 1`.
- **test(smoke):** `[v0.1.26] aitri status shows DRIFT` — modify artifact post-approval → DRIFT visible in status.
- **test(smoke):** `[v0.1.26] aitri validate shows DRIFT` — DRIFT blocks "Pipeline complete" message.
- **test(smoke):** `[v0.1.26] aitri approve 1 warns on unparseable JSON` — UX fallback warning is non-silent.
- **Total: 254 tests (up from 245)**

---

## [0.1.25] — 2026-03-11

### Bug Fixes
- **fix(verify):** BUG-3 — `flagValue` returns `null` when flag absent; old guard `!== undefined` was true for `null` → `parseFloat(null)` = `NaN` → `--coverage` injected on every `verify-run` → unit tests failed with "bad option" on Node 24. Fix: `rawThreshold !== null && rawThreshold !== undefined`

### Features
- **feat(templates/phase2):** Output section now lists exact `##` header names required by validator with note "validates by exact match"; added frontend-only guidance for API Design and Data Model; Human Review checklist corrected from "All 5" to "All 8 required sections"
- **feat(templates/phase5):** Explicit warning in schema — `"id"` not `"fr_id"` for `requirement_compliance` entries; `04_TEST_RESULTS.json` uses `fr_id` internally, `05_PROOF_OF_COMPLIANCE.json` uses `id`
- **feat(validate):** `DEPLOYMENT.md` and `.env.example` downgraded from `⚠️` to `ℹ️ optional` — only `Dockerfile` and `docker-compose.yml` are required
- **feat(verify-complete):** Passing message now shows e2e breakdown — e.g. `23/25 passing (21 unit + 2 e2e)`

### Tests
- **test(verify):** 2 new BUG-3 regression tests — confirm `parseFloat(null)` = NaN root cause and that fixed guard returns `null`
- **Total: 245 tests (up from 243)**

---

## [0.1.24] — 2026-03-11

### Bug Fixes
- **fix(approve):** `aitri approve ux` — when Phase 1 is already approved, now shows `aitri run-phase 2` PIPELINE INSTRUCTION instead of the generic "run-phase 1" hint (BUG-2)

### Features
- **feat(verify):** `parseRunnerOutput()` — TC regex changed from `TC-\d+` to `TC-[A-Za-z0-9]+`; alphanumeric TC IDs (e.g. `TC-020b`, `TC-020c`) are now detected correctly
- **feat(verify):** New export `parsePlaywrightOutput(output)` — Playwright uses `✓` (U+2713), not `✔` (U+2714); dedicated parser handles Playwright format without charset collision
- **feat(verify):** `spawnSync` for both main runner and Playwright runner — `shell: true` → `shell: false`; eliminates `[DEP0190]` DeprecationWarning
- **feat(verify):** Skipped TC breakdown — summary now reports `skipped_e2e` (browser/e2e TCs) and `skipped_no_marker` (no marker detected) separately
- **feat(personas/ux):** CONSTRAINTS updated — when UX/visual FRs explicitly require visual attributes, the UX designer now defines concrete design tokens (color roles, type scale, spacing); prevents generic CSS output for apps with "minimalist modern" aesthetic requirements
- **feat(templates/phaseUX):** `## Design Tokens` section added to required output — enforced when visual FRs specify aesthetic style; tokens flow directly to implementation
- **feat(complete):** `--check` dry-run flag — `aitri complete <phase> --check` validates the artifact without recording state; exits 0 on pass, exits 1 with error on fail

### Tests
- **test(verify):** 2 new `parseRunnerOutput()` tests — alphanumeric TC IDs (`TC-020b`, `TC-020c`)
- **test(verify):** 6 new `parsePlaywrightOutput()` tests — ✓ pass, ✗ fail, multi-line, dedup, no TC patterns, alphanumeric IDs
- **Total: 243 tests (up from 235)**

---

## [0.1.23] — 2026-03-11

### Prompt Template Layer
- **feat(prompts):** `lib/prompts/render.js` — lightweight `{{KEY}}` / `{{#IF_KEY}}...{{/IF_KEY}}` renderer, zero deps
- **refactor(phases):** all 8 `buildBriefing()` methods now load from `templates/phases/*.md` — prompts readable and editable as plain markdown without touching JS logic
- **no behavior change** — 235 tests pass, agent output identical to prior version
- **benefit:** prompt content is first-class — diffs are clean, adjustments don't require JS knowledge

---

## [0.1.22] — 2026-03-11

### Playwright E2E Detection
- **feat(verify-run):** `--e2e` flag — runs `npx playwright test` as second runner when `playwright.config.js/.ts` exists
- **feat(verify-run):** Playwright-detected TCs merged into results before writing `04_TEST_RESULTS.json` (main runner wins on conflict)
- **feat(verify-run):** Playwright raw output shown as separate section in report
- **feat(phase3):** E2E tests via Playwright must follow `TC-XXX:` naming for auto-detection by verify-run
- No schema changes — zero-config, auto-detects playwright config in project dir

---

## [0.1.21] — 2026-03-11

### Software Quality Guarantee — Test Quality Gate
- **feat(verify-run):** Assertion density scan — scans `test_files[]` for `@aitri-tc` markers, flags TCs with ≤1 `assert.*`/`expect()` call as low-confidence; reports as warnings in verify-run output
- **feat(verify-run):** Code coverage gate — `--coverage-threshold N` flag; auto-injects `--experimental-test-coverage` (Node 18+) or `--coverage` (Node 22+) for `node --test` runners; warns if below threshold
- **feat(phase4/human-review):** Two new mandatory checklist items — verify assertion tests real behavior (not constants); review assertion density warnings from verify-run
- **feat(verify.js):** Three new exported pure functions: `scanTestContent()`, `scanAssertionDensity()`, `parseCoverageOutput()`

### Tests
- **test(verify):** 12 new tests for `scanTestContent()` (7 cases) and `parseCoverageOutput()` (5 cases)
- **Total: 235 tests (up from 223)**

---

## [0.1.19] — 2026-03-11

### Software Quality Guarantee
- **fix(approve/status/help/verify):** All stale `aitri verify` references replaced with `verify-run` — eliminates the honor-system path from all user-facing surfaces
- **feat(phase4/validate):** `test_runner` and `test_files[]` are now required — `aitri complete 4` fails without them
- **feat(phase4/briefing):** Requirements Snapshot (Anti-Drift Reference) — compact FR list injected directly into briefing, independent of extractContext truncation; resists context drift across long sessions
- **feat(phase4/briefing):** Test Authorship Lock — lists all Phase 3 TC ids; prohibits new TC ids; requires `// @aitri-tc TC-XXX` markers in every test function
- **feat(verify):** `aitri verify` disabled — redirects to `aitri verify-run` with explanation
- **feat(verify-complete):** FR traceability cross-check — every FR from `01_REQUIREMENTS.json` must appear in `fr_coverage` with ≥1 passing test; blocks with list of uncovered FRs if gap detected
- **feat(verify-complete):** PIPELINE INSTRUCTION format — replaced soft `→ Next:` with explicit directive block (consistent with approve.js)

### Tests
- **test(phase4):** 5 new validate() tests for `test_runner` + `test_files[]` enforcement
- **test(phase4):** 8 new buildBriefing() tests — Requirements Snapshot, Test Authorship Lock, @aitri-tc marker instruction, test_runner/test_files in output schema
- **Total: 209 tests (up from 196)**

---

## [0.1.20] — 2026-03-11

### Auto-Parsing Test Runner Output
- **feat(verify-run):** `cmdVerifyRun` completely rewritten — runs real test suite via `spawnSync`, auto-parses `✔/✖ TC-XXX` patterns from runner output, writes `04_TEST_RESULTS.json` automatically
- **feat(verify-run):** Agent self-reporting eliminated — agent never writes or maps test results
- **feat(verify-run):** `parseRunnerOutput()` and `buildFRCoverage()` exported as pure functions
- **feat(verify):** `aitri verify` disabled — hard redirect to `aitri verify-run` with explanation
- **feat(verify-complete):** PIPELINE INSTRUCTION format consistent with approve.js

### Tests
- **test(verify):** New `test/commands/verify.test.js` — 16 unit tests for `parseRunnerOutput()` and `buildFRCoverage()`
- **Total: 223 tests (up from 209)**

---

## [0.1.14] — 2026-03-10 ✅ PUBLISHED

### Prompt Engineering — Personas
- **feat(personas):** R1 — pipeline context added to all 7 personas: each ROLE now states phase position and what it feeds into/receives from
- **feat(personas):** R2 — auto-check added to REASONING of all 7 personas: "Before finalizing: verify..." at end of each
- **feat(personas):** R3 — DevOps ROLE strengthened: final gate framing, dishonesty consequence, placeholder blocking rationale
- **feat(personas):** R4 — few-shot ❌/✅ examples added to PM and Developer REASONING
- **feat(personas):** R5 — positive constraints ("Always X") added to all 7 personas

### SDD Pipeline
- **feat(context):** `extractRequirements()` now propagates `no_go_zone`, `user_personas`, and `user_stories` (with concrete AC: given/when/then) to all downstream phases — strips narrative fields (as_a, i_want, so_that)
- **feat(phases):** Human Review Checklists added at end of all 5 core phase briefings
- **fix(phase4):** Dead code removed (`qualDebt` filtering by `entry.fr_type` — field never existed)
- **fix(phase4):** `head(120)` → `head(200)` for System Design context (prevents API Design truncation)

### Architecture
- **refactor:** `OPTIONAL_PHASES` extracted to SSoT in `lib/phases/index.js` — eliminated 5 duplicate local definitions across commands
- **docs:** FEEDBACK.md rewritten — clear purpose (test feedback funnel → backlog), lifecycle rules, expiration policy

### Tests
- **test:** `test/phases/context.test.js` — 18 new tests for `extractRequirements()` and `head()`
- **test:** Human Review Checklist tests added to phase1–5
- **Total: 135 tests (up from 103)**

---

## [2.0.0] — 2026-03-09 ✅ PUBLISHED

### Core Architecture
- CLI with 9 commands: `init`, `run-phase`, `complete`, `approve`, `reject`, `verify`, `verify-complete`, `status`, `validate`
- 5-phase pipeline: PM → Architect → QA → Developer → DevOps
- State management via `.aitri` JSON file (stateless per invocation)
- `extractContext()` per phase to minimize context drift (~40-60% token reduction)
- Zero external dependencies

### Compliance (breaking change vs v1.0.0)
- Phase 1: MUST FRs require `type` + measurable acceptance criteria by category
- Phase 2: `validate()` enforces required sections + minimum SDD length
- Phase 3: mandatory gates by FR type (UX, persistence, security, reporting)
- Phase 4: self-evaluation checklist + Technical Debt Declaration mandatory in manifest
- Phase 5: `PROOF_OF_COMPLIANCE.json` with `requirement_compliance[]` per-FR with levels
- `aitri complete`: `p.validate()` rejects malformed or incomplete artifacts
- Phase 4 SDD capped at 120 lines (anti context explosion)

### Observability
- `aitri reject` persists feedback in `.aitri` with timestamp
- `aitri status` shows rejection history with date and message

---

## [2.0.1] — 2026-03-09 ✅ PUBLISHED

### Fixes
- **fix(state):** Warning to stderr when `.aitri` config is malformed — previously silent reset
- **fix(cli):** `flagValue()` bounds check — prevents silent undefined when flag has no value

### Tests
- **test:** 34 unit tests for `validate()` — all 5 phases, `node:test` built-in, zero dependencies
- **test:** 13 smoke tests — full CLI pipeline with real command invocations + state assertions
- **scripts:** `npm test` (unit), `npm run test:smoke` (E2E), `npm run test:all` (both)

### Architecture
- **refactor:** `lib/phases.js` → `lib/phases/` — one file per phase + shared `context.js`
- **refactor:** `bin/aitri.js` → thin dispatcher (52 lines) + `lib/commands/` — one file per command
- **refactor:** `test/phases.test.js` → `test/phases/` — one test file per phase

### Documentation
- **docs:** README fully rewritten for v2.0.0 — commands, schemas, workflow, compatible agents
- **docs:** All design notes translated to English (ADR-008 added)
- **docs:** Development pipeline directives in ARCHITECTURE.md — regression policy, impact analysis, version bump policy
- **docs:** GITHUB_NPM_GUIDE.md updated for v2.0.0 release process

---

## [2.0.2] — 2026-03-09 ✅ PUBLISHED

- **feat(validate):** Pipeline completion now shows deployment files, setup commands from manifest, and path to DEPLOYMENT.md — instead of dead-end "all good" message
- **fix(phase3/briefing):** Schema contract now explicit — `requirement_id` must be single FR id, `type` is strictly `unit|integration|e2e`, `scenario` is the separate field for happy_path/edge_case/negative
- **fix(phase3/validate):** Detects comma-separated `requirement_id` with descriptive error
- **test:** 2 new Phase 3 tests covering both agent schema mistakes (comma requirement_id, type misuse)

---

## [1.0.0] — deprecated
> Superseded by v2.0.0. No artifact validation, no per-FR compliance.

## [0.4.0] — deprecated
> Superseded by v2.0.0. Included MCP server and Claude Code Skill — removed for lack of portability.
