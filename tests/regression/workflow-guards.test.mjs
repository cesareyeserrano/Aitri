import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";

test("init rejects unsafe mapped paths and does not execute injected shell fragments", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-regression-path-injection-"));
  const marker = path.join(os.tmpdir(), "aitri-regression-injected-marker");
  fs.rmSync(marker, { force: true });

  fs.writeFileSync(
    path.join(tempDir, "aitri.config.json"),
    JSON.stringify({
      paths: {
        specs: `specs;touch ${marker}`,
        backlog: "backlog",
        tests: "tests",
        docs: "docs"
      }
    }, null, 2),
    "utf8"
  );

  const result = runNode(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Invalid aitri\.config\.json/);
  assert.equal(fs.existsSync(marker), false);
});

function writeFeatureReadyForHandoff(tempDir, feature) {
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "verification"), { recursive: true });

  fs.writeFileSync(path.join(tempDir, "specs", "approved", `${feature}.md`), `# AF-SPEC: ${feature}
STATUS: APPROVED
## 3. Functional Rules (traceable)
- FR-1: Rule for ${feature}.
`, "utf8");

  fs.writeFileSync(path.join(tempDir, "docs", "discovery", `${feature}.md`), `# Discovery: ${feature}
## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- Team
- Jobs to be done:
- Execute workflow
- Current pain:
- Manual steps
- Constraints (business/technical/compliance):
- Stable
- Dependencies:
- Internal
- Success metrics:
- Pass gates
- Assumptions:
- Stable baseline

## 3. Scope
### In scope
- Flow
### Out of scope
- Extras

## 9. Discovery Confidence
- Confidence:
- High

- Reason:
- Sufficient inputs

- Evidence gaps:
- None

- Handoff decision:
- Ready for Product/Architecture
`, "utf8");

  fs.writeFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), `# Plan: ${feature}
## 4. Product Review (Product Persona)
### Business value
- Deliver deterministic, auditable execution flow for this feature.
### Success metric
- Workflow gates pass without manual backtracking.
### Assumptions to validate
- Input requirements remain stable for this iteration.

## 5. Architecture (Architect Persona)
### Components
- API service layer and validation gate component.
### Data flow
- Request enters service layer, then validation and response pipeline.
### Key decisions
- Keep strict traceability from FR to US and TC in all artifacts.
### Risks & mitigations
- Mitigate drift by blocking progression on missing evidence.
### Observability (logs/metrics/tracing)
- Structured logs and basic gate metrics are captured.
`, "utf8");

  fs.writeFileSync(path.join(tempDir, "backlog", feature, "backlog.md"), `# Backlog: ${feature}
### US-1
- As an Operator, I want deterministic flow, so that execution stays predictable.
- Trace: FR-1, AC-1
`, "utf8");

  fs.writeFileSync(path.join(tempDir, "tests", feature, "tests.md"), `# Test Cases: ${feature}
### TC-1
- Trace: US-1, FR-1, AC-1
`, "utf8");

  fs.writeFileSync(path.join(tempDir, "docs", "verification", `${feature}.json`), JSON.stringify({
    ok: true,
    feature,
    command: "node --test",
    commandSource: "manual",
    exitCode: 0,
    finishedAt: "2099-01-01T00:00:01.000Z"
  }, null, 2), "utf8");
}

test("resume and go respect --feature in multi-feature repositories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-regression-multi-go-"));
  writeFeatureReadyForHandoff(tempDir, "alpha");
  writeFeatureReadyForHandoff(tempDir, "beta");

  const resume = runNodeOk(["resume", "--feature", "alpha", "--json"], { cwd: tempDir });
  const resumePayload = JSON.parse(resume.stdout);
  assert.equal(resumePayload.feature, "alpha");
  assert.equal(resumePayload.ok, true);

  const go = runNode(["go", "--feature", "alpha", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(go.status, 0);
  assert.match(go.stdout, /Implementation go\/no-go decision: GO/);
  assert.equal(fs.existsSync(path.join(tempDir, "docs", "implementation", "alpha", "go.json")), true);
});

test("init writes project profile when --project is provided", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-regression-project-name-"));
  runNodeOk(["init", "--project", "OEL Platform", "--non-interactive", "--yes"], { cwd: tempDir });
  const profileFile = path.join(tempDir, "docs", "project.json");
  assert.equal(fs.existsSync(profileFile), true);
  const payload = JSON.parse(fs.readFileSync(profileFile, "utf8"));
  assert.equal(payload.name, "OEL Platform");
});
