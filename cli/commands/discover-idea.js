// cli/commands/discover-idea.js
// Pre-planning stage 1: Discovery Facilitator persona
import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt, savePersonaContribution, extractPersonaSummary, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

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
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const aiConfig = project.config.ai || {};

  if (!aiConfig.provider) {
    console.log("AI is not configured. Add an `ai` section to aitri.config.json.");
    return ERROR;
  }

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

  if (!options.nonInteractive) console.log(`\n[${PERSONA_DISPLAY_NAMES["discovery"]}] Analyzing idea and framing problem space...`);

  const result = await callAI({
    prompt: buildPrompt(ideaText),
    systemPrompt: personaResult.systemPrompt,
    config: aiConfig,
  });

  if (!result.ok) {
    console.log(`AI error: ${result.error}`);
    return ERROR;
  }

  const ts = new Date().toISOString();
  const artifact = `<!-- Aitri Discovery Artifact — ${ts} -->\n\n${result.content}\n`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, artifact, "utf8");

  const summary = extractPersonaSummary(result.content);
  savePersonaContribution({ persona: "discovery", command: "discover-idea", summary, root });
  if (!options.nonInteractive) console.log(`[${PERSONA_DISPLAY_NAMES["discovery"]}] ${summary}`);

  if (!options.nonInteractive && !options.yes) {
    console.log(`\n--- DISCOVERY ARTIFACT (${ARTIFACT}) ---`);
    console.log(result.content.slice(0, 1400) + (result.content.length > 1400 ? "\n...(see file for full content)" : ""));
    const answer = String(await ask("\nApprove discovery and continue? (y/n): ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(`Discovery not approved. Edit ${ARTIFACT} and re-run, or adjust your idea.`);
      return ABORTED;
    }
  }

  console.log(`\nDiscovery complete → ${ARTIFACT}`);
  console.log("Next: aitri product-spec");
  return OK;
}
