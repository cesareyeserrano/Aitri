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

### Core — API cleanup

- [ ] P3 — **Phase 3: enforce canonical TC ID format** — `03_TEST_CASES.json` accepts any `id` string; only presence of trailing `h` / `f` on MUST-FR coverage is checked. A project can ship non-canonical IDs like `TC-E01` (namespace letter glued to digits, no suffix) and everything downstream — conftest helpers, verify parsers, fr_coverage — silently mismatches.

  Problem: Convention is documented in `docs/integrations/ARTIFACTS.md:148` and `templates/phases/tests.md:27-30` (suffix `h`/`f`/`e`, canonical shape `TC(-<NS>)*-<digits><letter>`), but not mechanically enforced. Consumer projects discover the drift as "verify shows TCs as skipped despite pytest passing" — days of debugging to trace back to a naming typo. Real case surfaced in Cesar 2026-04-22: `TC-E01`/`TC-E02` smoke tests silently dropped to `skipped_no_marker`; root cause was ID format, not the parser.

  Files:
  - `lib/phases/phase3.js` — add format validation against `/^TC(-[A-Z][A-Za-z0-9]*)*-\d+[a-z]?$/` (or similar — calibrate against existing valid IDs in internal tests + Hub). Throw with actionable message: the offending `id`, the pattern it must match, and a canonical rewrite suggestion (`TC-E01` → `TC-E-01e`).
  - `test/phases/phase3.test.js` — add coverage for accept-canonical / reject-noncanonical cases.
  - `docs/integrations/ARTIFACTS.md` — formalize the regex next to the existing convention paragraph.

  Behavior:
  - Phase 3 complete throws on any non-canonical `id`. Migration path for existing projects: either rename IDs (surfaces the real cost of the deviation) or we ship with a one-version grace period (warn, then throw).

  Decisions:
  - Do **not** ship reactively (single case = Cesar). Wait for a second real case before scheduling, unless an architectural review finds this a systemic gap.
  - If scheduled: coordinate with the checkpoint-rename cycle — breaking/strict changes are easier to batch in one minor.

  Acceptance:
  - Running Phase 3 validation against a fixture with `TC-E01` throws with the exact regex + rewrite suggestion.
  - Existing valid IDs (`TC-001h`, `TC-FE-001h`, `TC-API-USER-010f`) continue to pass.
  - ARTIFACTS.md has the regex documented alongside the h/f/e convention.

  Related:
  - v0.1.85 fixed the parser side (multi-segment IDs).
  - v0.1.88 updated `templates/phases/tests.md` with namespaced examples + anti-glue warning — partial mitigation. The format-validation gate at Phase 3 complete is the missing preventive counterpart.
  - This would catch silent drift earlier (Phase 3 complete) instead of days later (verify-run showing unexplained skips).

### Core — Breaking changes for v0.2.0

- [ ] P3 — **`IDEA.md` and `ADOPTION_SCAN.md` at the root of the user's project** — Both files land at the root after `adopt scan`, polluting the user's directory and exposing them to accidental deletion.

  Problem: The user's project root is not the right place for Aitri-generated files. The user can delete them by mistake or confuse them with their own files. Also, `spec/` already exists as the artifacts folder — semantically `IDEA.md` belongs there.

  Files:
  - `lib/commands/adopt.js` — change write paths from `path.join(dir, 'IDEA.md')` and `ADOPTION_SCAN.md` to `path.join(dir, 'spec', ...)`; create `spec/` in `adoptScan` instead of only in `adoptApply`
  - `lib/commands/run-phase.js` — line 68: change `adir = ''` to `adir = artifactsDir` for `IDEA.md`
  - `templates/adopt/scan.md` — update output paths (`{{PROJECT_DIR}}/spec/IDEA.md`, `{{PROJECT_DIR}}/spec/ADOPTION_SCAN.md`)
  - `test/smoke.js` — update smoke tests that check for `IDEA.md` at the root

  Behavior:
  - `adopt scan` creates `spec/` if missing, writes `spec/IDEA.md` and `spec/ADOPTION_SCAN.md`
  - `run-phase 1/2/discovery` looks up `IDEA.md` in `spec/` (via `artifactsDir`)
  - `adopt apply` assumes `spec/IDEA.md`

  Decisions:
  - **Defer to v0.2.0 as an explicit breaking change** (decided 2026-03-17): no dual-path fallback — it would add permanent debt in run-phase.js. In v0.2.0: the user moves IDEA.md manually, or Aitri detects the file at root and aborts with a clear instruction.
  - `ADOPTION_SCAN.md` moves too — same semantic group, low individual risk (only written by agent, never read by code)

  Acceptance:
  - `adopt scan` in a new project: `IDEA.md` and `ADOPTION_SCAN.md` land in `spec/`, not at root
  - `run-phase 1` in a project with `spec/IDEA.md`: works without warning
  - Legacy project with `IDEA.md` at root: Aitri aborts with explicit migration instruction
  - Smoke tests pass with 0 failures

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
