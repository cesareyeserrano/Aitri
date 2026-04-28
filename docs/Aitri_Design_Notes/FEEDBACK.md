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

---

## History

This file previously held ~270 lines of per-session observations (Ultron 2026-04-22 session A1–A6 + F1–F14; Hub 2026-04-24 session H1–H6). All shipped items landed in:

- **v0.1.90** — A1, A2, A3, A4, A5, F1, F2, F6, F12, F13 (individual fixes).
- **v2.0.0-alpha.1** — ADR-027 protocol redesign absorbing A1–A4 / F7 into the upgrade module; H1, H2 shipped as clean-project UX.
- **v2.0.0-alpha.2** — H3 (documented in SCHEMA.md + ADR-028), plus the three deferred items confronted in the 2026-04-24 review: `--dry-run` flag, `resume` brief default / F8, terminal-state next-action / F11.
- **v2.0.0-alpha.3** — H6 (third-project canary completed): Zombite ran cleanly, surfaced legacy hash drift class, resolved via new `aitri rehash` command (A5). Catalog of supported drift classes now covers modern schema drift, state backfills v0.1.65 → v0.1.82, and legacy hash bookkeeping.
- **v2.0.0-alpha.5** — H5 (verify ratio dissonance) shipped as three-bucket display `(P ✓ F ✗ D ⊘)` across status / resume / validate. H7 (rehash hint inside post-event "Re-approved After Drift" section) discarded — surface is post-hoc and rehash is a no-op there; the equivalent hint at fresh-drift time already lives in `approve` (A5b, alpha.3).
- **v2.0.0-alpha.6 (REGRESSION — corrected in alpha.7)** — Initial scope-aware command emission shipped: every PIPELINE INSTRUCTION and template instruction line gained a `featureRoot`-aware prefix to prevent feature pipelines from emitting commands that targeted the parent project. Closed the destructive Ultron canary 2026-04-27 finding. **However**, the helper produced grammatically broken commands (`aitri feature <name> <verb>`) — CLI parses verb-first per `feature.js`. Internal tests passed because the test author and the helper author held the same wrong mental model. Caught at handoff #1 of the alpha.6 Ultron canary; documented in ADR-029.
- **v2.0.0-alpha.7** — Scope grammar correction. `commandPrefix(...) → string` replaced by `scopeTokens(...) → { verb, arg }`. Templates use `{{SCOPE_VERB}}` + `{{SCOPE_ARG}}`. Round-trip test in `test/scope.test.js` extracts every `aitri feature <X> <Y>` from synthetic output and verifies `<X>` is a verb feature.js routes — blocks the alpha.6 inversion in CI. Ultron canary on alpha.7 validated end-to-end (6/6 emissions copy-paste literal). 5 secondary findings surfaced and registered in BACKLOG.
- **v2.0.0-alpha.8** — Go test runner output parser. `parseGoOutput()` consumes `go test -v` output (`--- PASS|FAIL|SKIP: TestTC_XXX`); reuses existing `extractTCId()` for `TC_NM_001h` → `TC-NM-001h` normalization. Subtests excluded by column-0 anchor + char class. Stderr warning when runnerHint is `go test` without `-v`. Closes one of the 5 alpha.7 canary findings; the other 4 remain open in BACKLOG.

Items correctly rejected with rationale (F3 audit-quality honor system, F14 git boundary, etc.) are recorded in BACKLOG.md under "Discarded" or absorbed into ADR-027 addendum §5.

The full per-session notes are preserved in git history (pre-v2.0.0-alpha.2) — retrieve via `git log docs/Aitri_Design_Notes/FEEDBACK.md` when historical context is needed.
