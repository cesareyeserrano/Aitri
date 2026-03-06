// cli/commands/qa.js
// EVO-087 + EVO-097: Two-phase independent QA gate
import fs from "node:fs";
import path from "node:path";
import { extractSection, resolveFeature } from "../lib.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";

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

function buildPhaseAPrompt({ feature, acs, startCmd, port }) {
  const setup = startCmd
    ? `1. Start: \`${startCmd}\`\n2. Wait until ready (port ${port})\n3. Base URL: http://localhost:${port}`
    : `1. Identify how to start the project (check README or package.json)\n2. Start the system and note the base URL`;

  const acLines = acs.map((ac) =>
    `### ${ac.id}\n**Criterion:** ${ac.text}\n` +
    `- Command: <exact command you ran>\n` +
    `- Response: <exact output / HTTP response>\n` +
    `- Exit code: <0 or non-zero>\n` +
    `- Result: PASS or FAIL`
  ).join("\n\n");

  return `## PHASE A — Mechanical Evidence Capture\n\n` +
    `Feature: ${feature} | Do NOT read test files or src/ code.\n\n` +
    `## Setup\n${setup}\n\n` +
    `## Capture Evidence for Each AC\n${acLines}\n\n` +
    `## Write Phase A Evidence\nAppend to: .aitri/qa-report.md\nFormat:\n` +
    `- AC-N: PASS — <command> returned <response>\n` +
    `- AC-N: FAIL — Expected: <X>, Got: <Y>\n`;
}

function buildPhaseBPrompt({ feature, acs, qaPersonaPrompt }) {
  return `## PHASE B — Independent QA Evaluation\n\n` +
    `${qaPersonaPrompt}\n\n` +
    `---\n\n` +
    `Evaluate the Phase A evidence in .aitri/qa-report.md WITHOUT accessing src/.\n` +
    `Verify: is each AC proven by the captured evidence?\n\n` +
    `ACs to evaluate: ${acs.map((a) => a.id).join(", ")}\n\n` +
    `## Finalize qa-report.md\nAppend:\n` +
    `\`\`\`\n## QA Evaluation (Phase B)\n` +
    `Total: ${acs.length} | Passed: <n> | Failed: <n>\n` +
    `Decision: PASS\n\`\`\`\n\n` +
    `Use "Decision: PASS" only if ALL ACs have valid evidence. "Decision: FAIL" if any failed.\n\n` +
    `If ANY AC fails: fix implementation → aitri prove --feature ${feature} → aitri qa --feature ${feature}`;
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
  const qaPersona = loadPersonaSystemPrompt("qa");
  const qaPersonaPrompt = qaPersona.ok ? qaPersona.systemPrompt : "You are a QA Engineer. Evaluate evidence objectively.";

  console.log(`QA — ${feature} | ACs: ${acs.length}\n`);
  console.log(`--- AGENT TASK: qa ---`);
  console.log(buildPhaseAPrompt({ feature, acs, startCmd, port }));
  console.log(`\n--- PHASE B (run after Phase A evidence is written) ---`);
  console.log(buildPhaseBPrompt({ feature, acs, qaPersonaPrompt }));
  console.log(`\n→ WRITE artifact: .aitri/qa-report.md — aitri deliver requires this file.`);
  console.log(`--- END TASK ---`);

  return OK;
}
