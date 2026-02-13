# Aitri: Architecture and Operating Model

## Purpose
Aitri is a **CLI-first** SDLC system with strict **spec-driven** discipline.

It is designed for direct terminal use by humans and for operation by agents (Codex, Claude, OpenCode, others) under a controlled execution contract.

Core model:
- Human defines intent and approves
- Aitri enforces workflow, structure, and traceability
- AI executes tasks inside explicit constraints

## Product Positioning
Aitri is:
- A spec-driven SDLC guardian
- A deterministic workflow engine
- A reusable skill context for AI-assisted delivery

Aitri is not:
- An autonomous coding autopilot
- A replacement for product or architecture ownership
- A system that bypasses human approval

## Non-Negotiable Principles
1. Spec first: no implementation without a written specification.
2. Approved spec required: no downstream artifacts without `specs/approved/<feature>.md`.
3. Explicit gates: write or destructive actions require a plan and approval.
4. Traceability required: Spec -> Backlog -> Tests -> Implementation.
5. Human authority: final decisions always remain with the human owner.

## SDLC Coverage Target
Under human supervision, Aitri should cover:
1. Discovery and requirement capture
2. Formal specification
3. Planning and artifact generation
4. Implementation planning
5. Development execution (human-approved)
6. Quality and traceability validation
7. Local and production deployment assistance (always human-approved)

V1 scope note:
- In V1, development/deployment assistance remains a **documented target capability** (not mandatory full automation in the core).

## Artifact Topology
Standard project structure:
- `specs/drafts/`
- `specs/approved/`
- `docs/discovery/`
- `docs/plan/`
- `backlog/<feature>/backlog.md`
- `tests/<feature>/tests.md`

Extended artifacts (roadmap):
- architecture notes per feature
- release/deploy runbooks
- operational checklists

## Command-Level Flow (Current Core)
1. `aitri init`
2. `aitri draft`
3. `aitri approve`
4. `aitri discover`
5. `aitri plan`
6. `aitri validate`
7. human approval before implementation/deployment

## Agent Integration Model
Aitri is consumed as skill context plus CLI commands.

Target environments:
- Codex
- Claude
- OpenCode
- Other terminal-capable agents

Agent contract:
- Execute one step at a time
- Respect gates and approval points
- Do not invent parallel workflows outside Aitri
- Report outcomes and the next recommended step

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
2. `docs/SCOPE_V1.md`
3. `docs/STRATEGY_EXECUTION.md`
4. `docs/AGENT_EXECUTION_CHECKLIST.md`
5. `docs/PROGRESS_CHECKLIST.md`

If code and docs conflict, resolve the conflict explicitly before continuing roadmap work.
