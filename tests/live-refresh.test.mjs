import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const indexHtml = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = indexHtml.indexOf(startMarker);
  const end = indexHtml.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return indexHtml.slice(start, end);
}

test('every successful boot immediately revalidates after the cached first paint', () => {
  const bootSource = sourceBetween('(async function boot()', '\n})();\n\n// Service worker registration');
  const initialRender = bootSource.indexOf('\n  render();\n');
  const liveRefresh = bootSource.indexOf('refreshLiveData();');

  assert.notEqual(initialRender, -1);
  assert.ok(liveRefresh > initialRender, 'live refresh must run after the initial cached render');
  assert.equal(bootSource.match(/refreshLiveData\(\);/g)?.length, 1);
});

test('live refresh bypasses caches and re-renders only when fixture data changed', () => {
  const refreshSource = sourceBetween('async function refreshLiveData()', '\n}\n\nsetInterval(');

  assert.match(refreshSource, /\?live=\$\{Date\.now\(\)\}/);
  assert.match(refreshSource, /\{\s*cache:\s*'no-store'\s*\}/);
  assert.match(refreshSource, /fresh\.updated === fixturesData\.updated/);
  assert.match(refreshSource, /fixturesData = fresh/);
  assert.match(refreshSource, /render\(\);/);
});

test('service worker passes live fixture requests directly to the network', () => {
  const liveBypass = serviceWorker.indexOf("url.searchParams.has('live')");
  const dataStrategy = serviceWorker.indexOf('if (isDataRequest(url))');

  assert.notEqual(liveBypass, -1);
  assert.ok(liveBypass < dataStrategy, 'live bypass must run before stale-while-revalidate data handling');
});

test('service worker loads config and render code network-first', () => {
  const scriptStrategy = serviceWorker.indexOf('if (isShellScript(url))');
  const fallbackStrategy = serviceWorker.lastIndexOf('event.respondWith(staleWhileRevalidate(request, SHELL_CACHE))');

  assert.match(serviceWorker, /url\.pathname\.endsWith\('\.mjs'\)/);
  assert.match(serviceWorker, /url\.pathname\.endsWith\('\/config\.js'\)/);
  assert.notEqual(scriptStrategy, -1);
  assert.ok(scriptStrategy < fallbackStrategy, 'script requests must be handled before the SWR fallback');
});
