/**
 * Tests: lib/normalize-patterns.js
 * Covers: behavioral vs non-behavioral file classification for `aitri normalize`
 *         and the snapshot's uncounted-files detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBehavioralFile, filterBehavioral } from '../lib/normalize-patterns.js';

describe('isBehavioralFile() — defaults', () => {
  it('returns true for source code files', () => {
    assert.equal(isBehavioralFile('internal/auth/jwt.go'), true);
    assert.equal(isBehavioralFile('src/index.js'), true);
    assert.equal(isBehavioralFile('lib/util/parser.ts'), true);
    assert.equal(isBehavioralFile('app/main.py'), true);
    assert.equal(isBehavioralFile('cmd/server/main.go'), true);
  });

  it('returns true for empty / invalid input (default to behavioral)', () => {
    assert.equal(isBehavioralFile(''), true);
    assert.equal(isBehavioralFile(null), true);
    assert.equal(isBehavioralFile(undefined), true);
  });

  it('handles backslash paths (Windows-style)', () => {
    assert.equal(isBehavioralFile('lib\\index.js'), true);
    assert.equal(isBehavioralFile('docs\\README.md'), false);
  });
});

describe('isBehavioralFile() — build/dependency manifests', () => {
  it('excludes Go manifests', () => {
    assert.equal(isBehavioralFile('go.mod'), false);
    assert.equal(isBehavioralFile('go.sum'), false);
  });

  it('excludes Node manifests and lockfiles', () => {
    assert.equal(isBehavioralFile('package.json'), false);
    assert.equal(isBehavioralFile('package-lock.json'), false);
    assert.equal(isBehavioralFile('yarn.lock'), false);
    assert.equal(isBehavioralFile('npm-shrinkwrap.json'), false);
  });

  it('excludes Rust manifests', () => {
    assert.equal(isBehavioralFile('Cargo.toml'), false);
    assert.equal(isBehavioralFile('Cargo.lock'), false);
  });

  it('excludes Python manifests', () => {
    assert.equal(isBehavioralFile('Pipfile'), false);
    assert.equal(isBehavioralFile('Pipfile.lock'), false);
    assert.equal(isBehavioralFile('poetry.lock'), false);
    assert.equal(isBehavioralFile('pyproject.toml'), false);
  });

  it('excludes Ruby / PHP / Java manifests', () => {
    assert.equal(isBehavioralFile('Gemfile'), false);
    assert.equal(isBehavioralFile('Gemfile.lock'), false);
    assert.equal(isBehavioralFile('composer.lock'), false);
    assert.equal(isBehavioralFile('pom.xml'), false);
    assert.equal(isBehavioralFile('build.gradle'), false);
  });

  it('excludes any *.lock file', () => {
    assert.equal(isBehavioralFile('something.lock'), false);
    assert.equal(isBehavioralFile('some/dir/foo.lock'), false);
  });
});

describe('isBehavioralFile() — documentation', () => {
  it('excludes markdown variants', () => {
    assert.equal(isBehavioralFile('README.md'), false);
    assert.equal(isBehavioralFile('docs/guide.md'), false);
    assert.equal(isBehavioralFile('CHANGELOG.md'), false);
    assert.equal(isBehavioralFile('a/b/c/notes.markdown'), false);
  });

  it('excludes plain text and rst', () => {
    assert.equal(isBehavioralFile('CHANGES.txt'), false);
    assert.equal(isBehavioralFile('docs/api.rst'), false);
    assert.equal(isBehavioralFile('docs/intro.adoc'), false);
  });

  it('excludes LICENSE / NOTICE variants', () => {
    assert.equal(isBehavioralFile('LICENSE'), false);
    assert.equal(isBehavioralFile('LICENSE.txt'), false);
    assert.equal(isBehavioralFile('LICENCE'), false);
    assert.equal(isBehavioralFile('NOTICE'), false);
    assert.equal(isBehavioralFile('AUTHORS'), false);
    assert.equal(isBehavioralFile('CONTRIBUTING.md'), false);
    assert.equal(isBehavioralFile('CODE_OF_CONDUCT.md'), false);
  });
});

describe('isBehavioralFile() — dotfiles and config', () => {
  it('excludes .env variants', () => {
    assert.equal(isBehavioralFile('.env'), false);
    assert.equal(isBehavioralFile('.env.example'), false);
    assert.equal(isBehavioralFile('.env.local'), false);
    assert.equal(isBehavioralFile('.env.production'), false);
  });

  it('excludes git/editor config dotfiles', () => {
    assert.equal(isBehavioralFile('.gitignore'), false);
    assert.equal(isBehavioralFile('.gitattributes'), false);
    assert.equal(isBehavioralFile('.dockerignore'), false);
    assert.equal(isBehavioralFile('.editorconfig'), false);
  });

  it('excludes language version pins', () => {
    assert.equal(isBehavioralFile('.nvmrc'), false);
    assert.equal(isBehavioralFile('.node-version'), false);
    assert.equal(isBehavioralFile('.python-version'), false);
    assert.equal(isBehavioralFile('.ruby-version'), false);
  });
});

describe('isBehavioralFile() — CI and infra', () => {
  it('excludes Docker manifests', () => {
    assert.equal(isBehavioralFile('Dockerfile'), false);
    assert.equal(isBehavioralFile('Dockerfile.dev'), false);
    assert.equal(isBehavioralFile('docker-compose.yml'), false);
    assert.equal(isBehavioralFile('docker-compose.prod.yaml'), false);
    assert.equal(isBehavioralFile('docker-compose.override.yml'), false);
  });

  it('excludes Makefile variants', () => {
    assert.equal(isBehavioralFile('Makefile'), false);
    assert.equal(isBehavioralFile('GNUmakefile'), false);
    assert.equal(isBehavioralFile('Makefile.dev'), false);
  });

  it('excludes CI directories', () => {
    assert.equal(isBehavioralFile('.github/workflows/ci.yml'), false);
    assert.equal(isBehavioralFile('.gitlab/issue-template.md'), false);
    assert.equal(isBehavioralFile('.circleci/config.yml'), false);
    assert.equal(isBehavioralFile('ci/build.sh'), false);
  });

  it('excludes legacy CI manifests', () => {
    assert.equal(isBehavioralFile('.travis.yml'), false);
    assert.equal(isBehavioralFile('.gitlab-ci.yml'), false);
    assert.equal(isBehavioralFile('azure-pipelines.yml'), false);
    assert.equal(isBehavioralFile('cloudbuild.yaml'), false);
  });
});

describe('isBehavioralFile() — generated assets', () => {
  it('excludes minified bundles and source maps', () => {
    assert.equal(isBehavioralFile('web/static/app.min.js'), false);
    assert.equal(isBehavioralFile('public/styles.min.css'), false);
    assert.equal(isBehavioralFile('dist/bundle.js.map'), false);
    assert.equal(isBehavioralFile('app.bundle.js'), false);
  });

  it('excludes /dist/, /build/, /.next/, /.nuxt/, /out/ anywhere in path', () => {
    assert.equal(isBehavioralFile('web/dist/main.js'), false);
    assert.equal(isBehavioralFile('apps/web/build/index.html'), false);
    assert.equal(isBehavioralFile('frontend/.next/static/foo.js'), false);
    assert.equal(isBehavioralFile('out/index.html'), false);
  });

  it('does NOT match dist/build as filenames or partial segments', () => {
    assert.equal(isBehavioralFile('lib/builder.js'), true);
    assert.equal(isBehavioralFile('lib/distillery.js'), true);
  });
});

describe('isBehavioralFile() — Ultron canary case (regression guard)', () => {
  it('excludes the three files that triggered the original cycle', () => {
    // Verified on Ultron at HEAD e7f67cb (2026-04-27): these three files
    // were the only diff vs baseRef cae7ab68. All three are non-behavioral.
    assert.equal(isBehavioralFile('.env.example'),  false);
    assert.equal(isBehavioralFile('DEPLOYMENT.md'), false);
    assert.equal(isBehavioralFile('go.mod'),        false);
  });
});

describe('filterBehavioral()', () => {
  it('returns only the behavioral files', () => {
    const input = ['main.go', 'go.mod', 'README.md', 'internal/auth.go', 'package-lock.json'];
    const out = filterBehavioral(input);
    assert.deepEqual(out, ['main.go', 'internal/auth.go']);
  });

  it('returns [] for empty/invalid input', () => {
    assert.deepEqual(filterBehavioral([]), []);
    assert.deepEqual(filterBehavioral(null), []);
    assert.deepEqual(filterBehavioral(undefined), []);
  });

  it('preserves order', () => {
    const input = ['z.js', 'README.md', 'a.js', 'go.mod', 'm.js'];
    assert.deepEqual(filterBehavioral(input), ['z.js', 'a.js', 'm.js']);
  });

  it('returns empty array when all inputs are non-behavioral (Ultron case)', () => {
    const ultron = ['.env.example', 'DEPLOYMENT.md', 'go.mod'];
    assert.deepEqual(filterBehavioral(ultron), []);
  });
});
