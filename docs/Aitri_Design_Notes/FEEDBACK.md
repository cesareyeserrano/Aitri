# Aitri — Testing Feedback

> **Purpose:** capture observations from testing sessions (manual or E2E with Claude).
> This is not a changelog or an implementation log — those go in CHANGELOG.md and BACKLOG.md.

> **Entry lifecycle:**
> observation → document here → analyze → move to BACKLOG.md (or discard) → **delete entry**
> If an entry stays here for more than one session without action, delete it anyway.

---

## Live entries

Entries below are observations from canary sessions whose action was deferred (not rejected, not shipped). Each stays only until it either matures into a BACKLOG item with real evidence, or is confirmed as not worth acting on.

### H4 — Canary setup friction: `cp -a` broken on Hub's `node_modules` (SEV: LOW, not Aitri)

Hub has `node_modules` with deeply nested symlink chains that `cp -a` refuses to copy (macOS `chflags: Too many levels of symbolic links`). Canary setup had to switch to `tar --exclude=node_modules`. Not Aitri's problem, but future canary runs against any Node project will hit this.

**Why kept:** candidate for a future convenience helper (`aitri adopt --upgrade --dry-run-to <path>` that does an in-place copy via `fs.cp` with the right flags). Design Study candidate, not urgent. Dry-run landed in v2.0.0-alpha.2 for in-place preview; a `--dry-run-to` variant would complement it only if multiple operators actually want to preview against a scratch copy.

**Reopen criterion:** a canary on a real project where in-place `--dry-run` is not safe enough.

### H5 — `aitri status` features list scales poorly on complex projects (SEV: LOW, tangential)

Hub has 9 sub-features, each listed as a full line in `aitri status`:
```
Features:
  hub-folder-scan      phases 5/5 verify ✅ (24/24)
  hub-mvp-web          phases 5/5 verify ✅ (37/53)
  ...
```

9 lines is manageable. 30 would flood the terminal. And ratios like `37/53` next to `✅` are ambiguous at a glance (passing tests vs "tests classified under this FR coverage" — actually the latter, but visual tension is real).

**Why kept:** pre-existing UX debt, separate from upgrade protocol.

**Reopen criterion:** first project with ≥20 features where the list becomes unreadable, OR agent confusion about the `N/M` ratio surfaces in a real session.

**Reconfirmation 2026-04-27 (alpha.4 canary on Hub).** The post-N1 canary on Hub re-surfaced the visual tension. Live output:
```
Σ  all pipelines  Aggregated  Passed (249/294)
hub-mvp-web                   verify ✅ (37/53)
integration-compat-manifest   verify ✅ (25/34)
```
`verify ✅ (37/53)` reads as a contradiction at a glance — `✅` suggests complete, `(37/53)` reads as 70%. The aggregated `(249/294)` (84%) labelled "Passed" has the same problem. The N is "tests with explicit FR coverage", M is "tests total", but the display does not say so.

**Severity escalation 2026-04-27 (alpha.4 canary on Zombite).** Zombite makes the dissonance much sharper. Live output:
```
Σ  all pipelines  Aggregated  Passed (17/66)
stabilizacion                 verify ✅ (2/51)
```
**4% (2/51) labelled with ✅** is jarring. A reader inspecting Zombite for the first time would reasonably conclude "verify ✅" is wrong or that the project is broken. The ratio is technically correct under the current semantics ("tests with explicit FR coverage"), but the visual contract is misleading enough that an honest skim produces a wrong mental model.

**Third canary 2026-04-27 (alpha.4 on Cesar — confirms full spectrum).** Cesar (9 features, deployable, mature project) shows the same pattern across the full range:
```
Σ  all pipelines  Aggregated  Passed (269/291)        →  92%
frontend-remediation          verify ✅ (29/44)        →  66%
ux-ui-upgrade                 verify ✅ (40/47)        →  85%
ui-conversation-redesign      verify ✅ (38/38)        → 100%
```
Three canaries now span the dissonance: Zombite (4%, jarring), Hub (70-84%, noticeable), Cesar (66-100%, mixed within a single project's feature list). The issue is universal, not edge-case. Two of nine Cesar features are sub-90% with ✅. Fix justified for alpha.5 polish.

### H7 — `Re-approved After Drift` guidance does not mention `aitri rehash` (alpha.4 canary on Cesar)

`aitri resume` for a project with drift re-approvals (Cesar, Phase 3 re-approved 4/22/2026) emits:

```
## ⚠ Re-approved After Drift — Verify Content
The following phases were re-approved after their artifact changed.
A human approved the change interactively, but content correctness is not guaranteed.
- Phase 3 — re-approved on 4/22/2026

If you are unsure, run: `aitri run-phase N` to regenerate the artifact from scratch.
```

The recommendation in [resume.js:254](../../lib/commands/resume.js#L254) only mentions `run-phase N` (which cascade-invalidates downstream phases — the heavy hammer). Since v2.0.0-alpha.3 we have `aitri rehash N` for the lighter case: artifact content matches HEAD, only the stored hash is stale. Operators reading this guidance get directed to the wrong tool when the right one (rehash) would preserve downstream phases.

**Fix shape (one-line addition to the note):** mention rehash conditionally — when the relevant artifact has no uncommitted changes vs HEAD (same condition `aitri rehash` itself checks), include a hint like: `If the drift was a stale hash on already-correct content, see also: aitri rehash <phase>`.

**Why kept (not in BACKLOG yet):** small fix, no schema implication. Bundle into the alpha.5 polish round alongside H5 if that ships.

**Reopen criterion:** any operator ever uses `aitri run-phase N` over `aitri rehash N` and cascade-invalidates unnecessarily. Cesar's 4/22 re-approval predates alpha.3 so it doesn't count, but future ones will.

---

## History

This file previously held ~270 lines of per-session observations (Ultron 2026-04-22 session A1–A6 + F1–F14; Hub 2026-04-24 session H1–H6). All shipped items landed in:

- **v0.1.90** — A1, A2, A3, A4, A5, F1, F2, F6, F12, F13 (individual fixes).
- **v2.0.0-alpha.1** — ADR-027 protocol redesign absorbing A1–A4 / F7 into the upgrade module; H1, H2 shipped as clean-project UX.
- **v2.0.0-alpha.2** — H3 (documented in SCHEMA.md + ADR-028), plus the three deferred items confronted in the 2026-04-24 review: `--dry-run` flag, `resume` brief default / F8, terminal-state next-action / F11.
- **v2.0.0-alpha.3** — H6 (third-project canary completed): Zombite ran cleanly, surfaced legacy hash drift class, resolved via new `aitri rehash` command (A5). Catalog of supported drift classes now covers modern schema drift, state backfills v0.1.65 → v0.1.82, and legacy hash bookkeeping.

Items correctly rejected with rationale (F3 audit-quality honor system, F14 git boundary, etc.) are recorded in BACKLOG.md under "Discarded" or absorbed into ADR-027 addendum §5.

The full per-session notes are preserved in git history (pre-v2.0.0-alpha.2) — retrieve via `git log docs/Aitri_Design_Notes/FEEDBACK.md` when historical context is needed.
