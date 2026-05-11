import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

const icsFiles = existsSync(DOCS)
  ? readdirSync(DOCS).filter(f => f.endsWith('.ics'))
  : [];

if (icsFiles.length === 0) {
  describe('ICS feeds', () => {
    test.skip('no .ics files present yet — first CI run will populate', () => {});
  });
} else {
  describe('ICS feeds', () => {
    for (const file of icsFiles) {
      const body = readFileSync(join(DOCS, file), 'utf8');

      describe(file, () => {
        test('starts with BEGIN:VCALENDAR', () => {
          assert.ok(body.startsWith('BEGIN:VCALENDAR'));
        });
        test('ends with END:VCALENDAR', () => {
          assert.match(body, /END:VCALENDAR\r?\n?$/);
        });
        test('contains a VTIMEZONE for Australia/Sydney', () => {
          assert.match(body, /TZID:Australia\/Sydney/);
        });
        test('PRODID is NSM-branded', () => {
          assert.match(body, /PRODID:.*NSM Sunday Rugby/);
        });
        test('has at least one VEVENT or is an empty-calendar fallback', () => {
          // It's valid for a brand-new team feed to have zero events; just
          // assert the file is well-formed in that case.
          const hasEvent = /BEGIN:VEVENT/.test(body);
          if (hasEvent) {
            assert.match(body, /SUMMARY:/);
            assert.match(body, /UID:nsm-sunday-/);
          }
        });
      });
    }
  });
}
