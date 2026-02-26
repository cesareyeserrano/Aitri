import fs from "node:fs";
import path from "node:path";
import { resolveFeature } from "../lib.js";
import { callAI } from "../ai-client.js";

function exists(p) { return fs.existsSync(p); }

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function safeStatMs(file) {
  try { return fs.statSync(file).mtimeMs; } catch { return 0; }
}

function finding(severity, source, message) {
  return { severity, source, message };
}

// Check if a contract file still has the scaffold placeholder text.
function hasPlaceholder(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return /not implemented/i.test(content);
  } catch { return false; }
}

export function runStaticAudit(project, feature, root) {
  const { paths } = project;
  const findings = [];

  // 1. Approved spec check
  const specFile = paths.approvedSpecFile(feature);
  if (!exists(specFile)) {
    findings.push(finding("CRITICAL", "static", `No approved spec found. Run: aitri approve --feature ${feature}`));
    return findings;
  }

  // 2. Build manifest check
  const manifestFile = paths.buildManifestFile(feature);
  const manifest = exists(manifestFile) ? readJsonSafe(manifestFile) : null;
  if (!manifest) {
    findings.push(finding("HIGH", "static", `Build artifacts not found. Run: aitri build --feature ${feature}`));
    return findings;
  }

  // 3. Contract placeholder check (from interfaceFiles in scaffold manifest)
  const scaffoldManifestFile = path.join(paths.implementationFeatureDir(feature), "scaffold-manifest.json");
  const scaffoldManifest = exists(scaffoldManifestFile) ? readJsonSafe(scaffoldManifestFile) : null;
  const contractFiles = (scaffoldManifest?.interfaceFiles || []);
  for (const contractRel of contractFiles) {
    const contractAbs = path.join(root, contractRel);
    if (exists(contractAbs) && hasPlaceholder(contractAbs)) {
      findings.push(finding("HIGH", "static", `Contract ${contractRel} still has placeholder implementation. Run: aitri contractgen --feature ${feature}`));
    }
  }

  // 4. Proof of compliance checks
  const proofFile = path.join(paths.implementationFeatureDir(feature), "proof-of-compliance.json");
  const proof = exists(proofFile) ? readJsonSafe(proofFile) : null;
  if (!proof) {
    findings.push(finding("HIGH", "static", `Proof of compliance missing. Run: aitri prove --feature ${feature}`));
  } else {
    // 4a. Proof staleness
    const specMtime = safeStatMs(specFile);
    const backlogFile = paths.backlogFile(feature);
    const testsFile = paths.testsFile(feature);
    const latestInput = Math.max(specMtime, safeStatMs(backlogFile), safeStatMs(testsFile));
    const proofMtime = safeStatMs(proofFile);
    if (latestInput > proofMtime) {
      findings.push(finding("MEDIUM", "static", `Proof of compliance is stale — spec or tests changed since last prove run. Re-run: aitri prove --feature ${feature}`));
    }

    // 4b. Overall proof failed
    if (proof.ok === false) {
      findings.push(finding("CRITICAL", "static", `Proof of compliance failed — not all FRs are proven. Fix failing TCs and re-run: aitri prove --feature ${feature}`));
    }

    // 4c. Unproven FRs
    if (proof.frProof) {
      for (const [frId, record] of Object.entries(proof.frProof)) {
        if (!record.proven) {
          findings.push(finding("HIGH", "static", `${frId} is unproven — no passing TC covers it.`));
        }
      }
    }

    // 4d. Trivial TCs
    if (proof.summary?.trivialTcs?.length > 0) {
      for (const tcId of proof.summary.trivialTcs) {
        findings.push(finding("MEDIUM", "static", `${tcId} is trivial — contract imported but never invoked.`));
      }
    }

    // 4e. Low mutation score per FR (threshold: 50%)
    if (proof.frProof) {
      for (const [frId, record] of Object.entries(proof.frProof)) {
        const ms = record.mutationScore;
        if (ms && ms.total > 0) {
          const pct = Math.round((ms.detected / ms.total) * 100);
          if (pct < 50) {
            findings.push(finding("MEDIUM", "static", `${frId} mutation score ${pct}% — below recommended 50% threshold.`));
          }
        }
      }
    }
  }

  return findings;
}

function buildLlmPrompt(specContent, contractSamples) {
  const contractSection = contractSamples.length > 0
    ? contractSamples.map((c) => `// File: ${c.path}\n${c.content}`).join("\n\n---\n\n")
    : "(no contract files found)";

  return `You are a Compliance Auditor reviewing contract implementations against a software specification.

Your task: identify cases where the implementation does not satisfy the specification.
Focus on spec-to-code semantic drift: missing logic, wrong behavior, incomplete rules.

Format each finding as a single line:
FINDING: [CRITICAL|HIGH|MEDIUM|LOW] <brief description>

Only report concrete compliance gaps. Do not flag style, performance, or missing tests.
If no compliance issues are found, output: NO_FINDINGS

---

## Approved Spec

${specContent}

---

## Contract Implementations

${contractSection}`;
}

function buildCodeOnlyPrompt(contractSamples) {
  const contractSection = contractSamples.length > 0
    ? contractSamples.map((c) => `// File: ${c.path}\n${c.content}`).join("\n\n---\n\n")
    : "(no contract files found)";

  return `You are a Code Quality Auditor reviewing contract files without a formal specification.

Your task: identify anti-patterns, missing error handling, and potential reliability issues.
Format each finding as:
FINDING: [CRITICAL|HIGH|MEDIUM|LOW] <brief description>

If no issues are found, output: NO_FINDINGS

Also output on its own line (if this codebase has no spec):
RECOMMEND_ADOPT: true

---

## Contract Implementations

${contractSection}`;
}

function parseLlmFindings(content, source) {
  const findings = [];
  const lines = String(content || "").split("\n");
  for (const line of lines) {
    const m = line.match(/^FINDING:\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*(.+)/i);
    if (m) {
      findings.push(finding(m[1].toUpperCase(), source, m[2].trim()));
    }
  }
  return findings;
}

function readContractSamples(root, contractFiles, maxChars = 4000) {
  const samples = [];
  let total = 0;
  for (const rel of contractFiles) {
    if (total >= maxChars) break;
    const abs = path.join(root, rel);
    if (!exists(abs)) continue;
    const raw = fs.readFileSync(abs, "utf8");
    const slice = raw.slice(0, Math.max(0, maxChars - total));
    samples.push({ path: rel, content: slice });
    total += slice.length;
  }
  return samples;
}

function discoverContractFiles(root) {
  const srcContracts = path.join(root, "src", "contracts");
  if (!exists(srcContracts)) return [];
  try {
    return fs.readdirSync(srcContracts)
      .filter((f) => /\.(js|mjs|ts|py|go)$/.test(f))
      .map((f) => path.join("src", "contracts", f));
  } catch { return []; }
}

function printReport(feature, findings, noAi, aiSkipReason) {
  const bySeverity = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
  for (const f of findings) {
    (bySeverity[f.severity] || bySeverity.LOW).push(f);
  }

  console.log(`Aitri Audit  —  ${feature}\n`);

  const groups = [
    { label: "CRITICAL", items: bySeverity.CRITICAL },
    { label: "HIGH",     items: bySeverity.HIGH },
    { label: "MEDIUM",   items: bySeverity.MEDIUM },
    { label: "LOW",      items: bySeverity.LOW }
  ];

  let printed = 0;
  for (const group of groups) {
    if (group.items.length === 0) continue;
    for (const f of group.items) {
      const tag = `[${f.severity.padEnd(8)}]`;
      console.log(`  ${tag}  ${f.message}`);
      printed++;
    }
  }
  if (printed === 0) {
    console.log("  No findings — compliance looks good.");
  }

  if (noAi && aiSkipReason) {
    console.log(`\n  LLM review skipped: ${aiSkipReason}`);
  }

  const critical = bySeverity.CRITICAL.length;
  const high = bySeverity.HIGH.length;
  const medium = bySeverity.MEDIUM.length;
  const low = bySeverity.LOW.length;
  console.log(`\n  Summary  ${critical} critical  ${high} high  ${medium} medium  ${low} low`);
}

export async function runAuditCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const jsonMode = options.json || (options.format || "").toLowerCase() === "json";
  const skipAi = !!options.noAi;

  // Resolve feature (optional — falls back to code-only mode if missing)
  let feature = null;
  try {
    feature = resolveFeature(options, () => { throw new Error("no_status"); });
  } catch {
    // feature remains null — code-only mode if AI is available
  }

  const { paths } = project;
  const aiConfig = project.config?.ai;
  const hasAiConfig = !!(aiConfig?.provider);

  // Determine mode
  const hasApprovedSpec = feature ? exists(paths.approvedSpecFile(feature)) : false;
  const codeOnlyMode = !hasApprovedSpec && !skipAi && hasAiConfig;

  const allFindings = [];
  let aiSkipReason = null;
  let recommendAdopt = false;

  // --- Static audit (runs whenever a feature is resolved) ---
  if (feature) {
    const staticFindings = runStaticAudit(project, feature, root);
    allFindings.push(...staticFindings);
  } else if (!codeOnlyMode) {
    allFindings.push(finding("HIGH", "static", "Feature name is required. Use --feature <name>."));
  }

  // --- LLM compliance audit (only when spec exists) ---
  if (!skipAi && hasAiConfig && feature && exists(paths.approvedSpecFile(feature))) {
    const specContent = fs.readFileSync(paths.approvedSpecFile(feature), "utf8");
    const scaffoldManifestFile = path.join(paths.implementationFeatureDir(feature), "scaffold-manifest.json");
    const scaffoldManifest = exists(scaffoldManifestFile) ? readJsonSafe(scaffoldManifestFile) : null;
    const contractFiles = scaffoldManifest?.interfaceFiles || discoverContractFiles(root);
    const contractSamples = readContractSamples(root, contractFiles);

    const prompt = buildLlmPrompt(specContent, contractSamples);
    const result = await callAI({ prompt, config: aiConfig });
    if (result.ok) {
      const llmFindings = parseLlmFindings(result.content, "llm");
      allFindings.push(...llmFindings);
    } else {
      allFindings.push(finding("LOW", "llm", `LLM compliance review failed: ${result.error}`));
    }
  } else if (!skipAi && hasAiConfig && codeOnlyMode) {
    // Code-only mode: no spec, reverse-engineer from contracts
    const contractFiles = discoverContractFiles(root);
    const contractSamples = readContractSamples(root, contractFiles);
    if (contractSamples.length > 0) {
      const prompt = buildCodeOnlyPrompt(contractSamples);
      const result = await callAI({ prompt, config: aiConfig });
      if (result.ok) {
        const llmFindings = parseLlmFindings(result.content, "llm");
        allFindings.push(...llmFindings);
        recommendAdopt = /RECOMMEND_ADOPT:\s*true/i.test(result.content);
      }
    }
  } else if (!skipAi && !hasAiConfig) {
    aiSkipReason = "no AI provider configured (add `ai` section to aitri.config.json, or use --no-ai)";
  } else if (skipAi) {
    aiSkipReason = "--no-ai flag set";
  }

  // Recommendation for code-only mode
  if (recommendAdopt) {
    allFindings.push(finding("MEDIUM", "llm", "No spec found. Run `aitri adopt` to formalize existing code into a spec-driven project."));
  }

  const critical = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const high = allFindings.filter((f) => f.severity === "HIGH").length;
  const ok = critical === 0 && high === 0;

  if (jsonMode) {
    console.log(JSON.stringify({
      ok,
      feature: feature || null,
      findings: allFindings,
      summary: {
        critical,
        high,
        medium: allFindings.filter((f) => f.severity === "MEDIUM").length,
        low: allFindings.filter((f) => f.severity === "LOW").length
      }
    }, null, 2));
    return ok ? OK : ERROR;
  }

  printReport(feature || "(code-only)", allFindings, skipAi || !hasAiConfig, aiSkipReason);
  return ok ? OK : ERROR;
}
