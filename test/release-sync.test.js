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

});
