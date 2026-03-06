// cli/commands/design.js
// Fase 1, Paso 1.1: Design Session with 7 personas (SDLC v2.2)
import fs from "node:fs";
import path from "node:path";
import { loadPersonaSystemPrompt, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

const ARTIFACT = ".aitri/design.md";
const VALID_PROFILES = ["strict", "mvp"];

const PERSONA_SEQUENCE = [
  "discovery", "product", "ux-ui", "architect", "security", "qa", "developer"
];

function mvpPreamble(personaName) {
  const light = ["security", "qa"];
  if (!light.includes(personaName)) return null;
  return `PROFILE: mvp — You are running in MVP mode. Evaluate your domain strictly: ` +
    `if this feature genuinely has no impact on ${personaName === "security" ? "security, authentication, or data exposure" : "quality strategy, test coverage, or acceptance criteria"}, ` +
    `emit a NO IMPACT STATEMENT instead of full output. ` +
    `The NO IMPACT must include: justificacion (≥20 words explaining WHY no impact), ` +
    `and condiciones (conditions under which you WOULD require full review). ` +
    `If you detect actual impact despite the profile, ignore this directive and emit full output.`;
}

function buildDesignSessionPrompt(ideaText, profile) {
  const sections = [];
  sections.push(`You are facilitating a multi-persona Design Session for the following idea or feature:\n\n> ${ideaText}\n`);
  sections.push(`Profile: ${profile.toUpperCase()}`);
  sections.push(`Run each persona in the exact sequence below. Each persona's output feeds the next.`);
  sections.push(`\n## Output Structure\nWrite ONE document: .aitri/design.md\nEach persona gets its own ## section. Use persona name as section heading.\n`);

  for (const name of PERSONA_SEQUENCE) {
    const displayName = PERSONA_DISPLAY_NAMES[name] || name;
    sections.push(`\n${"=".repeat(60)}`);
    sections.push(`## PERSONA: ${displayName}`);
    const preamble = profile === "mvp" ? mvpPreamble(name) : null;
    if (preamble) sections.push(`\n${preamble}\n`);
    sections.push(`Apply your full output schema as defined in your system prompt below.`);
    sections.push(`Input: all previous persona sections in this document.`);
  }
  return sections.join("\n");
}

export async function runDesignCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  const profile = String(options.profile || "strict").toLowerCase();
  if (!VALID_PROFILES.includes(profile)) {
    console.log(`Invalid --profile value: "${profile}". Valid: ${VALID_PROFILES.join(", ")}`);
    return ERROR;
  }

  // Resolve idea text
  let ideaText = String(options.idea || "").trim();
  if (!ideaText && options.input) {
    const inputPath = path.join(root, String(options.input));
    if (fs.existsSync(inputPath)) {
      ideaText = fs.readFileSync(inputPath, "utf8").trim();
    }
  }
  if (!ideaText && options.feature) {
    ideaText = `Feature: ${options.feature}`;
  }
  if (!ideaText && !options.nonInteractive && !options.yes) {
    ideaText = String(await ask("Describe your idea or feature: ")).trim();
  }
  if (!ideaText) {
    console.log("Idea input is required. Use --idea <text>, --input <file>, or --feature <name>.");
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

  // Load all 7 persona system prompts
  const personaPrompts = {};
  for (const name of PERSONA_SEQUENCE) {
    const result = loadPersonaSystemPrompt(name);
    if (!result.ok) {
      console.log(`Failed to load ${name} persona: ${result.error}`);
      return ERROR;
    }
    personaPrompts[name] = result.systemPrompt;
  }

  console.log("\n[Design Session] 7 personas loaded. Execute the following task:\n");
  console.log("## Design Session — System Prompts");
  for (const name of PERSONA_SEQUENCE) {
    console.log(`\n### ${PERSONA_DISPLAY_NAMES[name] || name}`);
    console.log(personaPrompts[name]);
  }
  console.log("\n## Design Session — Task");
  console.log(buildDesignSessionPrompt(ideaText, profile));
  console.log("\n---");
  console.log(`→ WRITE artifact: ${ARTIFACT} — one document, one section per persona.`);
  console.log(`→ Write the complete design document to: ${outPath}`);
  console.log("→ When done: aitri design-review");
  return OK;
}
