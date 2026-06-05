# AGENTS.md — Aitri Pipeline Rules

This project is managed with **Aitri** — an SDLC pipeline CLI.
All agents (Claude, Codex, Gemini, GitHub Copilot, etc.) must follow these rules.

For the full command surface and flags, run `aitri help`. This document covers the **rules** — what to run, when, and why — not every command's syntax.

---

## Starting a session

Always run first:

```
aitri resume
```

This gives you the current pipeline state, open requirements, test coverage, pending bugs, drift status, and your next action.
Do not start working without it.

If `aitri resume` or `aitri status` reports a version mismatch (CLI version vs project's recorded version), run `aitri adopt --upgrade` first. Gates depend on matching versions; trying to work around a mismatch corrupts state.

---

## Starting a NEW project — capturing intent is the highest-leverage step

If there is no `.aitri` yet, run `aitri init`. It creates `IDEA.md` (the seed) + config. **The intent you capture here is the only unrecoverable input — everything downstream is faithful execution of it.** So before generating anything:

- **Read the provided context FIRST.** If the user pointed you at files, the `idea_context/` folder (root project) or `feature_context/` (a feature), a repo, mockups, or a prior doc/PRD, READ them and derive the problem/users/success from that material. Do not re-ask what a provided document already states. (For greenfield projects, run `aitri wizard` for a guided interview, or write `IDEA.md` directly.)
- **Designated vs self-discovered context — this decides `confirmed` vs `assumed`.** Context the user *designated* (the `idea_context/` / `feature_context/` folder, or a path/file they pointed you to) may ground a `confirmed` provenance. Context you *found on your own* by scanning the project — a folder nobody told you to use — is `assumed` until you confirm its source with the user: it could be stale, a draft, or another project's material. Never treat a self-discovered folder as authoritative ground truth without confirming it first.
- **Confirm the three high-stakes inputs with the user — do NOT silently infer them:** the real problem, the success metric (measurable), and the no-go zones / out-of-scope. These are the inputs whose errors are unrecoverable. Mark anything you inferred as `[ASSUMPTION] …` so Phase 1's provenance gate tracks it.
- **Match the effort to the project (proportional).** A landing-page MVP needs a tight, honest pass — a clear problem, the user, one measurable success, the obvious out-of-scope — not a giant process. A complex system needs full context ingestion + elicitation. Don't manufacture ceremony for something small. Iterate agile: ship the MVP, then add capabilities as **features** (`aitri feature init <name>`), each its own proportional mini-pipeline.
- **Optional:** `aitri run-phase discovery` produces a structured, confirmed problem understanding (`00_DISCOVERY.md`) that Phase 1 reads — recommended for anything beyond trivial; it is where the context-ingest + confirm above is formalized. Add `--guided` to run a fixed problem-definition interview; in agent mode (no TTY) it prints the questions for YOU to put to the user, then the discovery briefing.

`aitri help` shows what each artifact maps to in industry terms (`01_REQUIREMENTS ≈ PRD/SRS`, `02_SYSTEM_DESIGN ≈ TRD/SDD`, …).

---

## During the pipeline

- Follow the next-action Aitri prints at the end of each command. When it is a **PIPELINE INSTRUCTION** (a single authoritative step — e.g. after `approve` or `verify`), do exactly that and nothing else. When the command offers a branch (e.g. `complete` → `approve` or `reject`; `status`/`resume` → `Next:`), take the step the situation calls for.
- Do not invent an action Aitri did not offer.
- Do not skip phases, re-open approved phases, or implement before Phase 4 is approved.
- Do not write code during Phases 1, 2, 3. These are planning phases.
- Optional phases (`discovery`, `ux`, `review`) only run when Aitri tells you to. Do not invoke them speculatively.
- **`approve` is a human-review checkpoint, not a rubber stamp.** Every `aitri approve <phase>` prints the artifact summary and the phase's Human Review checklist. Present these to the user and get their confirmation — do NOT chain `approve 1 → 2 → 3 → 4 → 5` autonomously. If the project sets `"humanApprovalGate": true` in `.aitri`, agent-mode `approve` is blocked and a human must run it (typical on larger projects; small projects / MVPs approve autonomously by default).
- **The Code Review phase verdict (`review`) is advisory by default.** A PASS/CONDITIONAL_PASS/FAIL verdict does not mechanically gate Phase 5 — surface it to the user and act on a FAIL; do not treat it as auto-blocking or auto-passing. A project can opt in by setting `"reviewGate": true` in `.aitri`, which makes a `FAIL` verdict in `04_CODE_REVIEW.md` **block** `aitri verify-complete` (CONDITIONAL_PASS/PASS still proceed; an absent review never blocks).
- **Seeding / Phase 1 — confirm ground-truth inputs, do not silently infer them.** The seed (IDEA.md → `01_REQUIREMENTS.json`) is the highest-value input in the pipeline; getting it from the user is your job, not guessing it. For the five Tier-A fields — problem, users, baseline, success_metric, no_go_zone — confirm each with the user; mark anything you inferred as assumed and record it in `idea_gaps`. On a fresh seed, `aitri complete 1` blocks if `idea_provenance` is missing or an `assumed` field is not carried in `idea_gaps`. Never label a field `confirmed` the user did not actually confirm.

---

## When verify-run fails or produces skipped tests

`aitri verify-run` writes `04_TEST_RESULTS.json`. If tests fail or skip unexpectedly:

- Register the failure as a bug — accept the prompt that `verify-run` offers, or run `aitri bug add` manually.
- Fix the implementation, re-run `aitri verify-run`, then `aitri verify-complete` when the run is clean.
- Critical/high open bugs **block** `aitri verify-complete`, `aitri reconcile --resolve`, and the deploy gate. The next-action ladder will route you to bug work before anything else.

For tests that genuinely cannot be automated (manual QA, external systems): `aitri tc mark-manual <TC-ID>` sets the TC's `automation` field to `manual` so the e2e coverage gate accepts it without an automated runner.

**Test rigor signals (verify-run):**
- `aitri verify-run --coverage-threshold <N>` measures line coverage and flags it below `N`. Works across stacks (node, `go test`, `pytest`, `jest`/`vitest`) — the coverage tool must already be in the project's deps.
- `verify-run` flags **low-confidence TCs** (≤1 assertion — tests that may pass without verifying real behavior). This is a warning by default. A project can set `"strictAssertions": true` in `.aitri` to make `aitri verify-complete` **block** until each flagged TC has real assertions tied to its `expected_result`. If verify-complete blocks on this, add assertions that exercise the behavior (not constants / `assert.ok(true)`), then re-run `verify-run`.
- **Code-quality gates.** Declare your stack's lint/type-check/security commands in `04_BUILD_REPORT.json#quality_gates` (`[{ name, command, required }]`). `verify-run` runs each and gates on its exit code: a failing `required` gate (default) blocks `verify-complete` and flips `verifyPassed`, exactly like a failing test. Tests prove behavior; quality_gates prove the code is well-built. Declare only tools the project actually has configured; use `required: false` for advisory gates you are adopting gradually.

---

## Code changed outside the pipeline

If `aitri status` reports `reconcile: pending` and the next-action is `aitri reconcile`:

- Run `aitri reconcile` to classify the changes.
- If the diff is refactor or already-registered bug fixes, **commit your fixes first** (including any edit `verify-run` forced), then run `aitri reconcile --resolve` (TTY-gated; requires tests passing, no blocking bugs, and a clean working tree — `--resolve` stamps the baseline at the current commit and rejects while behavioral files are uncommitted, or they re-trigger reconcile after you commit them).
- If the diff contains functional behavior changes, route them through the pipeline: `aitri feature init <name>` or `aitri run-phase requirements` for a root-pipeline change.

The behavioral allowlist filters out documentation, build manifests, lockfiles, CI configs, and generated assets — those will not trigger `reconcile: pending` by themselves.

---

## Artifact drift

If an artifact was modified after approval, `aitri status` shows `⚠️  DRIFT` on that phase. Two paths:

- **Content drift** (meaningful edits to artifact content): run `aitri approve <phase>` to re-approve. Aitri TTY-gates the re-approval and walks you through a review checklist. Re-approving cascade-invalidates downstream phases.
- **Bookkeeping drift only** (hash stale but content effectively unchanged — e.g. after a `git rebase` rewrote the artifact identically): `aitri rehash <phase>` updates the stored hash in place without cascading. Use this **only** when you have read the diff and confirmed nothing semantic changed.

---

## When the pipeline is complete

If `aitri status` shows all phases approved and `deployable: Ready`:

- Run `aitri validate` to confirm deployment readiness.
- Do **NOT** re-open approved phases (`aitri run-phase 1`, etc.).
- Do **NOT** implement new functionality outside the pipeline.

If `aitri status` recommends `aitri audit` — run it. The audit is a separate evaluative pass on the completed pipeline; it produces `AUDIT_REPORT.md` and informs whether deploy readiness has degraded since the last audit.

If `aitri resume` says the project is idle (all green, no drift, fresh verify, fresh audit), there is nothing to do. Do not invent work.

---

## Adding new functionality

Three tiers — pick the right one **by size**, not just "is this new behavior?":

- **Trivial** (typo, colour value, single-line CSS, a config value, a comment, a log message): implement directly. No Aitri command.
- **Small** (one-field form addition with no new validation logic, layout/CSS change in a single component, label/copy change that does not alter user-facing contract, additive optional config field): implement directly. No Aitri command.
- **Feature** (new flow, schema migration, cross-component change, new endpoint, new business rule — anything the user could describe in a sentence as "a thing the product does"): `aitri feature init <name>`, then follow the feature pipeline (`run-phase requirements` → … → `approve deploy`).

**When in doubt about behavior change**, lean feature.
**When in doubt about size**, prefer smaller scope first.

The bias toward "treat as feature" is intentional only for **behavioral** ambiguity — not for size. A small, well-scoped change does not need the full pipeline just because the title sounds new.

---

## Feature sub-pipelines

Features are independent sub-pipelines under `features/<name>/`. Each has its own `01_REQUIREMENTS.json`, tests, manifest, etc.

- All feature commands prefix as `aitri feature <verb> <name> [<phase>]`. Examples: `aitri feature run-phase auth requirements`, `aitri feature approve auth 1`, `aitri feature verify-run auth`.
- Always follow the PIPELINE INSTRUCTION at the end of each feature command — it emits the correctly scoped next-action with the right prefix.
- Approving feature Phase 4 advances both the feature's reconcile baseline AND the root project's baseline (rc.1+). You should not need to manually `aitri reconcile` on the root after a clean feature completion.

---

## Bugs lifecycle

`aitri bug add` writes to `spec/BUGS.json`. Subsequent transitions:

- `aitri bug fix <BG-ID>` — developer marks it resolved.
- `aitri bug verify <BG-ID>` — auto-set when the linked TC passes in `verify-run`, or manual.
- `aitri bug close <BG-ID>` — archive.

Critical and high severity bugs in `open` or `in_progress` state block: `verify-complete`, `reconcile --resolve`, and the deploy gate.

---

## Backlog and audit (off-pipeline)

- `aitri backlog` — manages `spec/BACKLOG.json` (CLI-tracked items). The project root also gets a hand-written `BACKLOG.md` for narrative items — both surfaces coexist; Aitri does not parse the Markdown version.
- `aitri audit` — evaluative pass on the completed pipeline. Produces `AUDIT_REPORT.md`. Deploy gate prefers a fresh audit (<60 days).

---

## What NOT to do

- Do not edit `.aitri/` files directly. The state schema is owned by Aitri; edit via the commands.
- Do not invent new artifact files or rename existing ones. The artifact chain is the contract.
- Do not skip the PIPELINE INSTRUCTION. If Aitri tells you the next action, run that — even if you "know" a shortcut.
- Do not run `aitri approve` on a phase that has not been validated by `aitri complete`.
- Do not implement during planning phases (1, 2, 3).
