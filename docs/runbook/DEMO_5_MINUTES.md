# Aitri 5-Minute Demo Runbook

## Goal
Run an end-to-end SDLC baseline in a clean workspace in 5 minutes or less.

## Command
From repository root:
```bash
bash scripts/demo-5min.sh
```

Optional custom workspace:
```bash
bash scripts/demo-5min.sh /tmp/aitri-demo-custom
```

Optional feature name:
```bash
FEATURE=user-auth bash scripts/demo-5min.sh
```

## What the Demo Executes
1. `init`
2. `resume json`
3. `draft`
4. `approve`
5. `discover`
6. `plan`
7. `validate --format json`
8. `handoff`
9. `resume`

## Expected Result
- Script exits with code `0`.
- Output includes `Result: within 5 minutes (target met)`.
- Last recommended state is implementation handoff readiness.

## Notes
- The script auto-initializes git in the demo workspace for checkpoint behavior.
- The script uses `node cli/index.js` from this repository by default.
- To force global binary, run with `AITRI_USE_GLOBAL=1`.
