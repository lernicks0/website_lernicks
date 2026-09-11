const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'score-reasons-'));
const rosterFile = path.join(tmp, 'roster.json'), dataFile = path.join(tmp, 'scores.json');
fs.copyFileSync(path.join(root, 'class-auth/roster.example.json'), rosterFile);
const name = JSON.parse(fs.readFileSync(rosterFile)).accounts.find(a => a.role === 'student').name;
fs.writeFileSync(dataFile, JSON.stringify({ scores: { [name]: 10 }, archives: [{ id: 'old', scores: { [name]: 7 } }] }));
const teacher = { id: 'tec', name: '副科老师', role: 'teacher', isAdmin: true };
const auth = http.createServer((req, res) => {
  const cookie = req.headers.cookie || '';
  const account = cookie.includes('admin=1') ? teacher : cookie.includes('student=1') ? { id: '1', name, role: 'student', isAdmin: false } : null;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, account }));
});
function listen(server) { return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port))); }
let child, browser;
(async () => {
  const authPort = await listen(auth), probe = http.createServer();
  const port = await listen(probe); await new Promise(resolve => probe.close(resolve));
  const url = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, [path.join(root, 'sco-site/server.js')], { env: { ...process.env, SCO_PORT: String(port), CLASS_AUTH_PORT: String(authPort), CLASS_ROSTER_FILE: rosterFile, SCO_DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stderr.on('data', d => output += d);
  for (let i = 0; ; i++) { try { await fetch(url); break; } catch (_) { if (i > 60 || child.exitCode !== null) throw Error(output || 'Startup failed'); await new Promise(r => setTimeout(r, 100)); } }
  async function request(route, body, cookie = 'admin=1') {
    const res = await fetch(url + route, { method: body ? 'POST' : 'GET', headers: { cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  }
  assert.equal((await request('/api/state', null, '')).status, 401);
  assert.equal((await request('/api/score', { name, delta: -1 }, 'student=1')).status, 403);
  for (const reason of [undefined, '', '   ']) {
    const result = await request('/api/score', { name, delta: -1, reason });
    assert.equal(result.status, 200); assert.equal(result.data.deduction.reason, '自习课讲话/打闹');
  }
  const preset = await request('/api/score', { name, delta: -3, reason: ' 打闹 ' });
  assert.equal(preset.data.deduction.reason, '打闹'); assert.equal(preset.data.score, 4);
  const custom = '<img src=x onerror="window.injected=1">未完成值日';
  assert.equal((await request('/api/score', { name, delta: -2, reason: custom })).data.deduction.reason, custom);
  for (const reason of ['长'.repeat(201), {}]) assert.equal((await request('/api/score', { name, delta: -1, reason })).status, 400);
  assert.equal((await request('/api/score', { name, delta: 1, reason: '打闹' })).data.deduction, null);
  await Promise.all(Array.from({ length: 5 }, () => request('/api/score', { name, delta: -1 })));
  let state = (await request('/api/state')).data;
  assert.equal(state.scores[name], -2); assert.equal(state.deductions.length, 10); assert.equal(state.archives[0].id, 'old');
  await request('/api/restore', { id: 'old' });
  state = (await request('/api/state', null, 'student=1')).data;
  assert.equal(state.scores[name], 7); assert.equal(state.deductions.length, 10);
  assert.deepEqual(JSON.parse(fs.readFileSync(dataFile)).deductions, state.deductions);
  for (const file of ['/sco-data.json', '/server.js']) assert.equal((await fetch(url + file)).status, 404);
  if (process.env.PLAYWRIGHT_MODULE) {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext();
    await context.addCookies([{ name: 'admin', value: '1', url }]);
    await context.addInitScript(() => localStorage.setItem('803_sco_gate_passed', '1'));
    const page = await context.newPage(); await page.goto(url);
    await page.locator('.student').first().click();
    await page.getByRole('button', { name: '打闹', exact: true }).click();
    assert.equal(await page.inputValue('#deductionReason'), '打闹');
    await page.getByRole('button', { name: '－1', exact: true }).click();
    await page.waitForFunction(() => !scoreSaving && document.querySelector('#deductionHistory').textContent.includes('打闹'));
    await page.fill('#deductionReason', ''); await page.fill('#customDelta', '-2');
    await page.getByRole('button', { name: '确定加减', exact: true }).click();
    await page.waitForFunction(() => !scoreSaving && document.querySelector('#deductionHistory > div').textContent.includes('自习课讲话/打闹'));
    assert.equal(await page.locator('#deductionHistory img').count(), 0); assert.equal(await page.evaluate(() => window.injected), undefined);
    for (const theme of ['astra', 'classic']) {
      await page.evaluate(t => LernicksDesign.set(t), theme);
      await page.setViewportSize({ width: 375, height: 800 });
      await page.addStyleTag({ content: '*{transition:none!important;animation:none!important;scroll-behavior:auto!important}' });
      assert(await page.locator('#studentDialog .dialog').evaluate(e => e.scrollWidth <= e.clientWidth));
      fs.mkdirSync(path.join(root, 'test-fixtures/score-reasons'), { recursive: true });
      await page.screenshot({ path: path.join(root, 'test-fixtures/score-reasons/' + theme + '.png') });
    }
    await page.reload(); await page.locator('.student').first().click();
    assert((await page.textContent('#deductionHistory')).includes('打闹'));
    console.log('UI presets, default, custom deduction, escaped history, mobile themes and reload PASS');
  }
  console.log('Defaults, custom reasons, validation, authorization, persistence, concurrent deductions, archive preservation and private files PASS');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
  auth.close(); fs.rmSync(tmp, { recursive: true, force: true });
});
