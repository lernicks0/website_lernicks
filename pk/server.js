/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'pk');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { proxyAccountRequest, getAccount } = require('../class-auth/client');
const { STUDENT_NAMES } = require('../class-auth/participants');

// 正式服务器默认使用 1145；本地测试可以用 PK_PORT 临时换端口。
const PORT = Number(process.env.PK_PORT) || 1145;
const DATA_FILE = process.env.PK_DATA_FILE || path.join(__dirname, '803班擂台赛数据.json');
const LOCK_FILE = process.env.PK_LOCK_FILE || path.join(__dirname, 'lock-state.json');
const ANALYSIS_FILE = process.env.PK_ANALYSIS_FILE || path.join(__dirname, 'pk-analysis.json');
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const analysisJobs = new Map();
let analysisSaveChain = Promise.resolve();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > limit) reject(new Error('请求内容太大'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (_) { reject(new Error('请求格式不正确')); }
    });
    req.on('error', reject);
  });
}

function readPkData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) { return { pkList: [], savedExams: [] }; }
}

async function atomicWrite(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
    await fs.promises.rename(temp, file);
  } catch (error) {
    await fs.promises.unlink(temp).catch(() => {});
    throw error;
  }
}

function readLockState() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')).locked === true; }
  catch (_) { return false; }
}

function cleanRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const self = String(record.self || '').trim();
  const opponent = String(record.opponent || '').trim();
  if (!NAMES_SET.has(self) || !NAMES_SET.has(opponent) || self === opponent) return null;
  return { self, opponent, time: String(record.time || '').slice(0, 80) };
}

const NAMES_SET = new Set(STUDENT_NAMES);

function cleanPayload(body) {
  if (!body || !Array.isArray(body.pkList) || !Array.isArray(body.savedExams)) {
    throw Object.assign(new Error('PK 数据格式不正确'), { status: 400 });
  }
  const pkList = body.pkList.map(cleanRecord);
  if (pkList.some(item => !item)) throw Object.assign(new Error('PK 对决数据不正确'), { status: 400 });
  const used = new Set();
  for (const item of pkList) {
    if (used.has(item.self)) throw Object.assign(new Error('同一位同学不能重复发起 PK'), { status: 400 });
    used.add(item.self);
  }
  return { pkList, savedExams: body.savedExams };
}

function sameData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function restrictStudentSave(current, incoming, account) {
  if (readLockState()) throw Object.assign(new Error('页面已锁定，普通同学只能查看'), { status: 423 });
  if (!sameData(incoming.savedExams, current.savedExams || [])) {
    throw Object.assign(new Error('普通同学不能修改封存考试或成绩'), { status: 403 });
  }
  const currentOthers = (current.pkList || []).filter(item => item.self !== account.name);
  const nextOthers = incoming.pkList.filter(item => item.self !== account.name);
  if (!sameData(nextOthers, currentOthers)) {
    throw Object.assign(new Error('普通同学只能修改自己的目标对手'), { status: 403 });
  }
  const mine = incoming.pkList.filter(item => item.self === account.name);
  if (mine.length > 1) throw Object.assign(new Error('每位同学只能设置一个目标对手'), { status: 400 });
  if (mine[0]) mine[0].time = new Date().toLocaleString('zh-CN');
  return { pkList: nextOthers.concat(mine), savedExams: current.savedExams || [] };
}

// 保存操作排队执行，防止两位同学刚好同时修改时互相覆盖。
let pkUpdateChain = Promise.resolve();
function updatePkData(account, incoming) {
  const job = pkUpdateChain.then(async () => {
    const current = readPkData();
    const next = account.isAdmin ? incoming : restrictStudentSave(current, incoming, account);
    await atomicWrite(DATA_FILE, next);
    return next;
  });
  pkUpdateChain = job.catch(() => {});
  return job;
}

function readAnalyses() {
  try {
    const value = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf8'));
    return value && value.analyses ? value : { version: 1, analyses: {} };
  } catch (_) {
    return { version: 1, analyses: {} };
  }
}

function saveAnalyses(value) {
  return fs.promises.writeFile(ANALYSIS_FILE, JSON.stringify(value, null, 2), 'utf8');
}

function saveOneAnalysis(found, studentName, text) {
  const job = analysisSaveChain.then(async () => {
    const latest = readAnalyses();
    if (!latest.analyses[found.key]) {
      latest.analyses[found.key] = {
        examName: found.exam.name || '未命名考试',
        examTime: found.exam.time || '',
        students: {},
      };
    }
    if (!latest.analyses[found.key].students[studentName]) {
      latest.analyses[found.key].students[studentName] = {
        text,
        createdAt: new Date().toISOString(),
        model: DEEPSEEK_MODEL,
      };
      await saveAnalyses(latest);
    }
    return latest.analyses[found.key].students[studentName];
  });
  analysisSaveChain = job.catch(() => {});
  return job;
}

function examKey(exam) {
  const source = JSON.stringify({ name: exam.name || '', time: exam.time || '', records: exam.records || [] });
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
}

function findExamAndScores(examIndex, studentName) {
  const data = readPkData();
  const exam = Array.isArray(data.savedExams) ? data.savedExams[examIndex] : null;
  if (!exam) throw Object.assign(new Error('找不到这场考试'), { status: 404 });
  if (!exam.scoreData || !exam.scoreData[studentName]) {
    throw Object.assign(new Error('这位同学在本场考试中还没有成绩，暂时不能分析'), { status: 400 });
  }
  const scores = exam.scoreData[studentName];
  const cleanScores = {};
  let total = 0;
  for (const subject of ['语文', '数学', '英语', '科学', '文综']) {
    const value = Number(scores[subject]);
    cleanScores[subject] = Number.isFinite(value) ? value : 0;
    total += cleanScores[subject];
  }
  return { exam, scores: cleanScores, total, key: examKey(exam) };
}

function getCachedAnalysis(exam, key, studentName) {
  const store = readAnalyses();
  const examItem = store.analyses[key];
  const item = examItem && examItem.students && examItem.students[studentName];
  return item ? { item, store } : { item: null, store };
}

async function requestDeepSeek(scores, total) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw Object.assign(new Error('服务器还没有设置 DeepSeek API Key，请联系管理员'), { status: 503 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        stream: false,
        max_tokens: 700,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'system',
            content: '你是一位耐心、积极的初中学习顾问。请用七年级学生容易理解的简体中文分析成绩。不要猜测姓名、性别、班级排名或家庭情况。按“成绩观察”“可以保持”“下一步建议”三个小标题回答，建议要具体、友善、简洁。',
          },
          {
            role: 'user',
            content: `请分析下面这一位匿名学生的一次考试成绩。只根据分数分析，不要询问或猜测真实姓名。\n各科分数：${JSON.stringify(scores)}\n总分：${total}`,
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  let result;
  try { result = await response.json(); }
  catch (_) { result = {}; }
  if (!response.ok) {
    const message = result.error && result.error.message ? result.error.message : `DeepSeek 请求失败（${response.status}）`;
    throw Object.assign(new Error(message), { status: 502 });
  }
  const text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
  if (!text) throw Object.assign(new Error('DeepSeek 没有返回分析内容，请稍后重试'), { status: 502 });
  return String(text).trim();
}

async function createAnalysis(examIndex, studentName) {
  const found = findExamAndScores(examIndex, studentName);
  const cached = getCachedAnalysis(found.exam, found.key, studentName);
  if (cached.item) return { cached: true, analysis: cached.item };

  const text = await requestDeepSeek(found.scores, found.total);
  const saved = await saveOneAnalysis(found, studentName, text);
  return { cached: false, analysis: saved };
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const url = requestUrl.pathname;

  if (url.startsWith('/account-api/')) {
    proxyAccountRequest(req, res);
    return;
  }

  // 查询已经生成过的个人成绩分析。所有同学都可以查看，包括查看他人的分析。
  if (url === '/analysis.json' && req.method === 'GET') {
    try {
      const examIndex = Number(requestUrl.searchParams.get('examIndex'));
      const studentName = String(requestUrl.searchParams.get('studentName') || '').trim();
      if (!Number.isInteger(examIndex) || !studentName) {
        sendJson(res, 400, { ok: false, message: '请选择考试并输入姓名' });
        return;
      }
      const found = findExamAndScores(examIndex, studentName);
      const cached = getCachedAnalysis(found.exam, found.key, studentName);
      sendJson(res, 200, { ok: true, cached: !!cached.item, analysis: cached.item });
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, message: error.message || '查询失败' });
    }
    return;
  }

  // 第一次点击分析时才调用 DeepSeek；同一场考试、同一位同学以后直接读缓存。
  if (url === '/analyze.json' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const examIndex = Number(body.examIndex);
      const studentName = String(body.studentName || '').trim();
      if (!Number.isInteger(examIndex) || !studentName) {
        sendJson(res, 400, { ok: false, message: '请选择考试并输入姓名' });
        return;
      }
      const found = findExamAndScores(examIndex, studentName);
      const jobKey = `${found.key}:${studentName}`;
      if (!analysisJobs.has(jobKey)) {
        const job = createAnalysis(examIndex, studentName).finally(() => analysisJobs.delete(jobKey));
        analysisJobs.set(jobKey, job);
      }
      const result = await analysisJobs.get(jobKey);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const message = error.name === 'AbortError' ? 'DeepSeek 响应超时，请稍后再试' : (error.message || '分析失败');
      sendJson(res, error.status || 500, { ok: false, message });
    }
    return;
  }

  // 所有设备共用的页面锁定状态
  if (url === '/lock-state.json' && req.method === 'GET') {
    fs.readFile(LOCK_FILE, 'utf8', (err, text) => {
      let locked = false;
      if (!err) {
        try { locked = JSON.parse(text).locked === true; } catch (e) {}
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ locked }));
    });
    return;
  }

  // 管理员切换锁定时，网页会把新状态写到这里。
  if (url === '/lock-state.json' && req.method === 'POST') {
    const account = await getAccount(req);
    if (!account) {
      sendJson(res, 401, { ok: false, message: '请先登录班级账号' });
      return;
    }
    if (!account.isAdmin) {
      sendJson(res, 403, { ok: false, message: '只有管理员账号可以锁定或解除锁定' });
      return;
    }
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) tooLarge = true;
    });
    req.on('end', () => {
      if (tooLarge) {
        res.writeHead(413); res.end('request too large'); return;
      }

      let data;
      try { data = JSON.parse(body); } catch (e) {
        res.writeHead(400); res.end('invalid json'); return;
      }
      if (typeof data.locked !== 'boolean') {
        res.writeHead(400); res.end('locked must be boolean'); return;
      }

      const result = JSON.stringify({
        locked: data.locked,
        updatedAt: new Date().toISOString(),
      }, null, 2);
      fs.writeFile(LOCK_FILE, result, 'utf8', err => {
        if (err) { res.writeHead(500); res.end('save failed'); return; }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ ok: true, locked: data.locked }));
      });
    });
    return;
  }

  // 数据读取
  if (url === '/data.json' && req.method === 'GET') {
    const account = await getAccount(req);
    if (!account) {
      sendJson(res, 401, { ok: false, message: '请先登录班级账号' });
      return;
    }
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) {
        // 没有数据文件，返回空
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"pkList":[],"savedExams":[]}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // 私密名单只发送给已经登录的班级账号。
  if (url === '/names.json' && req.method === 'GET') {
    const account = await getAccount(req);
    if (!account) {
      sendJson(res, 401, { ok: false, message: '请先登录班级账号' });
      return;
    }
    sendJson(res, 200, { ok: true, names: STUDENT_NAMES });
    return;
  }

  // 数据保存
  if (url === '/save.json' && req.method === 'POST') {
    try {
      const account = await getAccount(req);
      if (!account) {
        sendJson(res, 401, { ok: false, message: '请先登录班级账号' });
        return;
      }
      const incoming = cleanPayload(await readBody(req, 8 * 1024 * 1024));
      const next = await updatePkData(account, incoming);
      sendJson(res, 200, { ok: true, ...next });
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, message: error.message || '保存失败' });
    }
    return;
  }

  // 根目录重定向到 HTML
  if (url === '/') {
    res.writeHead(302, { 'Location': '/pk.html' });
    res.end();
    return;
  }

  // 静态文件
  const filePath = path.join(__dirname, decodeURIComponent(url));
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
});
