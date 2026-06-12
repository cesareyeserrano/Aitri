/**
 * Module: Command — audit
 * Purpose: On-demand code & architecture audit.
 *          Generates a structured evaluative prompt; agent writes AUDIT_REPORT.md.
 *
 * Sub-commands:
 *   aitri audit        — generate audit briefing → agent writes AUDIT_REPORT.md
 *   aitri audit plan   — read AUDIT_REPORT.md → agent proposes Aitri actions
 *
 * AUDIT_REPORT.md is an optional, off-pipeline artifact (like BUGS.json / BACKLOG.json).
 * It does not affect validate, approve, or drift detection.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { loadConfig, saveConfig, readArtifact, ideaPath as resolveIdeaPath } from '../state.js';
import { render } from '../prompts/render.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/auditor.js';
import { ROLE as COV_ROLE, CONSTRAINTS as COV_CONSTRAINTS, REASONING as COV_REASONING } from '../personas/coverage-auditor.js';

const AUDIT_REPORT_NAME = 'AUDIT_REPORT.md';

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Resolve the path to AUDIT_REPORT.md respecting artifactsDir.
 * Defaults to spec/ when artifactsDir is not set.
 */
export function auditReportPath(dir, config) {
  const adir = config.artifactsDir || 'spec';
  return path.join(dir, adir, AUDIT_REPORT_NAME);
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
 * Gather the client's original-intent sources for a coverage audit (ADR-048):
 * the approved discovery, the original brief absorbed into 01_REQUIREMENTS.json at
 * Phase 1, and any raw IDEA.md still at the project root. At least one exists for any
 * Phase-1-approved project (original_brief is populated then). Returns all three
 * (each may be '').
 */
export function buildIntentSources(dir, config) {
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
  const ideaPath = resolveIdeaPath(dir, config);
  if (fs.existsSync(ideaPath)) {
    try { idea = fs.readFileSync(ideaPath, 'utf8'); } catch { /* unreadable — skip */ }
  }
  return { discovery, originalBrief, idea };
}

// ── Sub-command: audit coverage (ADR-048) ────────────────────────────────────
// Independent idea→FR completeness audit. Distinct posture from the code audit
// (coverage-auditor distrusts requirement COMPLETENESS, not code quality). Most
// valuable run in a FRESH session — resume nudges it. Advisory: writes a
// "Requirements Coverage" section to the off-pipeline AUDIT_REPORT.md, no gate.
function cmdAuditCoverage({ dir, err }) {
  const config        = loadConfig(dir);
  const artifactsDir  = config.artifactsDir || 'spec';
  const artifactsBase = path.join(dir, artifactsDir);
  const projectName   = config.projectName || path.basename(dir);

  const reqSummary = buildRequirementsSummary(dir, config);
  if (!reqSummary) {
    err(`No functional requirements to audit — run the pipeline through Phase 1 first.`);
    return;
  }
  const { discovery, originalBrief, idea } = buildIntentSources(dir, config);
  if (!discovery && !originalBrief && !idea) {
    err(`No intent source found to audit coverage against (expected ${artifactsDir}/00_DISCOVERY.md, 01_REQUIREMENTS.json#original_brief, or IDEA.md). Coverage needs the client's original request.`);
    return;
  }

  const briefing = render('phases/auditCoverage', {
    ROLE: COV_ROLE, CONSTRAINTS: COV_CONSTRAINTS, REASONING: COV_REASONING,
    PROJECT_DIR:          dir,
    PROJECT_NAME:         projectName,
    ARTIFACTS_BASE:       artifactsBase,
    PIPELINE_STATE:       buildPipelineState(config),
    DISCOVERY:            discovery,
    ORIGINAL_BRIEF:       originalBrief,
    IDEA:                 idea,
    REQUIREMENTS_SUMMARY: reqSummary,
  });

  process.stdout.write(briefing + '\n');

  // Persist invocation timestamp so the resume nudge stops once run and the
  // staleness check survives git clone (additive `.aitri` field — ADR-048).
  config.coverageAuditLastAt = new Date().toISOString();
  saveConfig(dir, config);

  const bar = '─'.repeat(60);
  process.stderr.write(`\n${bar}\n`);
  process.stderr.write(`Coverage audit briefing generated — ${projectName}\n`);
  process.stderr.write(`Compares discovery / brief / idea → FRs. Agent appends a "Requirements Coverage" section to: ${path.join(artifactsDir, AUDIT_REPORT_NAME)}\n`);
  process.stderr.write(`Next: aitri audit plan   →   route each gap (add the FR via run-phase 1, or record out-of-scope)\n`);
  process.stderr.write(`${bar}\n`);
}

// ── Sub-command: audit (default) ─────────────────────────────────────────────

function cmdAuditRun({ dir, err }) {
  const config        = loadConfig(dir);
  const artifactsDir  = config.artifactsDir || 'spec';
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
  process.stderr.write(`Also: aitri audit coverage   →   did any client request get dropped from the requirements?\n`);
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

export function cmdAudit({ dir, args, err }) {
  const sub = args[0];
  if (sub === 'plan') {
    cmdAuditPlan({ dir, err });
    return;
  }
  if (sub === 'coverage') {
    cmdAuditCoverage({ dir, err });
    return;
  }
  cmdAuditRun({ dir, err });
}
