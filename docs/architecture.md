# Aitri: Architecture and Operating Model

## Purpose
Aitri is a **Disciplined Agentic Skill** — a spec-driven SDLC engine that bridges the speed of AI-generated software with the rigor of traceable, verifiable delivery.

**Vision: "Bolt.new with Discipline"** — The power of an AI agent generating software at speed, with Aitri as the engineering conscience that enforces traceability, quality gates, and human approval at every critical decision point.

It operates primarily as a **skill consumed by AI agents** (Claude, Codex, OpenCode) as their system of record for software delivery, and is also available for direct terminal use.

Core model:
- **Humans** define high-level intent and approve at each gate (spec approval, go, delivery)
- **AI agents** handle Markdown authoring, backlog generation, tests, and implementation under Aitri's enforcement contract
- **Aitri** acts as the Engineering Conscience — audits agent-generated artifacts, enforces traceability, and certifies delivery
- Requirements are authored explicitly by the human or by an agent reflecting the human's intent; Aitri does not invent requirements

Roles:
- Aitri is the **plant engineer** — directs, audits, validates, and certifies
- AI agents are the **workers** — generate content (backlog, tests, code) following Aitri's structured contracts
- Humans are the **owners** — define intent, approve specs, authorize delivery
- The factory cycle is closed: `idea → spec → plan → scaffold → implement → verify → deliver`

Auditor Mode (EVO-001):
- Aitri's role has shifted from **author** (inferring backlog/tests via heuristics) to **auditor** (validating agent-authored content for FR/AC/US traceability)
- AI agents generate backlog and test files; Aitri validates them before any write occurs
- Use `aitri plan --ai-backlog <file> --ai-tests <file>` to activate Auditor Mode
- Legacy inference path is retained for backward compatibility

## Product Positioning
Aitri is:
- A spec-driven software factory with closed delivery cycle
- A deterministic workflow engine that orchestrates AI-assisted implementation
- A reusable skill context that generates structured implementation briefs for AI agents
- A verification engine that maps test results to declared specifications

Aitri is not:
- A standalone code generator (it directs AI agents, not generates code itself)
- A replacement for product or architecture ownership
- A system that bypasses human approval
- A documentation-only tool — it delivers functional, verified software

## Non-Negotiable Principles
1. Spec first: no implementation without a written specification.
2. Approved spec required: no downstream artifacts without `specs/approved/<feature>.md`.
3. Explicit gates: write or destructive actions require a plan and approval.
4. Traceability required: Spec -> Backlog -> Tests -> Implementation.
5. Human authority: final decisions always remain with the human owner.
6. Requirement source integrity: requirements must come from explicit user input; inferred requirements are rejected.

## SDLC Coverage Target
Under human supervision, Aitri covers the complete software delivery lifecycle:

### Pre-Go Phase (Governance)
1. Discovery and requirement capture (`discover`)
2. Formal specification (`draft`, `approve`)
3. Planning with real content generation — concrete stories, tests, architecture (`plan`)
4. Traceability and quality validation (`validate`)
5. Runtime verification (`verify`)
6. Policy enforcement (`policy`)
7. Human approval gate (`handoff`, `go`)

### Post-Go Phase (Factory)
8. Project scaffold generation — executable test stubs, interface contracts, config (`scaffold`)
9. Implementation orchestration — structured briefs for AI agents, ordered by dependency (`implement`)
10. Closed-loop verification — TC-to-executable mapping, FR coverage reporting (`verify`)
11. Delivery gate — all FRs covered, all TCs passing, confidence threshold met (`deliver`)

## Scope Boundaries (Current)
In scope:
- CLI-first operation with closed delivery cycle
- deterministic command flow from idea to delivered software
- traceability and quality gates at every phase
- agent skill support under human control
- real content generation (concrete stories, tests, architecture from spec data)
- project scaffold generation (executable tests, interface stubs, config)
- structured implementation briefs for AI agents
- closed-loop verification (TC-to-executable mapping, FR coverage)
- delivery gate with confidence threshold
- implementation/deployment assistance with explicit human approval

Out of scope:
- autonomous multi-agent orchestration without human gates
- dashboard-first operation
- mandatory external SaaS integrations
- opaque scoring systems without deterministic controls
- automatic production deployment without explicit human confirmation
- direct code generation by Aitri (AI agents implement, Aitri directs)

Definition of done baseline:
1. End-to-end CLI works from idea to delivered software in greenfield and brownfield projects.
2. Generated backlogs and tests contain real content derived from spec, not placeholders.
3. Scaffold produces executable test stubs and interface contracts traced to spec.
4. Implementation briefs provide AI agents with complete, ordered context per story.
5. Verification maps test results to TC-* declarations and reports FR coverage.
6. Delivery gate blocks when FRs are uncovered or TCs are failing.
7. Validation and verification fail clearly when quality gates are not met.
8. Status/handoff guidance is deterministic across all phases.
9. Documentation preserves continuity without relying on one maintainer.
10. Agent skills execute full factory flow without bypassing gates.

## Stabilization State (2026-02-20)
- Critical stabilization window: CLOSED (H-001/H-002/H-003 verified)
- Phase G (Production Quality Hardening): baseline delivered
- Phase H (Software Factory Transformation): baseline delivered
- EVO backlog: EVO-001 through EVO-009 complete (EVO-008 all 3 phases complete)
- Auditor Mode: ACTIVE — `aitri plan --ai-backlog/--ai-tests` available
- New commands: `verify-intent`, `diff`, `spec-improve`, `checkpoint`, `adopt`, `upgrade` (v2)
- Source of truth: `docs/STRATEGY_EXECUTION.md`

## Artifact Topology
Standard project structure (pre-go):
- `specs/drafts/`
- `specs/approved/`
- `docs/discovery/`
- `docs/plan/`
- `backlog/<feature>/backlog.md`
- `tests/<feature>/tests.md`
- `docs/verification/<feature>.json`
- `docs/policy/<feature>.json`

Factory artifacts (post-go):
- `src/` — scaffolded project structure (components, services, models, routes)
- `tests/<feature>/generated/` — executable test stubs traced to TC-*
- `docs/implementation/<feature>/US-<n>.md` — per-story implementation briefs
- `docs/implementation/<feature>/IMPLEMENTATION_ORDER.md` — dependency-ordered execution plan
- `docs/delivery/<feature>.json` — machine-readable delivery evidence
- `docs/delivery/<feature>.md` — human-readable delivery report

Extended artifacts:
- architecture notes per feature
- release/deploy runbooks
- operational checklists

## Command-Level Flow (Complete Factory)

### Pre-Go Phase (Governance and Planning)
1. `aitri init` — initialize project structure
2. `aitri draft` — create draft spec from idea
3. `aitri spec-improve` — AI-powered spec quality review (identify ambiguous FRs, missing edge cases)
4. `aitri approve` — validate and approve spec
5. `aitri discover` — generate discovery artifact with real interview data
6. `aitri plan` — generate plan, backlog, and tests from spec
   - Default: Aitri infers content from spec (legacy)
   - Auditor Mode: `--ai-backlog <file> --ai-tests <file>` — validate agent-authored content before writing
7. `aitri verify-intent` — semantic validation: confirm User Stories satisfy FR intent (LLM-powered)
8. `aitri diff --proposed <file>` — compare current backlog against proposed agent update (Backlog Delta)
9. `aitri validate` — verify traceability, coverage, and persona gates
10. `aitri verify` — execute runtime verification
11. `aitri policy` — run managed policy checks
12. `aitri handoff` — present handoff status
13. human GO/NO-GO decision
14. `aitri go` — enter implementation mode (only after GO)

### Post-Go Phase (Factory Execution)
15. `aitri scaffold` — generate project structure, executable test stubs (with auto-imported contracts), interface stubs
16. `aitri implement` — generate ordered implementation briefs for AI agents
17. AI agent implements each US-* brief following Aitri's instructions
18. `aitri verify` — (enhanced) map test results to TC-*, report FR/US coverage
19. Repeat 17-18 per story until all US-* are implemented
20. `aitri deliver` — final gate: all FRs covered, all TCs passing, confidence met

### Session Continuity
- `aitri checkpoint [message]` — save development state to `.aitri/DEV_STATE.md` (Relay Protocol)
- `aitri checkpoint show` — display current session state
- `aitri resume` — restore recommended next action after context loss

## Agent Integration Model
Aitri is consumed as a skill by AI agents. The agent is not just an implementation worker — it is also a **content author** whose output Aitri validates before writing.

Target environments:
- Claude (Claude Code)
- Codex
- OpenCode
- Other terminal-capable agents

Agent contract (pre-go / Auditor Mode):
- Run `aitri resume` or `aitri checkpoint show` at session start to restore context
- Generate backlog and test files following the Aitri markdown format (US-N, TC-N, FR/AC traces)
- Submit agent-authored content for validation: `aitri plan --ai-backlog <file> --ai-tests <file>`
- Aitri audits traceability before writing — fix any reported issues before retrying
- Run `aitri verify-intent` to confirm semantic alignment between User Stories and FRs
- Run `aitri diff --proposed <file>` before submitting a backlog update to review the delta
- Execute one SDLC step at a time; respect gates and approval points
- Report outcomes and the `recommendedCommand` from `aitri resume json`

Agent contract (post-go / factory execution):
- Run `aitri scaffold` to generate project skeleton with auto-linked contract imports in test stubs
- Run `aitri implement` to receive ordered implementation briefs
- Implement each US-* brief in the order specified by `IMPLEMENTATION_ORDER.md`
- After each US-*, run `aitri verify` to confirm TC-* pass
- Use scaffold interface stubs as contracts — do not change function signatures without spec update
- Do not skip stories or change implementation order
- When all stories pass: run `aitri deliver` for final gate

Session continuity contract:
- Run `aitri checkpoint "<context>"` before ending a session
- New sessions start with `aitri checkpoint show` to read the last saved state
- See `docs/guides/SELF_EVOLUTION.md` for the full Relay Protocol

## Persona Model
Personas are structured SDLC lenses, not autonomous personalities.

Minimum perspectives:
- Discovery: problem framing, constraints, dependencies, measurable outcomes
- Product: value, scope, acceptance clarity
- Architect: boundaries, decisions, NFRs, risks
- Developer: implementation strategy, maintainability
- QA: testability, negative/edge coverage, quality gates
- Security (cross-cutting): threats and controls
- UX/UI (optional for user-facing features): usability, accessibility baseline, interaction quality

## Governance and Anti-Drift
The `docs/` folder is long-term memory and the verification baseline.

Any change in philosophy, scope, or workflow must update:
1. `docs/architecture.md`
2. `docs/EXECUTION_GUARDRAILS.md`
3. `docs/STRATEGY_EXECUTION.md`
4. `docs/PROGRESS_CHECKLIST.md`

If code and docs conflict, resolve the conflict explicitly before continuing roadmap work.
