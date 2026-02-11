# Aitri Skill (Codex) — Spec-Driven SDLC

## Purpose
Use Aitri as the workflow guardrail to turn an idea into approved specs and SDLC artifacts, then implement code **only after approvals**.

Aitri is not a chatbot. It is a CLI + process:
- Humans decide, direct, and approve
- The agent proposes and executes actions using `PLAN → Proceed? (y/n)` gates

## Core Principles (Non-negotiable)
1. **No code before approved spec.**
2. **Never skip gates.** If Aitri prints a PLAN and asks `Proceed?`, stop and ask the user for approval.
3. **One step at a time.** Execute a single command, report results, then wait for the next instruction/approval.
4. **Use kebab-case** feature names (lowercase, hyphenated).
5. **Prefer minimal changes** and keep output deterministic.

## Commands and Intent
### `aitri init`
Creates base project folders.
- Use when project has no `specs/`, `backlog/`, `tests/`, `docs/`.

### `aitri draft`
Creates `specs/drafts/<feature>.md` from a short idea.
- If user is unsure, use `aitri draft --guided` to collect minimal inputs.

### `aitri approve`
Runs strict gates and moves draft into `specs/approved/`.
- If gates fail, propose edits to the draft spec and re-run.

### `aitri discover`
Requires an approved spec. Generates:
- `docs/discovery/<feature>.md`
- `backlog/<feature>/backlog.md`
- `tests/<feature>/tests.md`

This is where the agent starts producing SDLC artifacts from the approved spec.

## Workflow (Default)
1) Ensure in the project root (`pwd` should show the repo/project folder).
2) Run `aitri init` if structure is missing.
3) Run `aitri draft` (or `aitri draft --guided`) to create a draft spec.
4) Ask the user to review the draft spec and make changes if needed.
5) Run `aitri approve`. If failed, fix spec and repeat.
6) Run `aitri discover` to generate discovery/backlog/tests.
7) Ask the user to approve generated artifacts before any implementation work.
8) Only after approvals: begin implementation (outside Aitri scope unless user asks).

## Persona Usage
When writing artifacts, align content with personas:
- Architect: system boundaries, components, failure modes, observability
- Security: threats, controls, input validation, abuse prevention
- QA: test strategy, edge cases, acceptance criteria quality

If persona files exist, consult them:
- `core/personas/architect.md`
- `core/personas/security.md`
- `core/personas/qa.md`

## Approval Gates (How to behave)
If Aitri shows:
- `PLAN:` followed by actions and `Proceed? (y/n)`
Then the agent must:
1) Stop
2) Summarize the plan
3) Ask the user for `y/n`
4) Only proceed on explicit `y`

## Output Style
- Keep terminal commands minimal.
- Do not invent files; only create what Aitri creates or what user explicitly approves.
- Always report paths of created artifacts.
