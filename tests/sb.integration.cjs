'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const server = require('../sb-site/server');
function request(port, pathname, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); req.on('error', reject); req.end();
  });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const home = await request(port, '/'); assert.equal(home.status, 200);
    for (const name of ['水滴鱼', '芙莉莲', '奶龙']) assert.ok(home.body.toString().includes(name));
    const br = await request(port, '/', 'GET', { 'Accept-Encoding': 'br, gzip' });
    assert.equal(br.headers['content-encoding'], 'br'); assert.deepEqual(zlib.brotliDecompressSync(br.body), home.body);
    const gzip = await request(port, '/style.css', 'GET', { 'Accept-Encoding': 'br;q=0,gzip' });
    assert.equal(gzip.headers['content-encoding'], 'gzip'); assert.ok(zlib.gunzipSync(gzip.body).length > 0);
    const head = await request(port, '/', 'HEAD'); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], String(home.body.length));
    const cached = await request(port, '/', 'GET', { 'If-None-Match': 'W/' + home.headers.etag }); assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
    for (const file of ['/app.js', '/style.css', '/assets/trio.webp', '/favicon.svg', '/healthz']) assert.equal((await request(port, file)).status, 200);
    assert.equal(JSON.parse((await request(port, '/healthz')).body).site, 'shenren-club');
    for (const pathname of ['/server.js', '/.env', '/data/news.json', '/%2e%2e/class-auth/roster.json', '/missing']) assert.equal((await request(port, pathname)).status, 404);
    assert.equal((await request(port, '/', 'POST')).status, 405);
    assert.match(home.headers['content-security-policy'], /script-src 'self'/);
    console.log('SB checks passed: content, assets, compression, ETag, HEAD, health, private path protection.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
