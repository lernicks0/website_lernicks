/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'goal');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { proxyAccountRequest, getAccount } = require('../class-auth/client');
const { STUDENT_NAMES } = require('../class-auth/participants');

const PORT = Number(process.env.GOAL_PORT) || 1152;
const DATA_FILE = process.env.GOAL_DATA_FILE || path.join(__dirname, 'goal-data.json');

const NAMES = [...STUDENT_NAMES];
const NAME_SET = new Set(NAMES);

function emptyState() {
  return { version: 1, locked: false, rounds: [], updatedAt: null };
}

function cleanOptionalInteger(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function normalizeState(saved) {
  const state = emptyState();
  state.locked = saved && saved.locked === true;
  state.updatedAt = saved && typeof saved.updatedAt === 'string' ? saved.updatedAt : null;
  const seen = new Set();
  const rounds = saved && Array.isArray(saved.rounds) ? saved.rounds : [];
  for (const item of rounds.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').trim().slice(0, 80);
    const title = String(item.title || '').trim().slice(0, 40);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const goals = {};
    for (const name of NAMES) {
      const raw = item.goals && item.goals[name];
      if (!raw || typeof raw !== 'object') continue;
      const rank = cleanOptionalInteger(raw.rank, 1, NAMES.length);
      const score = cleanOptionalInteger(raw.score, 0, 10000);
      if (rank === null && score === null) continue;
      goals[name] = {
        rank,
        score,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
      };
    }
    state.rounds.push({
      id,
      title,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
      goals
    });
  }
  return state;
}

function readState() {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (_) {
    return emptyState();
  }
}

async function saveState(state) {
  await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');
    await fs.promises.rename(tempFile, DATA_FILE);
  } catch (error) {
    await fs.promises.unlink(tempFile).catch(() => {});
    throw error;
  }
}

// 写操作排队执行，避免两台设备同时保存时互相覆盖。
let stateUpdateChain = Promise.resolve();
function updateState(mutator) {
  const job = stateUpdateChain.then(async () => {
    const state = readState();
    const result = mutator(state);
    state.updatedAt = new Date().toISOString();
    await saveState(state);
    return { state, result };
  });
  stateUpdateChain = job.catch(() => {});
  return job;
}

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;
    req.on('data', chunk => {
      if (finished) return;
      size += chunk.length;
      if (size > limit) {
        finished = true;
        reject(Object.assign(new Error('请求内容太大'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(Object.assign(new Error('数据格式不正确'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function requireAccount(req, res) {
  const account = await getAccount(req);
  if (!account) json(res, 401, { ok: false, message: '请先登录班级账号' });
  return account;
}

async function requireAdmin(req, res) {
  const account = await requireAccount(req, res);
  if (!account) return null;
  if (!account.isAdmin) {
    json(res, 403, { ok: false, message: '只有管理员账号可以执行这个操作' });
    return null;
  }
  return account;
}

function requireEditable(state, account) {
  if (state.locked && !account.isAdmin) {
    throw Object.assign(new Error('界面已被管理员锁定，普通用户只能查看'), { status: 423 });
  }
}

function findRound(state, id) {
  return state.rounds.find(item => item.id === id) || null;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not Found'); return; }
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

    if (url.pathname === '/api/round' && req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJson(req);
      const title = String(body.title || '').trim().slice(0, 40);
      if (!title) { json(res, 400, { ok: false, message: '请填写考试名称' }); return; }
      const round = {
        id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
        title,
        createdAt: new Date().toISOString(),
        goals: {}
      };
      const { state } = await updateState(current => {
        current.rounds.unshift(round);
        current.rounds = current.rounds.slice(0, 100);
      });
      json(res, 201, { ok: true, round, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/api/delete-round' && req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJson(req);
      const { state } = await updateState(current => {
        const before = current.rounds.length;
        current.rounds = current.rounds.filter(item => item.id !== body.roundId);
        if (before === current.rounds.length) {
          throw Object.assign(new Error('找不到这场考试'), { status: 404 });
        }
      });
      json(res, 200, { ok: true, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/api/lock' && req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJson(req);
      if (typeof body.locked !== 'boolean') {
        json(res, 400, { ok: false, message: '锁定状态不正确' });
        return;
      }
      const { state } = await updateState(current => { current.locked = body.locked; });
      json(res, 200, { ok: true, locked: state.locked, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/api/goal' && req.method === 'POST') {
      const body = await readJson(req);
      const account = await requireAccount(req, res);
      if (!account) return;
      const name = String(body.name || '').trim();
      const roundId = String(body.roundId || '').trim();
      const rank = cleanOptionalInteger(body.rank, 1, NAMES.length);
      const score = cleanOptionalInteger(body.score, 0, 10000);
      if (!NAME_SET.has(name)) { json(res, 400, { ok: false, message: '没有找到这位同学' }); return; }
      if (!account.isAdmin && name !== account.name) {
        json(res, 403, { ok: false, message: '普通同学只能修改自己的目标' });
        return;
      }
      if (!roundId) { json(res, 400, { ok: false, message: '请先选择考试' }); return; }
      if (body.rank !== '' && body.rank !== null && body.rank !== undefined && rank === null) {
        json(res, 400, { ok: false, message: `名次目标只能填写 1～${NAMES.length} 的整数` });
        return;
      }
      if (body.score !== '' && body.score !== null && body.score !== undefined && score === null) {
        json(res, 400, { ok: false, message: '分数目标只能填写 0～10000 的整数' });
        return;
      }
      if (rank === null && score === null) {
        json(res, 400, { ok: false, message: '名次目标和分数目标至少填写一项' });
        return;
      }
      const goal = { rank, score, updatedAt: new Date().toISOString() };
      const { state } = await updateState(current => {
        requireEditable(current, account);
        const round = findRound(current, roundId);
        if (!round) throw Object.assign(new Error('找不到这场考试'), { status: 404 });
        round.goals[name] = goal;
      });
      json(res, 200, { ok: true, goal, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/api/delete-goal' && req.method === 'POST') {
      const body = await readJson(req);
      const account = await requireAccount(req, res);
      if (!account) return;
      const name = String(body.name || '').trim();
      const roundId = String(body.roundId || '').trim();
      if (!NAME_SET.has(name)) { json(res, 400, { ok: false, message: '没有找到这位同学' }); return; }
      if (!account.isAdmin && name !== account.name) {
        json(res, 403, { ok: false, message: '普通同学只能删除自己的目标' });
        return;
      }
      const { state } = await updateState(current => {
        requireEditable(current, account);
        const round = findRound(current, roundId);
        if (!round) throw Object.assign(new Error('找不到这场考试'), { status: 404 });
        delete round.goals[name];
      });
      json(res, 200, { ok: true, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/index.html' });
      res.end();
      return;
    }

    let decoded;
    try { decoded = decodeURIComponent(url.pathname); }
    catch (_) { res.writeHead(400); res.end('Bad Request'); return; }
    const root = path.resolve(__dirname);
    const filePath = path.resolve(root, decoded.replace(/^[/\\]+/, ''));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    serveFile(res, filePath);
  } catch (error) {
    json(res, error.status || 500, { ok: false, message: error.message || '服务器暂时出错了' });
  }
});

server.listen(PORT, () => {
  console.log(`目标中心已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
});
