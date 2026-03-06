// cli/commands/design-review.js
// Fase 1, Paso 1.2: Human approval gate for design.md (SDLC v2.2)
import fs from "node:fs";
import path from "node:path";

const REQUIRES = ".aitri/design.md";
const ARTIFACT = ".aitri/design-review.json";
const PREVIEW_CHARS = 1500;

export async function runDesignReviewCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
  const { OK, ERROR, ABORTED } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  const designPath = path.join(root, REQUIRES);
  if (!fs.existsSync(designPath)) {
    console.log(`Artifact not found: ${REQUIRES} — run: aitri design --idea "<your idea>"`);
    return ERROR;
  }

  const designContent = fs.readFileSync(designPath, "utf8");

  if (!options.nonInteractive && !options.yes) {
    // Show preview for human review
    const preview = designContent.slice(0, PREVIEW_CHARS);
    console.log("\n--- DESIGN PREVIEW ---");
    console.log(preview);
    if (designContent.length > PREVIEW_CHARS) {
      console.log(`\n[... ${designContent.length - PREVIEW_CHARS} more characters — open ${REQUIRES} for full content ...]`);
    }
    console.log("--- END PREVIEW ---\n");
  }

  // Detect profile from design.md (first occurrence of "Profile:")
  let detectedProfile = "strict";
  const profileMatch = designContent.match(/^Profile:\s*(mvp|strict)/im);
  if (profileMatch) detectedProfile = profileMatch[1].toLowerCase();

  const outPath = path.join(root, ARTIFACT);

  if (options.nonInteractive || options.yes) {
    // Auto-approve in non-interactive / CI mode
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({
      schemaVersion: 1, ok: true,
      approvedAt: new Date().toISOString(),
      profile: detectedProfile
    }, null, 2), "utf8");
    console.log(`Design approved (non-interactive). Profile: ${detectedProfile}`);
    console.log("→ Next: aitri spec-from-design");
    return OK;
  }

  const ans = String(await ask("Approve this design? (y/n): ")).trim().toLowerCase();
  if (ans !== "y" && ans !== "yes") {
    console.log(`Design rejected. Edit ${REQUIRES} and re-run: aitri design-review`);
    return ABORTED;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    schemaVersion: 1, ok: true,
    approvedAt: new Date().toISOString(),
    profile: detectedProfile
  }, null, 2), "utf8");

  console.log(`Design approved. Profile: ${detectedProfile}`);
  console.log(`→ Artifact: ${ARTIFACT}`);
  console.log("→ Next: aitri spec-from-design");
  return OK;
}
