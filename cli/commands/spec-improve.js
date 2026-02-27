import fs from "node:fs";
import path from "node:path";
import { normalizeFeatureName } from "../lib.js";
import { callAI } from "../ai-client.js";
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
  const aiConfig = project.config.ai || {};

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

  // Check if AI is configured
  if (!aiConfig.provider) {
    const hint = [
      "AI is not configured. To use spec-improve, add an `ai` section to .aitri.json:",
      "",
      '  "ai": {',
      '    "provider": "claude",',
      '    "model": "claude-opus-4-6",',
      '    "apiKeyEnv": "ANTHROPIC_API_KEY"',
      "  }"
    ].join("\n");

    if (options.nonInteractive || options.json || options.format === "json") {
      console.log(JSON.stringify({
        ok: false,
        feature,
        error: "AI not configured",
        hint: "Add an `ai` section to .aitri.json with provider, model, and apiKeyEnv."
      }));
    } else {
      console.log(hint);
    }
    return ERROR;
  }

  const personaResult = loadPersonaSystemPrompt("architect");
  if (!personaResult.ok) {
    console.log(`Failed to load architect persona: ${personaResult.error}`);
    return ERROR;
  }

  const prompt = `Review this feature specification and identify concrete quality issues.
Return ONLY a JSON array of specific, actionable improvement suggestions.
Return format (JSON only): ["suggestion 1", "suggestion 2", ...]
If the spec is high quality, return an empty array: []

## Feature Specification
${specContent}`;

  if (!options.nonInteractive) {
    console.log(`Analyzing spec for feature '${feature}'...`);
  }

  const result = await callAI({ prompt, systemPrompt: personaResult.systemPrompt, config: aiConfig });

  if (!result.ok) {
    const errOut = { ok: false, feature, error: result.error };
    if (options.nonInteractive || options.json || options.format === "json") {
      console.log(JSON.stringify(errOut));
    } else {
      console.log(`AI error: ${result.error}`);
    }
    return ERROR;
  }

  // Parse suggestions from AI response
  let suggestions = [];
  try {
    const text = result.content.trim();
    // Try to extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    } else {
      suggestions = JSON.parse(text);
    }
    if (!Array.isArray(suggestions)) suggestions = [];
  } catch {
    // If parsing fails, split by newlines and use as suggestions
    suggestions = result.content
      .split("\n")
      .map(l => l.replace(/^[-*\d.]+\s*/, "").trim())
      .filter(l => l.length > 10);
  }

  const output = { ok: true, feature, suggestions };

  if (options.nonInteractive || options.json || options.format === "json") {
    console.log(JSON.stringify(output, null, 2));
  } else {
    if (suggestions.length === 0) {
      console.log(`Spec for '${feature}' looks good — no issues found.`);
    } else {
      console.log(`\nSpec improvement suggestions for '${feature}':\n`);
      suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
      console.log(`\n${suggestions.length} suggestion(s). Edit: ${path.relative(process.cwd(), specFile)}`);
    }
  }

  return OK;
}
