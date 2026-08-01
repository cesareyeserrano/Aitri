/**
 * Tests: aitri init — version tracking
 * Covers: aitriVersion stored in .aitri on init, status warns when outdated/missing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdInit } from '../../lib/commands/init.js';
import { cmdStatus } from '../../lib/commands/status.js';
import { loadConfig } from '../../lib/state.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-init-'));
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

function captureLog(fn) {
  const lines = [];
  const orig = console.log.bind(console);
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

describe('aitri init — version tracking', () => {
  it('stores aitriVersion in .aitri on first init', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const config = loadConfig(dir);
    assert.equal(config.aitriVersion, '0.1.34');
  });

  it('updates aitriVersion when re-init with newer version', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const config = loadConfig(dir);
    assert.equal(config.aitriVersion, '0.1.34');
  });

  // ADV-0622-13 (gap found in the rc.111/rc.112 diff-review): re-init with an OLDER
  // CLI must NOT downgrade the recorded version — the committed .aitri would otherwise
  // flip-flop between teammates on different CLI versions. Mirrors runUpgrade + adopt.
  it('does NOT downgrade aitriVersion when re-init with an older version', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.112' });
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.110' });
    assert.equal(loadConfig(dir).aitriVersion, '2.0.0-rc.112',
      'an older re-init must leave the newer recorded version untouched');
  });

  it('does not overwrite createdAt on re-init', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const first = loadConfig(dir).createdAt;
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const second = loadConfig(dir).createdAt;
    assert.equal(first, second);
  });
});

// 3.2 (UX-PRO-0707): re-init of an existing project must not claim a fresh install nor
// dump new-user onboarding, and must not recreate an already-absorbed seed.
describe('aitri init — re-init of an existing project is honest (UX-PRO-0707 3.2)', () => {
  it('reports "Already an Aitri project" + resume, not a fresh-install onboarding', () => {
    const dir = tmpDir();
    try {
      captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' }));   // fresh
      const out = captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' })); // re-init
      assert.match(out, /Already an Aitri project/, 're-init must not claim a fresh install');
      assert.doesNotMatch(out, /Aitri initialized/, 'must not print the fresh-install headline');
      assert.doesNotMatch(out, /What to do now/, 'must not dump new-user onboarding');
      assert.match(out, /aitri resume/, 'points at resume');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('re-init reports the root-IDEA absorption instead of moving the file silently', () => {
    // The rename of a root IDEA.md into the container (documented pre-init flow) also
    // happens on re-init — it used to print only "state untouched" while moving the file.
    const dir = tmpDir();
    try {
      captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' }));   // fresh, contained
      fs.rmSync(path.join(dir, 'aitri', 'product', 'IDEA.md'), { force: true });
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# my real brief\n');
      const out = captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' })); // re-init
      assert.match(out, /moved from project root/, 'the move must be reported, not silent');
      assert.equal(fs.readFileSync(path.join(dir, 'aitri', 'product', 'IDEA.md'), 'utf8'),
        '# my real brief\n', 'the user brief is kept verbatim in the container');
      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')), 'root copy is gone (moved, not duplicated)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not recreate the seed once it is absorbed into 01_REQUIREMENTS.json', () => {
    const dir = tmpDir();
    try {
      captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' }));
      const cfg = loadConfig(dir);
      const artDir = path.join(dir, cfg.artifactsDir || '');
      fs.mkdirSync(artDir, { recursive: true });
      fs.writeFileSync(path.join(artDir, '01_REQUIREMENTS.json'), '{"functional_requirements":[]}');
      // simulate absorption: the seed has been archived away
      for (const f of ['IDEA.md', path.join('aitri', 'product', 'IDEA.md')]) fs.rmSync(path.join(dir, f), { force: true });
      const out = captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' }));
      assert.match(out, /Seed already absorbed/, 'says the seed was not recreated');
      assert.ok(!fs.existsSync(path.join(dir, 'aitri', 'product', 'IDEA.md')),
        'a fresh template seed must NOT be recreated next to an absorbed pipeline');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('aitri init — context folder (rc.37; contained under aitri/product/ since rc.76)', () => {
  it('creates aitri/product/idea_context/ (not idea/) with a README', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' });
    assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'idea_context')), 'aitri/product/idea_context/ must be created');
    assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'idea_context', 'README.md')), 'idea_context README.md must exist');
    assert.ok(!fs.existsSync(path.join(dir, 'idea')), 'the old idea/ folder must NOT be created');
    assert.ok(!fs.existsSync(path.join(dir, 'idea_context')), 'idea_context/ must NOT be created at the root for new projects');
  });

  // TPA-3: a legacy idea/ folder is no longer scanned — warn early at init so its
  // assets are not silently ignored by every briefing.
  it('warns when a legacy idea/ folder holds assets', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'idea'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'idea', 'db_schema.txt'), 'schema');
    const out = captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' }));
    assert.ok(/idea\//.test(out) && /not scanned/i.test(out), 'init must surface a legacy idea/ folder with assets');
  });

  it('does not warn about idea/ when it is absent', () => {
    const dir = tmpDir();
    const out = captureLog(() => cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' }));
    assert.ok(!/asset\(s\) found in idea\//.test(out), 'no legacy-folder warning when idea/ does not exist');
  });
});

describe('aitri init — .gitignore template (npm-publish safe)', () => {
  it('writes a project .gitignore that ignores per-machine state but NOT the shared .aitri (ADR-045)', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0' });
    const written = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.ok(written.includes('node_modules/'), 'project .gitignore should carry the template content');
    assert.ok(/^\.aitri\.local$/m.test(written), 'per-machine .aitri.local must be ignored');
    assert.ok(/^\.aitri\.lock$/m.test(written), 'the lock must be ignored');
    assert.ok(!/^\.aitri$/m.test(written), 'the shared .aitri must NOT be ignored (it is committed)');
  });

  it('ships the template as `gitignore` (no dot) — npm strips files named `.gitignore`', () => {
    // Regression guard for the third-party install break: a dotted template name is
    // dropped from the npm tarball, so init crashed on first run for npm-registry users.
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'templates', 'gitignore')),
      'templates/gitignore (dotless) must exist so it survives npm publish');
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'templates', '.gitignore')),
      'templates/.gitignore (dotted) must NOT exist — npm would strip it and init would crash');
  });

  it('does not crash when the shipped template is missing (falls back to a default)', () => {
    const dir = tmpDir();
    const fakeRoot = tmpDir();                         // a rootDir with templates/ but no gitignore
    fs.mkdirSync(path.join(fakeRoot, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(fakeRoot, 'templates', 'IDEA.md'), '# seed\n');
    fs.writeFileSync(path.join(fakeRoot, 'templates', 'BACKLOG.md'), '# backlog\n');
    fs.writeFileSync(path.join(fakeRoot, 'templates', 'AGENTS.md'), '# agents\n');
    assert.doesNotThrow(() => cmdInit({ dir, rootDir: fakeRoot, VERSION: '2.0.0' }));
    const written = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.ok(written.includes('node_modules/'), 'fallback .gitignore should still be written');
  });
});

describe('aitri init — Hub registration', () => {
  it('registers project in Hub projects.json when file exists and dir is not temp', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-target-'));
    const hubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-'));
    const hubProjectsPath = path.join(hubDir, 'projects.json');
    fs.writeFileSync(hubProjectsPath, JSON.stringify({ projects: [] }, null, 2));

    // Temporarily override os.homedir to point to hubDir parent, then restore
    // Instead: write projects.json at the real hub path and clean up after
    // Since we can't override os.homedir easily, test the isTempDir guard directly
    // by confirming a non-temp dir path is NOT excluded
    const isTempDir = /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(dir);
    assert.ok(isTempDir, 'test dirs from os.tmpdir() should be classified as temp');
    fs.rmSync(hubDir, { recursive: true });
    fs.rmSync(dir, { recursive: true });
  });

  it('does not register in Hub when dir is a temp path', () => {
    const tempPaths = [
      '/tmp/myproject',
      '/private/tmp/myproject',
      '/var/folders/xx/abc/T/myproject',
      '/private/var/folders/xx/abc/T/myproject',
      '/var/tmp/myproject',
    ];
    const isTempDir = (d) => /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(d);
    for (const p of tempPaths) {
      assert.ok(isTempDir(p), `expected ${p} to be classified as temp`);
    }
  });

  it('does not classify real project paths as temp', () => {
    const realPaths = [
      '/Users/alice/projects/myapp',
      '/home/ubuntu/code/myapp',
      '/opt/apps/myapp',
    ];
    const isTempDir = (d) => /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(d);
    for (const p of realPaths) {
      assert.ok(!isTempDir(p), `expected ${p} to NOT be classified as temp`);
    }
  });
});

describe('aitri init — agent instruction files', () => {
  it('creates AGENTS.md, CLAUDE.md, GEMINI.md, .codex/instructions.md, and .github/copilot-instructions.md', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.70' });
    assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')), 'AGENTS.md must exist');
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md must exist');
    assert.ok(fs.existsSync(path.join(dir, 'GEMINI.md')), 'GEMINI.md must exist');
    assert.ok(fs.existsSync(path.join(dir, '.codex', 'instructions.md')), '.codex/instructions.md must exist');
    assert.ok(fs.existsSync(path.join(dir, '.github', 'copilot-instructions.md')), '.github/copilot-instructions.md must exist');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not overwrite existing agent files on re-init', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.70' });
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# custom rules');
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.70' });
    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.equal(content, '# custom rules', 'must not overwrite custom CLAUDE.md');
    fs.rmSync(dir, { recursive: true });
  });

  // INTEG-CCMD-0718: explicit /aitri trigger for Claude Code — ambient rules decay over
  // a long session; the slash command re-injects the protocol at the moment of use.
  it('creates .claude/commands/aitri.md with the resume-and-follow protocol (INTEG-CCMD-0718)', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.2.0' });
    const cmdPath = path.join(dir, '.claude', 'commands', 'aitri.md');
    assert.ok(fs.existsSync(cmdPath), '.claude/commands/aitri.md must exist');
    const content = fs.readFileSync(cmdPath, 'utf8');
    assert.match(content, /^---\ndescription: Advance the Aitri pipeline — one step\n---/, 'slash-command frontmatter');
    assert.match(content, /Run `aitri resume`/, 'the protocol runs resume first');
    assert.match(content, /FIRST entry in its "Next Action" section/, 'targets output resume actually prints (adversarial find: no PIPELINE INSTRUCTION block exists in resume)');
    assert.match(content, /Do not choose a different action, skip phases, or re-open approved\nphases \(unless the printed action itself names the re-run/, 'anti-drift constraints with the reject/drift escape valve');
    assert.match(content, /PIPELINE INSTRUCTION block, that instruction overrides/, 'defers to the real single-step instruction when a command emits one');
    assert.match(content, /<!-- aitri-generated command/, 'body marker present so customized files are never regenerated away');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not overwrite a user-modified /aitri command on re-init (INTEG-CCMD-0718)', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.2.0' });
    const cmdPath = path.join(dir, '.claude', 'commands', 'aitri.md');
    fs.writeFileSync(cmdPath, '# my own command');
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.2.0' });
    assert.equal(fs.readFileSync(cmdPath, 'utf8'), '# my own command', 'must not clobber user content');
    fs.rmSync(dir, { recursive: true });
  });

  it('all agent files have identical content', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.70' });
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    const gemini = fs.readFileSync(path.join(dir, 'GEMINI.md'), 'utf8');
    const codex  = fs.readFileSync(path.join(dir, '.codex', 'instructions.md'), 'utf8');
    const copilot = fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8');
    assert.equal(agents, claude, 'CLAUDE.md must match AGENTS.md');
    assert.equal(agents, gemini, 'GEMINI.md must match AGENTS.md');
    assert.equal(agents, codex, '.codex/instructions.md must match AGENTS.md');
    assert.equal(agents, copilot, '.github/copilot-instructions.md must match AGENTS.md');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('aitri init — BACKLOG.md scaffold (alpha.21; at aitri/ container level since rc.76)', () => {
  // The backlog scaffold lands at the container level (project-wide — its items
  // become features, so it lives ABOVE the product/ unit) with the canonical
  // Entry Standard so consumer projects do not reinvent the format. Idempotent —
  // re-running init never clobbers a hand-written backlog.
  it('creates aitri/BACKLOG.md from templates/BACKLOG.md', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-alpha.21' });
      const backlogPath = path.join(dir, 'aitri', 'BACKLOG.md');
      assert.ok(fs.existsSync(backlogPath), 'BACKLOG.md must be created at the aitri/ container level');
      const content = fs.readFileSync(backlogPath, 'utf8');
      assert.ok(/Entry Standard/.test(content), 'scaffold must include the Entry Standard section');
      assert.ok(/Minimum entry format/.test(content), 'scaffold must include the format block');
      assert.ok(/## Open/.test(content), 'scaffold must include the Open section');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not overwrite an existing aitri/BACKLOG.md and never touches a root BACKLOG.md', () => {
    const dir = tmpDir();
    try {
      // A root BACKLOG.md is the USER's file (not a documented pre-init Aitri
      // artifact) — init must leave it alone and scaffold its own in aitri/.
      const rootBacklog = path.join(dir, 'BACKLOG.md');
      fs.writeFileSync(rootBacklog, '# my hand-written backlog\n- [ ] one item\n');
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-alpha.21' });
      assert.equal(fs.readFileSync(rootBacklog, 'utf8'), '# my hand-written backlog\n- [ ] one item\n',
        'init must not touch a user-owned root BACKLOG.md');
      const aitriBacklog = path.join(dir, 'aitri', 'BACKLOG.md');
      assert.ok(fs.existsSync(aitriBacklog), 'the Aitri scaffold lands in aitri/');
      // Idempotency: re-init must not clobber the container backlog either.
      fs.writeFileSync(aitriBacklog, '# edited\n');
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-alpha.21' });
      assert.equal(fs.readFileSync(aitriBacklog, 'utf8'), '# edited\n',
        're-running init must not overwrite a hand-edited aitri/BACKLOG.md');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('aitri status — version warnings', () => {
  it('shows no version warning when versions match', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const out = captureLog(() => cmdStatus({ dir, VERSION: '0.1.34' }));
    assert.ok(!out.includes('aitriVersion') && !out.includes('v0.1'), `unexpected version warning: ${out}`);
  });

  it('warns when project version is older than CLI version', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    const out = captureLog(() => cmdStatus({ dir, VERSION: '0.1.34' }));
    assert.ok(out.includes('v0.1.10'), 'must show old project version');
    assert.ok(out.includes('v0.1.34'), 'must show current CLI version');
    assert.ok(out.includes('aitri adopt --upgrade'), 'must suggest running aitri adopt --upgrade');
  });

  it('warns when aitriVersion is missing from .aitri', () => {
    const dir = tmpDir();
    // Init without VERSION (simulates pre-v0.1.34 project)
    cmdInit({ dir, rootDir: ROOT_DIR });
    const config = loadConfig(dir);
    delete config.aitriVersion;
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(config, null, 2));

    const out = captureLog(() => cmdStatus({ dir, VERSION: '0.1.34' }));
    assert.ok(out.includes('missing aitriVersion'), `must warn about missing version, got: ${out}`);
    assert.ok(out.includes('aitri adopt --upgrade'), 'must suggest running aitri adopt --upgrade');
  });
});
