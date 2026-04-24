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

### Core — v2.0.0 — `adopt --upgrade` as reconciliation protocol (shipped in alpha.1 + alpha.2 ergonomics, pending promotion)

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

### Core — Post-promotion housekeeping

- [ ] **Rename `from-0.1.65.js` or adjust ADR to match implementation.** The module currently covers migrations introduced across v0.1.63–v0.1.82, which diverges from the ADR's per-version-boundary implication. Works today via field-presence gating. Revisit when a second brownfield at a higher baseline (e.g. `from-0.1.80.js`) splits the file naturally.

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
