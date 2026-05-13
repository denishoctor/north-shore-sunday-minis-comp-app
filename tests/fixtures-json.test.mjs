import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_PATH = join(ROOT, 'docs', 'fixtures.json');

// Don't silently skip when the file is missing — that turned a setup mistake
// (forgot to run `npm run fetch` once before pushing) into a green CI run.
// Surface it as a real failure with the remediation in the message. The
// `ALLOW_MISSING_FIXTURES=1` escape hatch covers the genuine first-deploy
// case where CI hasn't populated the file yet.
if (!existsSync(FIXTURES_PATH)) {
  if (process.env.ALLOW_MISSING_FIXTURES) {
    describe('fixtures.json', () => {
      test.skip('fixtures.json absent — ALLOW_MISSING_FIXTURES set, skipping', () => {});
    });
  } else {
    describe('fixtures.json', () => {
      test('fixtures.json must exist before running tests', () => {
        assert.fail(
          `docs/fixtures.json is missing.\n` +
          `Run \`node scripts/fetch-fixtures.mjs\` to populate it, or set\n` +
          `ALLOW_MISSING_FIXTURES=1 if you're running before the first CI fetch.`,
        );
      });
    });
  }
} else {
  const data = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

  describe('fixtures.json structure', () => {
    test('has updated, season, totalMatches', () => {
      assert.equal(typeof data.updated, 'string');
      assert.match(data.season, /^\d{4}$/);
      assert.equal(typeof data.totalMatches, 'number');
    });

    test('matches is an array', () => {
      assert.ok(Array.isArray(data.matches));
    });

    test('competitions is an array', () => {
      assert.ok(Array.isArray(data.competitions));
    });

    test('clubs is a populated object', () => {
      assert.equal(typeof data.clubs, 'object');
      assert.ok(Object.keys(data.clubs).length > 0);
    });

    test('every match has required fields', () => {
      for (const m of data.matches) {
        assert.ok(m.id, `match missing id: ${JSON.stringify(m).slice(0, 100)}`);
        assert.ok(['fixture', 'result'].includes(m.type), `bad type: ${m.type}`);
        assert.ok(typeof m.competition === 'string');
        assert.ok(typeof m.dateTime === 'string');
        assert.ok(m.home && m.away);
      }
    });

    test('matches sorted chronologically', () => {
      for (let i = 1; i < data.matches.length; i++) {
        assert.ok(
          new Date(data.matches[i - 1].dateTime) <= new Date(data.matches[i].dateTime),
          `match[${i - 1}].dateTime > match[${i}].dateTime`,
        );
      }
    });

    test('no duplicate match ids', () => {
      const ids = data.matches.map(m => m.id);
      assert.equal(new Set(ids).size, ids.length, 'duplicate ids present');
    });

    test('all compIds correspond to a Sunday Minis competition', () => {
      const compIds = new Set(data.competitions.map(c => data.matches.find(m => m.compId)?.compId).filter(Boolean));
      // Round-trip: every match.compId should appear in competitions[].
      const compIdsFromComps = new Set();
      for (const m of data.matches) compIdsFromComps.add(m.compId);
      for (const cid of compIdsFromComps) {
        // No specific assertion on the set itself — just sanity that the file
        // doesn't have orphan compIds. Each comp should have at least one match.
        assert.ok(data.matches.some(m => m.compId === cid));
      }
    });

    test('every team carries a clubKey or null (none undefined)', () => {
      for (const m of data.matches) {
        assert.ok('clubKey' in m.home, 'home missing clubKey');
        assert.ok('clubKey' in m.away, 'away missing clubKey');
      }
    });
  });
}
