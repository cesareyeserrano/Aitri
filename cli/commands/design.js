// cli/commands/design.js
// Fase 1, Paso 1.1: Design Session with 7 personas (SDLC v2.2)
// EVO-098: --brownfield mode bridges adopt output to SDLC v2.2 pipeline
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

// EVO-098: brownfield design prompt — personas infer from existing code
function buildBrownfieldDesignPrompt(manifest, draftSpecSummaries, profile) {
  const stacks = (manifest.stacks || []).map((s) => s.name).join(", ") || "unknown";
  const entryPoints = (manifest.entryPoints || []).join(", ") || "(none detected)";
  const testCount = manifest.existingTestFiles || 0;
  const conventions = manifest.conventions || {};

  const header = [
    `## Brownfield Context`,
    ``,
    `You are performing a retrograde Design Session on an EXISTING project.`,
    `Do NOT design from scratch. Document what IS, identify gaps, note what needs change.`,
    ``,
    `### Detected Stack`,
    `- Languages/runtimes: ${stacks}`,
    `- Entry points: ${entryPoints}`,
    `- Existing test files: ${testCount}`,
    `- Source path: ${conventions.sourcePath || "(unknown)"}`,
    ``,
    `### Feature Classification (required in design.md)`,
    `- type: brownfield`,
    ``,
    `### Available Draft Specs`,
    draftSpecSummaries.length > 0
      ? draftSpecSummaries.map((s) => `- ${s.name}: ${s.preview}`).join("\n")
      : `- (no draft specs yet — infer from adoption manifest and entry points)`,
    ``,
    `### Persona Instructions for Brownfield`,
    `- Discovery: document the EXISTING problem domain, actors, and pain points observed in the codebase`,
    `- Product: document existing business value delivered + gaps vs desired state`,
    `- Architect: document the AS-IS stack, structural decisions, and technical debt`,
    `- Security: audit the existing security posture; emit NO IMPACT only if posture is verifiably clean`,
    `- QA: document existing test coverage, quality gaps, and missing acceptance criteria`,
    `- Developer: document current US/story breakdown inferred from existing features + implementation order for gaps`,
    ``,
    `Profile: ${profile.toUpperCase()}`,
    `Run each persona in sequence. Write one .aitri/design.md with one section per persona.`
  ].join("\n");

  const personaBlocks = PERSONA_SEQUENCE.map((name) => {
    const displayName = PERSONA_DISPLAY_NAMES[name] || name;
    const preamble = profile === "mvp" ? mvpPreamble(name) : null;
    return [
      `\n${"=".repeat(60)}`,
      `## PERSONA: ${displayName}`,
      preamble ? `\n${preamble}\n` : "",
      `Apply your full output schema. Input: brownfield context above + all previous persona sections.`
    ].join("\n");
  });

  return header + personaBlocks.join("\n");
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
  const project = getProjectContextOrExit();
  const root = process.cwd();

  const profile = String(options.profile || "strict").toLowerCase();
  if (!VALID_PROFILES.includes(profile)) {
    console.log(`Invalid --profile value: "${profile}". Valid: ${VALID_PROFILES.join(", ")}`);
    return ERROR;
  }

  // EVO-098: brownfield mode
  if (options.brownfield) {
    const manifestPath = path.join(project.paths.docsRoot, "adoption-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      console.log("Brownfield mode requires docs/adoption-manifest.json.");
      console.log("Run: aitri adopt  (Phase 1 scan first)");
      return ERROR;
    }
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch {
      console.log("Could not parse docs/adoption-manifest.json.");
      return ERROR;
    }

    // Collect draft spec previews
    const draftSpecSummaries = [];
    const draftsDir = project.paths.specsDraftsDir;
    if (fs.existsSync(draftsDir)) {
      for (const f of fs.readdirSync(draftsDir).filter((x) => x.endsWith(".md"))) {
        try {
          const content = fs.readFileSync(path.join(draftsDir, f), "utf8");
          const firstLine = content.split("\n").find((l) => l.trim()) || "";
          draftSpecSummaries.push({ name: f.replace(/\.md$/, ""), preview: firstLine.slice(0, 80) });
        } catch { /* skip */ }
      }
    }

    const outPath = path.join(root, ARTIFACT);
    if (fs.existsSync(outPath) && !options.force) {
      console.log(`${ARTIFACT} already exists. Use --force to regenerate.`);
      return ERROR;
    }

    // Load personas
    const personaPrompts = {};
    for (const name of PERSONA_SEQUENCE) {
      const result = loadPersonaSystemPrompt(name);
      if (!result.ok) { console.log(`Failed to load ${name} persona: ${result.error}`); return ERROR; }
      personaPrompts[name] = result.systemPrompt;
    }

    console.log("\n[Brownfield Design Session] Execute the following task:\n");
    console.log("## Design Session — System Prompts");
    for (const name of PERSONA_SEQUENCE) {
      console.log(`\n### ${PERSONA_DISPLAY_NAMES[name] || name}`);
      console.log(personaPrompts[name]);
    }
    console.log("\n## Design Session — Brownfield Task");
    console.log(buildBrownfieldDesignPrompt(manifest, draftSpecSummaries, profile));
    console.log("\n---");
    console.log(`→ WRITE artifact: ${ARTIFACT} — feature-type: brownfield, one section per persona.`);
    console.log(`→ Write the complete design document to: ${outPath}`);
    console.log("→ When done: aitri design-review");

    // Write brownfield-entry marker
    const markerPath = path.join(root, ".aitri", "brownfield-entry.json");
    fs.mkdirSync(path.join(root, ".aitri"), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({
      schemaVersion: 1, entryType: "brownfield",
      manifestUsed: path.relative(root, manifestPath),
      initiatedAt: new Date().toISOString(), profile
    }, null, 2), "utf8");
    console.log(`→ Marker written: .aitri/brownfield-entry.json`);
    return OK;
  }

  // Resolve idea text (greenfield)
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
    console.log("Idea input is required. Use --idea <text>, --input <file>, --feature <name>, or --brownfield.");
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
