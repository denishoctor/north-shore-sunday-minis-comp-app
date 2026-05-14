// Central configuration for north-shore-sunday-minis-comp-app.
//
// The site is a multi-club aggregate of the SJRU Sunday Minis competitions
// (U6/U7 Tri Time + U8/U9 Sunday) scoped to a North Shore club whitelist.
// Update SEASON, FEEDS, CLUBS, COMPETITIONS, and VENUES each year or when
// teams/venues change. This is the single source of truth — imported by the
// fetch script and test files; the browser loads the generated docs/config.js.

export const SEASON   = '2026';
export const SITE_URL = 'https://denishoctor.github.io/north-shore-sunday-minis-comp-app';

// The Sunday Minis competitions on Rugby Xplorer that feed this aggregate.
// Discovered from the LCJRU feed's `compId` / `compName` fields. Update annually
// if SJRU adds/renames/removes age groups or formats (Tri vs Mod vs Tag).
export const COMPETITIONS = {
  'sjru-minis-u6-tri': { id: 'k4rCbcW4BBmPg5qbM', name: 'SJRU Minis U6 Tri Time Sunday', age: 'U6' },
  'sjru-minis-u7-tri': { id: 'TvJJeqzzeGJYzMJpw', name: 'SJRU Minis U7 Tri Time Sunday', age: 'U7' },
  'sjru-minis-u8':     { id: 'hvxK25gJJt24GLGPp', name: 'SJRU Minis U8 Sunday',          age: 'U8' },
  'sjru-minis-u9':     { id: 'PiZpEgvHfG2suQqzp', name: 'SJRU Minis U9 Sunday',          age: 'U9' },
};
export const COMP_IDS = Object.values(COMPETITIONS).map(c => c.id);
export const AGE_GROUPS = ['U6', 'U7', 'U8', 'U9'];

// North Shore club whitelist. Each entry:
//   - id           Rugby Xplorer entity ID (used as feed target and crest /<id>. match)
//   - name         display name on the club filter chip
//   - shortPrefix  removed from team names for the compact toolbar token
// Entity IDs were derived from LCJRU's Sunday Minis fixtures (crest URL pattern
// `https://dpf0m541u9zk8.cloudfront.net/ru/team(?:-full-size)?/<id>.<ext>`).
//
// Raiders Rugby and Seaforth aren't currently visible in LCJRU's Sunday Minis
// fixtures (March 2026 SJRU restructure may have changed their grading). Once
// the CI runner does a per-competition probe, any teams from those clubs that
// appear in the comps will be auto-listed via discoverClubs() in
// fetch-fixtures.mjs. Add them here with the discovered ID to surface them in
// the club filter UI.
// Each entry:
//   id           Rugby Xplorer entity ID (feed target + crest /<id>. match)
//   name         display name on chips / clubs page
//   shortPrefix  stripped from team names for the compact token
//   url          official club site (verified by web-search probe 2026-05-12)
//   homeGround   venue key into VENUES — the club's normal home base
//   primary      primary club colour hex (jersey / crest) — verified by
//                web-search 2026-05-12 for 8 of 10; St Ives + Wakehurst use
//                colours inferred from team naming + retro jersey references
//   accent       secondary club colour hex — used sparingly as a token/chip
//                trim. Falls back to gold if omitted.
export const CLUBS = {
  'lane-cove':      { id: 30901, name: 'Lane Cove JRU',       shortPrefix: 'Lane Cove',
    url: 'https://www.lcjru.com.au/',                            homeGround: 'Tantallon Oval',
    primary: '#0a2059', accent: '#d4a93c' },                        // Royal Blue + Gold + White
  'chatswood':      { id: 30878, name: 'Chatswood JRU',       shortPrefix: 'Chatswood',
    url: 'https://www.chatswoodjuniorrugby.com.au/',             homeGround: 'Beauchamp Park',
    primary: '#1b5e20', accent: '#d4a93c' },                        // Green + Gold (Stags, since 1947)
  'hornsby':        { id: 30898, name: 'Hornsby',             shortPrefix: 'Hornsby',
    url: 'http://hjruc.com.au/',                                 homeGround: 'Mark Taylor Oval',
    primary: '#b71c1c', accent: '#1a1a1a' },                        // Red + Black + Gold (Lions, Waikato-inspired)
  'kwp':            { id: 30900, name: 'Killara–West Pymble', shortPrefix: 'Killara-West Pymble',
    url: 'https://www.kwprugby.com/',                            homeGround: 'Lofberg Oval',
    primary: '#003e7e', accent: '#d4a93c' },                        // Royal Blue + Gold
  'lindfield':      { id: 48060, name: 'Lindfield JRU',       shortPrefix: 'Lindfield',
    url: 'https://www.lindfieldjuniorrugby.com.au/',             homeGround: 'Tryon Oval',
    primary: '#0288d1', accent: '#ffffff' },                        // Sky Blue + White (since 1919)
  'norths-pirates': { id: 50135, name: 'Norths Pirates',      shortPrefix: 'Norths Pirates',
    url: 'https://www.northspirates.rugby/',                     homeGround: 'Tunks Park',
    primary: '#1a1a1a', accent: '#b71c1c' },                        // Black + Red + Gold accent
  'dee-why':        { id: 53286, name: 'Dee Why',             shortPrefix: 'Dee Why',
    url: 'https://deewhylionsrugby.com.au/',                     homeGround: 'James Morgan Reserve',
    primary: '#c62828', accent: '#ffffff' },                        // Red (B&I Lions inspired)
  'forest':         { id: 53322, name: 'Forest Rugby',        shortPrefix: 'Forest',
    url: 'https://forestrugby.com.au/',                          homeGround: 'Melwood Oval',
    primary: '#0b3d1c', accent: '#ffffff' },                        // Bottle Green + White
  'st-ives':        { id: 53546, name: 'St Ives JRU',         shortPrefix: 'St Ives',
    url: 'https://www.stivesrugby.com.au/st-ives-junior-rugby',  homeGround: 'Hassall Park',
    primary: '#1565c0', accent: '#fdd835' },                        // Blue + Yellow (inferred from team naming)
  'wakehurst':      { id: 53597, name: 'Wakehurst Rugby',     shortPrefix: 'Wakehurst',
    url: 'https://www.wakehurst.rugby/',                         homeGround: 'Wakehurst Rugby Park',
    primary: '#039be5', accent: '#1a1a1a' },                        // Light Blue + Black (retro-jersey reference)

  // Pending / not-this-season:
  //
  // 'seaforth' (Seaforth Raiders, raidersrugby.com.au) — confirmed by the club
  //   2026-05-12 that their cohort is moving up to U10 in 2026, so they're
  //   not in the U6–U9 Sunday Minis comp this season. Bring back for 2027
  //   when their grading drops a Sunday Minis side again.
  //
  // 'raiders'  (Raiders Rugby, raidersrugby.com.au) — note: Seaforth and
  //   Raiders are the same club in the SJRU directory. Don't add this twice.
  //
  // If a brand-new SJRU North Shore Sunday Minis club appears mid-season,
  // discover their entity ID via the next live fetch (any team not yet in
  // CLUBS will surface with `clubKey: null` and an "unknown club" warning),
  // then add them here with the verified id.
};

// FEEDS drives the fetch fan-out. Each descriptor is one GraphQL request shape;
// the fetch script paginates and dedups across the union. Per-club fan-out with
// a comps filter is the known-good shape (it's what upstream lcjru-fixtures
// uses, just iterated). Trade-off vs per-competition: we miss any club not on
// this list. The CI runner can also append a per-competition descriptor (see
// discovery probe in fetch-fixtures.mjs) once entityType:'competition' is
// verified against the live endpoint.
export const FEEDS = Object.values(CLUBS)
  .filter(c => c.id != null)
  .map(club => ({
    entityType: 'club',
    entityId:   club.id,
    comps:      COMP_IDS.map(id => ({ id })),  // filter each club's fixtures to Sunday Minis comps only
    teams:      [],                            // no team filter — let comps filter alone scope the response
  }));

// "Season end" replaces upstream's FINAL_ROUND. The Sydney junior rugby season
// wraps in mid-September; date-based check is robust to per-comp round length
// variation and finals draws. UI uses this to switch "what's on" from
// upcoming-only to a season-recap mode.
export const SEASON_END = `${SEASON}-09-15`;  // mid-September AEST

// Sunday Minis games are short (~30 min) so ICS events are 60 minutes by
// default (covers the round + warmup/cooldown).
export const ICS_EVENT_MIN = 60;

// Venue lookup — keyed by the base venue name as it arrives from the API.
// Union of all North Shore Sunday Minis grounds. Update if a new venue appears
// in the fetched data (fetch-fixtures will log unknown venues).
export const VENUES = {
  'Bantry Bay Oval':                 { suburb: 'Seaforth',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Bantry+Bay+Oval+Reserve+St%2C+Seaforth+NSW+2092%2C+Australia' },
  'Beauchamp Park':                  { suburb: 'Chatswood',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Beauchamp+Park+Nicholson+St%2C+Chatswood+NSW+2067%2C+Australia',
    details: {
      parking: 'Upper carpark off Nicholson St (~15–18 spots) closest to the sportsground. Free 2-hour street parking along Beauchamp Ave, Darling St and Nicholson St rings the park if the carpark is full.',
      coffee:  { onsite: 'Clubhouse canteen open on game days.' },
      notes:   'Home of Chatswood Junior Rugby. Council-managed (Willoughby).',
    },
  },
  'Boronia Park':                    { suburb: 'Hunters Hill',    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Boronia+Park%2C+Park+Rd%2C+Hunters+Hill+NSW+2110%2C+Australia' },
  'Hassall Park':                    { suburb: 'St Ives',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Hassall+Park+Hassell+St%2C+St.+Ives+NSW+2075%2C+Australia',
    details: {
      parking: 'Onsite parking exists but fills early on busy weekends — get in by 8am or expect to walk in from surrounding streets.',
      notes:   'Home of St Ives Junior Rugby. Clubhouse jointly run with St Ives Cricket and St Ives Junior Cricket.',
    },
  },
  'James Morgan Reserve':            { suburb: 'Cromer',          mapsUrl: 'https://www.google.com/maps/search/?api=1&query=James+Morgan+Reserve+Fisher+Rd+N+%26+Carawa+Rd%2C+Cromer+NSW+2099%2C+Australia',
    details: {
      notes: 'Home of Dee Why Lions Rugby. Corner of Fisher Rd North and Carawa Rd, Cromer. Council-managed (Northern Beaches).',
    },
  },
  'Keirle Park':                     { suburb: 'Manly',           mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Keirle+Park%2C+Carlton+St%2C+Manly+NSW+2095%2C+Australia',
    details: {
      map: { src: 'assets/venues/keirle-park.jpg', caption: 'Pitch layout — TT1–TT8 plus MOD1, MOD2', asOf: '2026-03' },
    },
  },
  'Lofberg Oval':                    { suburb: 'West Pymble',     mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Lofberg+Oval+Lofberg+Rd%2C+West+Pymble+NSW+2073%2C+Australia',
    details: {
      parking: 'Wheelchair-accessible carpark; additional parking on the corner of Lofberg Rd and Yanko Rd.',
      coffee:  { onsite: 'Canteen + BBQ in the clubhouse on game days; licensed bar.' },
      notes:   'Home of KWP Rugby. Inside Ku-ring-gai Bicentennial Park — main entrance off Prince of Wales Dr.',
    },
  },
  'Mark Taylor Oval':                { suburb: 'Waitara',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mark+Taylor+Oval+Waitara+Ave%2C+Waitara+NSW+2077%2C+Australia',
    details: {
      parking: 'Parking along Waitara Ave and Park Ave.',
      coffee:  { onsite: 'New pavilion canteen + community room.' },
      notes:   'Home of Hornsby Rugby. The 2024 pavilion upgrade added accessible change rooms for women’s teams.',
    },
  },
  'Mark Taylor Oval (Waitara Oval)': { suburb: 'Waitara',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mark+Taylor+Oval+Waitara+Ave%2C+Waitara+NSW+2077%2C+Australia' },
  'Melwood Oval':                    { suburb: 'Forestville',     mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Melwood+Oval+Melwood+Ave%2C+Forestville+NSW+2087%2C+Australia',
    details: {
      parking: 'Onsite parking in the War Memorial Playing Fields precinct; can fill at peak times — earlier is better.',
      coffee:  { onsite: 'Canteen with sausage sizzle on game days; coffee van + BBQ in winter.' },
      notes:   'Home of Forest Rugby. 24 Melwood Ave, Forestville. 24/7 publicly-accessible defibrillator on site.',
    },
  },
  'North Narrabeen Reserve':         { suburb: 'Narrabeen',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=North+Narrabeen+Reserve%2C+Pittwater+Rd%2C+Warriewood+NSW+2102%2C+Australia' },
  'Porter Reserve':                  { suburb: 'Newport',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Porter+Reserve%2C+Burke+St%2C+Newport+NSW+2106%2C+Australia' },
  'Rawson Oval':                     { suburb: 'Mosman',          mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Rawson+Oval%2C+Cross+St%2C+Mosman+NSW+2088%2C+Australia' },
  'Tantallon Oval':                  { suburb: 'Lane Cove North', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tantallon+Oval+Lane+Cove+North+NSW+2066%2C+Australia',
    details: {
      map:     { src: 'assets/venues/tantallon-oval.jpg', caption: 'Pitch layout — TT1–TT4 (A, B, C, D in the draw)', asOf: '2026-05' },
      parking: 'On-site parking via Epping Rd (eastbound) just after Fraser St — limited. Overflow on Fraser St and Tantallon Rd.',
      coffee:  { onsite: 'Clubhouse canteen + bar; cart on game days.' },
      notes:   'Home of Lane Cove Junior Rugby. Corner of Tantallon Rd and Epping Rd. Bus stops on both sides of Epping Rd.',
    },
  },
  'Tryon Oval':                      { suburb: 'East Lindfield',  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tryon+Oval+62a+Tryon+Rd%2C+East+Lindfield+NSW+2070%2C+Australia',
    details: {
      parking: 'Onsite parking adjacent to the playground; on-street on Tryon Rd if full.',
      notes:   'Home of Lindfield Junior Rugby (100+ years at this ground). Nearest train: Lindfield (North Shore line).',
    },
  },
  'Tunks Park':                      { suburb: 'Cammeray',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tunks+Park+Brothers+Ave%2C+Cammeray+NSW+2062%2C+Australia',
    details: {
      map:     { src: 'assets/venues/tunks-park.jpg', caption: 'Pitch layout — TT1–TT6, M1–M2, plus Sports Field 5', asOf: '2026-03' },
      parking: 'Atrocious — consider travelling by boat. Realistically: the Brothers Ave carpark fills before kickoff. Alternates: The Boulevarde (north, walk down past Flat Rock Creek) or Pine St E / Currawang St (south, take the stairs down to the playground). Limited street parking on Brothers Ave itself.',
      coffee:  { onsite: 'Coffee cart at the entrance on game days.', nearby: 'Cafe Carino — short walk.' },
      notes:   'Home of Norths Pirates Junior Rugby (western end). Under the Cammeray Suspension Bridge — allow 5 min to walk in.',
    },
  },
  'Wakehurst Rugby Park':            { suburb: 'Belrose',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Wakehurst+Rugby+Park+Forest+Way+%26+Waldon+Rd%2C+Belrose+NSW+2085%2C+Australia',
    details: {
      map:     { src: 'assets/venues/wakehurst-rugby-park.jpg', caption: 'Pitch layout — TT1 (south-west), TT2 (north-west), TT3 (north-east), TT4 (south-east)', asOf: '2026-05' },
      parking: 'Free open-access carpark next to the clubhouse, plus an overflow carpark on the east side. Drop-off / pick-up zone at the front concrete apron — NO PARKING in that strip on game days.',
      coffee:  { onsite: 'Canteen opens 7:30am (the club’s main fundraiser through the season) + BBQ + bar on the clubhouse deck.' },
      notes:   'Home of Wakehurst Rugby. Entry off Waldon Rd to the south; bushland to the north, Forest Way to the east, Dell St to the west. Clubhouse + bar are upstairs (take the stairs at the eastern end) and overlook the oval. Home/visitors change rooms, male/female/accessible WCs all on the ground floor.',
    },
  },
};

export const SITE = {
  name:        'North Shore Minis Sunday Rugby',
  shortName:   'NSM Sunday',
  description: 'Fixtures, results, and team sheets for the North Shore Minis Sunday rugby competition (SJRU U6–U9).',
  themeColor:  '#0a2059',
  crestUrl:    'assets/sunday-minis-logo-w-bg.png',
};
