'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('publishes static projects and persists the selected entry', async t => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'ht-test-'));
  let child;
  t.after(async () => {
    await stop();
    await fs.rm(data, { recursive: true, force: true });
  });
  const workspaceServer = path.resolve(__dirname, '../ht-site/server.js');
  const server = existsSync(workspaceServer) ? workspaceServer : path.resolve(__dirname, '../ht/server.js');
  let origin;
  const headers = { 'X-HT-Request': '1' };

  async function start() {
    child = spawn(process.execPath, [server], {
      env: { ...process.env, HT_DATA_DIR: data, HT_PORT: '0', HT_ORIGIN: '' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const [line] = await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => { throw Error('HT exited before listening'); }),
    ]);
    origin = String(line).trim().match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  }

  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }

  function post(files, entry, extraHeaders = {}) {
    const body = new FormData();
    body.append('manifest', JSON.stringify({ files: files.map(([name]) => name), entry }));
    for (const [, content] of files) body.append('file', new Blob([content]), 'file');
    return fetch(origin + '/api/projects', { method: 'POST', body, headers: { ...headers, ...extraHeaders } });
  }

  function request(route, options) {
    return fetch(origin + route, options);
  }

  await start();
  assert.match(await (await request('/')).text(), /发布 HTML 页面/);
  const single = await post([['hello.html', '<h1>Hello</h1>']]);
  assert.equal(single.status, 201);
  assert.equal((await single.json()).entry, 'hello.html');
  const files = [
    ['页面/开始 #1.html', '<link rel="stylesheet" href="../assets/style.css"><h1>Alternate</h1>'],
    ['index.html', '<h1>Index</h1>'],
    ['assets/style.css', 'h1 { color: green; }'],
    ['assets/bytes.png', Buffer.from([0, 255, 1, 9])],
  ];
  const created = await post(files);
  assert.equal(created.status, 201);
  const project = await created.json();
  assert.equal(project.entry, 'index.html');
  const homepage = await request(project.url);
  assert.match(homepage.url, /\/index\.html$/);
  assert.equal(await homepage.text(), '<h1>Index</h1>');
  assert.match(homepage.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.doesNotMatch(homepage.headers.get('content-security-policy'), /allow-same-origin/);
  const binary = await request(project.url + files[3][0]);
  assert.deepEqual(Buffer.from(await binary.arrayBuffer()), files[3][1]);
  assert.equal((await post([['a.html', 'a'], ['b.html', 'b']])).status, 400);
  assert.equal((await post([['../a.html', 'a']])).status, 400);
  assert.equal((await post([['a.html', 'a'], ['a.html', 'b']])).status, 400);
  assert.equal((await post([['a.html', 'a']], 'a.html', { Origin: 'null' })).status, 403);
  assert.equal((await request(project.url + 'project.json')).status, 404);
  assert.equal((await request(project.url + 'assets%2fstyle.css')).status, 404);
  const explicit = await post(files, files[0][0]);
  assert.equal(explicit.status, 201);
  assert.equal((await explicit.json()).entry, files[0][0]);

  const editor = '/api/projects/' + project.id;
  const update = (entry, token) => request(editor, {
    method: 'PATCH',
    headers: { ...headers, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry }),
  });
  assert.equal((await update(files[0][0], '0'.repeat(64))).status, 404);
  assert.equal((await update(files[2][0], project.token)).status, 400);
  assert.equal((await update(files[0][0], project.token)).status, 200);
  await stop();
  await start();
  const redirect = await request(project.url + '?a=1', { redirect: 'manual' });
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  assert.match(redirect.headers.get('location'), /%23[0-9]\.html\?a=1$/);
  const alternate = await request(project.url);
  assert.equal(await alternate.text(), files[0][1]);
  const resource = await fetch(new URL('../assets/style.css', alternate.url));
  assert.equal(resource.headers.get('content-type'), 'text/css');
  assert.equal(resource.headers.get('access-control-allow-origin'), '*');
  assert.equal(await resource.text(), files[2][1]);
});
