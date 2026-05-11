# North Shore Minis Sunday Rugby — Fixtures

A static GitHub Pages site that mirrors
[`denishoctor/lcjru-fixtures`](https://github.com/denishoctor/lcjru-fixtures)
but for the **North Shore Minis Sunday Rugby** competition view rather than a
single club.

- **Site (once deployed):** https://denishoctor.github.io/north-shore-sunday-minis-comp-app
- **Live draw:** https://xplorer.rugby/sjru-/fixtures-results
- **Reference site:** https://northshore-sunday-minis-rugby.edgeone.app/
- **Upstream template:** [lcjru-fixtures](https://github.com/denishoctor/lcjru-fixtures)

## What this is

Sunday Minis is not a single Rugby Xplorer entity — it's an aggregate of four
SJRU competitions:

| Age | Competition | Rugby Xplorer compId |
|---|---|---|
| U6 | SJRU Minis U6 Tri Time Sunday | `k4rCbcW4BBmPg5qbM` |
| U7 | SJRU Minis U7 Tri Time Sunday | `TvJJeqzzeGJYzMJpw` |
| U8 | SJRU Minis U8 Sunday          | `hvxK25gJJt24GLGPp` |
| U9 | SJRU Minis U9 Sunday          | `PiZpEgvHfG2suQqzp` |

…filtered to a **North Shore club whitelist** (Lane Cove, Chatswood, Hornsby,
KWP, Lindfield, Norths Pirates, Dee Why, Forest, St Ives, Wakehurst —
see [`scripts/config.mjs`](scripts/config.mjs)).

## How it works

```
        ┌──────────────────────┐
        │ Rugby Xplorer        │
        │ GraphQL (public)     │
        └─────────┬────────────┘
                  │ fan-out × 10 clubs (entityType: 'club',
                  │ filtered to Sunday Minis compIds)
                  ▼
        ┌──────────────────────┐
        │ scripts/             │   hourly GitHub Actions cron
        │   fetch-fixtures.mjs │   dedup by match.id
        │   fetch-lineups.mjs  │   diff vs previous run
        └─────────┬────────────┘
                  ▼
        docs/fixtures.json
        docs/config.js        ← derived TEAM_SLUGS for the browser
        docs/<slug>.ics       ← one calendar feed per team
        docs/lineups.json
                  │
                  ▼
        GitHub Pages (static)
```

The fetch script fans out across `FEEDS` (one descriptor per whitelisted
club), dedups matches that appear in both teams' feeds, derives stable slugs
like `lane-cove-u7-gold` / `kwp-u8-lindfield` from team names, and writes one
.ics per slug plus the unified `fixtures.json`.

## Repository structure

| Path | Purpose |
|---|---|
| `scripts/config.mjs`         | Single source of truth: `SEASON`, `FEEDS`, `CLUBS`, `COMPETITIONS`, `VENUES`, `SITE` |
| `scripts/fetch-fixtures.mjs` | Multi-entity fan-out, dedup, ICS + config.js emission |
| `scripts/fetch-lineups.mjs`  | Scrapes match-centre HTML for team sheets |
| `scripts/check.mjs`          | Pre-flight — every team's `.ics` present |
| `scripts/smoke.mjs`          | Local HTTP server + endpoint sanity checks |
| `scripts/generate-icons.py`  | PWA icon generator from the navy-bg logo |
| `docs/index.html`            | UI shell — dynamic toolbar from `TEAM_SLUGS` |
| `docs/render.mjs`            | Pure render helpers (`clubFromCrest`, `slugifyTeam`, …) |
| `docs/manifest.webmanifest`  | PWA manifest |
| `docs/sw.js`                 | Service worker (offline + stale-while-revalidate) |
| `tests/`                     | `node --test` unit tests; offline + one live API probe |
| `.github/workflows/`         | Hourly refresh + manual lineup resync |
| `UPSTREAM_PATCH.md`          | Diff to apply to `lcjru-fixtures` for the backwards-compatible fan-out refactor |

## Local development

```bash
# One-time
npm run setup           # wire up the pre-push hook

# After editing config or scripts, run the fetch against the live API
node scripts/fetch-fixtures.mjs

# Offline checks (no network)
npm run check           # all required files present
npm run smoke           # files serve correctly over a local HTTP server
npm test                # unit tests (render, normalise, fixtures-json, ics, lineup)

# Live API contract probe — also confirms entityType:'competition' works
npm run test:api
```

Serve `docs/` for browser testing:

```bash
npm run serve
```

## Logos & icons — needs your input

This repo references two image files that must be dropped into `docs/assets/`
before the icon generator and the header logo render:

| Filename | Variant | Used by |
|---|---|---|
| `docs/assets/sunday-minis-logo-w-bg.png` | **Cream / off-white background** | `docs/index.html` header crest (sits in a white circular badge frame) |
| `docs/assets/sunday-minis-logo-b-bg.png` | **Navy background** | `scripts/generate-icons.py` source for the four PWA icons |

Once you've saved both:

```bash
pip install Pillow
python3 scripts/generate-icons.py    # produces docs/assets/icon-*.png
```

CI will not run the icon generator (Python step omitted to keep the runner
simple); icons are checked in.

## Setup checklist

1. **Push the branch:** the initial scaffold lives on
   `claude/add-sunday-minis-competition-9BNk6`.
2. **Drop the logo files** into `docs/assets/` (see above) and run
   `python3 scripts/generate-icons.py`.
3. **Set the `NTFY_TOPIC_NSM_SUNDAY` repo secret** if you want fixture-change
   push notifications.
4. **Land the upstream patch** in `denishoctor/lcjru-fixtures`
   (see [UPSTREAM_PATCH.md](UPSTREAM_PATCH.md)) — this lets the aggregate site
   re-derive from the same fetch shape upstream uses.
5. **Enable GitHub Pages** — source: `main` branch, `/docs` folder.
6. **Trigger the workflow once** manually (Actions → Refresh Fixtures →
   Run workflow) so the first `docs/fixtures.json` / `docs/*.ics` / `docs/config.js`
   commit lands.

## Annual update

1. Bump `SEASON` in `scripts/config.mjs`.
2. Confirm the four Sunday Minis competition IDs haven't changed (open one
   draw page on Rugby Xplorer, view `__NEXT_DATA__`, look for `compId`).
3. Run `node scripts/fetch-fixtures.mjs` once to refresh and discover any new
   teams — the slug map regenerates automatically from team names.
4. If a club joins or leaves the SJRU Sunday Minis grading, edit `CLUBS` and
   `FEEDS` in `scripts/config.mjs`.
5. Push. CI takes over from there.

## Open questions / pending

- **Raiders Rugby + Seaforth:** the user flagged these as candidate clubs but
  they don't appear in LCJRU's 2026 Sunday Minis fixtures (post-March SJRU
  restructure may have changed their grading). Their Rugby Xplorer entity IDs
  are unknown. Once the CI runner can probe `entityType: 'competition'`
  (see `tests/api.test.mjs`), any teams from those clubs appearing in the
  comp results will surface as "unknown clubKey" and we can add them.
- **Custom domain:** GitHub Pages default URL ships in v1; CNAME deferred to v1.2.
- **Comp vs club fan-out:** v1 uses per-club fan-out (known-good, mirrors
  upstream). Once `entityType: 'competition'` is verified live, an option to
  add a per-comp descriptor exists in the same `FEEDS` shape — just append
  `{ entityType: 'competition', comps: [{ id }] }` entries.

## Credits

Forked from [`denishoctor/lcjru-fixtures`](https://github.com/denishoctor/lcjru-fixtures);
see [UPSTREAM_PATCH.md](UPSTREAM_PATCH.md) for the divergence point.
