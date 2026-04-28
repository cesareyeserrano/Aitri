# Aitri — Backlog

> Open items only. Closed items are in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

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

> Ecosystem items (Hub, Graph, future subproducts) live in their own repos' backlogs.
> Core only tracks items that require changes to Aitri Core itself.

### Core — v2.0.0 — `adopt --upgrade` as reconciliation protocol (shipped in alpha.1 + alpha.2 + alpha.3, pending promotion)

Governed by [ADR-027](DECISIONS.md#adr-027--2026-04-23--adopt---upgrade-as-reconciliation-protocol-v200) + five-point addendum. `.aitri` schema asymmetry tracked separately as [ADR-028](DECISIONS.md#adr-028--2026-04-24--open-question-aitri-mixes-shared-and-per-machine-state).

**Status 2026-04-24 (alpha.3):** `v2.0.0-alpha.3` staged on `feat/upgrade-protocol`. Three real canaries passed across alphas 1–3: Ultron (modern drift, 21 migrations + 8 flags), Aitri Hub (already current), Zombite (legacy drift at v0.1.70, 2 state backfills + feature with legacy hash drift resolved via new `rehash` command). Alpha.3 added `.aitri.upgradeFindings[]` persistence (A1), `aitri rehash <phase>` escape hatch (A5) + `approve` drift-prompt hint (A5b), and A3 banner clarification. Catalog of supported drift classes now covers: modern schema drift, state backfills across v0.1.65 → v0.1.82, and legacy hash bookkeeping (via rehash, not as a migration).

**Promotion to stable v2.0.0 gated on:** a third-project canary (external adopter) runs cleanly, OR evidence motivates catalog expansion. Default path is direct promotion; alphas 2–4 collapsed into alpha.1 + alpha.2 because the ADR's original staging (one category per alpha) turned out to be unnecessary — all categories shipped together without regression.

#### What shipped in alpha.1

- [x] **Module `lib/upgrade/`** — `runUpgrade` + `diagnose.js` composer + `migrations/from-0.1.65.js`.
- [x] **`adopt --upgrade` as thin dispatcher** — no upgrade logic in `lib/commands/adopt.js` after refactor.
- [x] **BLOCKING:** TC `requirement` → `requirement_id` (single-FR only; multi-FR flagged); NFR `{title, constraint}` → `{category, requirement}` (constraint rename mechanical; title-to-category via finite lookup); artifactsDir recovery.
- [x] **STATE-MISSING:** `updatedAt`, `lastSession`, `verifyRanAt`, `auditLastAt`, `normalizeState` backfills (field-presence gated, deterministic sources only).
- [x] **VALIDATOR-GAP** (report-only): v0.1.82 Phase 1 title vagueness + all-vague ACs + duplicate AC pairs. Uses shared regex source in `lib/phases/phase1-checks.js`.
- [x] **Option B:** shape-only migrations update `artifactHashes[phase]` to preserve approval across the upgrade. Post-upgrade `aitri status` shows no drift on migrated phases.
- [x] **Clean-project UX:** `✅ Project is already current — nothing to migrate.` replaces the noisy "Already tracked" list when no work fires.
- [x] **Event type `upgrade_migration`** in `.aitri.events[]` with `before_hash`/`after_hash` for artifact writes (absent for state backfills). Documented in `docs/integrations/SCHEMA.md`.
- [x] **ADR-027 addendum §4** (approval preservation) + **§5** (coverage gate NOT implemented, by decision).

#### Shipped in alpha.2 (2026-04-24)

- [x] **`adopt --upgrade --dry-run`** — shipped. Safety infrastructure confronted after Hub canary required manual tar-copy to `/tmp/` to simulate preview. `--yes`, `--only`, `--verbose` remain deferred (no adopter asked).
- [x] **`aitri resume` brief default + `--full` flag** (FEEDBACK F8) — shipped. Primary entry-point command no longer dumps 200+ lines of reference material on stable projects.
- [x] **Terminal-state next-action** (FEEDBACK F11) — shipped. P7 `aitri validate` suppressed when deployable + fresh audit + fresh verify.
- [x] **`.aitri` commit-vs-gitignore contract doc** (FEEDBACK H3) — shipped in SCHEMA.md + ADR-028. No code change; explicit contract.

#### Shipped in alpha.3 (2026-04-24)

- [x] **A1 — `.aitri.upgradeFindings[]` persistence** — flagged upgrade findings now survive the upgrade report and drive a priority-3 next-action until resolved. Rendered in `resume` (brief warning section) and `status` (count line). Snapshot model — cleared on next clean upgrade run.
- [x] **A5 — `aitri rehash <phase>`** (+ `aitri feature rehash`) — escape hatch for legacy hash drift where artifact content matches HEAD but stored hash is stale. Updates the hash in place without cascading invalidation to downstream phases. Clean-git gate + isTTY gate.
- [x] **A5b — `approve` drift prompt hints at `rehash` when git is clean** — helps operators pick the right tool for bookkeeping-only drift.
- [x] **A3 — Upgrade "already current" banner clarified** when version is bumping on a no-migration run.

#### Deferred out of alpha.1 / alpha.2 / alpha.3 (by decision)

- [ ] **A2 — Features sub-pipelines not upgraded by root `adopt --upgrade`** — evidence stands (Zombite's `stabilizacion` feature kept `aitriVersion: null` after root upgrade). Reconsidered for alpha.3 and deferred: implementing it requires deciding whether migrations apply per-scope (root-only vs cascading to features) and how diagnose composes findings across scopes. Not a point-release change. Re-open for v2.0.0 pre-stable or v2.0.1.
- [ ] **CLI flags** `--yes`, `--only <categories>`, `--verbose` — not implemented. No adopter asked; re-open when one does. (`--dry-run` landed in alpha.2.)
- [ ] **Corte E — CAPABILITY-NEW + STRUCTURE** — `files_modified` advisory, bug audit trail advisory, agent-files regen (already inherited from Corte A), `original_brief` archival, case-mismatch detection. None have evidence of needed; all are preventive. Re-open when a canary surfaces a concrete case.
- [ ] **`test/upgrade-coverage.test.js` gate** — explicitly NOT written. Rationale in ADR-027 addendum §5.
- [ ] **Smoke test E2E in `test/smoke.js`** — optional, unit tests + three real canaries cover current shape. Re-open if a non-trivial upgrade path lacks coverage.
- [ ] **`.aitri/local.json` split** — tracked in ADR-028 as open question. One real signal (Hub) is insufficient; need a second before taking the breaking-change hit.

#### Dropped from v2.0.0 breaking batch (by decision)

- [ ] **`IDEA.md` → `spec/` move** — dropped 2026-04-23. Not motivated by "keep projects current" (the ADR intent); was opportunistic colado in the breaking-version window. Re-open with its own evidence.
- [ ] **Phase 3 canonical TC id regex** — dropped 2026-04-23. Still waiting for the second evidence case that was the original gate; forcing it through the v2 batch inverted the evidence-before-breakage logic.
- [ ] **Command-surface audit outcomes** — remains a Design Study below. No trigger.

### Core — alpha.7 canary findings (Ultron 2026-04-28)

Canary on v2.0.0-alpha.7 validated the grammar fix end-to-end (6/6 emissions copy-paste literal, no regression of alpha.6's inverted-order bug). Five secondary findings surfaced — none are blockers, none are destructive. Each tracked separately.

- [ ] **P2 — Manifest schema drift between briefing (lists fields as optional) and validator (rejects when missing).**

  Evidence: Ultron canary on Phase 4 with skeleton manifest. Validator rejected sequentially on: `setup_commands` missing, `environment_variables` missing, `test_files` empty. The build briefing ([templates/phases/build.md](../../templates/phases/build.md)) presents these fields as optional (`{ files_created:[], files_modified:[], setup_commands:[], environment_variables:[{name, default}], ... }` reads as a shape, not a contract). Agent following the briefing literally produces an artifact the validator rejects three times in a row.

  Files: `lib/phases/phase4.js` `validate()` for the actual gate; `templates/phases/build.md` for the briefing shape. One must align with the other.

  Decision pending: relax validator to accept empty `setup_commands` + `environment_variables`, OR update briefing to mark them required. Empty-but-required is also acceptable if the briefing says so. Lean toward (a) — these fields are scaffolding, not behavioral. A project with no env vars or no setup is legitimate.

  Acceptance: a manifest with only `files_created` + `test_runner` + `technical_debt` either (a) passes validate() with a documentation update, or (b) fails with a single error message that lists ALL missing fields at once, not three sequential errors.

- [ ] **P2 — `aitri feature verify-run` runs tests from project root, picks up parent project tests too.**

  Evidence: Ultron canary on `network-monitoring` feature. `verify-run` executed `go test ./...` from `cwd = /Ultron` (parent), recording 78 skipped tests — 52 of which were the parent project's own tests with `no marker detected`. Did not contaminate counts in this case (0 TCs auto-detected anyway), but a feature whose TC ids overlap with the parent's would inflate or deflate results unpredictably.

  Files: [lib/commands/verify.js:355-360](../../lib/commands/verify.js#L355-L360) `spawnSync` uses `cwd: featureRoot || dir`. For feature scope, `featureRoot` is the parent — so it runs FROM the parent. That's the bug.

  Behavior options:
    - (a) Run from `dir` (feature dir) instead of `featureRoot` for feature scope. Tests local to the feature get picked up; parent's tests are excluded by default.
    - (b) Keep current behavior but require `test_runner` in feature manifest to include a path filter (`go test ./internal/network/... -v`).
    - (c) Detect feature scope and inject a path filter automatically based on `files_created` paths in the manifest.

  Lean toward (a). Simplest, most predictable. Feature pipelines own their own test scope. If a feature needs to test something at the parent level, it can override `test_runner`.

  Acceptance: feature canary run on a project where parent has a `_test.go` file with a TC-ID that matches a feature TC-ID — verify-run picks the FEATURE's test, not the parent's, and the parent's TC is reported as "not in feature scope" (or simply not seen).

- [ ] **P2 — Go runner output not parsed by `aitri verify-run`.**

  Evidence: Ultron canary. Go test output uses `--- PASS: TestName (0.01s)` and `--- FAIL: TestName (0.02s)` — the existing parsers in `verify.js` cover Vitest (`✓/×`), Jest (`✓/✕`), pytest (`PASSED/FAILED`), node:test/mocha (`✔/✖`), Playwright (`✓ N tests/path > TC-XXX`). Go is the gap. A test like `TestTC_NM_001h` would print `--- PASS: TestTC_NM_001h` which today is auto-classified as skip → verify-complete blocks on 0 passing tests.

  Files: `lib/commands/verify.js` parsers (around line 87+). Add a `parseGoOutput()` matching `^--- (PASS|FAIL): Test(?:TC[_-])?(\w+)` and feeding into the same pipeline.

  Naming convention: `TestTC_001h` or `TestTC001h` — the `Test` prefix is mandatory in Go. The parser needs to strip it and recognize the canonical TC id pattern.

  Decision: ship Go parser. Document the test naming convention in the build briefing and `templates/phases/tests.md` ("Go: `func TestTC_001h(t *testing.T)` — the Test prefix is mandatory; the parser strips it"). Without this, Go projects under Aitri are second-class citizens.

  Acceptance: a Go project with `func TestTC_NM_001h(t *testing.T) { ... }` runs through `aitri verify-run` → `04_TEST_RESULTS.json` shows `tc_id: "TC-NM-001h"`, `status: "pass"`. Test in `test/commands/verify.test.js` parameterized over Go output.

- [ ] **P3 — Upgrade banner does not warn that in-flight briefings emitted by an older Aitri are still cached in agent terminals.**

  Evidence: Ultron canary tried `aitri feature network-monitoring complete 4` (literal copy from a briefing emitted by alpha.6 before the upgrade). Failed with `Feature "complete" not found`. The fix in alpha.7 is forward-only — it corrects future emissions, but cannot reach back into the agent's terminal context to refresh stale briefings.

  Files: [lib/upgrade/](../../lib/upgrade/) — banner emission. When upgrade transition is from alpha.6 (or earlier) to anything newer, append a one-line warning: `If you have any open agent terminals with cached briefings, re-run aitri run-phase <phase> to refresh — older briefings emitted commands in a different grammar.`

  Decision: scope-tighten the warning. Most upgrades don't need it. Trigger condition: `before.semver < 2.0.0-alpha.7 && after.semver >= 2.0.0-alpha.7`.

  Acceptance: `adopt --upgrade` from a project pinned to alpha.6 emits the warning. From a project pinned to alpha.7 → alpha.8, no warning.

- [ ] **P3 — `aitri feature verify-run --cmd` flag may not be wired (unverified).**

  Evidence: canary noted that root `aitri verify-run --cmd "..."` works but the feature sub-help does not list `--cmd`. Not tested. If the feature dispatch passes through to `cmdVerifyRun` then `--cmd` should be honored automatically — but the help string in `feature.js` USAGE doesn't document it.

  Files: [lib/commands/feature.js](../../lib/commands/feature.js) USAGE block.

  Behavior: if the flag is wired (smoke test), update the feature USAGE to document it. If not, decide whether to wire it (likely yes — overriding test_runner per-invocation is useful in feature scope too).

  Acceptance: `aitri feature verify-run <name> --cmd "go test ./internal/network/... -v"` runs the override command from the feature dir, not the manifest's test_runner. USAGE in `feature.js` lists `--cmd`.

### Core — Secondary findings from Ultron canary 2026-04-27 (alpha.6/7 session)

Three independent issues surfaced by the Ultron canary that validated the alpha.6 → alpha.7 scope-grammar fix. Tracked separately because each has its own evidence and fix shape; bundling would muddy the diagnosis.

- [ ] **P2 — Approve UX next-action routes to `requirements` instead of `architecture` when Phase 1 is already approved.**

  Evidence: Ultron canary feature `network-monitoring`, alpha.6. State at the time: `.aitri.approvedPhases` contained at minimum the value Aitri wrote on Phase 1 approve (verified via prior canary handoff). After `aitri feature approve network-monitoring ux`, the post-action banner emitted: `→ Continue with optional phases or run: aitri feature run-phase network-monitoring requirements` (re-grammared as alpha.7 form). The expected branch was `aitri feature run-phase network-monitoring architecture`, gated by `phase === 'ux' && approved.has(1)` in [approve.js:305](../../lib/commands/approve.js#L305).

  Hypothesis: `approved.has(1)` returned `false` despite Phase 1 being approved. Possible causes — (a) `config.approvedPhases` stored as strings (`['1']`) not numbers (`[1]`), making `Set.has(1)` miss; (b) feature `.aitri` lost Phase 1 entry between alpha.4 (when canary started) and alpha.6 (when this branch was hit) due to some intervening write path; (c) the `approved` Set was rebuilt after the cascade-invalidate path stripped Phase 1.

  Files to investigate: `lib/commands/approve.js:248,304` (Set construction + has check), `lib/state.js` saveConfig (type coercion), `lib/commands/feature.js` cascade behavior. Reproduce by running `aitri feature run-phase <name> ux` after Phase 1 was approved; capture `.aitri.approvedPhases` raw JSON before/after.

  Behavior: when Phase 1 is approved, UX-after-1 must route to architecture. Acceptance: a unit test that seeds `.aitri.approvedPhases = [1]` (number), runs `cmdApprove({ args: ['ux'] })`, and asserts the next-action emits `aitri ${sv}run-phase${sa} architecture`, not `requirements`.

  Why P2 not P1: not destructive; the user can manually run `aitri feature run-phase <name> architecture` and it works (canary did exactly that and continued cleanly). But it confuses the agent's "PIPELINE INSTRUCTION is your only next action" rule, which is supposed to be authoritative.

- [ ] **P3 — `aitri feature list` does not traverse upward to find the project root.**

  Evidence: Ultron canary, after `cd features/network-monitoring/spec/`, running `aitri feature list` returned `No features yet. Run: aitri feature init <name>`. The agent reasonably believed the feature was lost.

  Files: [lib/commands/feature.js:173-200](../../lib/commands/feature.js#L173-L200) `featureList()` reads `path.join(dir, 'features')` from cwd only.

  Behavior options: (a) walk parents looking for `.aitri/` then run featureList from there; (b) keep cwd-only behavior but emit a more honest message: `No features in current directory (cwd is not a project root). Run from <project root>` with the discovered project root if any. (b) is simpler and avoids surprising upward-walk behavior in nested workspaces; acceptable trade-off if the message names the actual reason.

  Acceptance: from any sub-directory of an Aitri project, `aitri feature list` either lists the features or prints a message that names "not at project root" as the reason. Test: create a project with `features/foo`, cd into a deep subdir, assert output mentions either the features or the project-root reason.

- [ ] **P3 — Phase 3 validator rejects `requirement_id: NFR-XXX` despite `type_coverage_matrix` accepting NFR keys.**

  Evidence: Ultron canary on Phase 3 of `network-monitoring`. The agent assigned 14 TCs to NFR ids; `aitri feature complete tests` rejected each with "requirement_id must be FR-*". Workaround: reassigned all 14 TCs to FR ids manually.

  Files: [lib/phases/phase3.js](../../lib/phases/phase3.js) `validate()` — likely checks `requirement_id` matches `^FR-` regex while `type_coverage_matrix` schema accepts both FR and NFR keys.

  Behavior: either (a) accept NFR-* in `requirement_id` (consistent with matrix), or (b) explicitly reject NFR-* in BOTH places with a clear message. Current state is internally inconsistent.

  Decision: lean toward (a). NFRs are first-class requirements; testing them is legitimate (e.g. an NFR for response time can have a TC that asserts the threshold). The matrix already encodes that. Phase 1 schema lets you write NFRs with `acceptance_criteria` — those criteria deserve TCs.

  Acceptance: `aitri complete 3` accepts a TC with `requirement_id: NFR-001` when `type_coverage_matrix['NFR-001']` exists. New test in `test/phases/phase3.test.js` covering the NFR coverage case.

### Core — `aitri normalize` proportionality (Ultron canary 2026-04-27)

- [ ] **P1 — Normalize fires on non-behavioral file changes (root cause of friction cycle).** Three separable bugs surfaced by Ultron canary on alpha.3.

  Evidence (verified, not paraphrased):
  - **Cycle is real and recurring.** Ultron git history contains three previous workaround commits with the same shape: `9b68709 chore: advance aitri normalize baseline to current HEAD`, `0e6786a chore: advance aitri normalize baseline past CSS regeneration commit`, `35a9a95 chore: advance aitri normalize baseline past PR #1`. Each was the user manually compensating for the same broken contract.
  - **Trigger of the most recent cycle (commit `e7f67cb`):** a one-line `go.mod` toolchain bump from 1.25.5 → 1.25.9 to resolve upstream Go stdlib CVEs. No application code touched. Aitri treated it as behavioral drift requiring full normalize ceremony.
  - **Briefing size measured: 70,390 bytes (70KB).** Verified by `aitri normalize 2>&1 | wc -c` on Ultron at HEAD `e7f67cb`. Size is fixed regardless of file count or change size — `lib/commands/normalize.js:300-321` embeds the full content of `01_REQUIREMENTS.json`, `03_TEST_CASES.json`, and `04_IMPLEMENTATION_MANIFEST.json` into the briefing.
  - **`--resolve` gate cost:** requires `verifyPassed === true` (`normalize.js:136`) → forces full re-run of `verify-run` + `verify-complete` (45 tests in Ultron's case) for any source change post-last-verify. Plus TTY gate (`normalize.js:158`) — agents cannot resolve. So one-line `go.mod` change → 45 tests + 70KB briefing + interactive human prompt.

  Problem / Why:
  - Aitri's contract claims to detect "code changes outside the pipeline since last build approval." The implementation treats any non-`spec/`, non-`.aitri/`, non-`node_modules/` file as drift. That includes `go.mod`, `*.md`, `Dockerfile`, `.env.example`, `Makefile`, lockfiles, CI configs, regenerated CSS bundles. None of those are behavioral.
  - The result is surveillance fatigue: users either ignore normalize (defeats the gate) or generate "chore: advance baseline" workaround commits (Ultron has 3 in git history). Both degrade produced software — the first by reducing signal credibility, the second by polluting commit history with bookkeeping.
  - Tier-1 evidence is direct: produced software is degraded today by users compensating for the tool instead of doing substantive work.

  Sub-bugs:

  **N1 — Behavioral filter for `aitri normalize` and `detectUncountedChanges` (root cause)**

  Files:
  - `lib/commands/normalize.js` — `gitChangedFiles()` (line 54) and `mtimeChangedFiles()` (line 68): apply behavioral allowlist to filter out non-behavioral patterns before counting.
  - `lib/snapshot.js` — `detectUncountedChanges()` (line 442) currently filters only `spec/`, `.aitri`, `node_modules/`; extend with the same allowlist.
  - `lib/upgrade/normalize-patterns.js` (new) — exported allowlist, single source of truth shared between normalize.js and snapshot.js.
  - `docs/integrations/ARTIFACTS.md` and `docs/integrations/SCHEMA.md` — document the allowlist so consumer projects know what is auto-excluded from drift detection.
  - `test/commands/normalize.test.js` and `test/snapshot.test.js` — add coverage for: (a) allowlist files don't trigger pending state, (b) mixed change set (allowlist + behavioral) reports only behavioral count, (c) all-allowlist diff auto-advances baseRef silently on next `aitri status` read.

  Behavior:
  - When `git diff baseRef..HEAD --name-only` returns ONLY files matching the allowlist, `aitri status` does not show the warning, `nextActions` does not emit P4 normalize, and `normalizeState.baseRef` advances to current HEAD silently on the next `loadConfig` after the diff is computed (one-time bookkeeping write, no user prompt).
  - When the diff contains any behavioral file, the warning fires as today, but the count and the briefing's file list exclude allowlist files (they are not part of the review scope).
  - `aitri normalize` always shows the briefing for behavioral files only. If post-filter file count is 0, prints `✅ No behavioral changes detected outside pipeline.` and advances baseline.

  Allowlist (initial — extensible via `.aitri/normalize-ignore` if a project needs more):
  - Build/dependency manifests: `go.mod`, `go.sum`, `package.json`, `package-lock.json`, `yarn.lock`, `Cargo.lock`, `Cargo.toml`, `Pipfile`, `Pipfile.lock`, `requirements*.txt`, `Gemfile`, `Gemfile.lock`, `composer.lock`, `*.lock`
  - Documentation: `*.md`, `*.txt`, `*.rst`, `LICENSE*`, `CONTRIBUTING*`, `AUTHORS*`, `CHANGELOG*`
  - Config / dotfiles: `.env`, `.env.*`, `.gitignore`, `.dockerignore`, `.editorconfig`, `.prettierrc*`, `.eslintrc*`
  - CI / infra: `Dockerfile*`, `docker-compose*.yml`, `Makefile*`, `*.mk`, `.github/**`, `.gitlab-ci.yml`, `.circleci/**`, `ci/**`
  - Generated assets: `web/static/dist/**`, `**/*.min.js`, `**/*.min.css`, `**/dist/**`, `**/build/**` (already partially in `IGNORE_DIRS` for mtime path; needs git path coverage too)

  Decisions:
  - **Allowlist, not blocklist.** Default-deny behavioral, default-allow non-behavioral. Reverse would force every project to register all their config files manually.
  - **Baseline advances silently on all-allowlist diff.** No user prompt, no event log entry beyond a single `normalize-auto-advance` event. Rationale: surveillance-free is the contract — if there's nothing to review, there's nothing to confirm.
  - **No allowlist override needed for v1.** Future `.aitri/normalize-ignore` (optional file) can extend; ship without it. KISS.
  - **N1 is independent of N2 and N3.** Ship N1 alone first; verify on Ultron; then decide if N2/N3 are still needed or if N1 absorbs the perceived friction.

  Acceptance:
  - On Ultron at current HEAD (`e7f67cb`, only `go.mod` differs from baseRef), `aitri status` does NOT show "files changed outside pipeline" warning.
  - On a project with one `.md` change AND one `internal/auth/jwt.go` change since baseRef, `aitri normalize` briefing lists only the `.go` file. Count is 1.
  - `npm run test:all` passes with new tests covering allowlist, mixed changes, and silent baseline advance.
  - `docs/integrations/CHANGELOG.md` carries an entry tagged `— additive` (consumer-visible: drift detection now ignores allowlisted patterns).

  **N2 — Briefing proportional to change scope (polish, ship after N1 if still needed)**

  Files:
  - `lib/commands/normalize.js` — replace full-spec embedding with: file list + `git diff baseRef -- <file>` per file + only the FRs/TCs whose `files_created` mentions a changed file.
  - `templates/phases/normalize.md` — restructure briefing template around the diff-and-relevant-spec model.
  - `test/commands/normalize.test.js` — assert briefing size scales with changed file count, asserts cross-ref logic picks correct FRs/TCs.

  Behavior: briefing for a 1-file change drops from ~70KB to <10KB. The agent reviewer still has full context for what changed but doesn't re-read the entire spec.

  Decisions:
  - Cross-ref by exact path match in `04_IMPLEMENTATION_MANIFEST.json::files_created[].path`. If no FR/TC references the file → include the FR/TC list as today (degrade gracefully).
  - Diff per file capped at 200 lines per file; truncate with `... (N more lines, see git diff)`.

  Acceptance: briefing for the Ultron-style one-line `go.mod` change (post-N1, this scenario is moot — file is allowlisted). Briefing for a one-file source code change <10KB, includes the file's diff and only FRs/TCs that reference it.

  **N3 — Snapshot priority ladder unified between status and verify-complete**

  Files:
  - `lib/commands/verify.js:861-864` — replace hardcoded "Phase 5 next" with a call to `buildProjectSnapshot()` and use its `nextActions[0]`.
  - `test/commands/verify.test.js` — add assertion that verify-complete with pending normalize emits the same next-action as `aitri status` (priority ladder respected).

  Behavior: `aitri verify-complete` after success consults `buildProjectSnapshot()` and prints the same `→ Next:` as `aitri status`. If normalize is pending, both say normalize; if normalize is resolved, both say Phase 5.

  Decisions:
  - Single source of truth for next-action is `buildProjectSnapshot()`. Any command that prints "your next action is X" must consume that snapshot, not derive it locally.

  Acceptance: on a project with normalize pending and verify just passed, `aitri verify-complete` and `aitri status` print the same `→ Next:` line. Test asserts the equality.

  Evidence / source: Ultron canary 2026-04-27. User session reported the cycle. Independent agent in a different session corroborated it. Verified in this session by reading the code, measuring the briefing (70KB), reproducing the cycle, and finding three previous workaround commits in Ultron git history. Severity HIGH — Tier-1 (degrades produced software via meta-commit pollution and signal-credibility erosion) + generalizes to any consumer project with documentation, build manifests, or CI config.

### Core — Post-promotion housekeeping

- [ ] **Rename `from-0.1.65.js` or adjust ADR to match implementation.** The module currently covers migrations introduced across v0.1.63–v0.1.82, which diverges from the ADR's per-version-boundary implication. Works today via field-presence gating. Revisit when a second brownfield at a higher baseline (e.g. `from-0.1.80.js`) splits the file naturally.

### Core — Consumer project backlog richness

- [ ] P2 — **Scaffold `BACKLOG.md` + enrich `spec/BACKLOG.json` schema + update `aitri backlog add` to accept rich fields.** Today `aitri backlog` only captures four fields (`id`, `title`, `priority`, `problem`, `fr`). Hub's human-authored `BACKLOG.md` (outside any Aitri template) carries a much richer format — Problem / Files / Behavior / Decisions / Risks / Acceptance / Implementation notes — which produces higher-quality work items that an agent can pick up later with far less ambiguity. That richness should be inherited by every consumer project, not reinvented by each human.

  Problem / Why:
  - Aitri's current backlog is thin. An entry like `"P2 — make the login faster — because users complain"` survives the JSON schema, but when someone picks it up six months later they have to re-derive which files to touch, what "done" means, and whether any decisions were already made. That re-derivation is where bugs and scope creep enter the produced software.
  - Hub ran into this organically and grew the richer format in its own `BACKLOG.md`. The format works — every entry in Hub reads as a micro-design doc. The gap is that new projects under Aitri start with an empty file (or no file) and the author has to discover the format by looking at Hub.
  - Aitri's own `docs/Aitri_Design_Notes/BACKLOG.md` already defines a good "Entry Standard" table (same fields). It's a self-document, never propagated to consumer projects.
  - Tier-1 signal: richer backlog entries directly improve the software consumer projects produce — they reduce ambiguity between "someone logged an idea" and "an agent implements it correctly".

  Files:
  - `templates/BACKLOG.md` (new) — scaffold template with the entry format guide at the top, one worked example, and empty sections. Copy/paste of Aitri's own `docs/Aitri_Design_Notes/BACKLOG.md` "Entry Standard" but tuned for consumer projects (simpler wording, less meta).
  - `lib/commands/init.js` + `lib/commands/adopt.js` (apply path) — write the template file at init time if not already present. Idempotent: never overwrite an existing `BACKLOG.md`.
  - `lib/commands/backlog.js` — `add` accepts new optional flags: `--files "path1,path2"`, `--behavior "..."`, `--acceptance "..."`. Also accept `--from-file <path>` to read the entry body from a markdown file (so an agent can compose the rich content elsewhere and attach it in one step, instead of hitting argv length limits).
  - `lib/commands/backlog.js` — `list` detail view renders the new fields when present; list summary stays compact.
  - `spec/BACKLOG.json` schema — additive: each entry may now carry optional `files: string[]`, `behavior: string`, `acceptance: string`, `notes: string`. Existing 4-field entries remain valid.
  - `docs/integrations/ARTIFACTS.md` — document the new optional fields so subproducts (Hub) can render them.
  - `docs/integrations/CHANGELOG.md` — entry tagged `— additive` once shipped.

  Behavior:
  - `aitri init` on a new project creates `BACKLOG.md` at project root alongside IDEA.md, CLAUDE.md, etc. The file starts with an entry format guide and one empty `## Open` section.
  - `aitri adopt apply` on a project without an existing `BACKLOG.md` writes the same template.
  - `aitri backlog add --title ... --priority ... --problem ... --files "lib/a.js,lib/b.js" --acceptance "test X passes"` stores all fields in `spec/BACKLOG.json`.
  - `aitri backlog list` keeps its current short table view. A new `aitri backlog show <id>` prints the rich detail of one entry (including the new fields).
  - `BACKLOG.md` at project root remains human-authored. Aitri never writes to it after scaffolding — it is the free-form planning surface. `spec/BACKLOG.json` is the structured counterpart for CLI-driven entries.

  Decisions:
  - **Two files, not one.** `BACKLOG.md` (human planning) and `spec/BACKLOG.json` (CLI-managed, tool-readable) coexist. Aitri scaffolds the first, manages the second. Merging them would force every entry through the CLI, which loses the "sketch an idea in markdown" workflow that Hub's entries demonstrate works well.
  - **All new fields are optional.** Schema stays additive. Projects that want the skeletal four fields keep their current flow; projects that want richness opt in per entry.
  - **`--from-file` > command-line flags for rich content.** Putting acceptance criteria and behavior text on the command line hits shell quoting hell. `--from-file` accepts a markdown fragment with section headers (`## Problem`, `## Behavior`, `## Acceptance`) and parses them. Keeps the CLI ergonomic even for rich entries.
  - **No breaking change to existing entries.** `aitri backlog list` must render four-field entries exactly as it does today; rich fields are purely additive renderings when present.

  Risks & mitigations:
  - **Schema evolution risk.** New optional fields in `spec/BACKLOG.json` — per integration contract rules, additive only. Document in ARTIFACTS.md + CHANGELOG; subproducts tolerate unknown fields already by design.
  - **Template drift.** Aitri's own Entry Standard vs the template copy — add a test that compares key field names between `docs/Aitri_Design_Notes/BACKLOG.md`'s standard and `templates/BACKLOG.md` to catch drift. Not a strict equality test; enumerate the six required fields and fail if either file drops one.
  - **Over-opinionation.** Some projects prefer minimal backlogs. Mitigation: the template is a *guide* with "delete this section if not applicable" wording, not a gate. `aitri backlog add` with just `--title/--priority/--problem` stays valid.

  Acceptance:
  - `aitri init ./new-project` creates `BACKLOG.md` at the project root; the file contains the entry format guide and an empty `## Open` section.
  - `aitri adopt apply` on a project without `BACKLOG.md` creates it; an existing `BACKLOG.md` is never overwritten.
  - `aitri backlog add --title "x" --priority P2 --problem "y" --files "a.js,b.js" --acceptance "test passes"` persists all four fields; the new ones appear in `spec/BACKLOG.json`.
  - `aitri backlog add --title "x" --priority P2 --problem "y" --from-file entry.md` parses `entry.md` for `## Behavior`, `## Acceptance`, `## Files`, `## Decisions`, `## Risks`, `## Notes` sections and stores matching fields. Unknown sections are ignored without error.
  - `aitri backlog show <id>` prints the entry with all fields present.
  - `npm run test:all` passes with new tests covering all above paths.
  - `docs/integrations/CHANGELOG.md` carries a new entry with `— additive`.

  Evidence / source: surfaced during the v2.0.0-alpha.3 canary on Hub. Hub's hand-written BACKLOG.md format is qualitatively better than Aitri's defaults; the gap is that Aitri never shipped that quality as a template for downstream projects. Explicit user request 2026-04-24.

---

## Design Studies

> Not implementation items. Open questions that inform future architectural decisions.

### Command-surface audit

Aitri exposes 20 top-level commands today (`lib/commands/*.js`). Over successive minor versions, several commands have developed functional overlap — not broken, but potentially redundant. Before v0.2.0, run a single audit to map the surface and decide whether to collapse, rename, or keep.

**Suspected overlaps (starting list — to be confirmed by the audit):**

| Pair / Group | Suspected overlap |
| :--- | :--- |
| `resume` vs `status` vs `status --json` vs `validate` vs `validate --explain` | Four commands project the same `buildProjectSnapshot()` with different verbosity / framing |
| `audit` vs `review` | Both are evaluative read-only passes with personas (auditor, reviewer). Different scope (audit = whole project, review = per-phase) but same shape |
| `feature verify-run` vs `verify-run` | Same logic, scoped to a feature sub-pipeline. Candidate for `verify-run --feature <name>` |
| `tc verify` vs `verify-run` | Manual TC recording vs automated runner — correct split today, but worth confirming against use |

**Already reviewed (excluded from future audits):**
- `wizard` vs `init` + `adopt scan` — reviewed 2026-04-22, **kept**. Distinct surfaces: `init` bootstraps `.aitri` config (no IDEA.md), `adopt scan` derives IDEA.md from existing code, `wizard` interactively builds IDEA.md for greenfield projects. Plus `wizard` exports `runDiscoveryInterview()` consumed by `run-phase discovery --guided` ([run-phase.js:148](../../lib/commands/run-phase.js#L148)) — load-bearing.
- `checkpoint` vs auto-`writeLastSession` + `resume` — reviewed 2026-04-22, **kept**. `--name` writes frozen resume snapshots to `checkpoints/` (no other command does this); `--context` adds free-text annotation to `lastSession`. Bare mode is the only redundant path (~5 lines of overhead). Not worth a breaking rename.

**Open question:** For each suspected overlap, is the split reinforcing a real distinction (different user intent, different invariant), or is it incidental history (command added before the collapsing path existed)?

**Why it is a Design Study and not a set of tickets:**
- Each command has test coverage and real users. A "cleanup" without evidence of confusion is churn.
- Renaming or collapsing is a breaking API change — must be batched for v0.2.0, not done piecemeal.
- The audit's *output* is the tickets (0, 1, or N of them), not the audit itself.

**Criterion to mature into tickets:**
- A concrete case of user or agent confusion about which command to use.
- A maintenance cost surfaced during unrelated work (e.g. snapshot schema change had to be propagated to 4 commands that project it).
- A release that is already touching the command surface (v0.2.0 breaking batch).

**Scope when executed:**
1. One-page table: command → unique responsibility → overlaps with → evidence for or against keeping split.
2. Per overlap: decide `keep` / `alias` / `collapse` / `rename` with trade-off written down.
3. Output: entries in the `Core — Breaking changes for v0.2.0` section, or none if the audit finds no real overlap.

**What NOT to do in the audit:**
- Don't collapse commands just because their code is similar. Intent and user model matter more than LOC.
- Don't rename for aesthetics. Every rename costs one deprecation cycle.

---

## Discarded

Items analyzed and explicitly rejected.

| Item | Decision | Reason |
| :--- | :--- | :--- |
| Mutation testing | Discarded indefinitely | Violates zero-dep principle. `verify-run --assertion-density` covers 60% of the same problem at zero cost. Option B (globally-installed stryker) introduces implicit env dependency — worse than explicit dep. ROI does not justify. |
| Aitri CI (GitHub Actions step) | Discarded 2026-04-17 | No active user demand. Contract not stable enough to publish a separate Action. If needed later, lives outside Core. |
| Aitri IDE (VSCode extension) | Discarded 2026-04-17 | Separate product with its own release cycle. Not incremental over the CLI; will be reconsidered if the CLI stabilizes across multiple external teams. |
| Aitri Report (PDF/HTML compliance report) | Discarded 2026-04-17 | User declined the surface. Compliance evidence already lives in `05_PROOF_OF_COMPLIANCE.json` + git history; rendering is a separate concern. |
| Aitri Audit (ecosystem-level cross-project aggregator) | Discarded 2026-04-17 | Functionally duplicates Hub's dashboard. Aitri Core does not maintain a global registry — adding one to support an aggregator violates the passive-producer model. Name also collides with the per-project `aitri audit` command (v0.1.71). |
| `aitri tc verify` recomputes `fr_coverage` | Discarded 2026-04-22 | Verified end-to-end: `verify-complete` blocks failures via `d.results[].status` ([verify.js:732](../../lib/commands/verify.js#L732)), not via `fr_coverage` counts. The `fr_coverage` gate at [verify.js:805-811](../../lib/commands/verify.js#L805-L811) only fires when `tests_passing === 0 && status !== 'manual'` — manual TCs never reach this branch. No active consumer reads per-FR `tests_passing/tests_manual` for any decision. Internal field drift is real but has no observable effect. Re-open if a future consumer (audit, Hub) starts reading per-FR counts. |
| Rename `checkpoint` to `note` (or simplify) | Discarded 2026-04-22 | Verified [checkpoint.js](../../lib/commands/checkpoint.js): `--name` writes frozen resume snapshots to `checkpoints/` (unique surface, not duplicated by `writeLastSession` auto), `--context` adds free-text annotation to `lastSession`. Bare mode is the only redundant path (~5 lines overhead). No user complaint in 18 versions since v0.1.70. Breaking rename for cosmetic improvement is not justified. |
| NFR traceability in Phase 2 (Design Study) | Discarded 2026-04-22 | Open since 2026-04-20 with explicit criterion "real case where approved design ignored a critical NFR and broke production". No such case has emerged in any Aitri-managed project. NLP-over-Markdown matching is high false-positive; honor-system review-list extension is untested. Persecuting a hypothetical defect. Re-open if a real case appears. |
