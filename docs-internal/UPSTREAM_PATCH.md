# Upstream patch for `denishoctor/lcjru-fixtures`

Goal: land a **backwards-compatible** descriptor-list refactor in upstream so
the LCJRU site keeps working unchanged while the NSM Sunday Rugby aggregate
can re-use the same fetch + render pipeline.

This patch was extracted from the work in this repo and is staged here so it
can be applied to `denishoctor/lcjru-fixtures` (Claude Code's GitHub MCP access
in the parent session is repo-scoped — it can't push to lcjru-fixtures
directly).

---

## Strategy: introduce `FEEDS`, keep the single-entity case the default

Upstream today (`scripts/config.mjs`):

```js
export const ENTITY_ID   = 30901;
export const ENTITY_TYPE = 'club';
```

And the fetch loop hard-codes that single entity. Replace with a descriptor
list, defaulting to the existing single-entity shape. The aggregate site sets
`FEEDS` to a 10-element list.

### 1. `scripts/config.mjs`

Add a derived `FEEDS` export that defaults to the existing single-entity shape:

```js
export const SEASON      = '2026';
export const ENTITY_ID   = 30901;
export const ENTITY_TYPE = 'club';
// ... existing exports unchanged ...

// FEEDS drives the fetch fan-out. For LCJRU this is a single descriptor —
// equivalent to today's behaviour. Aggregate sites override with a longer list.
export const FEEDS = [
  {
    entityType: ENTITY_TYPE,
    entityId:   ENTITY_ID,
    comps:      [],
    teams:      LCJRU_TEAM_IDS,
  },
];
```

`LCJRU_TEAM_IDS` already exists; this just packages it into a feed descriptor.

### 2. `scripts/fetch-fixtures.mjs`

Replace the single-entity fetch with a fan-out + dedup. Three changes:

**a. Drop the hard-coded `LCJRU_TEAM_IDS` import (it now flows through `FEEDS`):**

```diff
-import {
-  SEASON, ENTITY_ID, ENTITY_TYPE, SITE_URL, FINAL_ROUND,
-  TEAM_SLUGS, VENUES, LCJRU_TEAM_IDS, MINIS_SLUGS, MINIS_SIBLINGS,
-} from './config.mjs';
+import {
+  SEASON, ENTITY_ID, SITE_URL, FINAL_ROUND, FEEDS,
+  TEAM_SLUGS, VENUES, MINIS_SLUGS, MINIS_SIBLINGS,
+} from './config.mjs';
```

**b. Replace `fetchPage`'s hard-coded variables with the descriptor's variables:**

```diff
 async function fetchPage(type, skip) {
+async function fetchPage(feed, type, skip) {
   const res = await fetch(GRAPHQL_URL, {
     method: 'POST',
     headers: { ... },
     body: JSON.stringify({
       operationName: 'EntityFixturesAndResults',
-      variables: { season: SEASON, comps: [], teams: LCJRU_TEAM_IDS, type, skip, limit: PAGE_SIZE, entityId: ENTITY_ID, entityType: ENTITY_TYPE },
+      variables: { season: SEASON, entityType: feed.entityType, entityId: feed.entityId, comps: feed.comps || [], teams: feed.teams || [], type, skip, limit: PAGE_SIZE },
       query: QUERY,
     }),
   });
```

**c. Wrap pagination in a per-feed loop with dedup on `match.id`:**

```js
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

async function fetchAll(type) {
  const seen = new Map();
  for (const feed of FEEDS) {
    const items = await fetchAllForFeed(feed, type);
    for (const item of items) {
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
  }
  return [...seen.values()];
}
```

Behaviour with the default `FEEDS` (length 1) is **byte-for-byte identical** to
today's single-entity behaviour — same one request, same pagination, same
matches. Asserted by re-running `npm test` and confirming `fixtures.json` is
unchanged after applying the patch.

### 3. Optional — surface the strategy in the JSON output

Replace `entityId: ENTITY_ID` in the output payload with a list, or keep it
for back-compat:

```diff
-    entityId: ENTITY_ID,
+    entityId: ENTITY_ID,                              // kept for back-compat
+    entityIds: FEEDS.map(f => f.entityId).filter(Boolean),
```

Old consumers reading `entityId` continue to work; new consumers can read
`entityIds`.

---

## Verification

1. Apply the patch in a branch (e.g. `feature/multi-entity-feeds`).
2. Run `node scripts/fetch-fixtures.mjs` against the live API.
3. Diff the resulting `docs/fixtures.json` against `main` —
   **expect zero changes** beyond the `updated` timestamp.
4. Run `npm test` — all existing tests should pass without modification.
5. Run `npm run smoke` — same.

If those three are green, the patch is safe to merge to `main`. The aggregate
site then forks from a commit with this patch applied.

---

## Why "upstream first" rather than "diverge now"

Locked in by the user in the kickoff Q&A. Trade-off:

| Path | Pros | Cons |
|---|---|---|
| **Upstream first (chosen)** | Both repos share the fetch loop. NSM aggregate stays close to upstream so improvements (lineups, sw.js tuning, ICS edge cases) flow either way. | Adds one extra PR cycle before the aggregate site can ship. |
| Diverge now | Aggregate site lands today. | Two copies of the same code; bugfixes have to be applied twice. |

Once this PR is merged into upstream, the aggregate repo's fork-base ratchets
to that commit and the divergence becomes a config-only delta.

---

## Files NOT changed upstream by this patch

These are LCJRU-specific and stay where they are:

- `scripts/events.mjs`, `scripts/build-events.mjs` — custom event subsystem
  (Mother's Day, Waratahs etc.); aggregate doesn't carry them.
- `docs/venues.html`, the Tantallon-specific venue details, "tantallon" HOME
  pill check in `docs/index.html` — single-club UI affordances.
- `LC_CREST_PATTERN`, `isLaneCove`, single-club `shortTeamName`, etc. in
  `docs/render.mjs` — those stay; the aggregate ships its own `render.mjs`
  with multi-club helpers (`clubFromCrest`, `clubFromTeam`, `slugifyTeam`,
  neutral `scoreClass`).

The aggregate's `docs/render.mjs` is intentionally a sibling, not a fork —
both files derive from the same shape but encode different display rules.

---

## Open: should some helpers be promoted to a shared package?

Functions that are identical and worth eventually sharing:
`esc`, `parseVenue`, `venueSlug`, `renderVenueDetails`, `fmtDow/fmtDate/fmtTime`,
`rowId`, `icsFold`, `icsEscape`, the ICS scaffolding.

Recommended only if a **third** site joins (avoid premature extraction).
Today, the aggregate copy is intentional and the two files diverge in the
`isLaneCove`-vs-`clubFromCrest` axis only.
