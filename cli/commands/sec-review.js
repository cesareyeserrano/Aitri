// cli/commands/sec-review.js
// Pre-planning stage 5: Security Champion persona
import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt, savePersonaContribution, extractPersonaSummary, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

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
    console.log(`Architecture document not found: ${REQUIRES}`);
    console.log("Run: aitri arch-design first.");
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

  if (!options.nonInteractive) console.log(`\n[${PERSONA_DISPLAY_NAMES["security"]}] Reviewing security threats and controls...`);

  const result = await callAI({
    prompt: buildPrompt(archContent),
    systemPrompt: personaResult.systemPrompt,
    config: aiConfig,
  });

  if (!result.ok) {
    console.log(`AI error: ${result.error}`);
    return ERROR;
  }

  const ts = new Date().toISOString();
  const artifact = `<!-- Aitri Security Review — ${ts} -->\n\n${result.content}\n`;
  fs.writeFileSync(outPath, artifact, "utf8");

  const summary = extractPersonaSummary(result.content);
  savePersonaContribution({ persona: "security", command: "sec-review", summary, root });
  if (!options.nonInteractive) console.log(`[${PERSONA_DISPLAY_NAMES["security"]}] ${summary}`);

  if (!options.nonInteractive && !options.yes) {
    console.log(`\n--- SECURITY REVIEW (${ARTIFACT}) ---`);
    console.log(result.content.slice(0, 1400) + (result.content.length > 1400 ? "\n...(see file for full content)" : ""));
    const answer = String(await ask("\nApprove security review and continue? (y/n): ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(`Security review not approved. Edit ${ARTIFACT} and re-run.`);
      return ABORTED;
    }
  }

  console.log(`\nSecurity review complete → ${ARTIFACT}`);
  console.log("Next: aitri qa-plan");
  return OK;
}
