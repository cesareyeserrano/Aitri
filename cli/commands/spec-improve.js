import fs from "node:fs";
import path from "node:path";
import { normalizeFeatureName } from "../lib.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";

export async function runSpecImproveCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;

  const rawFeatureInput = String(options.feature || options.positional[0] || "").trim();
  const feature = normalizeFeatureName(rawFeatureInput);

  if (!feature) {
    const msg = "Feature name is required. Use --feature <name>.";
    if (options.nonInteractive || options.json || options.format === "json") {
      console.log(JSON.stringify({ ok: false, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const project = getProjectContextOrExit();

  // Find the spec file — prefer approved, fall back to draft
  const approvedFile = project.paths.approvedSpecFile(feature);
  const draftFile = project.paths.draftSpecFile(feature);

  let specFile = null;
  if (fs.existsSync(approvedFile)) {
    specFile = approvedFile;
  } else if (fs.existsSync(draftFile)) {
    specFile = draftFile;
  }

  if (!specFile) {
    const msg = `Spec not found for feature '${feature}'. Run \`aitri draft --feature ${feature}\` first.`;
    if (options.nonInteractive || options.json || options.format === "json") {
      console.log(JSON.stringify({ ok: false, feature, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const personaResult = loadPersonaSystemPrompt("architect");

  const archContext = personaResult.ok
    ? `## Persona\n${personaResult.systemPrompt}\n\n`
    : "";

  console.log("--- AGENT TASK: spec-improve ---");
  console.log(archContext + `Review this feature specification and identify concrete quality issues.

List specific, actionable improvement suggestions. For each finding:
- State the issue clearly
- Reference the FR-ID or section it applies to
- Suggest the fix

Minimum 3 findings. If the spec is high quality, note that explicitly but still suggest improvements.

## Feature Specification (${path.relative(process.cwd(), specFile)})
${specContent}
--- END TASK ---`);

  return OK;
}
