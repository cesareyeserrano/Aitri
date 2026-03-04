// cli/commands/product-spec.js
// Pre-planning stage 2: Product Manager persona
import fs from "node:fs";
import path from "node:path";
import { loadPersonaSystemPrompt, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

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
  const { OK, ERROR } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  const requiresPath = path.join(root, REQUIRES);
  if (!fs.existsSync(requiresPath)) {
    console.log(`Artifact not found: ${REQUIRES} — did the agent write the file? Re-run: aitri discover-idea`);
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

  console.log(`\n[${PERSONA_DISPLAY_NAMES["product"]}] Loaded. Execute the following task:\n`);
  console.log("## Persona System Prompt");
  console.log(personaResult.systemPrompt);
  console.log("\n## Task");
  console.log(buildPrompt(discoveryContent));
  console.log("\n---");
  console.log(`→ WRITE artifact: ${ARTIFACT} — the next command requires this file.`);
  console.log(`→ Write the complete product spec to: ${outPath}`);
  console.log("→ When done: aitri ux-design  (or aitri arch-design --no-ux for non-UI projects)");
  return OK;
}
