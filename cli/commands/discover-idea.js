// cli/commands/discover-idea.js
// Pre-planning stage 1: Discovery Facilitator persona
import fs from "node:fs";
import path from "node:path";
import { loadPersonaSystemPrompt, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

const ARTIFACT = ".aitri/discovery.md";

function buildPrompt(ideaText) {
  return `A new product idea has been submitted for discovery analysis.

Apply your full output schema in strict sequence:
1. Problem Framing
2. User and JTBD
3. Scope Boundaries
4. Constraints and Dependencies
5. Success Metrics
6. Risk and Assumption Log
7. Discovery Confidence (Low/Medium/High — with handoff decision: Ready for Product / Blocked for Clarification)

Block handoff if success metrics are missing, subjective, or non-verifiable.

## Raw Idea Input
${ideaText}`;
}

export async function runDiscoverIdeaCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  // Resolve idea text from --idea, --input file, or interactive prompt
  let ideaText = String(options.idea || "").trim();
  if (!ideaText && options.input && fs.existsSync(String(options.input))) {
    ideaText = fs.readFileSync(String(options.input), "utf8").trim();
  }
  if (!ideaText && !options.nonInteractive && !options.yes) {
    ideaText = String(await ask("Describe your idea (what problem does this solve?): ")).trim();
  }
  if (!ideaText) {
    console.log("Idea input is required. Use --idea <text> or --input <file>.");
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

  const personaResult = loadPersonaSystemPrompt("discovery");
  if (!personaResult.ok) {
    console.log(`Failed to load discovery persona: ${personaResult.error}`);
    return ERROR;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  console.log(`\n[${PERSONA_DISPLAY_NAMES["discovery"]}] Loaded. Execute the following task:\n`);
  console.log("## Persona System Prompt");
  console.log(personaResult.systemPrompt);
  console.log("\n## Task");
  console.log(buildPrompt(ideaText));
  console.log("\n---");
  console.log(`→ WRITE artifact: ${ARTIFACT} — the next command requires this file.`);
  console.log(`→ Write the complete discovery document to: ${outPath}`);
  console.log("→ When done: aitri product-spec");
  return OK;
}
