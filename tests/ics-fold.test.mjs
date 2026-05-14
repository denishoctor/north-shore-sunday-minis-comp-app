/**
 * Unit tests for the ICS line-folding + escaping helpers in fetch-fixtures.mjs.
 *
 * RFC 5545 §3.1 caps each content line at 75 octets and requires continuation
 * lines to start with a single whitespace character. The fold cannot split
 * inside a multi-byte UTF-8 sequence, so emoji / accented team names need
 * the boundary check to work.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { icsFold, icsEscape } from '../scripts/fetch-fixtures.mjs';

describe('icsEscape', () => {
  test('escapes the RFC 5545 special chars', () => {
    assert.equal(icsEscape('a; b, c\nd \\ e'), 'a\\; b\\, c\\nd \\\\ e');
  });
  test('null / undefined → empty string', () => {
    assert.equal(icsEscape(null), '');
    assert.equal(icsEscape(undefined), '');
  });
});

describe('icsFold', () => {
  test('short lines pass through unchanged', () => {
    const s = 'SUMMARY:Lane Cove Gold 6 v Norths Pirates Red 6';
    assert.equal(icsFold(s), s);
  });

  test('long ASCII line folds at 75 bytes with CRLF + leading space', () => {
    const long = 'DESCRIPTION:' + 'x'.repeat(200);
    const out = icsFold(long);
    // First line is 75 bytes, every subsequent is up to 74 + leading space.
    const lines = out.split('\r\n');
    assert.equal(lines[0].length, 75);
    for (const cont of lines.slice(1)) assert.ok(cont.startsWith(' '));
  });

  test('does not split inside a 4-byte UTF-8 emoji', () => {
    // Pad so the 75-byte boundary falls inside a 🦘 codepoint (4 bytes).
    // Filler is 73 ASCII bytes; the emoji begins at byte 74. The naive
    // slice would cut between bytes 75 and 76, mid-codepoint.
    const filler = 'a'.repeat(73);
    const line   = filler + '🦘🦘🦘🦘';
    const folded = icsFold(line);
    // Round-trip: joining the continuation lines (drop CRLF + leading space)
    // must reconstruct the original exactly, with no replacement chars.
    const rejoined = folded.replace(/\r\n /g, '');
    assert.equal(rejoined, line);
    assert.ok(!rejoined.includes('�'), 'should not contain U+FFFD replacement chars');
  });

  test('handles a long string of 4-byte codepoints cleanly', () => {
    const line = 'DESCRIPTION:' + '🦘'.repeat(30); // 120 bytes of emoji + 12 bytes prefix
    const folded = icsFold(line);
    const rejoined = folded.replace(/\r\n /g, '');
    assert.equal(rejoined, line);
  });

  test('handles 2-byte accented characters', () => {
    const line = 'SUMMARY:' + 'á'.repeat(50); // 100 bytes
    const folded = icsFold(line);
    const rejoined = folded.replace(/\r\n /g, '');
    assert.equal(rejoined, line);
  });
});
