# Porting to the LCJRU app: match overrides + Vercel deployment

Handoff spec for the agent working on **`denishoctor/lcjru-fixtures`**. This
describes two things we built/verified on the North Shore Minis Sunday app
(`denishoctor/north-shore-sunday-minis-comp-app`) and now want mirrored on
LCJRU:

1. **A match-override layer** — manual corrections applied on top of the live
   Rugby Xplorer feed, so a wrong/stale venue or kick-off time can be fixed and
   the fix *survives every future fetch*.
2. **Vercel static deployment** — the exact project settings that make the
   `docs/` site serve correctly (we hit a 404 here and the fix is documented).

> The two apps share a common lineage (this app was derived from
> `lcjru-fixtures/scripts/events.mjs`), so the file layout below should map
> almost 1:1. **Adapt names, domains, competition IDs and file paths to LCJRU's
> actual structure** — don't assume every filename matches. Where LCJRU already
> has the fetch pipeline, you only need Part 1 + Part 2; nothing else changes.

---

## Background: how the data pipeline works (reference)

`scripts/fetch-fixtures.mjs` fans out across club feeds on the Rugby Xplorer
GraphQL endpoint (`https://rugby-au-cms.graphcdn.app/`), dedups by match `id`,
normalises, and writes four kinds of artifact into `docs/`:

```
docs/fixtures.json   normalised match list + club/team/round metadata
docs/config.js       window.* config consumed by the browser (no API at runtime)
docs/<slug>.ics      one calendar feed per team
changes.txt          non-empty when an upcoming fixture changed (triggers ntfy)
```

A GitHub Actions cron (`.github/workflows/refresh-fixtures.yml`, hourly) runs
the fetch, commits the regenerated `docs/*`, and pushes to `main`. Vercel
auto-deploys on every push to `main`. **Rugby Xplorer is the source of truth**
for everything — which is exactly why we need an override layer for the cases
where Xplorer is wrong.

---

## Part 1 — Match override layer

### Why
SJRU/LCJRU occasionally move a host ground *after* publishing the draw, and
Rugby Xplorer is never updated. A plain edit to `docs/fixtures.json` would be
overwritten on the next hourly fetch. The override layer lives in **config**
and is **re-applied on every fetch**, so the correction is durable.

### Design (3 pieces)

#### 1a. Declare overrides in config — `scripts/config.mjs`

Add an exported `MATCH_OVERRIDES` map, keyed by the **Rugby Xplorer match
`id`** (stable across fetches). Each entry overrides only the fields it lists
(`venue` and/or `dateTime`). `round`/`home`/`away` are documentation **and** a
safety guard.

```js
// ── Match overrides ────────────────────────────────────────────────────────
// Manual corrections layered on top of the live Rugby Xplorer feed. Xplorer is
// the source of truth for almost everything, but occasionally a venue or time
// is wrong/stale — most often when a host ground moves after the draw is
// published and Xplorer is never updated. Keyed by Xplorer match `id`.
// Only the listed fields (venue / dateTime, dateTime in ISO 8601 / UTC) are
// replaced. round/home/away are documentation + a safety guard: applyOverrides
// only applies an entry when the live match for that id still has the expected
// teams, else it logs a warning and skips it. Delete entries once the round
// has passed (or Xplorer is fixed upstream).
export const MATCH_OVERRIDES = {
  // Example — Round 6 host moved Hassall Park → Tantallon Oval; Xplorer still
  // lists Hassall. Tantallon has only 4 fields, so pitch + kick-off changed too.
  'd28155df222e4db27': {
    round: 'Round 6',
    home:  'Forest 6',
    away:  'Wakehurst Wallabies 6',
    venue: 'Tantallon Oval TT1 (U6/U7)',
    dateTime: '2026-06-13T22:00:00Z',
  },
  // ...one entry per affected match...
};
```

Notes:
- **`venue` format must match what the feed produces** so `parseVenue()` still
  splits base/pitch. On this app that's `"<Ground> TT<n> (U6/U7)"`. LCJRU's
  venue strings may differ — copy the exact shape from an existing
  `docs/fixtures.json` match and just swap the ground/pitch.
- **`dateTime`** is UTC ISO 8601. AEST = UTC+10 (no DST May–Sep). Omit the
  field entirely if the time is unchanged — then it's left untouched.
- Keep the `home`/`away` strings **exactly** as they appear in the feed
  (e.g. `"Forest 6"`, not `"Forest"`), or the safety guard will skip the entry.

#### 1b. Apply them in the pipeline — `scripts/fetch-fixtures.mjs`

Import the map and add an `applyOverrides()` function. This is verbatim what we
shipped:

```js
import { /* …, */ MATCH_OVERRIDES } from './config.mjs';

// Apply MATCH_OVERRIDES over the live feed in place. Keyed by Xplorer match id;
// only listed fields (venue / dateTime) are replaced. Safety guard: apply only
// when the live match for that id still has the expected home/away teams, so a
// recycled id can't silently mislabel a different game.
export function applyOverrides(matches, overrides = MATCH_OVERRIDES) {
  if (!overrides) return matches;
  const applied = new Set();
  for (const m of matches) {
    const ov = overrides[m.id];
    if (!ov) continue;
    if ((ov.home && m.home.name !== ov.home) || (ov.away && m.away.name !== ov.away)) {
      console.warn(`⚠️  override ${m.id} skipped — live match is "${m.home.name} vs ${m.away.name}", expected "${ov.home} vs ${ov.away}"`);
      continue;
    }
    if (ov.venue != null)    m.venue = ov.venue;
    if (ov.dateTime != null) m.dateTime = ov.dateTime;
    applied.add(m.id);
  }
  const missing = Object.keys(overrides).filter(id => !applied.has(id));
  if (missing.length) console.warn(`⚠️  ${missing.length} override(s) had no matching fixture (already passed / id changed?): ${missing.join(', ')}`);
  if (applied.size)   console.log(`✓ Applied ${applied.size} match override(s)`);
  return matches;
}
```

**Wiring — critical ordering.** Call `applyOverrides()` right after the
normalised match list is assembled and **before** the chronological sort and
before any artifact is built. An override can change a kick-off time, which
changes sort order, which changes round host resolution and `.ics` output:

```js
// after `combined` is built (fetched + normalised, or loaded from cache):
applyOverrides(combined);
combined.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
// …then build fixtures.json / config.js / *.ics from `combined`
```

If LCJRU's `main()` is one long function, it's worth extracting everything
after the sort into a `buildAndWrite(combined, oldData)` helper (we did) — it
makes 1c trivial.

#### 1c. Rebuild-from-cache flag (so you can land a fix without the API)

Add a `--from-cache` path to `main()` that skips the network fetch and reuses
the matches already in `docs/fixtures.json`, then runs the same
override→sort→build path. Overrides are idempotent (they *set* a value, not
toggle it), so re-applying over cached data is safe. This is how you apply a
correction in environments where the Rugby Xplorer endpoint is unreachable
(e.g. a sandbox with an outbound allowlist):

```js
const fromCache = process.argv.includes('--from-cache');
let combined;
if (fromCache) {
  if (!oldData?.matches?.length) throw new Error('--from-cache: no docs/fixtures.json to rebuild from.');
  console.log(`Rebuilding from cached docs/fixtures.json (${oldData.matches.length} matches) — no live fetch…`);
  combined = oldData.matches.map(m => ({ ...m, home: { ...m.home }, away: { ...m.away } }));
} else {
  // …existing fetch + normalise into `combined`…
}
applyOverrides(combined);
combined.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
buildAndWrite(combined, oldData);
```

### How to author an override (workflow for the LCJRU agent)

1. Find the affected matches in `docs/fixtures.json` and copy their **`id`**,
   `home.name`, `away.name`, and current `venue`/`dateTime`.
2. Add `MATCH_OVERRIDES` entries with the corrected `venue`/`dateTime`. Tip:
   generate them with a small Node one-liner over `fixtures.json` to avoid
   transcription errors (we did this for a 19-match round).
3. Regenerate locally **without hitting the API**:
   ```bash
   node scripts/fetch-fixtures.mjs --from-cache
   ```
   Confirm the console prints `✓ Applied N match override(s)` and **no**
   `skipped` / `no matching fixture` warnings.
4. Verify: re-read `fixtures.json` — only the intended match `id`s should
   differ vs the previous commit (none added/removed), the round-host roll-up
   should reflect the new dominant venue, and the affected `*.ics` files should
   show the new LOCATION / DTSTART.
5. Run the test suite (`npm test`) — it should stay green.
6. Commit `scripts/config.mjs`, `scripts/fetch-fixtures.mjs` (first time only),
   and the regenerated `docs/*`.

### Maintenance (important)
**Delete override entries once the round has been played** (or once Xplorer is
corrected upstream). Stale entries keep forcing values onto a match `id`
forever; if Xplorer ever recycles that id for a different game the safety guard
will skip it (good) but you'll get a noisy warning. Each entry's comment should
say when to remove it.

---

## Part 2 — Vercel deployment

The site is **pure static** — there is no build step. Vercel just serves the
committed `docs/` directory and redeploys on every push to `main`.

### Project settings (the part that bit us)
In the Vercel project → **Settings → Build & Deployment**:

| Setting | Value | Why |
|---|---|---|
| **Root Directory** | `docs` | The site lives in `docs/`, not the repo root. **This is the #1 gotcha** — without it Vercel serves the repo root and you get a 404 at `/`. |
| **Framework Preset** | `Other` | No framework; static files. |
| **Build Command** | *(empty / overridden off)* | Nothing to build. |
| **Output Directory** | *(leave default)* | With Root Directory = `docs`, Vercel serves `docs/` directly. |
| **Production Branch** | `main` | Auto-deploys on push. |

> Symptom we saw: `https://<project>.vercel.app/` returned **404** because Root
> Directory wasn't set to `docs`, so Vercel looked for an `index.html` at the
> repo root (there isn't one). Setting Root Directory = `docs` fixed it. If you
> still 404 after setting it, open the failed deployment's build log — it names
> the directory it served and whether it found `index.html`.

### `SITE_URL` must match the real domain
`scripts/config.mjs` exports `SITE_URL`, which is baked into `docs/config.js`,
the `.ics` feeds (event URLs), and change notifications. **Set it to LCJRU's
actual Vercel domain** (e.g. `https://<lcjru-project>.vercel.app` or a custom
domain), then regenerate so the value propagates:

```js
export const SITE_URL = 'https://<lcjru-domain>';   // no trailing slash
```
```bash
node scripts/fetch-fixtures.mjs --from-cache   # rebuilds config.js + *.ics with the new URL
```

(On this app the correct value is `https://nssm-rugby.vercel.app`; LCJRU will
differ — do not copy ours.)

### First deploy / bootstrap
1. Import the repo into Vercel; set the project settings above.
2. Ensure `docs/fixtures.json`, `docs/config.js` and `docs/*.ics` exist
   (committed). If the repo has never run the fetch, trigger the GitHub Action
   once (**Actions → Refresh Fixtures → Run workflow**) to generate them, or run
   `node scripts/fetch-fixtures.mjs` locally and commit.
3. Push to `main` → Vercel deploys → verify `/` loads and a couple of `.ics`
   feeds download.

---

## Acceptance checklist for the LCJRU agent

- [ ] `MATCH_OVERRIDES` exported from config; at least one real correction added.
- [ ] `applyOverrides()` added and called **before** the sort + artifact build.
- [ ] `--from-cache` flag works (`node scripts/fetch-fixtures.mjs --from-cache`
      prints `✓ Applied N match override(s)`, no skip/no-match warnings).
- [ ] Regenerated `docs/*`; only the intended match ids differ; tests green.
- [ ] Hourly Action still runs the fetch (overrides re-apply automatically).
- [ ] Vercel: Root Directory = `docs`, Framework = Other, prod branch = `main`.
- [ ] `SITE_URL` set to LCJRU's real domain and propagated into `config.js`/`.ics`.
- [ ] `/` loads (no 404) and `.ics` feeds reflect overridden venues/times.

## Reference commits on the NSM app
- Override mechanism + Round 6 correction (Hassall → Tantallon, re-gridded draw).
- Round 5 correction (Tantallon → Hassall, ground-name-only on a played round).
- Earlier: Vercel hosting fix (Root Directory = `docs`, corrected `SITE_URL`).

Look at `scripts/config.mjs` (`MATCH_OVERRIDES`) and `scripts/fetch-fixtures.mjs`
(`applyOverrides`, `--from-cache`, `buildAndWrite`) in this repo for the
canonical, working implementation.
