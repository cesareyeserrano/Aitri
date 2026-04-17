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
import { loadConfig, saveConfig, readArtifact } from '../state.js';
import { render } from '../prompts/render.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/auditor.js';

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
  cmdAuditRun({ dir, err });
}
