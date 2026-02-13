# Aitri: Agent Execution Checklist

## Scope
Applies to agents operating Aitri from terminal:
- Codex
- Claude
- OpenCode
- Any equivalent CLI-capable agent

## Non-Negotiable Rules
1. Execute one step at a time.
2. Do not implement without an approved spec.
3. Do not bypass gates or approval checkpoints.
4. Do not execute production deployment without explicit human confirmation.
5. Always report: what was done, what changed, and the next step.

## Mandatory Session Bootstrap
Before any substantial action:
1. Read `docs/README.md`
2. Read `docs/EXECUTION_GUARDRAILS.md`
3. Run `aitri status json`
4. If `checkpoint.state.resumeDecision` requests it, ask user: "Checkpoint found. Continue from checkpoint? (yes/no)"
5. Report state + next recommended step

## Standard Runtime Sequence
1. `aitri status`
2. If structure is missing -> `aitri init`
3. If draft/approved spec is missing -> `aitri draft`
4. Human review of draft
5. `aitri approve`
6. `aitri discover`
7. `aitri plan`
8. Refine artifacts using personas
9. `aitri validate`
10. Human approval before implementation
11. Human approval before local/production deployment assistance

## Mandatory Stop Conditions
Agent must stop and ask for direction if:
- approved spec is missing
- `validate` fails
- unresolved placeholders exist
- required artifacts are missing
- requested action violates documented scope
- deployment target or risk is ambiguous

## Persona Coverage Gate
Before implementation approval:
- Product: problem/value/scope/AC clarity
- Architect: technical design, risks, NFRs
- Developer: practical implementation sequence
- QA: functional, negative, edge coverage
- Security: controls, threat and abuse prevention
- UX/UI (if user-facing): user flow clarity, accessibility baseline, and state handling

## Validation Contract (Current Baseline)
`validate` should assert at minimum:
1. approved spec exists
2. backlog exists
3. tests exist
4. no unresolved placeholders
5. FR/US/TC structure exists
6. minimum coverage mapping is satisfied

## Human Reporting Contract
After each command, the agent reports:
- command executed
- key result
- artifacts created/updated
- blocking issues
- next recommended command

## Checkpoint Contract
At minimum, checkpoint after each major phase (`draft`, `approve`, `discover`, `plan`, `validate`):
1. `git add -A && git commit -m "checkpoint: <feature> <phase>"`
2. If commit is not possible: `git stash push -m "checkpoint: <feature> <phase>"`
3. On new session: `aitri status json` and continue with `nextStep`

## Deployment Assistance Contract
For local and production-assist deploy workflows:
- follow `docs/runbook/BUILD_DEPLOY_ASSIST_WORKFLOW.md`
- use templates in `docs/templates/deploy/`
- require explicit human approval before any execution step
- require post-deploy verification evidence

## Anti-Drift Rule
If this checklist conflicts with code or other docs, pause and resolve the divergence before continuing roadmap work.
