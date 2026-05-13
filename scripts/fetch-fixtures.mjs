/**
 * Fetches fixture and result data for the North Shore Minis Sunday Rugby
 * aggregate from the Rugby Xplorer GraphQL API. Fans out across the FEEDS
 * descriptor list (one club entity per descriptor, filtered to Sunday Minis
 * competitions), dedups matches by id, diffs against the previous run to
 * detect venue/time changes on upcoming games, and writes:
 *
 *   docs/fixtures.json   normalised match list + club/team metadata
 *   docs/config.js       browser-loadable window.NSM_SUNDAY_CONFIG
 *   docs/<slug>.ics      one calendar feed per team slug
 *   changes.txt          empty when nothing changed (triggers ntfy.sh)
 *
 * Endpoint: https://rugby-au-cms.graphcdn.app/
 *
 * Run:  node scripts/fetch-fixtures.mjs
 */

import { writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import {
  SEASON, SITE_URL, SITE, SEASON_END, ICS_EVENT_MIN,
  FEEDS, CLUBS, COMPETITIONS, COMP_IDS, AGE_GROUPS, VENUES,
} from './config.mjs';
import { ROUNDS } from './rounds.mjs';
import { parseVenue, slugifyTeam, clubFromCrest } from '../docs/render.mjs';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH  = join(ROOT, 'docs', 'fixtures.json');
const DIFF_PATH = join(ROOT, 'changes.txt');
const CFG_PATH  = join(ROOT, 'docs', 'config.js');
const DOCS_DIR  = join(ROOT, 'docs');

const GRAPHQL_URL = 'https://rugby-au-cms.graphcdn.app/';
const PAGE_SIZE   = 100;

const QUERY = `
query EntityFixturesAndResults(
  $entityId: Int, $entityType: String, $season: String,
  $comps: [CompInput], $teams: [String], $type: String,
  $skip: Int, $limit: Int
) {
  getEntityFixturesAndResults(
    season: $season comps: $comps teams: $teams
    entityId: $entityId entityType: $entityType
    type: $type limit: $limit skip: $skip
  ) {
    id compId compName dateTime group
    isLive isBye round roundType roundLabel
    season status venue sourceType matchLabel
    homeTeam { id name teamId score crest }
    awayTeam { id name teamId score crest }
  }
}`;

// ── fetch ─────────────────────────────────────────────────────────────────────

async function withRetry(fn, attempts = 3) {
  let delay = 2000;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      if (i === attempts - 1) throw err;
      console.warn(`  retry ${i + 1}/${attempts - 1} after ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

async function fetchPage(feed, type, skip) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
    body: JSON.stringify({
      operationName: 'EntityFixturesAndResults',
      variables: {
        season: SEASON,
        entityType: feed.entityType,
        entityId:   feed.entityId,
        comps:      feed.comps || [],
        teams:      feed.teams || [],
        type, skip, limit: PAGE_SIZE,
      },
      query: QUERY,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${type} skip=${skip} entityId=${feed.entityId}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data.getEntityFixturesAndResults;
}

async function fetchAllForFeed(feed, type) {
  const all = [];
  let skip = 0;
  while (true) {
    const page = await withRetry(() => fetchPage(feed, type, skip));
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return all;
}

// Fan out across every FEEDS descriptor for the requested type, then dedup by
// match id (a match between two whitelisted clubs appears in both feeds).
// One feed failing must not poison the rest: we use Promise.allSettled and
// continue with whatever succeeded. The run is only fatal if *every* feed
// fails — otherwise we log the failures and emit best-effort output.
async function fetchAll(type) {
  const results = await Promise.allSettled(FEEDS.map(feed => fetchAllForFeed(feed, type)));
  const failures = [];
  const seen = new Map();
  results.forEach((r, i) => {
    const feed = FEEDS[i];
    if (r.status === 'rejected') {
      failures.push({ feed, reason: r.reason?.message ?? String(r.reason) });
      return;
    }
    for (const item of r.value) {
      // Defensive: even though we set `comps` on each feed, a stray response
      // outside the Sunday Minis set would be a config bug.
      if (!COMP_IDS.includes(item.compId)) continue;
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
  });
  if (failures.length) {
    console.warn(`⚠️  ${failures.length}/${FEEDS.length} ${type} feed(s) failed:`);
    for (const f of failures) console.warn(`   entityId=${f.feed.entityId} (${f.feed.entityType}): ${f.reason}`);
  }
  if (failures.length === FEEDS.length) {
    throw new Error(`All ${FEEDS.length} ${type} feeds failed — aborting.`);
  }
  return [...seen.values()];
}

// ── normalise ─────────────────────────────────────────────────────────────────

export function normalise(item) {
  const type = item.status === 'Result' ? 'result' : 'fixture';
  return {
    id: item.id,
    type,
    competition: item.compName,
    compId: item.compId,
    age: COMPETITIONS && Object.values(COMPETITIONS).find(c => c.id === item.compId)?.age || null,
    round: item.round,
    roundLabel: item.roundLabel || item.round,
    dateTime: item.dateTime,
    venue: item.venue,
    status: item.status,
    isLive: item.isLive,
    isBye: item.isBye,
    matchLabel: item.matchLabel || null,
    home: normaliseTeam(item.homeTeam),
    away: normaliseTeam(item.awayTeam),
  };
}

function normaliseTeam(t) {
  if (!t) return { id: null, name: '', score: null, crest: '', clubKey: null };
  return {
    id:      t.teamId,
    name:    t.name,
    score:   t.score !== '' ? t.score : null,
    crest:   t.crest,
    clubKey: clubFromCrest(t.crest, CLUBS),
  };
}

// ── slug derivation ──────────────────────────────────────────────────────────

// Build the TEAM_SLUGS map (slug → Rugby Xplorer teamId) from the matches we
// just fetched. Slug shape: <club-key>-<u#>-<variant>, e.g.
//   "Lane Cove Gold 7"                  → lane-cove-u7-gold
//   "Norths Pirates White 6"            → norths-pirates-u6-white
//   "Wakehurst Warthogs 7"              → wakehurst-u7-warthogs
//   "Killara-West Pymble/Lindfield 8"   → kwp-u8-lindfield     (crest club + joint partner)
//   "Lane Cove 9"                       → lane-cove-u9
function buildTeamSlugs(matches) {
  const slugs = {};        // slug -> teamId
  const meta  = {};        // teamId -> { name, clubKey, age, slug }
  for (const m of matches) {
    for (const side of [m.home, m.away]) {
      if (!side.id || meta[side.id]) continue;
      const slug = slugifyTeam(side, m.age, CLUBS);
      if (!slug) continue;
      // Collision-rare; if it happens, suffix with short teamId tail
      const final = slugs[slug] && slugs[slug] !== side.id
        ? `${slug}-${side.id.slice(0, 4).toLowerCase()}`
        : slug;
      slugs[final] = side.id;
      meta[side.id] = { name: side.name, clubKey: side.clubKey, age: m.age, slug: final };
    }
  }
  return { slugs, meta };
}

// ── diff ──────────────────────────────────────────────────────────────────────

function fmtDateSydney(isoString) {
  return new Date(isoString).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney',
  });
}

function fmtTimeSydney(isoString) {
  return new Date(isoString)
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })
    .replace(' am', 'am').replace(' pm', 'pm');
}

function detectChanges(oldData, newData) {
  if (!oldData?.matches?.length) return [];

  const oldMap = new Map(oldData.matches.filter(m => m.type === 'fixture').map(m => [m.id, m]));
  const newUpcoming = newData.matches.filter(m => m.type === 'fixture');

  const changes = [];
  for (const newM of newUpcoming) {
    const oldM = oldMap.get(newM.id);
    if (!oldM) { changes.push({ kind: 'added', match: newM }); continue; }
    if (oldM.venue !== newM.venue) changes.push({ kind: 'venue', match: newM, from: oldM.venue, to: newM.venue });
    if (oldM.dateTime !== newM.dateTime) changes.push({ kind: 'time', match: newM, from: oldM.dateTime, to: newM.dateTime });
  }
  const newIds = new Set(newUpcoming.map(m => m.id));
  for (const [id, oldM] of oldMap) {
    if (!newIds.has(id)) changes.push({ kind: 'removed', match: oldM });
  }
  return changes;
}

function matchSummary(match) {
  // Aggregate has no "us" — show both teams in the change message.
  const round = (match.round || '').replace('Round ', '');
  return `${match.home.name} vs ${match.away.name} · R${round} · ${fmtDateSydney(match.dateTime)}`;
}

function formatChanges(changes) {
  const lines = [`${SITE.name} — Fixture Update`, ''];
  for (const c of changes) {
    const summary = matchSummary(c.match);
    switch (c.kind) {
      case 'venue':
        lines.push(`📍 Venue change — ${summary}`);
        lines.push(`   Was: ${c.from}`);
        lines.push(`   Now: ${c.to}`);
        break;
      case 'time':
        lines.push(`🕐 Time change — ${summary}`);
        lines.push(`   Was: ${fmtTimeSydney(c.from)}`);
        lines.push(`   Now: ${fmtTimeSydney(c.to)}`);
        break;
      case 'added':
        lines.push(`➕ New fixture — ${summary}`);
        lines.push(`   ${c.match.venue}`);
        break;
      case 'removed':
        lines.push(`❌ Fixture removed — ${summary}`);
        break;
    }
    lines.push('');
  }
  lines.push(`Full draw: ${SITE_URL}/`);
  return lines.join('\n').trim();
}

// ── venue display ─────────────────────────────────────────────────────────────

function displayLocation(rawVenue) {
  if (!rawVenue) return rawVenue;
  const { display, pitch, base } = parseVenue(rawVenue, VENUES);
  if (!pitch) return display;
  const suburb = base ? VENUES[base]?.suburb : null;
  return suburb && base ? `${base} ${pitch}, ${suburb}` : `${display} ${pitch}`;
}

// ── ICS calendar generation ────────────────────────────────────────────────────

function icsLocalDate(isoString) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(isoString)).map(x => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

function icsDateOnly(isoString) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(isoString)).map(x => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

function icsNow() {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

function icsEscape(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsFold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let pos = 0;
  while (pos < bytes.length) {
    const limit = pos === 0 ? 75 : 74;
    let end = Math.min(pos + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
    out.push(bytes.slice(pos, end).toString('utf8'));
    pos = end;
  }
  return out.join('\r\n ');
}

function icsLine(key, value) { return icsFold(`${key}:${value}`); }

function buildDescription(match, slug, ownTeam, opponent, loc) {
  const roundNum = (match.round || '').replace('Round ', '');
  const date     = fmtDateSydney(match.dateTime);
  const time     = fmtTimeSydney(match.dateTime);
  const hasTime  = time !== '12:00am';
  return [
    `🏉 ${ownTeam.name} vs ${opponent.name}`,
    `📍 ${loc}`,
    `📅 Round ${roundNum} · ${date}${hasTime ? ' · ' + time + ' AEST' : ''}`,
    `🏆 ${match.competition}`,
    '',
    'ℹ️ Venues and times may change. This calendar updates automatically',
    '(Apple Calendar: ~every hour · Google Calendar: up to 24 hrs after a change)',
    '',
    `🔗 ${SITE_URL}/#${slug}`,
  ].join('\n');
}

export function generateICS(slug, teamId, teamMeta, allMatches, updatedISO) {
  const matches = allMatches.filter(m => m.home.id === teamId || m.away.id === teamId);
  const label   = teamMeta?.name || slug;
  const club    = teamMeta?.clubKey ? CLUBS[teamMeta.clubKey] : null;
  const calName = `${SITE.shortName} — ${label} ${SEASON}`;
  const calDesc = `${SITE.name} — ${label} fixtures and results ${SEASON}`;

  const dtstamp = icsNow();
  const lastMod = updatedISO.replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//NSM Sunday Rugby//Fixtures ${SEASON}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icsLine('X-WR-CALNAME', calName),
    icsLine('X-WR-CALDESC', calDesc),
    'X-WR-TIMEZONE:Australia/Sydney',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE',
    'TZID:Australia/Sydney',
    'BEGIN:STANDARD',
    'TZNAME:AEST',
    'TZOFFSETFROM:+1100',
    'TZOFFSETTO:+1000',
    'DTSTART:19700405T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZNAME:AEDT',
    'TZOFFSETFROM:+1000',
    'TZOFFSETTO:+1100',
    'DTSTART:19701004T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ];

  for (const match of matches) {
    const isHome  = match.home.id === teamId;
    const own     = isHome ? match.home : match.away;
    const opp     = isHome ? match.away : match.home;
    const loc     = displayLocation(match.venue) || '';
    const roundNum = (match.round || '').replace('Round ', '');
    const timeStr  = fmtTimeSydney(match.dateTime);
    const hasTime  = timeStr !== '12:00am';

    const summary     = icsEscape(`${label} vs ${opp.name} | RND ${roundNum}`);
    const description = icsEscape(buildDescription(match, slug, own, opp, loc));
    const location    = icsEscape(loc ? `${loc}, Sydney NSW` : '');

    lines.push('BEGIN:VEVENT');
    lines.push(icsLine('UID', `nsm-sunday-${match.id}-${slug}@${stableHost()}`));
    lines.push('SEQUENCE:0');
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`LAST-MODIFIED:${lastMod}`);

    if (hasTime) {
      const localDt = icsLocalDate(match.dateTime);
      const endDt   = icsLocalDate(new Date(new Date(match.dateTime).getTime() + ICS_EVENT_MIN * 60000).toISOString());
      lines.push(`DTSTART;TZID=Australia/Sydney:${localDt}`);
      lines.push(`DTEND;TZID=Australia/Sydney:${endDt}`);
    } else {
      const dateKey = icsDateOnly(match.dateTime);
      const nextDay = icsDateOnly(new Date(new Date(match.dateTime).getTime() + 86400000).toISOString());
      lines.push(`DTSTART;VALUE=DATE:${dateKey}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay}`);
    }

    lines.push(icsLine('SUMMARY',     summary));
    lines.push(icsLine('LOCATION',    location));
    lines.push(icsLine('DESCRIPTION', description));
    lines.push(icsLine('URL',         `${SITE_URL}/#${slug}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// Stable host for UIDs — derived from SITE_URL so re-imports don't duplicate.
function stableHost() {
  try { return new URL(SITE_URL).host; } catch { return 'nsm-sunday.local'; }
}

// ── rounds summary ───────────────────────────────────────────────────────────
//
// Cross-references the static SJRU Sunday Minis schedule (scripts/rounds.mjs)
// with the matches we just fetched, producing a per-round summary that the
// browser uses to render "what's on this weekend" even when Rugby Xplorer
// hasn't published a particular round yet.
//
// For each round we report:
//   - hosts.u6u7 / hosts.u8u9  : the scheduled venue (or the venue we
//                                observed in the live data if it overrides)
//   - matches.u6u7 / matches.u8u9 : how many matches our whitelisted clubs
//                                   have in this round per age band
//   - status: 'scheduled' (no matches yet, draft drawn)
//           | 'published'  (Rugby Xplorer has published the matches)
//           | 'bye'        (no rugby this weekend per the schedule)
//
// Matches the live data joins on by Sunday-date — Sunday Minis matches all
// kick off the same weekend, so date is a sufficient join key.

// Returns the venue most matches in the given list cluster at, stripping
// pitch suffix via parseVenue so "Tryon Oval TT1" and "Tryon Oval" count
// as the same ground. Null if the list is empty.
function dominantVenue(matches) {
  if (!matches.length) return null;
  const counts = new Map();
  for (const m of matches) {
    const { base } = parseVenue(m.venue || '', VENUES);
    const key = base || (m.venue || '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null, bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

function buildRoundsSummary(matches) {
  const matchesByDate = new Map();
  for (const m of matches) {
    const sydneyDate = new Date(m.dateTime).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
    if (!matchesByDate.has(sydneyDate)) matchesByDate.set(sydneyDate, []);
    matchesByDate.get(sydneyDate).push(m);
  }

  // Resolve a host venue for a (round, ageBand) pair. Live data from Xplorer
  // wins — the static schedule in rounds.mjs was based on the early-season
  // draft and CAN move (R5 2026 was the example: Tantallon/Lofberg in the
  // draft, different venue once Xplorer published). Falls back to the static
  // host only when the round has no live matches yet for that band.
  const resolveHost = (staticHost, dayMatches, ageBand) => {
    const ageMatches = dayMatches.filter(m => {
      if (ageBand === 'u6u7') return m.age === 'U6' || m.age === 'U7';
      return m.age === 'U8' || m.age === 'U9';
    });
    const fromLive = dominantVenue(ageMatches);
    return fromLive || staticHost || null;
  };

  return ROUNDS.map(r => {
    if (r.bye) {
      return { round: r.round, date: r.date, status: 'bye', hosts: { u6u7: null, u8u9: null }, matches: { u6u7: 0, u8u9: 0 } };
    }
    const dayMatches = r.date ? (matchesByDate.get(r.date) || []) : [];
    const u67 = dayMatches.filter(m => m.age === 'U6' || m.age === 'U7');
    const u89 = dayMatches.filter(m => m.age === 'U8' || m.age === 'U9');

    if (r.gala) {
      return {
        round: r.round,
        date: r.date,
        status: 'gala',
        galaTitle: r.galaTitle || 'Gala Day',
        galaDescription: r.galaDescription || null,
        hosts: {
          u6u7: resolveHost(r.u6u7, dayMatches, 'u6u7'),
          u8u9: resolveHost(r.u8u9, dayMatches, 'u8u9'),
        },
        matches: { u6u7: u67.length, u8u9: u89.length },
      };
    }
    return {
      round: r.round,
      date: r.date,
      status: dayMatches.length > 0 ? 'published' : 'scheduled',
      finalRound: !!r.finalRound,
      hosts: {
        u6u7: resolveHost(r.u6u7, dayMatches, 'u6u7'),
        u8u9: resolveHost(r.u8u9, dayMatches, 'u8u9'),
      },
      matches: { u6u7: u67.length, u8u9: u89.length },
    };
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const oldData = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : null;

  console.log(`Fetching ${SITE.name} ${SEASON} fixtures and results across ${FEEDS.length} club feeds…`);

  const [fixtures, results] = await Promise.all([
    fetchAll('fixtures'),
    fetchAll('results'),
  ]);

  console.log(`  fixtures: ${fixtures.length}`);
  console.log(`  results:  ${results.length}`);

  // Results take priority over fixtures at the round-completion transition.
  const seen = new Set();
  const combined = [];
  for (const item of [...results, ...fixtures]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      combined.push(normalise(item));
    }
  }
  combined.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  const { slugs: TEAM_SLUGS, meta: TEAM_META } = buildTeamSlugs(combined);

  const byComp = {};
  for (const match of combined) {
    if (!byComp[match.compId]) byComp[match.compId] = { name: match.competition, age: match.age, matches: [] };
    byComp[match.compId].matches.push(match);
  }

  // Warn on any venues the API returned that we don't have a config entry for
  // (so the venue panel/map URL fall back to a generic Google Maps search).
  const knownBases = new Set(Object.keys(VENUES));
  const unknownVenues = new Set();
  for (const m of combined) {
    const { base } = parseVenue(m.venue, VENUES);
    if (!base && m.venue) unknownVenues.add(m.venue);
  }
  if (unknownVenues.size) {
    console.warn(`\n⚠️  ${unknownVenues.size} unknown venue(s) — add to VENUES in scripts/config.mjs:`);
    for (const v of [...unknownVenues].sort()) console.warn(`     ${v}`);
  }

  const rounds = buildRoundsSummary(combined);

  const output = {
    updated: new Date().toISOString(),
    season: SEASON,
    site: { name: SITE.name, shortName: SITE.shortName },
    totalMatches: combined.length,
    clubs: Object.fromEntries(Object.entries(CLUBS).map(([k, v]) => [k, { id: v.id, name: v.name, shortPrefix: v.shortPrefix, url: v.url || null, homeGround: v.homeGround || null, primary: v.primary || null, accent: v.accent || null }])),
    teams: TEAM_META,
    competitions: Object.values(byComp),
    rounds,
    matches: combined,
  };

  const changes = detectChanges(oldData, output);

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✓ Written ${combined.length} matches → docs/fixtures.json`);

  if (changes.length > 0) {
    const msg = formatChanges(changes);
    writeFileSync(DIFF_PATH, msg);
    console.log(`\n⚠️  ${changes.length} change(s) detected:\n`);
    console.log(msg);
  } else {
    writeFileSync(DIFF_PATH, '');
    console.log('✓ No changes to upcoming fixtures');
  }

  // Regenerate ICS feeds. Remove any stale .ics files first so a team
  // disappearing from the draw doesn't leave a dead feed in place.
  for (const f of readdirSync(DOCS_DIR)) {
    if (f.endsWith('.ics')) unlinkSync(join(DOCS_DIR, f));
  }
  for (const [slug, teamId] of Object.entries(TEAM_SLUGS)) {
    const ics = generateICS(slug, teamId, TEAM_META[teamId], combined, output.updated);
    writeFileSync(join(DOCS_DIR, `${slug}.ics`), ics);
  }
  console.log(`✓ Written ${Object.keys(TEAM_SLUGS).length} ICS feeds → docs/*.ics`);

  // Emit docs/config.js — the browser-side mirror of the static config plus
  // the dynamically-discovered TEAM_SLUGS / TEAM_META so index.html can build
  // the toolbar without re-fetching the API.
  const configJs = [
    '// Generated by scripts/fetch-fixtures.mjs — do not edit directly.',
    '// Edit scripts/config.mjs and re-run the fetch script.',
    'window.NSM_SUNDAY_CONFIG = {',
    `  SEASON: ${JSON.stringify(SEASON)},`,
    `  SITE_URL: ${JSON.stringify(SITE_URL)},`,
    `  SITE: ${JSON.stringify(SITE, null, 2).replace(/\n/g, '\n  ')},`,
    `  SEASON_END: ${JSON.stringify(SEASON_END)},`,
    `  AGE_GROUPS: ${JSON.stringify(AGE_GROUPS)},`,
    `  CLUBS: ${JSON.stringify(CLUBS, null, 2).replace(/\n/g, '\n  ')},`,
    `  COMPETITIONS: ${JSON.stringify(COMPETITIONS, null, 2).replace(/\n/g, '\n  ')},`,
    `  TEAM_SLUGS: ${JSON.stringify(TEAM_SLUGS, null, 2).replace(/\n/g, '\n  ')},`,
    `  TEAM_META: ${JSON.stringify(TEAM_META, null, 2).replace(/\n/g, '\n  ')},`,
    `  VENUES: ${JSON.stringify(VENUES, null, 2).replace(/\n/g, '\n  ')},`,
    `  ROUNDS: ${JSON.stringify(rounds, null, 2).replace(/\n/g, '\n  ')},`,
    '};',
    '',
  ].join('\n');
  writeFileSync(CFG_PATH, configJs);
  console.log('✓ Written docs/config.js');

  // Per-competition summary.
  console.log('\nCompetition summary:');
  for (const [cid, c] of Object.entries(byComp)) {
    const done = c.matches.filter(m => m.type === 'result').length;
    console.log(`  ${c.name.padEnd(40)} ${done}/${c.matches.length} played`);
  }
  console.log('\nClub coverage:');
  for (const [key, club] of Object.entries(CLUBS)) {
    const teams = Object.values(TEAM_META).filter(t => t.clubKey === key);
    console.log(`  ${club.name.padEnd(28)} ${teams.length} team(s)`);
  }

  console.log('\nRound roll-up:');
  for (const r of rounds) {
    if (r.status === 'bye') {
      console.log(`  R${String(r.round).padStart(2)}  ${'(bye)'.padEnd(13)}  no rugby`);
      continue;
    }
    const tot = r.matches.u6u7 + r.matches.u8u9;
    console.log(`  R${String(r.round).padStart(2)}  ${r.date}  ${r.status.padEnd(10)}  U6/U7→${r.hosts.u6u7 || '?'}  ·  U8/U9→${r.hosts.u8u9 || '?'}  (${tot} match${tot === 1 ? '' : 'es'})`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
