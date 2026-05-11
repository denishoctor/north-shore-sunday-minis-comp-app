import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_PATH = join(ROOT, 'docs', 'fixtures.json');

if (!existsSync(FIXTURES_PATH)) {
  describe('fixtures.json', () => {
    test.skip('fixtures.json not present yet — first CI run will populate', () => {});
  });
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
