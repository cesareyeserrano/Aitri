import fs from "node:fs";
import path from "node:path";
import { resolveFeature } from "../lib.js";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";
import { parseApprovedSpec } from "./spec-parser.js";
import { parseTestCases, detectStackFamily, slugify } from "./scaffold.js";

// Returns true when the contract is still a scaffold placeholder
function isContractPlaceholder(content) {
  const s = String(content);
  if (s.includes('throw new Error("Not implemented:')) return true;
  if (s.includes("raise NotImplementedError(\"Not implemented:")) return true;
  if (s.includes("return nil, nil") && s.includes("_ = input")) return true;
  return false;
}

// Extract code from LLM response: prefer fenced code block, fallback to raw text
function extractCodeBlock(response) {
  const fenced = String(response).match(/```(?:[a-z]*)\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim() + "\n";
  const trimmed = String(response).trim();
  // Accept raw code responses starting with recognisable code tokens
  if (/^(\/\/|#|\/\*\*|package |export |def |func )/.test(trimmed)) return trimmed + "\n";
  return null;
}

// Collect test stub bodies that reference this contract (for LLM context)
function readTestContext(contractPath, generatedDir) {
  if (!fs.existsSync(generatedDir)) return "";
  const contractBase = path.basename(contractPath);
  const snippets = [];
  for (const f of fs.readdirSync(generatedDir)) {
    if (!/\.(mjs|js|ts|tsx|py|go)$/i.test(f)) continue;
    const abs = path.join(generatedDir, f);
    const content = fs.readFileSync(abs, "utf8");
    // Only include stubs that import this specific contract
    if (!content.includes(contractBase.replace(/\.[^.]+$/, ""))) continue;
    snippets.push(`// ${f}\n${content.trim()}`);
  }
  return snippets.join("\n\n");
}

function buildPrompt({ fr, stackFamily, contractContent, testContext }) {
  return `You are implementing a contract function for a software feature.

Functional Requirement: ${fr.id} — ${fr.text}
Stack: ${stackFamily}

Current contract placeholder — REPLACE the placeholder body with a real implementation:
\`\`\`
${contractContent.trim()}
\`\`\`
${testContext ? `\nTest stubs that call this contract (use them to understand expected behavior):\n\`\`\`\n${testContext.trim()}\n\`\`\`` : ""}

Instructions:
1. Keep the function signature exactly as-is (same name, same parameters).
2. Replace ONLY the placeholder body with a working implementation that satisfies ${fr.id}.
3. The implementation must be minimal and correct — no extra methods, no extra imports unless necessary.
4. Do not add TODOs or comments explaining what the code "should do" — write the actual code.
5. Return ONLY the complete updated file content — no prose, no extra explanation.

Updated contract file:`;
}

function resolveContractPath(root, stackFamily, fr) {
  const suffix = slugify(fr.text).slice(0, 32) || fr.id.toLowerCase();
  if (stackFamily === "python") {
    return path.join(root, "src", "contracts", `${fr.id.toLowerCase()}-${suffix}.py`);
  }
  if (stackFamily === "go") {
    return path.join(root, "internal", "contracts", `${fr.id.toLowerCase()}-${suffix}.go`);
  }
  return path.join(root, "src", "contracts", `${fr.id.toLowerCase()}-${suffix}.js`);
}

export async function runContractgenCommand({
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
  const generatedDir = project.paths.generatedTestsDir(feature);

  if (!fs.existsSync(specFile)) {
    console.log(`Approved spec not found: ${path.relative(root, specFile)}`);
    console.log(`Run: aitri approve --feature ${feature}`);
    return ERROR;
  }

  const aiConfig = project.config.ai;
  if (!aiConfig || !aiConfig.provider) {
    console.log("AI not configured. Add an `ai` section to aitri.config.json.");
    console.log('Example: { "ai": { "provider": "claude", "apiKeyEnv": "ANTHROPIC_API_KEY" } }');
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const parsedSpec = parseApprovedSpec(specContent);
  const stackFamily = detectStackFamily(parsedSpec);

  const frRules = parsedSpec.functionalRules || [];
  if (frRules.length === 0) {
    console.log("No FR-* identifiers found in approved spec. Nothing to generate.");
    return ERROR;
  }

  // --fr FR-N targets a specific contract
  const targetFr = options.fr ? String(options.fr).toUpperCase().trim() : null;
  const force = !!(options.force || options.yes);

  const targets = targetFr ? frRules.filter((r) => r.id === targetFr) : frRules;
  if (targets.length === 0) {
    console.log(`FR not found in spec: ${targetFr}`);
    return ERROR;
  }

  console.log(`Generating contract implementations for: ${feature}`);
  console.log(`Stack: ${stackFamily}  FRs: ${targets.length}\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const fr of targets) {
    const contractPath = resolveContractPath(root, stackFamily, fr);

    if (!fs.existsSync(contractPath)) {
      console.log(`  ${fr.id}: contract file not found — run aitri build first`);
      console.log(`    Expected: ${path.relative(root, contractPath)}`);
      skipped++;
      continue;
    }

    const contractContent = fs.readFileSync(contractPath, "utf8");

    if (!isContractPlaceholder(contractContent) && !force) {
      console.log(`  ${fr.id}: already implemented — skipping (use --force to regenerate)`);
      skipped++;
      continue;
    }

    const testContext = readTestContext(contractPath, generatedDir);

    process.stdout.write(`  ${fr.id}: generating... `);

    const prompt = buildPrompt({ fr, stackFamily, contractContent, testContext });
    const devPersona = loadPersonaSystemPrompt("developer");
    const result = await callAI({
      prompt,
      systemPrompt: devPersona.ok ? devPersona.systemPrompt : undefined,
      config: aiConfig
    });

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

    fs.writeFileSync(contractPath, newContent, "utf8");
    console.log("OK");
    generated++;
  }

  console.log(`\nContractgen: ${generated} generated, ${skipped} skipped, ${failed} failed.`);

  if (generated > 0) {
    console.log(`\nReview the generated contracts, then run:`);
    console.log(`  aitri prove --feature ${feature}`);
  }

  return failed === 0 ? OK : ERROR;
}
