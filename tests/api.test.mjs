/**
 * Live integration tests for the Rugby Xplorer GraphQL API. Catches breaking
 * API changes (schema rename, removed fields, auth requirements) early —
 * separate from the CI cron so it can run against a real network connection.
 *
 * Run: node --test tests/api.test.mjs
 *
 * Also serves as the one-off probe for entityType:'competition' that the brief
 * called for: the "competition entityType probe" test asserts the aggregate
 * can be queried by competition ID (an alternative fan-out strategy).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEASON, FEEDS, CLUBS, COMPETITIONS, COMP_IDS } from '../scripts/config.mjs';

const GQL = 'https://rugby-au-cms.graphcdn.app/';

const QUERY = `query EntityFixturesAndResults(
  $entityId: Int, $entityType: String, $season: String,
  $comps: [CompInput], $teams: [String], $type: String,
  $skip: Int, $limit: Int
) {
  getEntityFixturesAndResults(
    season: $season comps: $comps teams: $teams
    entityId: $entityId entityType: $entityType
    type: $type limit: $limit skip: $skip
  ) {
    id compId compName dateTime round roundLabel
    status venue isLive isBye
    homeTeam { id name teamId score crest }
    awayTeam { id name teamId score crest }
  }
}`;

async function gql(variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
    body: JSON.stringify({ operationName: 'EntityFixturesAndResults', variables, query: QUERY }),
  });
  assert.equal(res.ok, true, `HTTP ${res.status}`);
  const json = await res.json();
  assert.ok(!json.errors, `GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data.getEntityFixturesAndResults;
}

test('club entityType — Lane Cove returns Sunday Minis fixtures', async () => {
  const data = await gql({
    entityType: 'club',
    entityId:   CLUBS['lane-cove'].id,
    season:     SEASON,
    comps:      COMP_IDS.map(id => ({ id })),
    teams:      [],
    type:       'fixture',
    skip: 0, limit: 100,
  });
  assert.ok(Array.isArray(data));
  for (const m of data) {
    assert.ok(COMP_IDS.includes(m.compId), `unexpected compId ${m.compId}`);
  }
});

test('competition entityType probe — does the endpoint accept it?', async () => {
  // If this passes, we can fan out by competition (entityType:'competition'
  // with one descriptor per Sunday Minis comp) instead of by club. That would
  // also surface any North Shore clubs we haven't whitelisted yet.
  const data = await gql({
    entityType: 'competition',
    entityId:   null,
    season:     SEASON,
    comps:      [{ id: COMPETITIONS['sjru-minis-u7-tri'].id }],
    teams:      [],
    type:       'fixture',
    skip: 0, limit: 100,
  });
  assert.ok(Array.isArray(data));
  // No assertion on data.length — a comp may legitimately be empty pre-season —
  // the important signal is that the endpoint didn't error.
});

test('FEEDS descriptor list — every feed returns or errors cleanly', async () => {
  for (const feed of FEEDS) {
    const data = await gql({ ...feed, season: SEASON, type: 'fixture', skip: 0, limit: 100 });
    assert.ok(Array.isArray(data), `feed entityId=${feed.entityId} did not return array`);
  }
});
