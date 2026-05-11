/**
 * Fetches player lineup (team sheet) data for all matches in the aggregate
 * fixture set from the Rugby Xplorer match-centre page HTML, extracting the
 * __NEXT_DATA__ payload.
 *
 * Confirmed data path (from probe-lineup.mjs):
 *   pageProps.matchData.allMatchStatsSummary.lineUp
 *     .players[]    — starters (isHome distinguishes home vs away)
 *     .substitutes[] — bench players
 *   Each player: { name, shirtNumber, position, isHome, captainType }
 *   shirtNumber = jersey number printed on shirt (display)
 *   position    = rugby position number 1–15 (sort order)
 *
 * Caching: matches played > 15 days ago are locked (skip re-fetch) unless
 * --force-all is passed.
 *
 * Run:  node scripts/fetch-lineups.mjs
 *       node scripts/fetch-lineups.mjs --force-all
 *       node scripts/fetch-lineups.mjs --match 434236a5964c39608
 *
 * --match <id>  Smoke-test mode: fetch one match, print parsed result to
 *               stdout, write nothing to disk. Exit 1 on any failure.
 *               Use this to confirm the pipeline works before a full run.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT          = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_PATH = join(ROOT, 'docs', 'fixtures.json');
const OUT_PATH      = join(ROOT, 'docs', 'lineups.json');

const LOCK_MS   = 15 * 24 * 60 * 60 * 1000;
const forceAll  = process.argv.includes('--force-all');
const matchArg  = (() => { const i = process.argv.indexOf('--match'); return i !== -1 ? process.argv[i + 1] : null; })();

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

// ── parse ─────────────────────────────────────────────────────────────────────
// Exported for unit testing — no network dependency.

export function parseLineupData(pageProps) {
  const matchData = pageProps?.matchData ?? {};
  const stats     = matchData?.allMatchStatsSummary ?? {};
  const lineUp    = stats?.lineUp;

  // Officials: confirmed path is allMatchStatsSummary.referees[]
  // Fields: refereeName, type ("Referee" | "Referee Coach" | …), isActive
  const officials = (stats.referees ?? [])
    .filter(r => r.refereeName && r.isActive !== false)
    .map(r => ({ name: r.refereeName, role: r.type ?? 'Referee' }));

  if (!lineUp) {
    // lineUp is null when no team sheet has been submitted yet
    return { home: [], away: [], homeCoaches: [], awayCoaches: [], officials };
  }

  const allPlayers = [
    ...(lineUp.players     ?? []),
    ...(lineUp.substitutes ?? []),
  ];

  const cleanName = s => (s ?? '').trim().replace(/\s+/g, ' ');
  const normalisePlayer = p => ({
    number:   p.shirtNumber ?? '',
    name:     cleanName(p.name),
    position: p.position ?? '',
    captain:  p.captainType === 'captain',
    isSub:    parseInt(p.position) >= 16,
  });

  // Sort starters 1–15 then bench 16+ by position number
  const sort = arr => arr.slice().sort((a, b) => parseInt(a.position) - parseInt(b.position));

  const home = sort(allPlayers.filter(p => p.isHome  === true )).map(normalisePlayer);
  const away = sort(allPlayers.filter(p => p.isHome  === false)).map(normalisePlayer);

  // Coaches are in lineUp.coaches[] with isHome boolean
  const rawCoaches    = lineUp.coaches ?? [];
  const homeCoaches   = rawCoaches.filter(c => c.isHome === true ).map(c => ({ name: cleanName(c.name) })).filter(c => c.name);
  const awayCoaches   = rawCoaches.filter(c => c.isHome === false).map(c => ({ name: cleanName(c.name) })).filter(c => c.name);

  return { home, away, homeCoaches, awayCoaches, officials };
}

async function fetchLineup(matchId) {
  const url = `https://xplorer.rugby/sjru-/match-centre/${matchId}?tab=Player-Lineup`;
  const res = await fetch(url, {
    headers: {
      'user-agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-AU,en;q=0.9',
      'origin':          'https://xplorer.rugby',
      'referer':         'https://xplorer.rugby/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!m) throw new Error('No __NEXT_DATA__ in response');

  const pageProps = JSON.parse(m[1])?.props?.pageProps ?? {};
  return parseLineupData(pageProps);
}

// ── smoke test (--match <id>) ─────────────────────────────────────────────────

async function smokeTest(matchId) {
  console.log(`Smoke test: fetching lineup for match ${matchId}…`);
  const { home, away, homeCoaches, awayCoaches, officials } = await fetchLineup(matchId);
  if (home.length === 0 && away.length === 0) {
    console.log('  No lineup published for this match (home=0 away=0) — fetch succeeded but sheet is empty.');
  } else {
    console.log(`  ✓ home=${home.length} players, away=${away.length} players`);
    if (home.length) console.log(`  First home player: #${home[0].number} ${home[0].name}`);
    if (away.length) console.log(`  First away player: #${away[0].number} ${away[0].name}`);
  }
  if (homeCoaches.length || awayCoaches.length)
    console.log(`  Coaches: home=${homeCoaches.map(c=>c.name).join(', ')||'none'}  away=${awayCoaches.map(c=>c.name).join(', ')||'none'}`);
  if (officials.length)
    console.log(`  Officials: ${officials.map(o => `${o.role} ${o.name}`).join(', ')}`);
  else
    console.log('  Officials: none found (may not be published for this grade)');
  console.log('\nFull result:');
  console.log(JSON.stringify({ home, away, homeCoaches, awayCoaches, officials }, null, 2));
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (matchArg) {
    await smokeTest(matchArg);
    return;
  }

  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const existing = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : {};
  const now      = Date.now();

  const toFetch = fixtures.matches.filter(m => {
    if (m.isBye) return false;
    const gameMs   = new Date(m.dateTime).getTime();
    const isLocked = existing[m.id] && (now - gameMs) > LOCK_MS;
    return forceAll || !isLocked;
  });

  const locked = fixtures.matches.filter(m => !m.isBye).length - toFetch.length;
  console.log(`Fetching lineups: ${toFetch.length} matches (${locked} locked historic, forceAll=${forceAll})…`);

  const lineups = { ...existing };
  let fetched = 0, errors = 0;

  for (const match of toFetch) {
    try {
      const { home, away, homeCoaches, awayCoaches, officials } = await withRetry(() => fetchLineup(match.id));
      lineups[match.id] = {
        gameDateTime: match.dateTime,
        fetchedAt:    new Date().toISOString(),
        home,
        away,
        homeCoaches,
        awayCoaches,
        officials,
      };
      console.log(`  ✓ ${match.id}: home=${home.length} away=${away.length}`);
      fetched++;
    } catch (err) {
      console.warn(`  ✗ ${match.id}: ${err.message}`);
      if (!lineups[match.id]) {
        lineups[match.id] = { gameDateTime: match.dateTime, fetchedAt: null, home: [], away: [] };
      }
      errors++;
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(lineups, null, 2));
  console.log(`\n✓ Written ${Object.keys(lineups).length} entries → docs/lineups.json (fetched ${fetched}, errors ${errors})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
