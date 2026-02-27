// cli/commands/qa-plan.js
// Pre-planning stage 6: Quality Engineer persona
import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";

const ARTIFACT = ".aitri/qa-plan.md";

function readOptional(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function buildPrompt(productSpecContent, archContent, secContent) {
  const secSection = secContent
    ? `## Security Review\n${secContent}`
    : "## Security Review\n(not yet run — run `aitri sec-review` to include security context)";

  return `Based on the product specification, architecture, and security review below, produce a complete QA plan.

Apply your full output schema in mandatory order:
1. Test Suite Architecture (Unit | Integration/Contract | E2E — scope and tooling for each layer)
2. Breaking Point Analysis (what load, data volume, or concurrent users breaks the system)
3. Security and Vulnerability Audit (test cases for each threat identified in security review)
4. Data Validation Rules (input boundaries, null/empty/edge cases, injection attempts)
5. Quality Gate Status (Go/No-Go verdict per pipeline stage with explicit pass criteria)

Critical validation vectors — must cover:
- Happy path: expected ideal flow end-to-end
- Negative and abuse scenarios: invalid payloads, unauthorized access, injection
- Edge cases: boundary conditions (min/max/null/empty/concurrent)
- Contract integrity: responses match specified interface contracts

## Product Specification
${productSpecContent}

## Architecture Document
${archContent}

${secSection}`;
}

export async function runQaPlanCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
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

  const personaResult = loadPersonaSystemPrompt("qa");
  if (!personaResult.ok) {
    console.log(`Failed to load qa persona: ${personaResult.error}`);
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

  const productSpecContent = fs.readFileSync(productSpecPath, "utf8");
  const archContent = fs.readFileSync(archPath, "utf8");
  const secContent = readOptional(root, ".aitri/security-review.md");

  if (!options.nonInteractive) console.log("Running Quality Engineer analysis...");

  const result = await callAI({
    prompt: buildPrompt(productSpecContent, archContent, secContent),
    systemPrompt: personaResult.systemPrompt,
    config: aiConfig,
  });

  if (!result.ok) {
    console.log(`AI error: ${result.error}`);
    return ERROR;
  }

  const ts = new Date().toISOString();
  const artifact = `<!-- Aitri QA Plan — ${ts} -->\n\n${result.content}\n`;
  fs.writeFileSync(outPath, artifact, "utf8");

  if (!options.nonInteractive && !options.yes) {
    console.log(`\n--- QA PLAN (${ARTIFACT}) ---`);
    console.log(result.content.slice(0, 1400) + (result.content.length > 1400 ? "\n...(see file for full content)" : ""));
    const answer = String(await ask("\nApprove QA plan and continue? (y/n): ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(`QA plan not approved. Edit ${ARTIFACT} and re-run.`);
      return ABORTED;
    }
  }

  console.log(`\nQA plan complete → ${ARTIFACT}`);
  console.log("Next: aitri dev-roadmap");
  return OK;
}
