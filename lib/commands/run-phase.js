/**
 * Module: Command — run-phase
 * Purpose: Print phase briefing to stdout. Agent reads and acts on it.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { loadConfig, saveConfig, readArtifact, appendEvent, setDriftPhase, clearDriftPhase, hasDrift, cascadeInvalidate, productSubdir, ideaContextDir, ideaContextSubdir } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
import { runDiscoveryInterview, buildDiscoveryInterviewBriefing } from './wizard.js';
import { scopeTokens } from '../scope.js';
import { listAssets } from '../context-assets.js';

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

export function cmdRunPhase({ dir, args, flagValue, err, rootDir, featureRoot, scopeName, _readLine }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
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
    // Word-count warning only applies on first run — re-runs use 01_REQUIREMENTS.json
    // as input, IDEA.md is irrelevant by design once that exists.
    const hasCurrentReqs = !!readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
    if (!hasCurrentReqs) {
      // Seed per scope (rc.80): features read FEATURE_IDEA.md directly — no copy.
      const idea = (featureRoot
        ? readArtifact(dir, 'FEATURE_IDEA.md')
        : readArtifact(dir, 'IDEA.md', productSubdir(config))) || '';
      const wordCount = idea.trim().split(/\s+/).filter(Boolean).length;
      const hasDiscovery = !!readArtifact(dir, '00_DISCOVERY.md', artifactsDir);
      if (wordCount < 100 && !hasDiscovery) {
        process.stderr.write(
          `[aitri] Warning: ${featureRoot ? 'FEATURE_IDEA.md' : 'IDEA.md'} is short (${wordCount} words).\n` +
          `  A richer idea produces better requirements.\n` +
          `  Optional: run aitri run-phase discovery first to define the problem clearly.\n\n`
        );
      }
    }
  }

  // PHASE_DEFS name the seed input 'IDEA.md'; resolve it per scope (rc.80):
  // root unit → IDEA.md at the unit root, feature → FEATURE_IDEA.md (no copy).
  // The inputs MAP keeps the 'IDEA.md' key so phase templates stay scope-blind.
  const readSeedAware = (filename) => {
    if (filename !== 'IDEA.md') return readArtifact(dir, filename, artifactsDir);
    return featureRoot
      ? readArtifact(dir, 'FEATURE_IDEA.md')
      : readArtifact(dir, 'IDEA.md', productSubdir(config));
  };
  const inputs = {};
  for (const filename of p.inputs) {
    const raw = readSeedAware(filename);
    const producer = Object.entries(PHASE_DEFS).find(([, x]) => x.artifact === filename);
    if (!raw) {
      const hint = producer ? `\nRun: aitri run-phase ${producer[0]}` : '';
      const shown = filename === 'IDEA.md' && featureRoot ? 'FEATURE_IDEA.md' : filename;
      err(`Missing required file: ${shown}${hint}`);
    }
    inputs[filename] = producer?.[1]?.extractContext ? producer[1].extractContext(raw) : raw;
  }
  for (const filename of (p.optionalInputs || [])) {
    const raw = readSeedAware(filename);
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

  const wasApproved  = (config.approvedPhases  || []).includes(phase);
  const wasCompleted = (config.completedPhases || []).includes(phase);
  // Idempotent re-read (finance-dashboard canary 2026-06-05): if the phase is
  // already completed/approved AND its artifact is unchanged on disk, re-printing
  // the briefing is a READ — it must NOT clear completion/approval state, set a
  // drift flag, or log a `started` event. Re-reading instructions silently undoing
  // progress was the defect; only a genuine re-do (artifact changed → hasDrift) may
  // reset state. hasDrift compares the on-disk artifact to the hash stamped at
  // complete/approve, so an unedited artifact reads as unchanged.
  const idempotentReread = (wasApproved || wasCompleted) &&
    !!p.artifact && !hasDrift(dir, config, phase, p.artifact);

  // Gate: if all core phases are approved and agent tries to re-run a core phase,
  // block in non-interactive mode and require confirmation in terminal. Skipped on
  // an idempotent re-read — nothing is cleared, so there is nothing to guard.
  const CORE_PHASE_NUMS = [1, 2, 3, 4, 5];
  const allCoreApproved = CORE_PHASE_NUMS.every(n => (config.approvedPhases || []).includes(n));
  if (!idempotentReread && allCoreApproved && CORE_PHASE_NUMS.includes(phase) && !featureRoot) {
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
    const ans = readStdinSync(10).trim().toLowerCase();
    if (ans !== 'y' && ans !== 'yes') {
      process.stderr.write(`\n❌ Re-run cancelled.\n`);
      process.exit(0);
    }
  }

  if (idempotentReread) {
    process.stderr.write(
      `[aitri] Phase ${phase} is already ${wasApproved ? 'approved' : 'completed'} and its artifact is unchanged — ` +
      `re-printed the briefing without resetting its state.\n`
    );
  } else {
    config.currentPhase    = phase;
    config.approvedPhases  = (config.approvedPhases  || []).filter(n => n !== phase);
    config.completedPhases = (config.completedPhases || []).filter(n => n !== phase);
    // Re-running an approved phase = drift; fresh first run = no drift
    let cascaded = [];
    if (wasApproved) {
      setDriftPhase(config, phase);
      // TPA-1: re-opening an APPROVED phase makes every downstream phase stale —
      // they were built/approved against the version we are now re-deriving.
      // Invalidate them HERE, at re-open. If we don't, the later re-approval sees
      // the phase already out of approvedPhases (we just removed it above), so
      // approve's `wasAlreadyApproved` cascade trigger is false AND complete's
      // `wasApproved` trigger is false too — the cascade falls through the crack
      // and downstream silently stays "approved" over a changed upstream, so the
      // pipeline reports "deployable" over a spec the build/tests no longer cover.
      // (complete.js already documents that run-phase performs this cascade; this
      // is where that assumption is made real.) The idempotent re-read path above
      // never reaches here, so an unchanged re-read still resets nothing.
      cascaded = cascadeInvalidate(config, phase);
    } else {
      clearDriftPhase(config, phase);
    }
    saveConfig(dir, config);
    // Genuine re-do of a previously completed/approved phase (artifact changed, or
    // drift already flagged): warn loudly so the operator knows progress was reset.
    if (wasApproved || wasCompleted)
      process.stderr.write(
        `[aitri] ⚠ Phase ${phase} was ${wasApproved ? 'approved' : 'completed'} and its artifact changed — ` +
        `re-running cleared that state; re-${wasApproved ? 'approve' : 'complete'} after editing.\n`
      );
    if (cascaded.length)
      process.stderr.write(
        `[aitri] ⚠ Downstream phases were built on the old ${p.alias || `phase ${phase}`} — reset: ` +
        `${cascaded.map(c => { const d = PHASE_DEFS[c]; return d ? (d.alias || c) : c; }).join(', ')}.\n` +
        `   Re-derive each after re-approving this phase: ` +
        `aitri ${sv}run-phase${sa} <phase> → complete → approve.\n`
      );
  }

  // --guided: run the discovery interview before the briefing.
  //  - interactive TTY (or a test-injected reader): collect answers live and inject
  //    them as the briefing's primary-source Interview Context.
  //  - agent mode (no TTY): Aitri cannot prompt the user, so print a briefing telling
  //    the agent to conduct the interview itself, then fall through to the discovery
  //    briefing. (Phase 5b: --guided is no longer dead in agent mode — it used to
  //    hard-error here, killing the strongest elicitation primitive in the only real
  //    operating mode.)
  let interviewContext;
  if (guided && phase === 'discovery') {
    if (!process.stdin.isTTY && !_readLine) {
      console.log(buildDiscoveryInterviewBriefing());
    } else {
      interviewContext = runDiscoveryInterview(_readLine || null);
    }
  }

  // TPA-11: if this phase was reset by a real upstream change (it is cascade-pending),
  // show WHAT changed in the requirements since it was last approved — the FR ids
  // added/removed vs the snapshot taken at its last approval. rc.58 forces the
  // re-derivation; this DIRECTS it, so the agent does not re-derive blind and re-omit
  // the FR that was just added. Mechanical id-set diff, advisory (the fr_coverage gate
  // at verify-complete remains the hard enforcement for MUST FRs).
  if ((config.cascadedPhases || []).map(String).includes(String(phase))) {
    const snap = (config.frSnapshots || {})[String(phase)];
    if (Array.isArray(snap)) {
      const curReqs = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
      if (curReqs) {
        try {
          const cur     = new Set((JSON.parse(curReqs).functional_requirements || []).map(fr => fr.id).filter(Boolean));
          const prev    = new Set(snap);
          const added   = [...cur].filter(id => !prev.has(id));
          const removed = [...prev].filter(id => !cur.has(id));
          if (added.length || removed.length) {
            let msg = `\n[aitri] ⚠ Requirements changed since this phase was last approved — re-derive against the delta, do not re-omit it:\n`;
            if (added.length)   msg += `   + added:   ${added.join(', ')}  (must be covered here)\n`;
            if (removed.length) msg += `   - removed: ${removed.join(', ')}  (drop any coverage of these)\n`;
            process.stderr.write(msg + '\n');
          }
        } catch { /* malformed requirements — skip the delta hint */ }
      }
    }
  }

  const bpFile = BEST_PRACTICES_FILE[phase];
  const bestPractices = bpFile ? readBestPractices(dir, rootDir, bpFile) : '';

  // The context folder is injected ONLY in the spec-DEFINITION phases (discovery →
  // tests), where reference assets are direct input to deciding WHAT to build. The
  // EXECUTION phases (build 4, deploy 5, review) work from the approved artifacts —
  // the source of truth — so raw context is not injected there. It stays on disk and
  // the agent can read it on request (e.g. to check build fidelity against a mockup).
  // This also bounds staleness: assets only surface during spec definition, when they
  // are fresh and relevant — they never leak into late-phase briefings.
  const CONTEXT_PHASES = new Set(['discovery', 1, 'ux', 2, 3]);
  let assetsNote = '';
  if (CONTEXT_PHASES.has(phase)) {
    // Scope-aware folder (mirrors the seed file at each level): root projects use
    // idea_context/ (pairs with IDEA.md; under aitri/product/ in a contained
    // layout), feature sub-pipelines use feature_context/ (features stay flat
    // internally). Display paths are relative to the pipeline dir so the agent
    // can use them literally in BOTH layouts.
    const ctxDir = featureRoot ? path.join(dir, 'feature_context') : ideaContextDir(dir, config);
    const ctxRel = path.relative(dir, ctxDir).replace(/\\/g, '/');
    if (fs.existsSync(ctxDir)) {
      const assets = fs.readdirSync(ctxDir).filter(f => f !== 'README.md');
      if (assets.length) {
        // ADV-0622-08: "approved artifacts are the source of truth" is wrong at Phase 1 /
        // discovery — nothing upstream is approved yet, so this material IS the primary
        // input. Make the framing phase-aware, and call out ADOPTION_AUDIT.md by name (an
        // adoption's existing-code reality the agent must ground its output in, not just IDEA.md).
        const groundingFirst = phase === 'discovery' || phase === 1;
        const truthLine = groundingFirst
          ? `This is PRIMARY input for this phase — ground your output in it (no upstream artifact is approved yet).`
          : `The approved upstream artifacts are the source of truth — read these only as reference, and ignore anything superseded as the project evolved.`;
        const auditLine = assets.includes('ADOPTION_AUDIT.md')
          ? `\n${ctxRel}/ADOPTION_AUDIT.md is the adoption audit — its findings are the EXISTING code's reality; ground this phase in them, don't contradict them silently.`
          : '';
        assetsNote = `\n── Additional context (${ctxRel}/ folder) ──────────────\n` +
          `Supporting reference material is available in ${ctxRel}/. ${truthLine}${auditLine}\n\n` +
          assets.map(f => `  ${ctxRel}/${f}`).join('\n') + '\n';
      }
    }
    // TPA-4: a feature sub-pipeline only scans its own feature_context/. The parent
    // project's idea_context/ holds the original source material (schema, blueprints,
    // mockups) that the DISTILLED parent FRs may not fully capture — so if the parent
    // capture was lossy, the feature has no path back to the source. Surface it as a
    // read-only POINTER (not a copy): no duplication, no staleness, feature_context/
    // stays the curated authoritative set, but the source is one hop away.
    if (featureRoot) {
      const parentConfig  = loadConfig(featureRoot);
      const parentCtxSub  = ideaContextSubdir(parentConfig);
      const parentAssets  = listAssets(featureRoot, parentCtxSub);
      if (parentAssets.length) {
        const parentCtxRel = path.relative(dir, path.join(featureRoot, parentCtxSub)).replace(/\\/g, '/');
        assetsNote += `\n── Parent project source material (idea_context/ — reference only) ──\n` +
          `The parent project's idea_context/ has ${parentAssets.length} asset(s). The approved parent\n` +
          `requirements are the source of truth, but the distilled FRs may not capture every detail.\n` +
          `If this feature touches an area these cover, read them so you don't re-omit that detail:\n\n` +
          parentAssets.map(f => `  ${parentCtxRel}/${f}`).join('\n') + '\n';
      }
    }
    // Loud migration hint (rename): pre-rename projects keep assets in idea/, which is
    // no longer scanned. Tell the operator rather than silently dropping context.
    const legacyIdeaDir = path.join(dir, 'idea');
    if (fs.existsSync(legacyIdeaDir)) {
      const legacy = fs.readdirSync(legacyIdeaDir).filter(f => f !== 'README.md');
      if (legacy.length)
        process.stderr.write(
          `[aitri] Note: ${legacy.length} asset(s) found in idea/ — that folder is no longer scanned ` +
          `(renamed to ${ctxRel}/).\n  Move them so the assets appear in briefings:  mv idea/* ${ctxRel}/\n\n`
        );
    }
  }

  console.log(p.buildBriefing({ dir, inputs, feedback, failingTests, artifactsBase, bestPractices, interviewContext, config, featureRoot, scopeVerb: sv, scopeArg: sa }));
  if (assetsNote) console.log(assetsNote);

  // Event logged after briefing confirmed — not before (avoids phantom starts on buildBriefing errors).
  // Skipped on an idempotent re-read: a `started` event would imply the phase was re-opened.
  if (!idempotentReread) {
    appendEvent(config, 'started', phase);
    saveConfig(dir, config);
  }

  const bar = '─'.repeat(60);
  process.stderr.write(
    `\n${bar}\n` +
    ` aitri ${sv}run-phase${sa} printed the briefing above.\n` +
    ` This command does NOT create files — your agent does.\n\n` +
    ` What happens next:\n` +
    `   1. Your AI agent reads the briefing above\n` +
    `   2. The agent creates and saves: ${p.artifact}\n` +
    `   3. Once the file is saved, run: aitri ${sv}complete${sa} ${phase}\n` +
    `${bar}\n`
  );
}
