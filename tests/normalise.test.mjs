import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalise } from '../scripts/fetch-fixtures.mjs';

const baseItem = {
  id: 'm1',
  compId: 'TvJJeqzzeGJYzMJpw',   // U7 Sunday Minis — from config COMPETITIONS
  compName: 'SJRU Minis U7 Tri Time Sunday',
  round: 'Round 3',
  roundLabel: null,
  dateTime: '2026-05-10T22:00:00.000Z',
  venue: 'Tryon Oval TT1 (U6/U7)',
  status: 'Fixture',
  isLive: false,
  isBye: false,
  matchLabel: null,
  homeTeam: { teamId: 'H1', name: 'Lane Cove Gold 7', score: '',  crest: 'https://cdn/team/30901.png' },
  awayTeam: { teamId: 'A1', name: 'Chatswood Gold 7', score: '',  crest: 'https://cdn/team/30878.png' },
};

describe('normalise', () => {
  test('type=fixture when status !== Result', () => {
    const m = normalise(baseItem);
    assert.equal(m.type, 'fixture');
    assert.equal(m.home.score, null);
    assert.equal(m.away.score, null);
  });

  test("type='result' when status === 'Result'", () => {
    const m = normalise({ ...baseItem, status: 'Result',
      homeTeam: { ...baseItem.homeTeam, score: '12' },
      awayTeam: { ...baseItem.awayTeam, score: '8' } });
    assert.equal(m.type, 'result');
    assert.equal(m.home.score, '12');
    assert.equal(m.away.score, '8');
  });

  test('preserves zero score', () => {
    const m = normalise({ ...baseItem, status: 'Result',
      homeTeam: { ...baseItem.homeTeam, score: '0' },
      awayTeam: { ...baseItem.awayTeam, score: '0' } });
    assert.equal(m.home.score, '0');
    assert.equal(m.away.score, '0');
  });

  test('matchLabel null when missing', () => {
    const m = normalise(baseItem);
    assert.equal(m.matchLabel, null);
  });

  test('passes round, roundLabel, venue, competition through', () => {
    const m = normalise(baseItem);
    assert.equal(m.round, 'Round 3');
    assert.equal(m.roundLabel, 'Round 3');  // falls back to round when roundLabel null
    assert.equal(m.venue, 'Tryon Oval TT1 (U6/U7)');
    assert.equal(m.competition, 'SJRU Minis U7 Tri Time Sunday');
  });

  test('home/away club key derived from crest', () => {
    const m = normalise(baseItem);
    assert.equal(m.home.clubKey, 'lane-cove');
    assert.equal(m.away.clubKey, 'chatswood');
  });

  test('age derived from compId', () => {
    const m = normalise(baseItem);
    assert.equal(m.age, 'U7');
  });
});
