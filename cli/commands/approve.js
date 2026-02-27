import fs from "node:fs";
import path from "node:path";
import { normalizeFeatureName } from "../lib.js";
import { callAI } from "../ai-client.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";

export async function runApproveCommand({
  options,
  ask,
  getProjectContextOrExit,
  confirmProceed,
  runAutoCheckpoint,
  printCheckpointSummary,
  exitCodes,
  exitWithFlow
}) {
  const { OK, ERROR, ABORTED } = exitCodes;

  const project = getProjectContextOrExit();
  const rawFeatureInput = String(options.feature || options.positional[0] || "").trim();
  let feature = normalizeFeatureName(rawFeatureInput);
  if (rawFeatureInput && !feature) {
    console.log("Invalid feature name. Use kebab-case (example: user-login).");
    return ERROR;
  }
  if (!feature && !options.nonInteractive) {
    const prompted = await ask("Feature name to approve (kebab-case): ");
    feature = normalizeFeatureName(prompted);
    if (!feature && String(prompted || "").trim()) {
      console.log("Invalid feature name. Use kebab-case (example: user-login).");
      return ERROR;
    }
  }
  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    return ERROR;
  }

  const draftsFile = project.paths.draftSpecFile(feature);
  const approvedDir = project.paths.specsApprovedDir;
  const approvedFile = project.paths.approvedSpecFile(feature);

  if (!fs.existsSync(draftsFile)) {
    console.log(`Draft spec not found: ${path.relative(process.cwd(), draftsFile)}`);
    return ERROR;
  }

  const content = fs.readFileSync(draftsFile, "utf8");
  const issues = [];

  // Must contain STATUS: DRAFT
  if (!/^STATUS:\s*DRAFT\s*$/m.test(content)) {
    issues.push("Spec must contain `STATUS: DRAFT`.");
  }

  // Functional Rules check (supports FR-* traceable format and legacy numbered rules)
  // EVO-007: match by section name regardless of heading number prefix
  const rulesMatch =
    content.match(/## (?:\d+\.?\s*)?Functional Rules(?:\s*\(traceable\))?([\s\S]*?)(\n##\s|\s*$)/);

  if (!rulesMatch) {
    issues.push("Missing section: `Functional Rules` (e.g., `## 3. Functional Rules (traceable)`).");
  } else {
    const body = rulesMatch[1] || "";
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);

    const hasFR = lines.some(l => /^[-*]\s*FR-\d+\s*:\s*\S+/i.test(l));
    const hasLegacyNumbered = lines.some(l => /^\d+\.\s+\S+/.test(l));

    const meaningful = lines.some(l => {
      const cleaned = l
        .replace(/^[-*]\s*/, "")
        .replace(/^FR-\d+\s*:\s*/i, "")
        .replace(/^\d+\.\s+/, "")
        .trim();
      if (cleaned.length < 8) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<verifiable rule>/i.test(cleaned)) return false;
      if (/<[a-z\s]+>/i.test(cleaned) && cleaned.replace(/<[^>]+>/g, "").trim().length < 8) return false;
      return true;
    });

    if (!(hasFR || hasLegacyNumbered) || !meaningful) {
      issues.push("Functional Rules must include at least one meaningful rule using `- FR-1: ...` (preferred) or legacy `1. ...` format. Replace all <placeholder> tokens with real content.");
    }

    // EVO-011: duplicate FR-* IDs
    const frIds = [...body.matchAll(/\bFR-(\d+)\b/gi)].map(m => m[1]);
    const dupFR = frIds.filter((id, i) => frIds.indexOf(id) !== i);
    if (dupFR.length > 0) {
      issues.push(`Duplicate Functional Rule IDs: ${[...new Set(dupFR)].map(id => `FR-${id}`).join(", ")}. Each FR must have a unique ID.`);
    }
  }

  // Security check — EVO-007: match by name regardless of number
  const secMatch = content.match(/## (?:\d+\.?\s*)?Security Considerations([\s\S]*?)(\n##\s|\s*$)/);
  if (!secMatch) {
    issues.push("Missing section: `Security Considerations` (e.g., `## 7. Security Considerations`).");
  } else {
    const lines = secMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const meaningful = lines.some(l => {
      const cleaned = l.replace(/^[-*]\s*/, "").trim();
      if (cleaned.length < 5) return false;
      if (cleaned.includes("<") && cleaned.includes(">")) return false;
      return true;
    });
    if (!meaningful) {
      issues.push("Security Considerations must include at least one meaningful bullet.");
    }
  }

  // Acceptance Criteria check — EVO-007: match by name regardless of number
  const acMatch = content.match(/## (?:\d+\.?\s*)?Acceptance Criteria([\s\S]*?)(\n##\s|\s*$)/);
  if (!acMatch) {
    issues.push("Missing section: `Acceptance Criteria` (e.g., `## 9. Acceptance Criteria`).");
  } else {
    const acLines = acMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const acMeaningful = acLines.some(l => {
      const cleaned = l
        .replace(/^[-*]\s*/, "")
        .replace(/^AC-\d+\s*:\s*/i, "")
        .trim();
      if (cleaned.length < 8) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<context>/i.test(cleaned) || /<action>/i.test(cleaned) || /<expected>/i.test(cleaned)) return false;
      if (/<[a-z\s]+>/i.test(cleaned) && cleaned.replace(/<[^>]+>/g, "").trim().length < 8) return false;
      return true;
    });
    if (!acMeaningful) {
      issues.push("Acceptance Criteria must include at least one meaningful criterion. Replace all <placeholder> tokens (e.g. <context>, <action>, <expected>) with real content.");
    }

    // EVO-011: duplicate AC-* IDs
    const acIds = [...acLines.join("\n").matchAll(/\bAC-(\d+)\b/gi)].map(m => m[1]);
    const dupAC = acIds.filter((id, i) => acIds.indexOf(id) !== i);
    if (dupAC.length > 0) {
      issues.push(`Duplicate Acceptance Criteria IDs: ${[...new Set(dupAC)].map(id => `AC-${id}`).join(", ")}. Each AC must have a unique ID.`);
    }

    // EVO-011: FR→AC coverage — at least as many ACs as FRs
    const frIdCount = rulesMatch
      ? [...(rulesMatch[1] || "").matchAll(/\bFR-(\d+)\b/gi)].length
      : 0;
    if (frIdCount > 0 && acIds.length < frIdCount) {
      issues.push(`Coverage gap: ${frIdCount} Functional Rule(s) but only ${acIds.length} Acceptance Criterion(a). Add at least one AC per FR.`);
    }
  }

  // Actors check — EVO-007: match by name regardless of number
  const actorsMatch = content.match(/## (?:\d+\.?\s*)?Actors([\s\S]*?)(\n##\s|\s*$)/);
  if (!actorsMatch) {
    issues.push("Missing section: `Actors` (e.g., `## 2. Actors`).");
  } else {
    const actorLines = actorsMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const actorMeaningful = actorLines.some(l => {
      const cleaned = l.replace(/^[-*]\s*/, "").trim();
      if (cleaned.length < 3) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<actor>/i.test(cleaned) || /<role>/i.test(cleaned)) return false;
      return true;
    });
    if (!actorMeaningful) {
      issues.push("Actors section must list at least one real actor/role. Replace all <placeholder> tokens with real content.");
    }
  }

  // Edge Cases check — EVO-007: match by name regardless of number
  const edgeMatch = content.match(/## (?:\d+\.?\s*)?Edge Cases([\s\S]*?)(\n##\s|\s*$)/);
  if (!edgeMatch) {
    issues.push("Missing section: `Edge Cases` (e.g., `## 4. Edge Cases`).");
  } else {
    const edgeLines = edgeMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const edgeMeaningful = edgeLines.some(l => {
      const cleaned = l.replace(/^[-*]\s*/, "").trim();
      if (cleaned.length < 8) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<[a-z\s]+>/i.test(cleaned) && cleaned.replace(/<[^>]+>/g, "").trim().length < 8) return false;
      return true;
    });
    if (!edgeMeaningful) {
      issues.push("Edge Cases must include at least one meaningful scenario. Replace all <placeholder> tokens with real content.");
    }
  }

  // Asset strategy check for visual/game/web domains — EVO-007: flexible heading
  const contextMatch = content.match(/## (?:\d+\.?\s*)?Context([\s\S]*?)(\n##\s|\s*$)/);
  const contextText = contextMatch ? contextMatch[1].toLowerCase() : "";
  const fullLower = content.toLowerCase();
  const isVisualDomain = /\b(game|juego|sprite|canvas|webgl|three\.?js|phaser|godot|unity|animation|visual|graphic|ui\s*design|web\s*app|frontend|pixel|tilemap|asset|artwork|render)\b/.test(contextText) ||
    /\b(game|juego|sprite|canvas|webgl|three\.?js|phaser)\b/.test(fullLower);

  if (isVisualDomain) {
    const hasAssetSection = /##\s*\d*\.?\s*(Assets|Asset Strategy|Visual Assets|Art Direction|Resource Requirements)/i.test(content);
    const hasAssetMention = /\b(sprite|texture|image|sound|audio|music|font|tileset|asset|artwork|art\s*style|resolution|pixel\s*art|3d\s*model)\b/i.test(content);
    if (!hasAssetSection && !hasAssetMention) {
      issues.push("This spec describes a visual/game project but has no asset strategy. Add a section describing required assets (sprites, sounds, art style, etc.) or reference them in Functional Rules.");
    }
  }

  // EVO-011: block TODO / TBD in approved spec
  const inlineMatches = [...content.matchAll(/\b(TODO|TBD)\b/gi)];
  if (inlineMatches.length > 0) {
    const unique = [...new Set(inlineMatches.map(m => m[1].toUpperCase()))];
    issues.push(`Spec contains ${inlineMatches.length} unresolved placeholder(s) (${unique.join(", ")}). Replace with real content before approving.`);
  }

  if (/Aitri suggestion \(auto-applied\)/i.test(content) || /Technology source:\s*Aitri suggestion/i.test(content)) {
    issues.push("Requirements source integrity: this draft contains AI-inferred requirement hints. Replace them with explicit user-provided requirements before approve.");
  }

  if (issues.length > 0 && !options.nonInteractive) {
    // Interactive correction mode
    console.log("APPROVE GATE — issues found:");
    issues.forEach((issue, idx) => console.log(`  ${idx + 1}. ${issue}`));
    console.log("\nAitri can help you fix these now.\n");

    let updatedContent = content;
    let fixedCount = 0;

    for (const issue of issues) {
      if (issue.includes("Functional Rules")) {
        const answer = await ask("Enter a functional rule (e.g., 'The system must validate user input before processing'): ");
        if (answer.trim()) {
          const frLine = `- FR-1: ${answer.trim()}`;
          updatedContent = updatedContent.replace(
            /## (?:\d+\.?\s*)?Functional Rules[^\n]*\n([\s\S]*?)(\n##)/,
            `## 3. Functional Rules (traceable)\n${frLine}\n$2`
          );
          fixedCount++;
        }
      } else if (issue.includes("Security Considerations")) {
        const answer = await ask("Enter a security consideration (e.g., 'Sanitize all user input to prevent injection'): ");
        if (answer.trim()) {
          updatedContent = updatedContent.replace(
            /## (?:\d+\.?\s*)?Security Considerations\n([\s\S]*?)(\n##)/,
            `## 7. Security Considerations\n- ${answer.trim()}\n$2`
          );
          fixedCount++;
        }
      } else if (issue.includes("Acceptance Criteria")) {
        const answer = await ask("Enter an acceptance criterion (Given [context], when [action], then [result]): ");
        if (answer.trim()) {
          updatedContent = updatedContent.replace(
            /## (?:\d+\.?\s*)?Acceptance Criteria[^\n]*\n([\s\S]*?)(\n##|$)/,
            `## 9. Acceptance Criteria\n- AC-1: ${answer.trim()}\n$2`
          );
          fixedCount++;
        }
      } else if (issue.includes("Actors")) {
        const answer = await ask("Who uses this system? (e.g., 'End user', 'Admin'): ");
        if (answer.trim()) {
          if (actorsMatch) {
            updatedContent = updatedContent.replace(
              /## (?:\d+\.?\s*)?Actors\n([\s\S]*?)(\n##)/,
              `## 2. Actors\n- ${answer.trim()}\n$2`
            );
          } else {
            updatedContent = updatedContent.replace(
              /## 3\./,
              `## 2. Actors\n- ${answer.trim()}\n\n## 3.`
            );
          }
          fixedCount++;
        }
      } else if (issue.includes("Edge Cases")) {
        const answer = await ask("Enter an edge case (what could go wrong?): ");
        if (answer.trim()) {
          if (edgeMatch) {
            updatedContent = updatedContent.replace(
              /## (?:\d+\.?\s*)?Edge Cases\n([\s\S]*?)(\n##)/,
              `## 4. Edge Cases\n- ${answer.trim()}\n$2`
            );
          } else {
            updatedContent = updatedContent.replace(
              /## 5\./,
              `## 4. Edge Cases\n- ${answer.trim()}\n\n## 5.`
            );
            if (!updatedContent.includes("## 4. Edge Cases")) {
              updatedContent = updatedContent.replace(
                /## 7\./,
                `## 4. Edge Cases\n- ${answer.trim()}\n\n## 7.`
              );
            }
          }
          fixedCount++;
        }
      } else if (issue.includes("asset strategy") || issue.includes("visual/game")) {
        console.log("This project needs a resource/asset strategy.");
        console.log("  a) I have my own resources");
        console.log("  b) Generate programmatic placeholders");
        console.log("  c) Search for free resources online");
        console.log("  d) I have an account/service");
        const answer = (await ask("Resource strategy (a/b/c/d): ")).trim().toLowerCase();
        let strategy = "Generate programmatic placeholders only.";
        if (answer === "a" || answer.startsWith("a")) {
          strategy = "User provides own resources. Agent must ask for resource paths.";
        } else if (answer === "c" || answer.startsWith("c")) {
          strategy = "Agent should search for free/open-licensed resources online.";
        } else if (answer === "d" || answer.startsWith("d")) {
          const svc = await ask("  Which service? (e.g., itch.io, Unsplash): ");
          strategy = `User has account on: ${svc || "external service"}.`;
        }
        updatedContent += `\n## 10. Resource Strategy\n- ${strategy}\n`;
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      fs.writeFileSync(draftsFile, updatedContent, "utf8");
      console.log(`\nFixed ${fixedCount} issue(s) in ${path.relative(process.cwd(), draftsFile)}.`);
      console.log(`Run again: aitri approve --feature ${feature}`);
    } else {
      console.log(`\nNo fixes applied. Edit manually: ${path.relative(process.cwd(), draftsFile)}`);
      console.log(`Then run: aitri approve --feature ${feature}`);
    }
    return ERROR;
  }

  if (issues.length > 0) {
    // Non-interactive mode — just report
    console.log("GATE FAILED:");
    issues.forEach(i => console.log("- " + i));
    console.log(`\nFix: ${path.relative(process.cwd(), draftsFile)}`);
    console.log(`Run: aitri approve --feature ${feature}`);
    return ERROR;
  }

  // Semantic gate: spec consistency vs architecture-decision (if artifact + AI available)
  const archDecisionPath = path.join(process.cwd(), ".aitri/architecture-decision.md");
  const aiConfig = project.config.ai || {};
  if (fs.existsSync(archDecisionPath) && aiConfig.provider) {
    const personaResult = loadPersonaSystemPrompt("architect");
    if (personaResult.ok) {
      const archSnippet = fs.readFileSync(archDecisionPath, "utf8").slice(0, 2000);
      const archPrompt = `Review this feature spec for consistency with the architecture decision.
Report concerns where the spec contradicts or ignores the architecture.
For each concern output exactly: ARCH_CONCERN: <description>
If fully consistent output: ARCH_CONCERN: none

## Feature Spec
${content.slice(0, 2000)}

## Architecture Decision
${archSnippet}`;
      if (!options.nonInteractive) console.log("Checking architecture consistency...");
      const archResult = await callAI({ prompt: archPrompt, systemPrompt: personaResult.systemPrompt, config: aiConfig });
      if (archResult.ok) {
        const concerns = archResult.content
          .split("\n")
          .filter(l => /^ARCH_CONCERN:\s*/i.test(l) && !/^ARCH_CONCERN:\s*none\s*$/i.test(l))
          .map(l => l.replace(/^ARCH_CONCERN:\s*/i, "").trim())
          .filter(Boolean);
        if (concerns.length > 0) {
          console.log("\nARCHITECTURE CONCERNS:");
          concerns.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
          if (!options.yes && !options.nonInteractive) {
            const ans = String(await ask("\nProceed with approval despite architecture concerns? (y/n): ")).trim().toLowerCase();
            if (ans !== "y" && ans !== "yes") {
              console.log("Approval blocked. Revise spec to address concerns before approving.");
              return ABORTED;
            }
          } else {
            console.log("Note: proceeding with --yes despite architecture concerns.");
          }
        } else {
          if (!options.nonInteractive) console.log("Architecture consistency: OK");
        }
      }
    }
  }

  const plan = [
    `Move: ${path.relative(process.cwd(), draftsFile)} → ${path.relative(process.cwd(), approvedFile)}`
  ];

  console.log("PLAN:");
  plan.forEach(p => console.log("- " + p));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
  }

  fs.mkdirSync(approvedDir, { recursive: true });

  const updated = content.replace(/^STATUS:\s*DRAFT\s*$/m, "STATUS: APPROVED");
  fs.writeFileSync(approvedFile, updated, "utf8");
  fs.unlinkSync(draftsFile);

  console.log("Spec approved successfully.");
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "approve",
    feature
  }));
  return OK;
}
