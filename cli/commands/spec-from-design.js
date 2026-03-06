// cli/commands/spec-from-design.js
// Fase 1, Paso 1.4: Spec Engineer — transforms design.md into approved spec + dependency-graph
import fs from "node:fs";
import path from "node:path";
import { validateCycles, writeDependencyGraph } from "../lib/dependency-graph.js";
import { resolveFeature } from "../lib.js";

const REQUIRES_DESIGN = ".aitri/design.md";
const REQUIRES_REVIEW = ".aitri/design-review.json";
const DEP_GRAPH = ".aitri/dependency-graph.json";

const SPEC_ENGINEER_SYSTEM_PROMPT = `You are the Spec Engineer — a specialized role whose ONLY purpose is to transform design language (ambiguous by nature) into an Immutable Requirements Graph.

RULE OF GOLD: If data needed to define an AC (Acceptance Criterion) does not exist in design.md, you emit a LOGIC_GAP and block the phase. You do NOT infer. You do NOT invent. You do NOT assume.

LOGIC_GAP format (YAML block):
logic_gap:
  id: LG-N
  elemento: "AC-N or FR-N"
  problema: "What is missing and why it is needed"
  seccion_faltante: "## Section that must be added to design.md"
  accion_requerida: "Exact edit needed in design.md before re-running spec-from-design"

OUTPUT RULES:
1. Approved spec: specs/approved/<feature>.md — following the AF-SPEC format with US/FR/AC IDs
2. Dependency graph: .aitri/dependency-graph.json — structured graph per schema
3. If ANY LOGIC_GAP is emitted: include all LOGIC_GAP blocks at the top of the spec under ## LOGIC_GAPS section, then STOP. Do not generate partial specs.
4. All AC IDs must have concrete, testable data derived directly from design.md.
5. All US/FR/AC IDs must be sequential starting from 1.

DEPENDENCY GRAPH SCHEMA:
{
  "feature": "<feature-name>",
  "generated": "<ISO timestamp>",
  "nodes": [
    { "id": "US-N", "depends_on": ["US-M"], "fr": ["FR-X", "FR-Y"] }
  ],
  "global_interfaces": ["GI-1"],
  "global_interface_consumers": { "GI-1": ["US-2", "US-3"] },
  "execution_order": ["US-1", "US-2", "US-3"]
}`;

function buildSpecEngineerPrompt(feature, designContent) {
  return `Transform the following design document into:
1. An approved spec file: specs/approved/${feature}.md
2. A dependency graph: .aitri/dependency-graph.json

Feature name: ${feature}

## Rules
- Extract US (User Stories), FR (Functional Rules), and AC (Acceptance Criteria) from the design.md
- Each AC must have concrete testable data from the design — if not present, emit LOGIC_GAP
- Build execution_order in the dependency graph based on depends_on relationships
- Identify global_interfaces (shared APIs/contracts used by 2+ user stories)
- Map global_interface_consumers for each GI

## Design Document
${designContent}

---
After writing both files, run: aitri spec-from-design --check --feature ${feature}
This validates LOGIC_GAPs and cycle integrity before proceeding.`;
}

function checkLogicGaps(specContent) {
  const gaps = [];
  const matches = [...String(specContent).matchAll(/^logic_gap:\s*\n([\s\S]*?)(?=\n\n|\nlogic_gap:|$)/gm)];
  for (const m of matches) {
    const idMatch = m[0].match(/id:\s*([^\n]+)/);
    const problemMatch = m[0].match(/problema:\s*([^\n]+)/);
    gaps.push({
      id: idMatch ? idMatch[1].trim() : "unknown",
      problema: problemMatch ? problemMatch[1].trim() : "unspecified problem"
    });
  }
  // Also check for ## LOGIC_GAPS section
  if (/^##\s+LOGIC_GAPS/im.test(specContent) && gaps.length === 0) {
    gaps.push({ id: "LG-?", problema: "LOGIC_GAPS section present but no structured entries found" });
  }
  return gaps;
}

export async function runSpecFromDesignCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();

  const reviewPath = path.join(root, REQUIRES_REVIEW);
  if (!fs.existsSync(reviewPath)) {
    console.log(`Artifact not found: ${REQUIRES_REVIEW} — run: aitri design-review`);
    return ERROR;
  }

  let reviewData = null;
  try {
    reviewData = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  } catch {
    console.log(`Cannot parse ${REQUIRES_REVIEW} — re-run: aitri design-review`);
    return ERROR;
  }

  if (!reviewData.ok) {
    console.log(`Design was not approved. Edit .aitri/design.md and re-run: aitri design-review`);
    return ERROR;
  }

  const designPath = path.join(root, REQUIRES_DESIGN);
  if (!fs.existsSync(designPath)) {
    console.log(`Artifact not found: ${REQUIRES_DESIGN} — run: aitri design --idea "<idea>"`);
    return ERROR;
  }

  // Resolve feature name
  let feature;
  try {
    feature = resolveFeature(options, () => null);
  } catch {
    feature = null;
  }
  if (!feature) {
    console.log("Feature name required. Use --feature <name> or run from a project with an active feature.");
    return ERROR;
  }

  const designContent = fs.readFileSync(designPath, "utf8");

  // --check mode: validate existing output
  if (options.check) {
    return runCheckMode(root, feature, project, ERROR, OK);
  }

  // Output task for agent
  const specOutPath = project.paths.approvedSpecFile(feature);
  const depGraphPath = path.join(root, DEP_GRAPH);

  console.log("\n--- AGENT TASK: spec-from-design ---");
  console.log("\n## Spec Engineer System Prompt");
  console.log(SPEC_ENGINEER_SYSTEM_PROMPT);
  console.log("\n## Task");
  console.log(buildSpecEngineerPrompt(feature, designContent));
  console.log("\n---");
  console.log(`→ WRITE spec: ${path.relative(root, specOutPath)}`);
  console.log(`→ WRITE dep-graph: ${DEP_GRAPH}`);
  console.log(`→ After writing both files, run: aitri spec-from-design --check --feature ${feature}`);
  console.log("→ Next (after check passes): aitri validate-design");
  return OK;
}

function runCheckMode(root, feature, project, ERROR, OK) {
  const specPath = project.paths.approvedSpecFile(feature);
  const depGraphPath = path.join(root, DEP_GRAPH);

  const issues = [];

  // Check spec exists
  if (!fs.existsSync(specPath)) {
    issues.push(`Spec not found: ${path.relative(root, specPath)} — agent must write it first`);
  } else {
    const specContent = fs.readFileSync(specPath, "utf8");
    const gaps = checkLogicGaps(specContent);
    if (gaps.length > 0) {
      issues.push(`${gaps.length} LOGIC_GAP(s) in spec:`);
      gaps.forEach((g) => issues.push(`  - ${g.id}: ${g.problema}`));
      issues.push(`Fix: edit .aitri/design.md to resolve gaps, then re-run: aitri spec-from-design --feature ${feature}`);
    }
  }

  // Check dep-graph exists and is valid
  if (!fs.existsSync(depGraphPath)) {
    issues.push(`Dependency graph not found: ${DEP_GRAPH} — agent must write it`);
  } else {
    let graph = null;
    try {
      graph = JSON.parse(fs.readFileSync(depGraphPath, "utf8"));
    } catch {
      issues.push(`Dependency graph is invalid JSON: ${DEP_GRAPH}`);
    }
    if (graph) {
      const cycleResult = validateCycles(graph);
      if (!cycleResult.ok) {
        issues.push(`Dependency graph has cycles: ${cycleResult.cycles.map((c) => c.join(" → ")).join("; ")}`);
        issues.push(`Fix: remove circular dependencies from .aitri/dependency-graph.json`);
      }
    }
  }

  if (issues.length > 0) {
    console.log("spec-from-design CHECK FAILED:");
    issues.forEach((i) => console.log(`  ${i}`));
    return ERROR;
  }

  console.log("spec-from-design check passed.");
  console.log(`  Spec: ${path.relative(root, project.paths.approvedSpecFile(feature))}`);
  console.log(`  Dependency graph: ${DEP_GRAPH} (no cycles)`);
  console.log("→ Next: aitri validate-design");
  return OK;
}
