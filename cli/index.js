#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

const cmd = process.argv[2];

if (!cmd || cmd === "help") {
  console.log(`
Aitri ⚒️

Commands:
  init       Initialize project structure
  draft      Create a draft spec from an idea (use --guided for guided input)
  approve    Approve a draft spec (runs gates and moves to specs/approved)
  discover   Generate discovery + artifact scaffolding from an approved spec
  plan       Generate plan doc + traceable backlog/tests from an approved spec
  validate   Validate traceability placeholders are resolved (FR/AC/US/TC)
`);
  process.exit(0);
}

if (cmd === "init") {
  const plan = [
    "Create: specs/drafts",
    "Create: specs/approved",
    "Create: backlog",
    "Create: tests",
    "Create: docs"
  ];

  console.log("PLAN:");
  plan.forEach((p) => console.log("- " + p));

  const answer = await ask("Proceed? (y/n): ");
  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  ["specs/drafts", "specs/approved", "backlog", "tests", "docs"].forEach((p) =>
    fs.mkdirSync(path.join(process.cwd(), p), { recursive: true })
  );

  console.log("Project initialized by Aitri ⚒️");
  process.exit(0);
}
 
if (cmd === "draft") {
  // We expect to run this from a project repo, not from the Aitri repo
  const feature = (await ask("Feature name (kebab-case, e.g. user-login): ")).replace(/\s+/g, "-").trim();
  if (!feature) {
    console.log("Feature name is required.");
    process.exit(1);
  }

  const idea = await ask("Describe the idea (1-3 lines): ");
  if (!idea) {
    console.log("Idea is required.");
    process.exit(1);
  }

  // Locate Aitri core template relative to where this CLI package lives
  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "af_spec.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Template not found at: ${templatePath}`);
    console.log("Make sure Aitri repo has core/templates/af_spec.md");
    process.exit(1);
  }

  const template = fs.readFileSync(templatePath, "utf8");

  const outDir = path.join(process.cwd(), "specs", "drafts");
  const outFile = path.join(outDir, `${feature}.md`);

  const plan = [
    `Create: ${path.relative(process.cwd(), outDir)}`,
    `Create: ${path.relative(process.cwd(), outFile)}`
  ];

  console.log("PLAN:");
  plan.forEach((p) => console.log("- " + p));

  const answer = await ask("Proceed? (y/n): ");
  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  fs.mkdirSync(outDir, { recursive: true });

  // Insert idea into Context section (simple but effective for v0.1)
  const enriched = template.replace(
    "## 1. Context\nDescribe the problem context.",
    `## 1. Context\n${idea}\n\n---\n\n(Assumptions and details will be refined during review.)`
  );

  fs.writeFileSync(outFile, enriched, "utf8");

  console.log(`Draft spec created: ${path.relative(process.cwd(), outFile)}`);
  process.exit(0);
}

if (cmd === "approve") {
  const feature = (await ask("Feature name to approve (kebab-case): "))
    .replace(/\s+/g, "-")
    .trim();

  const draftsFile = path.join(process.cwd(), "specs", "drafts", `${feature}.md`);
  const approvedDir = path.join(process.cwd(), "specs", "approved");
  const approvedFile = path.join(approvedDir, `${feature}.md`);

  if (!fs.existsSync(draftsFile)) {
    console.log(`Draft spec not found: ${path.relative(process.cwd(), draftsFile)}`);
    process.exit(1);
  }

  const content = fs.readFileSync(draftsFile, "utf8");
  const issues = [];

  // Must contain STATUS: DRAFT
  if (!/^STATUS:\s*DRAFT\s*$/m.test(content)) {
    issues.push("Spec must contain `STATUS: DRAFT`.");
  }

  // Functional Rules check (supports FR-* traceable format and legacy numbered rules)
  const rulesMatch =
    content.match(/## 3\. Functional Rules \(traceable\)([\s\S]*?)(\n##\s|\s*$)/) ||
    content.match(/## 3\. Functional Rules([\s\S]*?)(\n##\s|\s*$)/);

  if (!rulesMatch) {
    issues.push("Missing section: `## 3. Functional Rules`.");
  } else {
    const body = rulesMatch[1] || "";
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);

    const hasFR = lines.some(l => /^[-*]\s*FR-\d+\s*:\s*\S+/i.test(l));
    const hasLegacyNumbered = lines.some(l => /^\d+\.\s+\S+/.test(l));

    const meaningful = lines.some(l => {
      const cleaned = l
        .replace(/^[-*]\s*/, "")
        .replace(/^FR-\d+\s*:\s*/i, "")
        .replace(/^\d+\.\s+/, "")
        .trim();
      return cleaned.length >= 8 && !/^<.*>$/.test(cleaned);
    });

    if (!(hasFR || hasLegacyNumbered) || !meaningful) {
      issues.push("Functional Rules must include at least one meaningful rule using `- FR-1: ...` (preferred) or legacy `1. ...` format.");
    }
  }

  // Security check
  const secMatch = content.match(/## 7\. Security Considerations([\s\S]*?)(\n##\s|\s*$)/);
  if (!secMatch) {
    issues.push("Missing section: `## 7. Security Considerations`.");
  } else {
    const lines = secMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const meaningful = lines.some(l => {
  const cleaned = l.replace(/^[-*]\s*/, "").trim();
  if (cleaned.length < 5) return false;
  if (cleaned.includes("<") && cleaned.includes(">")) return false;
  return true;
});
    if (!meaningful) {
      issues.push("Security Considerations must include at least one meaningful bullet.");
    }
  }

  // Acceptance Criteria check
  const acMatch = content.match(/## 9\. Acceptance Criteria([\s\S]*?)(\n##\s|\s*$)/);
  if (!acMatch) {
    issues.push("Missing section: `## 9. Acceptance Criteria`.");
  } else {
    const lines = acMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const meaningful = lines.some(l =>
      l !== "-" && !/^<.*>$/.test(l) && l.replace(/^[-*]\s*/, "").trim().length >= 8
    );
    if (!meaningful) {
      issues.push("Acceptance Criteria must include at least one meaningful bullet.");
    }
  }

  if (issues.length > 0) {
    console.log("GATE FAILED:");
    issues.forEach(i => console.log("- " + i));
    process.exit(1);
  }

  const plan = [
    `Move: specs/drafts/${feature}.md → specs/approved/${feature}.md`
  ];

  console.log("PLAN:");
  plan.forEach(p => console.log("- " + p));

  const answer = await ask("Proceed? (y/n): ");
  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  fs.mkdirSync(approvedDir, { recursive: true });

  const updated = content.replace(/^STATUS:\s*DRAFT\s*$/m, "STATUS: APPROVED");
  fs.writeFileSync(approvedFile, updated, "utf8");
  fs.unlinkSync(draftsFile);

  console.log("Spec approved successfully.");
  process.exit(0);
}

if (cmd === "discover") {
  const feature = (await ask("Feature name (kebab-case, e.g. user-login): "))
    .replace(/\s+/g, "-")
    .trim();

  if (!feature) {
    console.log("Feature name is required.");
    process.exit(1);
  }

  const approvedFile = path.join(process.cwd(), "specs", "approved", `${feature}.md`);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    process.exit(1);
  }

  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "discovery", "discovery_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Discovery template not found at: ${templatePath}`);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "docs", "discovery");
  const backlogDir = path.join(process.cwd(), "backlog", feature);
  const testsDir = path.join(process.cwd(), "tests", feature);

  const backlogFile = path.join(backlogDir, "backlog.md");
  const testsFile = path.join(testsDir, "tests.md");
  const outFile = path.join(outDir, `${feature}.md`);

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Create: " + path.relative(process.cwd(), outDir));
  console.log("- Create: " + path.relative(process.cwd(), outFile));
  console.log("- Create: " + path.relative(process.cwd(), backlogDir));
  console.log("- Create: " + path.relative(process.cwd(), backlogFile));
  console.log("- Create: " + path.relative(process.cwd(), testsDir));
  console.log("- Create: " + path.relative(process.cwd(), testsFile));

  const answer = await ask("Proceed? (y/n): ");
  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(backlogDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  let discovery = fs.readFileSync(templatePath, "utf8");

  // Basic injection
  discovery = discovery.replace("# Discovery: <feature>", `# Discovery: ${feature}`);
  discovery = discovery.replace("## 1. Problem Statement\n- What problem are we solving?\n- Why now?",
    `## 1. Problem Statement\nDerived from approved spec:\n\n---\n\n${approvedSpec}\n\n---\n\nNow refine: what problem are we solving and why now?`
  );

  fs.writeFileSync(outFile, discovery, "utf8");
    const backlog = `# Backlog: ${feature}

## Epic
- <one epic statement>

## User Stories
1. As a <actor>, I want <capability>, so that <benefit>.
2. As a <actor>, I want <capability>, so that <benefit>.
3. As a <actor>, I want <capability>, so that <benefit>.
`;

  const tests = `# Test Cases: ${feature}

## Functional
1. Given <context>, when <action>, then <expected>.

## Security
1. Input validation: reject invalid/unsafe inputs.
2. Abuse prevention: rate limit critical endpoints (if any).

## Edge Cases
1. <edge case> -> <expected behavior>
`;

  fs.writeFileSync(backlogFile, backlog, "utf8");
  fs.writeFileSync(testsFile, tests, "utf8");

  console.log("Discovery created: " + path.relative(process.cwd(), outFile));
  process.exit(0);
}

if (cmd === "plan") {
  const feature = (await ask("Feature name (kebab-case, e.g. user-login): "))
    .replace(/\s+/g, "-")
    .trim();

  if (!feature) {
    console.log("Feature name is required.");
    process.exit(1);
  }

  const approvedFile = path.join(process.cwd(), "specs", "approved", `${feature}.md`);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    process.exit(1);
  }

  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "plan", "plan_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Plan template not found at: ${templatePath}`);
    process.exit(1);
  }

  const architectPersona = path.resolve(cliDir, "..", "core", "personas", "architect.md");
  const securityPersona = path.resolve(cliDir, "..", "core", "personas", "security.md");
  const qaPersona = path.resolve(cliDir, "..", "core", "personas", "qa.md");

  const outPlanDir = path.join(process.cwd(), "docs", "plan");
  const outPlanFile = path.join(outPlanDir, `${feature}.md`);

  const backlogFile = path.join(process.cwd(), "backlog", feature, "backlog.md");
  const testsFile = path.join(process.cwd(), "tests", feature, "tests.md");

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Read: " + path.relative(process.cwd(), templatePath));
  console.log("- Read: " + (fs.existsSync(architectPersona) ? architectPersona : "core/personas/architect.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(securityPersona) ? securityPersona : "core/personas/security.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(qaPersona) ? qaPersona : "core/personas/qa.md (missing in repo)"));
  console.log("- Create: " + path.relative(process.cwd(), outPlanDir));
  console.log("- Write: " + path.relative(process.cwd(), outPlanFile));
  console.log("- Write: " + path.relative(process.cwd(), backlogFile));
  console.log("- Write: " + path.relative(process.cwd(), testsFile));

  const answer = await ask("Proceed? (y/n): ");
  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  fs.mkdirSync(outPlanDir, { recursive: true });
  fs.mkdirSync(path.dirname(backlogFile), { recursive: true });
  fs.mkdirSync(path.dirname(testsFile), { recursive: true });

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  let planDoc = fs.readFileSync(templatePath, "utf8");

  // Inject feature name and include approved spec for traceability
  planDoc = planDoc.replace("# Plan: <feature>", `# Plan: ${feature}`);
  planDoc = planDoc.replace(
    "## 1. Intent (from approved spec)",
    `## 1. Intent (from approved spec)\n\n---\n\n${approvedSpec}\n\n---\n`
  );

  fs.writeFileSync(outPlanFile, planDoc, "utf8");

  // Overwrite backlog/tests with a structured starting point (content will be refined by agents)
  const backlog = `# Backlog: ${feature}

> Generated by \`aitri plan\`.
> Spec-driven rule: every story MUST reference one or more Functional Rules (FR-*) and, when applicable, Acceptance Criteria (AC-*).

## Epics
- EP-1: <epic outcome>
  - Notes:
  - Trace: FR-?, FR-?
- EP-2: <epic outcome>
  - Notes:
  - Trace: FR-?, FR-?

## User Stories

### US-1
- As a <actor>, I want <capability>, so that <benefit>.
- Trace: FR-?, AC-?
- Acceptance Criteria:
  - Given ..., when ..., then ...
  - Given ..., when ..., then ...

### US-2
- As a <actor>, I want <capability>, so that <benefit>.
- Trace: FR-?, AC-?
- Acceptance Criteria:
  - Given ..., when ..., then ...

(repeat as needed)
`;
  const tests = `# Test Cases: ${feature}

> Generated by \`aitri plan\`.
> Spec-driven rule: every test MUST trace to a User Story (US-*) and one or more Functional Rules (FR-*). Include AC-* when applicable.

## Functional

### TC-1
- Title: <what is being validated>
- Trace: US-?, FR-?, AC-?
- Steps:
  1) Given <context>
  2) When <action>
  3) Then <expected>

## Negative / Abuse

### TC-2
- Title: <invalid input or abuse scenario>
- Trace: US-?, FR-?
- Steps:
  1) Given <invalid context>
  2) When <action>
  3) Then <rejected with clear error>

## Security

### TC-3
- Title: <security control validation>
- Trace: US-?, FR-?
- Steps:
  1) Given <threat scenario>
  2) When <attempt>
  3) Then <blocked/logged/limited>

## Edge Cases

### TC-4
- Title: <edge case>
- Trace: US-?, FR-?
- Steps:
  1) Given <edge context>
  2) When <action>
  3) Then <expected>
`;

  fs.writeFileSync(backlogFile, backlog, "utf8");
  fs.writeFileSync(testsFile, tests, "utf8");

  console.log("Plan created: " + path.relative(process.cwd(), outPlanFile));
  process.exit(0);
}

if (cmd === "validate") {
  const feature = (await ask("Feature name (kebab-case, e.g. user-login): "))
    .replace(/\s+/g, "-")
    .trim();

  if (!feature) {
    console.log("Feature name is required.");
    process.exit(1);
  }

  const approvedFile = path.join(process.cwd(), "specs", "approved", `${feature}.md`);
  const backlogFile = path.join(process.cwd(), "backlog", feature, "backlog.md");
  const testsFile = path.join(process.cwd(), "tests", feature, "tests.md");

  const issues = [];

  if (!fs.existsSync(approvedFile)) {
    issues.push(`Missing approved spec: ${path.relative(process.cwd(), approvedFile)}`);
  }
  if (!fs.existsSync(backlogFile)) {
    issues.push(`Missing backlog: ${path.relative(process.cwd(), backlogFile)}`);
  }
  if (!fs.existsSync(testsFile)) {
    issues.push(`Missing tests: ${path.relative(process.cwd(), testsFile)}`);
  }

  if (issues.length > 0) {
    console.log("VALIDATION FAILED:");
    issues.forEach(i => console.log("- " + i));
    process.exit(1);
  }

  const backlog = fs.readFileSync(backlogFile, "utf8");
  const tests = fs.readFileSync(testsFile, "utf8");

  // Basic structure checks
  if (!/###\s+US-\d+/m.test(backlog)) {
    issues.push("Backlog must include at least one user story with an ID like `### US-1`.");
  }
  if (backlog.includes("FR-?")) {
    issues.push("Backlog contains placeholder `FR-?`. Replace with real Functional Rule IDs (FR-1, FR-2...).");
  }
  if (backlog.includes("AC-?")) {
    issues.push("Backlog contains placeholder `AC-?`. Replace with real Acceptance Criteria IDs (AC-1, AC-2...).");
  }

  if (!/###\s+TC-\d+/m.test(tests)) {
    issues.push("Tests must include at least one test case with an ID like `### TC-1`.");
  }
  if (tests.includes("US-?")) {
    issues.push("Tests contain placeholder `US-?`. Replace with real User Story IDs (US-1, US-2...).");
  }
  if (tests.includes("FR-?")) {
    issues.push("Tests contain placeholder `FR-?`. Replace with real Functional Rule IDs (FR-1, FR-2...).");
  }
  if (tests.includes("AC-?")) {
    issues.push("Tests contain placeholder `AC-?`. Replace with real Acceptance Criteria IDs (AC-1, AC-2...).");
  }

  if (issues.length > 0) {
    console.log("VALIDATION FAILED:");
    issues.forEach(i => console.log("- " + i));
    process.exit(1);
  }

  console.log("VALIDATION PASSED ✅");
  console.log("- Spec: " + path.relative(process.cwd(), approvedFile));
  console.log("- Backlog: " + path.relative(process.cwd(), backlogFile));
  console.log("- Tests: " + path.relative(process.cwd(), testsFile));
  process.exit(0);
}

console.log("Unknown command.");
process.exit(1);
