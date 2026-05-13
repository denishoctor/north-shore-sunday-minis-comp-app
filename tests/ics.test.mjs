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

// Each shipping team should have its own ICS feed; a regression that
// accidentally deleted half of them would otherwise still pass with the
// remaining files looking fine. Keep this minimum conservative — the
// season currently ships 60+ feeds, so 30 is a wide guard rail.
const MIN_EXPECTED_ICS_FILES = 30;

if (icsFiles.length === 0) {
  if (process.env.ALLOW_MISSING_FIXTURES) {
    describe('ICS feeds', () => {
      test.skip('no .ics files yet — ALLOW_MISSING_FIXTURES set, skipping', () => {});
    });
  } else {
    describe('ICS feeds', () => {
      test('expected ICS feeds in docs/', () => {
        assert.fail(
          `No .ics feeds present under docs/.\n` +
          `Run \`node scripts/fetch-fixtures.mjs\` to generate them, or set\n` +
          `ALLOW_MISSING_FIXTURES=1 to skip this gate.`,
        );
      });
    });
  }
} else {
  describe('ICS feeds', () => {
    test(`at least ${MIN_EXPECTED_ICS_FILES} feeds shipped`, () => {
      assert.ok(
        icsFiles.length >= MIN_EXPECTED_ICS_FILES,
        `only ${icsFiles.length} ICS files in docs/ — expected ≥${MIN_EXPECTED_ICS_FILES}.`,
      );
    });

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
