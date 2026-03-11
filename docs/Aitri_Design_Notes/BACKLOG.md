# Aitri — Backlog

> Open and closed items. Single source of truth. Close with [x] when complete.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

---

## Infrastructure

- [x] P1 — Publish `aitri@2.0.0` to npm (2026-03-09)
- [x] P1 — Push v0.1.0 to GitHub repo `cesareyeserrano/Aitri` — clean repo, single commit (2026-03-09)
- [x] P2 — Deprecate `aitri@0.4.0`, `aitri@1.0.0`, `aitri@2.0.0` on npm — done 2026-03-11

## Product Fidelity — idea → product faithful to requirements

- [x] P1 — Phase 1 validate(): reject qualitative FRs (UX/visual/audio) without observable metric in acceptance_criteria (2026-03-09)
- [x] P1 — Phase 1 briefing: explicit operationalization rules — qualitative attribute must become measurable criteria defined by user, not by Aitri (2026-03-09)
- [x] P1 — Phase 4 validate(): reject empty or generic technical_debt when qualitative MUST FRs exist in requirements (2026-03-09)
- [x] P2 — Phase 3 briefing: fidelity test requirement for qualitative FRs — expected_result must reference specific metric from FR acceptance_criteria (2026-03-09)
- [x] P3 — Phase 5 validate(): block pipeline if any FR has compliance level `placeholder` (2026-03-09)

## Personas & UX Pipeline

- [x] P1 — user_personas field in 01_REQUIREMENTS.json — inferred by PM, warning if absent, not blocking (2026-03-09)
- [x] P1 — lib/personas/ — 5 personas refactored: pm, architect, qa, developer, devops — ROLE + CONSTRAINTS + REASONING (2026-03-09)
- [x] P1 — lib/personas/ux.js — UX/UI persona with Nielsen's 10 heuristics as operational design instructions (2026-03-09)
- [x] P1 — aitri run-phase ux — optional UX phase: 01_UX_SPEC.md with User Flows + Component Inventory + Nielsen Compliance (2026-03-09)
- [x] P1 — Phase 2 reads 01_UX_SPEC.md if present — architect gets UX context when available (2026-03-09)

## Pipeline Quality

- [x] P2 — Persist `aitri reject` feedback in `.aitri` with timestamp (2026-03-09)
- [x] P3 — `aitri status` shows rejection history with feedback per phase (2026-03-09)
- [x] P3 — Phase 2 validation (`.md`) — required sections + minimum length (2026-03-09)

## Software Quality Guarantee (v0.1.19)

> Goal: Aitri must guarantee executable software quality, not just documentation quality.
> Three failure modes to fix: (1) agent self-reports test results, (2) biased test authorship, (3) context drift by Phase 4.

- [x] P1 — **Bias: separate test authorship** — Phase 4 briefing must instruct agent to implement ONLY the TC ids defined in Phase 3 (`03_TEST_CASES.json`), no new tests allowed; Phase 4 manifest must declare `test_files[]` referencing those TC ids via `@aitri-tc TC-XXX` markers in test code (2026-03-11)
- [x] P1 — **Bias: eliminate honor-system verify** — `aitri verify` redirects to `verify-run` with error; `verify-complete` blocked if `test_runner` or `test_files[]` absent in manifest (2026-03-11)
- [x] P1 — **Context drift: requirements snapshot in Phase 4 briefing** — FR snapshot (id + title + type + acceptance_criteria) injected directly into Phase 4 briefing as Anti-Drift Reference, independent of `extractContext` truncation (2026-03-11)
- [x] P1 — **Traceability cross-check at verify-complete** — cross-checks every FR-XXX from Phase 1 against `fr_coverage` in results; blocks if any FR is missing from coverage or has zero passing tests (2026-03-11)
- [x] P2 — **verify-complete: PIPELINE INSTRUCTION format** — replaced soft "→ Next:" with explicit `PIPELINE INSTRUCTION` block (2026-03-11)
- [x] P2 — **Phase 4 validate(): enforce `test_runner` + `test_files[]`** — schema validation blocks `aitri complete 4` if fields absent or empty (2026-03-11)

## Test Quality Gate (v0.1.21)

- [x] P1 — **Assertion density scan** — `scanTestContent()` flags TCs with ≤1 `assert.*`/`expect()` call; warnings in `verify-run` output (2026-03-11)
- [x] P1 — **Code coverage gate** — `--coverage-threshold N` flag in `verify-run`; auto-injects `--experimental-test-coverage`/`--coverage` for `node --test` runners (2026-03-11)
- [x] P2 — **Phase 4 Human Review hardened** — 2 new checklist items: verify assertion tests real behavior; review density warnings (2026-03-11)
- [ ] P3 — **Mutation testing** (Stryker.js) — detects trivial tests that pass on mutated code; backlog, requires external dep

## Prompt Template Layer (v0.1.23)

- [x] P2 — `lib/prompts/render.js` — `{{KEY}}` / `{{#IF_KEY}}` renderer, zero deps (2026-03-11)
- [x] P2 — `templates/phases/*.md` — all 8 phase prompts migrated to editable markdown files (2026-03-11)
- [x] P2 — Phase JS files reduced from 50-100 lines to ~10 lines each — prompt content decoupled from logic (2026-03-11)

## Playwright E2E Detection (v0.1.22)

- [x] P2 — **`--e2e` flag in `verify-run`** — runs `npx playwright test` as second runner when `playwright.config.js/.ts` exists; merges TCs into results (2026-03-11)
- [x] P2 — **Phase 3 briefing** — Playwright e2e tests must follow `TC-XXX:` naming for auto-detection (2026-03-11)

## E2E Test Fixes & UX Design Tokens (v0.1.24)

- [x] P1 — **BUG-2: `aitri approve ux` shows wrong next step** — when Phase 1 already approved, output `run-phase 2` PIPELINE INSTRUCTION, not `run-phase 1` (2026-03-11)
- [x] P1 — **`parseRunnerOutput()` — alphanumeric TC IDs** — regex `TC-\d+` → `TC-[A-Za-z0-9]+`; fixes TC-020b, TC-020c not detected (2026-03-11)
- [x] P1 — **`parsePlaywrightOutput()` — Playwright ✓ vs ✔ charset** — new dedicated parser using U+2713 (✓); old parser used U+2714 (✔) causing 0 TCs detected (2026-03-11)
- [x] P2 — **`spawnSync` `shell: false`** — eliminates `[DEP0190]` DeprecationWarning for both main runner and Playwright runner (2026-03-11)
- [x] P2 — **Skipped TC breakdown** — `skipped_e2e` (browser/e2e TCs) vs `skipped_no_marker` (no marker) reported separately in verify-run summary (2026-03-11)
- [x] P2 — **GAP-1: UX persona design tokens** — CONSTRAINTS updated; when visual FRs require visual attributes, UX designer defines design tokens (color roles, type scale, spacing); prevents generic CSS output (2026-03-11)
- [x] P2 — **GAP-1: phaseUX.md `## Design Tokens` section** — required output section when visual FRs specify aesthetic style; flows to implementation (2026-03-11)
- [x] P2 — **FRICTION-3: `aitri complete <phase> --check`** — dry-run validation; exits 0 on pass, exits 1 with error message on fail; does not record state (2026-03-11)

## Aitri Testing

- [x] P2 — Test suite for `validate()` — all 5 phases, 34 tests, `node:test` built-in (2026-03-09)
- [x] P3 — End-to-end smoke test script with example artifacts (2026-03-09) — 13 tests in test/smoke.js

## Documentation

- [x] P2 — README updated — current commands, full workflow, compatible agents, usage example (2026-03-09)
- [x] P2 — All design docs translated to English (2026-03-09)
- [x] P2 — Development pipeline directives added to ARCHITECTURE.md — regression policy, impact analysis, version bump policy (2026-03-09)

---

## Closed

- [x] `aitri verify` + `aitri verify-complete` — real test execution gate between Phase 4 and 5 (2026-03-09)
- [x] Phase 5 blocked until verify-complete passes (2026-03-09)
- [x] `04_TEST_RESULTS.json` — TC→pass/fail traceability + FR coverage (2026-03-09)
- [x] Phase 5 receives test results → honest PROOF_OF_COMPLIANCE based on real data (2026-03-09)
- [x] Schema validation in `aitri complete` — `p.validate()` implemented (2026-03-09)
- [x] Phase 1: MUST FRs require type + measurable acceptance criteria (2026-03-09)
- [x] Phase 3: mandatory gates by FR type (2026-03-09)
- [x] Phase 4: Technical Debt Declaration mandatory in manifest (2026-03-09)
- [x] Phase 5: per-FR compliance with levels (2026-03-09)
- [x] Phase 4 SDD capped at 120 lines (anti context explosion) (2026-03-09)
- [x] Remove MCP server — not portable across agents (2026-03-09)
- [x] Remove Claude Code Skill — not portable (2026-03-09)
- [x] Warning to stderr when `.aitri` config is malformed (2026-03-09)
- [x] `flagValue()` bounds check — prevents silent undefined when flag has no value (2026-03-09)
