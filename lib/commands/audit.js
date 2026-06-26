/**
 * Module: Command — audit
 * Purpose: On-demand code & architecture audit.
 *          Generates a structured evaluative prompt; agent writes AUDIT_REPORT.md.
 *
 * Sub-commands:
 *   aitri audit          — generate audit briefing → agent writes AUDIT_REPORT.md
 *   aitri audit plan     — read AUDIT_REPORT.md → agent proposes Aitri actions
 *   aitri audit requirements — idea→FR completeness audit (ADR-048; alias: audit coverage)
 *   aitri audit security — adversarial security audit: code, repo, deployed surface (ADR-051)
 *
 * AUDIT_REPORT.md is an optional, off-pipeline artifact (like BUGS.json / BACKLOG.json).
 * It does not affect validate, approve, or drift detection.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { loadConfig, saveConfig, readArtifact, seedPath, layoutEmissionVars } from '../state.js';
import { render } from '../prompts/render.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/auditor.js';
import { ROLE as COV_ROLE, CONSTRAINTS as COV_CONSTRAINTS, REASONING as COV_REASONING } from '../personas/coverage-auditor.js';
import { ROLE as SEC_ROLE, CONSTRAINTS as SEC_CONSTRAINTS, REASONING as SEC_REASONING } from '../personas/security-auditor.js';

const AUDIT_REPORT_NAME = 'AUDIT_REPORT.md';

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Resolve the path to AUDIT_REPORT.md respecting artifactsDir.
 * Falls back to the project root (same resolution as artifactPath / the artifact
 * readers) when artifactsDir is not set — so legacy root-artifact projects read and
 * write the report in the same place the rest of the chain lives.
 */
export function auditReportPath(dir, config) {
  const adir = config.artifactsDir || '';
  return adir ? path.join(dir, adir, AUDIT_REPORT_NAME) : path.join(dir, AUDIT_REPORT_NAME);
}

/**
 * Build a compact pipeline state string from config.
 */
export function buildPipelineState(config) {
  const current   = config.currentPhase != null ? String(config.currentPhase) : 'not started';
  const completed = (config.completedPhases || []).join(', ') || 'none';
  const approved  = (config.approvedPhases  || []).join(', ') || 'none';
  return `Current phase: ${current} | Completed: ${completed} | Approved: ${approved}`;
}

/**
 * Build a compact FR summary from 01_REQUIREMENTS.json if it exists.
 * Returns null when the artifact is missing or malformed.
 */
export function buildRequirementsSummary(dir, config) {
  const raw = readArtifact(dir, '01_REQUIREMENTS.json', config.artifactsDir || '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const frs = parsed.functional_requirements || [];
    if (frs.length === 0) return null;
    return frs.map(fr => `${fr.id} [${fr.priority}] ${fr.title}`).join('\n');
  } catch {
    return null;
  }
}

/**
 * Build the agent-declared intent coverage map (ADR-060) from 01_REQUIREMENTS.json, as
 * `disposition ← need` lines. Fed to the coverage audit so the auditor can DIFF its own
 * fresh re-derivation of the seed's needs against what the agent claimed it covered —
 * turning "is anything missing?" (open-ended) into a concrete set comparison. Returns
 * null when the field is absent (older projects / pre-ADR-060) so the audit degrades to
 * its prior from-scratch derivation.
 */
export function buildCoverageMapSummary(dir, config) {
  const raw = readArtifact(dir, '01_REQUIREMENTS.json', config.artifactsDir || '');
  if (!raw) return null;
  try {
    const map = JSON.parse(raw).coverage_map;
    if (!Array.isArray(map) || map.length === 0) return null;
    return map
      .map(e => `  - ${(e && e.disposition) || '???'} ← ${(e && e.need) || '(no need text)'}`)
      .join('\n');
  } catch {
    return null;
  }
}

/**
 * Gather the client's original-intent sources for a coverage audit (ADR-048):
 * the approved discovery, the original brief absorbed into 01_REQUIREMENTS.json at
 * Phase 1, and the live seed brief still on disk. At least one exists once Phase 1 has
 * produced requirements: pre-approve the seed is live; post-approve original_brief is
 * populated (and the seed has MOVED to archive/ — which is deliberately NOT read here,
 * AGENTS.md forbids reading the archive as current intent). `featureRoot` (truthy ⇒
 * feature scope) switches the live-seed lookup to FEATURE_IDEA.md so a feature-scoped
 * coverage audit compares the FEATURE's intent against the FEATURE's FRs (AUDIT-COV-FEAT-0625
 * fork 2). Returns all three sources (each may be '').
 */
export function buildIntentSources(dir, config, featureRoot) {
  const adir = config.artifactsDir || '';
  const discovery = readArtifact(dir, '00_DISCOVERY.md', adir) || '';
  let originalBrief = '';
  const reqRaw = readArtifact(dir, '01_REQUIREMENTS.json', adir);
  if (reqRaw) {
    try {
      const brief = JSON.parse(reqRaw).original_brief;
      if (typeof brief === 'string') originalBrief = brief;
      else if (brief && typeof brief === 'object') originalBrief = JSON.stringify(brief, null, 2);
    } catch { /* malformed — leave brief empty */ }
  }
  let idea = '';
  const seedFile = seedPath(dir, config, featureRoot); // FEATURE_IDEA.md in feature scope, IDEA.md at root
  if (fs.existsSync(seedFile)) {
    try { idea = fs.readFileSync(seedFile, 'utf8'); } catch { /* unreadable — skip */ }
  }
  return { discovery, originalBrief, idea };
}

/**
 * Build a compact summary of the security NFRs from 01_REQUIREMENTS.json.
 * Returns null when the artifact is missing/malformed or has no security NFRs.
 * Used by `audit security` (the auditor verifies declared promises) and by the
 * resume nudge (a project that declared security NFRs should eventually run it).
 */
export function buildSecurityNfrSummary(dir, config) {
  const raw = readArtifact(dir, '01_REQUIREMENTS.json', config.artifactsDir || '');
  if (!raw) return null;
  try {
    const nfrs = (JSON.parse(raw).non_functional_requirements || [])
      .filter(n => /security/i.test(n.category || ''));
    if (nfrs.length === 0) return null;
    return nfrs.map(n => `${n.id} [${n.category}] ${n.requirement || n.title || ''}`).join('\n');
  } catch {
    return null;
  }
}

/**
 * Build a compact summary of declared quality_gates from 04_BUILD_REPORT.json.
 * Returns null when the manifest is missing/malformed or declares no gates.
 * The security auditor uses it to avoid re-reporting what verify already
 * checks mechanically, and to propose the gate that closes the loop.
 */
export function buildQualityGatesSummary(dir, config) {
  const raw = readArtifact(dir, '04_BUILD_REPORT.json', config.artifactsDir || '');
  if (!raw) return null;
  try {
    const gates = JSON.parse(raw).quality_gates;
    if (!Array.isArray(gates) || gates.length === 0) return null;
    return gates
      .map(g => `${g.name}: \`${g.command || `coverage ≥ ${g.threshold}`}\` (${g.required === false ? 'advisory' : 'required'})`)
      .join('\n');
  } catch {
    return null;
  }
}

// ── Sub-command: audit security (ADR-051) ───────────────────────────────────
// On-demand adversarial security audit — code, repo, AND deployed/running
// surface. Distinct posture from the code audit (attacker-first, outside-in)
// and from the per-phase security threading (which proves intent, not
// exposure). No pipeline precondition: a repo with no artifacts still has a
// static surface worth auditing. Advisory: writes a "Security" section to the
// off-pipeline AUDIT_REPORT.md; the permanent protection is the quality_gate
// the audit proposes, which verify then enforces mechanically.
function cmdAuditSecurity({ dir }) {
  const config        = loadConfig(dir);
  const artifactsDir  = config.artifactsDir || '';
  const artifactsBase = path.join(dir, artifactsDir);
  const projectName   = config.projectName || path.basename(dir);

  // Design doc excerpt (first 30 lines) for surface-mapping orientation
  const designRaw     = readArtifact(dir, '02_SYSTEM_DESIGN.md', config.artifactsDir || '');
  const designSummary = designRaw ? designRaw.split('\n').slice(0, 30).join('\n') : null;

  const briefing = render('phases/auditSecurity', {
    ROLE: SEC_ROLE, CONSTRAINTS: SEC_CONSTRAINTS, REASONING: SEC_REASONING,
    PROJECT_DIR:          dir,
    PROJECT_NAME:         projectName,
    ARTIFACTS_BASE:       artifactsBase,
    PIPELINE_STATE:       buildPipelineState(config),
    SECURITY_NFRS:        buildSecurityNfrSummary(dir, config)  || '',
    REQUIREMENTS_SUMMARY: buildRequirementsSummary(dir, config) || '',
    DESIGN_SUMMARY:       designSummary                         || '',
    QUALITY_GATES:        buildQualityGatesSummary(dir, config) || '',
  });

  process.stdout.write(briefing + '\n');

  // Persist invocation timestamp: stops the resume nudge once run, re-fires it
  // when requirements change, and survives git clone (additive `.aitri` field).
  config.securityAuditLastAt = new Date().toISOString();
  saveConfig(dir, config);

  const bar = '─'.repeat(60);
  process.stderr.write(`\n${bar}\n`);
  process.stderr.write(`Security audit briefing generated — ${projectName}\n`);
  process.stderr.write(`Adversarial review of code, repo, and deployed surface. Agent appends a "Security" section to: ${path.join(artifactsDir, AUDIT_REPORT_NAME)}\n`);
  process.stderr.write(`Next: aitri audit plan   →   route each RQ-SEC finding (P0s first) into the pipeline\n`);
  process.stderr.write(`${bar}\n`);
}

// ── Sub-command: audit requirements (ADR-048; alias: audit coverage) ─────────
// Independent idea→FR completeness audit. Distinct posture from the code audit
// (coverage-auditor distrusts requirement COMPLETENESS, not code quality). Most
// valuable run in a FRESH session — resume nudges it. Advisory: writes a
// "Requirements Coverage" section to the off-pipeline AUDIT_REPORT.md, no gate.
function cmdAuditCoverage({ dir, err, featureRoot, scopeName }) {
  const config        = loadConfig(dir);
  const artifactsDir  = config.artifactsDir || '';
  const artifactsBase = path.join(dir, artifactsDir);
  const projectName   = config.projectName || path.basename(dir);
  const isFeature     = !!featureRoot;
  const seedFileName  = isFeature ? 'FEATURE_IDEA.md' : layoutEmissionVars(config).IDEA_FILE;

  const reqSummary = buildRequirementsSummary(dir, config);
  if (!reqSummary) {
    const reopen = isFeature ? `aitri feature run-phase ${scopeName} requirements` : `aitri run-phase 1`;
    err(`No functional requirements to audit — run the pipeline through Phase 1 first (${reopen}).`);
    return;
  }
  const { discovery, originalBrief, idea } = buildIntentSources(dir, config, featureRoot);
  if (!discovery && !originalBrief && !idea) {
    err(`No intent source found to check requirements coverage against (expected ${artifactsDir}/00_DISCOVERY.md, 01_REQUIREMENTS.json#original_brief, or ${seedFileName}). The audit needs the ${isFeature ? "feature's" : "client's"} original request.`);
    return;
  }

  // Feature scope: tell the auditor it is auditing THIS feature's intent against THIS
  // feature's FRs — the parent project's FRs are out of scope for this pass (fork 2).
  const scopeNote = isFeature
    ? `This is the **${scopeName}** FEATURE sub-pipeline. Audit THIS feature's intent (FEATURE_IDEA.md / its absorbed original_brief) against THIS feature's functional_requirements ONLY. The parent project's needs and FRs are out of scope for this audit — a feature legitimately covers only its own increment.`
    : '';

  const briefing = render('phases/auditCoverage', {
    ROLE: COV_ROLE, CONSTRAINTS: COV_CONSTRAINTS, REASONING: COV_REASONING,
    PROJECT_DIR:          dir,
    PROJECT_NAME:         projectName,
    ARTIFACTS_BASE:       artifactsBase,
    PIPELINE_STATE:       buildPipelineState(config),
    SCOPE_NOTE:           scopeNote,
    DISCOVERY:            discovery,
    ORIGINAL_BRIEF:       originalBrief,
    IDEA:                 idea,
    IDEA_FILE:            seedFileName,
    REQUIREMENTS_SUMMARY: reqSummary,
    COVERAGE_MAP:         buildCoverageMapSummary(dir, config) || '',
  });

  process.stdout.write(briefing + '\n');

  // Persist invocation timestamp so the resume nudge stops once run and the
  // staleness check survives git clone (additive `.aitri` field — ADR-048).
  // In feature scope this writes the FEATURE's own .aitri (dir = feature dir).
  config.coverageAuditLastAt = new Date().toISOString();
  saveConfig(dir, config);

  const reopenHint = isFeature
    ? `add the FR via feature run-phase ${scopeName} requirements, or record out-of-scope`
    : `add the FR via run-phase 1, or record out-of-scope`;
  const bar = '─'.repeat(60);
  process.stderr.write(`\n${bar}\n`);
  process.stderr.write(`Coverage audit briefing generated — ${projectName}${isFeature ? ' (feature)' : ''}\n`);
  process.stderr.write(`Compares ${isFeature ? 'feature intent' : 'discovery / brief / idea'} → FRs. Agent appends a "Requirements Coverage" section to: ${path.join(artifactsDir, AUDIT_REPORT_NAME)}\n`);
  process.stderr.write(`Next: route each gap (${reopenHint})\n`);
  process.stderr.write(`${bar}\n`);
}

// ── Sub-command: audit (default) ─────────────────────────────────────────────

function cmdAuditRun({ dir, err }) {
  const config        = loadConfig(dir);
  const artifactsDir  = config.artifactsDir || '';
  const artifactsBase = path.join(dir, artifactsDir);
  const projectName   = config.projectName || path.basename(dir);

  const pipelineState   = buildPipelineState(config);
  const reqSummary      = buildRequirementsSummary(dir, config);

  // Design doc excerpt (first 30 lines) for architectural context
  const designRaw     = readArtifact(dir, '02_SYSTEM_DESIGN.md', config.artifactsDir || '');
  const designSummary = designRaw
    ? designRaw.split('\n').slice(0, 30).join('\n')
    : null;

  // Known open bugs — avoid duplicating already-tracked issues in the report
  let openBugsSummary = null;
  const bugsRaw = readArtifact(dir, 'BUGS.json', config.artifactsDir || '');
  if (bugsRaw) {
    try {
      const bugs = JSON.parse(bugsRaw);
      const open = (bugs.bugs || []).filter(b => b.status === 'open' || b.status === 'in_progress');
      if (open.length > 0) {
        openBugsSummary = open.map(b => `${b.id} [${b.severity}] ${b.title}`).join('\n');
      }
    } catch { /* ignore malformed BUGS.json */ }
  }

  const briefing = render('phases/audit', {
    ROLE,
    CONSTRAINTS,
    REASONING,
    PROJECT_DIR:          dir,
    PROJECT_NAME:         projectName,
    ARTIFACTS_BASE:       artifactsBase,
    PIPELINE_STATE:       pipelineState,
    REQUIREMENTS_SUMMARY: reqSummary      || '',
    DESIGN_SUMMARY:       designSummary   || '',
    OPEN_BUGS:            openBugsSummary || '',
  });

  process.stdout.write(briefing + '\n');

  // Persist invocation timestamp so audit staleness survives git clone
  // (file mtime resets to clone time). Snapshot prefers this over fs.mtime.
  config.auditLastAt = new Date().toISOString();
  saveConfig(dir, config);

  const bar = '─'.repeat(60);
  process.stderr.write(`\n${bar}\n`);
  process.stderr.write(`Audit briefing generated — ${projectName}\n`);
  process.stderr.write(`Agent writes: ${path.join(artifactsDir, AUDIT_REPORT_NAME)}\n`);
  process.stderr.write(`Next: aitri audit plan   →   classify findings into Aitri actions\n`);
  process.stderr.write(`Also: aitri audit requirements   →   did any client request get dropped from the requirements?\n`);
  process.stderr.write(`Also: aitri audit security   →   what does the project expose — code, repo, deployed surface?\n`);
  process.stderr.write(`${bar}\n`);
}

// ── Sub-command: audit plan ───────────────────────────────────────────────────

function cmdAuditPlan({ dir, err }) {
  const config      = loadConfig(dir);
  const reportPath  = auditReportPath(dir, config);
  const projectName = config.projectName || path.basename(dir);

  if (!fs.existsSync(reportPath)) {
    err(`AUDIT_REPORT.md not found — run \`aitri audit\` first`);
    return;
  }

  const reportContent = fs.readFileSync(reportPath, 'utf8');
  const pipelineState = buildPipelineState(config);

  const briefing = render('phases/auditPlan', {
    ROLE,
    CONSTRAINTS,
    REASONING,
    PROJECT_NAME:   projectName,
    PIPELINE_STATE: pipelineState,
    AUDIT_REPORT:   reportContent,
  });

  process.stdout.write(briefing + '\n');

  const bar = '─'.repeat(60);
  process.stderr.write(`\n${bar}\n`);
  process.stderr.write(`Audit plan briefing generated — ${projectName}\n`);
  process.stderr.write(`Execute the proposed Aitri commands to action each finding.\n`);
  process.stderr.write(`${bar}\n`);
}

// ── CLI Dispatcher ────────────────────────────────────────────────────────────

export function cmdAudit({ dir, args, err, featureRoot, scopeName }) {
  const sub = args[0];
  if (sub === 'plan') {
    cmdAuditPlan({ dir, err });
    return;
  }
  // `requirements` is the canonical name; `coverage` is a deprecated alias kept working
  // (the word "coverage" collided with test coverage — verify-run --coverage-threshold).
  // featureRoot/scopeName thread feature scope through (AUDIT-COV-FEAT-0625 fork 2);
  // both undefined at root → unchanged behavior.
  if (sub === 'requirements' || sub === 'coverage') {
    if (sub === 'coverage') {
      process.stderr.write(`[aitri] note: \`audit coverage\` was renamed \`audit requirements\` (the old name still works, for now).\n`);
    }
    cmdAuditCoverage({ dir, err, featureRoot, scopeName });
    return;
  }
  if (sub === 'security') {
    cmdAuditSecurity({ dir });
    return;
  }
  cmdAuditRun({ dir, err });
}
