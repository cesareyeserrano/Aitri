// cli/commands/ux-design.js
// Pre-planning stage 3: Experience Designer persona
import fs from "node:fs";
import path from "node:path";
import { loadPersonaSystemPrompt, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

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
  const { OK, ERROR } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  const requiresPath = path.join(root, REQUIRES);
  if (!fs.existsSync(requiresPath)) {
    console.log(`Product spec not found: ${REQUIRES}`);
    console.log("Run: aitri product-spec first.");
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

  const personaResult = loadPersonaSystemPrompt("ux-ui");
  if (!personaResult.ok) {
    console.log(`Failed to load ux-ui persona: ${personaResult.error}`);
    return ERROR;
  }

  const productSpecContent = fs.readFileSync(requiresPath, "utf8");

  console.log(`\n[${PERSONA_DISPLAY_NAMES["ux-ui"]}] Loaded. Execute the following task:\n`);
  console.log("## Persona System Prompt");
  console.log(personaResult.systemPrompt);
  console.log("\n## Task");
  console.log(buildPrompt(productSpecContent));
  console.log("\n---");
  console.log(`→ Artifact: ${ARTIFACT}`);
  console.log(`→ Write the complete UX design document to: ${outPath}`);
  console.log("→ When done: aitri arch-design");
  return OK;
}
