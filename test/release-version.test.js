/**
 * Tests: sealed release identity (RELEASE-VERSION-0722, rc.9)
 *
 * 05_TRACEABILITY.json#version was REQUIRED since the artifact existed but
 * write-only — no provenance instruction, no consumer — so agents filled it
 * with "1.0.0" forever. rc.9 makes it honest:
 *   - optional additive `version_source`: "manifest" | "team" | "assumed"
 *     (vocab gated when present; omitted = legacy artifact, still valid)
 *   - snapshot/status surface the release ({version, version_source})
 *   - approve 5 shows the sealed version, warns loudly on "assumed", and
 *     carries {version, version_source} in the 'approved' event payload —
 *     the cross-cycle history of which version sealed from which state.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import phase5 from '../lib/phases/phase5.js';
import { buildProjectSnapshot } from '../lib/snapshot.js';
import { cmdApprove } from '../lib/commands/approve.js';

const noopErr = (m) => { throw new Error(m); };

function traceability(extra = {}) {
  return JSON.stringify({
    project: 'p', version: '2.3.0', phases_completed: [1, 2, 3, 4, 5],
    overall_status: 'compliant',
    requirement_compliance: [{ id: 'FR-001', title: 't', level: 'complete', evidence: 'e' }],
    ...extra,
  });
}

function seedProject(dir, traceExtra, { approved = [1, 2, 3, 4] } = {}) {
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
    projectName: 'p', artifactsDir: 'spec',
    completedPhases: [5], approvedPhases: approved,
  }));
  fs.writeFileSync(path.join(dir, 'spec/05_TRACEABILITY.json'), traceability(traceExtra));
}

function captureAll(fn) {
  const logs = [];
  const origLog = console.log; const origErr = process.stderr.write;
  console.log = (...a) => logs.push(a.join(' '));
  process.stderr.write = (s) => { logs.push(String(s)); return true; };
  try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
  return logs.join('\n');
}

// ── phase 5 validator ───────────────────────────────────────────────────────

describe('phase 5 — version_source vocabulary (additive)', () => {
  it('accepts each canonical source, and omission (legacy artifacts)', () => {
    for (const vs of ['manifest', 'team', 'assumed']) {
      assert.doesNotThrow(() => phase5.validate(traceability({ version_source: vs })), vs);
    }
    assert.doesNotThrow(() => phase5.validate(traceability()), 'omitted = pre-rc.9 artifact, valid');
  });

  it('rejects an off-vocabulary source with a teaching message', () => {
    assert.throws(() => phase5.validate(traceability({ version_source: 'guessed' })),
      /version_source must be "manifest" \| "team" \| "assumed"/);
  });
});

// ── snapshot / status surface ───────────────────────────────────────────────

describe('snapshot — release identity surfaced only while SEALED', () => {
  it('exposes {version, version_source} when phase 5 is approved', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rel-'));
    try {
      seedProject(dir, { version_source: 'manifest' }, { approved: [1, 2, 3, 4, 5] });
      const snap = buildProjectSnapshot(dir, { cliVersion: '2.1.0-rc.9' });
      const root = snap.pipelines.find(p => p.scope === 'root') || snap.pipelines[0];
      assert.deepEqual(root.release, { version: '2.3.0', version_source: 'manifest' });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('null when unsealed (artifact on disk but phase 5 not approved — the cascade-reset case)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rel-'));
    try {
      seedProject(dir, { version_source: 'team' }); // approved [1,2,3,4] — 5 reset
      const snap = buildProjectSnapshot(dir, { cliVersion: 'x' });
      const root = snap.pipelines.find(p => p.scope === 'root') || snap.pipelines[0];
      assert.equal(root.release, null, 'a reset phase 5 must not display "Sealed version"');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('null on absent artifact; null version_source on a legacy sealed artifact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rel-'));
    try {
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ projectName: 'p', artifactsDir: 'spec', approvedPhases: [1, 2, 3, 4, 5] }));
      let snap = buildProjectSnapshot(dir, { cliVersion: 'x' });
      let root = snap.pipelines.find(p => p.scope === 'root') || snap.pipelines[0];
      assert.equal(root.release, null, 'no traceability → no release');

      fs.writeFileSync(path.join(dir, 'spec/05_TRACEABILITY.json'), traceability());
      snap = buildProjectSnapshot(dir, { cliVersion: 'x' });
      root = snap.pipelines.find(p => p.scope === 'root') || snap.pipelines[0];
      assert.deepEqual(root.release, { version: '2.3.0', version_source: null }, 'legacy artifact → source null');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── approve 5 — display + event history ─────────────────────────────────────

describe('approve 5 — release sealed visibly and into the event log', () => {
  it('confirmed source: prints the sealed release and records version in the approved event', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rel-'));
    try {
      seedProject(dir, { version_source: 'team' });
      const out = captureAll(() => cmdApprove({ dir, args: ['deploy'], err: noopErr }));
      // Version rendered AS-IS — no "v" prefix (team schemes may be dates/tags).
      assert.match(out, /Release sealed: 2\.3\.0 \(source: team\)/);
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      const approved5 = [...(cfg.events || [])].reverse().find(e => e.event === 'approved' && String(e.phase) === '5');
      assert.ok(approved5, 'approved event for phase 5 must exist');
      assert.equal(approved5.version, '2.3.0', 'event carries the sealed version (recent-activity readers)');
      assert.equal(approved5.version_source, 'team');
      // The DURABLE record: events are capped at 20 and a cycle emits ~12+, so
      // releaseHistory is the surface that survives across cycles.
      assert.equal(Array.isArray(cfg.releaseHistory), true, 'releaseHistory must exist after approve 5');
      const last = cfg.releaseHistory[cfg.releaseHistory.length - 1];
      assert.equal(last.version, '2.3.0');
      assert.equal(last.version_source, 'team');
      assert.ok(typeof last.at === 'string' && last.at.includes('T'), 'entry carries an ISO timestamp');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('status --json emits the additive release field for a sealed pipeline (contract pin)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rel-'));
    try {
      seedProject(dir, { version_source: 'manifest' }, { approved: [1, 2, 3, 4, 5] });
      const { cmdStatus } = await import('../lib/commands/status.js');
      let out = '';
      const origW = process.stdout.write.bind(process.stdout);
      const origLog = console.log;
      process.stdout.write = (chunk) => { out += chunk; return true; };
      console.log = (...a) => { out += a.join(' ') + '\n'; };
      try { cmdStatus({ dir, VERSION: '2.1.0-rc.9', args: ['--json'], flagValue: () => null }); }
      finally { process.stdout.write = origW; console.log = origLog; }
      const payload = JSON.parse(out);
      assert.deepEqual(payload.release, { version: '2.3.0', version_source: 'manifest' },
        'STATUS_JSON.md documents release — it must actually be emitted (contract-shape rule)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('assumed source: warns loudly at the checkpoint instead of celebrating the tag', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rel-'));
    try {
      seedProject(dir, { version_source: 'assumed' });
      const out = captureAll(() => cmdApprove({ dir, args: ['deploy'], err: noopErr }));
      assert.match(out, /version_source "assumed" — the team never confirmed this version/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
