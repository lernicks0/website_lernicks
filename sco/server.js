/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'sco');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { proxyAccountRequest, getAccount } = require('../class-auth/client');
const { STUDENT_NAMES } = require('../class-auth/participants');

const PORT = Number(process.env.SCO_PORT) || 1146;
const DATA_FILE = process.env.SCO_DATA_FILE || path.join(__dirname, 'sco-data.json');

const NAMES = [...STUDENT_NAMES];
const NAME_SET = new Set(NAMES);

function emptyState() {
  return { version: 1, scores: Object.fromEntries(NAMES.map(name => [name, 0])), archives: [], updatedAt: null };
}

function readState() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const state = emptyState();
    for (const name of NAMES) {
      const value = Number(saved.scores && saved.scores[name]);
      state.scores[name] = Number.isInteger(value) ? value : 0;
    }
    state.archives = Array.isArray(saved.archives) ? saved.archives.slice(0, 100) : [];
    state.updatedAt = saved.updatedAt || null;
    return state;
  } catch (_) {
    return emptyState();
  }
}

// 所有改分操作排队执行，避免两个人同时点击时有一笔分数被覆盖。
let stateUpdateChain = Promise.resolve();
function updateState(mutator) {
  const job = stateUpdateChain.then(async () => {
    const state = readState();
    const result = mutator(state);
    state.updatedAt = new Date().toISOString();
    await fs.promises.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    return { state, result };
  });
  stateUpdateChain = job.catch(() => {});
  return job;
}

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > limit) reject(new Error('请求内容太大'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (_) { reject(new Error('数据格式不正确')); }
    });
    req.on('error', reject);
  });
}

async function requireAdmin(req, res) {
  const account = await getAccount(req);
  if (!account) {
    json(res, 401, { ok: false, message: '请先登录班级账号' });
    return null;
  }
  if (!account.isAdmin) {
    json(res, 403, { ok: false, message: '只有管理员账号可以执行这个操作' });
    return null;
  }
  return account;
}

function cleanSnapshot(scores) {
  const result = {};
  for (const name of NAMES) {
    const value = Number(scores && scores[name]);
    result[name] = Number.isInteger(value) ? value : 0;
  }
  return result;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/account-api/')) {
      proxyAccountRequest(req, res);
      return;
    }

    if (url.pathname === '/api/state' && req.method === 'GET') {
      const account = await getAccount(req);
      if (!account) {
        json(res, 401, { ok: false, message: '请先登录班级账号后查看私密名单' });
        return;
      }
      json(res, 200, { ok: true, ...readState(), names: NAMES });
      return;
    }

    if (url.pathname === '/api/score' && req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJson(req);
      const delta = Number(body.delta);
      if (!NAME_SET.has(body.name) || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
        json(res, 400, { ok: false, message: '姓名或分数不正确，只能填写非 0 整数' });
        return;
      }
      const { state } = await updateState(current => { current.scores[body.name] += delta; });
      json(res, 200, { ok: true, name: body.name, score: state.scores[body.name], updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/api/archive' && req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJson(req);
      const title = String(body.title || '').trim().slice(0, 40) || new Date().toLocaleDateString('zh-CN') + ' 积分归档';
      const archive = {
        id: Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), title,
        createdAt: new Date().toISOString(), scores: null,
      };
      const { state } = await updateState(current => {
        archive.scores = cleanSnapshot(current.scores);
        current.archives.unshift(archive);
        current.archives = current.archives.slice(0, 100);
      });
      json(res, 200, { ok: true, archive, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/api/restore' && req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJson(req);
      const { state } = await updateState(current => {
        const archive = current.archives.find(item => item.id === body.id);
        if (!archive) throw Object.assign(new Error('找不到这份归档'), { status: 404 });
        current.scores = cleanSnapshot(archive.scores);
      });
      json(res, 200, { ok: true, scores: state.scores, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/api/delete-archive' && req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJson(req);
      const { state } = await updateState(current => {
        const before = current.archives.length;
        current.archives = current.archives.filter(item => item.id !== body.id);
        if (current.archives.length === before) throw Object.assign(new Error('找不到这份归档'), { status: 404 });
      });
      json(res, 200, { ok: true, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/index.html' });
      res.end();
      return;
    }

    const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(__dirname, safePath);
    if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }
    serveFile(res, filePath);
  } catch (error) {
    json(res, error.status || 500, { ok: false, message: error.message || '服务器暂时出错了' });
  }
});

server.listen(PORT, () => {
  console.log(`积分站已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
});
