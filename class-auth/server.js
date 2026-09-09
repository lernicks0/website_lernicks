/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'auth');
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  NAMES,
  SESSION_LIFE,
  ensureFiles,
  verifyPassword,
  publicAccount,
  listAccounts,
  setPassword,
  createSession,
  sessionAccount,
  deleteSession
} = require('./store');

const PORT = Number(process.env.CLASS_AUTH_PORT) || 1153;
const HOST = process.env.CLASS_AUTH_HOST || '127.0.0.1';
const COOKIE_NAME = 'class_session';
const attempts = new Map();

function json(res, status, value, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(value));
}

function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let stopped = false;
    req.on('data', chunk => {
      if (stopped) return;
      size += chunk.length;
      if (size > limit) {
        stopped = true;
        reject(Object.assign(new Error('请求内容太大'), { status: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (stopped) return;
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(Object.assign(new Error('数据格式不正确'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function requestToken(req) {
  return cookies(req)[COOKIE_NAME] || '';
}

function originalHost(req) {
  return String(req.headers['x-original-host'] || req.headers.host || '').split(':')[0].toLowerCase();
}

function sessionCookie(req, token, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (originalHost(req).endsWith('.lernicks.cn')) {
    parts.push('Domain=.lernicks.cn', 'Secure');
  }
  return parts.join('; ');
}

function accountFromRequest(req) {
  return sessionAccount(requestToken(req));
}

function requireAccount(req, res) {
  const account = accountFromRequest(req);
  if (!account) json(res, 401, { ok: false, message: '请先登录账号' });
  return account;
}

function requireAdmin(req, res) {
  const account = requireAccount(req, res);
  if (!account) return null;
  if (!account.isAdmin) {
    json(res, 403, { ok: false, message: '只有管理员账号可以执行这个操作' });
    return null;
  }
  return account;
}

function rateKey(req) {
  return String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown');
}

function checkLoginRate(req) {
  const key = rateKey(req);
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(time => now - time < 10 * 60 * 1000);
  if (recent.length >= 15) {
    throw Object.assign(new Error('登录尝试次数太多，请十分钟后再试'), { status: 429 });
  }
  recent.push(now);
  attempts.set(key, recent);
}

function clearLoginRate(req) {
  attempts.delete(rateKey(req));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/api/widget.js' && req.method === 'GET') {
      const code = await fs.promises.readFile(path.join(__dirname, 'widget.js'));
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(code);
      return;
    }

    if ((url.pathname === '/api/session' || url.pathname === '/internal/session') && req.method === 'GET') {
      const account = accountFromRequest(req);
      json(res, 200, { ok: !!account, account });
      return;
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      checkLoginRate(req);
      const body = await readJson(req);
      const id = String(body.id || '').trim();
      const account = publicAccount(id);
      if (!account) {
        json(res, 403, { ok: false, message: '账号或密码不正确' });
        return;
      }
      if (!account.hasPassword) {
        json(res, 403, { ok: false, message: '这个账号还没有设置密码，请联系管理员' });
        return;
      }
      if (!(await verifyPassword(id, body.password))) {
        json(res, 403, { ok: false, message: '账号或密码不正确' });
        return;
      }
      clearLoginRate(req);
      const session = await createSession(id);
      json(res, 200, { ok: true, account: publicAccount(id) }, {
        'Set-Cookie': sessionCookie(req, session.token, Math.floor(SESSION_LIFE / 1000))
      });
      return;
    }

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      await deleteSession(requestToken(req));
      json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
      return;
    }

    if (url.pathname === '/api/change-password' && req.method === 'POST') {
      const account = requireAccount(req, res);
      if (!account) return;
      const body = await readJson(req);
      if (!(await verifyPassword(account.id, body.currentPassword))) {
        json(res, 403, { ok: false, message: '当前密码不正确' });
        return;
      }
      await setPassword(account.id, body.newPassword);
      const session = await createSession(account.id);
      json(res, 200, { ok: true, account: publicAccount(account.id) }, {
        'Set-Cookie': sessionCookie(req, session.token, Math.floor(SESSION_LIFE / 1000))
      });
      return;
    }

    if (url.pathname === '/api/accounts' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      json(res, 200, { ok: true, accounts: listAccounts() });
      return;
    }

    if (url.pathname === '/api/accounts/password' && req.method === 'POST') {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const body = await readJson(req);
      const id = String(body.id || '').trim();
      await setPassword(id, body.password);
      const headers = id === admin.id ? { 'Set-Cookie': sessionCookie(req, '', 0) } : {};
      json(res, 200, { ok: true, account: publicAccount(id) }, headers);
      return;
    }

    json(res, 404, { ok: false, message: '接口不存在' });
  } catch (error) {
    json(res, error.status || 500, { ok: false, message: error.message || '账号服务暂时出错了' });
  }
});

ensureFiles().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`803 统一账号服务已启动: http://${HOST}:${PORT}`);
    console.log(`账号数量: ${NAMES.length}`);
  });
}).catch(error => {
  console.error('账号服务启动失败:', error);
  process.exitCode = 1;
});
