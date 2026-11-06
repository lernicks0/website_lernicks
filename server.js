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
let feedback = loadJson(FEEDBACK_FILE, []); // [{ id, name, message, createdAt }]

let saveTimerFeedback = null;
function persistFeedback() {
  clearTimeout(saveTimerFeedback);
  saveTimerFeedback = setTimeout(() => {
    fs.writeFile(FEEDBACK_FILE, JSON.stringify(feedback), (err) => {
      if (err) console.error('写入 feedback.json 失败:', err.message);
    });
  }, 150);
}

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 笔记 API ----------

require('./note-security.cjs').install(app, { dataDir: DATA_DIR });

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
