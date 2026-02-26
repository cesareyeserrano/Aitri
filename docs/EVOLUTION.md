# Aitri Evolution Backlog

## 🟢 Ready for Implementation

| ID | Feature | Notes |
|----|---------|-------|
| EVO-025 | `aitri status` — redesign CLI + HTML output: visual pipeline timeline (draft→approve→plan→build→testgen→contractgen→prove→deliver), health indicator (🔴/🟡/🟢), prioritized issues, single clear next action; readable by tech and non-tech | Data model stays; only presentation changes |
| EVO-026 | Feature Input Template — `FEATURE_INPUT_TEMPLATE.md` with structured minimum-viable-input format (problem, actors, business rules, concrete input→output examples, success criteria, priority); adjust `aitri draft` to detect and use structured input, reducing wizard friction and LLM hallucination risk | Highest ROI: improves all downstream artifacts |
| EVO-027 | Enrich `af_spec.md` — add `Examples` block per FR (concrete input→output pairs), optional type hint, priority field (P0/P1/P2), explicit business rules section; update `approve` quality gate to reward richer specs | Directly improves `testgen` and `contractgen` output quality |
| EVO-028 | `aitri audit` — two-mode auditor: spec-aware (spec-to-code drift, FR coverage gaps, stale proofs, weak mutation scores) + code-only (runs when no spec exists: static analysis, LLM reverse-engineering of intent, anti-patterns); prioritized findings (CRITICAL/HIGH/MEDIUM/LOW) with impact; outputs human report + `--json` for CI | Enables project health check for both greenfield and brownfield |

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
