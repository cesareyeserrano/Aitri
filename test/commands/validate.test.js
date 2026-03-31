/**
 * Tests: aitri validate — artifact presence + approval check
 * Covers: all artifacts present, missing artifact, --json output, drift alias in message
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdValidate } from '../../lib/commands/validate.js';
import { loadConfig, hashArtifact } from '../../lib/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-validate-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function captureLog(fn) {
  const lines = [];
  const orig = console.log.bind(console);
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: 'spec',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

// Minimal valid artifact content (doesn't need to pass phase validation — validate just checks existence)
const ARTIFACTS = {
  'IDEA.md': '# My Idea\nSolve a problem.\n',
  'spec/01_REQUIREMENTS.json': '{"project_name":"T","functional_requirements":[]}',
  'spec/02_SYSTEM_DESIGN.md': '## Executive Summary\nDesign.\n',
  'spec/03_TEST_CASES.json': '{"test_cases":[]}',
  'spec/04_IMPLEMENTATION_MANIFEST.json': '{"files_created":[],"setup_commands":[]}',
  'spec/04_TEST_RESULTS.json': '{"summary":{"total":1,"passed":1,"failed":0},"results":[]}',
  'spec/05_PROOF_OF_COMPLIANCE.json': '{"requirement_compliance":[]}',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdValidate() — all artifacts present and approved', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    // Build config with all phases approved + verify passed
    const hashes = {};
    for (const [rel, content] of Object.entries(ARTIFACTS)) {
      writeFile(dir, rel, content);
      // Hash the core phase artifacts (1-5)
      const phaseMap = {
        'spec/01_REQUIREMENTS.json': '1',
        'spec/02_SYSTEM_DESIGN.md': '2',
        'spec/03_TEST_CASES.json': '3',
        'spec/04_IMPLEMENTATION_MANIFEST.json': '4',
        'spec/05_PROOF_OF_COMPLIANCE.json': '5',
      };
      if (phaseMap[rel]) {
        hashes[phaseMap[rel]] = hashArtifact(content);
      }
    }
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1, 2, 3, 4, 5],
      completedPhases: [1, 2, 3, 4, 5],
      verifyPassed: true,
      artifactHashes: hashes,
    }));
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports all valid', () => {
    assert.ok(output.includes('All artifacts present and approved'), 'should report all valid');
  });

  it('shows Validating header', () => {
    assert.ok(output.includes('Validating'), 'should show Validating header');
  });
});

describe('cmdValidate() — missing artifact', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# Idea\nContent.\n');
    // Only write IDEA.md — all spec/ artifacts missing
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports missing artifacts', () => {
    assert.ok(output.includes('MISSING'), 'should report MISSING for absent artifacts');
  });

  it('shows warning summary', () => {
    assert.ok(output.includes('missing or not approved'), 'should show warning');
  });
});

describe('cmdValidate() — not approved artifact', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [] }));
    writeFile(dir, 'IDEA.md', '# Idea\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACTS['spec/01_REQUIREMENTS.json']);
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('shows not approved status', () => {
    assert.ok(output.includes('not approved'), 'unapproved artifact should be flagged');
  });
});

describe('cmdValidate() — --json output', () => {
  let dir;
  let jsonOutput;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1] }));
    writeFile(dir, 'IDEA.md', '# Idea\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACTS['spec/01_REQUIREMENTS.json']);
    const raw = captureStdout(() => cmdValidate({ dir, args: ['--json'] }));
    jsonOutput = JSON.parse(raw);
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns valid JSON', () => {
    assert.ok(jsonOutput, 'output must be parseable JSON');
  });

  it('has project name', () => {
    assert.equal(jsonOutput.project, 'TestProject');
  });

  it('has artifacts array', () => {
    assert.ok(Array.isArray(jsonOutput.artifacts), 'artifacts must be an array');
  });

  it('marks existing artifact as approved', () => {
    const req = jsonOutput.artifacts.find(a => a.name === '01_REQUIREMENTS.json');
    assert.ok(req, 'requirements artifact must be in output');
    assert.equal(req.exists, true);
    assert.equal(req.approved, true);
  });

  it('marks missing artifact as not existing', () => {
    const design = jsonOutput.artifacts.find(a => a.name === '02_SYSTEM_DESIGN.md');
    assert.ok(design, 'design artifact must be in output');
    assert.equal(design.exists, false);
  });

  it('has allValid field', () => {
    assert.equal(typeof jsonOutput.allValid, 'boolean');
    assert.equal(jsonOutput.allValid, false, 'should not be all valid with missing artifacts');
  });

  it('has deployFiles', () => {
    assert.ok(jsonOutput.deployFiles, 'deployFiles must exist');
  });
});

describe('cmdValidate() — drift uses alias in message', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    const origContent = ARTIFACTS['spec/01_REQUIREMENTS.json'];
    const origHash = hashArtifact(origContent);
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      completedPhases: [1],
      artifactHashes: { '1': origHash },
    }));
    writeFile(dir, 'IDEA.md', '# Idea\n');
    // Write modified content so hash doesn't match
    writeFile(dir, 'spec/01_REQUIREMENTS.json', '{"project_name":"Modified","functional_requirements":[]}');
    output = captureLog(() => cmdValidate({ dir, args: [] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('shows DRIFT warning', () => {
    assert.ok(output.includes('DRIFT'), 'drift must be detected');
  });

  it('uses alias in drift message', () => {
    assert.ok(output.includes('requirements') || output.includes('approve'), 'drift message should reference alias or approve command');
  });
});
