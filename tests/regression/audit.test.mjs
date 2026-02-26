import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";
import { runStaticAudit } from "../../cli/commands/audit.js";
import { loadAitriConfig, resolveProjectPaths } from "../../cli/config.js";

function makeProject(dir) {
  const config = loadAitriConfig(dir);
  const paths = resolveProjectPaths(dir, config.paths);
  return { config, paths };
}

function writeApprovedSpec(dir, feature) {
  fs.mkdirSync(path.join(dir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "specs", "approved", `${feature}.md`),
    [
      `# AF-SPEC: ${feature}`,
      "STATUS: APPROVED",
      "",
      "## 3. Functional Rules (traceable)",
      "- FR-1: The system must process inputs correctly.",
      "",
      "## 9. Acceptance Criteria",
      "- AC-1: Given valid input, when process is called, then output is returned.",
      ""
    ].join("\n"),
    "utf8"
  );
}

function writeBuildManifest(dir, feature) {
  const implDir = path.join(dir, "docs", "implementation", feature);
  fs.mkdirSync(implDir, { recursive: true });
  const manifest = { schemaVersion: 1, feature, generatedAt: new Date().toISOString(), completedStories: [], pendingStories: ["US-1"], stories: [] };
  fs.writeFileSync(path.join(implDir, "build-manifest.json"), JSON.stringify(manifest), "utf8");
}

function writeScaffoldManifest(dir, feature, contractFiles) {
  const implDir = path.join(dir, "docs", "implementation", feature);
  fs.mkdirSync(implDir, { recursive: true });
  const manifest = { feature, generatedAt: new Date().toISOString(), testFiles: [], interfaceFiles: contractFiles, baseConfigs: [] };
  fs.writeFileSync(path.join(implDir, "scaffold-manifest.json"), JSON.stringify(manifest), "utf8");
}

function writeProof(dir, feature, proofData) {
  const implDir = path.join(dir, "docs", "implementation", feature);
  fs.mkdirSync(implDir, { recursive: true });
  fs.writeFileSync(path.join(implDir, "proof-of-compliance.json"), JSON.stringify(proofData), "utf8");
}

function writeContract(dir, rel, content) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

// --- Unit tests for runStaticAudit ---

test("runStaticAudit returns CRITICAL when approved spec is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-nospec-"));
  const project = makeProject(dir);
  const findings = runStaticAudit(project, "missing-feature", dir);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "CRITICAL");
  assert.match(findings[0].message, /No approved spec/);
});

test("runStaticAudit returns HIGH when build manifest is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-nobuild-"));
  const project = makeProject(dir);
  writeApprovedSpec(dir, "test-feature");
  const findings = runStaticAudit(project, "test-feature", dir);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "HIGH");
  assert.match(findings[0].message, /Build artifacts not found/);
});

test("runStaticAudit returns HIGH when proof is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-noproof-"));
  const project = makeProject(dir);
  writeApprovedSpec(dir, "test-feature");
  writeBuildManifest(dir, "test-feature");
  const findings = runStaticAudit(project, "test-feature", dir);
  assert.ok(findings.some((f) => f.severity === "HIGH" && /Proof of compliance missing/.test(f.message)));
});

test("runStaticAudit flags CRITICAL for failed proof", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-failproof-"));
  const project = makeProject(dir);
  writeApprovedSpec(dir, "test-feature");
  writeBuildManifest(dir, "test-feature");
  writeProof(dir, "test-feature", {
    ok: false,
    summary: { total: 1, proven: 0, unproven: 1, trivialTcs: [] },
    frProof: { "FR-1": { proven: false, via: [], tracingTcs: [] } },
    tcResults: {}
  });
  const findings = runStaticAudit(project, "test-feature", dir);
  const critical = findings.filter((f) => f.severity === "CRITICAL");
  assert.ok(critical.some((f) => /Proof of compliance failed/.test(f.message)));
});

test("runStaticAudit flags HIGH for each unproven FR", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-unproven-"));
  const project = makeProject(dir);
  writeApprovedSpec(dir, "test-feature");
  writeBuildManifest(dir, "test-feature");
  writeProof(dir, "test-feature", {
    ok: false,
    summary: { total: 2, proven: 1, unproven: 1, trivialTcs: [] },
    frProof: {
      "FR-1": { proven: true, via: ["TC-1"], tracingTcs: ["TC-1"] },
      "FR-2": { proven: false, via: [], tracingTcs: [] }
    },
    tcResults: {}
  });
  const findings = runStaticAudit(project, "test-feature", dir);
  const unprovenFindings = findings.filter((f) => f.severity === "HIGH" && /FR-2 is unproven/.test(f.message));
  assert.equal(unprovenFindings.length, 1);
});

test("runStaticAudit flags HIGH for contract placeholder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-placeholder-"));
  const project = makeProject(dir);
  writeApprovedSpec(dir, "test-feature");
  writeBuildManifest(dir, "test-feature");
  writeContract(dir, "src/contracts/fr-1-process.js", "export function process() { throw new Error('Not implemented'); }");
  writeScaffoldManifest(dir, "test-feature", ["src/contracts/fr-1-process.js"]);
  writeProof(dir, "test-feature", {
    ok: true,
    summary: { total: 1, proven: 1, unproven: 0, trivialTcs: [] },
    frProof: { "FR-1": { proven: true, via: ["TC-1"], tracingTcs: ["TC-1"] } },
    tcResults: {}
  });
  const findings = runStaticAudit(project, "test-feature", dir);
  const placeholderFindings = findings.filter((f) => f.severity === "HIGH" && /placeholder implementation/.test(f.message));
  assert.equal(placeholderFindings.length, 1);
});

test("runStaticAudit flags MEDIUM for trivial TCs from proof summary", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-trivial-"));
  const project = makeProject(dir);
  writeApprovedSpec(dir, "test-feature");
  writeBuildManifest(dir, "test-feature");
  writeProof(dir, "test-feature", {
    ok: true,
    summary: { total: 1, proven: 1, unproven: 0, trivialTcs: ["TC-2"] },
    frProof: { "FR-1": { proven: true, via: ["TC-1"], tracingTcs: ["TC-1", "TC-2"] } },
    tcResults: {}
  });
  const findings = runStaticAudit(project, "test-feature", dir);
  const trivial = findings.filter((f) => f.severity === "MEDIUM" && /TC-2 is trivial/.test(f.message));
  assert.equal(trivial.length, 1);
});

test("runStaticAudit flags MEDIUM for low mutation score (< 50%)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-mutation-"));
  const project = makeProject(dir);
  writeApprovedSpec(dir, "test-feature");
  writeBuildManifest(dir, "test-feature");
  writeProof(dir, "test-feature", {
    ok: true,
    summary: { total: 1, proven: 1, unproven: 0, trivialTcs: [] },
    frProof: {
      "FR-1": {
        proven: true, via: ["TC-1"], tracingTcs: ["TC-1"],
        mutationScore: { detected: 2, total: 10 }  // 20% — below threshold
      }
    },
    tcResults: {}
  });
  const findings = runStaticAudit(project, "test-feature", dir);
  const mutFindings = findings.filter((f) => f.severity === "MEDIUM" && /mutation score/.test(f.message));
  assert.equal(mutFindings.length, 1);
  assert.match(mutFindings[0].message, /20%/);
});

// --- CLI integration tests ---

test("audit --no-ai --json returns ok:false for missing spec", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-cli-nospec-"));
  const result = runNode(["audit", "--feature", "no-spec", "--no-ai", "--json"], { cwd: dir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.findings.some((f) => f.severity === "CRITICAL"));
});

test("audit --no-ai --json returns ok:true when proof passes and no placeholders", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-cli-clean-"));
  const feature = "clean-feature";
  writeApprovedSpec(dir, feature);
  writeBuildManifest(dir, feature);
  writeProof(dir, feature, {
    ok: true,
    summary: { total: 1, proven: 1, unproven: 0, trivialTcs: [] },
    frProof: { "FR-1": { proven: true, via: ["TC-1"], tracingTcs: ["TC-1"] } },
    tcResults: {}
  });
  const result = runNodeOk(["audit", "--feature", feature, "--no-ai", "--json"], { cwd: dir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.critical, 0);
  assert.equal(payload.summary.high, 0);
});

test("audit CLI prints pipeline-style report without --json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-audit-cli-report-"));
  const result = runNode(["audit", "--feature", "no-spec", "--no-ai"], { cwd: dir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Aitri Audit/);
  assert.match(result.stdout, /CRITICAL/);
  assert.match(result.stdout, /Summary/);
});
