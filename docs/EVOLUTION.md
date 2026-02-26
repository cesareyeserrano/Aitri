# Aitri Evolution Backlog

## 🟢 Ready for Implementation

| ID | Feature | Notes |
|----|---------|-------|

## 🗃️ Descartado / Won't Do

| ID | Feature | Razón |
|----|---------|-------|
| EVO-030 | `aitri kickoff` wizard | EVO-034 + EVO-035 resuelven la misma fricción de forma quirúrgica sin riesgo de gate integrity; wizard colapsado añade complejidad sin valor incremental |

## 🟡 In Progress

_(none)_

## 🔴 Done

| ID | Feature | Delivered |
|----|---------|-----------|
| EVO-META | Relay Protocol — `aitri checkpoint` / `aitri resume` | v0.3.x |
| EVO-001 | Auditor Mode — `aitri plan --ai-backlog --ai-tests` | v0.4.0 |
| EVO-002 | Semantic validation gate — `aitri verify-intent` | v0.4.0 |
| EVO-003 | State-aware context engine — `aitri diff` | v0.4.0 |
| EVO-004 | Architecture + docs realignment | v0.5.0 |
| EVO-005 | TC marker regex relaxed (`// TC-1` without colon) | v0.4.0 |
| EVO-006 | Contract-test scaffold linkage (`{{CONTRACT_IMPORT}}`) | v0.4.0 |
| EVO-007 | Flexible spec heading numbering in `aitri approve` | v0.4.0 |
| EVO-008 | Project adoption — `aitri adopt` (3 phases) | v0.5.0 |
| EVO-009 | Version-aware migration runner — `aitri upgrade` v2 | v0.5.0 |
| EVO-010 | Doc policy enforcement — `aitri doctor` DOC-POLICY check | v0.5.0 |
| EVO-011 | Structural spec quality gate in `aitri approve` (non-LLM) | v0.5.0 |
| EVO-012 | Contract import coverage — `aitri verify-coverage` | v0.5.0 |
| EVO-013 | Proof of Compliance — `aitri prove` (per-TC execution → FR proof record) | v0.6.0 |
| EVO-014 | `status.js` — `prove_pending` state in state machine (`aitri resume` recommends `aitri prove`) | v0.7.0 |
| EVO-015 | Split `discovery-plan-validate.js` (910→579 lines) — extracted `validate.js` | v0.7.0 |
| EVO-016 | `aitri prove` multi-language runner — detect `.py` → pytest, `.go` → go test, `.mjs/.js` → node | v0.7.0 |
| EVO-017 | SKILL.md adapters — migrate `scaffold + implement` to unified `aitri build` | v0.7.0 |
| EVO-018 | `aitri prove --json` output mode for CI pipelines | v0.7.0 |
| EVO-019 | `ai-client.js` soft budget updated (125 → 170) | v0.7.0 |
| EVO-020 | Trivial stub detection in `aitri prove` — FR marked UNPROVEN when stub imports contract but never invokes it | v0.7.0 |
| EVO-021 | `aitri testgen` — LLM generates behavioral test bodies from FR + AC (Given/When/Then) + contract signatures, replacing scaffold placeholders | v0.8.0 |
| EVO-022 | Contract completeness gate in `aitri prove` — static check: if stub invokes contract but contract still has "Not implemented" placeholder, FR is UNPROVEN | v0.8.0 |
| EVO-023 | `aitri prove --mutate` — mutation testing engine: applies 9 operator mutations to contract files, re-runs stubs, reports detection rate (advisory confidence score) | v0.8.0 |
| EVO-024 | `aitri contractgen` — LLM reads FR text + AC + test stubs → generates real contract implementations, replacing scaffold placeholders; closes full automated spec→code cycle | v0.9.0 |
| EVO-027 | Spec parser enrichment — `extractTaggedItems` now captures multi-line FR sub-bullets; `detectTechStack` reads explicit `Tech Stack:` field (confidence: explicit); `af_spec.md` template updated with Tech Stack field + FR sub-bullet guidance | v0.9.0 |
| EVO-029 | Codebase cleanup — remove misleading `@deprecated` annotations (functions are active fallbacks); replace TC Steps with compact `- AC: Given/when/then` format; remove cosmetic EP-N IDs; sync all docs + adapters to v0.9.0 commands (`build/testgen/contractgen`); fix stale CLI messages in 5 commands | v0.9.0 |
| EVO-026 | Feature Input Template — `FEATURE_INPUT_TEMPLATE.md` structured input form (problem/actors/business rules/examples/success criteria/tech stack/priority); `aitri draft --input <file>` parses directly to FR-*/AC-* spec; `parseFeatureInput()` exported; 5 regression tests | v0.9.0 |
| EVO-028 | `aitri audit` — hybrid static + LLM engine: static layer (missing spec/build/proof, contract placeholders, unproven FRs, trivial TCs, low mutation score, proof staleness); LLM Compliance Auditor (spec-to-code drift, `--no-ai` skippable); code-only mode (no spec → LLM reverse-engineers contracts, recommends `aitri adopt`); CRITICAL/HIGH/MEDIUM/LOW findings; CLI report + `--json`; 11 regression tests | v0.9.0 |
| EVO-025 | `aitri status` redesign — CLI: pipeline timeline (draft→approve→plan→go→build→prove→deliver with ✓/· per stage), 🔴/🟡/🟢 health indicator, prioritized issues list, single clear Next+Why lines; HTML: pipeline row with color-coded badges, confidence pill, score breakdown, issues list; data model unchanged; 1 test updated | v0.9.0 |
| EVO-034 | **UX friction — remove redundant confirmProceed**: removed `confirmProceed()` from `init`, `build`, `deliver`; kept in `approve` (correction flow) and `go` (irreversible human gate); `--yes`/`--non-interactive` remain for CI; 2 smoke tests updated | v1.0.2 |
| EVO-035 | **Spec-aware discovery**: `collectDiscoveryInterview()` now receives spec content; if spec has rich fields (real Actors, Context >20 chars, AC-N entries), auto-populates discovery from spec and skips 6–13 question wizard; `--guided` forces full interview; `extractSpecContext()` maps spec sections to discovery fields; applies to both `aitri discover` and inline discover inside `aitri plan` | v1.0.2 |
| EVO-032 | **Critical bug fix** — `testgen` and `contractgen` invisible to state machine: `computeNextStep()` now adds `testgen_pending` and `contractgen_pending` states between verify and prove; placeholder detection via file scan (`assert.fail(`, `Not implemented`); pipeline display expanded to 9 stages (build→testgen→contractgen→prove); legacy scaffold flow unaffected; 3 test assertions updated; 218 tests green | v1.0.1 |
| EVO-031 | **`aitri resume` redesign** — replaces raw DEV_STATE.md cat with a structured Step N of M pipeline checklist (✓/○ per stage), Next + Why lines, `--json` mode for CI; `buildResumeStages()` derives 9-stage state from status report; delivery_complete shows "Pipeline complete" message; 2 smoke test assertions updated; 218 tests green | v1.0.3 |
| EVO-033 | **`aitri serve`** — local dev-server launcher: detects stack (Node/Python/Go/static), resolves entry point, starts server in foreground; soft gate: hard-blocks if build missing, warns (continues) if `prove` not passed; `--entry` overrides auto-detection; `--dry-run` prints command without starting; `--open` opens browser; `--json` for CI; side tool, not a pipeline step; 5 smoke tests; 223 tests green | v1.0.4 |
