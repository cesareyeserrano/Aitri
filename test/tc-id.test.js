import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractTCId, extractAllTCIds, isCanonicalTCId, suggestCanonicalTCId } from '../lib/tc-id.js';

describe('extractAllTCIds() — VERIFY-TC-VISIBILITY-0706', () => {
  it('returns [] for a line with no ids and a single-element array for one id', () => {
    assert.deepEqual(extractAllTCIds('no ids here'), []);
    assert.deepEqual(extractAllTCIds('✔ TC-050h: combined'), ['TC-050h']);
  });

  it('returns all distinct ids in order of appearance', () => {
    assert.deepEqual(extractAllTCIds('✔ TC-050h + TC-051h: combined test'), ['TC-050h', 'TC-051h']);
  });

  it('dedupes a repeated id and normalizes underscores like extractTCId', () => {
    assert.deepEqual(extractAllTCIds('TC_FE_001h and TC-FE-001h again'), ['TC-FE-001h']);
  });

  it('first element always agrees with extractTCId (the crediting parser)', () => {
    for (const line of ['✔ TC-050h + TC-051h', 'test_TC_NS_001h then TC-002', 'nothing']) {
      const all = extractAllTCIds(line);
      assert.equal(all[0] ?? null, extractTCId(line), line);
    }
  });
});

describe('isCanonicalTCId()', () => {
  it('accepts plain and namespaced canonical ids', () => {
    for (const id of ['TC-001h', 'TC-020b', 'TC-FE-001h', 'TC-E2E-001h', 'TC-API-USER-010f']) {
      assert.equal(isCanonicalTCId(id), true, id);
    }
  });

  it('rejects glued, digit-free, and lowercase-namespace ids', () => {
    for (const id of ['TC-NFR010h', 'TC-S001', 'TC-e2eFolderScan', 'TC-app-version-h', 'TC-fe-001h', 'TC-NFR010']) {
      assert.equal(isCanonicalTCId(id), false, id);
    }
  });

  it('is exactly the set the parser can round-trip', () => {
    // The gate's whole correctness claim: canonical ⇔ verify-run can link it.
    for (const id of ['TC-001h', 'TC-NFR010h', 'TC-E2E-001h', 'TC-e2eFolderScan']) {
      assert.equal(isCanonicalTCId(id), extractTCId(id) === id, id);
    }
  });
});

describe('suggestCanonicalTCId()', () => {
  it('inserts the separator for a glued pure-letter namespace', () => {
    assert.equal(suggestCanonicalTCId('TC-NFR010h'), 'TC-NFR-010h');
    assert.equal(suggestCanonicalTCId('TC-S001'),    'TC-S-001');
    assert.equal(suggestCanonicalTCId('TC-NFR010'),  'TC-NFR-010'); // no suffix
  });

  it('uppercases the namespace in the suggestion', () => {
    assert.equal(suggestCanonicalTCId('TC-nfr010h'), 'TC-NFR-010h');
  });

  it('refuses a digit-bearing namespace — genuinely ambiguous (E2E vs E)', () => {
    // This is why the separator exists; auto-suggesting here would guess wrong.
    assert.equal(suggestCanonicalTCId('TC-E2E001h'), null);
  });

  it('refuses descriptive ids with no numeric block to anchor on', () => {
    assert.equal(suggestCanonicalTCId('TC-e2eFolderScan'), null);
    assert.equal(suggestCanonicalTCId('TC-app-version-h'), null);
  });

  it('every suggestion it returns is itself canonical', () => {
    for (const id of ['TC-NFR010h', 'TC-S001', 'TC-nfr010h']) {
      const s = suggestCanonicalTCId(id);
      assert.ok(s && isCanonicalTCId(s), `${id} → ${s}`);
    }
  });
});
