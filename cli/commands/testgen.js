import fs from "node:fs";
import path from "node:path";
import { resolveFeature } from "../lib.js";
import { callAI } from "../ai-client.js";
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

// Extract code from LLM response: prefer fenced code block, fallback to raw text
function extractCodeBlock(response) {
  const fenced = String(response).match(/```(?:[a-z]*)\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim() + "\n";
  const trimmed = String(response).trim();
  // Accept raw code responses (start with comment, import, or package keyword)
  if (/^(\/\/|#|import |package )/.test(trimmed)) return trimmed + "\n";
  return null;
}

function buildPrompt({ tcId, title, feature, stackFamily, frContext, acContext, contractContext, stubContent }) {
  return `You are writing a behavioral test for a software feature. Replace the placeholder with real test logic.

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
4. Use Given/When/Then structure to guide the test body (setup → action → assert).
5. Return ONLY the complete updated file content — no prose, no extra explanation.

Updated test file:`;
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
    console.log(`Run: aitri scaffold --feature ${feature}`);
    return ERROR;
  }

  const aiConfig = project.config.ai;
  if (!aiConfig || !aiConfig.provider) {
    console.log("AI not configured. Add an `ai` section to aitri.config.json.");
    console.log('Example: { "ai": { "provider": "claude", "apiKeyEnv": "ANTHROPIC_API_KEY" } }');
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
    console.log(`Run: aitri scaffold --feature ${feature}`);
    return ERROR;
  }

  console.log(`Generating behavioral tests for: ${feature}`);
  console.log(`Stack: ${stackFamily}  Stubs: ${stubFiles.length}\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

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

    process.stdout.write(`  ${tcId}: generating... `);

    const prompt = buildPrompt({
      tcId, title: tc.title, feature, stackFamily,
      frContext, acContext, contractContext, stubContent: content
    });

    const result = await callAI({ prompt, config: aiConfig });

    if (!result.ok) {
      console.log(`FAILED (${result.error})`);
      failed++;
      continue;
    }

    const newContent = extractCodeBlock(result.content);
    if (!newContent) {
      console.log("FAILED (could not parse LLM response)");
      failed++;
      continue;
    }

    fs.writeFileSync(stubFile, newContent, "utf8");
    console.log("OK");
    generated++;
  }

  console.log(`\nTestgen: ${generated} generated, ${skipped} skipped, ${failed} failed.`);

  if (generated > 0) {
    console.log(`\nReview the generated tests, then run:`);
    console.log(`  aitri prove --feature ${feature}`);
  }

  return failed === 0 ? OK : ERROR;
}
