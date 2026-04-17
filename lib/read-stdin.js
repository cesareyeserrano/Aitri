/**
 * Module: sync stdin reader
 * Purpose: Wrap fs.readSync(0, ...) with EAGAIN retry so interactive prompts
 *          work on Node 24+, which leaves stdin in non-blocking mode by default.
 *          Callers remain synchronous — no async propagation required.
 */

import fs from 'fs';

const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

function sleepMs(ms) {
  try { Atomics.wait(SLEEP_BUF, 0, 0, ms); }
  catch { const end = Date.now() + ms; while (Date.now() < end) { /* spin */ } }
}

export function readStdinSync(maxBytes = 10) {
  const buf = Buffer.alloc(maxBytes);
  while (true) {
    try {
      const bytes = fs.readSync(0, buf, 0, maxBytes, null);
      return buf.subarray(0, bytes).toString();
    } catch (e) {
      if (e.code === 'EAGAIN') { sleepMs(20); continue; }
      throw e;
    }
  }
}
