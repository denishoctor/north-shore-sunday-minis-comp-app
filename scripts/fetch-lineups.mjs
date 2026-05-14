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
const FETCH_TIMEOUT_MS = 8000;            // per-request hard ceiling
const CIRCUIT_BREAKER  = 6;               // consecutive failures → abort the loop
const SAVE_EVERY       = 25;              // checkpoint lineups.json every N matches
const URL_PATTERNS = [
  // Match-centre URLs on Rugby Xplorer are scoped to a tenant slug but the
  // match data is global, so any *valid* slug renders the same sheet. Manual
  // probe (2026-05-12, user-confirmed):
  //   /sjru-/    → ERR_CONNECTION_ABORTED  (no such tenant — don't try)
  //   /lcjru-/   → works, renders Player Lineup tab
  //   no prefix  → 404
  // So we pin to /lcjru-/ as the primary. The no-prefix entry stays as a
  // forward-looking fallback in case Rugby Xplorer moves to a clean URL scheme
  // and starts redirecting from the tenant-prefixed routes.
  (id) => `https://xplorer.rugby/lcjru-/match-centre/${id}?tab=Player-Lineup`,
  (id) => `https://xplorer.rugby/match-centre/${id}?tab=Player-Lineup`,
];

const forceAll  = process.argv.includes('--force-all');
const matchArg  = (() => { const i = process.argv.indexOf('--match'); return i !== -1 ? process.argv[i + 1] : null; })();

// ── fetch ─────────────────────────────────────────────────────────────────────

async function withRetry(fn, attempts = 2) {
  let delay = 1500;
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

  // Tag each entry by the array it came from, so isSub doesn't rely on
  // parseInt(position) — which silently mis-labelled non-numeric position
  // codes (e.g. "B", "R", "—") as starters because parseInt → NaN, and
  // NaN >= 16 is false.
  const allPlayers = [
    ...(lineUp.players     ?? []).map(p => ({ ...p, _fromSubs: false })),
    ...(lineUp.substitutes ?? []).map(p => ({ ...p, _fromSubs: true  })),
  ];

  const cleanName = s => (s ?? '').trim().replace(/\s+/g, ' ');
  const normalisePlayer = p => ({
    number:   p.shirtNumber ?? '',
    name:     cleanName(p.name),
    position: p.position ?? '',
    captain:  p.captainType === 'captain',
    isSub:    p._fromSubs,
  });

  // Sort by position, but keep non-numeric positions (NaN) stable at the end.
  const sort = arr => arr.slice().sort((a, b) => {
    const pa = parseInt(a.position), pb = parseInt(b.position);
    if (Number.isNaN(pa) && Number.isNaN(pb)) return 0;
    if (Number.isNaN(pa)) return 1;
    if (Number.isNaN(pb)) return -1;
    return pa - pb;
  });

  const home = sort(allPlayers.filter(p => p.isHome  === true )).map(normalisePlayer);
  const away = sort(allPlayers.filter(p => p.isHome  === false)).map(normalisePlayer);

  // Coaches are in lineUp.coaches[] with isHome boolean
  const rawCoaches    = lineUp.coaches ?? [];
  const homeCoaches   = rawCoaches.filter(c => c.isHome === true ).map(c => ({ name: cleanName(c.name) })).filter(c => c.name);
  const awayCoaches   = rawCoaches.filter(c => c.isHome === false).map(c => ({ name: cleanName(c.name) })).filter(c => c.name);

  return { home, away, homeCoaches, awayCoaches, officials };
}

// First call probes URL_PATTERNS to find the one Rugby Xplorer accepts for this
// run; subsequent calls reuse the cached index. Lets us cope with the
// /sjru-/ vs /lcjru-/ slug uncertainty without doing the probe per match.
let workingPatternIdx = 0;

async function fetchLineupFromPattern(matchId, patternIdx) {
  const url = URL_PATTERNS[patternIdx](matchId);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        // We hit a public Next.js page Rugby Xplorer is happy to render for
        // browsers, so we keep a current Chrome fingerprint. The
        // `nsm-sunday-fixtures` token + URL is appended so an admin
        // investigating their access logs can find us and reach out instead
        // of blanket-blocking; the `From` header gives them a direct contact.
        'user-agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 nsm-sunday-fixtures/0.1 (+https://github.com/denishoctor/north-shore-sunday-minis-comp-app)',
        'from':            'https://github.com/denishoctor/north-shore-sunday-minis-comp-app/issues',
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
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLineup(matchId) {
  // Try cached working pattern first (cheap when it works).
  try {
    return await fetchLineupFromPattern(matchId, workingPatternIdx);
  } catch (err) {
    // On miss, sweep remaining patterns once; the first that works becomes the
    // new cached index. AbortError still bubbles up — no point sweeping if we
    // timed out the network.
    if (err.name === 'AbortError') throw err;
    for (let i = 0; i < URL_PATTERNS.length; i++) {
      if (i === workingPatternIdx) continue;
      try {
        const result = await fetchLineupFromPattern(matchId, i);
        workingPatternIdx = i;
        console.log(`  ↪ switched URL pattern to index ${i}`);
        return result;
      } catch { /* keep trying */ }
    }
    throw err;
  }
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
  let fetched = 0, errors = 0, consecutiveFails = 0;
  let circuitTripped = false;
  const saveCheckpoint = () => writeFileSync(OUT_PATH, JSON.stringify(lineups, null, 2));

  for (let i = 0; i < toFetch.length; i++) {
    const match = toFetch[i];
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
      consecutiveFails = 0;
    } catch (err) {
      console.warn(`  ✗ ${match.id}: ${err.message}`);
      if (!lineups[match.id]) {
        lineups[match.id] = { gameDateTime: match.dateTime, fetchedAt: null, home: [], away: [] };
      }
      errors++;
      consecutiveFails++;
      if (consecutiveFails >= CIRCUIT_BREAKER && fetched === 0) {
        // No lineup ever published successfully + N in a row failing → the
        // URL pattern is wrong or Rugby Xplorer is gating us. Bail rather
        // than burn another half-hour trying the remaining matches.
        console.error(`\n⚠ Circuit breaker tripped after ${consecutiveFails} consecutive failures with zero successes.`);
        console.error('   Skipping the remaining matches and writing what we have.');
        circuitTripped = true;
        break;
      }
    }
    if ((i + 1) % SAVE_EVERY === 0) saveCheckpoint();
  }

  saveCheckpoint();
  console.log(`\n✓ Written ${Object.keys(lineups).length} entries → docs/lineups.json (fetched ${fetched}, errors ${errors}${circuitTripped ? ', circuit-broken' : ''})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
