/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'cla');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { proxyAccountRequest } = require('../class-auth/client');

const PORT = Number(process.env.CLA_PORT) || 1147;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/account-api/')) {
    proxyAccountRequest(req, res);
    return;
  }
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/index.html' });
    res.end();
    return;
  }
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not Found'); return; }
    const type = path.extname(filePath) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`803 班主站已启动: http://localhost:${PORT}`));
