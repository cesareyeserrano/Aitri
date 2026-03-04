// cli/commands/sec-review.js
// Pre-planning stage 5: Security Champion persona
import fs from "node:fs";
import path from "node:path";
import { loadPersonaSystemPrompt, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

const REQUIRES = ".aitri/architecture-decision.md";
const ARTIFACT = ".aitri/security-review.md";

function buildPrompt(archContent) {
  return `Based on the architecture document below, perform a complete security review.

Apply your full output schema in mandatory order:
1. Threat Profile (2-3 most likely attack scenarios given this architecture, with likelihood and impact)
2. Security Requirements — Must-Haves (AuthN/AuthZ controls, data handling, input validation, encryption)
3. Operational Guardrails (rate limiting, audit logging, input sanitization, secret management)
4. Dependency Check (flag high-risk libraries, unvetted external services, supply chain risks)
5. Risk Decision and Trade-off Summary (for each identified risk: Block/Mitigate/Accept — with owner, reason, review date)

Stage gates:
- Ready for Dev: must-have controls defined and testable
- Ready for Prod: controls validated, high/critical risks resolved or explicitly accepted

## Architecture Document
${archContent}`;
}

export async function runSecReviewCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  const requiresPath = path.join(root, REQUIRES);
  if (!fs.existsSync(requiresPath)) {
    console.log(`Artifact not found: ${REQUIRES} — did the agent write the file? Re-run: aitri arch-design`);
    return ERROR;
  }

  const personaResult = loadPersonaSystemPrompt("security");
  if (!personaResult.ok) {
    console.log(`Failed to load security persona: ${personaResult.error}`);
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

  const archContent = fs.readFileSync(requiresPath, "utf8");

  console.log(`\n[${PERSONA_DISPLAY_NAMES["security"]}] Loaded. Execute the following task:\n`);
  console.log("## Persona System Prompt");
  console.log(personaResult.systemPrompt);
  console.log("\n## Task");
  console.log(buildPrompt(archContent));
  console.log("\n---");
  console.log(`→ WRITE artifact: ${ARTIFACT} — the next command requires this file.`);
  console.log(`→ Write the complete security review to: ${outPath}`);
  console.log("→ When done: aitri qa-plan");
  return OK;
}
