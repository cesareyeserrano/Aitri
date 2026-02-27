// cli/commands/dev-roadmap.js
// Pre-planning stage 7: Lead Developer persona
import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt, savePersonaContribution, extractPersonaSummary, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

const ARTIFACT = ".aitri/dev-roadmap.md";

function readOptional(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function optionalSection(label, content, suggestion) {
  return content
    ? `## ${label}\n${content}`
    : `## ${label}\n(not yet run — run \`${suggestion}\` to include this context)`;
}

function buildPrompt(productSpec, arch, uxDesign, secReview, qaPlan) {
  return `Based on all planning artifacts below, produce a complete implementation roadmap.

Apply your full output schema in mandatory order:
1. Implementation Roadmap (phases with deliverables — each phase must be independently deployable)
2. Interface Contracts (public methods, input/output types, payload formats — pseudo-code or TypeScript)
3. Testing Strategy (unit/integration/e2e breakdown tied to the QA plan)
4. Technical Debt Registry (known compromises, their rationale, and planned resolution)
5. Technical Definition of Done (explicit checklist — code, tests, docs, security, observability)

Critical implementation vectors:
- Contract definition: every public interface fully typed
- Dependency map: required modules/services, mocking strategy for tests
- Complexity analysis: hot paths, race/concurrency risk points

## Product Specification
${productSpec}

## Architecture Decision
${arch}

${optionalSection("UX Design", uxDesign, "aitri ux-design")}

${optionalSection("Security Review", secReview, "aitri sec-review")}

${optionalSection("QA Plan", qaPlan, "aitri qa-plan")}`;
}

export async function runDevRoadmapCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const aiConfig = project.config.ai || {};

  if (!aiConfig.provider) {
    console.log("AI is not configured. Add an `ai` section to aitri.config.json.");
    return ERROR;
  }

  const productSpecPath = path.join(root, ".aitri/product-spec.md");
  const archPath = path.join(root, ".aitri/architecture-decision.md");

  if (!fs.existsSync(productSpecPath)) {
    console.log("Product spec not found: .aitri/product-spec.md");
    console.log("Run: aitri product-spec first.");
    return ERROR;
  }
  if (!fs.existsSync(archPath)) {
    console.log("Architecture document not found: .aitri/architecture-decision.md");
    console.log("Run: aitri arch-design first.");
    return ERROR;
  }

  const personaResult = loadPersonaSystemPrompt("developer");
  if (!personaResult.ok) {
    console.log(`Failed to load developer persona: ${personaResult.error}`);
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

  const productSpec = fs.readFileSync(productSpecPath, "utf8");
  const arch = fs.readFileSync(archPath, "utf8");
  const uxDesign = readOptional(root, ".aitri/ux-design.md");
  const secReview = readOptional(root, ".aitri/security-review.md");
  const qaPlan = readOptional(root, ".aitri/qa-plan.md");

  if (!options.nonInteractive) console.log(`\n[${PERSONA_DISPLAY_NAMES["developer"]}] Producing implementation roadmap...`);

  const result = await callAI({
    prompt: buildPrompt(productSpec, arch, uxDesign, secReview, qaPlan),
    systemPrompt: personaResult.systemPrompt,
    config: aiConfig,
  });

  if (!result.ok) {
    console.log(`AI error: ${result.error}`);
    return ERROR;
  }

  const ts = new Date().toISOString();
  const artifact = `<!-- Aitri Dev Roadmap — ${ts} -->\n\n${result.content}\n`;
  fs.writeFileSync(outPath, artifact, "utf8");

  const summary = extractPersonaSummary(result.content);
  savePersonaContribution({ persona: "developer", command: "dev-roadmap", summary, root });
  if (!options.nonInteractive) console.log(`[${PERSONA_DISPLAY_NAMES["developer"]}] ${summary}`);

  if (!options.nonInteractive && !options.yes) {
    console.log(`\n--- DEV ROADMAP (${ARTIFACT}) ---`);
    console.log(result.content.slice(0, 1400) + (result.content.length > 1400 ? "\n...(see file for full content)" : ""));
    const answer = String(await ask("\nApprove dev roadmap and continue? (y/n): ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(`Dev roadmap not approved. Edit ${ARTIFACT} and re-run.`);
      return ABORTED;
    }
  }

  console.log(`\nDev roadmap complete → ${ARTIFACT}`);
  console.log("Pre-planning complete. Use the roadmap as reference when running:");
  console.log("  aitri draft --feature <feature-name>");
  return OK;
}
