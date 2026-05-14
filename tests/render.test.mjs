import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, clubFromCrest, clubFromTeam, slugifyTeam, shortTeamName,
  scoreClass, parseVenue, venueSlug, renderVenueDetails,
  fmtDow, fmtDate, fmtTime, rowId,
} from '../docs/render.mjs';
// Import the real CLUBS map rather than maintaining a parallel copy in the
// test file — the old hardcoded shape silently drifted from config.mjs when
// a new club was added.
import { CLUBS } from '../scripts/config.mjs';

describe('esc', () => {
  test('escapes the five XSS-relevant chars', () => {
    assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
  test('handles null / undefined', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });
});

describe('clubFromCrest', () => {
  test('matches the LCJRU crest pattern', () => {
    assert.equal(clubFromCrest('https://cdn/team/30901.png?v=1', CLUBS), 'lane-cove');
  });
  test('matches full-size crest variant', () => {
    assert.equal(clubFromCrest('https://cdn/team-full-size/30878.jpg?v=2', CLUBS), 'chatswood');
  });
  test('returns null for unknown id', () => {
    assert.equal(clubFromCrest('https://cdn/team/99999.png', CLUBS), null);
  });
  test('returns null for malformed input', () => {
    assert.equal(clubFromCrest('', CLUBS), null);
    assert.equal(clubFromCrest(null, CLUBS), null);
    assert.equal(clubFromCrest('https://example.com/no-id.png', CLUBS), null);
  });
});

describe('clubFromTeam', () => {
  test('prefers crest match', () => {
    const t = { name: 'Chatswood Gold 6', crest: 'https://cdn/team/30878.png' };
    assert.equal(clubFromTeam(t, CLUBS), 'chatswood');
  });
  test('falls back to shortPrefix when crest is unknown', () => {
    const t = { name: 'Wakehurst Wildcats 7', crest: 'https://cdn/team/99999.png' };
    assert.equal(clubFromTeam(t, CLUBS), 'wakehurst');
  });
  test('joint team — uses crested club', () => {
    // "Killara-West Pymble/Lindfield 8" carries KWP's crest.
    const t = { name: 'Killara-West Pymble/Lindfield 8', crest: 'https://cdn/team/30900.png' };
    assert.equal(clubFromTeam(t, CLUBS), 'kwp');
  });
});

describe('slugifyTeam', () => {
  test('basic colour variant', () => {
    const t = { name: 'Lane Cove Gold 7', crest: 'https://cdn/team/30901.png' };
    assert.equal(slugifyTeam(t, 'U7', CLUBS), 'lane-cove-u7-gold');
  });
  test('no variant when team has no colour', () => {
    const t = { name: 'Lane Cove 9', crest: 'https://cdn/team/30901.png' };
    assert.equal(slugifyTeam(t, 'U9', CLUBS), 'lane-cove-u9');
  });
  test('multi-word variant becomes kebab-case', () => {
    const t = { name: 'Wakehurst Wildcats 7', crest: 'https://cdn/team/53597.png' };
    assert.equal(slugifyTeam(t, 'U7', CLUBS), 'wakehurst-u7-wildcats');
  });
  test('joint team surfaces partner in slug', () => {
    const t = { name: 'Killara-West Pymble/Lindfield 8', crest: 'https://cdn/team/30900.png' };
    assert.equal(slugifyTeam(t, 'U8', CLUBS), 'kwp-u8-lindfield');
  });
  test('returns null when no club resolvable', () => {
    const t = { name: 'Unknown Reds 6', crest: 'https://cdn/team/99999.png' };
    assert.equal(slugifyTeam(t, 'U6', CLUBS), null);
  });
});

describe('shortTeamName', () => {
  test('drops club prefix when supplied', () => {
    assert.equal(shortTeamName('Lane Cove Gold 7', 'lane-cove', CLUBS), 'Gold 7');
  });
  test('strips joint-team slash', () => {
    assert.equal(shortTeamName('Killara-West Pymble/Lindfield 8', 'kwp', CLUBS), 'Lindfield 8');
  });
  test('returns original when prefix not present', () => {
    assert.equal(shortTeamName('Chatswood Gold 6', 'lane-cove', CLUBS), 'Chatswood Gold 6');
  });
  test('falls back to original when no clubKey', () => {
    assert.equal(shortTeamName('Some team', null, CLUBS), 'Some team');
  });
});

describe('scoreClass — aggregate (neutral)', () => {
  test("'played' when both scores set", () => {
    const m = { home: { score: '12' }, away: { score: '8' } };
    assert.equal(scoreClass(m), 'played');
  });
  test("'' when fixture (no scores)", () => {
    const m = { home: { score: null }, away: { score: null } };
    assert.equal(scoreClass(m), '');
  });
  test("'' when only one score set", () => {
    const m = { home: { score: '12' }, away: { score: null } };
    assert.equal(scoreClass(m), '');
  });
  test('does not return win/loss/draw', () => {
    const m = { home: { score: '50' }, away: { score: '0' } };
    assert.notEqual(scoreClass(m), 'win');
    assert.notEqual(scoreClass(m), 'loss');
    assert.notEqual(scoreClass(m), 'draw');
  });
});

describe('parseVenue', () => {
  const VENUES = {
    'Tryon Oval':              { suburb: 'East Lindfield', mapsUrl: 'https://example.com/tryon' },
    'Wakehurst Rugby Park':    { suburb: 'Belrose',        mapsUrl: 'https://example.com/wakehurst' },
    'North Narrabeen Reserve': { suburb: 'Narrabeen',      mapsUrl: 'https://example.com/nn' },
  };
  test('mini pitch with age band', () => {
    const r = parseVenue('Tryon Oval TT1 (U6/U7)', VENUES);
    assert.equal(r.base, 'Tryon Oval');
    assert.equal(r.pitch, 'TT1');
    assert.equal(r.display, 'Tryon Oval, East Lindfield');
  });
  test('exact match no pitch', () => {
    const r = parseVenue('Wakehurst Rugby Park', VENUES);
    assert.equal(r.base, 'Wakehurst Rugby Park');
    assert.equal(r.pitch, null);
  });
  test('prefix walk strips pitch suffix', () => {
    const r = parseVenue('North Narrabeen Reserve No 2 (Front)', VENUES);
    assert.equal(r.base, 'North Narrabeen Reserve');
    assert.equal(r.pitch, 'No 2 (Front)');
  });
  test('unknown venue falls back to generic maps URL', () => {
    const r = parseVenue('Some Unknown Ground', VENUES);
    assert.equal(r.base, null);
    assert.match(r.mapsUrl, /maps\.google\.com/);
  });
});

describe('venueSlug', () => {
  test('handles apostrophes and parentheses', () => {
    assert.equal(venueSlug("St John's Oval"), 'st-johns-oval');
    assert.equal(venueSlug('Mark Taylor Oval (Waitara Oval)'), 'mark-taylor-oval-waitara-oval');
  });
});

describe('rowId', () => {
  test('prefixes match id', () => {
    assert.equal(rowId({ id: 'abc123' }), 'match-abc123');
  });
});

describe('fmt date/time', () => {
  // Use a known UTC instant: 2026-05-02T00:00:00Z is Sat in Sydney (AEST UTC+10).
  test('fmtDow', () => {
    assert.match(fmtDow('2026-05-02T00:00:00.000Z'), /Sat/);
  });
  test('fmtDate', () => {
    assert.match(fmtDate('2026-05-02T00:00:00.000Z'), /2 May/);
  });
  test('fmtTime AEST', () => {
    assert.match(fmtTime('2026-05-02T00:00:00.000Z'), /10:00am/);
  });

  // Sydney DST: clocks go back to AEST (UTC+10) on 1st Sun of April, and
  // forward to AEDT (UTC+11) on 1st Sun of October. The Sunday Minis season
  // straddles April but not October, so the AEST/AEDT boundary is in scope.
  describe('DST handling — Australia/Sydney', () => {
    test('a 10am Sydney kick-off in AEST winter shows as 10:00am', () => {
      // 2026-07-05 10:00 AEST = 2026-07-05 00:00 UTC (Sydney is UTC+10)
      assert.match(fmtTime('2026-07-05T00:00:00.000Z'), /10:00am/);
      assert.match(fmtDow('2026-07-05T00:00:00.000Z'),  /Sun/);
    });
    test('a 10am Sydney kick-off in AEDT summer shows as 10:00am', () => {
      // 2026-11-08 10:00 AEDT = 2026-11-07 23:00 UTC (Sydney is UTC+11)
      assert.match(fmtTime('2026-11-07T23:00:00.000Z'), /10:00am/);
      assert.match(fmtDow('2026-11-07T23:00:00.000Z'),  /Sun/);
    });
    test('DST-end Sunday (5 April 2026) renders as Sun and the correct day', () => {
      // 2026-04-05 10:00 AEDT (just before the 03:00 turn-back) = 2026-04-04 23:00 UTC
      assert.match(fmtDow('2026-04-04T23:00:00.000Z'),  /Sun/);
      assert.match(fmtDate('2026-04-04T23:00:00.000Z'), /5 Apr/);
    });
    test('DST-start Sunday (4 October 2026) renders as Sun and the correct day', () => {
      // 2026-10-04 10:00 AEDT (after the 02:00→03:00 spring-forward) = 2026-10-03 23:00 UTC
      assert.match(fmtDow('2026-10-03T23:00:00.000Z'),  /Sun/);
      assert.match(fmtDate('2026-10-03T23:00:00.000Z'), /4 Oct/);
    });
  });
});

describe('renderVenueDetails', () => {
  test('empty when no details', () => {
    assert.equal(renderVenueDetails('Tryon Oval', { 'Tryon Oval': {} }), '');
  });
  test('renders parking + notes rows', () => {
    const venues = {
      'Tantallon Oval': {
        details: { parking: 'At the club', notes: 'BBQ on game days' },
      },
    };
    const html = renderVenueDetails('Tantallon Oval', venues);
    assert.match(html, /Parking.*At the club/);
    assert.match(html, /Notes.*BBQ on game days/);
  });
});
