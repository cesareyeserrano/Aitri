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

### Core — v2.0.0 — `adopt --upgrade` as reconciliation protocol (HEADLINE)

Governed by [ADR-027](DECISIONS.md#adr-027--2026-04-23--adopt---upgrade-as-reconciliation-protocol-v200). Redesign of `aitri adopt --upgrade` from version-bump stub into a five-phase protocol (diagnose → plan → confirm → migrate → report). Headline change of v2.0.0. The previously-targeted "v0.2.0 breaking batch" is re-scoped under v2.0.0.

#### Execution plan (next-session entry point)

**Branch:** `v2.0.0` (or `feat/upgrade-protocol`) — dedicated branch, not main. Merges to `main` after end-to-end validation including a re-run of the Ultron brownfield scenario.

**Delivery tandas (pre-releases against Ultron before promoting):**

| Alpha | Scope | Canary check |
|:---|:---|:---|
| `v2.0.0-alpha.1` | Module scaffold (`lib/upgrade/`) + BLOCKING migrations only (TC rename, NFR rewrite, artifactsDir recovery) | Ultron: upgrade runs clean, verify-run works post-upgrade without needing the A2 precondition fallback. |
| `v2.0.0-alpha.2` | Adds STATE-MISSING (normalizeState, verifyRanAt, auditLastAt, lastSession, updatedAt backfill) | Ultron: `aitri normalize` works post-upgrade without `--init`. |
| `v2.0.0-alpha.3` | Adds VALIDATOR-GAP reporting (non-migrating, agent-flagged) | Ultron: report surfaces known gaps; no auto-mutation. |
| `v2.0.0-alpha.4` | Adds CAPABILITY-NEW + STRUCTURE migrations | Ultron: `original_brief` archival, agent files regen, path-case normalization. |
| `v2.0.0` | Promotion of last alpha. Final message rewrite of `adopt --upgrade` banner in `resume.js` replaces the v0.1.90 honest-intermediary text. | Full E2E re-run on Ultron + at least one other real project. |

**Commit discipline:** each migration module = its own commit. No squash at merge. Each commit includes code + tests + doc update in `docs/integrations/CHANGELOG.md` and `docs/integrations/ARTIFACTS.md` where applicable.

**Invariant not to break during implementation:**
- v0.1.90 defensive layers (reader tolerance, verify-run precondition, normalize --init flag, deployable banner, bug SHA audit, Docker deagnostic validate, agent-files guidance) stay in place unchanged. The upgrade protocol runs alongside them; they remain the fallback for users who run CLI commands before running upgrade.
- `adopt scan` / `adopt apply` / `aitri init` are untouched.
- The `status.js` priority ladder already hints `adopt --upgrade` on version mismatch. No change needed there — the new upgrade just does more work when invoked.

#### Scope

#### Scope

- [ ] **Module: `lib/upgrade/`** — new directory. Entry point `lib/upgrade/index.js` exports `runUpgrade(dir, config, flags)`. `adopt --upgrade` becomes a thin dispatcher that calls it.
- [ ] **Diagnostic catalog** — `lib/upgrade/diagnose.js` returns `{ blocking: [], stateMissing: [], validatorGap: [], capabilityNew: [], structure: [] }`. Each entry: `{ version, target, before, after, reversible }`.
- [ ] **Migration modules** — `lib/upgrade/migrations/from-<version>.js`. Each exports `{ diagnose, migrate }`. Composition: upgrade walks from `config.aitriVersion` → CLI VERSION, invokes every applicable module in order.
- [ ] **Atomic commit point** — `aitriVersion` written LAST. Rollback on mid-run failure (restore from `before_hash`).
- [ ] **Event logging** — every migration emits `{ type: 'upgrade_migration', from, to, category, target, before_hash, after_hash, timestamp }` into `.aitri.events[]`.
- [ ] **CLI flags** — `--dry-run` (diagnose only, no writes), `--yes` (non-interactive CI path), `--only <categories>` (comma-separated filter), `--verbose` (per-migration detail).
- [ ] **Coverage gate** — new test `test/upgrade-coverage.test.js` analogous to `release-sync.test.js`. Enforces: any change to `lib/phases/phase*.js::validate()`, artifact schemas, or `.aitri` field set requires an entry in the most recent `from-*.js` migration module. CI blocks otherwise.

#### Initial migration catalog (from Ultron session + schema history)

**🔴 BLOCKING (from-0.1.65.js et al.):**
- [ ] TC schema rename: `test_cases[].requirement` (string) → `requirement_id` (string) or `frs` (array if comma-separated).
- [ ] NFR schema rewrite: `non_functional_requirements[].{title, constraint}` → `{category, requirement}`.
- [ ] `artifactsDir` recovery: if config points to empty dir but artifacts at root, correct to `''` (partially already in current adopt --upgrade).

**🟡 STATE-MISSING (from-0.1.65.js through from-0.1.89.js):**
- [ ] `normalizeState` (from-0.1.79.js): if Phase 4 approved without baseline, stamp `{baseRef: HEAD || ISO, method, status: 'resolved', lastRun}`.
- [ ] `verifyRanAt` (from-0.1.78.js): if `verifyPassed=true` but no `verifyRanAt`, backfill from newest `04_TEST_RESULTS.json` mtime.
- [ ] `auditLastAt` (from-0.1.78.js): backfill from `AUDIT_REPORT.md` mtime if present.
- [ ] `lastSession` (from-0.1.69.js): backfill from the most recent `events[].when` of type `complete|approve|verify`.
- [ ] `updatedAt` (from-0.1.63.js): stamp to current time if missing.

**🟠 VALIDATOR-GAP (report-only, no auto-migrate — requires agent):**
- [ ] v0.1.82 Phase 1 vagueness: flag FRs with titles that would fail current `BROAD_VAGUE` check.
- [ ] v0.1.82 Phase 1 duplicate ACs: flag FR pairs with Jaccard ≥0.9.
- [ ] v2.0.0 Phase 3 TC canonical regex (see breaking item below): flag non-canonical `tc.id` values.

**🔵 CAPABILITY-NEW (opt-in, advisory):**
- [ ] `files_modified` (from-0.1.75.js): if `04_IMPLEMENTATION_MANIFEST.json` has only `files_created`, advisory only — cannot infer modifications retroactively.
- [ ] Bug audit trail (from-0.1.89.js): bugs in state `closed` without `close_commit_sha` cannot be backfilled (no known close commit). Advisory. Future bugs auto-populate.
- [ ] Agent instruction files (from-0.1.69.js): regenerate `CLAUDE.md`, `GEMINI.md`, `.codex/instructions.md` if missing.
- [ ] `original_brief` (from-0.1.88.js): if `IDEA.md` still exists alongside approved Phase 1, offer to archive into `01_REQUIREMENTS.json.original_brief` and remove.

**⚪ STRUCTURE:**
- [ ] (covered in 🔴) `artifactsDir` recovery — same migration.
- [ ] Case-mismatch detection for internal paths (Aitri-owned only; Hub registry is out of scope per FEEDBACK A6 resolution).

### Core — v2.0.0 — Breaking changes batched with the upgrade protocol

With the upgrade protocol in place, these breaking changes become tractable — each ships with its own `from-*.js` migration that handles the legacy shape.

- [ ] **`IDEA.md` and `ADOPTION_SCAN.md` move from project root to `spec/`** — previously blocked on "no dual-path fallback" because the protocol had no migration surface. Now: v2.0.0 migration module detects root-level `IDEA.md`/`ADOPTION_SCAN.md` and offers to move them into `spec/`.
  Files: `lib/commands/adopt.js`, `lib/commands/run-phase.js`, `templates/adopt/scan.md`, `test/smoke.js`.
  Migration: `lib/upgrade/migrations/from-0.1.89.js` offers move as STRUCTURE category.
  Acceptance: new projects land files in `spec/`; legacy projects get moved on upgrade.

- [ ] **Phase 3 canonical TC ID regex** (previously P3, waiting for second case) — v2.0.0 enforces `/^TC(-[A-Z][A-Za-z0-9]*)*-\d+[a-z]?$/` at `complete 3`. Migration reports non-canonical IDs as VALIDATOR-GAP (agent re-runs Phase 3 or renames manually — cannot be auto-renamed safely because consumers reference by id).
  Files: `lib/phases/phase3.js`, `test/phases/phase3.test.js`, `docs/integrations/ARTIFACTS.md`.
  Migration: `lib/upgrade/migrations/from-0.1.89.js` detects and reports.

- [ ] **Command-surface audit outcomes** — Design Study promotes to tickets. Any collapse/rename goes through v2.0.0 batch with a migration in `from-*.js` that rewrites command references in agent instruction files (if any).

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
