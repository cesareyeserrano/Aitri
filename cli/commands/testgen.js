import fs from "node:fs";
import path from "node:path";
import { resolveFeature } from "../lib.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";
import { parseApprovedSpec } from "./spec-parser.js";
import { parseTestCases, detectStackFamily } from "./scaffold.js";

// Extract TC-ID from the first comment line of a stub
function extractTcId(content) {
  const m = String(content).match(/^(?:\/\/|#)\s*(TC-\d+)/m);
  return m ? m[1] : null;
}

// Returns true when the stub is still a scaffold placeholder (not yet implemented)
function isPlaceholder(content) {
  return /Not implemented:/i.test(content);
}

function buildPrompt({ tcId, title, feature, stackFamily, frContext, acContext, contractContext, stubContent }) {
  return `Write a behavioral test for this feature. Replace the placeholder with real test logic.

Feature: ${feature}
Test Case: ${tcId}${title ? " — " + title : ""}
Stack: ${stackFamily}

Functional Requirements being tested:
${frContext || "(none listed)"}

Acceptance Criteria (Given/When/Then):
${acContext || "(none listed)"}
${contractContext ? "\nContract interfaces:\n" + contractContext : ""}
Current stub — REPLACE the assert.fail/pytest.fail/t.Fatal placeholder with real assertions:
\`\`\`
${stubContent}
\`\`\`

Instructions:
1. Keep all existing import statements exactly as-is.
2. Replace only the assert.fail / pytest.fail / t.Fatal placeholder with real assertions.
3. Import and CALL any listed contract functions; verify their return values against the acceptance criteria.
4. Use Given/When/Then structure to guide the test body (setup → action → assert).`;
}

function readContractContext(stubContent, stubFile) {
  const contractRe = /^import\s*\{[^}]+\}\s*from\s*["']([^"']+)["']/gm;
  const lines = [];
  for (const m of String(stubContent).matchAll(contractRe)) {
    const relPath = m[1];
    if (!relPath.includes("/contracts/")) continue;
    const absPath = path.resolve(path.dirname(stubFile), relPath);
    if (fs.existsSync(absPath)) {
      lines.push(`// ${path.basename(absPath)}\n${fs.readFileSync(absPath, "utf8").trim()}`);
    }
  }
  return lines.join("\n\n");
}

export async function runTestgenCommand({
  options,
  getProjectContextOrExit,
  exitCodes
}) {
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
  const testsFile = project.paths.testsFile(feature);
  const generatedDir = project.paths.generatedTestsDir(feature);

  if (!fs.existsSync(specFile)) {
    console.log(`Approved spec not found: ${path.relative(root, specFile)}`);
    console.log(`Run: aitri approve --feature ${feature}`);
    return ERROR;
  }
  if (!fs.existsSync(testsFile)) {
    console.log(`Tests file not found: ${path.relative(root, testsFile)}`);
    console.log(`Run: aitri plan --feature ${feature}`);
    return ERROR;
  }
  if (!fs.existsSync(generatedDir)) {
    console.log(`Generated stubs not found: ${path.relative(root, generatedDir)}`);
    console.log(`Run: aitri build --feature ${feature}`);
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const testsContent = fs.readFileSync(testsFile, "utf8");
  const parsedSpec = parseApprovedSpec(specContent);
  const testCases = parseTestCases(testsContent);
  const stackFamily = detectStackFamily(parsedSpec);

  const frMap = new Map((parsedSpec.functionalRules || []).map((r) => [r.id, r.text]));
  const acMap = new Map((parsedSpec.acceptanceCriteria || []).map((ac) => [ac.id, ac.text]));
  const tcMeta = new Map(testCases.map((tc) => [tc.id, tc]));

  const targetTc = options.tc ? String(options.tc).toUpperCase().trim() : null;
  const force = !!(options.force || options.yes);

  const stubFiles = fs.readdirSync(generatedDir)
    .filter((f) => /\.(mjs|js|ts|tsx|py|go)$/i.test(f))
    .sort()
    .map((f) => path.join(generatedDir, f));

  if (stubFiles.length === 0) {
    console.log(`No stub files found in ${path.relative(root, generatedDir)}.`);
    console.log(`Run: aitri build --feature ${feature}`);
    return ERROR;
  }

  const qaPersona = loadPersonaSystemPrompt("qa");
  const personaSection = qaPersona.ok ? `## Persona\n${qaPersona.systemPrompt}\n\n` : "";

  let tasksOutput = 0;
  let skipped = 0;

  console.log(`Testgen — ${feature} | Stack: ${stackFamily} | Stubs: ${stubFiles.length}\n`);

  for (const stubFile of stubFiles) {
    const content = fs.readFileSync(stubFile, "utf8");
    const tcId = extractTcId(content);

    if (!tcId) { skipped++; continue; }
    if (targetTc && tcId !== targetTc) { skipped++; continue; }

    if (!isPlaceholder(content) && !force) {
      console.log(`  ${tcId}: already implemented — skipping (use --force to regenerate)`);
      skipped++;
      continue;
    }

    const tc = tcMeta.get(tcId) || { id: tcId, title: "", acIds: [], frIds: [] };
    const frContext = (tc.frIds || []).map((id) => `- ${id}: ${frMap.get(id) || "(no text)"}`).join("\n");
    const acContext = (tc.acIds || []).map((id) => `- ${id}: ${acMap.get(id) || "(no text)"}`).join("\n");
    const contractContext = readContractContext(content, stubFile);
    const relPath = path.relative(root, stubFile);

    const prompt = buildPrompt({
      tcId, title: tc.title, feature, stackFamily,
      frContext, acContext, contractContext, stubContent: content
    });

    console.log(`\n--- AGENT TASK: testgen ${tcId} ---`);
    console.log(personaSection + prompt);
    console.log(`\nWrite the complete updated file to: ${relPath}`);
    console.log(`--- END TASK ---`);

    tasksOutput++;
  }

  if (tasksOutput > 0) {
    console.log(`\n${tasksOutput} test task(s) output. Write each file at the path shown above.`);
    console.log(`After implementing, run: aitri prove --feature ${feature}`);
  } else {
    console.log(`\nNo tests to generate (${skipped} skipped).`);
  }

  return OK;
}
