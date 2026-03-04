import fs from "node:fs";
import path from "node:path";
import { resolveFeature } from "../lib.js";
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

// Collect test stub bodies that reference this contract (for agent context)
function readTestContext(contractPath, generatedDir) {
  if (!fs.existsSync(generatedDir)) return "";
  const contractBase = path.basename(contractPath);
  const snippets = [];
  for (const f of fs.readdirSync(generatedDir)) {
    if (!/\.(mjs|js|ts|tsx|py|go)$/i.test(f)) continue;
    const abs = path.join(generatedDir, f);
    const content = fs.readFileSync(abs, "utf8");
    if (!content.includes(contractBase.replace(/\.[^.]+$/, ""))) continue;
    snippets.push(`// ${f}\n${content.trim()}`);
  }
  return snippets.join("\n\n");
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

  const specContent = fs.readFileSync(specFile, "utf8");
  const parsedSpec = parseApprovedSpec(specContent);
  const stackFamily = detectStackFamily(parsedSpec);

  const frRules = parsedSpec.functionalRules || [];
  if (frRules.length === 0) {
    console.log("No FR-* identifiers found in approved spec. Nothing to generate.");
    return ERROR;
  }

  const targetFr = options.fr ? String(options.fr).toUpperCase().trim() : null;
  const force = !!(options.force || options.yes);

  const targets = targetFr ? frRules.filter((r) => r.id === targetFr) : frRules;
  if (targets.length === 0) {
    console.log(`FR not found in spec: ${targetFr}`);
    return ERROR;
  }

  const devPersona = loadPersonaSystemPrompt("developer");
  const personaSection = devPersona.ok ? `## Persona\n${devPersona.systemPrompt}\n\n` : "";

  let tasksOutput = 0;
  let skipped = 0;

  console.log(`Contractgen — ${feature} | Stack: ${stackFamily} | FRs: ${targets.length}\n`);

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
    const relPath = path.relative(root, contractPath);

    console.log(`\n--- AGENT TASK: contractgen ${fr.id} ---`);
    console.log(personaSection + `Implement the contract function for ${fr.id}.

Functional Requirement: ${fr.id} — ${fr.text}
Stack: ${stackFamily}

Current contract placeholder — REPLACE the placeholder body with a real implementation:
\`\`\`
${contractContent.trim()}
\`\`\`
${testContext ? `\nTest stubs that call this contract (use to understand expected behavior):\n\`\`\`\n${testContext.trim()}\n\`\`\`` : ""}

Instructions:
1. Keep the function signature exactly as-is (same exported name, same parameters). Do NOT rename it — test stubs import it by exact name.
2. Replace ONLY the placeholder body with a working implementation that satisfies ${fr.id}.
3. Minimal and correct — no extra methods, no extra imports unless necessary.
4. Do not add TODOs or comments explaining what the code "should do" — write the actual code.
5. CRITICAL: A contract that returns \`{ ok: true }\` without reading at least one property from \`input\` is INVALID.
6. Do NOT add long-name alias exports (e.g. \`export const fr_1_system_must_...\`) — they break import compatibility.

Write the complete updated file to: ${relPath}
--- END TASK ---`);

    tasksOutput++;
  }

  if (tasksOutput > 0) {
    console.log(`\n${tasksOutput} contract task(s) output. Write each file at the path shown above.`);
    console.log(`After implementing, run: aitri prove --feature ${feature}`);
  } else {
    console.log(`\nNo contracts to generate (${skipped} skipped).`);
  }

  return OK;
}
