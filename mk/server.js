/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'mk');
// Lernicks Markdown / LaTeX / HTML 文档分享站
// 纯 Node.js 实现，不需要在服务器安装新的 npm 软件包。

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveFormat } = require('./html-support');

const PORT = Number(process.env.MK_PORT) || 1151;
const ROOT_DIR = __dirname;
const INDEX_FILE = path.join(ROOT_DIR, 'index.html');
const DOCUMENT_PAGE = path.join(ROOT_DIR, 'document.html');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DOCUMENT_DIR = path.join(ROOT_DIR, 'documents');
const META_FILE = path.join(DATA_DIR, 'documents.json');

const MB = 1024 * 1024;
const MAX_DOCUMENT_BYTES = positiveNumber(process.env.MK_MAX_DOCUMENT_MB, 1) * MB;
const MAX_STORAGE_BYTES = positiveNumber(process.env.MK_MAX_STORAGE_MB, 500) * MB;
const MIN_FREE_BYTES = positiveNumber(process.env.MK_MIN_FREE_MB, 1024) * MB;
const MAX_DOCUMENTS = positiveNumber(process.env.MK_MAX_DOCUMENTS, 10000);
const MAX_REQUEST_BYTES = MAX_DOCUMENT_BYTES * 2 + 128 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const CREATE_RATE_MAX = positiveNumber(process.env.MK_CREATE_RATE_MAX, 20);
const KEY_RATE_MAX = positiveNumber(process.env.MK_KEY_RATE_MAX, 40);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadMetadata() {
  try {
    if (!fs.existsSync(META_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('读取文档记录失败，将使用空记录：', error.message);
    return [];
  }
}

let documents = loadMetadata();

function documentPath(id) {
  return path.join(DOCUMENT_DIR, `${id}.txt`);
}

function saveMetadata() {
  const temporary = META_FILE + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(documents, null, 2));
  fs.renameSync(temporary, META_FILE);
}

function reconcileMetadata() {
  const before = documents.length;
  documents = documents.filter(item => item && /^[a-f0-9]{16}$/.test(item.id) && fs.existsSync(documentPath(item.id)));
  if (documents.length !== before) saveMetadata();
}

function totalDocumentBytes() {
  return documents.reduce((sum, item) => sum + Number(item.size || 0), 0);
}

function availableDiskBytes() {
  try {
    const stats = fs.statfsSync(DOCUMENT_DIR);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (_) {
    return null;
  }
}

function removeStoredDocument(record) {
  try { fs.unlinkSync(documentPath(record.id)); }
  catch (error) { if (error.code !== 'ENOENT') console.error('删除旧文档失败：', record.id, error.message); }
}

// 只删除 mk/documents 目录中的最早文档，不会触碰其他网站数据。
function cleanupOldestDocuments(extraBytes = 0, extraCount = 0, excludeId = '') {
  documents.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let total = totalDocumentBytes();
  let free = availableDiskBytes();
  let changed = false;

  const needsCleanup = () => {
    if (total + extraBytes > MAX_STORAGE_BYTES) return true;
    if (documents.length + extraCount > MAX_DOCUMENTS) return true;
    return free !== null && free < MIN_FREE_BYTES + Math.max(0, extraBytes);
  };

  while (needsCleanup()) {
    const index = documents.findIndex(item => item.id !== excludeId);
    if (index < 0) break;
    const oldest = documents[index];
    documents.splice(index, 1);
    removeStoredDocument(oldest);
    total = Math.max(0, total - Number(oldest.size || 0));
    if (free !== null) free += Number(oldest.size || 0);
    changed = true;
    console.log('自动清理最早文档：', oldest.id, oldest.title);
  }

  if (changed) saveMetadata();
  return !needsCleanup();
}

reconcileMetadata();
cleanupOldestDocuments();

const rateRecords = new Map();

function clientIp(req) {
  const cfIp = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cfIp) return cfIp;
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  return req.socket.remoteAddress || 'unknown';
}

function allowRate(ip, action, maximum) {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const recent = (rateRecords.get(key) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (recent.length >= maximum) {
    rateRecords.set(key, recent);
    return false;
  }
  recent.push(now);
  rateRecords.set(key, recent);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, records] of rateRecords) {
    const recent = records.filter(time => now - time < RATE_WINDOW_MS);
    if (recent.length) rateRecords.set(key, recent);
    else rateRecords.delete(key);
  }
  cleanupOldestDocuments();
}, 60 * 1000).unref();

function securityHeaders(res, allowEmbedding = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!allowEmbedding) res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const frameAncestors = allowEmbedding ? '*' : "'none'";
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors ${frameAncestors}`);
}

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, status, text, extraHeaders = {}) {
  const body = Buffer.from(text);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function serveHtml(req, res, file) {
  fs.readFile(file, (error, data) => {
    if (error) { sendText(res, 500, '页面读取失败'); return; }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let stopped = false;
    req.on('data', chunk => {
      if (stopped) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        stopped = true;
        reject(Object.assign(new Error('文档不能超过 1MB'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (stopped) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(Object.assign(new Error('请求格式不正确'), { status: 400 })); }
    });
    req.on('error', error => { if (!stopped) reject(error); });
  });
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || '未命名文档';
}

function cleanFormat(value, content) {
  // mixed 是新的统一模式：Markdown 正文中直接使用 LaTeX 公式。
  // 保留旧的 markdown / latex 值，这样以前的文档仍然能按原方式打开。
  return resolveFormat(value, content);
}

function validateContent(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error('请先输入文档内容'), { status: 400 });
  }
  const size = Buffer.byteLength(value, 'utf8');
  if (size > MAX_DOCUMENT_BYTES) {
    throw Object.assign(new Error('文档不能超过 1MB'), { status: 413 });
  }
  return size;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function keyMatches(record, key) {
  const supplied = hashKey(key || '');
  const expected = String(record.keyHash || '');
  return expected.length === supplied.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function publicDocument(record, content) {
  return {
    ok: true,
    document: {
      id: record.id,
      title: record.title,
      format: record.format,
      content,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      size: record.size
    }
  };
}

async function createDocument(req, res) {
  if (!allowRate(clientIp(req), 'create', CREATE_RATE_MAX)) {
    sendJson(res, 429, { ok: false, message: '创建得太快了，请十分钟后再试' });
    return;
  }
  try {
    const body = await readJson(req);
    const content = String(body.content || '');
    const size = validateContent(content);
    if (!cleanupOldestDocuments(size, 1)) {
      sendJson(res, 507, { ok: false, message: '服务器剩余空间不足，暂时不能创建文档' });
      return;
    }

    const id = crypto.randomBytes(8).toString('hex');
    const key = crypto.randomBytes(24).toString('base64url');
    const now = new Date().toISOString();
    const record = {
      id,
      title: cleanTitle(body.title),
      format: cleanFormat(body.format, content),
      size,
      createdAt: now,
      updatedAt: now,
      keyHash: hashKey(key)
    };

    fs.writeFileSync(documentPath(id), content, { flag: 'wx' });
    try {
      documents.push(record);
      saveMetadata();
    } catch (error) {
      documents = documents.filter(item => item.id !== id);
      try { fs.unlinkSync(documentPath(id)); } catch (_) {}
      throw error;
    }

    sendJson(res, 201, {
      ok: true,
      id,
      viewUrl: `/d/${id}`,
      editUrl: `/d/${id}/pre`,
      rawUrl: `/raw/${id}`,
      key,
      message: '文档创建成功'
    });
  } catch (error) {
    console.error('创建文档失败：', error.message);
    sendJson(res, error.status || 500, { ok: false, message: error.status ? error.message : '服务器保存文档失败' });
  }
}

async function verifyDocumentKey(req, res, record) {
  if (!allowRate(clientIp(req), 'key', KEY_RATE_MAX)) {
    sendJson(res, 429, { ok: false, message: '尝试次数太多，请十分钟后再试' });
    return;
  }
  try {
    const body = await readJson(req);
    if (!keyMatches(record, body.key)) {
      sendJson(res, 403, { ok: false, message: '文档密钥不正确' });
      return;
    }
    sendJson(res, 200, { ok: true, message: '密钥正确' });
  } catch (error) {
    sendJson(res, error.status || 400, { ok: false, message: error.message || '验证失败' });
  }
}

async function updateDocument(req, res, record) {
  if (!allowRate(clientIp(req), 'key', KEY_RATE_MAX)) {
    sendJson(res, 429, { ok: false, message: '操作太频繁，请十分钟后再试' });
    return;
  }
  try {
    const body = await readJson(req);
    if (!keyMatches(record, body.key)) {
      sendJson(res, 403, { ok: false, message: '文档密钥不正确' });
      return;
    }
    const content = String(body.content || '');
    const size = validateContent(content);
    const extraBytes = Math.max(0, size - Number(record.size || 0));
    if (!cleanupOldestDocuments(extraBytes, 0, record.id)) {
      sendJson(res, 507, { ok: false, message: '服务器剩余空间不足，无法保存本次修改' });
      return;
    }

    const temporary = documentPath(record.id) + '.tmp';
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, documentPath(record.id));
    record.title = cleanTitle(body.title);
    record.format = cleanFormat(body.format === undefined ? record.format : body.format, content);
    record.size = size;
    record.updatedAt = new Date().toISOString();
    saveMetadata();
    sendJson(res, 200, { ok: true, message: '修改已保存', updatedAt: record.updatedAt });
  } catch (error) {
    console.error('修改文档失败：', error.message);
    sendJson(res, error.status || 500, { ok: false, message: error.status ? error.message : '服务器保存修改失败' });
  }
}

async function deleteDocument(req, res, record) {
  if (!allowRate(clientIp(req), 'key', KEY_RATE_MAX)) {
    sendJson(res, 429, { ok: false, message: '操作太频繁，请十分钟后再试' });
    return;
  }
  try {
    const body = await readJson(req);
    if (!keyMatches(record, body.key)) {
      sendJson(res, 403, { ok: false, message: '文档密钥不正确' });
      return;
    }
    removeStoredDocument(record);
    documents = documents.filter(item => item.id !== record.id);
    saveMetadata();
    sendJson(res, 200, { ok: true, message: '文档已删除' });
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, message: error.message || '删除失败' });
  }
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch (_) { securityHeaders(res); sendText(res, 400, 'Bad Request'); return; }

  // 普通阅读页可以放进预览框；带 /pre 的编辑页继续禁止内嵌。
  const isPublicDocumentView = (req.method === 'GET' || req.method === 'HEAD')
    && /^\/d\/[a-f0-9]{16}\/?$/.test(url.pathname);
  securityHeaders(res, isPublicDocumentView);

  if ((req.method === 'GET' || req.method === 'HEAD') && ['/html-support.js', '/purify.min.js'].includes(url.pathname)) {
    const body = fs.readFileSync(path.join(ROOT_DIR, url.pathname.slice(1)));
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
    serveHtml(req, res, INDEX_FILE);
    return;
  }

  const pageMatch = url.pathname.match(/^\/d\/([a-f0-9]{16})(?:\/pre)?\/?$/);
  if ((req.method === 'GET' || req.method === 'HEAD') && pageMatch) {
    const record = documents.find(item => item.id === pageMatch[1]);
    if (!record) { sendText(res, 404, '文档不存在或已被自动清理'); return; }
    serveHtml(req, res, DOCUMENT_PAGE);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    sendJson(res, 200, {
      ok: true,
      documentCount: documents.length,
      usedBytes: totalDocumentBytes(),
      maxBytes: MAX_STORAGE_BYTES,
      maxDocumentBytes: MAX_DOCUMENT_BYTES,
      autoCleanup: true
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/documents') {
    createDocument(req, res);
    return;
  }

  const apiMatch = url.pathname.match(/^\/api\/documents\/([a-f0-9]{16})(?:\/(verify))?$/);
  if (apiMatch) {
    const record = documents.find(item => item.id === apiMatch[1]);
    if (!record) { sendJson(res, 404, { ok: false, message: '文档不存在或已被自动清理' }); return; }
    if (req.method === 'GET' && !apiMatch[2]) {
      try {
        const content = fs.readFileSync(documentPath(record.id), 'utf8');
        sendJson(res, 200, publicDocument(record, content));
      } catch (_) {
        sendJson(res, 404, { ok: false, message: '文档文件不存在' });
      }
      return;
    }
    if (req.method === 'POST' && apiMatch[2] === 'verify') {
      verifyDocumentKey(req, res, record);
      return;
    }
    if (req.method === 'PUT' && !apiMatch[2]) {
      updateDocument(req, res, record);
      return;
    }
    if (req.method === 'DELETE' && !apiMatch[2]) {
      deleteDocument(req, res, record);
      return;
    }
  }

  const rawMatch = url.pathname.match(/^\/raw\/([a-f0-9]{16})$/);
  if ((req.method === 'GET' || req.method === 'HEAD') && rawMatch) {
    const record = documents.find(item => item.id === rawMatch[1]);
    if (!record) { sendText(res, 404, '文档不存在或已被自动清理'); return; }
    try {
      const content = fs.readFileSync(documentPath(record.id), 'utf8');
      const extension = record.format === 'html' ? 'html' : record.format === 'latex' ? 'tex' : 'md';
      const body = Buffer.from(content);
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'Content-Disposition': `inline; filename="document-${record.id}.${extension}"`
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    } catch (_) {
      sendText(res, 404, '文档文件不存在');
    }
    return;
  }

  sendText(res, 404, 'Not Found');
});

server.requestTimeout = 30 * 1000;
server.headersTimeout = 15 * 1000;
server.listen(PORT, () => {
  console.log(`Lernicks 文档站已启动: http://localhost:${PORT}`);
  console.log(`单份上限: ${Math.round(MAX_DOCUMENT_BYTES / MB)}MB，总容量: ${Math.round(MAX_STORAGE_BYTES / MB)}MB`);
});
