/**
 * Local smoke test: starts an HTTP server over docs/ and verifies that
 * config.js, fixtures.json, index.html, render.mjs, and the service worker
 * all load with expected content. Exits 0 on pass, 1 on fail.
 *
 * Run: node scripts/smoke.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.ics':  'text/calendar',
  '.png':  'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(DOCS, urlPath);
  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
console.log(`smoke: serving docs/ on ${base}`);

let failures = 0;

async function check(label, url, assertions) {
  try {
    const res = await fetch(url);
    const body = await res.text();
    let ok = true;
    for (const [desc, fn] of assertions) {
      if (!fn(res, body)) {
        console.error(`  FAIL [${label}] ${desc}`);
        failures++;
        ok = false;
      }
    }
    if (ok) console.log(`  pass [${label}]`);
  } catch (err) {
    console.error(`  FAIL [${label}] ${err.message}`);
    failures++;
  }
}

await check('config.js', `${base}/config.js`, [
  ['HTTP 200',                          r      => r.status === 200],
  ['exports NSM_SUNDAY_CONFIG',         (_, b) => b.includes('NSM_SUNDAY_CONFIG')],
  ['has CLUBS key',                     (_, b) => b.includes('CLUBS')],
]);

await check('fixtures.json', `${base}/fixtures.json`, [
  ['HTTP 200',                  r      => r.status === 200],
  ['has matches array',         (_, b) => { try { return Array.isArray(JSON.parse(b).matches); } catch { return false; } }],
  ['has updated field',         (_, b) => { try { return typeof JSON.parse(b).updated === 'string'; } catch { return false; } }],
  ['has clubs map',             (_, b) => { try { return typeof JSON.parse(b).clubs === 'object'; } catch { return false; } }],
]);

await check('index.html', `${base}/index.html`, [
  ['HTTP 200',                          r      => r.status === 200],
  ['has #calendar div',                 (_, b) => b.includes('id="calendar"')],
  ['has #club-row',                     (_, b) => b.includes('id="club-row"')],
  ['has #team-cards',                   (_, b) => b.includes('id="team-cards"')],
  ['loads config.js',                   (_, b) => b.includes('config.js')],
  ['imports render.mjs',                (_, b) => b.includes('render.mjs')],
]);

await check('render.mjs', `${base}/render.mjs`, [
  ['HTTP 200',                          r      => r.status === 200],
  ['exports esc',                       (_, b) => b.includes('export function esc')],
  ['exports clubFromCrest',             (_, b) => b.includes('export function clubFromCrest')],
  ['exports slugifyTeam',               (_, b) => b.includes('export function slugifyTeam')],
]);

await check('lineups.json', `${base}/lineups.json`, [
  ['HTTP 200',           r      => r.status === 200],
  ['is valid JSON',      (_, b) => { try { const d = JSON.parse(b); return typeof d === 'object' && d !== null; } catch { return false; } }],
]);

await check('venues.html', `${base}/venues.html`, [
  ['HTTP 200',                          r      => r.status === 200],
  ['imports renderVenueDetails',        (_, b) => b.includes('renderVenueDetails')],
  ['has venues-list anchor',            (_, b) => b.includes('id="venues-list"')],
]);

await check('clubs.html', `${base}/clubs.html`, [
  ['HTTP 200',                          r      => r.status === 200],
  ['has clubs-grid anchor',             (_, b) => b.includes('id="clubs-grid"')],
  ['references NSM_SUNDAY_CONFIG',      (_, b) => b.includes('NSM_SUNDAY_CONFIG')],
]);

await check('manifest.webmanifest', `${base}/manifest.webmanifest`, [
  ['HTTP 200',                          r      => r.status === 200],
  ['mentions NSM Sunday',               (_, b) => b.includes('NSM Sunday') || b.includes('North Shore Minis')],
]);

await check('sw.js', `${base}/sw.js`, [
  ['HTTP 200',                          r      => r.status === 200],
  ['uses nsm-sunday cache name',        (_, b) => b.includes('nsm-sunday')],
]);

server.close();

if (failures > 0) {
  console.error(`\nsmoke: ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nsmoke: all checks passed.');
}
