/**
 * Local development server — serves docs/ over HTTP for browser UAT.
 *
 * Run:  node scripts/serve.mjs          (default port 3000)
 *       PORT=4000 node scripts/serve.mjs
 *
 * Uses only Node builtins — no npm install required.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html':         'text/html; charset=utf-8',
  '.js':           'application/javascript',
  '.mjs':          'application/javascript',
  '.json':         'application/json',
  '.webmanifest':  'application/manifest+json',
  '.ics':          'text/calendar',
  '.png':          'image/png',
  '.jpg':          'image/jpeg',
  '.jpeg':         'image/jpeg',
  '.svg':          'image/svg+xml',
  '.webp':         'image/webp',
  '.ico':          'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const filePath = path.join(DOCS, urlPath);

  // Prevent path traversal outside docs/
  if (!filePath.startsWith(DOCS)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\nserve: docs/ → ${url}`);
  console.log('\nCtrl+C to stop.\n');

  const opener = process.platform === 'win32' ? 'start'
               : process.platform === 'darwin' ? 'open'
               : 'xdg-open';
  try {
    execSync(`${opener} ${url}`);
  } catch { /* browser open is best-effort */ }
});
