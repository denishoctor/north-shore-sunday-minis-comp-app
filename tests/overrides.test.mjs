import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyOverrides, applyAdditions } from '../scripts/fetch-fixtures.mjs';

// Minimal normalised-match factory — same shape normalise() emits.
const mk = (id, over = {}) => ({
  id, type: 'fixture',
  competition: 'SJRU Minis U8 Sunday', compId: 'hvxK25gJJt24GLGPp',
  age: 'U8', round: 'Round 9', roundLabel: 'Round 9',
  dateTime: '2026-08-01T22:40:00+00:00',
  venue: 'Tantallon Oval TT1 (U6/U7)',
  status: 'Fixture', isLive: false, isBye: false, matchLabel: null,
  home: { id: 'H1', name: 'Lane Cove Blue 8', score: null, crest: 'https://cdn/team/30901.png', clubKey: 'lane-cove' },
  away: { id: 'A1', name: 'Lane Cove Gold 8', score: null, crest: 'https://cdn/team/30901.png', clubKey: 'lane-cove' },
  ...over,
});

describe('applyOverrides — venue + dateTime', () => {
  test('replaces the venue and tags venueChange with the base ground name', () => {
    const ms = [mk('m1')];
    applyOverrides(ms, { m1: { venue: 'Kingsford Oval TT1 (U6/U7)', note: 'Moved from Tantallon Oval' } });
    assert.equal(ms[0].venue, 'Kingsford Oval TT1 (U6/U7)');
    // `from` is the ground, not the pitch-suffixed string — that's what parents drive to.
    assert.deepEqual(ms[0].venueChange, { from: 'Tantallon Oval', note: 'Moved from Tantallon Oval' });
  });

  test('no note means no venueChange tag (silent correction, no "Moved" badge)', () => {
    const ms = [mk('m1')];
    applyOverrides(ms, { m1: { venue: 'Kingsford Oval TT1 (U6/U7)' } });
    assert.equal(ms[0].venue, 'Kingsford Oval TT1 (U6/U7)');
    assert.equal(ms[0].venueChange, undefined);
  });

  test('a pitch-only change on the same ground is not a relocation', () => {
    const ms = [mk('m1')];
    applyOverrides(ms, { m1: { venue: 'Tantallon Oval TT3 (U6/U7)', note: 'Moved from Tantallon Oval' } });
    assert.equal(ms[0].venue, 'Tantallon Oval TT3 (U6/U7)');
    assert.equal(ms[0].venueChange, undefined);
  });

  test('dateTime is overridden independently of venue', () => {
    const ms = [mk('m1')];
    applyOverrides(ms, { m1: { dateTime: '2026-08-01T23:20:00+00:00' } });
    assert.equal(ms[0].dateTime, '2026-08-01T23:20:00+00:00');
    assert.equal(ms[0].venue, 'Tantallon Oval TT1 (U6/U7)');
  });

  test('team guard skips an entry whose id now holds a different game', () => {
    const ms = [mk('m1')];
    applyOverrides(ms, { m1: { home: 'Hornsby Red 8', away: 'Chatswood Black 8', venue: 'Kingsford Oval TT1 (U6/U7)' } });
    assert.equal(ms[0].venue, 'Tantallon Oval TT1 (U6/U7)');
  });
});

describe('applyOverrides — remove', () => {
  test('drops the fixture entirely', () => {
    const ms = [mk('m1'), mk('m2'), mk('m3')];
    applyOverrides(ms, { m2: { remove: true } });
    assert.deepEqual(ms.map(m => m.id), ['m1', 'm3']);
  });

  test('removes several without skipping neighbours (reverse iteration)', () => {
    const ms = [mk('m1'), mk('m2'), mk('m3'), mk('m4')];
    applyOverrides(ms, { m2: { remove: true }, m3: { remove: true } });
    assert.deepEqual(ms.map(m => m.id), ['m1', 'm4']);
  });

  test('team guard also protects a removal', () => {
    const ms = [mk('m1')];
    applyOverrides(ms, { m1: { home: 'Someone Else 8', remove: true } });
    assert.equal(ms.length, 1);
  });

  test('re-running over already-removed data is a no-op', () => {
    const ms = [mk('m1')];
    const overrides = { m2: { remove: true } };
    applyOverrides(ms, overrides);
    applyOverrides(ms, overrides);
    assert.deepEqual(ms.map(m => m.id), ['m1']);
  });
});

describe('applyAdditions', () => {
  const spec = {
    id: 'manual-x', round: 'Round 9', age: 'U8',
    competition: 'SJRU Minis U8 Sunday', compId: 'hvxK25gJJt24GLGPp',
    venue: 'Kingsford Oval TT1 (U6/U7)', dateTime: '2026-08-01T22:40:00+00:00',
    home: 'Lane Cove Blue 8', away: 'Lane Cove Gold 8',
  };

  test('resolves team id / crest / clubKey by name from the feed', () => {
    const ms = [mk('m1')];
    applyAdditions(ms, [spec]);
    const added = ms.find(m => m.id === 'manual-x');
    assert.equal(added.home.id, 'H1');
    assert.equal(added.away.crest, 'https://cdn/team/30901.png');
    assert.equal(added.home.clubKey, 'lane-cove');
  });

  test('carries venueChange through so a manual fixture can show "Moved"', () => {
    const ms = [mk('m1')];
    const vc = { from: 'Tantallon Oval', note: 'Moved from Tantallon Oval' };
    applyAdditions(ms, [{ ...spec, venueChange: vc }]);
    assert.deepEqual(ms.find(m => m.id === 'manual-x').venueChange, vc);
    // Cloned, not shared with the config object.
    assert.notEqual(ms.find(m => m.id === 'manual-x').venueChange, vc);
  });

  test('skips a spec whose teams are not in the feed', () => {
    const ms = [mk('m1')];
    applyAdditions(ms, [{ ...spec, away: 'Not A Team 8' }]);
    assert.equal(ms.length, 1);
  });

  test('re-running does not duplicate', () => {
    const ms = [mk('m1')];
    applyAdditions(ms, [spec]);
    applyAdditions(ms, [spec]);
    assert.equal(ms.filter(m => m.id === 'manual-x').length, 1);
  });

  // The --from-cache rebuild reads back the previous run's own output. If a
  // spec already present by id were skipped rather than replaced, an edited
  // config entry could never land — the stale copy would win forever.
  test('replaces a prior copy so an edited spec lands on a cached rebuild', () => {
    const ms = [mk('m1')];
    applyAdditions(ms, [spec]);
    applyAdditions(ms, [{ ...spec, venue: 'Kingsford Oval TT3 (U6/U7)', dateTime: '2026-08-01T23:20:00+00:00' }]);
    const added = ms.filter(m => m.id === 'manual-x');
    assert.equal(added.length, 1);
    assert.equal(added[0].venue, 'Kingsford Oval TT3 (U6/U7)');
    assert.equal(added[0].dateTime, '2026-08-01T23:20:00+00:00');
  });
});

describe('applyOverrides + applyAdditions — the scrapped-fixture replacement flow', () => {
  test('a removed game frees its slot for the manual replacement', () => {
    const ms = [
      mk('published', { home: { id: 'H1', name: 'Lane Cove Blue 8', score: null, crest: 'c', clubKey: 'lane-cove' } }),
      mk('other', { id: 'other', home: { id: 'S1', name: 'St Ives 8', score: null, crest: 's', clubKey: 'st-ives' } }),
    ];
    applyOverrides(ms, { published: { remove: true } });
    applyAdditions(ms, [{
      id: 'manual-repair', round: 'Round 9', age: 'U8',
      competition: 'SJRU Minis U8 Sunday', compId: 'hvxK25gJJt24GLGPp',
      venue: 'Kingsford Oval TT1 (U6/U7)', dateTime: '2026-08-01T22:40:00+00:00',
      venueChange: { from: 'Tantallon Oval', note: 'Moved from Tantallon Oval' },
      home: 'St Ives 8', away: 'Lane Cove Gold 8',
    }]);
    assert.equal(ms.some(m => m.id === 'published'), false);
    const repaired = ms.find(m => m.id === 'manual-repair');
    assert.equal(repaired.home.name, 'St Ives 8');
    assert.equal(repaired.venue, 'Kingsford Oval TT1 (U6/U7)');
    assert.equal(repaired.venueChange.note, 'Moved from Tantallon Oval');
  });
});
