import fs from "node:fs";
import path from "node:path";
import { collectPersonaValidationIssues } from "./persona-validation.js";
import { normalizeFeatureName } from "../lib.js";

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
  if (!fs.existsSync(discoveryFile)) {
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

  const discoveryContent = fs.readFileSync(discoveryFile, "utf8");
  const planContent = fs.readFileSync(planFile, "utf8");
  const personaIssues = collectPersonaValidationIssues({ discoveryContent, planContent, specContent: spec });
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
  if (!fs.existsSync(approvedFile)) issues.push(`Missing approved spec: ${path.relative(process.cwd(), approvedFile)}`);
  if (!fs.existsSync(backlogFile)) issues.push(`Missing backlog: ${path.relative(process.cwd(), backlogFile)}`);
  if (!fs.existsSync(testsFile)) issues.push(`Missing tests: ${path.relative(process.cwd(), testsFile)}`);
  if (!fs.existsSync(discoveryFile)) issues.push(`Missing discovery: ${path.relative(process.cwd(), discoveryFile)}`);
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

  const discoveryContent = fs.readFileSync(discoveryFile, "utf8");
  const planContent = fs.readFileSync(planFile, "utf8");
  collectPersonaValidationIssues({ discoveryContent, planContent, specContent: spec }).forEach(i => issues.push(i));

  return issues;
}
