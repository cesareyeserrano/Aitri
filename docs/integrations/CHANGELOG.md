# Aitri Integration Contract — Changelog

Changes to the `.aitri` schema or artifact schemas that affect subproduct readers.
Subproducts should check this file when upgrading their Aitri reader implementation.

---

## v2.0.0-alpha.3 (2026-04-24) — upgrade findings persistence + rehash command — additive

Third staged pre-release on branch `feat/upgrade-protocol`. Closes the three findings surfaced by the three-canary session (Hub, Ultron, Zombite).

**`.aitri.upgradeFindings[]` — new array field (A1)**
- Populated by `aitri adopt --upgrade` with the flagged findings that diagnose cannot auto-migrate (multi-FR TCs, free-text NFR titles, VALIDATOR-GAPs, etc.). Previously these findings only appeared in the upgrade report output and scrolled past, leaving projects dirty under a "clean" status view.
- Snapshot model: overwritten on every upgrade run. When the agent re-authors the flagged items and a subsequent `adopt --upgrade` produces no findings, the array is cleared automatically. No history semantics — the event log (`.aitri.events[]`) remains the history channel.
- Each entry: `{ target, transform, reason, module, category, recordedAt }`.
- **Subproduct impact:** **additive**. Readers that did not know this field continue to work. Readers that want to surface unresolved upgrade work can render the array directly — count on dashboard, list in detail view.

**`nextActions` — new priority-3 entry: unresolved upgrade findings**
- Emitted once per pipeline whose `upgradeFindings` is non-empty. Command: `aitri resume` (root) or `aitri feature status <name>` (feature). Reason: `"N unresolved upgrade finding(s) in <scope> — artifacts need agent re-authoring"`.
- Sits alongside the existing priority-3 "blocking bugs" entry. Both represent "known-dirty state that must be resolved before pipeline work".
- **Subproduct impact:** Hub and any reader of `status --json`'s `nextActions[]` may observe new priority-3 entries with this shape. Priority ordering is preserved; the new entries never change the priority of existing entries.

**`aitri rehash <phase>` — new CLI command (A5)**
- Updates `artifactHashes[phase]` to match the current artifact content without touching `approvedPhases` / `completedPhases`. Narrow escape hatch for legacy projects where an old Aitri version stored a hash that no longer matches current content, even though the artifact was not modified since its last approval (e.g. a commit that updated the artifact without going through `aitri approve`).
- Guardrails:
  - Refuses if the phase has no stored hash (nothing to rehash).
  - No-op when stored and current hashes already match.
  - Refuses if git is not available (cannot verify cleanness).
  - Refuses if `git diff HEAD -- <artifact>` reports uncommitted changes — in that case `rehash` is the wrong tool, `approve` is (with its cascade).
  - `isTTY`-gated: an agent cannot auto-rehash.
- Also available as `aitri feature rehash <feature> <phase>` for feature sub-pipelines.
- **Subproduct impact:** none directly. Subproducts that observe `artifactHashes[phase]` may see it change on projects where rehash ran; `driftPhases` clears in the same transaction. No schema change.

**`.aitri.events[]` — new event type `"rehash"` (A5)**
- Emitted by `aitri rehash`. Fields: `artifact`, `before_hash`, `after_hash`. No content drift — bookkeeping only.
- **Subproduct impact:** event log is contract-tolerant to unknown types (per SCHEMA.md §"Reader guidance"). Existing readers keep working; consumers that want to render rehash audit trails can filter for `event === "rehash"`.

**`aitri approve` drift prompt — adds rehash hint when git is clean (A5b)**
- When drift is detected but `git diff HEAD -- <artifact>` reports no uncommitted changes, the prompt now suggests `aitri rehash <phase>` as an alternative that preserves downstream phases. Default flow (re-approve with cascade) unchanged if the operator chooses to proceed.
- **Subproduct impact:** cosmetic — affects prompt text only, no contract surface.

**`adopt --upgrade` report — A3 message fix**
- When the upgrade would change only the version string (schema already canonical), the banner now reads `"Schema already on canonical shape — only the version string will change"` instead of the previously ambiguous `"Project is already current — nothing to migrate"` combined with a visible version bump arrow.

---

## v2.0.0-alpha.2 (2026-04-24) — operator ergonomics + `.aitri` contract doc — additive

Second staged pre-release on branch `feat/upgrade-protocol`. No schema field changes — the `.aitri` and artifact schemas are unchanged from alpha.1. Ergonomics and documentation only.

**SCHEMA.md — new section "Should `.aitri` be committed?"**
- Makes the default recommendation explicit (commit `.aitri`) and enumerates the consequences of gitignoring it (Hub change detection breaks, drift baseline is per-machine, approval state is per-machine, `normalizeState.baseRef` references untracked state).
- Documents that the current schema mixes shared state (`approvedPhases`, `artifactHashes`, `events[]`, …) and per-machine state (`lastSession.when`, `normalizeState.lastRun`, `normalizeState.baseRef`) in one file. Explicit trade-off rather than unstated asymmetry.
- **Subproduct impact:** Hub and other consumers MUST NOT treat a missing `.aitri` on a fresh clone as corruption — it is a valid state for projects that chose to gitignore. Updated guidance in the section addresses this directly.
- Tension tracked as [ADR-028](../Aitri_Design_Notes/DECISIONS.md#adr-028--2026-04-24--open-question-aitri-mixes-shared-and-per-machine-state) (open question; `.aitri/local.json` split deferred until a second signal).

**`adopt --upgrade --dry-run` — new CLI flag (safety infrastructure)**
- Runs the full diagnose pipeline and prints the report with `(DRY-RUN — no changes written)` banner and `◻️` markers, without writing artifacts, mutating `.aitri`, appending `upgrade_migration` events, or regenerating agent instruction files.
- **Subproduct impact:** none. Hub and other consumers observe no change — dry-run does not persist anything. Operators can now preview migrations before applying.

**`aitri resume` — brief default + `--full` flag (UX)**
- Default output omits the reference sections (Architecture & Stack Decisions, Open Requirements, Test Coverage, Technical Debt) that duplicate content already in `02_SYSTEM_DESIGN.md` / `01_REQUIREMENTS.json` / `04_TEST_RESULTS.json` / `04_IMPLEMENTATION_MANIFEST.json`. Brief output focuses on "what do I do next": Pipeline State, Last Session, Open Bugs, Health, Next Action.
- `aitri resume --full` restores the full dump (reference material included).
- **Subproduct impact:** none. `aitri resume` is human-consumable text; no subproduct depends on its shape. Contract surfaces (`status --json`, `.aitri`, `spec/`) are unchanged.

**`nextActions` — terminal state: P7 `aitri validate` suppressed on fully-stable projects**
- When `health.deployable === true` AND audit exists AND audit is not stale AND verify is not stale, the P7 "confirm deployment readiness" suggestion is no longer emitted. Consumers should render the priority ladder as-is; when empty, render an "idle" message.
- **Subproduct impact:** Hub and any reader of `status --json`'s `nextActions[]` may observe an empty array on stable projects. Readers should treat empty `nextActions[]` as "no pending work", not as a schema error. The priority ordering of surviving actions is unchanged.

---

## v2.0.0-alpha.1 (2026-04-24) — adopt --upgrade as reconciliation protocol — additive

First staged pre-release of the v2.0.0 upgrade protocol. Shipped on branch `feat/upgrade-protocol` (not merged to main). Governed by ADR-027. Validated against two real brownfield projects: Ultron (v0.1.89 → v0.1.90, drift present) and Aitri Hub (v0.1.89 → v0.1.90, already current). Catalog evidence base remains narrow — third-project canary post-adoption will inform whether to broaden the catalog before promoting to stable.

**`.aitri.events[]` — new event type `upgrade_migration`**
- Emitted once per migration applied by `aitri adopt --upgrade`. Fields: `from_version`, `to_version`, `category` (`blocking` | `stateMissing` | `validatorGap` | `capabilityNew` | `structure`), `target` (artifact filename or `.aitri#<field>` anchor), `transform`, and optional `before_hash` / `after_hash` for artifact writes.
- **Subproduct impact:** the event array gains a type Hub does not yet understand. The contract already requires readers to tolerate unknown event types (see SCHEMA.md "Reader guidance"). No change needed to continue working; Hub can now render upgrade audit trails if it adds a renderer for this type.

**Schema migrations run automatically by `adopt --upgrade`**
- `test_cases[].requirement` → `test_cases[].requirement_id` (single-FR values only; multi-FR comma-separated values are flagged for agent review, never auto-split).
- `non_functional_requirements[].constraint` → `non_functional_requirements[].requirement` (mechanical rename).
- `non_functional_requirements[].title` → `non_functional_requirements[].category` only when `title` is a case-insensitive match of `Performance` | `Security` | `Reliability` | `Scalability` | `Usability`. Free-text titles are flagged, not inferred.
- **Subproduct impact:** projects previously readable only via the v0.1.90 defensive fallback layers (snapshot.js NFR tolerance, TC reader tolerance) will migrate to the canonical shape after an upgrade. Hub's fallback readers continue to work for projects that have not yet run upgrade.

**`.aitri` field backfills run automatically by `adopt --upgrade`**
- `updatedAt`, `lastSession`, `verifyRanAt`, `auditLastAt`, `normalizeState` are stamped when missing and a deterministic source exists (event log, artifact mtime, git HEAD).
- **Subproduct impact:** post-upgrade, projects previously missing these fields expose them. Readers that guarded behind `if (config.X)` now enter the populated branch.

**`artifactHashes[phase]` preserved across shape-only migrations**
- When a shape-only migration rewrites an approved artifact, the stored hash is updated to match the new content. Preserves the approval across the migration (§2 guarantees the agent-approved content did not change, only the serialization). `driftPhases[]` is NOT touched — pre-existing drift stays.
- **Subproduct impact:** Hub's `hasDrift` reads stay consistent across an upgrade. Without this, every migrated project would show drift on every approved phase immediately after upgrade.

**`adopt --upgrade` CLI output — new sections**
- "Schema migrations applied" — per-artifact mechanical changes.
- "Flagged for agent review" — VALIDATOR-GAP findings that require content-level decisions (multi-FR TCs, free-text NFR titles, Phase 1 vagueness).
- Existing sections ("Phases inferred", "Already tracked", agent-files guidance) unchanged.
- **Subproduct impact:** none. Output is for human/agent consumption, not parsed by Hub.

---

## v0.1.90 (2026-04-23) — Brownfield integrity + audit trail — additive

**`03_TEST_CASES.json` — alternative multi-FR shape**
- `test_cases[].frs: string[]` is now recognized as an alternative to `requirement_id: string`. When both are present, `frs` wins. Canonical single-FR shape is still `requirement_id`.
- Additive. No existing field removed, no type changed. Readers that only consume `requirement_id` keep working for single-FR TCs.

**`verify-run` schema precondition**
- New preflight check: if `test_cases[]` is non-empty and no entry exposes `requirement_id` or `frs`, `aitri verify-run` exits with an error before running the test command and before writing `04_TEST_RESULTS.json`. Behavior change only for projects adopted under the legacy v0.1.x schema (`requirement` string).
- **Subproduct impact:** `04_TEST_RESULTS.json` on legacy projects will no longer be overwritten with an all-zeros `fr_coverage`. If a Hub view previously displayed a degraded coverage block for such projects, the stale state on disk will now persist until the project migrates. Migration is manual: rename `requirement` → `requirement_id` on each test case, or use `frs: ["FR-001","FR-002"]` for multi-FR TCs.

**`01_REQUIREMENTS.json` — NFR legacy field tolerance (read-side only)**
- `aitri status --json`, `aitri resume`, and `buildProjectSnapshot()` now surface `openNFRs[].category ?? nfr.title` and `openNFRs[].requirement ?? nfr.constraint`. Reader accommodation only — Phase 1's `validate()` still enforces the canonical `{category, requirement}` fields on new artifacts.
- **Subproduct impact:** none. Hub reads `openNFRs` as produced by the snapshot, which now normalizes the shape.

**`BUGS.json` — audit-trail fields (additive)**
- New optional fields on each bug entry:
  - `fix_commit_sha: string` — git HEAD at the moment of `aitri bug fix`
  - `fix_at: ISO8601` — timestamp paired with `fix_commit_sha`
  - `close_commit_sha: string` — git HEAD at the moment of `aitri bug close`
  - `close_at: ISO8601` — timestamp paired with `close_commit_sha`
  - `files_changed: string[]` — `git diff --name-only fix_commit_sha..close_commit_sha`, filtered to exclude `spec/` and `.aitri`
- All captured automatically when the project is a git repo. In non-git projects the fields are simply absent; the bug lifecycle still works.
- **Subproduct impact:** additive. Consumers that ignored unknown fields continue to work. Hub or future dashboards can now show a per-bug commit-range link and the list of files modified to resolve it.

**`aitri normalize --init`**
- New escape hatch for projects whose Phase 4 was approved before v0.1.80 (when `normalizeState` was introduced). Stamps a baseline at the current state. Refuses to run if Phase 4 is not approved, or if a `normalizeState` already exists (no silent clobber).
- **Subproduct impact:** none on read side. Hub already reads `normalizeState` as-is.

**`aitri validate` — deploy-files output**
- No longer labels `Dockerfile`/`docker-compose.yml` as "required"; warnings like `⚠️ Dockerfile — not found (check Phase 5 output)` are removed. The `validate` output lists existing deploy files and, when none exist, prints a neutral hint about non-containerized targets.
- **Subproduct impact:** the `--json` `deployFiles` shape (`{Dockerfile: bool, "docker-compose.yml": bool, "DEPLOYMENT.md": bool, ".env.example": bool}`) is preserved byte-for-byte. Consumers depending on this shape are unaffected.

**Integration-doc header bump**
- `SCHEMA.md`, `README.md`, `ARTIFACTS.md`, `STATUS_JSON.md` now declare `v0.1.90+`. Enforced by `test/release-sync.test.js`.

---

## v0.1.89 (2026-04-22) — Phase 1 SSoT model — additive

**IDEA.md role formalized as seed-only**
- First Phase 1 run reads `IDEA.md` (the seed brief). After `aitri approve 1` (first time), `IDEA.md` content is absorbed into `01_REQUIREMENTS.json.original_brief` (new optional field) and the `IDEA.md` file is removed from disk.
- All subsequent Phase 1 re-runs use `01_REQUIREMENTS.json` as the SSoT input. The agent refines current FRs instead of regenerating from a stale brief — this closes a real drift class where re-runs silently pruned legitimate FRs that grew organically past the original brief.
- Same pattern for feature sub-pipelines: `aitri feature run-phase <name> 1` materializes `FEATURE_IDEA.md → IDEA.md` only when the feature has no `01_REQUIREMENTS.json` yet.

**New artifact field: `01_REQUIREMENTS.json.original_brief`**
- Type: `string` (full IDEA.md content, verbatim).
- Optional and additive — old readers ignoring unknown fields keep working.
- Historical reference only. Aitri does not read this field for any behavioral decision; it exists for human recovery and future audit tooling.
- Present after first `aitri approve 1` if `IDEA.md` existed at that moment. Absent if the project was approved before v0.1.89 OR if `IDEA.md` was deleted manually before approval.

**Subproduct impact:**
- **Additive.** No schema field removed, no type changed. Hub and other readers need no changes.
- Hub may optionally surface `original_brief` in project detail views (e.g. "Original brief" expandable block).
- The disappearance of `IDEA.md` from disk after first Phase 1 approve is intentional, not a bug. Readers that previously checked `IDEA.md` existence to gauge project maturity should switch to checking `01_REQUIREMENTS.json` (more reliable signal).
- Compliance with the artifacts-as-SSoT invariant: Phase 1's behavior on re-runs now matches the same "current artifact = SSoT" model that Phases 2-5 already follow.

---

## v0.1.87 (2026-04-22) — deploy gate — additive

**New deploy-gate reason: `feature_verify_failed`**
- `computeHealth()` now blocks `deployable` when a feature sub-pipeline at phases 5/5 has `verify.ran && !verify.passed`. WIP features (phases < 5/5) remain independent — a feature still in development must not block root deploy.
- New reason object shape: `{ type: 'feature_verify_failed', message: string, features: string[] }` — `features` lists the offending feature names. Present alongside (not replacing) existing reasons.
- Surfaced via `aitri validate`, `aitri validate --explain`, `aitri validate --json.deployableReasons`, and `aitri status --json.health.deployableReasons`.

**Subproduct impact:**
- **Additive.** Old readers ignoring unknown reason types keep working. No field removed, no type change.
- Readers that enumerate `deployableReasons` should handle `feature_verify_failed` and optionally use its `features[]` field for richer UI. The existing `{ type, message }` contract is preserved — any reader that only formats `message` needs no changes.
- `v0.1.87` also updates `aitri validate` text output to enumerate features + Σ aggregate (shipped in v0.1.86, schema-free rendering-only change).

---

## v0.1.85 (2026-04-22) — bugfix (no schema change)

**Test-output parsers now handle multi-segment TC IDs**
- `parseRunnerOutput`, `parseVitestOutput`, `parsePytestOutput`, `parsePlaywrightOutput` previously truncated IDs like `TC-FE-001h` to `TC-FE`, causing every namespaced automated test to fall silently into `skipped_no_marker`.
- All four parsers now extract the full ID via the new shared `extractTCId()` helper. Single-segment IDs (`TC-001h`, `TC-020b`) unchanged.

**Subproduct impact:**
- None. No schema change. `04_TEST_RESULTS.json` shape, `.aitri.verifySummary`, `status --json.tests` all unchanged.
- Consumer projects with namespaced TC IDs that hit `skipped_no_marker` counts in prior versions should re-run `verify-run` + `verify-complete` per feature to get honest numbers. `.aitri.verifyPassed` persists across verify-runs until `verify-complete` re-runs.

---

## v0.1.84 — addendum (doc correction, no behavior change)

**ARTIFACTS.md sync with code — closing pre-existing drift (2026-04-21)**
- Phase 2 required sections now list 9 (added `Technical Risk Flags`, matching `phase2.js` validate()). Minimum length corrected from 30 to 40 lines.
- Phase 3 `edge_case` clarified as encouraged but not enforced — only `happy_path` and `negative` are strictly required per FR.
- Headers note added: Phase 2 accepts `## Name`, `## 1. Name`, or `## 1.1 Name` prefixes.

**Subproduct impact:**
- No schema change. This is a doc-accuracy correction; the runtime gates have been stricter than the doc claimed since before v0.1.84.
- Subproducts that relied on the doc when deciding whether a Phase 2 artifact "looks complete" should add the `Technical Risk Flags` section to any local heuristic.

---

## v0.1.84

**`aitri normalize --resolve` — maintenance-path closure for normalize cycle (behavior change, not schema change)**
- New flag on existing `aitri normalize` command. Closes the pending state without re-approving Phase 4 (which would cascade-invalidate Phase 5). Intended for maintenance changes classified as `refactor` or already-registered+verified `bug-fix` — i.e. code changes that did not require spec updates.
- Mechanical gates before closure: `verifyPassed === true`, no open critical/high bugs in `BUGS.json`. A non-TTY invocation is rejected when files are detected; with zero detected files the baseline auto-advances.
- Human TTY gate: prints the detected file list and requires explicit `y/N` confirmation that every file is `refactor` or registered `bug-fix`. `fr-change` / `new-feature` / `undetermined` entries must still route through the pipeline.
- Writes `normalize-resolved` event into `.aitri.events[]` with `{ files, method, baseRefFrom, baseRefTo }`.

**Subproduct impact:**
- **Schema unchanged** — `.aitri.normalizeState` shape is identical (`{ status, baseRef, method, lastRun }`). Readers do not need updates.
- **New event type** — `events[]` may now contain entries with `event: 'normalize-resolved'`. Readers that enumerate events should add this to any allow-list.
- **Observable change** — `normalizeState.status` can transition from `pending` → `resolved` without a `approved` phase-4 event preceding it. Consumers that inferred "normalize resolved ⇒ phase 4 re-approved" must drop that assumption.
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.84` after reviewing.

---

## v0.1.82

**Phase 1 validation — stricter semantic checks on requirements (behavior change, not schema change)**
- MUST FRs with a fully-vague title (e.g. `"La app debe funcionar correctamente"`, `"System must work properly"`) now fail `aitri complete 1`. Rule: title matches `BROAD_VAGUE` regex AND has <2 substantive tokens after stopword/vague-word removal. Bilingual EN/ES vocabulary.
- Pairs of FRs (any priority) with ≥3 acceptance_criteria each and ≥90% Jaccard similarity on normalized AC sets now fail validation. Detects copy-paste across FRs.
- `BROAD_VAGUE` regex extended to cover Spanish qualifiers (`correctamente`, `adecuadamente`, `eficientemente`, etc.).

**Subproduct impact:**
- **Schema unchanged** — `01_REQUIREMENTS.json` shape is identical. Readers that parse the artifact do not need updates.
- **Constraint tightened** — existing projects whose requirements have vague titles or duplicated ACs will fail the phase gate after upgrading. Those projects should re-approve Phase 1 after the author differentiates titles/ACs. Legacy already-approved artifacts are not re-validated retroactively.
- [ARTIFACTS.md](./ARTIFACTS.md) updated with the two new rules under "01_REQUIREMENTS.json — Validation rules".
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.82` after reviewing.

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
