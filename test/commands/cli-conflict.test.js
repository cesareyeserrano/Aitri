import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// End-to-end coverage of the G-4 dispatcher branch (bin/aitri.js). The conflict-detection
// string lives in three places — state.js (throw), bin/aitri.js (catch regex), and the unit
// test — so a unit test alone can't prove the dispatcher actually translates the throw into
// clean guidance. This spawns the real CLI to close that gap (adversarial finding #4).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN  = path.join(ROOT, 'bin', 'aitri.js');

describe('CLI dispatcher — conflicted root .aitri (G-4 end-to-end)', () => {
  it('prints actionable guidance and exits 1, not a raw stack trace', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-cli-conflict-'));
    try {
      fs.writeFileSync(path.join(dir, '.aitri'),
        '{\n<<<<<<< HEAD\n  "currentPhase": 2\n=======\n  "currentPhase": 1\n>>>>>>> branch\n}');

      let code = 0, out = '';
      try {
        execFileSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        code = e.status;
        out  = (e.stderr || '') + (e.stdout || '');
      }

      assert.equal(code, 1, 'a conflicted .aitri must exit 1');
      assert.match(out, /unresolved git merge conflict markers/, 'the dispatcher prints the actionable message');
      assert.doesNotMatch(out, /\n\s+at .+:\d+:\d+/, 'no raw Node stack trace leaked');
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
