# Aitri Integration Contract — Changelog

Changes to the `.aitri` schema or artifact schemas that affect subproduct readers.
Subproducts should check this file when upgrading their Aitri reader implementation.

---

## v0.1.74

**`aitri tc verify` — record manual TC execution results**
- New command: `aitri tc verify <TC-ID> --result pass|fail --notes "..."`
- Updates `04_TEST_RESULTS.json` in place: sets `status` to `pass|fail`, adds `verified_manually: true`, `verified_at` timestamp
- Manually verified TCs count toward `summary.passed` — total score reflects reality
- Syncs `.aitri` `verifySummary` so `aitri resume` shows updated numbers immediately
- `verify-run`: preserves `verified_manually: true` entries on re-run — manual verifications are not wiped by a subsequent automated test run
- New `summary.manual_verified` field: how many manual TCs have been recorded
- Display updated: `Manual: N/N verified` (was just `Manual: N`)

**Subproduct impact:** `04_TEST_RESULTS.json` now has `summary.manual_verified` and result entries may have `verified_manually: true` + `verified_at` fields. `summary.passed` now includes manually-verified passing TCs.

---

## v0.1.72

**`04_TEST_RESULTS.json` — manual TC support**
- New `status` value: `"manual"` — TCs with `automation: "manual"` in `03_TEST_CASES.json` are excluded from the automated runner gate; they receive `status: "manual"` instead of `"skip"`
- New `summary.manual` field: count of manual TCs in each run
- New `fr_coverage[].tests_manual` field: count of manual TCs per FR
- New `fr_coverage[].status` value: `"manual"` — for FRs whose TCs are all manual
- `verify-complete` no longer blocks on manual TCs: they are excluded from skip checks, notes requirements, and the "zero passing tests" gate
- `verify-run`: auto-detects `.venv/bin/pytest` (or `venv/bin/pytest`) if bare `pytest` command is used — fixes silent skip-all on Python virtualenv projects
- `verify-run` / `feature verify-run` / `feature verify-complete` added to `aitri feature` sub-commands

**Subproduct impact:** consumers of `04_TEST_RESULTS.json` should treat `"manual"` as a distinct status (not equivalent to `"skip"`). FR coverage `status: "manual"` means human-verified, not untested.

---

## v0.1.71

**`aitri audit` — on-demand code & architecture audit**
- New command: `aitri audit` generates an evaluative briefing; agent writes `AUDIT_REPORT.md`
- New sub-command: `aitri audit plan` reads `AUDIT_REPORT.md` and proposes Aitri actions (`bug add`, `backlog add`) for each finding
- New persona: `auditor` — meta-persona (not phase-bound, like `adopter`); evaluative, not generative
- New artifact: `AUDIT_REPORT.md` — optional, off-pipeline (three sections: Findings → Bugs, Findings → Backlog, Observations)
- No pipeline changes: AUDIT_REPORT.md does not affect validate, approve, or drift detection

---

## v0.1.70

**`.aitri` schema: `lastSession` field added**
- New optional field `lastSession` in `.aitri` — session checkpoint written automatically by `complete`, `approve`, `verify-run`, `verify-complete`, `feature init`, and `checkpoint`
- Schema: `{ at, agent, event, context?, files_touched? }`
- Agent auto-detected from environment variables (claude, codex, gemini, opencode, cursor)
- `aitri resume` now shows "Last Session" section with this data
- Subproducts can read `lastSession.at` for "last activity" and `lastSession.event` for "what happened last"

**Agent instruction files: multi-agent support**
- `aitri init` and `aitri adopt` now generate instruction files for multiple agents: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/instructions.md`
- All files have identical content sourced from `templates/AGENTS.md`
- Non-destructive: never overwrites existing files

---

## v0.1.67

**`aitri bug` — first-class QA artifact (redesign from v0.1.66 prototype)**
- Bug artifact promoted from utility to first-class artifact with full schema formalization
- `BUGS.json` schema: `id, title, description, steps_to_reproduce[], expected_result, actual_result, environment, severity, status, fr, tc_reference, phase_detected, detected_by, evidence, reported_by, created_at, updated_at, resolution`
- Lifecycle: `open → fixed → verified → closed` (`in_progress` status removed)
- `detected_by`: `"manual"` | `"verify-run"` | `"playwright"` | `"review"`
- `reported_by`: `"aitri"` (auto) or arbitrary string from `--reported-by` flag
- Blocking rule: `status: "open"` + `severity: "critical"` or `"high"` blocks `verify-complete`
- Playwright evidence: auto-populated from `test-results/<folder>/screenshot.png` on TC failure

**No `.aitri` schema changes in v0.1.67.**

---

## v0.1.66

**New artifact: `BUGS.json`**
- New optional artifact in `<artifactsDir>/BUGS.json` (same dir as `spec/`).
- Written by `aitri bug add` (manual) or prompted by `aitri verify-run` on test failure.
- Schema: `id, title, description, steps_to_reproduce[], expected_result, actual_result, environment, severity, status, fr, tc_reference, phase_detected, detected_by, evidence, reported_by, created_at, updated_at, resolution`
- Lifecycle: `open → fixed → verified → closed`
- Blocking rule: `status=open` + `severity=critical|high` → blocks `verify-complete`
- Playwright integration: `evidence` auto-populated from `test-results/` on test failure
- Subproducts can read `BUGS.json` directly — not registered in `.aitri` state

**New commands (no `.aitri` schema change):**
- `aitri review` — cross-artifact semantic consistency check (req→TC, TC→results)
- `aitri bug` — full bug lifecycle with `add`, `fix`, `verify`, `close`, `list`
- `adopt verify-spec` — brownfield TC stub generator for existing codebases

**`verify-run` behavior change:**
- On test failure with TTY: prompts `Register as bugs? [y/N]` — auto-populates from runner output
- Playwright failures: `detected_by: "playwright"`, `evidence` from `test-results/` if available
- `autoVerifyBugs`: transitions `fixed → verified` when linked TC passes

**`.aitri` schema:** no new fields in v0.1.66.

---

## v0.1.64

**Breaking for subproducts relying on Aitri auto-registration:**
- `aitri init` and `aitri adopt --upgrade` no longer write to `~/.aitri-hub/projects.json`.
- Hub and other subproducts must manage their own project registries independently.
- Existing `~/.aitri-hub/projects.json` entries are unaffected; only new project creation stops auto-registering.

**New documentation:**
- `docs/integrations/` directory introduced as canonical integration contract.
- `docs/integrations/README.md` — integration model overview.
- `docs/integrations/SCHEMA.md` — consolidates and supersedes `docs/HUB_INTEGRATION.md`.
- `docs/integrations/ARTIFACTS.md` — artifact schemas including node hierarchy for graph consumers.
- `docs/integrations/CHANGELOG.md` — this file.
- `docs/HUB_INTEGRATION.md` — removed. Content migrated to `docs/integrations/SCHEMA.md`.

---

## v0.1.63

- `complete` now updates `artifactHashes` (previously only `approve` did).
  Hash check returns `false` after successful `complete` — no drift until next modification.
- `aitriVersion` field formalized. Version mismatch detection pattern documented.
- `verifyPassed`, `verifySummary`, `rejections` fields formally added to schema.
- Event schema updated: `"started"` added as valid event type; `afterDrift` on `"approved"` events.
- Feature sub-pipelines (`features/<name>/`) documented.

## v0.1.58

- `driftPhases[]` field added. Written by `run-phase` on drift; cleared by `complete`/`approve`.
- Subproducts can use `driftPhases[]` as fast path for drift detection.
- `driftPhases[]` may be absent in projects created before v0.1.58 — fall back to hash check.

## v0.1.51

- Document initial. Fields `artifactHashes`, `events`, `artifactsDir` formalized.
- Drift detection via hash comparison documented.
- Hub integration contract established.

## v0.1.46

- `aitri init` began auto-registering projects in Hub (removed in v0.1.64).

## v0.1.45

- `events[]` field added to schema (pipeline activity log).
