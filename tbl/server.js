/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'tbl');
// Lernicks 图床后端
// 只使用 Node.js 自带功能，服务器不需要另外安装软件。

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.TBL_PORT) || 1148;
const ROOT_DIR = __dirname;
const INDEX_FILE = path.join(ROOT_DIR, 'index.html');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const META_FILE = path.join(DATA_DIR, 'images.json');

const MB = 1024 * 1024;
const MAX_FILE_BYTES = positiveNumber(process.env.TBL_MAX_FILE_MB, 10) * MB;
const MAX_STORAGE_BYTES = positiveNumber(process.env.TBL_MAX_STORAGE_MB, 3072) * MB;
const MIN_FREE_BYTES = positiveNumber(process.env.TBL_MIN_FREE_MB, 1024) * MB;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 512 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_UPLOADS = positiveNumber(process.env.TBL_RATE_MAX, 12);
// 默认复用 803 网站的管理员密钥，但仓库里只保存 SHA-256 哈希。
// 如果以后要单独换图床密钥，可以设置 TBL_ADMIN_KEY_HASH 环境变量。
const ADMIN_KEY_HASH = String(process.env.TBL_ADMIN_KEY_HASH || 'f1d5c9e75d4fc18900e439cad1a255960a4b4ae965991d59415bb9aff0a9eb7f').trim().toLowerCase();

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
    console.error('读取图片记录失败，将使用空记录：', error.message);
    return [];
  }
}

let images = loadMetadata();

function saveMetadata() {
  const temporary = META_FILE + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(images, null, 2));
  fs.renameSync(temporary, META_FILE);
}

function reconcileMetadata() {
  const before = images.length;
  images = images.filter(item => {
    if (!item || typeof item.fileName !== 'string') return false;
    return fs.existsSync(path.join(UPLOAD_DIR, path.basename(item.fileName)));
  });
  if (images.length !== before) saveMetadata();
}

function totalImageBytes() {
  return images.reduce((sum, item) => sum + Number(item.size || 0), 0);
}

function availableDiskBytes() {
  try {
    const stats = fs.statfsSync(UPLOAD_DIR);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (_) {
    // 少数系统不支持 statfsSync 时，仍然使用 3GB 图床上限。
    return null;
  }
}

function removeStoredImage(item) {
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(item.fileName)));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('删除旧图片失败：', item.fileName, error.message);
  }
}

// extraBytes 表示准备新上传的图片需要占用多少空间。
// 只会删除 uploads 目录中的图片，不会触碰其他网站的数据。
function cleanupOldestImages(extraBytes = 0) {
  images.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let total = totalImageBytes();
  let free = availableDiskBytes();
  let changed = false;

  const needsCleanup = () => {
    if (total + extraBytes > MAX_STORAGE_BYTES) return true;
    return free !== null && free < MIN_FREE_BYTES + extraBytes;
  };

  while (needsCleanup() && images.length > 0) {
    const oldest = images.shift();
    removeStoredImage(oldest);
    total = Math.max(0, total - Number(oldest.size || 0));
    if (free !== null) free += Number(oldest.size || 0);
    changed = true;
    console.log('自动清理最早文件：', oldest.fileName);
  }

  if (changed) saveMetadata();
  return !needsCleanup();
}

reconcileMetadata();
cleanupOldestImages();

const rateRecords = new Map();

function clientIp(req) {
  const cfIp = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cfIp) return cfIp;
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  return req.socket.remoteAddress || 'unknown';
}

function allowUpload(ip) {
  const now = Date.now();
  const recent = (rateRecords.get(ip) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_UPLOADS) {
    rateRecords.set(ip, recent);
    return false;
  }
  recent.push(now);
  rateRecords.set(ip, recent);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, records] of rateRecords) {
    const recent = records.filter(time => now - time < RATE_WINDOW_MS);
    if (recent.length) rateRecords.set(ip, recent);
    else rateRecords.delete(ip);
  }
  cleanupOldestImages();
}, 60 * 1000).unref();

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, status, text) {
  const body = Buffer.from(text);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;

    req.on('data', chunk => {
      if (finished) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        finished = true;
        reject(Object.assign(new Error('文件不能超过 10MB'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!finished) resolve(Buffer.concat(chunks));
    });
    req.on('error', error => {
      if (!finished) reject(error);
    });
  });
}

function parseMultipartFile(req, body) {
  const contentType = String(req.headers['content-type'] || '');
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw Object.assign(new Error('上传格式不正确'), { status: 400 });
  const boundary = match[1] || match[2];
  // 为了兼容旧网页，文件表单字段仍使用 image 这个名字。
  const dispositionMarker = Buffer.from('Content-Disposition:');
  let partStart = -1;
  let headerEnd = -1;
  let headers = '';
  let searchFrom = 0;
  while ((partStart = body.indexOf(dispositionMarker, searchFrom)) >= 0) {
    headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), partStart);
    if (headerEnd < 0) break;
    headers = body.subarray(partStart, headerEnd).toString('utf8');
    if (/\bname=(?:"image"|image)(?:;|\r?$)/im.test(headers)) break;
    searchFrom = headerEnd + 4;
    partStart = -1;
  }
  if (partStart < 0) throw Object.assign(new Error('没有找到上传文件'), { status: 400 });
  if (headerEnd < 0) throw Object.assign(new Error('上传格式不完整'), { status: 400 });
  const fileEnd = body.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
  if (fileEnd < 0) throw Object.assign(new Error('上传内容不完整'), { status: 400 });

  const fileNameMatch = headers.match(/filename="([^"]*)"/i);
  const originalName = sanitizeOriginalName(fileNameMatch ? fileNameMatch[1] : 'file');
  const file = body.subarray(headerEnd + 4, fileEnd);
  if (!file.length) throw Object.assign(new Error('文件内容为空'), { status: 400 });
  if (file.length > MAX_FILE_BYTES) throw Object.assign(new Error('文件不能超过 10MB'), { status: 413 });
  return { file, originalName };
}

function sanitizeOriginalName(name) {
  return String(name || 'file')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .slice(0, 160) || 'file';
}

function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  const firstSix = buffer.subarray(0, 6).toString('ascii');
  if (firstSix === 'GIF87a' || firstSix === 'GIF89a') {
    return { extension: 'gif', mime: 'image/gif' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: 'webp', mime: 'image/webp' };
  }
  return null;
}

function detectVideoType(buffer, originalName) {
  const extension = path.extname(originalName || '').slice(1).toLowerCase();
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return extension === 'mov'
      ? { extension: 'mov', mime: 'video/quicktime', kind: 'video' }
      : { extension: 'mp4', mime: 'video/mp4', kind: 'video' };
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { extension: 'webm', mime: 'video/webm', kind: 'video' };
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return { extension: 'ogv', mime: 'video/ogg', kind: 'video' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'AVI ') {
    return { extension: 'avi', mime: 'video/x-msvideo', kind: 'video' };
  }
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && (buffer[3] === 0xba || buffer[3] === 0xb3)) {
    return { extension: 'mpeg', mime: 'video/mpeg', kind: 'video' };
  }
  return null;
}

function hashAdminKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function adminKeyMatches(key) {
  const supplied = hashAdminKey(key);
  const expected = ADMIN_KEY_HASH;
  return /^[a-f0-9]{64}$/.test(expected)
    && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function classifyUpload(file, originalName, adminAuthorized) {
  const imageType = detectImageType(file);
  if (imageType) return { ...imageType, kind: 'image' };
  if (!adminAuthorized) return null;
  return detectVideoType(file, originalName)
    || { extension: 'bin', mime: 'application/octet-stream', kind: 'file' };
}

function hashDeleteCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function imageResponseUrl(fileName) {
  return '/i/' + encodeURIComponent(fileName);
}

async function handleUpload(req, res) {
  const length = Number(req.headers['content-length'] || 0);
  if (length && length > MAX_REQUEST_BYTES) {
    sendJson(res, 413, { ok: false, message: '文件不能超过 10MB' });
    return;
  }
  const adminKey = String(req.headers['x-tbl-admin-key'] || '').trim();
  const adminAuthorized = adminKeyMatches(adminKey);
  if (adminKey && !adminAuthorized) {
    sendJson(res, 403, { ok: false, message: '管理员密钥不正确' });
    return;
  }
  if (!allowUpload(clientIp(req))) {
    sendJson(res, 429, { ok: false, message: '上传得太快了，请十分钟后再试' });
    return;
  }

  try {
    const body = await readRequestBody(req);
    const { file, originalName } = parseMultipartFile(req, body);
    const type = classifyUpload(file, originalName, adminAuthorized);
    if (!type) {
      sendJson(res, 403, { ok: false, message: '普通用户只能上传 JPG、PNG、GIF、WebP 图片；其他文件需要管理员密钥' });
      return;
    }

    if (!cleanupOldestImages(file.length)) {
      sendJson(res, 507, { ok: false, message: '服务器剩余空间不足，暂时不能上传' });
      return;
    }

    const id = crypto.randomBytes(10).toString('hex');
    const deleteCode = crypto.randomBytes(18).toString('base64url');
    const fileName = `${Date.now().toString(36)}-${crypto.randomBytes(9).toString('hex')}.${type.extension}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, file, { flag: 'wx' });

    const record = {
      id,
      fileName,
      originalName,
      mime: type.mime,
      kind: type.kind,
      size: file.length,
      createdAt: new Date().toISOString(),
      deleteHash: hashDeleteCode(deleteCode)
    };

    try {
      images.push(record);
      saveMetadata();
    } catch (error) {
      images = images.filter(item => item.id !== id);
      try { fs.unlinkSync(filePath); } catch (_) {}
      throw error;
    }

    sendJson(res, 201, {
      ok: true,
      id,
      url: imageResponseUrl(fileName),
      originalName,
      mime: type.mime,
      kind: type.kind,
      size: file.length,
      deleteCode,
      message: '上传成功'
    });
  } catch (error) {
    console.error('上传失败：', error.message);
    sendJson(res, error.status || 500, { ok: false, message: error.status ? error.message : '服务器保存文件失败' });
  }
}

async function handleDelete(req, res, id) {
  try {
    const body = await readSmallJson(req);
    const index = images.findIndex(item => item.id === id);
    if (index < 0) {
      sendJson(res, 404, { ok: false, message: '文件不存在或已经被自动清理' });
      return;
    }
    const record = images[index];
    const supplied = hashDeleteCode(body.deleteCode || '');
    const expected = String(record.deleteHash || '');
    if (!expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      sendJson(res, 403, { ok: false, message: '删除码不正确' });
      return;
    }
    removeStoredImage(record);
    images.splice(index, 1);
    saveMetadata();
    sendJson(res, 200, { ok: true, message: '文件已删除' });
  } catch (error) {
    sendJson(res, error.status || 400, { ok: false, message: error.message || '删除失败' });
  }
}

function readSmallJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 4096) {
        reject(Object.assign(new Error('请求内容过大'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(Object.assign(new Error('请求格式不正确'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveIndex(req, res) {
  fs.readFile(INDEX_FILE, (error, data) => {
    if (error) { sendText(res, 500, '图床页面读取失败'); return; }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  });
}

function downloadDisposition(originalName) {
  const safeName = sanitizeOriginalName(originalName);
  const fallback = safeName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download';
  const encoded = encodeURIComponent(safeName).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function serveUpload(req, res, requestedName) {
  let fileName;
  try { fileName = decodeURIComponent(requestedName); }
  catch (_) { sendText(res, 400, 'Bad Request'); return; }
  if (fileName !== path.basename(fileName) || !/^[a-z0-9-]+\.[a-z0-9]{1,12}$/.test(fileName)) {
    sendText(res, 404, 'Not Found');
    return;
  }
  const record = images.find(item => item.fileName === fileName);
  if (!record) { sendText(res, 404, '文件不存在或已被自动清理'); return; }
  const filePath = path.join(UPLOAD_DIR, fileName);
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) { sendText(res, 404, '文件不存在或已被自动清理'); return; }
    const isInlineMedia = record.kind === 'image' || record.kind === 'video'
      || (!record.kind && /^(?:image|video)\//.test(String(record.mime || '')));
    const isVideo = record.kind === 'video' || (!record.kind && /^video\//.test(String(record.mime || '')));
    const headers = {
      'Content-Type': isInlineMedia ? record.mime : 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': isInlineMedia ? 'inline' : downloadDisposition(record.originalName)
    };
    if (isVideo) headers['Accept-Ranges'] = 'bytes';

    const rangeMatch = isVideo && String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
    if (rangeMatch) {
      let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
      let end = rangeMatch[2] ? Number(rangeMatch[2]) : stats.size - 1;
      if (!rangeMatch[1] && rangeMatch[2]) start = Math.max(0, stats.size - Number(rangeMatch[2]));
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stats.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }
      end = Math.min(end, stats.size - 1);
      headers['Content-Length'] = end - start + 1;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
      return;
    }

    headers['Content-Length'] = stats.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch (_) { sendText(res, 400, 'Bad Request'); return; }

  if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
    serveIndex(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    sendJson(res, 200, {
      ok: true,
      imageCount: images.length,
      uploadCount: images.length,
      usedBytes: totalImageBytes(),
      maxBytes: MAX_STORAGE_BYTES,
      maxFileBytes: MAX_FILE_BYTES,
      autoCleanup: true
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    handleUpload(req, res);
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/images\/([a-f0-9]{20})$/);
  if (req.method === 'DELETE' && deleteMatch) {
    handleDelete(req, res, deleteMatch[1]);
    return;
  }

  const imageMatch = url.pathname.match(/^\/i\/(.+)$/);
  if ((req.method === 'GET' || req.method === 'HEAD') && imageMatch) {
    serveUpload(req, res, imageMatch[1]);
    return;
  }

  sendText(res, 404, 'Not Found');
});

server.requestTimeout = 30 * 1000;
server.headersTimeout = 15 * 1000;
server.listen(PORT, () => {
  console.log(`Lernicks 图床已启动: http://localhost:${PORT}`);
  console.log(`单张上限: ${Math.round(MAX_FILE_BYTES / MB)}MB，图床容量: ${Math.round(MAX_STORAGE_BYTES / MB)}MB`);
});
