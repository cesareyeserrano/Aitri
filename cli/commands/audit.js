import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveFeature } from "../lib.js";
import { callAI } from "../ai-client.js";

function exists(p) { return fs.existsSync(p); }
function readJsonSafe(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function safeStatMs(f) { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }
function finding(severity, source, message, meta = {}) { return { severity, source, message, ...meta }; }

// ─── LAYER 1: STATIC PIPELINE COMPLIANCE ────────────────────────────────────

function hasPlaceholder(filePath) {
  try { return /not implemented/i.test(fs.readFileSync(filePath, "utf8")); }
  catch { return false; }
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
  }
  const proofFile = path.join(paths.implementationFeatureDir(feature), "proof-of-compliance.json");
  const proof = exists(proofFile) ? readJsonSafe(proofFile) : null;
  if (!proof) {
    findings.push(finding("HIGH", "pipeline", `Proof of compliance missing. Run: aitri prove --feature ${feature}`));
  } else {
    const backlogFile = paths.backlogFile(feature);
    const testsFile = paths.testsFile(feature);
    const latestInput = Math.max(safeStatMs(specFile), safeStatMs(backlogFile), safeStatMs(testsFile));
    if (latestInput > safeStatMs(proofFile))
      findings.push(finding("MEDIUM", "pipeline", `Proof is stale — spec or tests changed since last prove run.`));
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

function collectSourceFiles(root, extensions = [".js", ".mjs", ".ts", ".py", ".go"], maxFiles = 60) {
  const files = [];
  function walk(dir, depth = 0) {
    if (depth > 4 || files.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); }
      else if (extensions.some((ext) => e.name.endsWith(ext))) files.push(full);
    }
  }
  const srcDir = path.join(root, "src");
  walk(exists(srcDir) ? srcDir : root);
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

// ─── LAYER 4: LLM TECHNICAL AUDIT ────────────────────────────────────────────

const TECHNICAL_AUDITOR_SYSTEM = `You are a senior software architect and security engineer performing a technical audit.
Your role: identify real, concrete problems in the code — not theoretical or hypothetical ones.
Focus on: architecture coherence, security vulnerabilities, performance anti-patterns, scalability risks, error handling gaps.
Be precise and conservative. Do not flag style preferences or minor issues.
Format each finding as: FINDING: [CRITICAL|HIGH|MEDIUM|LOW] <brief, actionable description>
If no significant issues: output NO_FINDINGS`;

const SPEC_INTEGRITY_SYSTEM = `You are a spec integrity auditor comparing a software specification against its implementation.
Your role: detect semantic drift — functionality implemented but not in the spec, or spec requirements not implemented.
Be precise: cite both the spec (FR-N or AC-N) and the code location for each finding.
Distinguish: (a) spec is outdated — code evolved legitimately; (b) implementation gap — spec requirement missing from code.
Format each finding as: FINDING: [CRITICAL|HIGH|MEDIUM|LOW] [DRIFT|GAP] <description with spec ref and code ref>
If no drift detected: output NO_DRIFT`;

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

function parseLlmFindings(content, source) {
  const findings = [];
  for (const line of String(content || "").split("\n")) {
    const m = line.match(/^FINDING:\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\](?:\s*\[(\w+)\])?\s*(.+)/i);
    if (m) findings.push(finding(m[1].toUpperCase(), source, m[3].trim(), m[2] ? { tag: m[2].toUpperCase() } : {}));
  }
  return findings;
}

function buildCodeOnlyPrompt(contractSamples) {
  const section = contractSamples.length > 0
    ? contractSamples.map((c) => `// File: ${c.path}\n${c.content}`).join("\n\n---\n\n")
    : "(no contract files found)";
  return `Analyze the following contract implementations for quality, reliability, and anti-patterns.\n\n${section}`;
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

  const sourceLabels = { pipeline: "Pipeline Compliance", "code-quality": "Code Quality", dependencies: "Dependencies", llm: "Technical Review", "llm-drift": "Spec Integrity" };

  console.log(`\nAitri Audit  —  ${feature}\n`);

  let printed = 0;
  for (const sev of order) {
    for (const f of grouped[sev]) {
      const srcLabel = sourceLabels[f.source] || f.source;
      const tag = f.tag ? ` [${f.tag}]` : "";
      console.log(`  [${sev.padEnd(8)}] [${srcLabel}]${tag}  ${f.message}`);
      printed++;
    }
  }
  if (printed === 0) console.log("  No findings — project looks healthy.");

  if (skipAi && aiSkipReason) console.log(`\n  LLM review skipped: ${aiSkipReason}`);

  const c = grouped.CRITICAL.length, h = grouped.HIGH.length, m = grouped.MEDIUM.length, l = grouped.LOW.length;
  console.log(`\n  Summary  ${c} critical  ${h} high  ${m} medium  ${l} low\n`);
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
  const aiConfig = project.config?.ai;
  const hasAiConfig = !!(aiConfig?.provider);
  const hasApprovedSpec = feature ? exists(paths.approvedSpecFile(feature)) : false;
  const codeOnlyMode = !hasApprovedSpec && !skipAi && hasAiConfig;

  const allFindings = [];
  let aiSkipReason = null;
  let recommendAdopt = false;

  // Layer 1: Pipeline compliance
  if (feature) {
    allFindings.push(...runStaticAudit(project, feature, root));
  } else if (!codeOnlyMode) {
    allFindings.push(finding("HIGH", "pipeline", "Feature name is required. Use --feature <name>."));
  }

  // Layer 2: Code quality (always runs if source files exist)
  allFindings.push(...runCodeQualityAudit(root));

  // Layer 3: Dependency audit (always runs if package.json exists)
  allFindings.push(...runDependencyAudit(root));

  // Layer 4: LLM audit
  if (!skipAi && hasAiConfig) {
    const scaffoldManifestFile = feature
      ? path.join(paths.implementationFeatureDir(feature), "scaffold-manifest.json")
      : null;
    const scaffoldManifest = scaffoldManifestFile && exists(scaffoldManifestFile) ? readJsonSafe(scaffoldManifestFile) : null;
    const contractFiles = scaffoldManifest?.interfaceFiles || discoverContractFiles(root);
    const contractSamples = readContractSamples(root, contractFiles);
    const sourceSample = readSourceSample(root);

    if (hasApprovedSpec && feature) {
      const specContent = fs.readFileSync(paths.approvedSpecFile(feature), "utf8");

      // 4a: Technical Auditor
      const techPrompt = `Analyze this codebase for technical quality issues.\n\n## Source Code Sample\n${sourceSample}\n\n## Contract Implementations\n${contractSamples.map((c) => `// ${c.path}\n${c.content}`).join("\n\n")}`;
      const techResult = await callAI({ prompt: techPrompt, systemPrompt: TECHNICAL_AUDITOR_SYSTEM, config: aiConfig });
      if (techResult.ok) {
        allFindings.push(...parseLlmFindings(techResult.content, "llm"));
      } else {
        allFindings.push(finding("LOW", "llm", `Technical review failed: ${techResult.error}`));
      }

      // 4b: Spec Integrity Auditor
      const driftPrompt = `Compare this spec against the implementation and identify drift.\n\n## Approved Spec\n${specContent.slice(0, 3000)}\n\n## Contract Implementations\n${contractSamples.map((c) => `// ${c.path}\n${c.content}`).join("\n\n")}`;
      const driftResult = await callAI({ prompt: driftPrompt, systemPrompt: SPEC_INTEGRITY_SYSTEM, config: aiConfig });
      if (driftResult.ok && !/NO_DRIFT/i.test(driftResult.content)) {
        allFindings.push(...parseLlmFindings(driftResult.content, "llm-drift"));
      } else if (!driftResult.ok) {
        allFindings.push(finding("LOW", "llm-drift", `Spec drift check failed: ${driftResult.error}`));
      }

    } else if (codeOnlyMode) {
      const contractSamplesAny = contractSamples.length > 0 ? contractSamples : [{ path: "src/", content: sourceSample }];
      const result = await callAI({ prompt: buildCodeOnlyPrompt(contractSamplesAny), systemPrompt: TECHNICAL_AUDITOR_SYSTEM, config: aiConfig });
      if (result.ok) {
        allFindings.push(...parseLlmFindings(result.content, "llm"));
        recommendAdopt = /RECOMMEND_ADOPT:\s*true/i.test(result.content);
      }
    }
  } else if (!skipAi && !hasAiConfig) {
    aiSkipReason = "no AI provider configured (add `ai` section to aitri.config.json, or use --no-ai)";
  } else if (skipAi) {
    aiSkipReason = "--no-ai flag set";
  }

  if (recommendAdopt)
    allFindings.push(finding("MEDIUM", "llm", "No spec found. Run `aitri adopt` to formalize this project."));

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

  printReport(feature || "(code-only)", allFindings, skipAi || !hasAiConfig, aiSkipReason);

  // Approval flow — only in interactive mode
  if (typeof ask === "function") {
    await runApprovalFlow(allFindings, ask, options, root);
  }

  return ok ? OK : ERROR;
}
