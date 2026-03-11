# Aitri — Changelog

> Published version history. Format: [version] — date — what shipped.
> Version scheme: `0.1.x` (npm canonical). Previous entries used `2.0.x` — those entries are preserved below for history.

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
