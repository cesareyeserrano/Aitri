#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { runStatus } from "./commands/status.js";

function showBanner() {
  const iron = "\x1b[38;5;24m";      // dark iron gray
  const fire = "\x1b[38;5;208m";     // forge orange
  const ember = "\x1b[38;5;196m";    // deep red
  const reset = "\x1b[0m";

  console.log(`
${iron}   █████╗ ██╗████████╗██████╗ ██╗${reset}
${iron}  ██╔══██╗██║╚══██╔══╝██╔══██╗██║${reset}
${fire}  ███████║██║   ██║   ██████╔╝██║${reset}
${ember}  ██╔══██║██║   ██║   ██╔══██╗██║${reset}
${fire}  ██║  ██║██║   ██║   ██║  ██║██║${reset}
${iron}  ╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝${reset}

${fire}⚒ Spec-Driven Development Engine.${reset}
${iron}Aitri designed by César Augusto Reyes${reset}
`);
}

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

function parseArgs(argv) {
  const parsed = {
    json: false,
    nonInteractive: false,
    guided: false,
    yes: false,
    idea: null,
    feature: null,
    positional: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--non-interactive") {
      parsed.nonInteractive = true;
    } else if (arg === "--guided") {
      parsed.guided = true;
    } else if (arg === "--yes" || arg === "-y") {
      parsed.yes = true;
    } else if (arg === "--idea") {
      parsed.idea = (argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--idea=")) {
      parsed.idea = arg.slice("--idea=".length).trim();
    } else if (arg === "--feature" || arg === "-f") {
      parsed.feature = (argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--feature=")) {
      parsed.feature = arg.slice("--feature=".length).trim();
    } else {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}

function normalizeFeatureName(value) {
  return (value || "").replace(/\s+/g, "-").trim();
}

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_ABORTED = 2;

async function confirmProceed(opts) {
  if (opts.yes) return true;
  if (opts.nonInteractive) return null;
  const answer = await ask("Proceed? (y/n): ");
  return answer.toLowerCase() === "y";
}

const cmd = process.argv[2];
const options = parseArgs(process.argv.slice(3));

if (cmd === "--version" || cmd === "-v") {
  const pkgPath = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  console.log(`aitri v${pkg.version}`);
  process.exit(EXIT_OK);
}

if (!cmd || cmd === "help") {
  showBanner();
  console.log(`
Aitri ⚒️

Commands:
  init       Initialize project structure
  draft      Create a draft spec from an idea (use --guided for guided input)
  approve    Approve a draft spec (runs gates and moves to specs/approved)
  discover   Generate discovery + artifact scaffolding from an approved spec
  plan       Generate plan doc + traceable backlog/tests from an approved spec
  validate   Validate traceability placeholders are resolved (FR/AC/US/TC)
  status     Show project state and next recommended step

Options:
  --yes, -y              Auto-approve plan prompts where supported
  --feature, -f <name>   Feature name for non-interactive runs
  --idea <text>          Idea text for non-interactive draft
  --non-interactive      Do not prompt; fail if required args are missing
  --json                 Output machine-readable JSON (status, validate)

Exit codes:
  0 success
  1 error (validation/usage/runtime)
  2 aborted by user
`);
  process.exit(EXIT_OK);
}

if (cmd === "init") {
  showBanner();
  const plan = [
    "Create: specs/drafts",
    "Create: specs/approved",
    "Create: backlog",
    "Create: tests",
    "Create: docs"
  ];

  console.log("PLAN:");
  plan.forEach((p) => console.log("- " + p));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
  }

  ["specs/drafts", "specs/approved", "backlog", "tests", "docs"].forEach((p) =>
    fs.mkdirSync(path.join(process.cwd(), p), { recursive: true })
  );

  console.log("Project initialized by Aitri ⚒️");
  process.exit(EXIT_OK);
}
 
if (cmd === "draft") {
  // We expect to run this from a project repo, not from the Aitri repo
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name (kebab-case, e.g. user-login): "));
  }
  if (!feature) {
    console.log("Feature name is required.");
    process.exit(EXIT_ERROR);
  }

  let idea = options.idea || "";
  if (!idea && !options.nonInteractive) {
    idea = await ask("Describe the idea (1-3 lines): ");
  }
  if (options.guided) {
    const actor = options.nonInteractive ? "TBD" : await ask("Primary actor (e.g. admin, customer): ");
    const outcome = options.nonInteractive ? "TBD" : await ask("Expected outcome (what should happen): ");
    idea = `${idea}\n\nPrimary actor: ${actor || "TBD"}\nExpected outcome: ${outcome || "TBD"}`;
  }
  if (!idea) {
    console.log("Idea is required.");
    process.exit(EXIT_ERROR);
  }

  // Locate Aitri core template relative to where this CLI package lives
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "af_spec.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Template not found at: ${templatePath}`);
    console.log("Make sure Aitri repo has core/templates/af_spec.md");
    process.exit(EXIT_ERROR);
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

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
  }

  fs.mkdirSync(outDir, { recursive: true });

  // Insert idea into Context section (simple but effective for v0.1)
  const enriched = template.replace(
    "## 1. Context\nDescribe the problem context.",
    `## 1. Context\n${idea}\n\n---\n\n(Assumptions and details will be refined during review.)`
  );

  fs.writeFileSync(outFile, enriched, "utf8");

  console.log(`Draft spec created: ${path.relative(process.cwd(), outFile)}`);
  process.exit(EXIT_OK);
}

if (cmd === "approve") {
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name to approve (kebab-case): "));
  }
  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  const draftsFile = path.join(process.cwd(), "specs", "drafts", `${feature}.md`);
  const approvedDir = path.join(process.cwd(), "specs", "approved");
  const approvedFile = path.join(approvedDir, `${feature}.md`);

  if (!fs.existsSync(draftsFile)) {
    console.log(`Draft spec not found: ${path.relative(process.cwd(), draftsFile)}`);
    process.exit(EXIT_ERROR);
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
    process.exit(EXIT_ERROR);
  }

  const plan = [
    `Move: specs/drafts/${feature}.md → specs/approved/${feature}.md`
  ];

  console.log("PLAN:");
  plan.forEach(p => console.log("- " + p));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
  }

  fs.mkdirSync(approvedDir, { recursive: true });

  const updated = content.replace(/^STATUS:\s*DRAFT\s*$/m, "STATUS: APPROVED");
  fs.writeFileSync(approvedFile, updated, "utf8");
  fs.unlinkSync(draftsFile);

  console.log("Spec approved successfully.");
  process.exit(EXIT_OK);
}

if (cmd === "discover") {
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name (kebab-case, e.g. user-login): "));
  }

  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  const approvedFile = path.join(process.cwd(), "specs", "approved", `${feature}.md`);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    process.exit(EXIT_ERROR);
  }

  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "discovery", "discovery_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Discovery template not found at: ${templatePath}`);
    process.exit(EXIT_ERROR);
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

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
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
  process.exit(EXIT_OK);
}

if (cmd === "plan") {
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name (kebab-case, e.g. user-login): "));
  }

  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  const approvedFile = path.join(process.cwd(), "specs", "approved", `${feature}.md`);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    process.exit(EXIT_ERROR);
  }

  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "plan", "plan_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Plan template not found at: ${templatePath}`);
    process.exit(EXIT_ERROR);
  }

  const architectPersona = path.resolve(cliDir, "..", "core", "personas", "architect.md");
  const securityPersona = path.resolve(cliDir, "..", "core", "personas", "security.md");
  const productPersona = path.resolve(cliDir, "..", "core", "personas", "product.md");
  const developerPersona = path.resolve(cliDir, "..", "core", "personas", "developer.md");
  const uxUiPersona = path.resolve(cliDir, "..", "core", "personas", "ux-ui.md");
  const qaPersona = path.resolve(cliDir, "..", "core", "personas", "qa.md");

  const outPlanDir = path.join(process.cwd(), "docs", "plan");
  const outPlanFile = path.join(outPlanDir, `${feature}.md`);

  const backlogFile = path.join(process.cwd(), "backlog", feature, "backlog.md");
  const testsFile = path.join(process.cwd(), "tests", feature, "tests.md");

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Read: " + path.relative(process.cwd(), templatePath));
  console.log("- Read: " + (fs.existsSync(productPersona) ? productPersona : "core/personas/product.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(architectPersona) ? architectPersona : "core/personas/architect.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(developerPersona) ? developerPersona : "core/personas/developer.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(uxUiPersona) ? uxUiPersona : "core/personas/ux-ui.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(securityPersona) ? securityPersona : "core/personas/security.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(qaPersona) ? qaPersona : "core/personas/qa.md (missing in repo)"));
  console.log("- Create: " + path.relative(process.cwd(), outPlanDir));
  console.log("- Write: " + path.relative(process.cwd(), outPlanFile));
  console.log("- Write: " + path.relative(process.cwd(), backlogFile));
  console.log("- Write: " + path.relative(process.cwd(), testsFile));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
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
  process.exit(EXIT_OK);
}

if (cmd === "validate") {
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name (kebab-case, e.g. user-login): "));
  }

  if (!feature) {
    const msg = "Feature name is required. Use --feature <name> in non-interactive mode.";
    if (options.json) {
      console.log(JSON.stringify({ ok: false, feature: null, issues: [msg] }, null, 2));
    } else {
      console.log(msg);
    }
    process.exit(EXIT_ERROR);
  }

  const approvedFile = path.join(process.cwd(), "specs", "approved", `${feature}.md`);
  const backlogFile = path.join(process.cwd(), "backlog", feature, "backlog.md");
  const testsFile = path.join(process.cwd(), "tests", feature, "tests.md");

  const issues = [];
  const result = {
    ok: false,
    feature,
    files: {
      spec: path.relative(process.cwd(), approvedFile),
      backlog: path.relative(process.cwd(), backlogFile),
      tests: path.relative(process.cwd(), testsFile)
    },
    coverage: {
      specFr: 0,
      backlogFr: 0,
      testsFr: 0,
      backlogUs: 0,
      testsUs: 0
    },
    issues
  };

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
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach(i => console.log("- " + i));
    }
    process.exit(EXIT_ERROR);
  }

  const spec = fs.readFileSync(approvedFile, "utf8");
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
    process.exit(EXIT_ERROR);
  }

  // --- Coverage checks (minimal) ---
  // 1) Every FR-* in spec should be referenced by at least one US-* in backlog
  const specFRs = [...spec.matchAll(/\bFR-\d+\b/g)].map(m => m[0]);
  const backlogFRs = new Set([...backlog.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));

  const missingFRCoverage = [...new Set(specFRs)].filter(fr => !backlogFRs.has(fr));
  missingFRCoverage.forEach(fr =>
    issues.push(`Coverage: ${fr} is defined in spec but not referenced in backlog user stories.`)
  );

  // 2) Every FR-* in spec should be referenced by at least one TC-* in tests
  const testsFRs = new Set([...tests.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));
  const missingFRTestsCoverage = [...new Set(specFRs)].filter(fr => !testsFRs.has(fr));
  missingFRTestsCoverage.forEach(fr =>
    issues.push(`Coverage: ${fr} is defined in spec but not referenced in tests.`)
  );

  // 2) Every US-* in backlog should be referenced by at least one TC-* in tests
  const backlogUS = [...backlog.matchAll(/\bUS-\d+\b/g)].map(m => m[0]);
  const testsUS = new Set([...tests.matchAll(/\bUS-\d+\b/g)].map(m => m[0]));

  const missingUSCoverage = [...new Set(backlogUS)].filter(us => !testsUS.has(us));
  missingUSCoverage.forEach(us =>
    issues.push(`Coverage: ${us} exists in backlog but is not referenced in tests.`)
  );
  // --- End coverage checks ---

  result.coverage.specFr = new Set(specFRs).size;
  result.coverage.backlogFr = backlogFRs.size;
  result.coverage.testsFr = testsFRs.size;
  result.coverage.backlogUs = new Set(backlogUS).size;
  result.coverage.testsUs = testsUS.size;

  if (issues.length > 0) {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach((i) => console.log("- " + i));
    }
    process.exit(EXIT_ERROR);
  }

  result.ok = true;
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("VALIDATION PASSED ✅");
    console.log("- Spec: " + path.relative(process.cwd(), approvedFile));
    console.log("- Backlog: " + path.relative(process.cwd(), backlogFile));
    console.log("- Tests: " + path.relative(process.cwd(), testsFile));
  }
  process.exit(EXIT_OK);
}

if (cmd === "status") {
  runStatus({ json: options.json });
  process.exit(EXIT_OK);
}

console.log("Unknown command.");
process.exit(EXIT_ERROR);
