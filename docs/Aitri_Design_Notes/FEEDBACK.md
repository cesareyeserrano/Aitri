# Aitri — Testing Feedback

> **Purpose:** capture observations from testing sessions (manual or E2E with Claude).
> This is not a changelog or an implementation log — those go in CHANGELOG.md and BACKLOG.md.

> **Entry lifecycle:**
> observation → document here → analyze → move to BACKLOG.md (or discard) → **delete entry**
> If an entry stays here for more than one session without action, delete it anyway.

-------

## 2026-04-22 — E2E on Ultron (v0.1.65 → v0.1.89 adopted, brownfield)

**Session:** Claude Opus 4.7 acting as end-user operator. Mission: take Ultron-AP from a "descuadrado" (drifted, un-stabilized) state to fully stable + ready-for-next-feature, while recording friction. Ultron was adopted at v0.1.65 and untouched in the pipeline for ~5 weeks; CLI had advanced 24 minor versions.

**Final state reached on Ultron:** `deployable: true`, 8/8 phases approved, 20/20 tests, audit on record (0d stale), 0 active bugs (3 filed + fixed in code + closed through lifecycle), 6 backlog items tracked (P2×3, P3×3).

**Headline signal:** the pipeline is **brittle around schema evolution between versions** — a class of bug that only surfaces on real brownfield adopters, not on Aitri's own test fixtures. Three separate artifact-vs-reader mismatches in a single session. None caught by `test/release-sync.test.js`.

---

## 2026-04-23 — Re-analysis under v2.0.0 design lens

After v0.1.90 shipped the individual fixes below, the user surfaced the underlying design intent: `adopt --upgrade` was meant to be a **reconciliation protocol** that keeps projects functionally and technically current as Aitri evolves — not the cosmetic version-sync the code has always been. [ADR-027](DECISIONS.md#adr-027--2026-04-23--adopt---upgrade-as-reconciliation-protocol-v200) captures that redesign as the headline of v2.0.0.

**Re-classification of items below under the v2.0.0 lens:**

| Ítem | v0.1.90 action | v2.0.0 reclassification | False positive? |
|:---|:---|:---|:---|
| **A1** | Reader tolerance (staged) | Still correct as defensive layer. The v2.0.0 upgrade protocol migrates legacy `{title, constraint}` → `{category, requirement}` automatically (BLOCKING category); the reader fallback covers the transient window before upgrade runs. | **No.** |
| **A2** | verify-run precondition (staged) | Defensive layer; upgrade protocol rewrites `tc.requirement` → `tc.requirement_id` as a migration, so the precondition rarely fires but stays as safety net for users who ran `verify-run` before upgrade. | **No.** |
| **A3** | Honest upgrade message (staged) | Message was a band-aid for the command not doing what it claimed. In v2.0.0 the command actually does it — message will be rewritten again to describe the real protocol, not this cosmetic intermediary. | **No** — but short-lived. |
| **A4** | `normalize --init` flag (staged) | Becomes a STATE-MISSING migration step INSIDE the upgrade protocol. Standalone flag stays for power users. The common path shifts from "upgrade + normalize --init" to just "upgrade". | **No.** |
| **A5** | Validate Docker deagnostic (staged) | Unrelated to upgrade protocol. Stands alone. | **No.** |
| **A6** | Not Aitri (Hub concern) | Unchanged. Still not Aitri's problem. | **No** (and never was). |
| **F1** | Deployable banner in resume (staged) | Unrelated to upgrade protocol. Stands alone. | **No.** |
| **F2** | Already-fixed regression lock (staged) | Unrelated. Stands. | **No.** |
| **F3** | Audit quality honor-system (not acted) | Unchanged decision: violates passive-producer invariant. | **No** (correctly discarded). |
| **F4** | Output shape inconsistency (not acted) | Unchanged. Cosmetic, low value. | **No** (correctly deferred). |
| **F5** | audit + audit plan fusion (deferred to Command-surface audit) | Unchanged — Design Study. | **No.** |
| **F6** | Bug SHA audit trail partial (staged) | Unrelated to upgrade protocol (it's a lifecycle improvement). The missing `--verified-by` gate remains correctly discarded (invariant). | **No.** |
| **F7** | Meta (folds into A1/A2/A4) | Confirmed: the "Aitri doesn't detect its own legacy drift" observation is exactly what the v2.0.0 upgrade protocol solves systematically. F7 is the abstract statement of the design gap that ADR-027 closes. | **No** — validated as meta-signal. |
| **F8** | Resume 220 lines (deferred) | Still deferred. Not related to upgrade protocol. | **No.** |
| **F9** | Dup of A1 | Same fix. | **No.** |
| **F10** | Folds into A2 | Same fix. | **No.** |
| **F11** | Persistent next action on stable (deferred) | Still deferred. Not related. | **No.** |
| **F12** | Bug close SHA (staged) | Lifecycle improvement. Independent of upgrade. | **No.** |
| **F13** | Agent files guidance (staged) | In v2.0.0 this becomes part of the upgrade protocol REPORT phase. The standalone print in `adopt --upgrade` is absorbed. | **No** — reframed, not wrong. |
| **F14** | Not acted on (crosses boundary) | Unchanged. Upgrade protocol does not consult git either. | **No** (correctly discarded). |

**Conclusion of re-analysis:** **no false positives.** Every v0.1.90 action stands — either as (a) defensive layer under the new protocol, (b) independent improvement unrelated to upgrade, or (c) correctly-rejected item. The redesign in ADR-027 does not invalidate prior work; it **elevates it** from a set of disconnected fixes into the orchestrated protocol the command was always supposed to be.

**What changes in FEEDBACK's framing:** the section below (original entries) now reads as the symptom catalog that motivated ADR-027. Items marked "shipped (staged)" remain true statements of what v0.1.90 did. When v2.0.0 ships, these annotations should be collapsed into a single reference to ADR-027 plus the migration catalog in BACKLOG.md.

---

### A1 — ✅ shipped (staged). Renderer tolerance for legacy NFR `{title, constraint}`; null-safe FR `type`; `resume` drops `(must-have, undefined): undefined` strings.
### A2 — ✅ shipped (staged). `verify-run` precondition blocks write on legacy TC schema before spawning the runner; `frs[]` array accepted as multi-FR shape.

### A3 — ✅ shipped (staged). Upgrade message now honestly describes what runs + points at `normalize --init`.

### A4 — ✅ shipped (staged). `aitri normalize --init` stamps a baseline; `normalize` without baseline hints the new flag when Phase 4 is already approved.

### A5 — ✅ shipped (staged). `validate` no longer labels Dockerfile/docker-compose as "required" or warns when they're missing. Existing deploy files still listed; absent ones trigger a non-judgemental hint about non-containerized targets. The `--json` `deployFiles` shape is unchanged (contract preserved).

### A6 — ❌ not an Aitri bug. Verified: Aitri Core never writes a `location` field anywhere. `lib/commands/status.js:159` only **reads** Hub's registry (`~/.aitri-hub/projects.json`) to flag "also tracked in Hub". If the path there is mis-cased, that is a Hub issue — Hub owns its registry since v0.1.64. Reassigned.

### F1 — ✅ shipped (staged). Pipeline State block now carries a `**Deployable:** ❌ Not ready / ✅ Ready` line, inline with the phase table.

### F2 — ✅ already fixed in current code (pre-Batch 3). Empirically reproduced: `computeHealth` flips `deployable=false` when `bugs.blocking > 0`, so `validate` enters the "deploy blocked" branch — no contradiction with `status` remains. The FEEDBACK description was accurate for the version used during the session but stale against `main`. Locked in with a regression test in `test/commands/validate.test.js` so the coupling cannot quietly break.

### F3 — Audit quality is agent-dependent; no mechanical check

`aitri audit` produces a prompt → agent reads code → agent writes AUDIT_REPORT.md → agent runs `aitri audit plan` → agent files bug/backlog. Aitri does not verify audit was honest, complete, or well-calibrated. A lazy agent could write "No issues found" and Aitri would mark `auditLastAt` and call it done.

Format does enforce specificity (file:line references required). Severity calibration is entirely agent-side. This is consistent with Aitri's "generates prompts, does not enforce content" design, but worth flagging: weaker models produce shallow audits that look complete. For tier-1 mission ("produced software quality"), audit quality is a real lever.

### F4 — Output shape inconsistency across commands

`aitri bug add` prints `✅ BG-001 created — status: open`. `aitri backlog add` prints `✅ Added BL-001: <title>`. Different tense, different info layout. Small but noticeable in a single session that exercises both.

### F5 — `aitri audit` and `aitri audit plan` could be fused

Two separate briefings for what is effectively one decision flow (find findings → triage them). `audit plan` re-reads AUDIT_REPORT.md from disk to present it back. Could be a single pass.

### F6 — ✅ partially shipped (staged). `bug fix` captures `fix_commit_sha` automatically; `bug close` captures `close_commit_sha` + `files_changed` (diff fix→close). Non-git projects degrade silently. **Not shipped:** required `--verified-by` gate on verify — leaves content-judgment to the agent per the passive-producer model, consistent with how audit quality is currently handled (F3 rationale).

### F7 — Aitri's own "descuadrado" detection is weaker than user's tacit signal

The user's diagnosis was "Ultron está descuadrado". Aitri's diagnosis of the same project at session start: "Phase 1-5 ✅ approved; tests 20/20; Verify ✅" — the only visible concern was version-mismatch. If the user had trusted Aitri's surface signals, nothing would have looked wrong.

Real underlying state was: (a) schema drift artifacts↔CLI readers [A1, A2], (b) post-P4 code changes unclassified [A4 via normalize gap], (c) audit never on record despite commit `44cd192` citing AF-* findings. Aitri surfaces (c) explicitly (priority-9 action), blind to (a) and (b).

Version-mismatch is not just "rebadge config.json" — it's an active signal the project may need re-verification under current schemas. Making Aitri detect its own legacy drift would be tier-1 leverage.

### What worked well

- Hash-based drift detection: solid, zero false positives in session.
- `aitri bug add` / `aitri backlog add` CLIs: clean fields (severity, fr, tc, priority, problem).
- Enforce-at-gate model (Phase 5 requires FR coverage, verify-complete requires pass count) — the right abstraction when it works (no schema drift).
- `health.deployable` + `deployableReasons[]` + `nextActions[]` priority ladder — well-designed for tooling consumption.
- Audit briefing itself: 5 dimensions + "specificity rule" + required output format guide an auditing agent toward a real report.
- No permission prompts, no data exfil, everything local.

### Priority ranking (by CLAUDE.md evaluation criterion)

Tier 1 (consumer software quality), Tier 2 (Aitri usability), Tier 3 (internal coherence):

1. **[Tier 1] A2** — verify-run silent coverage destruction. Preserves verify state for consumer projects. Highest leverage.
2. **[Tier 1] A4** — normalize escape hatch. Brownfield projects with post-P4 changes are currently orphaned from drift classification.
3. **[Tier 2] F6** — bug lifecycle integrity. Closing the honor-system gap strengthens every `aitri bug` operation going forward.
4. **[Tier 2] A1** — NFR renderer. Cosmetic today, undermines trust in less-visible enforcement.
5. **[Tier 2] A3** — `adopt --upgrade` honest messaging. Either deliver or rewrite.
6. **[Tier 2] A5** — Docker warnings in validate. Small fix, eliminates a recurring annoyance.
7. **[Tier 2] F2** — `validate` vs `status` disagreement. Unify the message.
8. **[Tier 3] A6** — path capitalization. Cross-platform hygiene, no current failure.

### Evidence base note

Per CLAUDE.md: *"tier-1 signal is speculative for any external project."* This session is one data point. Three of the Aitri findings (A2, A4, A5) would not have surfaced without a real adopted project predating the current schema — exactly the brownfield-evolution bug class that is *only* discoverable via sessions like this. Worth running periodically on other real adopters, not just Ultron.

---

## Second-pass observations (post-commit `aitri status` + `aitri resume`)

After committing the stabilization changes to Ultron and re-running `aitri status` / `aitri resume`, a few new items surfaced.

### F8 — `aitri resume` dumps 220 lines for a stable project; useful signal is ~15 (SEV: MED)

Full `aitri resume` output on Ultron, post-commit, fully green: **220 lines**. Of those, ~10 is Pipeline State, ~5 is Last Session, ~5 is Next Action, ~10 is Test Coverage summary. The rest — ~190 lines — is verbatim dump of `02_SYSTEM_DESIGN.md` (sections 1-8: architecture, C4 diagram, module map, data flows, ADRs, non-functional targets, etc.) plus every FR-001..FR-015 with every single AC enumerated, plus every NFR.

For the common case ("what do I do next?"), 95% is noise. The architecture dump is useful on re-entry after long absence, not on every resume. Current output is near-impossible to scan in a terminal.

**Fix options:**
- Default to brief output (pipeline state + last session + next action + bug/backlog counts). Full dump behind `aitri resume --full`.
- Or adaptively truncate: if all phases are approved + no drift + no blocking issues, skip architecture + requirements dump; surface them only when state is incomplete.
- Or include a "## What I was doing" summary from `lastSession` context (the text you stored with `aitri checkpoint --context "..."`) and make that the default, not the full artifact re-paste.

### F9 — ✅ closed by the A1 fix (staged) — same root cause, same renderer.

### F10 — "Last Session" block is useful, but drifts from git reality

New addition I hadn't noticed:
```
## Last Session
- **When:** 4/22/2026, 8:14:10 PM
- **Event:** verify-run
- **Files touched:** .aitri/config.json, spec/04_TEST_RESULTS.json
```

Good feature — helps with "what was I doing." BUT: the referenced event is the `verify-run` I triggered that corrupted `04_TEST_RESULTS.json`. I reverted the file via `git checkout spec/04_TEST_RESULTS.json` and moved on, so the *event* in Aitri's log happened, but its on-disk effect was undone.

`lastSession` is pulled from the events array in `.aitri/config.json`, which is append-only and doesn't know about external reversions. So Aitri's self-reported "what I last did" is diverged from git truth.

**This is a second-order symptom of A2.** A2 causes the bad write; the event log bakes it in permanently even after recovery. Worth noting but probably folds into the A2 fix (if verify-run refuses to write on schema mismatch, no bad event is logged in the first place).

### F11 — Persistent `→ Next:` recommendation for a stabilized project

On a project where every gate is green and nothing needs doing:
- `status`: `→ Next: aitri validate`
- `resume`: `1. aitri validate — All artifacts approved, verify passed — confirm deployment readiness`

Priority-7 `aitri validate` is suggested every time, even though validate just passed 30 seconds ago. The priority ladder has no "terminal" state — it always surfaces *something*.

For a stable project ready for next feature, the right headline is closer to: **"Stable. No action required. Start a new feature with `aitri feature init <name>`."** Today's output implies there's still work pending, creating low-grade anxiety that something is unfinished.

**Fix:** add a terminal priority ("project stable, ready for next feature") that outranks priority-7 validate when: all phases approved + no drift + no blocking bugs + audit fresh + verify fresh. In that case `nextActions` should be empty (or a single explicit "ready" marker), not a reflexive suggestion to re-validate.

### F12 — ✅ shipped (staged). `close` now records `close_commit_sha` and `files_changed` (diff `fix_commit_sha..close_commit_sha`, excluding `spec/` and `.aitri`). Per-bug audit trail links BG-NNN to the specific commit range that resolved it, instead of being lost between state transitions.

### F13 — ✅ shipped (staged). `adopt --upgrade` now prints a short block listing the generated agent files + recommended treatment (commit as multi-agent bootstrap; delete the ones you don't use; Aitri regenerates missing files on next upgrade).

### F14 — ❌ not acted on. The author himself flagged this as "not exactly a bug". In practice, the concrete gaps are already covered:
- Source edits between verify and status → `aitri normalize` (A4 escape hatch makes this usable on brownfield).
- Bug-fix commits → `bug close` now records `close_commit_sha` + `files_changed` (F12).
- Verify staleness → `verifyRanAt` already drives the "Verify stale" signal.
The residual ask ("status header shows `git: <branch>@<sha>`") would make `status` consult git, which contradicts the artifacts-are-SSoT invariant. Not worth crossing that boundary for a convenience line. Re-open only if a concrete defect appears that these three existing signals fail to catch.

---

## Meta-observation

The second pass found **as many issues as the first** (F8–F14 vs the full original set). This is because the first pass was "do the thing", the second was "look at what it shows me." Running `aitri status` and `aitri resume` with eyes tuned to output quality revealed UX debt that "mission mode" had power-read past.

Practical implication: feedback sessions should explicitly include a "walk the tool" pass where the tester just runs the main user-facing commands and critiques what they see, separate from the "execute a pipeline" pass.
