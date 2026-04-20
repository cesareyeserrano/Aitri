# Aitri Integration Contract — Changelog

Changes to the `.aitri` schema or artifact schemas that affect subproduct readers.
Subproducts should check this file when upgrading their Aitri reader implementation.

---

## v0.1.81

**`aitri status --json` — new top-level `tests` block (additive)**
- New `tests` object aggregates test counts across root + all feature sub-pipelines. Shape: `{ totals: { passed, failed, skipped, manual, total }, perPipeline: [{ scope, passed, failed, total, ran }], stalenessDays }`. See [STATUS_JSON.md](./STATUS_JSON.md#tests-v0181) for semantics.
- Each pipeline's own `verify.summary` is preserved unchanged — `tests` is an additive projection so consumers don't re-implement cross-pipeline aggregation.

**CLI text output — `Σ all pipelines` aggregate**
- `aitri status` and `aitri resume` now show a `Σ all pipelines` line with combined `passed/total` when at least one feature has a verify summary. Per-feature verify indicator now includes test counts: `verify ✅ (42/42)`.
- Closes the real-world gap where `aitri status` showed `30/30` for the root pipeline while features had ~256 additional tests invisible to the top-line view.

**Subproduct impact:**
- Purely additive — readers that ignore unknown JSON fields need no changes.
- Hub-style dashboards can now surface a global test-count without walking `features[]` and summing `verifyPassed` entries.
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.81` after reviewing.

---

## v0.1.80

**`aitri status --json` — new top-level `normalize` block (additive)**
- New `normalize` object exposes the off-pipeline change baseline plus a snapshot-time detection. Shape: `{ state, method, baseRef, uncountedFiles }`. See [STATUS_JSON.md](./STATUS_JSON.md#normalize) for semantics.
- `nextActions[]` priority 4 now also fires when `normalize.uncountedFiles > 0` (git baseline, resolved state) — same `aitri normalize` command, distinct reason text. Closes the gap where users who never ran `aitri normalize` got no nudge despite changing code outside the pipeline.

**`aitri approve` — informed human review (UX, no schema change)**
- Approval prompt now prints a per-phase artifact summary (FR/AC counts, TC breakdown, manifest stats, compliance levels, design sections) before the y/N gate. Non-TTY path (CI/agents) unchanged.

**Subproduct impact:**
- Purely additive — readers that ignore unknown JSON fields need no changes.
- Hub may surface `normalize.uncountedFiles > 0` in dashboards as an early signal of off-pipeline drift (complement to `health.driftPresent` which only covers approved-artifact drift).
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.80` after reviewing.

---

## v0.1.79

**`.aitri` schema — `verifyRanAt` and `auditLastAt` (additive)**
- `verifyRanAt` (ISO 8601 string) — written by every `aitri verify-run` invocation, regardless of pass/fail. Closes the gap left in v0.1.77 where `status --json health.staleVerify` was reserved-but-empty.
- `auditLastAt` (ISO 8601 string) — written by `aitri audit`. Replaces fragile `fs.statSync(AUDIT_REPORT.md).mtimeMs` for the staleness signal — file mtime resets when a project is freshly cloned, producing false "stale audit" signals. Snapshot still falls back to mtime when `auditLastAt` is absent (legacy projects).
- `verifyTimestamp` (set on `verify-complete` only, undocumented in earlier versions) removed — it was never read by any consumer and was superseded by `verifyRanAt` which is set on every run.

**`aitri status --json` — populated previously-reserved fields**
- `health.staleVerify` now lists pipelines whose persisted `verifyRanAt` is older than 14 days: `[ { "scope": "root | feature:<name>", "days": N } ]`. Empty when no pipeline has a `verifyRanAt` yet (legacy or never-verified projects), or when all are within the threshold.
- `tests.stalenessDays` (root pipeline) now returns an integer instead of always `null`. `null` only when the root has never run `verify-run` on v0.1.79+.
- `audit.lastAt` prefers persisted `auditLastAt`; falls back to file mtime only for legacy projects or audits written off-CLI.

**Subproduct impact:**
- **Hub and other remote consumers:** purely additive — readers that ignore unknown `.aitri` fields need no changes. If you previously surfaced "audit stale" using mtime, switch to `auditLastAt` when present and you'll stop getting false positives after fresh clones.
- **`status --json` consumers:** `health.staleVerify` now returns objects, not an empty array (its prior reserved shape). Treat as additive.
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.79` after reviewing.

---

## v0.1.77

**`aitri status --json` — unified project snapshot (new surface)**
- New CLI surface documented in [STATUS_JSON.md](./STATUS_JSON.md): `aitri status --json` emits an aggregated projection covering root + feature sub-pipelines, health signals, and a priority-ordered next-action list.
- Single source of truth for the CLI's `status`, `resume`, and `validate` commands — they are now thin projections over `buildProjectSnapshot()`.
- Legacy `status --json` fields preserved (`project`, `dir`, `phases`, `driftPhases`, `nextAction`, `allComplete`, `inHub`, `rejections`, `versionMismatch`, `aitriVersion`, `cliVersion`).
- New top-level fields: `snapshotVersion`, `features[]`, `bugs`, `backlog`, `audit`, `health`, `nextActions[]`.
- `health.deployable` + `health.deployableReasons[]` — deploy-gate reasoning now consistent across all three commands (previously `status` suggested `aitri validate` when phase 4 was approved without checking verify, while `resume` correctly gated on `verifyPassed`).

**`aitri validate --json` — additive fields**
- Added top-level `deployable`, `deployableReasons[]`, `openBugs`, `blockingBugs`. Existing fields (`artifacts[]`, `allValid`, `deployFiles`, `setupCommands`) unchanged.

**`aitri validate --explain` — new flag**
- Expanded text output that enumerates deploy-gate reasons (passing or blocking) inline.

**`aitri resume` — feature awareness**
- New `## Features` section lists each feature sub-pipeline with its progress, verify state, drift flag, and per-feature next action.
- New `## Health` section (shown when project has progress but is not deployable) enumerates blocking reasons.
- Next Action section now shows a priority-ordered list (up to 5 actions), not a single command.

**Subproduct impact:**
- **Hub and other remote (GitHub-URL) consumers:** no action required — the `.aitri` + artifact file contract is unchanged. `status --json` is additive and only reachable via the local CLI.
- **CLI-colocated consumers (IDE plugins, local dashboards):** may now consume `aitri status --json` directly instead of re-deriving aggregation logic from raw files. See [STATUS_JSON.md](./STATUS_JSON.md).
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.77` after reviewing changes. No reader changes required for remote consumers.

---

## v0.1.76

**`04_IMPLEMENTATION_MANIFEST.json` — `files_modified` field added**
- New optional field `files_modified: []` — list of existing files changed during implementation
- Gate changed: `files_created` OR `files_modified` must be non-empty (previously only `files_created`)
- Enables modification/redesign phases where no new files are created
- `files_created` is no longer a required field — omit if work only modified existing files

**Subproduct impact:** `04_IMPLEMENTATION_MANIFEST.json` may now have `files_modified` instead of (or in addition to) `files_created`. Readers should handle both fields.

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
