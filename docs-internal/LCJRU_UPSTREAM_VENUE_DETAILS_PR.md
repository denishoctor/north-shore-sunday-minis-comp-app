# PR to apply to `denishoctor/lcjru-fixtures`

**Title:** `chore: enrich VENUES with North Shore home-ground gameday details`

**Branch suggestion:** `chore/venue-details-2026`

## Why

While building the multi-club aggregate at
`denishoctor/north-shore-sunday-minis-comp-app`, I web-searched each of the 10
SJRU Sunday Minis North Shore clubs and gathered parking / canteen / gameday
intel for their home grounds. The same `VENUES` shape is used by upstream
`lcjru-fixtures`, so the same details apply — these are the away grounds LCJRU
families travel to most weekends.

Source for each entry: search-result snippets (mostly clubhouse / council
pages) on 2026-05-12. Wording is paraphrased to fit the
existing terse `details.parking` / `details.coffee` / `details.notes` voice.

Visible to LCJRU users via:
- `docs/venues.html` (full venue cards)
- expandable venue panel on each match card in `docs/index.html`
- the ICS event location string already had the venue name + suburb; this PR
  doesn't touch ICS.

## Verification

```bash
node scripts/fetch-fixtures.mjs   # regenerates docs/config.js + ICS
npm run check                     # all required files present
npm run smoke                     # 7/7 endpoints pass
node --test tests/*.test.mjs      # all tests pass (this is config data only)
```

`docs/venues.html` should render the new `details` blocks. Existing entries
with custom details (Tantallon Oval, Tunks Park, Keirle Park) are untouched.

## Patch — apply to `scripts/config.mjs`

Locate the `VENUES` object. Update these entries (everything else stays):

```diff
   'Beauchamp Park':                  { suburb: 'Chatswood',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Beauchamp+Park+Nicholson+St%2C+Chatswood+NSW+2067%2C+Australia' },
+  'Beauchamp Park':                  { suburb: 'Chatswood',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Beauchamp+Park+Nicholson+St%2C+Chatswood+NSW+2067%2C+Australia',
+    details: {
+      parking: 'Upper carpark off Nicholson St (~15–18 spots) closest to the sportsground. Free 2-hour street parking along Beauchamp Ave, Darling St and Nicholson St rings the park if the carpark is full.',
+      coffee:  { onsite: 'Clubhouse canteen open on game days.' },
+      notes:   'Home of Chatswood Junior Rugby. Council-managed (Willoughby).',
+    },
+  },
```

Apply the same shape to the following entries (final form shown):

```js
'Hassall Park':                    { suburb: 'St Ives',         mapsUrl: '...',
  details: {
    parking: 'Onsite parking exists but fills early on busy weekends — get in by 8am or expect to walk in from surrounding streets.',
    notes:   'Home of St Ives Junior Rugby. Clubhouse jointly run with St Ives Cricket and St Ives Junior Cricket.',
  },
},
'James Morgan Reserve':            { suburb: 'Cromer',          mapsUrl: '...',
  details: {
    notes: 'Home of Dee Why Lions Rugby. Corner of Fisher Rd North and Carawa Rd, Cromer. Council-managed (Northern Beaches).',
  },
},
'Lofberg Oval':                    { suburb: 'West Pymble',     mapsUrl: '...',
  details: {
    parking: 'Wheelchair-accessible carpark; additional parking on the corner of Lofberg Rd and Yanko Rd.',
    coffee:  { onsite: 'Canteen + BBQ in the clubhouse on game days; licensed bar.' },
    notes:   'Home of KWP Rugby. Inside Ku-ring-gai Bicentennial Park — main entrance off Prince of Wales Dr.',
  },
},
'Mark Taylor Oval':                { suburb: 'Waitara',         mapsUrl: '...',
  details: {
    parking: 'Parking along Waitara Ave and Park Ave.',
    coffee:  { onsite: 'New pavilion canteen + community room.' },
    notes:   'Home of Hornsby Rugby. The 2024 pavilion upgrade added accessible change rooms for women’s teams.',
  },
},
'Melwood Oval':                    { suburb: 'Forestville',     mapsUrl: '...',
  details: {
    parking: 'Onsite parking in the War Memorial Playing Fields precinct; can fill at peak times — earlier is better.',
    coffee:  { onsite: 'Canteen with sausage sizzle on game days; coffee van + BBQ in winter.' },
    notes:   'Home of Forest Rugby. 24 Melwood Ave, Forestville. 24/7 publicly-accessible defibrillator on site.',
  },
},
'Tryon Oval':                      { suburb: 'East Lindfield',  mapsUrl: '...',
  details: {
    parking: 'Onsite parking adjacent to the playground; on-street on Tryon Rd if full.',
    notes:   'Home of Lindfield Junior Rugby (100+ years at this ground). Nearest train: Lindfield (North Shore line).',
    // (any existing Tryon map/parking notes can stay alongside or replace this)
  },
},
'Wakehurst Rugby Park':            { suburb: 'Belrose',         mapsUrl: '...',
  details: {
    parking: 'Onsite parking adjacent to the clubhouse.',
    coffee:  { onsite: 'Canteen + BBQ + bar (the canteen is the club’s main fundraiser through the season).' },
    notes:   'Home of Wakehurst Rugby. Clubhouse open to spectators; bathroom + change facilities. Off Waldon Rd, Belrose.',
  },
},
```

**Skip / merge carefully:**
- **`Tantallon Oval`** — upstream already has bespoke `details` (map image,
  parking, coffee, notes). The new content matches what's there; no change
  needed.
- **`Tunks Park`** — upstream already has bespoke `details`. Identical to
  what I'd add; no change needed.
- **`Keirle Park`** — upstream already has a pitch-map image. No change.

## After applying

1. `node scripts/fetch-fixtures.mjs` → regenerates `docs/config.js`
2. Commit + push. CI cron will keep `fixtures.json` in sync on the hourly run.

## Caveats — flag in the PR body

I couldn't WebFetch the club sites directly from the sandbox (Cloudflare
returned 403 for most), so the details above are paraphrased from search
result snippets, not direct quotes from the club's own page. Worth a 5-minute
spot-check before merge — the parents on those committees know the ground
better than any LLM.

The Dee Why / James Morgan Reserve entry is light (only `notes`) because the
search didn't surface specific parking detail. If you have a Dee Why parent
who can add a line, drop it into the same `details` block.

---

This patch is also mirrored in
[`scripts/config.mjs` of north-shore-sunday-minis-comp-app](https://github.com/denishoctor/north-shore-sunday-minis-comp-app/blob/main/scripts/config.mjs)
— the two files diverge on the team/club whitelist but share the venue book
verbatim.
