/**
 * Tests: contained project layout (LAYOUT-1, ADR-049, rc.76)
 * Covers: state.js layout helpers, init's contained contract, pre-init brief
 * absorption, legacy-flat regression, run-phase asset/IDEA resolution in both
 * layouts, feature resolution under aitri/features/, approve's IDEA absorption
 * at the unit path, and the isAitriStatePath SSoT filter.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadConfig, saveConfig,
  productSubdir, ideaContextSubdir, ideaPath, ideaContextDir, backlogMdPath, featuresDir,
} from '../lib/state.js';
import { isAitriStatePath, isFeaturePipelineArtifact } from '../lib/reconcile-patterns.js';
import { cmdInit } from '../lib/commands/init.js';
import { cmdRunPhase } from '../lib/commands/run-phase.js';
import { cmdFeature } from '../lib/commands/feature.js';
import { buildProjectSnapshot } from '../lib/snapshot.js';
import { initFlatProject } from './fixtures.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir(prefix = 'aitri-layout-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function captureAll(fn) {
  let stdout = '';
  let stderr = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const origLog = console.log.bind(console);
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  process.stderr.write = (chunk) => { stderr += chunk; return true; };
  console.log = (...a) => { stdout += a.join(' ') + '\n'; };
  try { fn(); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    console.log = origLog;
  }
  return { stdout, stderr };
}

const noopErr = (msg) => { throw new Error(msg); };
const makeFlagValue = (flags = {}) => (f) => flags[f] || null;

const IDEA_CONTENT = '# My Project\n\nA comprehensive idea that describes the project in detail. '.repeat(8) + '\n';

const FLAT      = {};                       // legacy config-like: no layoutRoot
const CONTAINED = { layoutRoot: 'aitri' };

// ── state.js helpers ──────────────────────────────────────────────────────────

describe('layout helpers (state.js)', () => {
  it('resolve flat paths when layoutRoot is absent', () => {
    assert.equal(productSubdir(FLAT), '');
    assert.equal(ideaContextSubdir(FLAT), 'idea_context');
    assert.equal(ideaPath('/p', FLAT), path.join('/p', 'IDEA.md'));
    assert.equal(ideaContextDir('/p', FLAT), path.join('/p', 'idea_context'));
    assert.equal(backlogMdPath('/p', FLAT), path.join('/p', 'BACKLOG.md'));
    assert.equal(featuresDir('/p', FLAT), path.join('/p', 'features'));
  });

  it('resolve contained paths when layoutRoot is set', () => {
    assert.equal(productSubdir(CONTAINED), path.join('aitri', 'product'));
    assert.equal(ideaContextSubdir(CONTAINED), path.join('aitri', 'product', 'idea_context'));
    assert.equal(ideaPath('/p', CONTAINED), path.join('/p', 'aitri', 'product', 'IDEA.md'));
    assert.equal(backlogMdPath('/p', CONTAINED), path.join('/p', 'aitri', 'BACKLOG.md'));
    assert.equal(featuresDir('/p', CONTAINED), path.join('/p', 'aitri', 'features'));
  });

  it('tolerate null/undefined config (defaults to flat)', () => {
    assert.equal(productSubdir(null), '');
    assert.equal(featuresDir('/p', undefined), path.join('/p', 'features'));
  });
});

// ── isAitriStatePath SSoT filter ──────────────────────────────────────────────

describe('isAitriStatePath (reconcile-patterns.js)', () => {
  it('flat: excludes spec/, .aitri, node_modules, feature artifacts; keeps src', () => {
    const cfg = { artifactsDir: 'spec' };
    assert.equal(isAitriStatePath('spec/01_REQUIREMENTS.json', cfg), true);
    assert.equal(isAitriStatePath('.aitri', cfg), true);
    assert.equal(isAitriStatePath('.aitri.local', cfg), true);
    assert.equal(isAitriStatePath('node_modules/x/y.js', cfg), true);
    assert.equal(isAitriStatePath('features/pay/spec/01_REQUIREMENTS.json', cfg), true);
    assert.equal(isAitriStatePath('features/pay/.aitri', cfg), true);
    assert.equal(isAitriStatePath('src/index.js', cfg), false);
    assert.equal(isAitriStatePath('features/pay/src/index.js', cfg), false,
      'feature SOURCE stays in scope — only its spec/.aitri are pipeline-owned');
  });

  it('flat with empty artifactsDir still excludes the historical spec/ prefix', () => {
    assert.equal(isAitriStatePath('spec/x.json', { artifactsDir: '' }), true);
  });

  it('contained: everything under the container is Aitri-owned; src is not', () => {
    const cfg = { artifactsDir: 'aitri/product/spec', layoutRoot: 'aitri' };
    assert.equal(isAitriStatePath('aitri/product/spec/01_REQUIREMENTS.json', cfg), true);
    assert.equal(isAitriStatePath('aitri/product/IDEA.md', cfg), true);
    assert.equal(isAitriStatePath('aitri/BACKLOG.md', cfg), true);
    assert.equal(isAitriStatePath('aitri/features/pay/spec/x.json', cfg), true);
    assert.equal(isAitriStatePath('src/index.js', cfg), false);
    assert.equal(isAitriStatePath('aitrix/file.js', cfg), false,
      'prefix match must not swallow sibling dirs that merely start with the container name');
  });

  it('isFeaturePipelineArtifact accepts a layoutRoot', () => {
    assert.equal(isFeaturePipelineArtifact('features/pay/spec/x.json'), true);
    assert.equal(isFeaturePipelineArtifact('aitri/features/pay/spec/x.json'), false,
      'without layoutRoot the contained path is not matched (caller passes it)');
    assert.equal(isFeaturePipelineArtifact('aitri/features/pay/spec/x.json', 'aitri'), true);
    assert.equal(isFeaturePipelineArtifact('aitri/features/pay/.aitri', 'aitri'), true);
  });
});

// ── init: the contained contract ──────────────────────────────────────────────

describe('aitri init — contained layout contract (rc.76)', () => {
  it('new projects: layoutRoot + artifactsDir + container tree; root stays clean', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      const cfg = loadConfig(dir);
      assert.equal(cfg.layoutRoot, 'aitri');
      assert.equal(cfg.artifactsDir, 'aitri/product/spec', 'persisted artifactsDir must be POSIX');
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'IDEA.md')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'idea_context', 'README.md')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'spec')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'BACKLOG.md')));
      // The root keeps only .aitri + agent files — no pipeline entries.
      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')));
      assert.ok(!fs.existsSync(path.join(dir, 'spec')));
      assert.ok(!fs.existsSync(path.join(dir, 'idea_context')));
      assert.ok(fs.existsSync(path.join(dir, '.aitri')), '.aitri stays at the project root');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('absorbs a pre-init root IDEA.md into the unit (wizard-before-init flow)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', '# my pre-init brief\n');
      const { stdout } = captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')), 'root brief must be MOVED, not duplicated');
      assert.equal(fs.readFileSync(path.join(dir, 'aitri', 'product', 'IDEA.md'), 'utf8'),
        '# my pre-init brief\n', 'content must be kept verbatim');
      assert.match(stdout, /moved from project root/i);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('re-init on an existing FLAT project keeps the flat layout (no migration by init)', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.75' });
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      const cfg = loadConfig(dir);
      assert.equal(cfg.layoutRoot, undefined, 're-init must not inject layoutRoot into a flat project');
      assert.equal(cfg.artifactsDir, 'spec');
      assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')), 'flat IDEA.md stays at the root');
      assert.ok(!fs.existsSync(path.join(dir, 'aitri')), 'no container is created on a flat project');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── run-phase: both layouts ───────────────────────────────────────────────────

describe('run-phase — layout resolution', () => {
  it('contained: reads IDEA.md from the unit and lists assets with full relative paths', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      writeFile(dir, 'aitri/product/IDEA.md', IDEA_CONTENT);
      writeFile(dir, 'aitri/product/idea_context/mockup.png', 'x');
      const { stdout } = captureAll(() =>
        cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
      );
      assert.ok(stdout.includes('aitri/product/idea_context/mockup.png'),
        'asset paths must be relative to the project dir so the agent can use them literally');
      assert.ok(stdout.length > 200, 'briefing must build (IDEA.md found at the unit path)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('flat (legacy regression): reads IDEA.md from the root and lists idea_context/ as before', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({ projectName: 'T', artifactsDir: 'spec', approvedPhases: [], completedPhases: [] }));
      writeFile(dir, 'IDEA.md', IDEA_CONTENT);
      writeFile(dir, 'idea_context/mockup.png', 'x');
      const { stdout } = captureAll(() =>
        cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
      );
      assert.ok(stdout.includes('idea_context/mockup.png'));
      assert.ok(!stdout.includes('aitri/'), 'flat briefings must not mention the container');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── feature: resolution under aitri/features/ ─────────────────────────────────

describe('feature — contained resolution', () => {
  it('feature init creates aitri/features/<name>/ with a FLAT interior', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      captureAll(() => cmdFeature({ dir, args: ['init', 'payments'], err: noopErr, rootDir: ROOT_DIR }));
      const fdir = path.join(dir, 'aitri', 'features', 'payments');
      assert.ok(fs.existsSync(fdir), 'feature must land under aitri/features/');
      assert.ok(fs.existsSync(path.join(fdir, '.aitri')));
      assert.ok(fs.existsSync(path.join(fdir, 'FEATURE_IDEA.md')));
      assert.ok(fs.existsSync(path.join(fdir, 'feature_context')));
      assert.ok(fs.existsSync(path.join(fdir, 'spec')));
      assert.ok(!fs.existsSync(path.join(dir, 'features')), 'no flat features/ dir at the root');
      const fcfg = loadConfig(fdir);
      assert.equal(fcfg.artifactsDir, 'spec', 'feature interior stays flat');
      assert.equal(fcfg.layoutRoot, undefined, 'a feature config never carries layoutRoot');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('feature run-phase 1 surfaces the contained parent idea_context with a correct relative pointer', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      writeFile(dir, 'aitri/product/idea_context/schema.pdf', 'x');
      captureAll(() => cmdFeature({ dir, args: ['init', 'payments'], err: noopErr, rootDir: ROOT_DIR }));
      writeFile(dir, 'aitri/features/payments/FEATURE_IDEA.md', IDEA_CONTENT);
      const { stdout } = captureAll(() =>
        cmdFeature({ dir, args: ['run-phase', 'payments', '1'], err: noopErr, rootDir: ROOT_DIR })
      );
      assert.ok(stdout.includes('../../product/idea_context/schema.pdf'),
        'parent-context pointer must hop to aitri/product/, not the flat ../../idea_context');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('snapshot discovers feature pipelines under aitri/features/', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      captureAll(() => cmdFeature({ dir, args: ['init', 'payments'], err: noopErr, rootDir: ROOT_DIR }));
      const snap = buildProjectSnapshot(dir, { cliVersion: '2.0.0-rc.76' });
      const feature = snap.pipelines.find(p => p.scope === 'feature:payments');
      assert.ok(feature, 'contained feature must appear in the snapshot');
      assert.equal(snap.pipelines.find(p => p.scopeType === 'root').layoutRoot, 'aitri',
        'pipeline entries expose layoutRoot (additive field)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── approve: IDEA absorption at the unit path ─────────────────────────────────

describe('approve 1 — IDEA.md absorption in a contained project', () => {
  it('absorbs aitri/product/IDEA.md into 01_REQUIREMENTS.json#original_brief and unlinks it', async () => {
    const { cmdApprove } = await import('../lib/commands/approve.js');
    const dir = tmpDir();
    try {
      const ideaContent = '# Contained Project\n\nThe brief to absorb.\n';
      writeFile(dir, '.aitri', JSON.stringify({
        projectName: 'T', layoutRoot: 'aitri', artifactsDir: 'aitri/product/spec',
        approvedPhases: [], completedPhases: [1],
      }));
      writeFile(dir, 'aitri/product/IDEA.md', ideaContent);
      writeFile(dir, 'aitri/product/spec/01_REQUIREMENTS.json', '{"project_name":"T","functional_requirements":[]}');
      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.ok(!fs.existsSync(path.join(dir, 'aitri', 'product', 'IDEA.md')),
        'the unit brief must be deleted after absorption');
      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'aitri', 'product', 'spec', '01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(updated.original_brief, ideaContent, 'brief content lands verbatim in original_brief');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── snapshot: uncounted-changes filter is layout-aware ────────────────────────

describe('snapshot detectUncountedChanges filter inputs', () => {
  it('contained pipeline entries carry artifactsDir + layoutRoot for the SSoT filter', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.76' }));
      const snap = buildProjectSnapshot(dir, { cliVersion: '2.0.0-rc.76' });
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      // The exact fields isAitriStatePath consumes:
      assert.equal(isAitriStatePath('aitri/product/spec/01_REQUIREMENTS.json', root), true);
      assert.equal(isAitriStatePath('aitri/features/pay/spec/x.json', root), true);
      assert.equal(isAitriStatePath('src/index.js', root), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── emission surface (rc.77): rendered agent files + briefings ────────────────

describe('emission — rendered agent files (rc.77)', () => {
  it('contained init: agent files carry the contained paths, no unrendered braces', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.77' }));
      for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
        const content = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.ok(content.includes('aitri/product/idea_context'), `${f} must name the contained context dir`);
        assert.ok(content.includes('aitri/product/spec/BUGS.json'), `${f} must name the contained bugs path`);
        assert.ok(content.includes('aitri/features/<name>/'), `${f} must name the contained features dir`);
        assert.ok(content.includes('aitri/BACKLOG.md'), `${f} must name the contained backlog`);
        assert.ok(!content.includes('{{'), `${f} must have no unrendered placeholders`);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('flat fixture: agent files keep the flat paths (legacy regression)', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.75' });
      const content = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
      assert.ok(content.includes('`idea_context/`'), 'flat agents read the flat context dir');
      assert.ok(content.includes('spec/BUGS.json'), 'flat bugs path');
      assert.ok(!content.includes('aitri/product'), 'no contained paths leak into flat files');
      assert.ok(!content.includes('{{'), 'no unrendered placeholders');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('IDEA.md template renders the layout-resolved asset examples', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.77' }));
      const idea = fs.readFileSync(path.join(dir, 'aitri', 'product', 'IDEA.md'), 'utf8');
      assert.ok(idea.includes('aitri/product/idea_context/screens/home.png'),
        'contained IDEA.md examples must use the contained context path');
      assert.ok(!idea.includes('{{'), 'no unrendered placeholders in IDEA.md');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('emission — briefing paths (rc.77)', () => {
  it('phase-1 briefing names the layout-resolved context dir in the provenance rule', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.77' }));
      writeFile(dir, 'aitri/product/IDEA.md', IDEA_CONTENT);
      const { stdout } = captureAll(() =>
        cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
      );
      assert.ok(stdout.includes('`aitri/product/idea_context/` folder'),
        'contained provenance rule must point at the contained context dir');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('feature phase-1 briefing names feature_context/ (flat feature interior)', () => {
    const dir = tmpDir();
    try {
      captureAll(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.77' }));
      captureAll(() => cmdFeature({ dir, args: ['init', 'pay'], err: noopErr, rootDir: ROOT_DIR }));
      writeFile(dir, 'aitri/features/pay/FEATURE_IDEA.md', IDEA_CONTENT);
      const { stdout } = captureAll(() =>
        cmdFeature({ dir, args: ['run-phase', 'pay', '1'], err: noopErr, rootDir: ROOT_DIR })
      );
      assert.ok(stdout.includes('`feature_context/` folder'),
        'feature provenance rule points at the feature-local context dir');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('build briefing resolves FEATURES_DIR through the layout', async () => {
    const { PHASE_DEFS } = await import('../lib/phases/index.js');
    const minimalInputs = {
      '01_REQUIREMENTS.json': JSON.stringify({ functional_requirements: [] }),
      '02_SYSTEM_DESIGN.md': '# design',
      '03_TEST_CASES.json': JSON.stringify({ test_cases: [] }),
    };
    const contained = PHASE_DEFS[4].buildBriefing({
      dir: '/p', inputs: minimalInputs, artifactsBase: '/p/aitri/product/spec',
      config: { layoutRoot: 'aitri' },
    });
    assert.ok(contained.includes('aitri/features/<name>/'), 'contained build briefing names aitri/features/');
    const flat = PHASE_DEFS[4].buildBriefing({
      dir: '/p', inputs: minimalInputs, artifactsBase: '/p/spec', config: {},
    });
    assert.ok(flat.includes('(features/<name>/)'), 'flat build briefing keeps features/');
    assert.ok(!flat.includes('aitri/features'), 'no contained path in flat briefing');
  });
});
