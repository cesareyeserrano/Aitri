/**
 * Tests: lib/read-stdin.js — sync stdin reader (T3, TEST-HARDENING)
 *
 * readStdinSync wraps fs.readSync(0, ...) with an EAGAIN retry loop so
 * interactive prompts work on Node 24+, which leaves stdin non-blocking.
 * The EAGAIN path never fires under the test runner (stdin is a pipe that
 * reads cleanly), so we stub fs.readSync to drive every branch:
 *   - clean read returns the decoded string, truncated at maxBytes
 *   - EAGAIN retries until a read succeeds
 *   - any other error propagates unchanged
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { readStdinSync } from '../lib/read-stdin.js';

function stubReadSync(impl) {
  return mock.method(fs, 'readSync', impl);
}

describe('readStdinSync', () => {
  it('returns the decoded string from a clean read', () => {
    const stub = stubReadSync((fd, buf) => {
      assert.equal(fd, 0, 'must read fd 0 (stdin)');
      return buf.write('y\n');
    });
    try {
      assert.equal(readStdinSync(10), 'y\n');
    } finally { stub.mock.restore(); }
  });

  it('honors maxBytes: never reads more than requested', () => {
    const stub = stubReadSync((fd, buf, offset, length) => {
      assert.equal(length, 4, 'read length must equal maxBytes');
      return buf.write('abcd'.slice(0, length));
    });
    try {
      assert.equal(readStdinSync(4), 'abcd');
    } finally { stub.mock.restore(); }
  });

  it('retries on EAGAIN until the read succeeds', () => {
    let calls = 0;
    const stub = stubReadSync((fd, buf) => {
      calls++;
      if (calls < 3) {
        const e = new Error('resource temporarily unavailable');
        e.code = 'EAGAIN';
        throw e;
      }
      return buf.write('yes\n');
    });
    try {
      assert.equal(readStdinSync(10), 'yes\n');
      assert.equal(calls, 3, 'must retry through EAGAIN, not give up');
    } finally { stub.mock.restore(); }
  });

  it('propagates non-EAGAIN errors unchanged', () => {
    const stub = stubReadSync(() => {
      const e = new Error('bad file descriptor');
      e.code = 'EBADF';
      throw e;
    });
    try {
      assert.throws(() => readStdinSync(10), /bad file descriptor/);
    } finally { stub.mock.restore(); }
  });

  it('returns empty string on EOF (zero-byte read), enabling callers to detect closed stdin', () => {
    const stub = stubReadSync(() => 0);
    try {
      assert.equal(readStdinSync(10), '');
    } finally { stub.mock.restore(); }
  });
});
