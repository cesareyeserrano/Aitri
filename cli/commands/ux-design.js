// cli/commands/ux-design.js
// Pre-planning stage 3: Experience Designer persona
import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";

const REQUIRES = ".aitri/product-spec.md";
const ARTIFACT = ".aitri/ux-design.md";

function buildPrompt(productSpecContent) {
  return `Based on the product specification below, produce a complete UX design document.

Apply your full output schema in mandatory order:
1. Hero Flow (zero-friction primary user path — step by step, no dead ends)
2. Component Innovation (one differentiated UI interaction that sets this product apart)
3. State Matrix (for each key screen: Ideal | Pre-emptive | Failure/recovery — loading/empty/success/error states)
4. Accessibility and Inclusivity Audit (color contrast, keyboard navigation, screen-reader support, touch targets)
5. Aesthetic Identity and Consistency (visual language, typography, color system, component patterns)
6. UX Success Metrics (task completion rate, time on task, error rate, accessibility conformance targets)

Every interaction must serve user goals. Every error state must have a recovery path.

## Product Specification
${productSpecContent}`;
}

export async function runUxDesignCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
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
    console.log(`Product spec not found: ${REQUIRES}`);
    console.log("Run: aitri product-spec first.");
    return ERROR;
  }

  const personaResult = loadPersonaSystemPrompt("ux-ui");
  if (!personaResult.ok) {
    console.log(`Failed to load ux-ui persona: ${personaResult.error}`);
    return ERROR;
  }

  const productSpecContent = fs.readFileSync(requiresPath, "utf8");

  if (!options.nonInteractive) console.log("Running Experience Designer analysis...");

  const result = await callAI({
    prompt: buildPrompt(productSpecContent),
    systemPrompt: personaResult.systemPrompt,
    config: aiConfig,
  });

  if (!result.ok) {
    console.log(`AI error: ${result.error}`);
    return ERROR;
  }

  const ts = new Date().toISOString();
  const artifact = `<!-- Aitri UX Design — ${ts} -->\n\n${result.content}\n`;
  const outPath = path.join(root, ARTIFACT);
  fs.writeFileSync(outPath, artifact, "utf8");

  if (!options.nonInteractive && !options.yes) {
    console.log(`\n--- UX DESIGN (${ARTIFACT}) ---`);
    console.log(result.content.slice(0, 1400) + (result.content.length > 1400 ? "\n...(see file for full content)" : ""));
    const answer = String(await ask("\nApprove UX design and continue? (y/n): ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(`UX design not approved. Edit ${ARTIFACT} and re-run.`);
      return ABORTED;
    }
  }

  console.log(`\nUX design complete → ${ARTIFACT}`);
  console.log("Next: aitri arch-design");
  return OK;
}
