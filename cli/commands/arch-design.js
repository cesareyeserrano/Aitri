// cli/commands/arch-design.js
// Pre-planning stage 4: System Architect persona
import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt, savePersonaContribution, extractPersonaSummary, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

const REQUIRES = ".aitri/product-spec.md";
const ARTIFACT = ".aitri/architecture-decision.md";

function buildPrompt(productSpecContent, uxDesignContent) {
  const uxSection = uxDesignContent
    ? `## UX Design\n${uxDesignContent}`
    : "## UX Design\n(not provided — non-UI feature or skipped with --no-ux)";

  return `Based on the product specification and UX design below, produce a complete architecture document.

Apply your full output schema in mandatory order:
1. Architecture Overview (system boundaries, key components, data flows)
2. C4 Level 2 Diagram (Mermaid — containers and their relationships)
3. ADRs — Architectural Decision Records (for each key decision: Decision, Status, Context, Options considered, Rationale, Consequences)
4. Resiliency Strategy (failure modes, circuit breakers, retry policies, graceful degradation)
5. Observability Stack (logging, metrics, tracing, alerting strategy)
6. Consistency Model (how data integrity is guaranteed across components)
7. Failure Blast Radius (explicit user-impact path when each critical component fails)
8. Throughput vs Latency (main bottleneck, scaling implication)
9. Technical Debt (known compromises and their planned resolution)

Mandatory analysis: consistency model, failure blast radius, throughput vs latency.

## Product Specification
${productSpecContent}

${uxSection}`;
}

export async function runArchDesignCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
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

  const personaResult = loadPersonaSystemPrompt("architect");
  if (!personaResult.ok) {
    console.log(`Failed to load architect persona: ${personaResult.error}`);
    return ERROR;
  }

  const productSpecContent = fs.readFileSync(requiresPath, "utf8");

  const uxPath = path.join(root, ".aitri/ux-design.md");
  const uxDesignContent = fs.existsSync(uxPath) && !options.noUx
    ? fs.readFileSync(uxPath, "utf8")
    : null;

  if (!uxDesignContent && !options.noUx && !options.nonInteractive) {
    console.log("Note: No UX design found (.aitri/ux-design.md). Proceeding without it.");
    console.log("      Run `aitri ux-design` first if this is a user-facing project.");
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

  if (!options.nonInteractive) console.log(`\n[${PERSONA_DISPLAY_NAMES["architect"]}] Evaluating architecture and stack...`);

  const result = await callAI({
    prompt: buildPrompt(productSpecContent, uxDesignContent),
    systemPrompt: personaResult.systemPrompt,
    config: aiConfig,
  });

  if (!result.ok) {
    console.log(`AI error: ${result.error}`);
    return ERROR;
  }

  const ts = new Date().toISOString();
  const artifact = `<!-- Aitri Architecture Decision — ${ts} -->\n\n${result.content}\n`;
  fs.writeFileSync(outPath, artifact, "utf8");

  const summary = extractPersonaSummary(result.content);
  savePersonaContribution({ persona: "architect", command: "arch-design", summary, root });
  if (!options.nonInteractive) console.log(`[${PERSONA_DISPLAY_NAMES["architect"]}] ${summary}`);

  if (!options.nonInteractive && !options.yes) {
    console.log(`\n--- ARCHITECTURE DECISION (${ARTIFACT}) ---`);
    console.log(result.content.slice(0, 1400) + (result.content.length > 1400 ? "\n...(see file for full content)" : ""));
    const answer = String(await ask("\nApprove architecture and continue? (y/n): ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(`Architecture not approved. Edit ${ARTIFACT} and re-run.`);
      return ABORTED;
    }
  }

  console.log(`\nArchitecture complete → ${ARTIFACT}`);
  console.log("Next: aitri sec-review");
  return OK;
}
