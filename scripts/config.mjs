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
export const CLUBS = {
  'lane-cove':      { id: 30901, name: 'Lane Cove JRU',          shortPrefix: 'Lane Cove' },
  'chatswood':      { id: 30878, name: 'Chatswood JRU',          shortPrefix: 'Chatswood' },
  'hornsby':        { id: 30898, name: 'Hornsby',                shortPrefix: 'Hornsby' },
  'kwp':            { id: 30900, name: 'Killara–West Pymble',    shortPrefix: 'Killara-West Pymble' },
  'lindfield':      { id: 48060, name: 'Lindfield JRU',          shortPrefix: 'Lindfield' },
  'norths-pirates': { id: 50135, name: 'Norths Pirates',         shortPrefix: 'Norths Pirates' },
  'dee-why':        { id: 53286, name: 'Dee Why',                shortPrefix: 'Dee Why' },
  'forest':         { id: 53322, name: 'Forest Rugby',           shortPrefix: 'Forest' },
  'st-ives':        { id: 53546, name: 'St Ives JRU',            shortPrefix: 'St Ives' },
  'wakehurst':      { id: 53597, name: 'Wakehurst Rugby',        shortPrefix: 'Wakehurst' },

  // Pending entity-ID discovery — uncomment and populate once seen in a live
  // SJRU Sunday Minis fan-out:
  // 'raiders':   { id: null, name: 'Raiders Rugby', shortPrefix: 'Raiders' },
  // 'seaforth':  { id: null, name: 'Seaforth',      shortPrefix: 'Seaforth' },
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
  'Beauchamp Park':                  { suburb: 'Chatswood',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Beauchamp+Park+Nicholson+St%2C+Chatswood+NSW+2067%2C+Australia' },
  'Boronia Park':                    { suburb: 'Hunters Hill',    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Boronia+Park%2C+Park+Rd%2C+Hunters+Hill+NSW+2110%2C+Australia' },
  'Hassall Park':                    { suburb: 'St Ives',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Hassall+Park+Hassell+St%2C+St.+Ives+NSW+2075%2C+Australia' },
  'James Morgan Reserve':            { suburb: 'Cromer',          mapsUrl: 'https://www.google.com/maps/search/?api=1&query=James+Morgan+Reserve+Fisher+Rd+N+%26+Carawa+Rd%2C+Cromer+NSW+2099%2C+Australia' },
  'Keirle Park':                     { suburb: 'Manly',           mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Keirle+Park%2C+Carlton+St%2C+Manly+NSW+2095%2C+Australia' },
  'Lofberg Oval':                    { suburb: 'West Pymble',     mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Lofberg+Oval+Lofberg+Rd%2C+West+Pymble+NSW+2073%2C+Australia' },
  'Mark Taylor Oval':                { suburb: 'Waitara',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mark+Taylor+Oval+Waitara+Ave%2C+Waitara+NSW+2077%2C+Australia' },
  'Mark Taylor Oval (Waitara Oval)': { suburb: 'Waitara',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mark+Taylor+Oval+Waitara+Ave%2C+Waitara+NSW+2077%2C+Australia' },
  'Melwood Oval':                    { suburb: 'Forestville',     mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Melwood+Oval+Melwood+Ave%2C+Forestville+NSW+2087%2C+Australia' },
  'North Narrabeen Reserve':         { suburb: 'Narrabeen',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=North+Narrabeen+Reserve%2C+Pittwater+Rd%2C+Warriewood+NSW+2102%2C+Australia' },
  'Porter Reserve':                  { suburb: 'Newport',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Porter+Reserve%2C+Burke+St%2C+Newport+NSW+2106%2C+Australia' },
  'Rawson Oval':                     { suburb: 'Mosman',          mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Rawson+Oval%2C+Cross+St%2C+Mosman+NSW+2088%2C+Australia' },
  'Tantallon Oval':                  { suburb: 'Lane Cove North', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tantallon+Oval+Lane+Cove+North+NSW+2066%2C+Australia' },
  'Tryon Oval':                      { suburb: 'East Lindfield',  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tryon+Oval+62a+Tryon+Rd%2C+East+Lindfield+NSW+2070%2C+Australia' },
  'Tunks Park':                      { suburb: 'Cammeray',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tunks+Park+Brothers+Ave%2C+Cammeray+NSW+2062%2C+Australia' },
  'Wakehurst Rugby Park':            { suburb: 'Belrose',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Wakehurst+Rugby+Park+Forest+Way+%26+Waldon+Rd%2C+Belrose+NSW+2085%2C+Australia' },
};

export const SITE = {
  name:        'North Shore Minis Sunday Rugby',
  shortName:   'NSM Sunday',
  description: 'Fixtures, results, and team sheets for the North Shore Minis Sunday rugby competition (SJRU U6–U9).',
  themeColor:  '#0b3b8c',
  crestUrl:    'assets/sunday-minis-logo.png',
};
