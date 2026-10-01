'use strict';
// 独立公开站点，不读取班级账号、名单或业务数据。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const files = new Map();
for (const [url, filename, type] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
  ['/favicon.svg', 'favicon.svg', 'image/svg+xml'],
  ['/assets/trio.webp', 'assets/trio.webp', 'image/webp']
]) {
  const body = fs.readFileSync(path.join(__dirname, filename));
  const compressible = /^(text\/|image\/svg)/.test(type);
  files.set(url, { type, body, tag: '"' + crypto.createHash('sha256').update(body).digest('hex').slice(0, 24) + '"',
    br: compressible ? zlib.brotliCompressSync(body) : null, gzip: compressible ? zlib.gzipSync(body) : null });
}
files.set('/index.html', files.get('/'));
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, site: 'shenren-club' }));
  }
  const file = files.get(pathname);
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(req.method === 'HEAD' ? undefined : '这里还没有神人出没。'); }
  res.setHeader('Content-Type', file.type);
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('ETag', file.tag);
  res.setHeader('Vary', 'Accept-Encoding');
  // Respect explicit q=0 and choose an acceptable compressed representation.
  const encodings = Object.fromEntries((req.headers['accept-encoding'] || '').split(',').map(value => {
    const [name, ...params] = value.trim().split(';');
    const quality = params.find(param => /^\s*q=/.test(param));
    return [name.toLowerCase(), quality ? Number(quality.split('=')[1]) : 1];
  }));
  let body = file.body;
  const candidates = ['br', 'gzip'].filter(name => file[name] && (encodings[name] ?? encodings['*'] ?? 0) > 0)
    .sort((a, b) => (encodings[b] ?? encodings['*']) - (encodings[a] ?? encodings['*']));
  if (candidates.length) { res.setHeader('Content-Encoding', candidates[0]); body = file[candidates[0]]; }
  const tags = (req.headers['if-none-match'] || '').split(',').map(tag => tag.trim().replace(/^W\//, ''));
  if (tags.includes(file.tag) || tags.includes('*')) { res.writeHead(304); return res.end(); }
  res.setHeader('Content-Length', body.length);
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : body);
});
if (require.main === module) {
  const port = Number(process.env.SB_PORT || 1155);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SB_PORT must be a valid port');
  server.listen(port, '127.0.0.1', () => console.log('Shenren Club: http://127.0.0.1:' + port));
}
module.exports = server;
