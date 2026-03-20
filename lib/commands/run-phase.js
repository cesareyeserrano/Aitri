/**
 * Module: Command — run-phase
 * Purpose: Print phase briefing to stdout. Agent reads and acts on it.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { loadConfig, saveConfig, readArtifact, appendEvent, setDriftPhase, clearDriftPhase } from '../state.js';
import { runDiscoveryInterview } from './wizard.js';

/** Read best-practices file: project override first, then global template default. */
function readBestPractices(dir, rootDir, filename) {
  const projectPath = path.join(dir, 'best-practices', filename);
  if (fs.existsSync(projectPath)) return fs.readFileSync(projectPath, 'utf8');
  const globalPath = path.join(rootDir, 'templates', 'best-practices', filename);
  if (fs.existsSync(globalPath)) return fs.readFileSync(globalPath, 'utf8');
  return '';
}

const BEST_PRACTICES_FILE = {
  2: 'architecture.md',
  3: 'testing.md',
  4: 'development.md',
  ux: 'ux.md',
};

export function cmdRunPhase({ dir, args, flagValue, err, rootDir, featureRoot, _readLine }) {
  const raw      = args[0];
  const phase    = OPTIONAL_PHASES.includes(raw) ? raw : PHASE_ALIASES[raw] !== undefined ? PHASE_ALIASES[raw] : parseInt(raw);
  const feedback = flagValue('--feedback');
  const guided   = args.includes('--guided');
  const p        = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri run-phase <requirements|architecture|tests|build|deploy|ux|discovery|review> [--feedback "text"]`);

  const config = loadConfig(dir);
  const artifactsDir  = config.artifactsDir || '';
  const artifactsBase = artifactsDir ? path.join(dir, artifactsDir) : dir;

  if (phase === 'review') {
    if (!(config.approvedPhases || []).includes(4)) {
      err(`Code review requires Phase 4 to be approved first.\nRun: aitri approve 4`);
    }
  }

  if (phase === 5) {
    if (!config.verifyPassed) {
      err(`Phase 5 requires test verification first.\nRun: aitri verify-run  →  aitri verify-complete`);
    }
  }

  if (phase === 1) {
    const idea = readArtifact(dir, 'IDEA.md') || '';
    const wordCount = idea.trim().split(/\s+/).filter(Boolean).length;
    const hasDiscovery = !!readArtifact(dir, '00_DISCOVERY.md', artifactsDir);
    if (wordCount < 100 && !hasDiscovery) {
      process.stderr.write(
        `[aitri] Warning: IDEA.md is short (${wordCount} words).\n` +
        `  A richer idea produces better requirements.\n` +
        `  Optional: run aitri run-phase discovery first to define the problem clearly.\n\n`
      );
    }
  }

  const inputs = {};
  for (const filename of p.inputs) {
    // IDEA.md always lives at project root — never in the artifacts subdirectory
    const adir = filename === 'IDEA.md' ? '' : artifactsDir;
    const raw = readArtifact(dir, filename, adir);
    const producer = Object.entries(PHASE_DEFS).find(([, x]) => x.artifact === filename);
    if (!raw) {
      const hint = producer ? `\nRun: aitri run-phase ${producer[0]}` : '';
      err(`Missing required file: ${filename}${hint}`);
    }
    inputs[filename] = producer?.[1]?.extractContext ? producer[1].extractContext(raw) : raw;
  }
  for (const filename of (p.optionalInputs || [])) {
    const adir = filename === 'IDEA.md' ? '' : artifactsDir;
    const raw = readArtifact(dir, filename, adir);
    if (raw) inputs[filename] = raw;
  }

  // Feature context injection: phase 1 in a feature sub-pipeline gets parent
  // project's existing FRs so the agent adds only new requirements, not duplicates.
  if (featureRoot && phase === 1) {
    const parentConfig  = loadConfig(featureRoot);
    const parentArtDir  = parentConfig.artifactsDir || '';
    const parentReqs    = readArtifact(featureRoot, '01_REQUIREMENTS.json', parentArtDir);
    if (parentReqs) inputs['PARENT_REQUIREMENTS.json'] = parentReqs;
  }

  let failingTests;
  if (phase === 4) {
    const resultsRaw = readArtifact(dir, '04_TEST_RESULTS.json', artifactsDir);
    if (resultsRaw) {
      try {
        const results = JSON.parse(resultsRaw);
        const failing = results.results?.filter(r => r.status === 'fail') || [];
        if (failing.length) failingTests = failing;
      } catch { /* malformed results — ignore, briefing proceeds without debug mode */ }
    }
  }

  // Gate: if all core phases are approved and agent tries to re-run a core phase,
  // block in non-interactive mode and require confirmation in terminal.
  const CORE_PHASE_NUMS = [1, 2, 3, 4, 5];
  const allCoreApproved = CORE_PHASE_NUMS.every(n => (config.approvedPhases || []).includes(n));
  if (allCoreApproved && CORE_PHASE_NUMS.includes(phase) && !featureRoot) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `\n❌ Pipeline is complete — all phases are approved.\n` +
        `   Re-running Phase ${phase} would clear its approval. Agents cannot do this automatically.\n\n` +
        `   To add new functionality:\n` +
        `     aitri feature init <name>\n\n` +
        `   To re-run Phase ${phase}, do it manually in your terminal.\n`
      );
      process.exit(1);
    }
    process.stdout.write(
      `\n⚠️  Pipeline is complete — all phases are approved.\n` +
      `   Re-running Phase ${phase} will clear its approval.\n\n` +
      `   If you want to add new functionality, use: aitri feature init <name>\n` +
      `   Re-run Phase ${phase} anyway? (y/N): `
    );
    const buf = Buffer.alloc(10);
    const bytes = fs.readSync(0, buf, 0, 10, null);
    const ans = buf.subarray(0, bytes).toString().trim().toLowerCase();
    if (ans !== 'y' && ans !== 'yes') {
      process.stderr.write(`\n❌ Re-run cancelled.\n`);
      process.exit(0);
    }
  }

  const wasApproved = (config.approvedPhases || []).includes(phase);
  config.currentPhase   = phase;
  config.approvedPhases  = (config.approvedPhases  || []).filter(n => n !== phase);
  config.completedPhases = (config.completedPhases || []).filter(n => n !== phase);
  // Re-running an approved phase = drift; fresh first run = no drift
  if (wasApproved) setDriftPhase(config, phase);
  else clearDriftPhase(config, phase);
  saveConfig(dir, config);

  // --guided: run interview before discovery briefing and inject answers as context
  let interviewContext;
  if (guided && phase === 'discovery') {
    if (!process.stdin.isTTY && !_readLine)
      err('--guided requires an interactive terminal (stdin is not a TTY)');
    interviewContext = runDiscoveryInterview(_readLine || null);
  }

  const bpFile = BEST_PRACTICES_FILE[phase];
  const bestPractices = bpFile ? readBestPractices(dir, rootDir, bpFile) : '';

  // Scan idea/ folder — list any assets so the agent can reference them
  const ideaDir = path.join(dir, 'idea');
  let assetsNote = '';
  if (fs.existsSync(ideaDir)) {
    const assets = fs.readdirSync(ideaDir).filter(f => f !== 'README.md');
    if (assets.length) {
      assetsNote = '\n── Additional context (idea/ folder) ──────────────────────────\n' +
        'The following supporting assets are available in the idea/ folder.\n' +
        'Read any that are relevant before producing the artifact.\n\n' +
        assets.map(f => `  idea/${f}`).join('\n') + '\n';
    }
  }

  console.log(p.buildBriefing({ dir, inputs, feedback, failingTests, artifactsBase, bestPractices, interviewContext }));
  if (assetsNote) console.log(assetsNote);

  // Event logged after briefing confirmed — not before (avoids phantom starts on buildBriefing errors)
  appendEvent(config, 'started', phase);
  saveConfig(dir, config);

  const bar = '─'.repeat(60);
  process.stderr.write(
    `\n${bar}\n` +
    ` aitri run-phase printed the briefing above.\n` +
    ` This command does NOT create files — your agent does.\n\n` +
    ` What happens next:\n` +
    `   1. Your AI agent reads the briefing above\n` +
    `   2. The agent creates and saves: ${p.artifact}\n` +
    `   3. Once the file is saved, run: aitri complete ${phase}\n` +
    `${bar}\n`
  );
}
