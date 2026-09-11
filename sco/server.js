/* lernicks-performance */ if (require('fs').existsSync(require('path').join(__dirname, '../site-performance/static.cjs'))) require('../site-performance/static.cjs').install(__dirname, 'sco');
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
const DEFAULT_DEDUCTION_REASON = '自习课讲话/打闹';

function emptyState() {
  return { version: 1, scores: Object.fromEntries(NAMES.map(name => [name, 0])), archives: [], deductions: [], updatedAt: null };
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
    state.deductions = Array.isArray(saved.deductions) ? saved.deductions : [];
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
      if (delta < 0 && body.reason != null && typeof body.reason !== 'string') {
        json(res, 400, { ok: false, message: '扣分原因请填写文字' }); return;
      }
      const reason = delta < 0 ? (String(body.reason || '').trim() || DEFAULT_DEDUCTION_REASON) : '';
      if (reason.length > 200) {
        json(res, 400, { ok: false, message: '扣分原因不能超过 200 个字' }); return;
      }
      const deduction = delta < 0 ? { id: crypto.randomBytes(12).toString('hex'), name: body.name, delta, reason, createdAt: new Date().toISOString() } : null;
      const { state } = await updateState(current => {
        current.scores[body.name] += delta;
        if (deduction) current.deductions.unshift(deduction);
      });
      json(res, 200, { ok: true, name: body.name, score: state.scores[body.name], deduction, updatedAt: state.updatedAt });
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

    // 积分和原因仅通过已登录的 /api/state 返回，不能作为静态文件下载。
    if (url.pathname === '/index.html') { serveFile(res, path.join(__dirname, 'index.html')); return; }
    res.writeHead(404); res.end('Not Found');
  } catch (error) {
    json(res, error.status || 500, { ok: false, message: error.message || '服务器暂时出错了' });
  }
});

server.listen(PORT, () => {
  console.log(`积分站已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
});
