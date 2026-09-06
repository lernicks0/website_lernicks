const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { detectFormat, resolveFormat } = require('../mk/html-support');

const root = path.resolve(__dirname, '..');
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-html-test-'));
const files = ['server.js', 'html-support.js', 'index.html', 'document.html', 'purify.min.js'];
for (const file of files) fs.copyFileSync(path.join(root, 'mk', file), path.join(runtime, file));
for (const file of ['index.html', 'document.html']) {
  const page = fs.readFileSync(path.join(runtime, file), 'utf8');
  for (const match of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: file });
}

const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>示例</title><style>h1{color:rgb(12, 34, 56)}</style></head><body><h1>HTML 测试</h1><button id="test" onclick="this.textContent=\'已点击\'">点击</button><script>try{parent.document.body.dataset.compromised="yes"}catch(e){document.body.dataset.isolated="yes"}</script></body></html>';
for (const content of [html, '\uFEFF \n<!-- 导出 -->\n<HTML><body>hi</body></HTML>', '<h1>标题</h1>', '<div class="card">片段</div>', '<strong>加粗</strong>', '<my-card>自定义元素</my-card>']) assert.equal(detectFormat(content), 'mixed');
for (const content of ['# 标题\n\n$E=mc^2$', '```html\n<div>example</div>\n```', '说明 <div> 标签', '<https://example.com>', '<person@example.com>', '']) assert.equal(detectFormat(content), 'mixed');
assert.equal(resolveFormat('mixed', html), 'mixed');
assert.equal(resolveFormat('markdown', html), 'markdown');
assert.equal(resolveFormat('latex', html), 'latex');

let child, browser, output = '';
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(runtime, 'server.js')], {
    cwd: runtime, windowsHide: true,
    env: { ...process.env, MK_PORT: String(port), MK_MIN_FREE_MB: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(base + '/api/status')).ok) break; } catch (_) {}
    if (attempt > 50 || child.exitCode !== null) throw new Error('Server failed: ' + output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  async function api(method, route, body, status = 200) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const created = await api('POST', '/api/documents', { title: 'HTML 测试', format: 'html', content: html }, 201);
  const route = '/api/documents/' + created.id;
  let saved = (await api('GET', route)).document;
  assert.equal(saved.format, 'html');
  assert.equal(saved.content, html);
  const raw = await fetch(base + created.rawUrl);
  assert.match(raw.headers.get('content-disposition'), /\.html"$/);
  assert.match(raw.headers.get('content-type'), /^text\/plain/);
  assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await raw.text(), html);
  assert.equal((await fetch(base + created.rawUrl, { method: 'HEAD' })).status, 200);
  const publicPage = await fetch(base + created.viewUrl);
  assert.equal(publicPage.headers.get('x-frame-options'), null);
  assert.equal((await fetch(base + created.editUrl)).headers.get('x-frame-options'), 'DENY');
  const helper = await fetch(base + '/html-support.js');
  assert.match(helper.headers.get('content-type'), /javascript/);
  assert.equal(await helper.text(), fs.readFileSync(path.join(runtime, 'html-support.js'), 'utf8'));
  await api('PUT', route, { key: 'incorrect', title: 'X', content: 'X', format: 'mixed' }, 403);
  assert.equal((await api('GET', route)).document.content, html);
  await api('PUT', route, { key: created.key, title: '已修改', content: html + '<!-- updated -->' });
  assert.equal((await api('GET', route)).document.format, 'html');
  await api('PUT', route, { key: created.key, title: 'HTML 测试', format: 'html', content: html });
  for (const format of [undefined, 'auto', 'mixed', 'markdown', 'latex']) {
    const document = await api('POST', '/api/documents', { format, content: html }, 201);
    saved = (await api('GET', '/api/documents/' + document.id)).document;
    assert.equal(saved.format, format === undefined || format === 'auto' ? 'mixed' : format);
  }
  await api('POST', '/api/documents', { format: 'html', content: ' ' }, 400);
  await api('POST', '/api/documents', { format: 'html', content: 'x'.repeat(1024 * 1024 + 1) }, 413);
  console.log('PASS: detection, syntax, create/read/update, key protection, raw HTML filename, legacy formats, size limits.');

  if (process.env.MK_PLAYWRIGHT_MODULE) {
    const { chromium } = require(process.env.MK_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext();
    // Avoid programmatic scrolling moving click targets during headless interaction.
    await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.scrollBehavior = 'auto'; }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('ERR_FAILED')) console.error(message.text()); });
    const libs = process.env.MK_RENDER_LIBS || path.join(root, 'test-fixtures/mk-render-libs');
    await context.route('https://cdn.jsdelivr.net/**', route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      const fixture = path.join(libs, name);
      return fs.existsSync(fixture) ? route.fulfill({ path: fixture, contentType: 'text/javascript' }) : route.abort();
    });
    const mixed = '<span style="color:rgb(12, 34, 56)">彩色文字</span>\n\n# 混合文档\n\n**Markdown 加粗**，行内公式 $E=mc^2$。\n\n<details>\n<summary>点击查看解答</summary>\n\n**折叠里的加粗**\n\n$$x^2+y^2=z^2$$\n\n</details>\n\n<table><tr><td>HTML 表格</td></tr></table>\n\n' + '\x60\x60\x60html\n<img src=x onerror="alert(1)">\n\x60\x60\x60\n\n' + '<img src="data:image/png,invalid" onerror="document.body.dataset.compromised=\'yes\'">\n<script>document.body.dataset.compromised="yes"</script>\n<a href="javascript:alert(1)">危险链接</a>\n<style>body{display:none}</style>\n<iframe srcdoc="<script>alert(1)</script>"></iframe>';
    await page.goto(base);
    assert.equal(await page.locator('#formatInput').count(), 0);
    await page.locator('#contentInput').fill(mixed);
    await page.locator('#previewButton').click();
    const preview = page.locator('#createPreview');
    await preview.locator('h1').waitFor();
    assert.equal(await preview.locator('h1').textContent(), '混合文档');
    assert.equal(await preview.locator('span[style]').first().evaluate(el => getComputedStyle(el).color), 'rgb(12, 34, 56)');
    assert.equal(await preview.locator('.katex').count(), 2);
    await preview.locator('summary').click();
    await preview.getByText('折叠里的加粗').waitFor();
    assert.equal(await preview.locator('details[open]').count(), 1);
    assert.equal(await preview.locator('table td').textContent(), 'HTML 表格');
    assert.match(await preview.locator('pre code').textContent(), /<img src=x onerror=/);
    assert.equal(await preview.locator('script,iframe,style,[onerror],a[href^="javascript:"]').count(), 0);
    assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
    await page.locator('#fileInput').setInputFiles({ name: '混合内容.HTM', mimeType: 'text/html', buffer: Buffer.from(mixed) });
    await page.waitForFunction(() => document.getElementById('titleInput').value === '混合内容');
    await page.locator('#createButton').click();
    await page.locator('#result.show').waitFor();
    const viewUrl = await page.locator('#viewLink').inputValue();
    const editUrl = await page.locator('#editLink').inputValue();
    const key = await page.locator('#documentKey').inputValue();
    const createdId = new URL(viewUrl).pathname.split('/').pop();
    const record = (await api('GET', '/api/documents/' + createdId)).document;
    assert.equal(record.format, 'mixed');
    assert.equal(record.content, mixed);
    await page.goto(viewUrl);
    await page.locator('#article h1').waitFor();
    assert.equal(await page.locator('#article .katex').count(), 2);
    assert.equal(await page.locator('#article iframe').count(), 0);
    await page.locator('#article summary').click();
    await page.locator('#article').getByText('折叠里的加粗').waitFor();
    await page.locator('#sourceTab').click();
    assert.equal(await page.locator('#article pre').textContent(), mixed);
    await page.locator('#renderTab').click();
    await page.locator('#article h1').waitFor();
    await page.goto(editUrl);
    await page.locator('#keyInput').fill(key);
    await page.locator('#verifyButton').click();
    await page.locator('#editor.show').waitFor();
    assert.equal(await page.locator('#editFormat').count(), 0);
    await page.locator('#previewTab').click();
    await page.locator('#editPreview summary').click();
    await page.locator('#editPreview').getByText('折叠里的加粗').waitFor();
    assert.equal(await page.locator('#editPreview .katex').count(), 2);
    assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
    await page.locator('#writeTab').click();
    await page.locator('#editContent').fill(mixed + '\n\n修改后仍支持 **Markdown** 和 <mark>HTML</mark>。');
    await Promise.all([page.waitForResponse(response => response.request().method() === 'PUT'), page.locator('#saveButton').click()]);
    await page.goto(viewUrl);
    await page.locator('#article mark').waitFor();
    assert.equal(await page.locator('#article mark').textContent(), 'HTML');
    assert.equal(await page.locator('#article .katex').count(), 2);
    // Legacy Markdown records also acquire HTML support without conversion.
    const legacy = await api('POST', '/api/documents', { format: 'markdown', content: mixed }, 201);
    await page.goto(base + legacy.viewUrl);
    await page.locator('#article summary').waitFor();
    // A failed sanitizer load must never fall back to unsanitized innerHTML.
    await context.route('**/purify.min.js', route => route.abort());
    await page.goto(viewUrl);
    await page.locator('#article pre').waitFor();
    assert.equal(await page.locator('#article script,#article details').count(), 0);
    assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
    assert.deepEqual(errors, []);
    console.log('PASS: mixed Markdown + HTML + math in create/read/edit; details interaction; code fences; HTML-first and .htm uploads stay mixed; saved source unchanged; script filtering; sanitizer failure fallback.');
  }
  await api('DELETE', route, { key: created.key });
  await api('GET', route, undefined, 404);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
  const resolved = path.resolve(runtime);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('mk-html-test-')) fs.rmSync(resolved, { recursive: true, force: true });
});
