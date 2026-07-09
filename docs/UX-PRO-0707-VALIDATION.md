# UX-PRO-0707 — Validation handoff

> **VALIDATED 2026-07-09** (independent session). Every §1 claim reproduced in sandboxes and
> held (Batch 1: 8/8 · Batch 2: 3/3 · Batch 3 via dedicated tests + deep review of 3.1);
> invariants and the "no contract change" claim confirmed by an adversarial diff review.
> The findings that survived verification (all honesty/dead-end-guidance class: the
> `format.js` phantom pin, the silent root-IDEA move on re-init, `verify-complete`/`approve`
> gates still emitting dead-end steps, `Unknown phase "undefined"`, the pathless seed hint)
> were fixed at the root in **rc.168** — see `docs/CHANGELOG.md`. Suite 2108 green.
> This file has served its purpose and is safe to delete.

> **Purpose:** let a FRESH session (or a different agent) independently validate the CLI UX
> overhaul without prior context. Everything needed is here. Scoped + dated — safe to delete
> once validation is signed off.
> **Date:** 2026-07-08 · **Branch:** `feat/upgrade-protocol` · **Range:** rc.161 (baseline) → rc.167.
> **Authoritative records:** `docs/CHANGELOG.md` (rc.162–167) + the test suite (executable spec).

---

## 0. Quick gate (do this first)

```bash
git log --oneline b4b3971..HEAD          # expect 6 UX-PRO-0707 commits (below)
npm run test:all                         # expect: tests 2098, pass 2098, fail 0
npm i -g . && aitri --version            # expect: Aitri v2.0.0-rc.167
```

Commits (newest first): `fb2e013` 3.2 · `3150722` B3p2 · `b2d8eba` B3p1 · `50e2d93` B2.2–2.3 ·
`e810ade` B2.1 · `9f9739f` B1. Each fix ships a dedicated test — a green suite IS the primary proof.

Reproduce any item below in a throwaway dir (never in this repo):
```bash
SB=$(mktemp -d); cd "$SB"; A=/path/to/Aitri/bin/aitri.js
```

---

## 1. Verified defects fixed — reproduce the AFTER, compare to BEFORE

### Batch 1 (rc.162)
| # | Command | BEFORE (rc.161) | AFTER (verify) |
|---|---|---|---|
| 1.1 | `aitri statsu` | full help dump, **exit 0** | `❌ Unknown command "statsu" / Did you mean "status"?`, **exit 1** |
| 1.1 | `aitri -v` / `version` | printed help | prints the version line |
| 1.2 | `aitri run-phase 1` in an empty dir | raw Node stack trace + **phantom `.aitri`** | `❌ …isn't an Aitri project`, exit 1, **no `.aitri` created** |
| 1.2 | `.aitri` exists, no IDEA.md → `run-phase 1` | stack trace + "0 words" warning | clean `Missing required file: IDEA.md`, no stack, no "0 words" |
| 1.3 | `approve 1` checklist | `no_go_zone has ≥ explicit …` (blank) | `no_go_zone has ≥3 explicit …` |
| 1.4 | `feature init "my feature"` | ✅ success + broken follow-ups | rejected + suggests `my-feature` |
| 1.5 | corrupt `.aitri` message | "restore from `.aitri.bak`" (the corruption) | steers to `git checkout`; `.bak` marked inspection-only |
| 1.6 | `reject 1` on an approved phase | `🔄 rejected` (state didn't change) | `REMAINS approved — advisory` |

### Batch 2 (rc.163–164)
| Area | Verify |
|---|---|
| 2.1 color | `NO_COLOR=1 aitri help` and `aitri help \| cat` → **0** ANSI escape codes; colored in a real TTY |
| 2.2 help | `aitri help` short (~62 lines); `aitri help --all` full; `aitri help init` → SETUP only; `aitri help verify-run` → TESTING GATE; `aitri help review` → PIPELINE; `aitri help zzz` → overview + note |
| 2.3 gate | at an early phase, `aitri verify-run` → `Build (Phase 4) must be approved … Next: aitri run-phase architecture` (NOT the old `approve 4`) |

### Batch 3 (rc.165–167)
| # | Verify |
|---|---|
| 3.1 | agent-mode `approve 1` headline → `✅ … APPROVED (recorded by agent — human confirmation pending)`; **the approval is still recorded** (agent/sandbox/CI approval stays supported) |
| 3.4 | `aitri help` no longer prints "Designed by …" (credit is in `package.json` `author`) |
| 3.3 #7 | `aitri run-phase 9` → `Unknown phase "9". … requirements(1) … deploy(5)` |
| 3.3 #1 | fresh project: `aitri status`/`resume` do NOT nag `aitri audit`; after a phase completes, it returns |
| 3.3 #3 | a Security NFR whose text opens with "Not applicable: …" → `resume` gives NO security-audit nudge; a real Security NFR alongside it still nudges |
| 3.3 #5 | `complete 2` with N unreferenced MUST FRs → ONE line listing ids (not N paragraphs) |
| 3.3 #9 | `complete 4` prints `Note: <runner> is NOT run here … verify-run executes it` |
| 3.2 | `aitri init` on an existing project → `ℹ️ Already an Aitri project … state untouched … aitri resume` (NOT "✅ initialized" + onboarding); after Phase-1 absorption it does NOT recreate a template IDEA.md |

---

## 2. Investigated and deliberately NOT built (do not flag as "missing")

Each was checked against the code and found to be a non-problem; forcing it would add churn or a regression. Tombstoned with a trigger.

- **2.1 glyph sweep (~294 sites):** `✅/❌` already consistent; `verify.js`/`verify-display.js` use `✓/✗/⊘` as a **deliberate documented** verdict-vs-item hierarchy; `verify-parsers.js` glyphs **match foreign runner output** (node:test/Vitest/Jest/Playwright) and must stay raw; persona `✅/❌` are prompt content. The color pin covers the real (tier-1) part.
- **2.4 unify PIPELINE-INSTRUCTION footer:** `templates/AGENTS.md` already tells agents to follow the next-action of each command and enumerates INSTRUCTION / ⏸ CHECKPOINT / branch; unifying would **erase** the proceed-vs-stop-for-human distinction.
- **2.5 persist briefings to disk:** re-read is already covered by the idempotent re-read; a `briefings/` dir with no consumer is the "for completeness" anti-pattern.
- **3.1(b) hard approval gate default-ON:** would break agent/CI/sandbox approval (Aitri's own suite drives full pipelines non-TTY). The hard stop stays opt-in via `humanApprovalGate: true`.

## 3. Deferred nits (optional, low value, none block)

- **3.3 #2** post-`validate` "finish line" — touches the canary-scarred deployable/validate next-action ladder; needs a persisted "validated" signal.
- **3.3 #4** untouched-template-IDEA next action — needs template-vs-content detection.
- **3.3 #6** `resume` layout reorder (Next Action above advisories) — resume-order test churn.
- **3.3 #8** batch drip-feed validation into one report — validator refactor.
- **3.4** help line width ≤100 cols — mostly a byte-vs-display measurement artifact (the `─` rules are 3 bytes/char).
- **1.1** unknown *flags* still tolerated (`aitri status --banana` → exit 0) — flag validation is a larger surface.

## 4. Method note

Scope was set by reading the code, not the plan's line count — several plan items were premises that did not survive the code (see §2). `CLAUDE.md` Go/no-go was reframed this session (maintainer request) to bias toward decisive root-cause fixes while keeping the load-bearing gates (tests, adversarial pass, invariants, honest recording). No schema / artifact-chain / `.aitri` contract changed across rc.162–167.
