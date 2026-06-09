# LCJRU app: Vercel deployment + R5/R6 venue corrections

Handoff for the agent on **`denishoctor/lcjru-fixtures`**. Two things to apply,
mirroring what we just shipped on the North Shore Minis Sunday app
(`denishoctor/north-shore-sunday-minis-comp-app`):

1. **Vercel deployment guidance** — the project settings that make the static
   `docs/` site serve correctly (we hit a 404; the fix is below).
2. **Round 5 & Round 6 data corrections** — venue/time fixes to feed into the
   override mechanism **the LCJRU app already has**. (No code changes — just
   data. This doc does *not* describe how to build an override layer.)

> Both apps read the same Rugby Xplorer GraphQL feed, so match `id`s and venue
> strings are identical across them. Apply these into LCJRU's existing override
> store in whatever shape it expects.

---

## Part 1 — Vercel deployment

The site is **pure static** — no build step. Vercel serves the committed
`docs/` directory and redeploys on every push to `main`.

### Project settings (the part that bit us)
Vercel project → **Settings → Build & Deployment**:

| Setting | Value | Why |
|---|---|---|
| **Root Directory** | `docs` | The site lives in `docs/`, not the repo root. **#1 gotcha** — without it Vercel serves the repo root and `/` returns **404**. |
| **Framework Preset** | `Other` | No framework; static files. |
| **Build Command** | *(empty / overridden off)* | Nothing to build. |
| **Output Directory** | *(leave default)* | With Root Directory = `docs`, Vercel serves `docs/` directly. |
| **Production Branch** | `main` | Auto-deploys on push. |

> Symptom we saw: `https://<project>.vercel.app/` returned **404** because Root
> Directory wasn't `docs`, so Vercel looked for `index.html` at the repo root
> (there isn't one). If you still 404 after setting it, open the failed
> deployment's build log — it names the directory it served and whether it found
> `index.html`.

### `SITE_URL` must match the real domain
The config exports a `SITE_URL` that gets baked into `docs/config.js`, the
`.ics` feed event URLs, and change notifications. **Set it to LCJRU's actual
Vercel domain** (or custom domain), then regenerate so the value propagates to
the derived artifacts.

```js
export const SITE_URL = 'https://<lcjru-domain>';   // no trailing slash
```

(On the NSM app the correct value is `https://nssm-rugby.vercel.app`; LCJRU will
differ — **do not copy ours**.)

### First deploy / bootstrap
1. Import the repo into Vercel; set the project settings above.
2. Ensure `docs/fixtures.json`, `docs/config.js`, `docs/*.ics` exist (committed).
   If never generated, run the fetch once (locally or via the GitHub Action) and
   commit.
3. Push to `main` → Vercel deploys → verify `/` loads and a couple of `.ics`
   feeds download.

---

## Part 2 — Round 5 & Round 6 venue corrections

SJRU swapped two Sunday-Minis host grounds after publishing the draw, and Rugby
Xplorer was never updated. Both corrections are **U6/U7 only** (U8/U9 grounds
are unaffected).

- **Round 5 — Sun 2026-05-31:** moved **Tantallon Oval → Hassall Park**.
  Round is already played, so this is a **ground-name change only** — pitch
  numbers (TT1–TT4) and kick-off times are kept exactly as Xplorer recorded
  them. (19 matches.)
- **Round 6 — Sun 2026-06-14:** moved **Hassall Park → Tantallon Oval**.
  Tantallon has only 4 pitches (TT1–TT4) vs Hassall's 8, so the draw was
  **re-gridded** — pitch *and* kick-off time change for most games; the
  matchups themselves are unchanged from Xplorer. (17 matches.)

### Scope note for the LCJRU app
These are keyed by **global Rugby Xplorer match `id`** — the same ids the LCJRU
app sees. **Apply whichever ids exist in your feed; ignore the rest** (a good
override layer skips ids it can't find). If the LCJRU app only carries Lane
Cove's own fixtures, the relevant subset is:

- **R5:** `c70b0a2c1971a1f71` (Lane Cove Blue 6 v Wakehurst Wombats 6),
  `86933b3e18f2cb807` (Lane Cove Gold 6 v Chatswood Black 6),
  `042cc85ed7137ab67` (Lane Cove Gold 7 v Chatswood Green 7),
  `09a706f5a5775be51` (Wakehurst Warthogs 7 v Lane Cove Blue 7)
- **R6:** `e43cd72e0dd9e092b` (Wakehurst Wombats 6 v Lane Cove Gold 6),
  `e12b40381944afc87` (Norths Pirates Red 6 v Lane Cove Blue 6),
  `a292912e72dd99fec` (Lane Cove Gold 7 v St Ives Blue 7),
  `82fca6f7fb47ef3af` (Lane Cove Blue 7 v Hornsby 7)

But applying the full set below is harmless and future-proofs the app if its
scope is broader than Lane Cove.

### Format notes
- `venue` strings are exactly as the feed produces them: `"<Ground> TT<n> (U6/U7)"`.
  If LCJRU stores base + pitch separately, split on the ` TT<n>` boundary.
- `dateTime` is UTC ISO 8601. AEST = UTC+10 (no DST May–Sep). Note the two date
  conventions present in the feed (`+00:00` vs `Z`) — both parse identically;
  keep whatever your store uses.
- Override **only** `venue` and `dateTime`. Do **not** touch scores, teams, or
  match ids.

### Round 5 — Tantallon Oval → Hassall Park (venue only)

| Xplorer id | Fixture | Was | Now |
|---|---|---|---|
| `665a0daeb25dc4d5d` | U6 Killara-West Pymble Blue 6 v Killara-West Pymble Gold 6 | Tantallon Oval TT1 · 8:00am | Hassall Park TT1 · 8:00am |
| `c08d8993155234f53` | U6 Chatswood Gold 6 v Norths Pirates Gold 6 | Tantallon Oval TT2 · 8:00am | Hassall Park TT2 · 8:00am |
| `c70b0a2c1971a1f71` | U6 Lane Cove Blue 6 v Wakehurst Wombats 6 | Tantallon Oval TT3 · 8:00am | Hassall Park TT3 · 8:00am |
| `ddd4bb16e339a8be6` | U6 St Ives Blue 6 v Forest 6 | Tantallon Oval TT4 · 8:00am | Hassall Park TT4 · 8:00am |
| `4a746db728e32befe` | U6 Norths Pirates Black 6 v St Ives Yellow 6 | Tantallon Oval TT1 · 8:40am | Hassall Park TT1 · 8:40am |
| `86454c8c13e20711e` | U6 Norths Pirates Red 6 v Wakehurst Wallabies 6 | Tantallon Oval TT2 · 8:40am | Hassall Park TT2 · 8:40am |
| `86933b3e18f2cb807` | U6 Lane Cove Gold 6 v Chatswood Black 6 | Tantallon Oval TT3 · 8:40am | Hassall Park TT3 · 8:40am |
| `87e7654310134191f` | U6 Norths Pirates White 6 v Chatswood Green 6 | Tantallon Oval TT4 · 8:40am | Hassall Park TT4 · 8:40am |
| `042cc85ed7137ab67` | U7 Lane Cove Gold 7 v Chatswood Green 7 | Tantallon Oval TT1 · 9:20am | Hassall Park TT1 · 9:20am |
| `09c11f1d1430642b0` | U7 Norths Pirates Red 7 v St Ives Blue 7 | Tantallon Oval TT2 · 9:20am | Hassall Park TT2 · 9:20am |
| `c6a7f2d5456a92c91` | U7 Forest Green 7 v Wakehurst Wildcats 7 | Tantallon Oval TT3 · 9:20am | Hassall Park TT3 · 9:20am |
| `09a706f5a5775be51` | U7 Wakehurst Warthogs 7 v Lane Cove Blue 7 | Tantallon Oval TT4 · 9:20am | Hassall Park TT4 · 9:20am |
| `731eb3ad114121567` | U7 Chatswood Gold 7 v Killara-West Pymble Blue 7 | Tantallon Oval TT1 · 10:00am | Hassall Park TT1 · 10:00am |
| `1b1a6bb9ab725d1d7` | U7 Norths Pirates Black 7 v Forest Black 7 | Tantallon Oval TT2 · 10:00am | Hassall Park TT2 · 10:00am |
| `9a27f04891ce42f2b` | U7 Norths Pirates Gold 7 v Wakehurst Wasps 7 | Tantallon Oval TT3 · 10:00am | Hassall Park TT3 · 10:00am |
| `0d8ea7bdc437bae24` | U7 Hornsby 7 v Lindfield 7 | Tantallon Oval TT4 · 10:00am | Hassall Park TT4 · 10:00am |
| `9845bb8f9ce29c9c8` | U7 Norths Pirates White 7 v St Ives Yellow 7 | Tantallon Oval TT1 · 10:40am | Hassall Park TT1 · 10:40am |
| `31761dbb1b4149253` | U7 Norths Pirates White 7 v Killara-West Pymble Gold 7 | Tantallon Oval TT1 · 11:00am | Hassall Park TT1 · 11:00am |
| `50cff2dba77df8459` | U7 St Ives Yellow 7 v Killara-West Pymble Gold 7 | Tantallon Oval TT1 · 11:20am | Hassall Park TT1 · 11:20am |

### Round 6 — Hassall Park → Tantallon Oval (venue + pitch + time, re-gridded)

| Xplorer id | Fixture | Was | Now |
|---|---|---|---|
| `d28155df222e4db27` | U6 Forest 6 v Wakehurst Wallabies 6 | Hassall Park TT1 · 8:00am | Tantallon Oval TT1 · 8:00am |
| `e43cd72e0dd9e092b` | U6 Wakehurst Wombats 6 v Lane Cove Gold 6 | Hassall Park TT2 · 8:00am | Tantallon Oval TT2 · 8:00am |
| `e12b40381944afc87` | U6 Norths Pirates Red 6 v Lane Cove Blue 6 | Hassall Park TT3 · 8:00am | Tantallon Oval TT3 · 8:00am |
| `b439cf2ec74fafdf5` | U6 Norths Pirates Black 6 v Killara-West Pymble Gold 6 | Hassall Park TT4 · 8:00am | Tantallon Oval TT4 · 8:00am |
| `abe210ffee261eb19` | U6 Norths Pirates Gold 6 v Killara-West Pymble Blue 6 | Hassall Park TT5 · 8:00am | Tantallon Oval TT1 · 8:40am |
| `c7e84830b10300c39` | U6 Norths Pirates White 6 v St Ives Yellow 6 | Hassall Park TT6 · 8:00am | Tantallon Oval TT2 · 8:40am |
| `426b7a7f9219467e0` | U6 Chatswood Gold 6 v St Ives Blue 6 | Hassall Park TT7 · 8:00am | Tantallon Oval TT3 · 8:40am |
| `1acf300dcaeaafd2a` | U6 Chatswood Green 6 v Chatswood Black 6 | Hassall Park TT8 · 8:00am | Tantallon Oval TT4 · 8:40am |
| `2ff3672ec69cdf61e` | U7 St Ives Yellow 7 v Killara-West Pymble Blue 7 | Hassall Park TT1 · 8:40am | Tantallon Oval TT1 · 9:20am |
| `82fca6f7fb47ef3af` | U7 Lane Cove Blue 7 v Hornsby 7 | Hassall Park TT2 · 8:40am | Tantallon Oval TT2 · 9:20am |
| `a292912e72dd99fec` | U7 Lane Cove Gold 7 v St Ives Blue 7 | Hassall Park TT3 · 8:40am | Tantallon Oval TT3 · 9:20am |
| `c983ccac6e99b144d` | U7 Lindfield 7 v Forest Black 7 | Hassall Park TT4 · 8:40am | Tantallon Oval TT4 · 9:20am |
| `f11272bbb3071544b` | U7 Wakehurst Wildcats 7 v Forest Green 7 | Hassall Park TT5 · 8:40am | Tantallon Oval TT1 · 10:00am |
| `b76a9883894dd80b9` | U7 Wakehurst Wasps 7 v Chatswood Green 7 | Hassall Park TT6 · 8:40am | Tantallon Oval TT2 · 10:00am |
| `e5cb3c183d4465bf7` | U7 Wakehurst Warthogs 7 v Chatswood Gold 7 | Hassall Park TT7 · 8:40am | Tantallon Oval TT3 · 10:00am |
| `941ad20b8c3e98b92` | U7 Norths Pirates Red 7 v Norths Pirates White 7 | Hassall Park TT8 · 8:40am | Tantallon Oval TT4 · 10:00am |
| `86fa2a08f3f9eaafb` | U7 Norths Pirates Black 7 v Norths Pirates Gold 7 | Hassall Park TT1 · 9:20am | Tantallon Oval TT1 · 10:40am |

### Machine-readable (all 36, `id → corrected {venue, dateTime}`)

Drop into LCJRU's override store (translate to its schema as needed). `dateTime`
is the authoritative new kick-off in UTC:

```json
{
  "665a0daeb25dc4d5d": { "venue": "Hassall Park TT1 (U6/U7)", "dateTime": "2026-05-30T22:00:00+00:00" },
  "c08d8993155234f53": { "venue": "Hassall Park TT2 (U6/U7)", "dateTime": "2026-05-30T22:00:00+00:00" },
  "c70b0a2c1971a1f71": { "venue": "Hassall Park TT3 (U6/U7)", "dateTime": "2026-05-30T22:00:00+00:00" },
  "ddd4bb16e339a8be6": { "venue": "Hassall Park TT4 (U6/U7)", "dateTime": "2026-05-30T22:00:00+00:00" },
  "4a746db728e32befe": { "venue": "Hassall Park TT1 (U6/U7)", "dateTime": "2026-05-30T22:40:00+00:00" },
  "86454c8c13e20711e": { "venue": "Hassall Park TT2 (U6/U7)", "dateTime": "2026-05-30T22:40:00+00:00" },
  "86933b3e18f2cb807": { "venue": "Hassall Park TT3 (U6/U7)", "dateTime": "2026-05-30T22:40:00+00:00" },
  "87e7654310134191f": { "venue": "Hassall Park TT4 (U6/U7)", "dateTime": "2026-05-30T22:40:00+00:00" },
  "042cc85ed7137ab67": { "venue": "Hassall Park TT1 (U6/U7)", "dateTime": "2026-05-30T23:20:00+00:00" },
  "09c11f1d1430642b0": { "venue": "Hassall Park TT2 (U6/U7)", "dateTime": "2026-05-30T23:20:00+00:00" },
  "c6a7f2d5456a92c91": { "venue": "Hassall Park TT3 (U6/U7)", "dateTime": "2026-05-30T23:20:00+00:00" },
  "09a706f5a5775be51": { "venue": "Hassall Park TT4 (U6/U7)", "dateTime": "2026-05-30T23:20:00+00:00" },
  "731eb3ad114121567": { "venue": "Hassall Park TT1 (U6/U7)", "dateTime": "2026-05-31T00:00:00+00:00" },
  "1b1a6bb9ab725d1d7": { "venue": "Hassall Park TT2 (U6/U7)", "dateTime": "2026-05-31T00:00:00+00:00" },
  "9a27f04891ce42f2b": { "venue": "Hassall Park TT3 (U6/U7)", "dateTime": "2026-05-31T00:00:00+00:00" },
  "0d8ea7bdc437bae24": { "venue": "Hassall Park TT4 (U6/U7)", "dateTime": "2026-05-31T00:00:00+00:00" },
  "9845bb8f9ce29c9c8": { "venue": "Hassall Park TT1 (U6/U7)", "dateTime": "2026-05-31T00:40:00+00:00" },
  "31761dbb1b4149253": { "venue": "Hassall Park TT1 (U6/U7)", "dateTime": "2026-05-31T01:00:00+00:00" },
  "50cff2dba77df8459": { "venue": "Hassall Park TT1 (U6/U7)", "dateTime": "2026-05-31T01:20:00+00:00" },

  "d28155df222e4db27": { "venue": "Tantallon Oval TT1 (U6/U7)", "dateTime": "2026-06-13T22:00:00Z" },
  "e43cd72e0dd9e092b": { "venue": "Tantallon Oval TT2 (U6/U7)", "dateTime": "2026-06-13T22:00:00Z" },
  "e12b40381944afc87": { "venue": "Tantallon Oval TT3 (U6/U7)", "dateTime": "2026-06-13T22:00:00Z" },
  "b439cf2ec74fafdf5": { "venue": "Tantallon Oval TT4 (U6/U7)", "dateTime": "2026-06-13T22:00:00Z" },
  "abe210ffee261eb19": { "venue": "Tantallon Oval TT1 (U6/U7)", "dateTime": "2026-06-13T22:40:00Z" },
  "c7e84830b10300c39": { "venue": "Tantallon Oval TT2 (U6/U7)", "dateTime": "2026-06-13T22:40:00Z" },
  "426b7a7f9219467e0": { "venue": "Tantallon Oval TT3 (U6/U7)", "dateTime": "2026-06-13T22:40:00Z" },
  "1acf300dcaeaafd2a": { "venue": "Tantallon Oval TT4 (U6/U7)", "dateTime": "2026-06-13T22:40:00Z" },
  "2ff3672ec69cdf61e": { "venue": "Tantallon Oval TT1 (U6/U7)", "dateTime": "2026-06-13T23:20:00Z" },
  "82fca6f7fb47ef3af": { "venue": "Tantallon Oval TT2 (U6/U7)", "dateTime": "2026-06-13T23:20:00Z" },
  "a292912e72dd99fec": { "venue": "Tantallon Oval TT3 (U6/U7)", "dateTime": "2026-06-13T23:20:00Z" },
  "c983ccac6e99b144d": { "venue": "Tantallon Oval TT4 (U6/U7)", "dateTime": "2026-06-13T23:20:00Z" },
  "f11272bbb3071544b": { "venue": "Tantallon Oval TT1 (U6/U7)", "dateTime": "2026-06-14T00:00:00Z" },
  "b76a9883894dd80b9": { "venue": "Tantallon Oval TT2 (U6/U7)", "dateTime": "2026-06-14T00:00:00Z" },
  "e5cb3c183d4465bf7": { "venue": "Tantallon Oval TT3 (U6/U7)", "dateTime": "2026-06-14T00:00:00Z" },
  "941ad20b8c3e98b92": { "venue": "Tantallon Oval TT4 (U6/U7)", "dateTime": "2026-06-14T00:00:00Z" },
  "86fa2a08f3f9eaafb": { "venue": "Tantallon Oval TT1 (U6/U7)", "dateTime": "2026-06-14T00:40:00Z" }
}
```

### After applying
- Regenerate the derived artifacts (`fixtures.json`, `config.js`, `*.ics`) and
  verify only the intended ids changed, none added/removed, and the round-host
  roll-up reflects the new dominant venue (R5 U6/U7 → Hassall Park, R6 U6/U7 →
  Tantallon Oval).
- **Remove these entries once the round has passed** so they don't pin a value
  onto a match id forever (R5 is already played; R6 is Sun 14 Jun).
