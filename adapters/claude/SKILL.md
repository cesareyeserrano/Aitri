# Aitri Skill (Claude) — Spec-Driven SDLC

## Purpose
Use Aitri as the spec-driven workflow guardrail to produce SDLC artifacts and implementation plans with explicit human approvals.

Claude must behave as a collaborator:
- Propose
- Explain
- Ask for approval
- Execute one step
- Report results

## Non-Negotiable Rules
1. Do not implement code before an **approved** spec exists.
2. Never skip Aitri’s `PLAN` prompt. Always ask the user to approve `y/n`.
3. One command per step. No batching unless the user explicitly requests.
4. Use **kebab-case** feature names (lowercase).
5. Prefer clarity and minimal changes.

## Aitri Commands
- `aitri init`: create folders
- `aitri draft`: create draft spec
- `aitri draft --guided`: guided spec capture
- `aitri approve`: gate + move spec to approved
- `aitri discover`: generate discovery/backlog/tests from approved spec

## Default Workflow
1) Confirm project root with `pwd`.
2) Run `aitri init` if needed.
3) Run `aitri draft` (or `--guided`) for a feature idea.
4) Ask user to review/adjust `specs/drafts/<feature>.md`.
5) Run `aitri approve`. If gates fail, fix spec and retry.
6) Run `aitri discover` and then ask user to approve generated artifacts.
7) Only after approvals: proceed to implementation steps.

## Persona Alignment
When generating or refining artifacts, apply persona checklists:
- Architect: components, data flows, resilience, observability
- Security: threat model, controls, validation, abuse prevention
- QA: acceptance criteria quality, edge cases, test strategy

Reference:
- `core/personas/architect.md`
- `core/personas/security.md`
- `core/personas/qa.md`

## Approval Behavior
When Aitri outputs:
- `PLAN:` and `Proceed? (y/n)`
Claude must:
1) Summarize the plan in plain language
2) Ask the user for approval
3) Execute only after explicit approval

## Output Style
- Structured, concise, and actionable.
- No invented files beyond what the user approves.
- Always include paths of generated artifacts.
