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
  draft      Create a draft spec from an idea
  approve    Approve a draft spec (move to specs/approved)
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

  if (!feature) {
    console.log("Feature name is required.");
    process.exit(1);
  }

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

  // Functional Rules check
  const rulesMatch = content.match(/## 3\. Functional Rules([\s\S]*?)(\n##\s|\s*$)/);
  if (!rulesMatch) {
    issues.push("Missing section: `## 3. Functional Rules`.");
  } else {
    const lines = rulesMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const meaningful = lines.some(l => {
      if (!/^\d+\./.test(l)) return false;
      const rest = l.replace(/^\d+\.\s*/, "").trim();
      return rest.length >= 8 && !/^<.*>$/.test(rest);
    });
    if (!meaningful) {
      issues.push("Functional Rules must include at least one meaningful numbered rule.");
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

process.exit(1);