# Contributing

Hi! This repo runs the **North Shore Minis Sunday Rugby** fixtures site.
It's volunteer-run for the community, no commercial intent. Contributions
welcome — especially fixes for wrong data, missing venues, and broken
parents' weekend mornings.

## What you can contribute

- **Venue intel** — parking tips, coffee notes, pitch-layout photos for
  grounds that don't have details yet. The fastest path is to
  [open an issue](https://github.com/denishoctor/north-shore-sunday-minis-comp-app/issues/new?title=Venue+details:+&labels=venue-details);
  you don't have to touch code.
- **Bug reports** — "my team's missing", "the time is wrong", "the
  calendar won't subscribe". Open an issue with a screenshot.
- **Code fixes** — anything in `scripts/`, `docs/`, `tests/`.
- **New clubs / age groups** — see "Adding a club" below.

## Licence

By submitting a contribution you agree that:

- **Code** (anything under `scripts/`, `tests/`, `docs/render.mjs`, `docs/sw.js`, `docs/index.html`, `docs/venues.html`, `docs/clubs.html`, workflows) will be licensed under **MIT**.
- **Data, documentation, and images** (fixture data, venue details, pitch maps, club crests, Markdown / HTML copy) will be licensed under **CC BY-NC 4.0** — public, attribution required, non-commercial only.

See [`LICENSE`](LICENSE) for the full text.

## Local development

```bash
git clone https://github.com/denishoctor/north-shore-sunday-minis-comp-app.git
cd north-shore-sunday-minis-comp-app
npm run setup            # wires up the pre-push hook

# Bring fixture data in (live API call against Rugby Xplorer)
node scripts/fetch-fixtures.mjs

# Offline checks (no network)
npm run check            # required files present
npm run smoke            # files serve correctly over a local server
npm test                 # unit tests

# Serve docs/ in a browser
npm run serve            # http://localhost:8080
```

Node 20+ is required (see `engines` in `package.json`).

If you can't run the live fetch (e.g. you don't want to hit the upstream
API), set `ALLOW_MISSING_FIXTURES=1` before `npm test` so the data-integrity
tests skip rather than fail:

```bash
ALLOW_MISSING_FIXTURES=1 npm test
```

## Common changes

### Adding a club

1. Edit `CLUBS` in `scripts/config.mjs` — add the new key, the Rugby
   Xplorer `entityId` (open the club's page on Rugby Xplorer, view source,
   search for `entityId`), `shortPrefix` (used to derive team slugs from
   team names), and the home ground.
2. Edit `FEEDS` (also in `scripts/config.mjs`) to add a feed descriptor
   for the club: `{ entityType: 'club', entityId: CLUBS[<key>].id, comps: COMP_IDS.map(id => ({ id })) }`.
3. Run `node scripts/fetch-fixtures.mjs` — slugs, ICS feeds, and
   `docs/config.js` regenerate automatically.
4. `npm test` should still pass.
5. Open a PR.

### Adding a venue

1. Edit `VENUES` in `scripts/config.mjs` — add the venue name as the key,
   plus `suburb`, `mapsUrl`, and (optionally) `details` with parking /
   coffee / notes / map.
2. If you have a pitch-layout photo, drop it in `docs/assets/venues/<slug>.jpg`
   and reference it from `details.map.src`.
3. `npm test`, push, open a PR.

### Updating round-by-round host venues

Edit `ROUNDS` in `scripts/rounds.mjs`. Each entry is `{ round, date, u6u7, u8u9 }`.

### Tests

- Use Node's built-in test runner: `node --test`.
- Put new test files in `tests/*.test.mjs` and register them in the
  `"test"` script in `package.json`.
- Pure-function helpers belong in `docs/render.mjs` and tests in
  `tests/render.test.mjs`.
- For tests that hit the live Rugby Xplorer API, gate behind
  `RUN_LIVE_API_TESTS=1` so default CI stays deterministic — see
  `tests/api.test.mjs` for the pattern.

## Debugging a failing fetch

1. Run `node scripts/fetch-fixtures.mjs` locally — the script logs each
   feed's status. Per-feed failures don't abort the whole run any more,
   so a partial success is normal during transient upstream issues.
2. To inspect a raw GraphQL response, add `console.log(JSON.stringify(json, null, 2))`
   in `fetchPage()` and re-run.
3. To probe the live API directly: `RUN_LIVE_API_TESTS=1 npm run test:api`.
4. Lineup fetches have their own circuit breaker (`scripts/fetch-lineups.mjs`)
   and skip on `continue-on-error` in CI; missing lineups won't gate a
   fixture refresh.

## CI

`.github/workflows/refresh-fixtures.yml` runs hourly and commits the
regenerated `docs/fixtures.json`, `docs/*.ics`, `docs/config.js`, and
`docs/lineups.json` back to `main` if anything changed. The cron is
serialised via a `concurrency` group so two runs can't race.

`workflow_dispatch` is enabled for manual triggers — use it when you
want a faster pick-up than the next hourly slot.

## Where to put what

- Code → `scripts/` (Node) or `docs/` (browser).
- Tests → `tests/`.
- Public docs → `README.md` + `LICENSE`.
- Internal design notes / upstream patch staging → `docs-internal/`.
- Don't put anything that isn't meant to be public into `docs/`; that
  folder is the GitHub Pages publish root.

## Questions

Open an issue — there's no other formal channel.
