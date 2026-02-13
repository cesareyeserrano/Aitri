# Build and Deploy Assist Workflow (Supervised)

## Purpose
Define the mandatory supervised workflow for build and deployment assistance after validation has passed.

## Entry Criteria (all required)
1. Approved spec exists
2. `aitri validate` passes
3. Human explicitly approves moving to implementation/build-assist phase
4. Deployment target is explicitly defined (`local`, `staging`, or `production`)

## Phase 1: Build Readiness
1. Confirm artifact traceability is current (spec, backlog, tests)
2. Confirm implementation plan exists (`docs/plan/<feature>.md`)
3. Create build-assist plan from template:
   - `docs/templates/deploy/build-assist-plan.template.md`
4. Human approves build-assist plan

## Phase 2: Local Deployment Assistance
1. Create local deployment plan:
   - `docs/templates/deploy/local-deploy-plan.template.md`
2. Verify required environment variables and dependencies
3. Define post-deploy verification steps
4. Human approves local execution
5. Execute and collect evidence in:
   - `docs/runbook/deploy-evidence/<feature>-<date>.md`

## Phase 3: Production Deployment Assistance
1. Create production-assist plan:
   - `docs/templates/deploy/production-deploy-assist.template.md`
2. Complete rollback/fallback checklist:
   - `docs/templates/deploy/rollback-fallback-checklist.template.md`
3. Confirm monitoring and alerting checkpoints
4. Human gives explicit production approval
5. Execute and record evidence

## Mandatory Stop Conditions
Stop immediately if any of these occur:
- Validation no longer passes
- Required secrets/config are missing
- Rollback procedure is incomplete
- Human approval is missing or ambiguous
- Post-deploy verification fails

## Completion Criteria
A deployment-assist cycle is complete when:
1. Execution result is documented
2. Verification evidence is recorded
3. Rollback status is confirmed
4. Outstanding risks are logged
