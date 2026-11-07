'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { BlockList, SocketAddress, isIP } = require('node:net');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const validSlug = s => typeof s === 'string' && /^[a-zA-Z0-9\-_\u4e00-\u9fa5]{1,60}$/.test(s);
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const random = () => crypto.randomBytes(24).toString('hex');
const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 60000;
const MAX_ATTEMPT_BUCKETS = 10000;

// Cloudflare's published origin networks: https://www.cloudflare.com/ips/
const cloudflare = new BlockList();
for (const [family, ranges] of [
  ['ipv4', [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'
  ]],
  ['ipv6', [
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'
  ]]
]) {
  for (const range of ranges) {
    const [address, prefix] = range.split('/');
    cloudflare.addSubnet(address, Number(prefix), family);
  }
}

function normalizeIp(value) {
  if (typeof value !== 'string' || value.includes('%')) return null;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return null;
  const { address } = new SocketAddress({ address: value, family: 'ipv6' });
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function clientIp(req) {
  const socket = normalizeIp(req.socket.remoteAddress);
  if (!socket) return null;
  // The local Nginx proxy overwrites X-Real-IP with its actual connection peer.
  const peer = socket === '127.0.0.1' || socket === '::1'
    ? normalizeIp(req.headers['x-real-ip']) || socket
    : socket;
  if (!cloudflare.check(peer, isIP(peer) === 4 ? 'ipv4' : 'ipv6')) return peer;
  // Missing visitor IP must not put all visitors behind the same edge in one bucket.
  return normalizeIp(req.headers['cf-connecting-ip']);
}
const validEnvelope = e => e && e.v === 1 && e.kdf === 'PBKDF2-SHA256' && e.iterations === 600000 &&
  typeof e.salt === 'string' && /^[A-Za-z0-9_-]{22}$/.test(e.salt) &&
  typeof e.iv === 'string' && /^[A-Za-z0-9_-]{16}$/.test(e.iv) &&
  typeof e.ciphertext === 'string' && e.ciphertext.length >= 22 && e.ciphertext.length <= 2700000 && /^[A-Za-z0-9_-]+$/.test(e.ciphertext);

function install(app, { dataDir, express = require('express'), bcrypt = require('bcryptjs') }) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'notes.json');
  // Refuse corrupt storage instead of silently replacing real notes with an empty store.
  let notes = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!notes || Array.isArray(notes) || typeof notes !== 'object') throw Error('Invalid notes store');
  notes = Object.assign(Object.create(null), notes);
  const tokens = new Map(), queues = new Map(), attempts = new Map();
  const get = slug => own(notes, slug) ? notes[slug] : null;
  const revision = n => n.revision || String(n.updatedAt || 0);
  function commit(slug, value) {
    const next = Object.assign(Object.create(null), notes);
    if (value) next[slug] = value; else delete next[slug];
    const temp = file + '.next';
    let fd;
    try {
      fd = fs.openSync(temp, 'w', 0o600);
      fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(temp, file);
      notes = next;
      if (process.platform !== 'win32') {
        fd = fs.openSync(dataDir, 'r'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      }
    } catch (e) { if (fd !== undefined) fs.closeSync(fd); try { fs.unlinkSync(temp); } catch (_) {} throw e; }
    notes = next;
  }
  function issue(slug) {
    const token = random();
    if (tokens.size > 10000) for (const [s, t] of tokens) if (t.expires < Date.now()) tokens.delete(s);
    tokens.set(slug, { hash: hash(token), expires: Date.now() + 6 * 3600000 });
    return token;
  }
  function authorized(slug, token) {
    const t = tokens.get(slug);
    return t && t.expires > Date.now() && typeof token === 'string' && same(t.hash, hash(token));
  }
  function erase(slug) {
    commit(slug, null);
    tokens.delete(slug);
    const prefix = slug + ':';
    for (const key of attempts.keys()) if (key.startsWith(prefix)) attempts.delete(key);
  }
  function recordFailure(key, attempt, now) {
    const count = (attempt?.count || 0) + 1;
    const blocked = count >= ATTEMPT_LIMIT;
    attempts.delete(key);
    attempts.set(key, { count, blocked, expires: now + ATTEMPT_WINDOW_MS });
    // Keep the newest buckets, without clearing every active ban under load.
    while (attempts.size > MAX_ATTEMPT_BUCKETS) attempts.delete(attempts.keys().next().value);
  }
  const sweepAttempts = setInterval(() => {
    const now = Date.now();
    for (const [key, attempt] of attempts) if (attempt.expires <= now) attempts.delete(key);
  }, ATTEMPT_WINDOW_MS);
  sweepAttempts.unref();
  function meta(n) {
    if (!n) return { exists: false, hasPassword: false, encrypted: false, burnAfterRead: false };
    return { exists: true, hasPassword: !!n.hasPassword, question: n.question || '', encrypted: !!n.encrypted,
      burnAfterRead: !!n.burnAfterRead, revision: revision(n), crypto: n.encrypted ? { v: 1, kdf: n.envelope.kdf, iterations: n.envelope.iterations, salt: n.envelope.salt } : null };
  }
  function payload(n) { return { ...meta(n), content: n.encrypted ? undefined : n.content, envelope: n.encrypted ? n.envelope : undefined }; }
  const router = express.Router();
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store, private, max-age=0', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  const run = fn => (req, res) => {
    const slug = req.params.slug;
    if (!validSlug(slug)) return res.status(400).json({ error: 'INVALID_SLUG' });
    const previous = queues.get(slug) || Promise.resolve();
    const work = previous.then(() => fn(req, res, slug)).catch(() => {
      if (!res.headersSent) res.status(500).json({ error: 'STORAGE_ERROR' });
    });
    queues.set(slug, work);
    work.finally(() => { if (queues.get(slug) === work) queues.delete(slug); });
  };
  router.get('/:slug/meta', run((req, res, slug) => res.json(meta(get(slug)))));
  router.get('/:slug', run((req, res, slug) => {
    const n = get(slug);
    if (!n) return res.json({ ...meta(null), content: '' });
    if (n.burnAfterRead || n.encrypted) return res.status(403).json({ error: 'EXPLICIT_READ_REQUIRED', ...meta(n) });
    if (n.hasPassword) return res.status(403).json({ error: 'PASSWORD_REQUIRED' });
    res.json(payload(n));
  }));
  const read = run(async (req, res, slug) => {
    const n = get(slug), b = req.body || {};
    if (!n) return res.status(410).json({ error: 'NOT_FOUND_OR_DESTROYED' });
    // Old clients must never accidentally consume a burn note via auto-unlock.
    if (n.burnAfterRead && (req.path.endsWith('/unlock') || b.confirmRead !== true)) return res.status(409).json({ error: 'CONFIRM_READ_REQUIRED' });
    if (b.revision !== undefined && b.revision !== revision(n)) return res.status(409).json({ error: 'CONFLICT' });
    let attemptKey, attempt;
    if (!n.burnAfterRead && (n.hasPassword || n.encrypted)) {
      const ip = clientIp(req);
      if (!ip) return res.status(400).json({ error: 'CLIENT_IP_UNAVAILABLE' });
      attemptKey = `${slug}:${revision(n)}:${ip}`;
      attempt = attempts.get(attemptKey);
      const now = Date.now();
      if (attempt?.expires <= now) { attempts.delete(attemptKey); attempt = undefined; }
      if (attempt?.blocked) {
        res.set('Retry-After', String(Math.ceil((attempt.expires - now) / 1000)));
        return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS' });
      }
    }
    const ok = n.encrypted ? (typeof b.accessKey === 'string' && /^[A-Za-z0-9_-]{43}$/.test(b.accessKey) && same(hash(b.accessKey), n.accessHash)) :
      !n.hasPassword || await bcrypt.compare(String(b.password || ''), n.passwordHash);
    if (!ok) {
      if (n.burnAfterRead) { erase(slug); return res.status(410).json({ error: 'DESTROYED_WRONG_PASSWORD', destroyed: true }); }
      recordFailure(attemptKey, attempt, Date.now());
      return res.status(401).json({ error: 'WRONG_PASSWORD' });
    }
    const result = payload(n);
    if (n.burnAfterRead) { erase(slug); return res.json({ ...result, destroyed: true }); }
    if (attemptKey) attempts.delete(attemptKey);
    res.json({ ...result, ok: true, token: issue(slug) });
  });
  router.post('/:slug/read', read);
  router.post('/:slug/unlock', read);
  router.put('/:slug', run(async (req, res, slug) => {
    const b = req.body || {}, old = get(slug);
    if (!old && (b.create !== true || b.revision)) return res.status(410).json({ error: 'NOT_FOUND_OR_DESTROYED' });
    if (old && b.create === true) return res.status(409).json({ error: 'CONFLICT' });
    if (old && (old.hasPassword || old.encrypted || old.burnAfterRead) && !authorized(slug, b.token)) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (old && b.revision !== revision(old)) return res.status(409).json({ error: 'CONFLICT' });
    if (b.burnAfterRead !== undefined && typeof b.burnAfterRead !== 'boolean') return res.status(400).json({ error: 'INVALID_OPTIONS' });
    const n = { ...(old || {}), updatedAt: Date.now(), revision: random() };
    n.burnAfterRead = b.burnAfterRead === undefined ? !!n.burnAfterRead : b.burnAfterRead;
    if (b.encrypted !== undefined && typeof b.encrypted !== 'boolean') return res.status(400).json({ error: 'INVALID_OPTIONS' });
    n.encrypted = b.encrypted === undefined ? !!n.encrypted : b.encrypted;
    if (n.encrypted) {
      if (!validEnvelope(b.envelope) || typeof b.accessKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(b.accessKey) || typeof b.hasPassword !== 'boolean') return res.status(400).json({ error: 'INVALID_ENCRYPTED_NOTE' });
      if (own(b, 'content') || own(b, 'setPassword')) return res.status(400).json({ error: 'PLAINTEXT_FORBIDDEN' });
      n.envelope = { v: 1, kdf: 'PBKDF2-SHA256', iterations: 600000, salt: b.envelope.salt, iv: b.envelope.iv, ciphertext: b.envelope.ciphertext };
      n.accessHash = hash(b.accessKey); n.hasPassword = b.hasPassword;
      delete n.content; delete n.passwordHash;
    } else {
      if (old?.encrypted && typeof b.content !== 'string') return res.status(400).json({ error: 'CONTENT_REQUIRED' });
      if (b.content !== undefined && (typeof b.content !== 'string' || b.content.length > 500000)) return res.status(400).json({ error: 'CONTENT_TOO_LARGE' });
      n.content = b.content === undefined ? (old?.content || '') : b.content;
      if (own(b, 'setPassword')) {
        if (typeof b.setPassword !== 'string' || b.setPassword.length > 200) return res.status(400).json({ error: 'INVALID_PASSWORD' });
        // bcrypt only considers the first 72 bytes; reject silent truncation.
        if (Buffer.byteLength(b.setPassword, 'utf8') > 72) return res.status(400).json({ error: 'PASSWORD_TOO_LONG' });
        n.hasPassword = !!b.setPassword; n.passwordHash = n.hasPassword ? await bcrypt.hash(b.setPassword, 10) : null;
      } else if (old?.encrypted) return res.status(400).json({ error: 'PASSWORD_REQUIRED' });
      delete n.envelope; delete n.accessHash;
    }
    if (b.question !== undefined && (typeof b.question !== 'string' || b.question.length > 200)) return res.status(400).json({ error: 'INVALID_QUESTION' });
    n.question = n.hasPassword ? (b.question === undefined ? n.question || '' : b.question) : '';
    commit(slug, n); tokens.delete(slug);
    res.json({ ok: true, ...meta(n), token: issue(slug), updatedAt: n.updatedAt });
  }));
  router.delete('/:slug', run((req, res, slug) => {
    const n = get(slug), b = req.body || {};
    if (!n) return res.status(410).json({ error: 'NOT_FOUND_OR_DESTROYED' });
    if ((n.hasPassword || n.encrypted || n.burnAfterRead) && !authorized(slug, b.token)) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (b.revision !== revision(n)) return res.status(409).json({ error: 'CONFLICT' });
    erase(slug); res.json({ ok: true, destroyed: true });
  }));
  router.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use('/api/notes', router);
}
module.exports = { install, validEnvelope };
