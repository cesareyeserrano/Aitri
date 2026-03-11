/**
 * Module: Command — run-phase
 * Purpose: Print phase briefing to stdout. Agent reads and acts on it.
 */

import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, saveConfig, readArtifact } from '../state.js';

export function cmdRunPhase({ dir, args, flagValue, err }) {
  const raw      = args[0];
  const phase    = OPTIONAL_PHASES.includes(raw) ? raw : parseInt(raw);
  const feedback = flagValue('--feedback');
  const p        = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri run-phase <1-5|ux|discovery|review> [--feedback "text"]`);

  if (phase === 'review') {
    const config = loadConfig(dir);
    if (!(config.approvedPhases || []).includes(4)) {
      err(`Code review requires Phase 4 to be approved first.\nRun: aitri approve 4`);
    }
  }

  if (phase === 5) {
    const config = loadConfig(dir);
    if (!config.verifyPassed) {
      err(`Phase 5 requires test verification first.\nRun: aitri verify-run  →  aitri verify-complete`);
    }
  }

  if (phase === 1) {
    const idea = readArtifact(dir, 'IDEA.md') || '';
    const wordCount = idea.trim().split(/\s+/).filter(Boolean).length;
    const hasDiscovery = !!readArtifact(dir, '00_DISCOVERY.md');
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
    const raw = readArtifact(dir, filename);
    if (!raw) err(`Missing required file: ${filename}\nRun previous phases first.`);
    const producer = Object.values(PHASE_DEFS).find(x => x.artifact === filename);
    inputs[filename] = producer?.extractContext ? producer.extractContext(raw) : raw;
  }
  for (const filename of (p.optionalInputs || [])) {
    const raw = readArtifact(dir, filename);
    if (raw) inputs[filename] = raw;
  }

  let failingTests;
  if (phase === 4) {
    const resultsRaw = readArtifact(dir, '04_TEST_RESULTS.json');
    if (resultsRaw) {
      try {
        const results = JSON.parse(resultsRaw);
        const failing = results.results?.filter(r => r.status === 'fail') || [];
        if (failing.length) failingTests = failing;
      } catch { /* malformed results — ignore, briefing proceeds without debug mode */ }
    }
  }

  const config = loadConfig(dir);
  config.currentPhase   = phase;
  config.approvedPhases  = (config.approvedPhases  || []).filter(n => n !== phase);
  config.completedPhases = (config.completedPhases || []).filter(n => n !== phase);
  saveConfig(dir, config);

  console.log(p.buildBriefing({ dir, inputs, feedback, failingTests }));

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
