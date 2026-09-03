# Security Audit — adversarial review of code, repo, and deployed surface

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

## Project context
- **Directory:** `{{PROJECT_DIR}}`
- **Pipeline state:** {{PIPELINE_STATE}}

{{#IF_SECURITY_NFRS}}
## Declared security NFRs — promises to verify, not proof of protection
{{SECURITY_NFRS}}
{{/IF_SECURITY_NFRS}}

{{#IF_REQUIREMENTS_SUMMARY}}
## Functional requirements (orientation — read the full file)
{{REQUIREMENTS_SUMMARY}}
{{/IF_REQUIREMENTS_SUMMARY}}

{{#IF_DESIGN_SUMMARY}}
## System design excerpt (Security Design / deployment context lives in the full file)
{{DESIGN_SUMMARY}}
{{/IF_DESIGN_SUMMARY}}

{{#IF_QUALITY_GATES}}
## Quality gates already declared (mechanically run by `verify`)
{{QUALITY_GATES}}

> These run on every verify cycle. Do not re-report what a declared gate already catches — audit what NO gate covers, and propose the gate that closes the loop.
{{/IF_QUALITY_GATES}}

## Security Audit Protocol
1. Read the FULL artifacts for surface mapping: `{{ARTIFACTS_BASE}}/02_SYSTEM_DESIGN.md` (Security Design + Deployment Architecture), `{{ARTIFACTS_BASE}}/01_REQUIREMENTS.json` (security NFRs and their acceptance criteria), `{{ARTIFACTS_BASE}}/04_BUILD_REPORT.json` (quality_gates, environment_variables), plus deploy descriptors in the repo (Dockerfile, CI workflows, platform configs).
2. Map the attack surface (Step 1) — decide which categories apply to what this project IS. State the decision.
3. Probe the runtime surface if one is reachable — deployed URL from the design/deploy config, or run locally per the project's own setup. Passive, non-destructive only. If unreachable, mark it NOT AUDITED (Step 2).
4. Audit the static surface — secrets, dependencies (run the project's own audit tooling), code trust boundaries, build/deploy config, and repository posture (Step 3). Repository posture is part of the static surface: hosting metadata that exists as files (CI config for the project's host — `.github/workflows/`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml`, `Jenkinsfile`, or equivalent — if none, CI is unwired; `dependabot.yml` or equivalent update automation; `.gitignore` covering env/credential/build patterns; a license file), and — ONLY if the project's own host CLI (e.g. `gh`) is present and authenticated — host-side settings via READ-ONLY calls (GET only, never mutate): default-branch protection, secret scanning, dependency-alert enablement. A permission-ambiguous response (404/403 that could mean "absent" OR "token lacks scope") is NOT AUDITED (name the missing scope), never a finding. Where the host CLI is available, ALSO read recent workflow RUN RESULTS (read-only, e.g. `gh run list --branch <default>`): a workflow whose latest run on the default branch is FAILING is a finding — name how long it has sat red; a red gate left unattended is alarm fatigue, and the remediation is fixing the failure AND bringing the check into the verify spine as a declared quality_gate so it blocks in the operator's loop. When host-side checks are skipped (no CLI, no auth), the Surfaces-audited coverage statement MUST name them as not covered — an unaudited posture dimension that goes unnamed reads as covered. For a missing-CI finding, the remediation is wiring the project's declared test runner and quality gates into a host workflow (Aitri's README documents a validate-gate CI workflow to extend with the runner).
5. Run the skeptical pass — drop unreachable/theoretical findings, re-argue every severity (Step 4).
6. Write the findings as remediation requirements to the "Security" section of AUDIT_REPORT.md, including the proposed quality_gate verification script.
7. Present the Security Summary below.

## Security Summary
After writing AUDIT_REPORT.md, present this to the user:

```
─── Security Audit ─────────────────────────────────────────
Project:           {{PROJECT_NAME}}
Surfaces covered:  [static: yes/partial] · [runtime: yes/partial/not reachable]
Findings:          [N]   P0: [N]   P1: [N]   P2: [N]
Top finding: [one sentence — the most exploitable exposure, or "none"]
Permanent gate: [proposed quality_gate name, or "none needed"]
────────────────────────────────────────────────────────────
Next: aitri audit plan   →   route each finding (P0s first) into the pipeline
```

## Output: append to `{{ARTIFACTS_BASE}}/AUDIT_REPORT.md`
Use exactly this heading:

### Security
First, the coverage statement:
  **Surfaces audited:** static (code/repo/deps): [covered/partial — what was checked] · runtime (deployed/local): [covered/partial/NOT AUDITED — why]

Each finding:
  **[RQ-SEC-NNN]** `[P0|P1|P2]` — [title naming the exposure]
  - Severity: [High|Medium|Low] — [attack scenario: who exploits it, how, what they gain — 1-2 sentences]
  - Evidence: [exact file/line, endpoint + response excerpt, header dump, or command output]
  - Acceptance criteria: [verifiable conditions — the curl/grep/exit-code checks that prove it fixed]
  - Suggested implementation: [concrete, minimal — code/config sketch when useful]

Then the permanent gate proposal:
  **Proposed quality_gate** — a script of exit-code checks covering the top findings (headers present, docs disabled, no internal traces in served assets, …), to declare in `04_BUILD_REPORT.json#quality_gates` so `verify` re-checks the posture every cycle.

  _(If zero findings: write "No findings — surfaces probed:" and list every check performed, so the clean result is evidenced, not assumed.)_

## Optional — multi-lens fan-out
If subagents are available, consider running several over this code with *distinct* security lenses (authz/authn, injection, data exposure) instead of one general pass — each is blind to what the others surface. Optional, consumes tokens, operator's call.

## Human Review — before acting on the findings
  [ ] The coverage statement is honest — surfaces not audited are named, not silently skipped
  [ ] Every finding has evidence an outsider could reproduce (file/line, endpoint, header)
  [ ] Every severity has an attacker story — no severity by assertion
  [ ] No aggressive/destructive testing was performed or proposed
  [ ] Each finding's acceptance criteria are mechanically checkable (curl/grep/exit code)
  [ ] A permanent quality_gate is proposed (or its absence justified) — the audit must outlive the session
