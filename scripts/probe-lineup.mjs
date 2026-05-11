/**
 * Diagnostic probe — run locally to discover the actual Rugby Xplorer API
 * response structure for a match lineup.
 *
 * Usage:
 *   node scripts/probe-lineup.mjs <matchId>
 *   node scripts/probe-lineup.mjs 434236a5964c39608
 *
 * Outputs:
 *   1. Result of GraphQL GetMatchLineup query (full JSON)
 *   2. All __NEXT_DATA__ pageProps keys from the HTML page
 *   3. Full pageProps JSON (so you can find the player list path)
 *
 * Take the output and tell Claude which field path contains the player array.
 */

const matchId = process.argv[2];
if (!matchId) {
  console.error('Usage: node scripts/probe-lineup.mjs <matchId>');
  console.error('Example: node scripts/probe-lineup.mjs 434236a5964c39608');
  process.exit(1);
}

const GRAPHQL_URL = 'https://rugby-au-cms.graphcdn.app/';
const sep = '─'.repeat(60);

// ── 1. GraphQL introspection: what queries exist? ──────────────────────────────
console.log(`\n${sep}`);
console.log('1. GraphQL schema — available query fields');
console.log(sep);

try {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin':  'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
    body: JSON.stringify({
      query: '{ __schema { queryType { fields { name args { name type { name kind ofType { name kind } } } } } } }',
    }),
  });
  const json = await res.json();
  const fields = json?.data?.__schema?.queryType?.fields ?? [];
  console.log('Available queries:');
  for (const f of fields) {
    const args = f.args.map(a => {
      const t = a.type.ofType ? `${a.type.kind}<${a.type.ofType.name}>` : a.type.name;
      return `${a.name}: ${t}`;
    }).join(', ');
    console.log(`  ${f.name}(${args})`);
  }
} catch (err) {
  console.log(`  GraphQL introspection failed: ${err.message}`);
}

// ── 2. GraphQL: try match-specific queries ─────────────────────────────────────
const matchQueries = [
  { name: 'getMatch', query: `{ getMatch(matchId: "${matchId}") { id homeTeam { id name } awayTeam { id name } } }` },
  { name: 'getMatchLineup', query: `{ getMatchLineup(matchId: "${matchId}") { id } }` },
  { name: 'getMatchById', query: `{ getMatchById(id: "${matchId}") { id } }` },
];

console.log(`\n${sep}`);
console.log('2. GraphQL — match-specific queries');
console.log(sep);

for (const { name, query } of matchQueries) {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin':  'https://xplorer.rugby',
        'referer': 'https://xplorer.rugby/',
      },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    if (json.errors) {
      console.log(`  ${name}: ERROR — ${json.errors.map(e => e.message).join('; ')}`);
    } else {
      console.log(`  ${name}: OK`);
      console.log(JSON.stringify(json.data, null, 2));
    }
  } catch (err) {
    console.log(`  ${name}: FETCH FAILED — ${err.message}`);
  }
}

// ── 3. HTML __NEXT_DATA__ ─────────────────────────────────────────────────────
console.log(`\n${sep}`);
console.log('3. HTML page — __NEXT_DATA__ pageProps');
console.log(sep);

const url = `https://xplorer.rugby/sjru-/match-centre/${matchId}?tab=Player-Lineup`;
console.log(`Fetching: ${url}\n`);

try {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'en-AU,en;q=0.9',
      'origin':  'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
  });

  console.log(`HTTP status: ${res.status} ${res.statusText}`);
  const html = await res.text();
  console.log(`Response size: ${html.length} bytes`);
  console.log(`First 500 chars: ${html.slice(0, 500).replace(/\s+/g, ' ')}\n`);

  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!m) {
    console.log('No __NEXT_DATA__ script tag found in HTML.');
  } else {
    const nextData = JSON.parse(m[1]);
    const pageProps = nextData?.props?.pageProps ?? {};
    console.log('pageProps top-level keys:', Object.keys(pageProps).sort());
    console.log('\nFull pageProps:');
    console.log(JSON.stringify(pageProps, null, 2));
  }
} catch (err) {
  console.log(`HTML fetch failed: ${err.message}`);
}
