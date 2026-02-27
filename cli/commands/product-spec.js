// cli/commands/product-spec.js
// Pre-planning stage 2: Product Manager persona
import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";

const REQUIRES = ".aitri/discovery.md";
const ARTIFACT = ".aitri/product-spec.md";

function buildPrompt(discoveryContent) {
  return `Based on the discovery artifact below, produce a complete product specification.

Apply your full output schema in mandatory order:
1. Core Problem Statement (Format: Current state [X] causes [Y] for [User Z], resulting in [Cost/Pain])
2. Success Metrics (Primary KPI + Guardrails)
3. User Journey and Flow
4. Scope and Guardrails (In-Scope: atomic list | Out-of-Scope: explicitly deferred)
5. Acceptance Criteria (Given/When/Then format — at least one per user journey step)
6. Risk and Assumption Log
7. Dependencies and Constraints

Block handoff to Architect if success metrics are not measurable.

## Discovery Artifact
${discoveryContent}`;
}

export async function runProductSpecCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const aiConfig = project.config.ai || {};

  if (!aiConfig.provider) {
    console.log("AI is not configured. Add an `ai` section to aitri.config.json.");
    return ERROR;
  }

  const requiresPath = path.join(root, REQUIRES);
  if (!fs.existsSync(requiresPath)) {
    console.log(`Discovery artifact not found: ${REQUIRES}`);
    console.log("Run: aitri discover-idea first.");
    return ERROR;
  }

  const outPath = path.join(root, ARTIFACT);
  if (fs.existsSync(outPath) && !options.force) {
    if (options.nonInteractive) {
      console.log(`${ARTIFACT} already exists. Use --force to regenerate.`);
      return ERROR;
    }
    const ans = String(await ask(`${ARTIFACT} already exists. Regenerate? (y/n): `)).trim().toLowerCase();
    if (ans !== "y" && ans !== "yes") { console.log("Skipped. Existing artifact retained."); return OK; }
  }

  const personaResult = loadPersonaSystemPrompt("product");
  if (!personaResult.ok) {
    console.log(`Failed to load product persona: ${personaResult.error}`);
    return ERROR;
  }

  const discoveryContent = fs.readFileSync(requiresPath, "utf8");

  if (!options.nonInteractive) console.log("Running Product Manager analysis...");

  const result = await callAI({
    prompt: buildPrompt(discoveryContent),
    systemPrompt: personaResult.systemPrompt,
    config: aiConfig,
  });

  if (!result.ok) {
    console.log(`AI error: ${result.error}`);
    return ERROR;
  }

  const ts = new Date().toISOString();
  const artifact = `<!-- Aitri Product Spec — ${ts} -->\n\n${result.content}\n`;
  fs.writeFileSync(outPath, artifact, "utf8");

  if (!options.nonInteractive && !options.yes) {
    console.log(`\n--- PRODUCT SPEC (${ARTIFACT}) ---`);
    console.log(result.content.slice(0, 1400) + (result.content.length > 1400 ? "\n...(see file for full content)" : ""));
    const answer = String(await ask("\nApprove product spec and continue? (y/n): ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(`Product spec not approved. Edit ${ARTIFACT} and re-run.`);
      return ABORTED;
    }
  }

  console.log(`\nProduct spec complete → ${ARTIFACT}`);
  console.log("Next: aitri ux-design  (or aitri arch-design --no-ux for non-UI projects)");
  return OK;
}
