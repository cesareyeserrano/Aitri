/**
 * Tests: lib/prompts/render.js — the {{KEY}} / {{#IF_KEY}} renderer + the
 * ADV-0622-17 raw-template well-formedness guardrail.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { render, assertTemplateWellFormed } from '../../lib/prompts/render.js';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

function allTemplates(dir = TEMPLATES_DIR) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(allTemplates(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

describe('assertTemplateWellFormed() — ADV-0622-17 IF-block guardrail', () => {
  it('accepts a balanced, non-nested template', () => {
    assert.doesNotThrow(() =>
      assertTemplateWellFormed('t', 'a {{#IF_X}}x{{/IF_X}} b {{#IF_Y}}y{{/IF_Y}} {{KEY}}'));
  });

  it('rejects a nested {{#IF}} block (renderer does not support nesting)', () => {
    assert.throws(
      () => assertTemplateWellFormed('t', '{{#IF_X}}a{{#IF_Y}}b{{/IF_Y}}c{{/IF_X}}'),
      /nested \{\{#IF_Y\}\}/
    );
  });

  it('rejects an orphan close tag', () => {
    assert.throws(
      () => assertTemplateWellFormed('t', 'a {{/IF_X}} b'),
      /unbalanced \{\{\/IF_X\}\}/
    );
  });

  it('rejects an unclosed open block', () => {
    assert.throws(
      () => assertTemplateWellFormed('t', 'a {{#IF_X}} b'),
      /unclosed \{\{#IF_X\}\}/
    );
  });

  it('rejects a mismatched open/close pair', () => {
    assert.throws(
      () => assertTemplateWellFormed('t', '{{#IF_X}}a{{/IF_Y}}'),
      /unbalanced \{\{\/IF_Y\}\}/
    );
  });

  it('does NOT flag a {{ that appears only in a data VALUE (validates the raw template, not the output)', () => {
    // A simple {{KEY}} whose value itself contains template-looking text must not trip
    // the guard — the guard runs on the template skeleton before substitution.
    assert.doesNotThrow(() => assertTemplateWellFormed('t', 'before {{KEY}} after'));
  });
});

describe('render() — every shipped template is well-formed', () => {
  it('all repo templates pass the IF-balance guard (render does not throw)', () => {
    for (const file of allTemplates()) {
      const name = path.relative(TEMPLATES_DIR, file).replace(/\.md$/, '');
      assert.doesNotThrow(() => render(name, {}), `template ${name} must render without tripping the guard`);
    }
  });
});

describe('template content guards', () => {
  // ADV-0622-41: build.md must instruct the agent to use the real manifest field
  // `files_created`, never the non-existent `implementation_files` (the manifest schema
  // and 04_BUILD_REPORT readers know only files_created / files_modified / test_files).
  it('build.md never references the non-existent `implementation_files` manifest field', () => {
    const build = fs.readFileSync(path.join(TEMPLATES_DIR, 'phases', 'build.md'), 'utf8');
    assert.ok(!/implementation_files/.test(build),
      'build.md must use `files_created`, not `implementation_files`');
  });
});
