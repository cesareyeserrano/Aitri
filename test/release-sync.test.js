import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function pkgVersion() {
  return JSON.parse(read('package.json')).version;
}

function binVersion() {
  const m = read('bin/aitri.js').match(/const VERSION\s*=\s*['"]([^'"]+)['"]/);
  return m?.[1] ?? null;
}

const INTEGRATION_DOCS = [
  'docs/integrations/SCHEMA.md',
  'docs/integrations/README.md',
  'docs/integrations/ARTIFACTS.md',
  'docs/integrations/STATUS_JSON.md',
  'docs/integrations/VALIDATE_JSON.md',
];

describe('release sync guard', () => {

  it('package.json.version matches bin/aitri.js VERSION const', () => {
    const pkg = pkgVersion();
    const bin = binVersion();
    assert.equal(
      bin,
      pkg,
      `Version mismatch: package.json=${pkg}, bin/aitri.js VERSION=${bin}. Bump both in the same commit.`
    );
  });

  for (const doc of INTEGRATION_DOCS) {
    it(`${doc} version header matches package.json`, () => {
      const pkg = pkgVersion();
      const content = read(doc);
      // Accepts stable (1.2.3) and pre-release (2.0.0-alpha.1) semver strings.
      const m = content.match(/\*\*(?:Aitri version|Version):\*\*\s*v?([\d.]+(?:-[\w.]+)?)\+?/);
      assert.ok(m, `${doc} — missing "**Version:** v0.x.y+" header at top of file`);
      assert.equal(
        m[1],
        pkg,
        `${doc} — header declares v${m[1]}+, but package.json is ${pkg}. Bump the header when releasing.`
      );
    });
  }

  // Integration CHANGELOG marker linter — every versioned entry must end with
  // `— additive` or `— breaking` so Hub (and any future subproduct) can
  // distinguish safe upgrades from risky ones without parsing body text.
  it('docs/integrations/CHANGELOG.md — every versioned heading carries an additive/breaking marker', () => {
    const content = read('docs/integrations/CHANGELOG.md');
    const lines = content.split('\n');
    // Match headings like `## v0.1.80 (date) — title — additive`
    // or `## v2.0.0-alpha.3 (date) — title — breaking`. The version token
    // allows pre-release tags (alpha.N / beta.N / rc.N).
    const versionHeadingRe = /^##\s+v[\d.]+(?:-[\w.]+)?\b/;
    const missing = [];
    for (const raw of lines) {
      if (!versionHeadingRe.test(raw)) continue;
      // Accept em-dash (—) or double-hyphen (--) as the separator, require
      // exactly one of the two markers anywhere on the line.
      const hasMarker = /—\s*(additive|breaking)\s*$/.test(raw.trim())
                     || /--\s*(additive|breaking)\s*$/.test(raw.trim());
      if (!hasMarker) missing.push(raw.trim());
    }
    assert.equal(
      missing.length, 0,
      `docs/integrations/CHANGELOG.md — ${missing.length} entry heading(s) missing the ` +
      `"— additive" or "— breaking" marker at end of line. Offending:\n  ${missing.join('\n  ')}`
    );
  });

});
