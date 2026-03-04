import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveFeature } from "../lib.js";
import { loadPersonaSystemPrompt, PERSONA_DISPLAY_NAMES } from "../persona-loader.js";

function exists(p) { return fs.existsSync(p); }
function readJsonSafe(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function safeStatMs(f) { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }
function finding(severity, source, message, meta = {}) { return { severity, source, message, ...meta }; }

// ─── LAYER 1: STATIC PIPELINE COMPLIANCE ────────────────────────────────────

function hasPlaceholder(filePath) {
  try { return /not implemented/i.test(fs.readFileSync(filePath, "utf8")); }
  catch { return false; }
}

function hasTrivialContract(filePath) {
  try {
    const s = fs.readFileSync(filePath, "utf8");
    return s.includes("return { ok: true") && !/\binput\s*\./.test(s);
  } catch { return false; }
}

export function runStaticAudit(project, feature, root) {
  const { paths } = project;
  const findings = [];
  const specFile = paths.approvedSpecFile(feature);
  if (!exists(specFile)) {
    findings.push(finding("CRITICAL", "pipeline", `No approved spec found. Run: aitri approve --feature ${feature}`));
    return findings;
  }
  const manifestFile = paths.buildManifestFile(feature);
  const manifest = exists(manifestFile) ? readJsonSafe(manifestFile) : null;
  if (!manifest) {
    findings.push(finding("HIGH", "pipeline", `Build artifacts not found. Run: aitri build --feature ${feature}`));
    return findings;
  }
  const scaffoldManifestFile = path.join(paths.implementationFeatureDir(feature), "scaffold-manifest.json");
  const scaffoldManifest = exists(scaffoldManifestFile) ? readJsonSafe(scaffoldManifestFile) : null;
  for (const contractRel of (scaffoldManifest?.interfaceFiles || [])) {
    const abs = path.join(root, contractRel);
    if (exists(abs) && hasPlaceholder(abs))
      findings.push(finding("HIGH", "pipeline", `Contract ${contractRel} still has placeholder implementation. Run: aitri contractgen --feature ${feature}`));
    else if (exists(abs) && hasTrivialContract(abs))
      findings.push(finding("HIGH", "pipeline", `Contract ${contractRel} — trivial contract (returns ok:true without reading input — proof invalid). Run: aitri contractgen --feature ${feature} --force`));
  }
  const proofFile = path.join(paths.implementationFeatureDir(feature), "proof-of-compliance.json");
  const proof = exists(proofFile) ? readJsonSafe(proofFile) : null;
  if (!proof) {
    findings.push(finding("HIGH", "pipeline", `Proof of compliance missing. Run: aitri prove --feature ${feature}`));
  } else {
    const backlogFile = paths.backlogFile(feature);
    const testsFile = paths.testsFile(feature);
    const proofMtime = safeStatMs(proofFile);
    // EVO-075: identify which file(s) caused staleness
    const inputFiles = [
      { label: "spec", path: specFile },
      { label: "backlog", path: backlogFile },
      { label: "tests.md", path: testsFile }
    ];
    const staleInputs = inputFiles.filter(f => safeStatMs(f.path) > proofMtime);
    if (staleInputs.length > 0) {
      const names = staleInputs.map(f => f.label).join(", ");
      findings.push(finding("MEDIUM", "pipeline", `Proof is stale — ${names} changed since last prove run. Fix: aitri prove --feature ${feature}`));
    }
    if (proof.ok === false)
      findings.push(finding("CRITICAL", "pipeline", `Proof of compliance failed — not all FRs proven.`));
    if (proof.frProof) {
      for (const [frId, record] of Object.entries(proof.frProof)) {
        if (!record.proven)
          findings.push(finding("HIGH", "pipeline", `${frId} is unproven — no passing TC covers it.`));
        const ms = record.mutationScore;
        if (ms?.total > 0) {
          const pct = Math.round((ms.detected / ms.total) * 100);
          if (pct < 50)
            findings.push(finding("MEDIUM", "pipeline", `${frId} mutation score ${pct}% — below 50% threshold.`));
        }
      }
      for (const tcId of (proof.summary?.trivialTcs || []))
        findings.push(finding("MEDIUM", "pipeline", `${tcId} is trivial — contract imported but never invoked.`));
    }
  }
  return findings;
}

// ─── LAYER 2: STATIC CODE QUALITY ────────────────────────────────────────────

const INSECURE_PATTERNS = [
  { re: /\beval\s*\(/, severity: "HIGH",     label: "eval() usage — code injection risk" },
  { re: /innerHTML\s*=/, severity: "MEDIUM",  label: "innerHTML assignment — potential XSS" },
  { re: /password\s*[=:]\s*["'][^"']{4,}["']/i, severity: "CRITICAL", label: "Hardcoded password detected" },
  { re: /api_?key\s*[=:]\s*["'][^"']{8,}["']/i, severity: "CRITICAL", label: "Hardcoded API key detected" },
  { re: /secret\s*[=:]\s*["'][^"']{8,}["']/i,   severity: "HIGH",     label: "Hardcoded secret detected" },
  { re: /SELECT\s+.+\s*\+\s*|`SELECT\s+.+\$\{/i, severity: "HIGH",    label: "Potential SQL injection — string concatenation in query" },
  { re: /Math\.random\(\)\s*\*.*(?:token|session|secret|auth|nonce)/i, severity: "MEDIUM", label: "Math.random() used for security-sensitive value — use crypto.randomBytes()" },
];

const SCAN_EXCLUDE = new Set(["node_modules", "dist", "build", "vendor", ".gocache"]);

function collectSourceFiles(root, extensions = [".js", ".mjs", ".ts", ".py", ".go"], maxFiles = 60) {
  const files = [];
  function walk(dir, depth = 0) {
    if (depth > 4 || files.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") || SCAN_EXCLUDE.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); }
      else if (extensions.some((ext) => e.name.endsWith(ext))) files.push(full);
    }
  }
  walk(root);
  return files.slice(0, maxFiles);
}

export function runCodeQualityAudit(root) {
  const findings = [];
  const files = collectSourceFiles(root);
  if (files.length === 0) return findings;

  for (const abs of files) {
    const rel = path.relative(root, abs);
    let content;
    try { content = fs.readFileSync(abs, "utf8"); } catch { continue; }
    const lines = content.split("\n");

    // File size
    if (lines.length > 400)
      findings.push(finding("MEDIUM", "code-quality", `${rel} is ${lines.length} lines — consider splitting (threshold: 400)`));

    // Insecure patterns
    for (const { re, severity, label } of INSECURE_PATTERNS) {
      const lineNo = lines.findIndex((l) => re.test(l));
      if (lineNo >= 0)
        findings.push(finding(severity, "code-quality", `${rel}:${lineNo + 1} — ${label}`));
    }

    // TODO / FIXME / HACK
    const markers = lines.filter((l) => /\b(TODO|FIXME|HACK|XXX)\b/.test(l)).length;
    if (markers >= 3)
      findings.push(finding("LOW", "code-quality", `${rel} has ${markers} TODO/FIXME/HACK markers — review before delivery`));
  }
  return findings;
}

// ─── LAYER 3: DEPENDENCY AUDIT ───────────────────────────────────────────────

export function runDependencyAudit(root) {
  const findings = [];
  if (!exists(path.join(root, "package.json"))) return findings;

  // npm audit --json
  const result = spawnSync("npm", ["audit", "--json"], {
    cwd: root, encoding: "utf8", timeout: 20000
  });

  let auditData = null;
  try { auditData = JSON.parse(result.stdout || "{}"); } catch { return findings; }

  const vulns = auditData.vulnerabilities || {};
  for (const [pkg, info] of Object.entries(vulns)) {
    const sev = String(info.severity || "low").toUpperCase();
    const mapped = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(sev) ? sev : "LOW";
    const via = Array.isArray(info.via)
      ? info.via.filter((v) => typeof v === "object").map((v) => v.title || "").filter(Boolean).join("; ")
      : "";
    const detail = via ? ` — ${via}` : "";
    findings.push(finding(mapped, "dependencies", `${pkg}@${info.fixAvailable ? "fixable" : "no-fix"}${detail}`));
  }

  // Check for very outdated direct deps (major version lag heuristic)
  const pkg = readJsonSafe(path.join(root, "package.json")) || {};
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, range] of Object.entries(allDeps)) {
    if (/^[~^]?0\./.test(range))
      findings.push(finding("LOW", "dependencies", `${name} pinned to pre-1.0 version (${range}) — verify stability`));
  }

  return findings;
}

// ─── LAYER 4: AGENT PROMPT OUTPUT ────────────────────────────────────────────
// Aitri is a skill — the agent (Claude Code / Codex / Gemini) does the analysis.
// Layer 4 outputs structured prompts for the agent to execute, not callAI directly.

function readSourceSample(root, maxChars = 5000) {
  const files = collectSourceFiles(root, [".js", ".mjs", ".ts", ".py", ".go"], 10);
  let out = "";
  for (const abs of files) {
    if (out.length >= maxChars) break;
    const rel = path.relative(root, abs);
    try {
      const content = fs.readFileSync(abs, "utf8").slice(0, 800);
      out += `// --- ${rel} ---\n${content}\n\n`;
    } catch { continue; }
  }
  return out.slice(0, maxChars);
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
  const dir = path.join(root, "src", "contracts");
  if (!exists(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => /\.(js|mjs|ts|py|go)$/.test(f))
      .map((f) => path.join("src", "contracts", f));
  } catch { return []; }
}

function printLayer4Prompts(root, feature, specContent, contractSamples, sourceSample) {
  const contractSection = contractSamples.length > 0
    ? contractSamples.map((c) => `// ${c.path}\n${c.content}`).join("\n\n")
    : "(no contract files found)";

  // 4a: System Architect — technical quality review
  const architectPersona = loadPersonaSystemPrompt("architect");
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${PERSONA_DISPLAY_NAMES["architect"]}] — Technical Quality Review`);
  console.log(`${"─".repeat(60)}\n`);
  if (architectPersona.ok) { console.log("## Persona System Prompt"); console.log(architectPersona.systemPrompt); }
  console.log("\n## Task");
  console.log(`Analyze this codebase for technical quality issues.
Format each finding as: FINDING: [CRITICAL|HIGH|MEDIUM|LOW] <brief, actionable description>
If no significant issues: output NO_FINDINGS

## Source Code Sample
${sourceSample}

## Contract Implementations
${contractSection}`);

  // 4b: Security Champion — spec drift (only if spec available)
  if (specContent) {
    const securityPersona = loadPersonaSystemPrompt("security");
    console.log(`\n${"─".repeat(60)}`);
    console.log(`[${PERSONA_DISPLAY_NAMES["security"]}] — Spec Drift / Integrity Check`);
    console.log(`${"─".repeat(60)}\n`);
    if (securityPersona.ok) { console.log("## Persona System Prompt"); console.log(securityPersona.systemPrompt); }
    console.log("\n## Task");
    console.log(`Compare this spec against the implementation and identify drift.
Format each finding as: FINDING: [CRITICAL|HIGH|MEDIUM|LOW] [DRIFT|GAP] <description>
If no drift detected: output NO_DRIFT

## Approved Spec
${specContent.slice(0, 3000)}

## Contract Implementations
${contractSection}`);
  }

  // 4c: Lead Developer — implementation quality
  const developerPersona = loadPersonaSystemPrompt("developer");
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${PERSONA_DISPLAY_NAMES["developer"]}] — Implementation Quality Review`);
  console.log(`${"─".repeat(60)}\n`);
  if (developerPersona.ok) { console.log("## Persona System Prompt"); console.log(developerPersona.systemPrompt); }
  console.log("\n## Task");
  console.log(`Review this codebase for implementation quality issues.
Format each finding as: FINDING: [CRITICAL|HIGH|MEDIUM|LOW] <brief, actionable description>
If no significant issues: output NO_FINDINGS
${specContent ? `\n## Approved Spec (context)\n${specContent.slice(0, 1500)}\n` : ""}
## Contract Implementations
${contractSection}

## Source Code Sample
${sourceSample.slice(0, 2000)}`);

  // 4d: Experience Designer — UX audit (conditional)
  const uxDesignPath = path.join(root, ".aitri/ux-design.md");
  if (exists(uxDesignPath)) {
    const uxPersona = loadPersonaSystemPrompt("ux-ui");
    const uxDesignContent = fs.readFileSync(uxDesignPath, "utf8");
    console.log(`\n${"─".repeat(60)}`);
    console.log(`[${PERSONA_DISPLAY_NAMES["ux-ui"]}] — UX Design Audit`);
    console.log(`${"─".repeat(60)}\n`);
    if (uxPersona.ok) { console.log("## Persona System Prompt"); console.log(uxPersona.systemPrompt); }
    console.log("\n## Task");
    console.log(`Audit the implementation against the approved UX design.
Format each finding as: FINDING: [CRITICAL|HIGH|MEDIUM|LOW] <brief, actionable description>
If no issues found: output NO_FINDINGS

## Approved UX Design
${uxDesignContent.slice(0, 2000)}

## Contract Implementations (UI-related)
${contractSection}`);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log("→ Execute each analysis above and report findings using the FINDING: format.");
  console.log(`${"─".repeat(60)}\n`);
}

// ─── APPROVAL FLOW ────────────────────────────────────────────────────────────

async function runApprovalFlow(findings, ask, options, root) {
  if (options.nonInteractive || options.yes || options.json || !process.stdin.isTTY) return;
  if (findings.length === 0) return;

  const actionable = findings.filter((f) => f.severity !== "LOW" || f.source !== "pipeline");
  if (actionable.length === 0) return;

  const answer = String(await ask(`\nReview ${actionable.length} finding(s) for backlog? (y/n): `)).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") return;

  const approved = [];
  for (let i = 0; i < actionable.length; i++) {
    const f = actionable[i];
    const tag = f.tag ? ` [${f.tag}]` : "";
    console.log(`\n  (${i + 1}/${actionable.length}) [${f.severity}]${tag} ${f.message}`);
    const choice = String(await ask("  Add to backlog? (y)es / (n)o / (p)ostpone / (q)uit: ")).trim().toLowerCase();
    if (choice === "q" || choice === "quit") break;
    if (choice === "y" || choice === "yes") approved.push({ ...f, reviewedAt: new Date().toISOString(), decision: "approved" });
    if (choice === "p" || choice === "postpone") approved.push({ ...f, reviewedAt: new Date().toISOString(), decision: "postponed" });
  }

  if (approved.length === 0) return;

  const auditDir = path.join(root, "docs", "audit");
  fs.mkdirSync(auditDir, { recursive: true });
  const outFile = path.join(auditDir, "audit-findings.json");
  const existing = exists(outFile) ? (readJsonSafe(outFile) || []) : [];
  fs.writeFileSync(outFile, JSON.stringify([...existing, ...approved], null, 2), "utf8");
  console.log(`\n  ${approved.length} finding(s) saved to docs/audit/audit-findings.json`);
}

// ─── REPORT ───────────────────────────────────────────────────────────────────

function printReport(feature, allFindings, skipAi, aiSkipReason) {
  const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const grouped = Object.fromEntries(order.map((s) => [s, allFindings.filter((f) => f.severity === s)]));
  const srcLabel = { pipeline: "Pipeline", "code-quality": "Code Quality", dependencies: "Dependencies", llm: "AI Review", "llm-drift": "Spec Integrity" };
  const sevTitle = {
    CRITICAL: "CRITICAL — fix immediately",
    HIGH:     "HIGH — fix before delivery",
    MEDIUM:   "Medium — address before next release",
    LOW:      "Low — informational",
  };
  const hr = "─".repeat(62);
  const date = new Date().toISOString().slice(0, 10);
  const scope = feature ? `feature: ${feature}` : "project-level (code quality + dependencies)";

  console.log(`\n${hr}`);
  console.log(` Aitri Audit  |  ${date}  |  ${scope}`);
  if (!feature) console.log(`  Tip: add --feature <name> to also check pipeline compliance.`);
  console.log(hr);

  let total = 0;
  for (const sev of order) {
    if (grouped[sev].length === 0) continue;
    console.log(`\n  ${sevTitle[sev]}  (${grouped[sev].length})`);
    grouped[sev].forEach((f, i) => {
      const tag = f.tag ? ` [${f.tag}]` : "";
      console.log(`    ${i + 1}. [${srcLabel[f.source] || f.source}]${tag}  ${f.message}`);
    });
    total += grouped[sev].length;
  }
  if (total === 0) console.log("\n  No findings — project looks healthy.");

  if (skipAi && aiSkipReason) console.log(`\n  Agent analysis skipped: ${aiSkipReason}`);

  const c = grouped.CRITICAL.length, h = grouped.HIGH.length, m = grouped.MEDIUM.length, l = grouped.LOW.length;
  const health = c > 0 ? "Action required" : h > 0 ? "Attention needed" : m > 0 ? "Minor issues" : "Healthy";

  console.log(`\n${hr}`);
  console.log(` Health: ${health}  |  ${c} critical  ${h} high  ${m} medium  ${l} low`);
  console.log(hr);

  const tips = [];
  if (c > 0 || h > 0) tips.push("Fix critical/high findings — these block safe delivery.");
  if (m > 0) tips.push("Review medium findings and plan remediation before next release.");
  if (!feature) tips.push("Run `aitri audit --feature <name>` to check pipeline compliance.");
  if (total > 0 && process.stdin.isTTY) tips.push("Respond (y) when prompted to save findings to docs/audit/audit-findings.json.");
  if (tips.length > 0) {
    console.log(" Next steps:");
    tips.forEach((t) => console.log(`  • ${t}`));
  }
  console.log();
}

// ─── MAIN COMMAND ─────────────────────────────────────────────────────────────

export async function runAuditCommand({ options, getProjectContextOrExit, ask, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const jsonMode = options.json || (options.format || "").toLowerCase() === "json";
  const skipAi = !!options.noAi;

  let feature = null;
  try { feature = resolveFeature(options, () => { throw new Error("no_status"); }); } catch { }

  const { paths } = project;
  const hasApprovedSpec = feature ? exists(paths.approvedSpecFile(feature)) : false;

  const allFindings = [];

  // Layer 1: Pipeline compliance (only when --feature is provided)
  if (feature) {
    allFindings.push(...runStaticAudit(project, feature, root));
  } else if (!jsonMode) {
    console.log("\n  (project-level audit — pipeline compliance skipped; use --feature <name> to include it)\n");
  }

  // Layer 2: Code quality — always runs
  allFindings.push(...runCodeQualityAudit(root));

  // Layer 3: Dependency audit — always runs (skips gracefully if no package.json)
  allFindings.push(...runDependencyAudit(root));

  const critical = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const high = allFindings.filter((f) => f.severity === "HIGH").length;
  const ok = critical === 0 && high === 0;

  if (jsonMode) {
    console.log(JSON.stringify({
      ok, feature: feature || null, findings: allFindings,
      summary: { critical, high, medium: allFindings.filter((f) => f.severity === "MEDIUM").length, low: allFindings.filter((f) => f.severity === "LOW").length }
    }, null, 2));
    return ok ? OK : ERROR;
  }

  printReport(feature || "(project)", allFindings, false, null);

  // Approval flow — only in interactive mode
  if (typeof ask === "function") {
    await runApprovalFlow(allFindings, ask, options, root);
  }

  // Layer 4: Agent prompt output (skipped in --no-ai and --json modes)
  if (!skipAi) {
    const scaffoldManifestFile = feature
      ? path.join(paths.implementationFeatureDir(feature), "scaffold-manifest.json")
      : null;
    const scaffoldManifest = scaffoldManifestFile && exists(scaffoldManifestFile) ? readJsonSafe(scaffoldManifestFile) : null;
    const contractFiles = scaffoldManifest?.interfaceFiles || discoverContractFiles(root);
    const contractSamples = readContractSamples(root, contractFiles);
    const sourceSample = readSourceSample(root);
    const specContent = hasApprovedSpec && feature ? fs.readFileSync(paths.approvedSpecFile(feature), "utf8") : null;

    console.log("\n\nAitri Audit — Layer 4: Agent Analysis");
    console.log("Execute the following persona-driven analysis tasks:\n");
    printLayer4Prompts(root, feature, specContent, contractSamples, sourceSample);
  }

  return ok ? OK : ERROR;
}
