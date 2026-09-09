/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, 'news');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getAccount, proxyAccountRequest } = require('../class-auth/client');

const PORT = Number(process.env.NEWS_PORT) || 1154;
const DATA = process.env.NEWS_DATA_FILE || path.join(__dirname, 'data', 'news.json');
const CATEGORIES = ['运动会预选赛', '日常生活', '八卦', '专题'];
// 身份来自账号服务的私密名单，不接受浏览器传入的姓名或管理员标记。
const reviewer = account => !!account && (process.env.NEWS_REVIEWER_ID
  ? account.id === process.env.NEWS_REVIEWER_ID : account.name === '王韩润');
let dataCache;
function read() {
  try {
    const stat = fs.statSync(DATA);
    const key = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (dataCache?.key === key) return dataCache.value;
    const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.articles)) throw new Error('Invalid news data');
    dataCache = { key, value: data };
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, articles: [] };
    throw error;
  }
}
let chain = Promise.resolve();
function update(change) {
  const job = chain.then(async () => {
    const data = structuredClone(read());
    const result = change(data);
    await fs.promises.mkdir(path.dirname(DATA), { recursive: true });
    const temp = DATA + '.' + crypto.randomUUID() + '.tmp';
    await fs.promises.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
    await fs.promises.rename(temp, DATA);
    dataCache = null;
    return result;
  });
  chain = job.catch(() => {});
  return job;
}
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, '请使用 JSON 提交');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk); size += chunk.length;
    if (size > 150000) fail(413, '稿件过长');
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { const value = JSON.parse(text); if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value; }
  catch (_) { fail(400, '提交内容格式不正确'); }
}
function string(value, label, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, label + '填写不正确');
  return value.trim();
}
function position(value, fallback) {
  if (value === undefined) return { ...fallback };
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 || value.x > 100 || value.y < 0 || value.y > 100) fail(400, '标题位置不正确');
  return { x: value.x, y: value.y };
}
function content(input) {
  if (!CATEGORIES.includes(input.category)) fail(400, '请选择新闻分区');
  if (typeof input.anonymous !== 'boolean') fail(400, '请选择署名方式');
  return {
    title: string(input.title, '主标题', 80, true),
    kicker: string(input.kicker ?? '', '引题', 80),
    subtitle: string(input.subtitle ?? '', '副标题', 120),
    body: string(input.body, '正文', 30000, true),
    category: input.category, anonymous: input.anonymous,
    positions: { kicker: position(input.positions?.kicker, { x: 0, y: 0 }), subtitle: position(input.positions?.subtitle, { x: 0, y: 100 }) }
  };
}
function publicArticle(a, full = true) {
  const result = { id: a.id, title: a.title, kicker: a.kicker, subtitle: a.subtitle, category: a.category,
    author: a.anonymous ? '匿名投稿' : a.authorName, anonymous: a.anonymous, publishedAt: a.publishedAt,
    positions: a.positions, excerpt: a.body.slice(0, 140) };
  if (full) result.body = a.body;
  return result;
}
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) fail(403, '请在新闻网站内提交');
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, '请在新闻网站内提交');
    }
    if (url.pathname.startsWith('/account-api/')) return proxyAccountRequest(req, res);
    if (req.method === 'GET' && url.pathname === '/api/articles') {
      const category = url.searchParams.get('category');
      const page = Math.max(1, Math.min(100000, Number(url.searchParams.get('page')) || 1));
      const items = read().articles.filter(a => a.status === 'published' && (!category || a.category === category)).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt));
      return json(res, 200, { articles: items.slice((page-1)*20, page*20).map(a => publicArticle(a, false)), total: items.length, page });
    }
    const articleMatch = url.pathname.match(/^\/api\/articles\/([\w-]+)$/);
    if (req.method === 'GET' && articleMatch) {
      const item = read().articles.find(a => a.id === articleMatch[1] && a.status === 'published');
      if (!item) fail(404, '新闻不存在或尚未发布');
      return json(res, 200, { article: publicArticle(item) });
    }
    if (url.pathname.startsWith('/api/')) {
      const account = await getAccount(req);
      if (url.pathname === '/api/me' && req.method === 'GET') return json(res, 200, { account, canReview: reviewer(account), pending: reviewer(account) ? read().articles.filter(a => a.status === 'pending').length : 0 });
      if (!account) fail(401, '请先登录班级账号');
      if (url.pathname === '/api/mine' && req.method === 'GET') return json(res, 200, { articles: read().articles.filter(a => a.authorId === account.id).reverse() });
      if (url.pathname === '/api/review' && req.method === 'GET') {
        if (!reviewer(account)) fail(403, '仅审核人可以审核新闻');
        return json(res, 200, { articles: read().articles.filter(a => a.status === 'pending') });
      }
      if (url.pathname === '/api/submit' && req.method === 'POST') {
        const input = await body(req), fields = content(input);
        const article = await update(data => {
          if (data.articles.filter(a => a.authorId === account.id && a.status === 'pending').length >= 20) fail(429, '最多同时提交 20 篇待审稿件，请等待审核');
          const item = { ...fields, id: crypto.randomUUID(), authorId: account.id, authorName: account.name,
            status: 'pending', submittedAt: new Date().toISOString(), publishedAt: null, reviewNote: '' };
          data.articles.push(item); return item;
        });
        return json(res, 201, { article, message: '稿件已递交审核' });
      }
      const reviewMatch = url.pathname.match(/^\/api\/review\/([\w-]+)$/);
      if (reviewMatch && req.method === 'POST') {
        if (!reviewer(account)) fail(403, '仅审核人可以审核新闻');
        const input = await body(req);
        if (!['approve', 'reject'].includes(input.action)) fail(400, '审核操作不正确');
        const note = string(input.note ?? '', '审核意见', 500, input.action === 'reject');
        await update(data => {
          const item = data.articles.find(a => a.id === reviewMatch[1]);
          if (!item) fail(404, '稿件不存在');
          if (item.status !== 'pending') fail(409, '这篇稿件已经审核，请刷新列表');
          item.status = input.action === 'approve' ? 'published' : 'rejected';
          item.reviewNote = note; item.reviewedAt = new Date().toISOString(); item.reviewerId = account.id;
          if (item.status === 'published') item.publishedAt = item.reviewedAt;
        });
        return json(res, 200, { ok: true });
      }
      fail(404, '接口不存在');
    }
    const file = files[url.pathname];
    if (!file || !['GET', 'HEAD'].includes(req.method)) fail(404, '页面不存在');
    const data = await fs.promises.readFile(path.join(__dirname, file[0]));
    res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 500, { message: error.status ? error.message : '服务暂时不可用，请稍后重试' });
    else res.destroy();
    if (!error.status) console.error(error.message);
  }
});
if (require.main === module) server.listen(PORT, process.env.NEWS_HOST || '127.0.0.1', () => console.log(`803 新闻站 http://127.0.0.1:${PORT}`));
module.exports = { server };
