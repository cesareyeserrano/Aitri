import fs from "node:fs";
import path from "node:path";
import { collectPersonaValidationIssues } from "./persona-validation.js";
import { normalizeFeatureName } from "../lib.js";
import { readDependencyGraph, validateCycles } from "../lib/dependency-graph.js";

function wantsJson(options, positional = []) {
  if (options.json) return true;
  if ((options.format || "").toLowerCase() === "json") return true;
  return positional.some((p) => p.toLowerCase() === "json");
}

export async function runValidateCommand({
  options,
  ask,
  getProjectContextOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const _validateJsonOutput = (options.json) || ((options.format||"").toLowerCase()==="json") || (options.positional||[]).some(p=>p.toLowerCase()==="json");
  if (!_validateJsonOutput) {
    console.log("DEPRECATION: `aitri validate` is deprecated. `aitri go` runs validation automatically.");
  }
  const project = getProjectContextOrExit();
  const validatePositional = [...options.positional];
  const jsonOutput = wantsJson(options, validatePositional);
  if (validatePositional.length > 0 && validatePositional[validatePositional.length - 1].toLowerCase() === "json") {
    validatePositional.pop();
  }

  const rawFeatureInput = String(options.feature || validatePositional[0] || "").trim();
  let feature = normalizeFeatureName(rawFeatureInput);
  if (rawFeatureInput && !feature) {
    const msg = "Invalid feature name. Use kebab-case (example: user-login).";
    if (jsonOutput) {
      console.log(JSON.stringify({
        ok: false,
        feature: null,
        issues: [msg],
        gaps: {
          usage: [msg]
        }
      }, null, 2));
    } else {
      console.log(msg);
    }
    return ERROR;
  }
  if (!feature && !options.nonInteractive) {
    const prompted = await ask("Feature name (kebab-case, e.g. user-login): ");
    feature = normalizeFeatureName(prompted);
    if (!feature && String(prompted || "").trim()) {
      const msg = "Invalid feature name. Use kebab-case (example: user-login).";
      if (jsonOutput) {
        console.log(JSON.stringify({
          ok: false,
          feature: null,
          issues: [msg],
          gaps: {
            usage: [msg]
          }
        }, null, 2));
      } else {
        console.log(msg);
      }
      return ERROR;
    }
  }

  if (!feature) {
    const msg = "Feature name is required. Use --feature <name> in non-interactive mode.";
    if (jsonOutput) {
      console.log(JSON.stringify({
        ok: false,
        feature: null,
        issues: [msg],
        gaps: {
          usage: [msg]
        }
      }, null, 2));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const approvedFile = project.paths.approvedSpecFile(feature);
  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const discoveryFile = project.paths.discoveryFile(feature);
  const planFile = project.paths.planFile(feature);

  const issues = [];
  const gapTypes = {
    missing_artifact: [],
    structure: [],
    placeholder: [],
    story_contract: [],
    persona: [],
    coverage_fr_us: [],
    coverage_fr_tc: [],
    coverage_us_tc: []
  };
  const addIssue = (type, message) => {
    issues.push(message);
    if (gapTypes[type]) gapTypes[type].push(message);
  };
  const result = {
    ok: false,
    feature,
    files: {
      spec: path.relative(process.cwd(), approvedFile),
      backlog: path.relative(process.cwd(), backlogFile),
      tests: path.relative(process.cwd(), testsFile),
      discovery: path.relative(process.cwd(), discoveryFile),
      plan: path.relative(process.cwd(), planFile)
    },
    coverage: {
      specFr: 0,
      backlogFr: 0,
      testsFr: 0,
      backlogUs: 0,
      testsUs: 0
    },
    gaps: gapTypes,
    gapSummary: {},
    issues
  };

  if (!fs.existsSync(approvedFile)) {
    addIssue("missing_artifact", `Missing approved spec: ${path.relative(process.cwd(), approvedFile)}`);
  }
  if (!fs.existsSync(backlogFile)) {
    addIssue("missing_artifact", `Missing backlog: ${path.relative(process.cwd(), backlogFile)}`);
  }
  if (!fs.existsSync(testsFile)) {
    addIssue("missing_artifact", `Missing tests: ${path.relative(process.cwd(), testsFile)}`);
  }
  // EVO-092: skip discovery requirement if project-level pre-planning discovery exists
  const _prePlanningDiscovery = fs.existsSync(path.join(process.cwd(), ".aitri", "discovery.md"));
  if (!_prePlanningDiscovery && !fs.existsSync(discoveryFile)) {
    addIssue("missing_artifact", `Missing discovery: ${path.relative(process.cwd(), discoveryFile)}`);
  }
  if (!fs.existsSync(planFile)) {
    addIssue("missing_artifact", `Missing plan: ${path.relative(process.cwd(), planFile)}`);
  }

  result.gapSummary = Object.fromEntries(Object.entries(gapTypes).map(([k, v]) => [k, v.length]));

  if (issues.length > 0) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach(i => console.log("- " + i));
    }
    return ERROR;
  }

  const spec = fs.readFileSync(approvedFile, "utf8");
  const backlog = fs.readFileSync(backlogFile, "utf8");
  const tests = fs.readFileSync(testsFile, "utf8");

  if (!/###\s+US-\d+/m.test(backlog)) {
    addIssue("structure", "Backlog must include at least one user story with an ID like `### US-1`.");
  }
  if (backlog.includes("FR-?")) {
    addIssue("placeholder", "Backlog contains placeholder `FR-?`. Replace with real Functional Rule IDs (FR-1, FR-2...).");
  }
  if (backlog.includes("AC-?")) {
    addIssue("placeholder", "Backlog contains placeholder `AC-?`. Replace with real Acceptance Criteria IDs (AC-1, AC-2...).");
  }

  if (!/###\s+TC-\d+/m.test(tests)) {
    addIssue("structure", "Tests must include at least one test case with an ID like `### TC-1`.");
  }
  if (tests.includes("US-?")) {
    addIssue("placeholder", "Tests contain placeholder `US-?`. Replace with real User Story IDs (US-1, US-2...).");
  }
  if (tests.includes("FR-?")) {
    addIssue("placeholder", "Tests contain placeholder `FR-?`. Replace with real Functional Rule IDs (FR-1, FR-2...).");
  }
  if (tests.includes("AC-?")) {
    addIssue("placeholder", "Tests contain placeholder `AC-?`. Replace with real Acceptance Criteria IDs (AC-1, AC-2...).");
  }

  const backlogGeneratedByPlan = /> Generated by `aitri plan`\./.test(backlog);
  if (backlogGeneratedByPlan) {
    const storyActors = [...backlog.matchAll(/- As an?\s+([^,]+),\s*I want\b/gi)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    if (storyActors.length === 0) {
      addIssue(
        "story_contract",
        "Story contract: backlog generated by `aitri plan` must include story sentences in the form `As a <actor>, I want ...`."
      );
    } else {
      const genericActorPattern = /^(user|users|customer|customers|client|clients|person|people)$/i;
      storyActors
        .filter((actor) => genericActorPattern.test(actor))
        .forEach((actor) => {
          addIssue(
            "story_contract",
            `Story contract: actor '${actor}' is too generic. Use a specific role (for example 'Admin', 'Level 1 Player', 'Support Agent').`
          );
        });
    }

    const hasGherkinCriteria = /\bGiven\b[\s\S]{0,200}\bWhen\b[\s\S]{0,200}\bThen\b/i.test(backlog);
    if (!hasGherkinCriteria) {
      addIssue(
        "story_contract",
        "Story contract: backlog generated by `aitri plan` must include at least one acceptance criterion in Given/When/Then format."
      );
    }
  }

  result.gapSummary = Object.fromEntries(Object.entries(gapTypes).map(([k, v]) => [k, v.length]));

  if (issues.length > 0) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach(i => console.log("- " + i));
    }
    return ERROR;
  }

  const specFRs = [...spec.matchAll(/\bFR-\d+\b/g)].map(m => m[0]);
  const backlogFRs = new Set([...backlog.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));

  const missingFRCoverage = [...new Set(specFRs)].filter(fr => !backlogFRs.has(fr));
  missingFRCoverage.forEach(fr =>
    addIssue("coverage_fr_us", `Coverage: ${fr} is defined in spec but not referenced in backlog user stories.`)
  );

  const testsFRs = new Set([...tests.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));
  const missingFRTestsCoverage = [...new Set(specFRs)].filter(fr => !testsFRs.has(fr));
  missingFRTestsCoverage.forEach(fr =>
    addIssue("coverage_fr_tc", `Coverage: ${fr} is defined in spec but not referenced in tests.`)
  );

  const backlogUS = [...backlog.matchAll(/\bUS-\d+\b/g)].map(m => m[0]);
  const testsUS = new Set([...tests.matchAll(/\bUS-\d+\b/g)].map(m => m[0]));

  const missingUSCoverage = [...new Set(backlogUS)].filter(us => !testsUS.has(us));
  missingUSCoverage.forEach(us =>
    addIssue("coverage_us_tc", `Coverage: ${us} exists in backlog but is not referenced in tests.`)
  );

  result.coverage.specFr = new Set(specFRs).size;
  result.coverage.backlogFr = backlogFRs.size;
  result.coverage.testsFr = testsFRs.size;
  result.coverage.backlogUs = new Set(backlogUS).size;
  result.coverage.testsUs = testsUS.size;

  // EVO-092: skip discovery gate if project-level pre-planning discovery exists
  const discoveryContent = (!_prePlanningDiscovery && fs.existsSync(discoveryFile)) ? fs.readFileSync(discoveryFile, "utf8") : null;
  const planContent = fs.readFileSync(planFile, "utf8");
  // EVO-088: read pre-planning arch/security for fallback gate satisfaction
  const _archFile = path.join(process.cwd(), ".aitri", "architecture-decision.md");
  const _secFile = path.join(process.cwd(), ".aitri", "security-review.md");
  const archContent = fs.existsSync(_archFile) ? fs.readFileSync(_archFile, "utf8") : null;
  const securityContent = fs.existsSync(_secFile) ? fs.readFileSync(_secFile, "utf8") : null;
  const personaIssues = collectPersonaValidationIssues({ discoveryContent, planContent, specContent: spec, archContent, securityContent });
  personaIssues.forEach((issue) => addIssue("persona", issue));

  result.gapSummary = Object.fromEntries(Object.entries(gapTypes).map(([k, v]) => [k, v.length]));

  if (issues.length > 0) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach((i) => console.log("- " + i));
    }
    return ERROR;
  }

  result.ok = true;
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("VALIDATION PASSED ✅");
    console.log("- Spec: " + path.relative(process.cwd(), approvedFile));
    console.log("- Backlog: " + path.relative(process.cwd(), backlogFile));
    console.log("- Tests: " + path.relative(process.cwd(), testsFile));
  }
  return OK;
}

export function collectValidationIssues(project, feature, paths) {
  const approvedFile = paths.approvedSpecFile(feature);
  const backlogFile = paths.backlogFile(feature);
  const testsFile = paths.testsFile(feature);
  const discoveryFile = paths.discoveryFile(feature);
  const planFile = paths.planFile(feature);

  const issues = [];

  // Stale marker check: spec was amended, downstream artifacts are out of date
  if (paths.staleMarkerFile) {
    const staleFile = paths.staleMarkerFile(feature);
    if (fs.existsSync(staleFile)) {
      issues.push("Spec was amended. Re-run discover and plan to update downstream artifacts.");
    }
  }
  // EVO-092: skip discovery requirement if project-level pre-planning discovery exists
  const _prePlanningDiscovery2 = fs.existsSync(path.join(process.cwd(), ".aitri", "discovery.md"));
  if (!fs.existsSync(approvedFile)) issues.push(`Missing approved spec: ${path.relative(process.cwd(), approvedFile)}`);
  if (!fs.existsSync(backlogFile)) issues.push(`Missing backlog: ${path.relative(process.cwd(), backlogFile)}`);
  if (!fs.existsSync(testsFile)) issues.push(`Missing tests: ${path.relative(process.cwd(), testsFile)}`);
  if (!_prePlanningDiscovery2 && !fs.existsSync(discoveryFile)) issues.push(`Missing discovery: ${path.relative(process.cwd(), discoveryFile)}`);
  if (!fs.existsSync(planFile)) issues.push(`Missing plan: ${path.relative(process.cwd(), planFile)}`);
  if (issues.length > 0) return issues;

  const spec = fs.readFileSync(approvedFile, "utf8");
  const backlog = fs.readFileSync(backlogFile, "utf8");
  const tests = fs.readFileSync(testsFile, "utf8");

  if (!/###\s+US-\d+/m.test(backlog)) issues.push("Backlog must include at least one user story with an ID like `### US-1`.");
  if (backlog.includes("FR-?")) issues.push("Backlog contains placeholder `FR-?`.");
  if (backlog.includes("AC-?")) issues.push("Backlog contains placeholder `AC-?`.");
  if (!/###\s+TC-\d+/m.test(tests)) issues.push("Tests must include at least one test case with an ID like `### TC-1`.");
  if (tests.includes("US-?")) issues.push("Tests contain placeholder `US-?`.");
  if (tests.includes("FR-?")) issues.push("Tests contain placeholder `FR-?`.");
  if (tests.includes("AC-?")) issues.push("Tests contain placeholder `AC-?`.");

  const specFRs = [...new Set([...spec.matchAll(/\bFR-\d+\b/g)].map(m => m[0]))];
  const backlogFRs = new Set([...backlog.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));
  const testsFRs = new Set([...tests.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));
  const backlogUS = [...new Set([...backlog.matchAll(/\bUS-\d+\b/g)].map(m => m[0]))];
  const testsUS = new Set([...tests.matchAll(/\bUS-\d+\b/g)].map(m => m[0]));

  specFRs.filter(fr => !backlogFRs.has(fr)).forEach(fr => issues.push(`Coverage: ${fr} not in backlog.`));
  specFRs.filter(fr => !testsFRs.has(fr)).forEach(fr => issues.push(`Coverage: ${fr} not in tests.`));
  backlogUS.filter(us => !testsUS.has(us)).forEach(us => issues.push(`Coverage: ${us} not in tests.`));

  const discoveryContent = (!_prePlanningDiscovery2 && fs.existsSync(discoveryFile)) ? fs.readFileSync(discoveryFile, "utf8") : null;
  const planContent = fs.readFileSync(planFile, "utf8");
  // EVO-088: read pre-planning arch/security for fallback gate satisfaction
  const _archFile2 = path.join(process.cwd(), ".aitri", "architecture-decision.md");
  const _secFile2 = path.join(process.cwd(), ".aitri", "security-review.md");
  const archContent2 = fs.existsSync(_archFile2) ? fs.readFileSync(_archFile2, "utf8") : null;
  const securityContent2 = fs.existsSync(_secFile2) ? fs.readFileSync(_secFile2, "utf8") : null;
  collectPersonaValidationIssues({ discoveryContent, planContent, specContent: spec, archContent: archContent2, securityContent: securityContent2 }).forEach(i => issues.push(i));

  return issues;
}

// EVO-097: Fase 1 interconnection gate (Paso 1.5)
export async function runValidateDesignCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const blockers = [];

  // Gate 1: design-review.json must exist and be approved
  const reviewPath = path.join(root, ".aitri/design-review.json");
  if (!fs.existsSync(reviewPath)) {
    blockers.push("design-review.json missing — run: aitri design-review");
  } else {
    let review = null;
    try { review = JSON.parse(fs.readFileSync(reviewPath, "utf8")); } catch { /* ignore */ }
    if (!review || !review.ok) blockers.push("Design not approved — run: aitri design-review");
  }

  // Gate 2: dependency-graph.json must exist and be cycle-free
  const graph = readDependencyGraph(root);
  if (!graph) {
    blockers.push(".aitri/dependency-graph.json missing — run: aitri spec-from-design --feature <name>");
  } else {
    const cycleResult = validateCycles(graph);
    if (!cycleResult.ok) {
      const cycleStr = cycleResult.cycles.map((c) => c.join(" → ")).join("; ");
      blockers.push(`Dependency graph has cycles: ${cycleStr}`);
    }
  }

  // Gate 3: approved spec must exist and contain no pending LOGIC_GAPsif feature was resolved
  let feature = String(options.feature || "").trim();
  if (!feature && graph) feature = graph.feature;
  if (feature) {
    const specPath = project.paths.approvedSpecFile(feature);
    if (!fs.existsSync(specPath)) {
      blockers.push(`Approved spec missing: ${path.relative(root, specPath)} — run: aitri spec-from-design --feature ${feature}`);
    } else {
      const specContent = fs.readFileSync(specPath, "utf8");
      if (/^logic_gap:/im.test(specContent) || /^##\s+LOGIC_GAPS/im.test(specContent)) {
        blockers.push("Approved spec has unresolved LOGIC_GAPs — resolve in design.md and re-run spec-from-design");
      }
      // Gate 4: all US in dep-graph must appear in approved spec
      if (graph) {
        const missingUs = (graph.nodes || [])
          .map((n) => n.id)
          .filter((id) => !specContent.includes(id));
        if (missingUs.length > 0) {
          blockers.push(`US in dependency-graph missing from spec: ${missingUs.join(", ")}`);
        }
      }
    }
  }

  // Gate 5: NO IMPACT statements in design.md must have valid structure
  // EVO-098: brownfield feature-type is valid; relaxes UX/UI gate (already non-mandatory for non-ui types)
  const designPath = path.join(root, ".aitri/design.md");
  if (fs.existsSync(designPath)) {
    const designContent = fs.readFileSync(designPath, "utf8");
    const noImpactBlocks = [...designContent.matchAll(/^no_impact:\s*\n([\s\S]*?)(?=\n\n|\nno_impact:|$)/gm)];
    for (const block of noImpactBlocks) {
      const text = block[0];
      const justificacion = (text.match(/justificacion:\s*"?([^"\n]+)"?/i) || [])[1] || "";
      const condiciones = (text.match(/condiciones:\s*"?([^"\n]+)"?/i) || [])[1] || "";
      const wordCount = justificacion.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 20) {
        blockers.push(`NO IMPACT statement has thin justification (${wordCount} words, need ≥20): "${justificacion.slice(0, 60)}..."`);
      }
      if (!condiciones.trim()) {
        blockers.push("NO IMPACT statement missing 'condiciones' field");
      }
    }
  }

  if (blockers.length > 0) {
    console.log("VALIDATE-DESIGN BLOCKED:");
    blockers.forEach((b) => console.log(`  - ${b}`));
    return ERROR;
  }

  console.log("validate-design passed.");
  if (feature) console.log(`  Feature: ${feature}`);
  console.log("  design-review: approved");
  console.log("  dependency-graph: valid, no cycles");
  console.log("  spec: present, no LOGIC_GAPs");
  console.log("→ Fase 1 complete. Next: aitri go --feature " + (feature || "<feature>"));
  return OK;
}
