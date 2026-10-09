// 仅提供程序页面的本地预览；不读取真实笔记、学生名单或考试文件。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const routes = {
  '/': 'main-site/index.html', '/main/': 'main-site/index.html', '/feedback': 'main-site/index.html',
  '/cla/': 'cla-site/index.html', '/pk/': 'pk-redesign-preview/pk.html',
  '/sco/': 'sco-site/index.html', '/goal/': 'goal-site/index.html',
  '/note/': 'note-site/index.html', '/mk/': 'mk-site/index.html',
  '/document/': 'mk-site/document.html', '/tbl/': 'tbl-site/index.html',
  '/html-support.js': 'mk-site/html-support.js', '/purify.min.js': 'mk-site/purify.min.js',
  '/account-api/widget.js': 'class-auth/widget.js',
  '/pk/logo-803-pk-tech-v3.png': 'pk-redesign-preview/logo-803-pk-tech-v3.png',
};
if (!fs.existsSync(path.join(root, 'main-site/index.html')) && fs.existsSync(path.join(root, 'main/index.html'))) {
  const folders={'main-site':'main','cla-site':'cla','pk-redesign-preview':'pk','sco-site':'sco','goal-site':'goal','note-site':'public','mk-site':'mk','tbl-site':'tbl'};
  for (const key of Object.keys(routes)) routes[key]=routes[key].replace(/^([^/]+)\//, (all,dir)=>(folders[dir]||dir)+'/');
}
const origins = { 'https://lernicks.cn': '/main/', 'https://note.lernicks.cn': '/note/', 'https://tbl.lernicks.cn': '/tbl/', 'https://mk.lernicks.cn': '/mk/', 'https://cla.lernicks.cn': '/cla/', 'https://pk.lernicks.cn': '/pk/', 'https://sco.lernicks.cn': '/sco/', 'https://goal.lernicks.cn': '/goal/' };
const names = Array.from({ length: 52 }, (_, i) => '示例' + String(i + 1).padStart(2, '0'));
const records = [{ self: names[0], opponent: names[1] }, { self: names[2], opponent: names[3] }];
const sample = {
  '/pk/names.json': { names },
  '/pk/data.json': { pkList: records, savedExams: [{ name: '期中考试 · 示例', time: '2026-09-06T00:00:00Z', records, scoreResults: [
    { pk: records[0], pkSelfTotal: 512, pkOppTotal: 498, winner: names[0] },
    { pk: records[1], pkSelfTotal: 476, pkOppTotal: 489, winner: names[3] },
  ] }] },
  '/lock-state.json': { locked: false },
  '/api/state': { ok: true, names, locked: false, updatedAt: '2026-09-06T00:00:00Z', scores: Object.fromEntries(names.map((name, i) => [name, (i * 7 + 26) % 63])), archives: [], rounds: [{ id: 'sample', title: '期中考试目标 · 示例', goals: Object.fromEntries(names.slice(0, 28).map((name, i) => [name, { rank: i % 15 + 1, score: 500 + (i % 6) * 10 }])) }] },
  '/api/status': { ok: true, usedBytes: 0, maxBytes: 500 * 1024 * 1024, totalBytes: 0, documentCount: 0, imageCount: 0, uploadCount: 0, maxFileBytes: 10485760 },
  '/api/feedback': { ok: true, feedback: [], items: [] },
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (/^\/api\/notes\/[a-z0-9_-]+(?:\/meta)?$/.test(url.pathname) && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(url.pathname.endsWith('/meta') ? { exists:true, hasPassword:false } : { content:'这是一张本地示例便签。\n\n把灵感留在这里，分享给需要的人。', hasPassword:false })); return;
  }
  if (url.pathname === '/api/documents/f0110de012345678' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ document:{ id:'f0110de012345678', title:'把想法写成一页', format:'mixed', content:'# 小小工具，装下你的灵感\n\n这是本地示例文档，用来展示正文、公式和 HTML 在同一页里的排版。\n\n> 记录，是让一个想法有机会长大的开始。\n\n## 从一行文字开始\n\n你可以写下一段笔记、一份课堂整理，或一封想分享的信。\n\n行内公式 $E=mc^2$ 和独立公式都可以直接书写：\n\n$$\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}$$\n\n<details><summary>打开一个小想法</summary>HTML 标签也可以直接参与排版。</details>\n\n```html\n<strong>代码块里保留源码</strong>\n```', size:640, updatedAt:'2026-10-09T00:00:00Z' } })); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, message: '设计预览不保存数据，请在正式网站操作。' })); return;
  }
  if (sample[url.pathname]) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(sample[url.pathname])); return; }
  if (url.pathname === '/account-api/widget.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end('window.ClassAccount={ready:Promise.resolve({id:"1",name:"示例01",isAdmin:false}),refresh:function(){},open:function(){alert("这是设计预览，未连接正式账号。")}};document.querySelectorAll("[data-class-account]").forEach(function(b){b.textContent="示例账号";b.onclick=ClassAccount.open});'); return;
  }
  if (!url.pathname.endsWith('/') && routes[url.pathname + '/']) { res.writeHead(302, { Location: url.pathname + '/' }); res.end(); return; }
  const relative = /^\/d\/f0110de012345678(?:\/pre)?$/.test(url.pathname) ? routes['/document/'] : routes[url.pathname];
  if (!relative) {
    res.writeHead(url.pathname.includes('api') || url.pathname.endsWith('.json') ? 401 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, account: null, message: '本地外观预览未连接线上数据' })); return;
  }
  let data = fs.readFileSync(path.join(root, relative));
  const ext = path.extname(relative);
  if (ext === '.html') {
    let html = data.toString('utf8');
    for (const [origin, local] of Object.entries(origins)) html = html.replaceAll('href="' + origin + '"', 'href="' + local + '"');
    // 本地预览的返回链接指向同一预览中的站点，业务页面源文件不受影响。
    html = html.replaceAll('href="/"', 'href="/main/"');
    html = html.replace('<head>', '<head><script>try{["803_pk_gate_passed","803_sco_gate_passed","803_goal_gate_passed"].forEach(function(k){localStorage.setItem(k,"1")})}catch(e){}</script>');
    html = html.replace('<body>', '<body><div style="padding:7px 16px;text-align:center;background:#eeeee6;color:#62665a;font:11px/1.6 system-ui,sans-serif">本地设计预览 · 不保存数据 · <a href="/main/">主站</a> / <a href="/note/">便签</a> / <a href="/tbl/">图床</a> / <a href="/mk/">文档</a> / <a href="/d/f0110de012345678">示例阅读页</a></div>');
    // The navigation added by the presentation script uses real domains in production.
    html = html.replace('</body>', '<script>function localPreviewLinks(){document.querySelectorAll(".folio-nav a").forEach(function(a){var routes={"note.lernicks.cn":"/note/","tbl.lernicks.cn":"/tbl/","mk.lernicks.cn":"/mk/"};var u=new URL(a.href);if(routes[u.hostname])a.href=routes[u.hostname]})}localPreviewLinks();new MutationObserver(localPreviewLinks).observe(document.body,{childList:true,subtree:true});</script></body>');
    data = Buffer.from(html);
  }
  res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : 'image/png', 'Cache-Control': 'no-store' });
  res.end(data);
});
server.listen(Number(process.env.ASTRA_PREVIEW_PORT) || 18803, '127.0.0.1', () => console.log('Astra preview: http://127.0.0.1:' + server.address().port));
