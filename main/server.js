/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'main');
// Lernicks 总主站：同时服务 lernicks.cn 和 www.lernicks.cn
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.MAIN_PORT) || 1149;
const INDEX_FILE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch (_) { res.writeHead(400); res.end('Bad Request'); return; }

  if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
    fs.readFile(INDEX_FILE, (error, data) => {
      if (error) { res.writeHead(500); res.end('Main site unavailable'); return; }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache'
      });
      if (req.method === 'HEAD') res.end();
      else res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 旧便签站没有普通路径页面。万一有人保存了旧路径，也转到新便签域名。
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.writeHead(302, { Location: `https://note.lernicks.cn${url.pathname}${url.search}` });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => console.log(`Lernicks 主站已启动: http://localhost:${PORT}`));

