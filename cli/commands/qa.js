// cli/commands/qa.js
// EVO-087: Independent QA gate — AC-driven verification against running code
import fs from "node:fs";
import path from "node:path";
import { extractSection, resolveFeature } from "../lib.js";

function parseAcs(specContent) {
  const section = extractSection(specContent, "## 9. Acceptance Criteria");
  if (!section) return [];
  return section
    .split("\n")
    .filter((l) => /^-\s+AC-\d+:/i.test(l.trim()))
    .map((l) => {
      const m = l.match(/^-\s+(AC-\d+):\s+(.+)/i);
      return m ? { id: m[1].toUpperCase(), text: m[2].trim() } : null;
    })
    .filter(Boolean);
}

function detectStartCommand(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg.scripts?.dev) return `npm run dev`;
    if (pkg.scripts?.start) return `npm start`;
  } catch { /* no package.json */ }
  for (const f of ["server.js", "app.js", "index.js", "main.js"]) {
    if (fs.existsSync(path.join(root, f))) return `node ${f}`;
  }
  if (fs.existsSync(path.join(root, "manage.py"))) return `python manage.py runserver`;
  if (fs.existsSync(path.join(root, "main.go"))) return `go run .`;
  return null;
}

function detectPort(root) {
  try {
    const arch = fs.readFileSync(path.join(root, ".aitri/architecture-decision.md"), "utf8");
    const m = arch.match(/:(\d{4,5})/);
    if (m) return m[1];
  } catch { /* no arch doc */ }
  return "3000";
}

function buildQaPrompt({ feature, acs, startCmd, port }) {
  const setupLines = startCmd
    ? `1. Start: \`${startCmd}\`\n2. Wait until ready (port ${port})\n3. Base URL: http://localhost:${port}`
    : `1. Identify how to start the project (check README or package.json)\n2. Start the system and note the base URL`;

  const acLines = acs.map((ac) =>
    `### ${ac.id}\n**Criterion:** ${ac.text}\n- Run a real test against the system (HTTP call, CLI command, or function call)\n- Record: PASS or FAIL with evidence (actual response or output)`
  ).join("\n\n");

  return `## Objective
Independently verify that \`${feature}\` satisfies ALL Acceptance Criteria.
This is QA verification — do NOT read existing tests. Run the actual code directly.

## Setup
${setupLines}

## Test Each AC
${acLines}

## Write Results
Write ALL results to: .aitri/qa-report.md

Required format (exact):
\`\`\`
# QA Report: ${feature}
Date: <ISO date>

## Results
- AC-1: PASS — <evidence: command + actual response>
- AC-2: FAIL — Expected: <X>, Got: <Y>

## Summary
Total: ${acs.length} | Passed: <n> | Failed: <n>
Decision: PASS
\`\`\`

Use "Decision: PASS" only if ALL ACs passed. Use "Decision: FAIL" if any failed.

## If ANY AC fails
1. Fix the implementation
2. Re-run: aitri prove --feature ${feature}
3. Re-run: aitri qa --feature ${feature}
4. Only proceed to deliver when Decision is PASS`;
}

export async function runQaCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();

  let feature;
  try {
    feature = resolveFeature(options, () => { throw new Error("no_status"); });
  } catch {
    console.log("Feature name is required. Use --feature <name>.");
    return ERROR;
  }

  const specFile = project.paths.approvedSpecFile(feature);
  if (!fs.existsSync(specFile)) {
    console.log(`Approved spec not found. Run: aitri approve --feature ${feature}`);
    return ERROR;
  }

  const proofFile = path.join(project.paths.implementationFeatureDir(feature), "proof-of-compliance.json");
  if (!fs.existsSync(proofFile)) {
    console.log(`Proof of compliance not found. Run: aitri prove --feature ${feature}`);
    return ERROR;
  }

  let proof;
  try { proof = JSON.parse(fs.readFileSync(proofFile, "utf8")); } catch { proof = {}; }
  if (!proof.ok) {
    console.log(`Proof of compliance is failing. Fix tests first: aitri prove --feature ${feature}`);
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const acs = parseAcs(specContent);
  if (acs.length === 0) {
    console.log("No Acceptance Criteria found in spec. Add AC-XX entries under ## 9. Acceptance Criteria.");
    return ERROR;
  }

  const startCmd = detectStartCommand(root);
  const port = detectPort(root);
  const prompt = buildQaPrompt({ feature, acs, startCmd, port });

  console.log(`QA — ${feature} | ACs: ${acs.length}\n`);
  console.log(`--- AGENT TASK: qa ---`);
  console.log(prompt);
  console.log(`\n→ WRITE artifact: .aitri/qa-report.md — aitri deliver requires this file.`);
  console.log(`--- END TASK ---`);

  return OK;
}
