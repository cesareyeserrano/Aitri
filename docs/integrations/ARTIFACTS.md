# Aitri — Artifact Schema Reference

**Aitri version:** v2.0.0-rc.126+
**Maintenance rule:** Update this file in the same commit as any artifact schema change.
**Schema source of truth:** `lib/phases/phase1.js` – `phase5.js` `validate()` functions. This document must match what those functions enforce.

All artifacts live in `<project>/<artifactsDir>/`. For projects created by rc.76+ (contained layout, LAYOUT-1) `artifactsDir = "aitri/product/spec"`; for rc.75-and-earlier projects `"spec"`.
Check `artifactsDir` in `.aitri` before constructing paths. See [SCHEMA.md](./SCHEMA.md).

**Industry-terminology map** (v2.0.0-rc.32+, [ADR-039](../DECISIONS.md)) — the Aitri file names are a public contract and are NOT renamed, but they map to standard vocabulary: `IDEA.md` ≈ project brief/vision · `00_DISCOVERY.md` ≈ product discovery / problem statement · `01_REQUIREMENTS.json` ≈ **PRD / SRS** · `01_UX_SPEC.md` ≈ UX / design spec · `02_SYSTEM_DESIGN.md` ≈ **TRD / SDD** · `03_TEST_CASES.json` ≈ test plan · `05_TRACEABILITY.json` ≈ compliance / traceability report. `aitri help` shows the same map.

---

## 01_REQUIREMENTS.json

Written by Phase 1 (PM persona). Flat structure — no epics or nested feature hierarchies.

```json
{
  "project_name": "string",
  "project_summary": "string",
  "functional_requirements": [
    {
      "id": "FR-001",
      "title": "string",
      "priority": "MUST | SHOULD | COULD | WONT",
      "type": "string (e.g. security, ux, visual, logic, reporting, persistence, constraint)",
      "description": "string",
      "acceptance_criteria": [
        "string — observable criterion; MUST FRs of type ux/visual/audio must include a measurable metric"
      ]
    }
  ],
  "user_personas": [
    {
      "id": "UP-001",
      "name": "string",
      "description": "string"
    }
  ],
  "user_stories": [
    {
      "id": "US-001",
      "requirement_id": "FR-001",
      "as_a": "string",
      "i_want": "string",
      "so_that": "string",
      "acceptance_criteria": [
        {
          "id": "AC-001",
          "description": "string"
        }
      ]
    }
  ],
  "non_functional_requirements": [
    {
      "id": "NFR-001",
      "category": "string (e.g. Performance, Security, Reliability, Scalability, Usability, Regression)",
      "requirement": "string",
      "acceptance_criteria": "string"
    }
  ],
  "no_go_zone": "string[] — items explicitly OUT of scope. Phase 2 (architecture), Phase 3 (tests), and Phase 4 (build) all read this to NOT design, test, or build those items. Gated since v2.0.0-rc.119: minimum 3 items for root pipelines, minimum 1 for feature sub-pipelines.",
  "constraints": ["string"],
  "technology_preferences": ["string"],
  "idea_provenance": "object (optional, v2.0.0-rc.4+) — provenance of the five Tier-A seed inputs. Keys: problem, users, baseline, success_metric, no_go_zone. Each value is \"confirmed\" (the human stated/approved it) or \"assumed\" (the agent inferred it). Required by the gate on a fresh seed; historical once Phase 1 is approved.",
  "idea_provenance_sources": "object (optional, v2.0.0-rc.45+) — per-field source of each Tier-A input. Same keys as idea_provenance; each value a short string of where the value came from (e.g. \"IDEA.md\", \"user confirmed\", \"inferred from product type\"). Surfaced at approve so a weak source stands out; a \"confirmed\" field with no source is warned (not blocked). Additive — old readers ignore it.",
  "idea_gaps": "string[] (optional, v2.0.0-rc.4+) — tracked gaps for assumed Tier-A inputs. Each entry references the assumed field by key, e.g. \"baseline: no current metric — confirm with owner\". Also accepted nested as project_summary.idea_gaps.",
  "coverage_map": "array<{need, disposition}> (v2.0.0-rc.124+, ADR-060) — the agent's idea→requirement decomposition made explicit: one entry per distinct need found in the seed, with `disposition` = the FR/NFR id that covers it OR \"out_of_scope\" (reason in no_go_zone). Required by the gate on a fresh seed (skipped once Phase 1 is approved — historical thereafter). Additive for readers (old readers ignore it). Consumed by `aitri audit requirements`, which diffs its own independent re-derivation of the needs against this map to surface a silently-dropped need.",
  "original_brief": "string (optional, v0.1.89+) — full content of the seed brief (IDEA.md) absorbed at first approve of Phase 1. Since v2.0.0-rc.80 (ADR-050) the file is MOVED to the unit's archive/ folder — never deleted (pre-rc.80 versions deleted it). Historical reference only — never read by Aitri or downstream phases for behavioral decisions."
}
```

**Validation rules (enforced by `aitri complete 1`):**
- Required fields: `project_name`, `functional_requirements`, `user_stories`, `non_functional_requirements`
- Minimum 5 `functional_requirements`; minimum 3 `non_functional_requirements` — **root pipelines only.** Feature sub-pipelines are increments and have a lower floor: minimum 2 FRs / 1 NFR (a real 4-FR feature was being blocked by the greenfield floor). Consumers validating feature artifacts must use the feature floor
- `no_go_zone` must be a non-empty array — minimum 3 items for root pipelines, minimum 1 for feature sub-pipelines (v2.0.0-rc.119+). The PM persona declared an explicit out-of-scope list mandatory ("ambiguous scope is a defect") and the templates teach ≥3, but before rc.119 nothing enforced it — an empty/missing `no_go_zone` passed `complete 1`, leaving Phases 2/3/4 with no scope boundary to honor. The same feature-floor logic as the FR/NFR minimums applies so small increments aren't forced to invent filler
- `coverage_map` must be a non-empty array on a fresh seed (v2.0.0-rc.124+, ADR-060); each entry needs a non-empty `need` string and a `disposition` that is either `"out_of_scope"` or an existing FR/NFR id. **Light structural gate by design** — it checks that what the agent listed is internally consistent, NOT that the list is complete (the agent fills it, so a never-surfaced need is absent here too). Completeness is the job of the independent `audit requirements` comparison, not this gate. Skipped once Phase 1 is approved (sealed seed → no migration; existing approved projects never trip it)
- Every FR and NFR must have a non-empty string `id`, unique within each list (v2.0.0-rc.26+). The id is the join key — phase 3 ties each TC to one via `requirement_id`/`frs`, phase 5 demands a compliance entry per MUST id. A missing id collapsed to an `undefined` key downstream; a duplicate silently masked one requirement's coverage. Format (`FR-xxx`/`NFR-xxx`) stays a convention; downstream keys on membership, not the prefix.
- All MUST FRs must have a `type` field and at least one `acceptance_criteria` entry
- An NFR with `category: "Regression"` is treated as a hard MUST regardless of its `priority` (v2.0.0-rc.104+, REG-GATE-0621). A regression NFR is a Must-Not-Break commitment, so it must have a test case (Phase 3) and a compliance entry (Phase 5) even when `priority` is absent. Before rc.104 `category` was display-only and such an NFR silently escaped both gates. Consumers that surface MUST requirements should apply the same rule, matching `category` case- and whitespace-insensitively (v2.0.0-rc.110+): `priority === "MUST" || category?.trim().toLowerCase() === "regression"`
- **Structured AC ids** (v2.0.0-rc.48+, [ADR-041](../DECISIONS.md) option A) — when `user_stories[].acceptance_criteria` entries are structured objects (`{ id, text }`), every such `id` must be a non-empty string and **unique across all user stories**. It is the finer join key that `03_TEST_CASES.json#test_cases[].ac_id` traces to and that `04_TEST_RESULTS.json#ac_coverage` rolls up on; a duplicate masks one criterion's AC-level coverage. Enforced **only** when structured ACs are present — plain-string ACs and projects with none are unaffected (additive).
- MUST FRs of type `ux`, `visual`, or `audio` must include at least one criterion with a measurable metric (e.g. pixels, ms, %, contrast ratio)
- All MUST FRs where every AC is purely vague (e.g. "works properly", "runs smoothly") will fail validation
- MUST FRs whose `title` is fully vague (matches qualifier like "properly"/"correctly"/"correctamente" with <2 substantive tokens remaining after stopword/vague-word removal) will fail validation (v0.1.82+)
- Any pair of FRs (regardless of priority) with ≥3 acceptance_criteria each and ≥90% Jaccard similarity on their AC sets will fail validation — copy-paste of ACs is an anti-pattern (v0.1.82+)
- `user_personas` missing → non-fatal warning (not blocked)
- `original_brief` (v0.1.89+) is additive — not validated, present only after first approve of Phase 1; safe to ignore for old readers
- **Seed-input provenance gate (v2.0.0-rc.4+)** — on a *fresh seed* (Phase 1 not yet in `approvedPhases[]`), `idea_provenance` is required: all five Tier-A keys present, each `"confirmed"` or `"assumed"`, and every `"assumed"` field carried in `idea_gaps`. Once Phase 1 is approved the seed is sealed and the gate is skipped on re-runs — existing approved projects do not break on upgrade. `idea_provenance` / `idea_gaps` are additive and safe to ignore for old readers.

**Phase 1 input handling (v0.1.89+; archive semantics v2.0.0-rc.80+, ADR-050):**
- **First run** (no `01_REQUIREMENTS.json` yet): the agent reads the seed brief as input — `<layoutRoot>/product/IDEA.md` for contained projects (rc.76+), `IDEA.md` at the project root for legacy flat ones (features: `FEATURE_IDEA.md` in the feature dir).
- **Re-runs** (`01_REQUIREMENTS.json` exists and parses): the agent reads the current `01_REQUIREMENTS.json` as the SSoT and refines it. The seed file is irrelevant by design — never reloaded.
- **Archive on first approve**: `aitri approve 1` (first time) absorbs the seed into `01_REQUIREMENTS.json.original_brief` and MOVES the file to the unit's `archive/` folder (rc.80+ — never deleted; pre-rc.80 versions deleted it). Subsequent re-runs cannot drift against a stale brief because the brief no longer exists as a live input; `archive/` is a historical record consumers should ignore.
- **Reset to seed**: delete `01_REQUIREMENTS.json` (the `original_brief` field preserves the seed text for manual recovery).

**Phase gate:** Approved when `"1"` is in `approvedPhases[]`.

---

## 02_SYSTEM_DESIGN.md

Written by Phase 2 (Architect persona). Markdown document — no fixed JSON schema.

**Required sections** (validated by `aitri complete 2`):
- Executive Summary — architecture decisions with justification
- System Architecture — component diagram or description
- Data Model
- API Design
- Security Design
- Performance & Scalability
- Deployment Architecture
- Risk Analysis (minimum 3 risks)
- Technical Risk Flags — must have content (declare `[RISK]` flags or write "None detected" with justification)

Headers accept plain (`## Name`), integer (`## 1. Name`), or decimal (`## 1.1 Name`) prefixes.

**Minimum length:** 40 lines.
**Phase gate:** Approved when `"2"` is in `approvedPhases[]`.

---

## 03_TEST_CASES.json

Written by Phase 3 (QA persona). Test cases keyed to FRs, user stories, and acceptance criteria.

```json
{
  "test_plan": {
    "strategy": "string",
    "coverage_goal": "string",
    "test_types": ["unit", "integration", "e2e"]
  },
  "test_cases": [
    {
      "id": "TC-001h",
      "title": "string",
      "requirement_id": "FR-001",
      "user_story_id": "US-001",
      "ac_id": "AC-001",
      "type": "unit | integration | e2e",
      "scenario": "happy_path | edge_case | negative",
      "priority": "string",
      "preconditions": ["string"],
      "steps": ["string"],
      "expected_result": "string — specific, observable outcome (placeholder values like 'it works' are rejected)",
      "test_data": {},
      "given": "string",
      "when": "string",
      "then": "string",
      "automation": "auto | manual (optional, default auto)",
      "manual_reason": "string (optional) — why this TC can't be automated"
    }
  ]
}
```

**Validation rules (enforced by `aitri complete 3`):**
- Required: `test_plan`, `test_cases` (non-empty)
- TC `id` values must be unique across `test_cases[]` (v2.0.0-alpha.13+) — duplicates break downstream cardinality (`summary.manual` = Set size vs `results.length` = array length)
- TC `id` values must be **canonical** (v2.0.0-rc.16+): `TC` + optional UPPERCASE namespace segments + a numeric block + suffix — e.g. `TC-001h`, `TC-E2E-001h`, `TC-API-USER-010f`. Ids without a numeric block (`TC-e2eFolderScan`) or with a lowercase namespace (`TC-fe-001h`) are rejected. Rationale: `verify-run` links a parsed runner-output id to a plan id by string equality, so any id the shared parser cannot round-trip would silently drop to `skip`. The grammar is shared between the parser and this gate (`lib/tc-id.js`), so the two cannot drift.
- `type` must be: `unit` | `integration` | `e2e`
- `scenario` must be: `happy_path` | `edge_case` | `negative`
- Each TC must have: `requirement_id` (or `frs[]`) and `user_story_id`. `ac_id` is **conditional** (v2.0.0-rc.36+, ADR-041): required only when `01_REQUIREMENTS.json` provides structured acceptance criteria (`user_stories[].acceptance_criteria` as `{ id, text }` objects); when ACs are plain strings, `ac_id` is optional
- `expected_result` must not be a placeholder (`"it works"`, `"passes"`, `"succeeds"`, etc.)
- Each FR must have a minimum of 3 TCs, with at least one `happy_path` and one `negative` scenario (edge_case is encouraged but not enforced)
- Each FR must have at least one TC with id ending in `h` (happy path) and one ending in `f` (failure)
- Minimum 2 `e2e` test cases total
- `requirement_id` must be a single id from `01_REQUIREMENTS.json` — either a functional requirement (`FR-xxx`) or a non-functional requirement (`NFR-xxx`). NFR ids are accepted as TC targets when the NFR is declared in `non_functional_requirements[]` (v2.0.0-alpha.9+). Comma-separated ids are rejected.
- For multi-FR TCs, use `"frs": ["FR-001","FR-002"]` (string array) instead of a comma-separated `requirement_id`. `frs` is recognized by `aitri verify-run` (v0.1.90+) AND, since v2.0.0-rc.26, by `aitri complete 3` — a TC may carry `frs` instead of `requirement_id`, and `complete 3` buckets it into each targeted FR for the per-FR + FR-MUST coverage rules (it used to reject any TC without `requirement_id`, making the documented `frs` form uncompletable). When present, `frs` wins over `requirement_id` in both. Each TC must target at least one of `requirement_id` or a non-empty `frs[]`.
- If `01_REQUIREMENTS.json` has structured AC ids: TC `ac_id` values are required and cross-checked against the ids in `user_stories[].acceptance_criteria` (the error lists the valid ids). If ACs are plain strings, `ac_id` is optional and any declared values are not validated (an informational note is emitted). All MUST requirements (FR or NFR, v2.0.0-rc.27+) must have at least one TC — where "MUST" also covers any NFR with `category: "Regression"` regardless of priority (v2.0.0-rc.104+).
- `verify-run` (v0.1.90+) refuses to run and refuses to write `04_TEST_RESULTS.json` if `test_cases[]` is non-empty and no entry exposes `requirement_id` or `frs` (legacy `requirement` field alone is not enough; migrate explicitly).
- **`automation` / `manual_reason`** (optional, `manual_reason` v2.0.0-rc.92+) — `automation: "manual"` (set by `aitri tc mark-manual` or authored directly) excludes the TC from the automated runner gate. `manual_reason` is the additive, **non-blocking** justification for why it can't be automated; the guided `aitri tc verify` checklist shows it and flags manual TCs that lack one (so a reviewer can tell a justified manual test from skipped automation). Neither field is validated by `complete 3`; old readers ignore them. **`downgraded_from`** (optional, v2.0.0-rc.110+) — set by `mark-manual` when it converts a TC the runner already reported as `fail`/`skip`; it records the prior verdict so a reviewer (and the guided `tc verify` checklist) can see an automation downgrade. `mark-manual` requires `--reason` for such a conversion (ADV-0622-05).

**TC naming convention:** suffix `h` = happy path (e.g. `TC-001h`), `f` = failure/negative (e.g. `TC-001f`), `e` = edge case (e.g. `TC-001e`).

**Phase gate:** Approved when `"3"` is in `approvedPhases[]`.

---

## 04_BUILD_REPORT.json

Written by Phase 4 (Developer persona). Implementation tracking and test runner config.

```json
{
  "files_created": ["path/to/new-file.js"],
  "files_modified": ["path/to/existing-file.js"],
  "setup_commands": ["npm install", "npm run build"],
  "environment_variables": [
    { "name": "DATABASE_URL", "default": "postgres://localhost/dev" }
  ],
  "technical_debt": [
    {
      "fr_id": "FR-001",
      "substitution": "specific description of what was simplified — generic values like 'none' or 'n/a' are rejected"
    }
  ],
  "test_runner": "npm test",
  "test_files": ["tests/unit.test.js"],
  "quality_gates": [
    { "name": "lint",      "command": "eslint .",    "required": true },
    { "name": "typecheck", "command": "tsc --noEmit", "required": true },
    { "name": "audit",     "command": "npm audit --audit-level=high", "required": false }
  ]
}
```

**`quality_gates`** (optional, v2.0.0-rc.21+) — code-quality checks Aitri runs and gates on, beyond test execution. Two entry shapes: a **command gate** `{ name?, command, required?, timeout_ms? }` (`verify-run` runs `command`, exit-code judged: 0 = pass — `eslint .`, `tsc --noEmit`, `ruff check .`, `mypy src`, `go vet ./...`, `gosec ./...`) — a command gate runs **without a shell** (`shell:false`), so `command` must be a single executable plus arguments; shell operators (`&&`, `||`, `;`, `|`, redirects, globs) are NOT interpreted (they become literal arguments and only the first program runs), so a multi-step gate such as a smoke gate that boots the app then probes it must live in a script file the gate invokes (`./smoke.sh`), or a **coverage gate** `{ name?, threshold, required? }` (a numeric `threshold` 0–100 instead of a command — `verify-run` measures line coverage via the same stack-aware mechanism as `--coverage-threshold` and passes when `measured ≥ threshold`). Outcomes recorded in `04_TEST_RESULTS.json#quality_gates`. `required` defaults to `true`; a failing `required` gate (a command gate whose tool is missing → `error`, or an unmeasurable coverage gate → `error`) resets `verifyPassed` and blocks `verify-complete`. `required: false` gates are surfaced but never block (gradual adoption). Aitri never bundles analyzers — the project declares its own tools (orchestrate-don't-bundle, ADR-037). Absent ≡ no gates (behavior unchanged). A command gate may carry **`timeout_ms`** (optional, v2.0.0-rc.103+) — a per-gate timeout in milliseconds (default `300000` = 5 min) for slow gates such as **mutation testing** (the only mechanical signal that catches a fake pass — a test green without exercising real code), full integration, or e2e suites; without it they would be killed at the default and mis-reported. A gate killed at its timeout is recorded `status: "error"`. `verify-run` also emits a one-line nudge when a project has automated tests but declares no mutation gate (opt-in, advisory, never blocks — ADR-053).

**Validation rules (enforced by `aitri complete 4`):**
- `quality_gates`, when present, must be an array; each entry needs a non-empty `command` string (or a numeric `threshold` for a coverage gate); `required` (if present) must be boolean; `timeout_ms` (if present) must be a positive number. Absent → non-blocking note nudging the agent to declare them.
- `setup_commands` and `environment_variables` are optional. When present they must be arrays; when absent they are treated as `[]`. (v2.0.0-alpha.9+ — earlier versions required the keys to be present even when empty.)
- At least one of `files_created` or `files_modified` must be a non-empty array — supports both greenfield (new files only) and modification/redesign work
- `technical_debt` field is required — use `[]` if no substitutions were made
- Each `technical_debt` entry must have `fr_id` and a non-generic `substitution`
- `test_runner` is required (e.g. `"npm test"`, `"node --test tests/"`) — **except** in manual-verification mode (see below)
- `test_files` must be a non-empty array listing all files with `@aitri-tc` markers — same manual-mode exception; entries are flat string paths (objects are rejected)
- **Manual-verification mode (v2.0.0-rc.86+):** when every `03_TEST_CASES.json` test case is `automation: "manual"`, the project has no automated runner by design, so `test_runner` and `test_files` are **optional** in `04_BUILD_REPORT.json`. A reader must therefore treat both as possibly-absent on a manual-mode build (do not assume `test_runner` is always a string). With any automated test case present, both stay required as before.

**Phase gate:** Approved when `"4"` is in `approvedPhases[]`.

---

## 04_TEST_RESULTS.json

Written by `aitri verify-run`. Never written by the agent — always auto-generated from real runner output.

```json
{
  "executed_at": "ISO 8601 timestamp",
  "test_runner": "string — exact command run (e.g. 'pytest tests/ -v')",
  "runner_override": { "used": "string — the --cmd value actually run", "manifest_runner": "string|null — what 04_BUILD_REPORT.json declared" },
  "exit_code": 0,
  "results": [
    {
      "tc_id": "TC-001h",
      "status": "pass | fail | skip | manual",
      "notes": "string",
      "known_gap": true,
      "verified_manually": true,
      "verified_at": "ISO 8601 timestamp",
      "evidence": "relative path to a runner result file / evidence log (optional)"
    }
  ],
  "fr_coverage": [
    {
      "fr_id": "FR-001",
      "tests_passing": 2,
      "tests_failing": 0,
      "tests_skipped": 0,
      "tests_manual": 0,
      "status": "covered | partial | uncovered | manual"
    }
  ],
  "ac_coverage": [
    {
      "ac_id": "AC-001",
      "fr_id": "FR-001",
      "tests_passing": 1,
      "tests_failing": 0,
      "tests_skipped": 0,
      "tests_manual": 0,
      "status": "covered | partial | uncovered | untested"
    }
  ],
  "summary": {
    "total": 10,
    "passed": 8,
    "failed": 0,
    "skipped": 1,
    "skipped_e2e": 1,
    "skipped_no_marker": 0,
    "manual": 1,
    "manual_verified": 0
  },
  "line_coverage": 87.5,
  "low_confidence_tcs": [
    { "tc_id": "TC-004", "file": "test/foo.test.js", "assertCount": 1 }
  ],
  "quality_gates": [
    { "name": "lint", "command": "eslint .", "required": true, "status": "pass", "exit_code": 0 },
    { "name": "typecheck", "command": "tsc --noEmit", "required": true, "status": "fail", "exit_code": 2, "output": "…last 600 chars of stdout+stderr…" }
  ]
}
```

**`test_runner` / `exit_code`** — the exact command run and its exit code. **Manual-seed mode (v2.0.0-rc.95+):** when every TC is `automation: "manual"` (root scope), `verify-run` seeds the results without launching a runner, so **both are `null`** (nothing ran — they are not fabricated to `"npm test"`/`0`). A reader must accept `test_runner: null` and `exit_code: null` as well as their normal string/number forms. `fr_coverage` is recomputed when `aitri tc verify` records a result (rc.95+), so after manual verification it agrees with `summary` rather than reflecting only the verify-run snapshot.

**`runner_override`** (optional, v2.0.0-rc.117+, ADV-0622-36) — present **only** when `verify-run --cmd "<command>"` substituted the whole runner AND that command differs from `04_BUILD_REPORT.json#test_runner`. Shape `{ used, manifest_runner }`: the command actually run vs the manifest's declared runner. Surfaces that the deploy-gate evidence came from an operator-supplied command, not the committed manifest — informational, never a gate (`--cmd` is a legitimate escape hatch for venv/env-specific runners). Absent on a normal run.

**`line_coverage`** (optional, v2.0.0-rc.9+) — measured line-coverage percentage, present only when `verify-run` was invoked with `--coverage-threshold` AND a recognized runner emitted a parseable figure. Stack-agnostic: node built-in `--coverage`, `go test -cover`, `pytest --cov`, `jest`/`vitest --coverage`. Absent when no threshold was requested or the runner's coverage output could not be parsed.

**`ac_coverage`** (optional, v2.0.0-rc.48+, [ADR-041](../DECISIONS.md) option A) — per-acceptance-criterion coverage, the finer-grained companion to `fr_coverage`. Present **only** when `01_REQUIREMENTS.json` declares structured acceptance criteria (`user_stories[].acceptance_criteria` as `{ id, text }` — `description` is also accepted as the text field); absent otherwise, so string-AC and legacy projects are unaffected. Each entry: `{ ac_id, fr_id, tests_passing, tests_failing, tests_skipped, tests_manual, status }`. `status` adds one value over `fr_coverage`: **`untested`** — no test case references this criterion via `ac_id` at all (the headline signal: "FR-001 is covered, but AC-001-3 has no test"). `verify-run` lists `untested`/`uncovered` criteria in its output, and (v2.0.0-rc.49+) `verify-complete` **blocks** on them: when structured ACs are present, every declared criterion must have a passing test to reach Phase 5 — the finer-grained companion to the uncovered-FR gate. Declaring structured ACs is itself the opt-in; string-AC and legacy projects write no `ac_coverage` and are unaffected.

**`low_confidence_tcs`** (v2.0.0-rc.9+) — TCs whose test block contains ≤1 assertion (possible trivial test). Always present (possibly `[]`). Each entry: `{ tc_id, file, assertCount }`. Informational by default; becomes a hard gate in `verify-complete` only when the project sets `strictAssertions: true` in `.aitri` (see SCHEMA.md).

**`quality_gates`** (optional, v2.0.0-rc.21+) — per-gate code-quality results, present only when the manifest declares `quality_gates`. A command-gate entry: `{ name, command, required, status: "pass"|"fail"|"error", exit_code: number|null, output?: string }` (`status: "error"` = tool not found / ENOENT). A coverage-gate entry: `{ name, threshold, measured: number|null, required, status }` (`status: "error"` when `measured` is null — coverage could not be parsed). A `required` gate that is not `pass` blocks `verify-complete` and resets `verifyPassed`. `output` (command gates) is the last ~600 chars of stdout+stderr. Tests verify behavior; these verify the code is well-built (lint/type-check/security/coverage). See ADR-037.

**`summary` counts** (v2.0.0-rc.20+) — `passed`/`failed`/`skipped`/`manual` are all counted by per-result `status`, so `passed + failed + skipped + manual === total`. `skipped_e2e` + `skipped_no_marker` partition `skipped`. `manual` counts results still awaiting manual verification (status `manual`); a manual TC that a human verified via `aitri tc verify` carries its verdict (`pass`/`fail`) and is counted there, with `manual_verified` reporting how many manual TCs were verified. (Before rc.20 `manual` was a declared-manual count that overlapped `passed`/`failed`.)

**This `summary` object is the canonical shape** — `verify-complete` persists it verbatim into `.aitri#verifySummary`, and `status --json` re-emits it as the synthetic `verify` phase entry's `verifySummary`. SCHEMA.md and STATUS_JSON.md reference this definition rather than redefining it.

**Status values:**
- `pass` — TC detected in runner output as passing
- `fail` — TC detected in runner output as failing
- `skip` — TC not detected in runner output (missing marker or requires browser)
- `manual` — TC has `automation: "manual"` in `03_TEST_CASES.json`; excluded from automated runner gate

**FR coverage status values:**
- `covered` — ≥1 passing automated test
- `partial` — mix of pass/fail, or only skipped TCs
- `uncovered` — only failing tests, no passing
- `manual` — the FR's results are all *pending* manual TCs (seeded by verify-run, not yet verified; 0 passing). A *verified* manual TC carries `status: "pass"` → the FR becomes `covered`. A pending-manual MUST FR **is** blocked by verify-complete (see Notes).

**Notes:**
- `known_gap: true` is written by `verify-complete` when a stub TC (from `adopt verify-spec`) is acknowledged as a gap
- A *verified* manual TC counts as a pass; a *pending* manual TC (status `manual`) does not, and does not count toward skip percentage
- A MUST FR is **not** exempt from the "zero passing tests" gate because its TCs are manual — a *pending* manual TC has 0 passing and blocks. Verify it with `aitri tc verify` (→ `status: "pass"` → `covered`). The `ac_coverage` gate behaves the same: a pending-manual acceptance criterion is reported `untested`/`uncovered`, not satisfied. (Fixed in v2.0.0-rc.109; previously a pending manual TC was wrongly treated as covered — a verification-spine false-pass.)
- **`verified_manually` / `verified_at` / `evidence`** (optional, `evidence` v2.0.0-rc.85+) — written by `aitri tc verify`. `verified_manually: true` + `verified_at` mark a result a human recorded (preserved across re-runs of `verify-run`). `evidence` is the relative path passed to `tc verify --evidence` — the escape hatch that lets an **automated** TC whose runner output Aitri could not parse be recorded against a real on-disk artifact (a TRX/JUnit-XML file or evidence log) instead of being pre-declared manual. All three are additive and absent on auto-parsed results.

---

## 05_TRACEABILITY.json

Written by Phase 5 (DevOps persona). FR coverage proof linking requirements to test results.

```json
{
  "project": "string",
  "version": "string",
  "phases_completed": ["1", "2", "3", "4"],
  "overall_status": "compliant | partial | draft",
  "requirement_compliance": [
    {
      "id": "FR-001",
      "level": "placeholder | functionally_present | partial | complete | production_ready",
      "evidence": "string",
      "tc_ids": ["TC-001h", "TC-001f"]
    }
  ]
}
```

**Validation rules (enforced by `aitri complete 5`):**
- Required fields: `project`, `version`, `phases_completed`, `requirement_compliance` (non-empty), `overall_status`
- `overall_status` must be: `compliant` | `partial` | `draft`
- `level` must be: `placeholder` | `functionally_present` | `partial` | `complete` | `production_ready`
- `level: "placeholder"` blocks the pipeline — placeholder implementations cannot be shipped
- Entries use field `id` (not `fr_id`) — a common mistake; validation will report the mismatch
- If `01_REQUIREMENTS.json` is present: every requirement (FR or NFR, v2.0.0-rc.27+) with `priority: "MUST"` — or any NFR with `category: "Regression"` regardless of priority (v2.0.0-rc.104+) — must have an entry in `requirement_compliance`
- **Claim-vs-evidence (v2.0.0-rc.13+):** if `04_TEST_RESULTS.json` is present, any entry with `level` `complete` or `production_ready` must have `fr_coverage` status `covered` (or `manual`) for that FR. An entry claiming a high level over `partial`/`uncovered` evidence is rejected — the proof must not over-claim past the tests. (Conservative: only fires when the coverage entry exists and contradicts.)

**Phase gate:** Approved when `"5"` is in `approvedPhases[]`. Requires `verifyPassed: true`.

---

## BUGS.json

**Written by:** `aitri bug add` (manual) or `aitri verify-run` (auto-prompt on test failure).
**Location:** `<artifactsDir>/BUGS.json` — same directory as other artifacts.
**Optional:** absent until the first bug is registered.

First-class QA artifact. Follows standard bug report format: reproduction steps, expected/actual results, environment, evidence. Integrates with the verify pipeline: `verify-run` auto-promotes `fixed → verified` when the linked TC passes. Critical/high bugs that are still active (status `open` or `in_progress`) block `verify-complete`, `reconcile --resolve`, and the deploy gate (aligned v2.0.0-rc.110+; before that `verify-complete`/`reconcile` checked `open` only, diverging from the deploy gate).

```json
{
  "bugs": [
    {
      "id": "BG-001",
      "title": "string — action + result",
      "description": "string",
      "steps_to_reproduce": ["string"],
      "expected_result": "string",
      "actual_result": "string",
      "environment": "string (e.g. 'local / chromium / Phase 4')",
      "severity": "critical | high | medium | low",
      "status": "open | in_progress | fixed | verified | closed",
      "fr": "FR-XXX | null",
      "tc_reference": "TC-XXX | null",
      "phase_detected": "number | null",
      "detected_by": "manual | verify-run | playwright | review",
      "evidence": "relative path to screenshot/video/log | null",
      "reported_by": "string | null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "resolution":       "string | null",
      "fix_commit_sha":   "string (optional, v0.1.90+) — HEAD at the moment of `aitri bug fix`",
      "fix_at":           "ISO8601 (optional, v0.1.90+) — timestamp paired with fix_commit_sha",
      "close_commit_sha": "string (optional, v0.1.90+) — HEAD at the moment of `aitri bug close`",
      "close_at":         "ISO8601 (optional, v0.1.90+) — timestamp paired with close_commit_sha",
      "files_changed":    "string[] (optional, v0.1.90+) — paths modified between fix_commit_sha..close_commit_sha, excluding Aitri-owned state (artifacts dir, the contained-layout container, .aitri*, node_modules, and feature sub-pipeline artifacts — the shared isAitriStatePath filter; widened in rc.82, was spec/+.aitri only)"
    }
  ]
}
```

**Lifecycle:** `open → fixed → verified → closed`
- `fixed`: developer marks resolved (`aitri bug fix`) — optionally links a TC. If the project is a git repo, `fix_commit_sha` + `fix_at` are captured automatically.
- `verified`: auto-set by `verify-run` when linked TC passes, or manually via `aitri bug verify`
- `closed`: archived. If the project is a git repo, `close_commit_sha` + `close_at` are captured. When both `fix_commit_sha` and `close_commit_sha` are present and differ, `files_changed` records the diff (filtered through the shared `isAitriStatePath`: excludes the artifacts dir, the contained-layout container, `.aitri*`, `node_modules`, and feature sub-pipeline artifacts — rc.82; previously `spec/`+`.aitri` only).

**Audit trail (v0.1.90+):** the fix/close SHA pair plus `files_changed` provides a non-honor-system record of which commit range resolved each bug. Missing if the project has no git repo or HEAD is unreadable — behaviour degrades silently, lifecycle still works.

**Blocking rule:** bugs that are active (`status: "open"` or `"in_progress"`) with `severity: "critical"` or `"high"` block `verify-complete`, `reconcile --resolve`, and the deploy gate (aligned v2.0.0-rc.110+).
**Playwright integration:** when Playwright runs in `verify-run` and a TC fails, `evidence` is auto-populated from `test-results/<folder>/screenshot.png` if the folder exists.

---

## Optional artifacts

| File | Written by | Condition |
|---|---|---|
| `00_DISCOVERY.md` | `aitri run-phase discovery` | Optional phase; present if discovery was run |
| `01_UX_SPEC.md` | `aitri run-phase ux` | Optional phase; present if UX phase was run |
| `04_CODE_REVIEW.md` | `aitri review` | Present if code review was run |
| `BUGS.json` | `aitri bug add` / `aitri verify-run` | Present if any bug has been registered |
| `BACKLOG.json` | `aitri backlog add` | Present if any backlog item has been registered |
| `AUDIT_REPORT.md` | `aitri audit` / `aitri audit requirements` / `aitri audit security` | Present if an on-demand audit has been run. `audit requirements` (formerly `audit coverage`, still a working alias) appends a "Requirements Coverage" section (idea→FR completeness); `audit security` appends a "Security" section (RQ-SEC remediation requirements) |

Check `approvedPhases[]` and `completedPhases[]` in `.aitri` to determine which optional artifacts exist before attempting to read them.

---

## BACKLOG.json

**Written by:** `aitri backlog add` (manual).
**Location:** `<artifactsDir>/BACKLOG.json`.
**Optional:** absent until the first backlog item is registered.

Project-level tech-debt / deferred-work registry. Separate from `BUGS.json` — backlog captures "we should do this" items (refactors, hardening, observability, follow-ups), while bugs capture defects.

```json
{
  "schemaVersion": "1",
  "items": [
    {
      "id": "BL-001",
      "title": "string",
      "priority": "P1 | P2 | P3",
      "problem": "string — what is missing, fragile, or suboptimal",
      "fr_id": "FR-XXX (optional) — linked requirement",
      "files": "string (optional, v2.0.0-rc.50+) — affected files",
      "behavior": "string (optional, v2.0.0-rc.50+) — what changes (inputs/outputs/rules)",
      "decisions": "string (optional, v2.0.0-rc.50+) — trade-offs already resolved",
      "acceptance": "string (optional, v2.0.0-rc.50+) — how to verify it works",
      "status": "open | closed",
      "createdAt": "ISO8601",
      "closedAt": "ISO8601 (present once closed)"
    }
  ]
}
```

**Lifecycle:** `open → closed` (via `aitri backlog done <id>`).
**Priority:** `P1` (most urgent) through `P3` (least). Sort order for `aitri backlog list`.
**Detail fields** (v2.0.0-rc.50+): `files` / `behavior` / `decisions` / `acceptance` are optional Entry-Standard fields — set via `aitri backlog add --files/--behavior/--decisions/--acceptance` and shown by `aitri backlog show <id>`. They make an item self-contained (implementable later without re-deriving context); absent on items that did not set them (additive — old readers and old items are unaffected).
**Field-name correction** (v2.0.0-rc.50): this schema previously documented `fr`/`created_at`/`updated_at`; the code has always written `fr_id`/`createdAt`/`closedAt`. The table above now matches the code. No data change — a documentation fix.
**Integration:** `openBacklogCount` surfaces in `aitri status` and `aitri status --json`.

---

## AUDIT_REPORT.md

**Written by:** agent (instructed by `aitri audit` briefing). **Not** written by Aitri Core.
**Read by:** `aitri audit plan` (generates action plan from findings). Hub may surface it.
**Optional:** off-pipeline artifact — no pipeline phase depends on it. Never blocks validate, approve, or drift detection.

This file is produced on demand at any point in the pipeline. It contains the agent's findings from a holistic technical audit of the codebase across five dimensions: code quality, architecture, logic, security, and stack.

Required sections (exact headings):

```markdown
### Findings → Bugs
Each entry:
  **[BUG-N]** `[severity: critical|high|medium|low]` — Title
  - File: `path/to/file.js:line`
  - Problem: what is broken or incorrect
  - Suggested: `aitri bug add --title "..." --severity [severity] --description "..."`

### Findings → Backlog
Each entry:
  **[BL-N]** `[priority: P1|P2|P3]` — Title
  - File: `path/to/file.js` (if file-specific)
  - Problem: what is missing, fragile, or suboptimal
  - Suggested: `aitri backlog add --title "..." --priority P[N] --problem "..."`

### Observations
Each entry:
  **[OBS-N]** — Title
  - Context: where this applies
  - Concern: what risk or implication this represents
  - Why deferred: reason it is an observation rather than a bug or backlog item
```

Findings that map to bugs should be promoted to `BUGS.json` via `aitri bug add`. Findings that map to tech debt should be promoted to `BACKLOG.json` via `aitri backlog add`. Observations remain in AUDIT_REPORT.md as awareness items.

Optional sections appended by the audit sub-commands (v2.0.0-rc.83+):

```markdown
### Requirements Coverage   ← appended by `aitri audit requirements` (alias: `audit coverage`) (ADR-048)
Each gap: **[GAP-N]** `[UNCOVERED|PARTIAL]` — the client need, its source, and the suggested scope action.

### Security                ← appended by `aitri audit security` (ADR-051)
Coverage statement (surfaces audited: static / runtime), then each finding:
  **[RQ-SEC-NNN]** `[P0|P1|P2]` — Title
  - Severity + attack scenario · Evidence · Acceptance criteria · Suggested implementation
Plus a proposed quality_gate verification script (the permanent re-check for `verify`).
```

Subproducts that surface AUDIT_REPORT.md can detect these headings to show coverage/security findings separately. The freshness signals are `coverageAuditLastAt` / `securityAuditLastAt` in `.aitri` (see SCHEMA.md) — prefer them over file mtime, which resets on git clone.

---

## 06_EXTERNAL_SIGNALS.json

**Written by:** external tools (ESLint, npm audit, GitLeaks, Snyk, custom scripts — anything). **Not** written by Aitri Core.
**Read by:** Hub (surfaces signals as alerts). Other subproducts may ignore this file.
**Optional:** if absent or malformed, no signals are generated — no crash.

This file is the integration point for tools that Hub cannot run directly (static analysis, dependency auditing, security scanning, etc.). Each tool writes its findings here; Hub reads them as-is.

```json
{
  "generatedAt": "2026-03-18T14:00:00Z",
  "signals": [
    {
      "tool":     "eslint",
      "type":     "code-quality",
      "severity": "warning",
      "message":  "15 lint errors found in src/",
      "command":  "npm run lint"
    },
    {
      "tool":     "npm-audit",
      "type":     "dependency",
      "severity": "blocking",
      "message":  "2 critical vulnerabilities in dependencies",
      "command":  "npm audit fix"
    },
    {
      "tool":     "gitleaks",
      "type":     "security",
      "severity": "blocking",
      "message":  "Possible secret detected in src/config.js:42",
      "command":  "gitleaks detect"
    }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `generatedAt` | ISO8601 string | No | When the tool ran — for freshness display |
| `signals` | array | Yes | Empty array = no signals |
| `signals[].tool` | string | Yes | Tool name shown in Hub alert (e.g. `"eslint"`) |
| `signals[].type` | string | Yes | Category label (e.g. `"code-quality"`, `"security"`, `"dependency"`) |
| `signals[].severity` | string | Yes | `"blocking"` \| `"warning"` \| `"info"` — invalid values coerced to `"warning"` |
| `signals[].message` | string | Yes | Human-readable description — shown as alert message |
| `signals[].command` | string | No | Command to resolve the issue — shown as inline code badge in Hub |

### How Hub renders signals

Each signal becomes one alert in Hub's health report:
- `severity: "blocking"` → appears in BLOCKING section, blocks triage
- `severity: "warning"` → appears in WARNING section
- `severity: "info"` → appears in INFO section
- Message is prefixed with `[tool]` — e.g. `[eslint] 15 lint errors found in src/`
- `command` shown as a copyable badge if present

### Integration examples

**npm audit (package.json script):**
```json
"scripts": {
  "hub:signals": "node scripts/generate-signals.js"
}
```

**Minimal shell script:**
```bash
#!/bin/bash
RESULT=$(npm audit --json 2>/dev/null)
CRITICAL=$(echo "$RESULT" | jq '.metadata.vulnerabilities.critical // 0')
cat > spec/06_EXTERNAL_SIGNALS.json << EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "signals": [
    {
      "tool": "npm-audit",
      "type": "dependency",
      "severity": $([ "$CRITICAL" -gt 0 ] && echo '"blocking"' || echo '"warning"'),
      "message": "$CRITICAL critical vulnerabilities",
      "command": "npm audit fix"
    }
  ]
}
EOF
```

Run this script in CI or as a pre-commit hook. Hub picks it up on the next poll cycle.

---

## Node hierarchy for visualization consumers

Aitri artifacts form a natural hierarchy for visualization (used by Hub and any future visual consumer):

```
FR (FR-xxx)  [priority, type]
  ├── Acceptance Criteria (AC-xxx) — within user_stories[].acceptance_criteria
  ├── User Story (US-xxx) → links to FR via requirement_id
  └── Test Case (TC-xxx) → links to FR via requirement_id, AC via ac_id
```

State of each node is derived from `.aitri`:
- Phase 1 approved → FR nodes are `approved`
- Phase 1 in drift → FR nodes are `drift`
- Phase 3 approved → Test Case nodes are `approved`
- Current phase matches → node is `in_progress`
- Otherwise → `pending`
