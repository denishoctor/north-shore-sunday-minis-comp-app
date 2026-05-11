// Pure render helpers — no DOM or config dependencies.
// Imported by index.html (<script type="module">), scripts/fetch-fixtures.mjs,
// and tests/render.test.mjs.

function _genericMapsUrl(display) {
  return `https://maps.google.com/?q=${encodeURIComponent(display + ', Sydney NSW')}`;
}

export function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── club lookup ──────────────────────────────────────────────────────────────
// Crests follow the pattern .../team/<entityId>.png or .../team-full-size/<entityId>.jpg.
// Match the entityId against the configured CLUBS map.
export function clubFromCrest(crest, clubs) {
  if (!crest || !clubs) return null;
  const m = String(crest).match(/\/(\d+)\.(?:jpg|png|jpeg|webp)/i);
  if (!m) return null;
  const id = Number(m[1]);
  for (const [key, club] of Object.entries(clubs)) {
    if (club.id === id) return key;
  }
  return null;
}

// Two-pass team→club lookup: crest first (canonical, entity-keyed), then a
// shortPrefix scan against the team name (covers joint teams where the crest
// belongs to one of the two clubs).
export function clubFromTeam(team, clubs) {
  if (!team || !clubs) return null;
  const fromCrest = clubFromCrest(team.crest, clubs);
  if (fromCrest) return fromCrest;
  const name = String(team.name || '').toLowerCase();
  for (const [key, club] of Object.entries(clubs)) {
    const prefix = String(club.shortPrefix || '').toLowerCase();
    if (prefix && name.startsWith(prefix.toLowerCase())) return key;
  }
  return null;
}

// Slug shape: <clubKey>-<u#>-<variant>
//   "Lane Cove Gold 7"                → lane-cove-u7-gold
//   "Lane Cove 9"                     → lane-cove-u9
//   "Killara-West Pymble/Lindfield 8" → kwp-u8-lindfield   (when crest is KWP's)
// `team` may be the normalised shape {name, crest, clubKey} or the raw side.
export function slugifyTeam(team, age, clubs) {
  const clubKey = team.clubKey || clubFromTeam(team, clubs);
  if (!clubKey || !age) return null;
  const club = clubs[clubKey];
  let variant = String(team.name || '');
  // Strip the canonical club prefix when present.
  if (club?.shortPrefix) {
    const re = new RegExp('^' + club.shortPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
    variant = variant.replace(re, '');
  }
  // Strip trailing age digits and any leading slash from joint-team marker.
  variant = variant.replace(/\s+\d+$/, '').replace(/^\s*\//, '').trim();
  // Kebab-case what's left.
  const variantSlug = variant
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = `${clubKey}-${age.toLowerCase()}`;
  return variantSlug ? `${base}-${variantSlug}` : base;
}

// Display-friendly team name — strips the club prefix when present so the
// toolbar token reads "U7 Gold" rather than "Lane Cove Gold 7". Falls back to
// the original name when no club match is found.
export function shortTeamName(name, clubKey, clubs) {
  if (!name) return '';
  const club = clubKey ? clubs?.[clubKey] : null;
  let out = name;
  if (club?.shortPrefix) {
    const re = new RegExp('^' + club.shortPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*/?', 'i');
    out = out.replace(re, '').trim();
  }
  return out || name;
}

export function fmtDow(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Sydney' });
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })
    .replace(' am', 'am').replace(' pm', 'pm');
}

export function rowId(match) {
  return 'match-' + match.id;
}

// scoreClass is intentionally NEUTRAL for the aggregate — no "us" club, so no
// win/loss colouring. Returns 'played' for any match with both scores set, ''
// otherwise. UI uses this purely to switch the score pill colour, not to
// suggest a winner.
export function scoreClass(match) {
  const hs = match?.home?.score;
  const as = match?.away?.score;
  if (hs === null || as === null || hs === undefined || as === undefined) return '';
  if (isNaN(Number(hs)) || isNaN(Number(as))) return '';
  return 'played';
}

// venues: the VENUES object from config — passed explicitly so this function is testable
// without a browser or config.js loaded.
export function parseVenue(rawVenue, venues) {
  if (!rawVenue) return { display: '', pitch: null, mapsUrl: '#', base: null, hasDetails: false };

  // Minis: "Tryon Oval TT1 (U6/U7)" → base="Tryon Oval", pitch="TT1"
  const miniMatch = rawVenue.match(/^(.+?) ((TT|M)\d+)\s*\([^)]+\)$/);
  if (miniMatch) {
    const base = miniMatch[1].trim();
    const pitch = miniMatch[2];
    const v = venues[base];
    const display = v?.suburb ? `${base}, ${v.suburb}` : base;
    return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display), base: v ? base : null, hasDetails: !!v?.details };
  }

  let base = rawVenue.trim();
  let pitch = null;
  let v = venues[base];
  if (!v) {
    const words = base.split(' ');
    for (let i = words.length - 1; i >= 1; i--) {
      const prefix = words.slice(0, i).join(' ');
      if (venues[prefix]) {
        base  = prefix;
        v     = venues[prefix];
        const suffix = words.slice(i).join(' ').trim();
        pitch = /^\d+$/.test(suffix) ? `Field ${suffix}` : suffix;
        break;
      }
    }
  }

  const display = v?.suburb ? `${base}, ${v.suburb}` : base;
  return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display), base: v ? base : null, hasDetails: !!v?.details };
}

export function venueSlug(baseName) {
  return String(baseName ?? '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function renderVenueDetails(baseName, venues, { assetPrefix = '' } = {}) {
  const v = venues?.[baseName];
  const d = v?.details;
  if (!d) return '';

  const parts = [];
  const rows = [];
  if (d.parking) rows.push(['Parking', esc(d.parking).replace(/\n/g, '<br>')]);
  if (d.coffee) {
    const bits = [];
    if (d.coffee.onsite) bits.push(esc(d.coffee.onsite));
    if (d.coffee.nearby) bits.push(`Nearby: ${esc(d.coffee.nearby)}`);
    if (bits.length) rows.push(['Coffee', bits.join(' · ')]);
  }
  if (d.notes) rows.push(['Notes', esc(d.notes).replace(/\n/g, '<br>')]);
  if (rows.length) {
    const inline = rows.map(([k, val]) =>
      `<p class="venue-meta-row"><span class="venue-meta-label">${esc(k)}</span> ${val}</p>`
    ).join('');
    parts.push(`<div class="venue-meta">${inline}</div>`);
  }
  if (d.map) {
    const src = `${assetPrefix}${d.map.src}`;
    const asOf = d.map.asOf
      ? new Date(d.map.asOf + '-01').toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })
      : '';
    parts.push(
      `<a class="venue-map-link" href="${esc(src)}" target="_blank" rel="noopener">` +
        `<img class="venue-map" src="${esc(src)}" alt="${esc(d.map.caption ?? `${baseName} pitch layout`)}" loading="lazy">` +
      `</a>`
    );
    if (d.map.caption || asOf) {
      parts.push(`<div class="venue-map-caption">${esc(d.map.caption ?? '')}${d.map.caption && asOf ? ' · ' : ''}${asOf ? `Layout as of ${esc(asOf)}` : ''}</div>`);
    }
  }
  return parts.join('');
}
