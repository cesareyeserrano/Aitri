# Session Checkpoint and Resume Runbook

## Goal
Prevent loss of progress during abrupt interruptions and make cross-session continuation deterministic.

## Checkpoint Policy
Aitri automatically creates checkpoints after write commands when inside a git repository:
- `init`
- `draft`
- `approve`
- `discover`
- `plan`

Retention:
- latest 10 managed checkpoint tags (`aitri-checkpoint/*`)

Manual checkpoints are still allowed at each major phase:
1. `draft`
2. `approve`
3. `discover`
4. `plan`
5. `validate`

Recommended command:
```bash
git add -A
git commit -m "checkpoint: <feature> <phase>"
```

If you cannot commit yet:
```bash
git stash push -m "checkpoint: <feature> <phase>"
```

## Resume Procedure (New Session)
From your target project:
```bash
aitri resume
```

For automation:
```bash
aitri resume json
```

Then execute the returned `recommendedCommand` (or `nextStep` in JSON mode).

If resume/status reports:
- `checkpoint.state.resumeDecision = "ask_user_resume_from_checkpoint"`

the agent must ask the user explicitly:
- "Checkpoint found. Continue from checkpoint? (yes/no)"

before any write action.

Typical mapping:
- `aitri init` -> structure missing
- `aitri draft` -> no approved spec
- `aitri discover` -> approved spec exists, discovery missing
- `aitri plan` -> discovery exists, plan missing
- `aitri validate` -> artifacts exist but validation pending/failing
- `ready_for_human_approval` -> artifacts and validation baseline complete

## Abrupt Shutdown Recovery
1. Re-open repository.
2. Run `git status --short`.
3. Recover stashed checkpoint if needed:
```bash
git stash list
git stash apply stash@{0}
```
4. Run `aitri resume`.
5. Continue with the recommended command.

## Agent Behavior Requirement
Agents should:
1. Suggest a checkpoint before ending a substantial work block.
2. Start each new session with `aitri resume`.
3. Report detected state and next step before continuing.
