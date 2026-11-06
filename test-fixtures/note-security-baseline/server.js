/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'note');
// telegram-notes 后端服务
// 存储实现:本地 JSON 文件(data/notes.json, data/feedback.json)
// 生产环境如果需要多实例部署,建议把 store.js 换成真实数据库(见 README)

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

// ---------- 极简 JSON 文件存储 ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('读取存储文件失败,使用空数据:', file, e.message);
    return fallback;
  }
}
let notes = loadJson(NOTES_FILE, {});       // { slug: { content, hasPassword, passwordHash, updatedAt } }
let feedback = loadJson(FEEDBACK_FILE, []); // [{ id, name, message, createdAt }]

let saveTimerNotes = null;
function persistNotes() {
  clearTimeout(saveTimerNotes);
  saveTimerNotes = setTimeout(() => {
    fs.writeFile(NOTES_FILE, JSON.stringify(notes), (err) => {
      if (err) console.error('写入 notes.json 失败:', err.message);
    });
  }, 150);
}
let saveTimerFeedback = null;
function persistFeedback() {
  clearTimeout(saveTimerFeedback);
  saveTimerFeedback = setTimeout(() => {
    fs.writeFile(FEEDBACK_FILE, JSON.stringify(feedback), (err) => {
      if (err) console.error('写入 feedback.json 失败:', err.message);
    });
  }, 150);
}

// 内存中维护「解锁令牌」,不落盘,重启服务后需要重新输入密码
// tokens: Map<slug, Set<{token, expiresAt}>>
const unlockTokens = new Map();
function issueToken(slug) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60 * 6; // 6 小时有效
  if (!unlockTokens.has(slug)) unlockTokens.set(slug, new Set());
  const set = unlockTokens.get(slug);
  set.add(JSON.stringify({ token, expiresAt }));
  return token;
}
function verifyToken(slug, token) {
  if (!token) return false;
  const set = unlockTokens.get(slug);
  if (!set) return false;
  for (const raw of set) {
    const t = JSON.parse(raw);
    if (t.token === token) {
      if (t.expiresAt < Date.now()) { set.delete(raw); return false; }
      return true;
    }
  }
  return false;
}
function clearTokens(slug) { unlockTokens.delete(slug); }

// ---------- 工具函数 ----------
function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-zA-Z0-9\-_\u4e00-\u9fa5]{1,60}$/.test(slug);
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 笔记 API ----------

// 查询笔记基本信息(是否存在、是否需要密码),不返回内容
app.get('/api/notes/:slug/meta', (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'INVALID_SLUG' });
  const note = notes[slug];
  if (!note) return res.json({ exists: false, hasPassword: false });
  res.json({ exists: true, hasPassword: !!note.hasPassword });
});

// 无密码笔记:直接获取内容
app.get('/api/notes/:slug', (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'INVALID_SLUG' });
  const note = notes[slug];
  if (!note) return res.json({ exists: false, content: '', hasPassword: false });
  if (note.hasPassword) return res.status(403).json({ error: 'PASSWORD_REQUIRED' });
  res.json({ exists: true, content: note.content, hasPassword: false });
});

// 解锁有密码的笔记
app.post('/api/notes/:slug/unlock', async (req, res) => {
  const { slug } = req.params;
  const { password } = req.body || {};
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'INVALID_SLUG' });
  const note = notes[slug];
  if (!note || !note.hasPassword) return res.status(400).json({ error: 'NOT_PROTECTED' });
  const ok = await bcrypt.compare(String(password || ''), note.passwordHash);
  if (!ok) return res.status(401).json({ error: 'WRONG_PASSWORD' });
  const token = issueToken(slug);
  res.json({ ok: true, content: note.content, token });
});

// 创建 / 保存笔记内容,以及设置或修改密码
// body: { content, token, setPassword }
//   setPassword: undefined = 不变更密码; "" 或 null = 移除密码; 非空字符串 = 设置新密码
app.put('/api/notes/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'INVALID_SLUG' });
  const { content, token, setPassword } = req.body || {};
  const existing = notes[slug];

  // 已存在且带密码 -> 必须持有有效 token 才能保存或改密码
  if (existing && existing.hasPassword) {
    if (!verifyToken(slug, token)) return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const next = {
    content: typeof content === 'string' ? content.slice(0, 500000) : (existing ? existing.content : ''),
    hasPassword: existing ? existing.hasPassword : false,
    passwordHash: existing ? existing.passwordHash : null,
    updatedAt: Date.now(),
  };

  if (typeof setPassword !== 'undefined') {
    if (setPassword) {
      next.hasPassword = true;
      next.passwordHash = await bcrypt.hash(String(setPassword), 10);
      clearTokens(slug); // 改密码后旧令牌失效
    } else {
      next.hasPassword = false;
      next.passwordHash = null;
      clearTokens(slug);
    }
  }

  notes[slug] = next;
  persistNotes();
  res.json({ ok: true, updatedAt: next.updatedAt, hasPassword: next.hasPassword });
});

// 删除笔记
app.delete('/api/notes/:slug', (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'INVALID_SLUG' });
  const { token } = req.body || {};

  const note = notes[slug];
  if (!note) return res.status(404).json({ error: 'NOT_FOUND' });

  if (note.hasPassword) {
    if (!verifyToken(slug, token)) return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  delete notes[slug];
  clearTokens(slug);
  persistNotes();
  res.json({ ok: true });
});

// ---------- 反馈 API ----------
app.post('/api/feedback', (req, res) => {
  const { name, message } = req.body || {};
  const msg = String(message || '').trim().slice(0, 2000);
  if (!msg) return res.status(400).json({ error: 'EMPTY_MESSAGE' });
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    name: String(name || '').trim().slice(0, 40) || '匿名',
    message: msg,
    createdAt: Date.now(),
  };
  feedback.unshift(entry);
  feedback = feedback.slice(0, 500); // 只保留最近 500 条,避免文件无限增长
  persistFeedback();
  res.json({ ok: true });
});

app.get('/api/feedback', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  res.json({ items: feedback.slice(0, limit) });
});

// SPA 回退:除 /api 外的路径都返回前端页面(前端自己做哈希路由)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`telegram-notes 已启动: http://localhost:${PORT}`);
});
