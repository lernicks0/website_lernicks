'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const MAX_FILES = 100;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST = MAX_BYTES + 512 * 1024;
const MAX_STORAGE = 2 * 1024 ** 3;
const MAX_PROJECTS = 10000;
const PUBLIC_ORIGIN = process.env.HT_ORIGIN || '';
const DATA = path.resolve(process.env.HT_DATA_DIR || path.join(__dirname, 'data'));
const PROJECT_ID = /^[a-f0-9]{24}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const HTML = /\.html?$/i;
const NO_CACHE = { 'Cache-Control': 'no-store' };
const CONTENT_HEADERS = {
  'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-modals allow-downloads; frame-ancestors \'none\'; worker-src \'none\'',
  'Access-Control-Allow-Origin': '*',
};
const APP_HEADERS = {
  ...NO_CACHE,
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
};
const MIME = new Map(Object.entries({
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.txt': 'text/plain',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/vnd.microsoft.icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
}));
const APP_FILES = new Map([
  ['/', 'index.html'], ['/app.js', 'app.js'], ['/style.css', 'style.css'],
]);
const PUBLIC = new Map(Array.from(APP_FILES, ([route, file]) => [
  route, { type: MIME.get(path.extname(file)), body: fs.readFileSync(path.join(__dirname, file)) },
]));

fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
const projects = new Map();
let usedBytes = 0;
for (const item of fs.readdirSync(DATA, { withFileTypes: true })) {
  if (item.isDirectory() && PROJECT_ID.test(item.name)) {
    const record = JSON.parse(fs.readFileSync(path.join(DATA, item.name, 'project.json'), 'utf8'));
    projects.set(item.name, record);
    usedBytes += record.size;
  }
}
const editing = new Set();
const uploadTimes = new Map();
const rateWindow = 15 * 60 * 1000;
let activeUploads = 0;
let reservedBytes = 0;

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of uploadTimes) {
    if (now >= record.reset) uploadTimes.delete(key);
  }
}, rateWindow).unref();

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(req, res, status, body, type, headers = NO_CACHE) {
  res.writeHead(status, {
    ...headers,
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function json(req, res, status, data) {
  send(req, res, status, JSON.stringify(data), 'application/json; charset=utf-8');
}

function validateBrowserRequest(req) {
  const expected = PUBLIC_ORIGIN || `http://${req.headers.host}`;
  if (req.headers['x-ht-request'] !== '1' ||
      (req.headers.origin && req.headers.origin !== expected)) {
    throw new RequestError(403, '请从上传页面发起请求。');
  }
}

function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    throw new RequestError(413, '上传超出大小限制。');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
      else {
        chunks.length = 0;
        reject(new RequestError(413, '上传超出大小限制。'));
      }
    });
    req.once('end', () => resolve(Buffer.concat(chunks)));
    req.once('error', reject);
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestError(400, '请求格式有误。');
  }
}

function validFilePath(value) {
  return typeof value === 'string' && value.length <= 500 && value.isWellFormed() &&
    !/[\\\x00-\x1f\x7f]/.test(value) &&
    value.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}

function chooseEntry(files, selected) {
  const pages = files.filter(file => HTML.test(file));
  if (pages.length === 0) throw new RequestError(400, '请至少上传一个 HTML 文件。');
  const entry = selected === undefined
    ? pages.find(file => file.toLowerCase() === 'index.html') || (pages.length === 1 ? pages[0] : undefined)
    : selected;
  if (!pages.includes(entry)) throw new RequestError(400, '请选择一个已上传的 HTML 作为入口。');
  return entry;
}

function rateUpload(req) {
  // Nginx overwrites X-Real-IP. Node only listens on loopback.
  const key = PUBLIC_ORIGIN ? req.headers['x-real-ip'] || req.socket.remoteAddress : req.socket.remoteAddress;
  const now = Date.now();
  let record = uploadTimes.get(key);
  if (!record || now >= record.reset) {
    record = { count: 0, reset: now + rateWindow };
    uploadTimes.set(key, record);
  }
  if (record.count >= 30) throw new RequestError(429, '上传次数过多，请稍后再试。');
  ++record.count;
}

async function publish(req) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('multipart/form-data;')) throw new RequestError(415, '请使用上传表单。');
  if (activeUploads >= 4) throw new RequestError(503, '当前上传较多，请稍后重试。');
  rateUpload(req);
  ++activeUploads;
  try {
    const body = await readBody(req, MAX_REQUEST);
    let form;
    try {
      form = await new Response(body, { headers: { 'Content-Type': type } }).formData();
    } catch {
      throw new RequestError(400, '上传表单格式有误。');
    }
    const manifest = parseJson(form.get('manifest'));
    const files = form.getAll('file');
    const names = manifest?.files;
    if (!Array.isArray(names) || files.length !== names.length || !files.length || files.length > MAX_FILES ||
        !names.every(validFilePath) || new Set(names).size !== names.length ||
        files.some(file => typeof file === 'string')) {
      throw new RequestError(400, '请检查文件数量、路径或重名文件。每次最多上传 100 个文件。');
    }
    const entry = chooseEntry(names, manifest.entry);
    const size = files.reduce((sum, file) => sum + file.size, 0);
    if (size > MAX_BYTES) throw new RequestError(413, '每个项目最大 20 MB。');
    const disk = await fsp.statfs(DATA);
    if (projects.size + activeUploads > MAX_PROJECTS || usedBytes + reservedBytes + size > MAX_STORAGE ||
        disk.bavail * disk.bsize < 512 * 1024 ** 2 + reservedBytes + size) {
      throw new RequestError(507, '站点存储空间不足。');
    }
    reservedBytes += size;
    let stage;
    try {
      const id = randomBytes(12).toString('hex');
      const token = randomBytes(32).toString('hex');
      const record = { files: names, entry, size, tokenHash: hash(token).toString('hex') };
      stage = await fsp.mkdtemp(path.join(DATA, '.upload-'));
      for (const [index, file] of files.entries()) {
        await fsp.writeFile(path.join(stage, String(index)), Buffer.from(await file.arrayBuffer()));
      }
      await fsp.writeFile(path.join(stage, 'project.json'), JSON.stringify(record));
      await fsp.rename(stage, path.join(DATA, id));
      stage = undefined;
      projects.set(id, record);
      usedBytes += size;
      return { ...details(id, record), token };
    } finally {
      reservedBytes -= size;
      if (stage) await fsp.rm(stage, { recursive: true, force: true });
    }
  } finally {
    --activeUploads;
  }
}

function hash(token) {
  return createHash('sha256').update(token).digest();
}

function details(id, record) {
  return { id, url: `/p/${id}/`, entry: record.entry, entries: record.files.filter(file => HTML.test(file)) };
}

async function manage(req, id) {
  const record = projects.get(id);
  const token = req.headers.authorization?.slice(7);
  if (!record || !req.headers.authorization?.startsWith('Bearer ') || !TOKEN.test(token) ||
      !timingSafeEqual(hash(token), Buffer.from(record.tokenHash, 'hex'))) {
    throw new RequestError(404, '管理链接无效。');
  }
  if (req.method === 'GET') return details(id, record);
  if (editing.has(id)) throw new RequestError(409, '正在更新入口，请重试。');
  editing.add(id);
  try {
    const body = parseJson(await readBody(req, 8192));
    const entry = chooseEntry(record.files, body?.entry ?? '');
    const current = { ...record, entry };
    const target = path.join(DATA, id, 'project.json');
    const stage = target + '.tmp';
    await fsp.writeFile(stage, JSON.stringify(current));
    await fsp.rename(stage, target);
    projects.set(id, current);
    return details(id, current);
  } finally {
    editing.delete(id);
  }
}

function redirect(res, location) {
  res.writeHead(302, { ...NO_CACHE, Location: location });
  res.end();
}

async function serveProject(req, res, match, query) {
  const [, id, file] = match;
  const record = projects.get(id);
  if (!record) return false;
  const base = `/p/${id}/`;
  if (file === undefined || file === '') {
    const entry = record.entry.split('/').map(encodeURIComponent).join('/');
    redirect(res, (file === undefined ? base : base + entry) + query);
    return true;
  }
  let name;
  try {
    name = file.split('/').map(segment => {
      const decoded = decodeURIComponent(segment);
      if (decoded.includes('/')) throw Error('Encoded separator');
      return decoded;
    }).join('/');
  } catch {
    return false;
  }
  if (!validFilePath(name)) return false;
  const index = record.files.indexOf(name);
  if (index < 0) return false;
  const source = path.join(DATA, id, String(index));
  const stat = await fsp.stat(source);
  const type = MIME.get(path.extname(name).toLowerCase());
  const headers = {
    ...CONTENT_HEADERS,
    'Content-Type': type || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=3600',
  };
  if (!type) headers['Content-Disposition'] = 'attachment';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else await pipeline(fs.createReadStream(source), res);
  return true;
}

async function handle(req, res) {
  const route = req.url.split('?')[0];
  const query = req.url.slice(route.length);
  const readable = req.method === 'GET' || req.method === 'HEAD';
  if (readable && PUBLIC.has(route)) {
    const { body, type } = PUBLIC.get(route);
    return send(req, res, 200, body, type + '; charset=utf-8', APP_HEADERS);
  }
  if (readable && route === '/healthz') return json(req, res, 200, { ok: true, site: 'ht' });
  if (req.method === 'POST' && route === '/api/projects') {
    validateBrowserRequest(req);
    return json(req, res, 201, await publish(req));
  }
  const editor = route.match(/^\/api\/projects\/([a-f0-9]{24})$/);
  if (editor && (req.method === 'GET' || req.method === 'PATCH')) {
    validateBrowserRequest(req);
    return json(req, res, 200, await manage(req, editor[1]));
  }
  const project = route.match(/^\/p\/([a-f0-9]{24})(?:\/(.*))?$/);
  if (project && readable && await serveProject(req, res, project, query)) return;
  return send(req, res, 404, '页面不存在。', 'text/plain; charset=utf-8');
}

const server = http.createServer({ requestTimeout: 120000, headersTimeout: 15000 }, (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  handle(req, res).catch(error => {
    if (!(error instanceof RequestError)) console.error(error);
    if (res.headersSent || res.destroyed) {
      res.destroy();
      return;
    }
    req.resume();
    json(req, res, error.status || 500, { error: error.status ? error.message : '服务暂时无法处理请求。' });
  });
});
server.listen(Number(process.env.HT_PORT || 1156), '127.0.0.1', () => {
  console.log(`HT ready at http://127.0.0.1:${server.address().port}`);
});
