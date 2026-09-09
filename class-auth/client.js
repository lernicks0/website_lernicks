const http = require('http');

const AUTH_PORT = Number(process.env.CLASS_AUTH_PORT) || 1153;
const authAgent = new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8 });
const requestAccounts = new WeakMap();

function proxyAccountRequest(req, res) {
  const targetPath = req.url.replace(/^\/account-api/, '/api');
  const headers = { ...req.headers };
  headers.host = `127.0.0.1:${AUTH_PORT}`;
  headers['x-original-host'] = req.headers.host || '';
  const proxy = http.request({
    agent: authAgent,
    hostname: '127.0.0.1',
    port: AUTH_PORT,
    path: targetPath,
    method: req.method,
    headers
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.setTimeout(5000, () => proxy.destroy(new Error('账号服务响应超时')));
  proxy.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: '账号服务暂时不可用' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

function getAccount(req) {
  if (!req.headers.cookie) return Promise.resolve(null);
  if (requestAccounts.has(req)) return requestAccounts.get(req);
  const result = new Promise(resolve => {
    const request = http.request({
      agent: authAgent,
      hostname: '127.0.0.1',
      port: AUTH_PORT,
      path: '/internal/session',
      method: 'GET',
      headers: { cookie: req.headers.cookie || '' }
    }, response => {
      response.on('error', () => resolve(null));
      response.on('aborted', () => resolve(null));
      let body = '';
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 8192) response.destroy();
      });
      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data && data.ok ? data.account : null);
        } catch (_) { resolve(null); }
      });
    });
    request.setTimeout(2500, () => { request.destroy(); resolve(null); });
    request.on('error', () => resolve(null));
    request.end();
  });
  requestAccounts.set(req, result);
  return result;
}

module.exports = { proxyAccountRequest, getAccount };
