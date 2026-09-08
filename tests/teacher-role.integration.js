const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'class-teacher-role-'));
const accountsFile = path.join(runtimeDir, 'accounts.json');
const sessionsFile = path.join(runtimeDir, 'sessions.json');
const rosterFile = path.join(runtimeDir, 'roster.json');
const children = [];

const fakeStudents = Array.from({ length: 52 }, (_, index) => `测试学生${String(index + 1).padStart(2, '0')}`);
const legacyPassword = { salt: 'ab'.repeat(16), hash: 'cd'.repeat(64) };
fs.writeFileSync(accountsFile, JSON.stringify({
  version: 1,
  accounts: Object.fromEntries(fakeStudents.map((id, index) => [id, {
    password: index === 0 ? legacyPassword : null,
    passwordUpdatedAt: index === 0 ? '2026-01-01T00:00:00.000Z' : null,
  }])),
}, null, 2));
const migrate = spawnSync(process.execPath, [path.join(projectRoot, 'class-auth/init-private-roster.js')], {
  cwd: projectRoot,
  env: { ...process.env, CLASS_ACCOUNTS_FILE: accountsFile, CLASS_ROSTER_FILE: rosterFile },
  input: '2\n3\n',
  encoding: 'utf8',
});
assert.equal(migrate.status, 0, migrate.stderr);
const migratedRoster = JSON.parse(fs.readFileSync(rosterFile, 'utf8'));
assert.equal(migratedRoster.accounts.length, 58);
assert.equal(migratedRoster.accounts.filter(item => item.role === 'student-admin').length, 2);
assert.equal(migratedRoster.accounts.filter(item => item.role === 'teacher').length, 6);
assert.deepEqual(migratedRoster.accounts.slice(0, 3).map(item => ({ id: item.id, name: item.name })), [
  { id: '1', name: fakeStudents[0] },
  { id: '2', name: fakeStudents[1] },
  { id: '3', name: fakeStudents[2] },
]);
assert.equal(migratedRoster.accounts.at(-1).id, 'tec');
const migratedAccounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
assert.deepEqual(migratedAccounts.accounts['1'].password, legacyPassword);
assert.equal(fs.existsSync(`${accountsFile}.before-school-number.json`), true);

function existingScript(...candidates) {
  const found = candidates.find(candidate => fs.existsSync(path.join(projectRoot, candidate)));
  if (!found) throw new Error(`找不到测试服务：${candidates.join(' 或 ')}`);
  return found;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function start(relativeScript, env) {
  const child = spawn(process.execPath, [path.join(projectRoot, relativeScript)], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.testOutput = () => output;
  children.push(child);
  return child;
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`服务提前退出：${child.testOutput()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`等待服务超时：${url}\n${child.testOutput()}`);
}

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}

(async () => {
  const [authPort, scorePort, goalPort, pkPort] = await Promise.all([freePort(), freePort(), freePort(), freePort()]);
  const sharedEnv = {
    CLASS_AUTH_PORT: String(authPort),
    CLASS_ACCOUNTS_FILE: accountsFile,
    CLASS_SESSIONS_FILE: sessionsFile,
    CLASS_ROSTER_FILE: rosterFile,
  };

  for (const teacherId of ['chi','mat','eng','sci','com','tec']) {
  const setup = spawnSync(process.execPath, [path.join(projectRoot, 'class-auth/manage.js'), 'set-password', teacherId], {
    cwd: projectRoot,
    env: { ...process.env, ...sharedEnv },
    input: 'TeacherTest123!',
    encoding: 'utf8',
  });
  assert.equal(setup.status, 0, setup.stderr);
  }
  const studentSetup = spawnSync(process.execPath, [path.join(projectRoot, 'class-auth/manage.js'), 'set-password', '1'], {
    cwd: projectRoot,
    env: { ...process.env, ...sharedEnv },
    input: 'StudentTest123!',
    encoding: 'utf8',
  });
  assert.equal(studentSetup.status, 0, studentSetup.stderr);

  const auth = start('class-auth/server.js', { ...sharedEnv, CLASS_AUTH_HOST: '127.0.0.1' });
  const score = start(existingScript('sco/server.js', 'sco-site/server.js'), {
    ...sharedEnv,
    SCO_PORT: String(scorePort),
    SCO_DATA_FILE: path.join(runtimeDir, 'scores.json'),
  });
  const goal = start(existingScript('goal/server.js', 'goal-site/server.js'), {
    ...sharedEnv,
    GOAL_PORT: String(goalPort),
    GOAL_DATA_FILE: path.join(runtimeDir, 'goals.json'),
  });
  const pk = start(existingScript('pk/server.js', 'pk-redesign-preview/server.js'), {
    ...sharedEnv,
    PK_PORT: String(pkPort),
    PK_DATA_FILE: path.join(runtimeDir, 'pk.json'),
    PK_LOCK_FILE: path.join(runtimeDir, 'pk-lock.json'),
    PK_ANALYSIS_FILE: path.join(runtimeDir, 'pk-analysis.json'),
  });

  await Promise.all([
    waitFor(`http://127.0.0.1:${authPort}/api/session`, auth),
    waitFor(`http://127.0.0.1:${scorePort}/index.html`, score),
    waitFor(`http://127.0.0.1:${goalPort}/index.html`, goal),
    waitFor(`http://127.0.0.1:${pkPort}/pk.html`, pk),
  ]);

  let privateResult = await json(`http://127.0.0.1:${scorePort}/api/state`);
  assert.equal(privateResult.response.status, 401);
  privateResult = await json(`http://127.0.0.1:${goalPort}/api/state`);
  assert.equal(privateResult.response.status, 401);
  privateResult = await json(`http://127.0.0.1:${pkPort}/names.json`);
  assert.equal(privateResult.response.status, 401);
  privateResult = await json(`http://127.0.0.1:${pkPort}/data.json`);
  assert.equal(privateResult.response.status, 401);

  for (const teacher of require('../class-auth/teachers').TEACHERS) {
    const login = await json(`http://127.0.0.1:${authPort}/api/login`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:teacher.id.toUpperCase(),password:'TeacherTest123!'})});
    assert.equal(login.response.status,200);
    assert.equal(login.body.account.name,teacher.name);
    assert.equal(login.body.account.role,'teacher');
    assert.equal(login.body.account.isAdmin,true);
    assert.equal(login.body.account.countsAsStudent,false);
  }
  let result = await json(`http://127.0.0.1:${authPort}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'TEC', password: 'TeacherTest123!' }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.deepEqual(
    { id: result.body.account.id, name: result.body.account.name, role: result.body.account.role, isAdmin: result.body.account.isAdmin, countsAsStudent: result.body.account.countsAsStudent },
    { id: 'tec', name: '副科老师', role: 'teacher', isAdmin: true, countsAsStudent: false },
  );
  const cookie = result.response.headers.get('set-cookie').split(';', 1)[0];

  result = await json(`http://127.0.0.1:${scorePort}/api/state`, { headers: { cookie } });
  assert.equal(result.body.names.length, 52);
  assert.equal(result.body.names.includes('副科老师'), false);
  const studentA = result.body.names[0];
  const studentB = result.body.names[1];

  result = await json(`http://127.0.0.1:${scorePort}/api/score`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: studentA, delta: 1 }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  result = await json(`http://127.0.0.1:${scorePort}/api/score`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: '副科老师', delta: 1 }),
  });
  assert.equal(result.response.status, 400);

  result = await json(`http://127.0.0.1:${goalPort}/api/state`, { headers: { cookie } });
  assert.equal(result.body.names.length, 52);
  assert.equal(result.body.names.includes('副科老师'), false);
  result = await json(`http://127.0.0.1:${goalPort}/api/round`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title: '教师权限测试' }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  const roundId = result.body.round.id;
  result = await json(`http://127.0.0.1:${goalPort}/api/goal`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ roundId, name: '副科老师', rank: 1, score: 800 }),
  });
  assert.equal(result.response.status, 400);

  result = await json(`http://127.0.0.1:${authPort}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: '01', password: 'StudentTest123!' }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.deepEqual(
    { id: result.body.account.id, name: result.body.account.name, role: result.body.account.role, isAdmin: result.body.account.isAdmin },
    { id: '1', name: studentA, role: 'student', isAdmin: false },
  );
  const studentCookie = result.response.headers.get('set-cookie').split(';', 1)[0];

  result = await json(`http://127.0.0.1:${goalPort}/api/goal`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: studentCookie },
    body: JSON.stringify({ roundId, name: studentA, rank: 10, score: 700 }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  result = await json(`http://127.0.0.1:${goalPort}/api/goal`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: studentCookie },
    body: JSON.stringify({ roundId, name: studentB, rank: 9, score: 710 }),
  });
  assert.equal(result.response.status, 403);

  result = await json(`http://127.0.0.1:${pkPort}/save.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: studentCookie },
    body: JSON.stringify({ pkList: [{ self: studentA, opponent: studentB, time: '' }], savedExams: [] }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  result = await json(`http://127.0.0.1:${pkPort}/save.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: studentCookie },
    body: JSON.stringify({ pkList: [{ self: studentB, opponent: studentA, time: '' }], savedExams: [] }),
  });
  assert.equal(result.response.status, 403);

  result = await json(`http://127.0.0.1:${pkPort}/names.json`, { headers: { cookie } });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.names.length, 52);
  assert.equal(result.body.names.includes('副科老师'), false);

  result = await json(`http://127.0.0.1:${pkPort}/save.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ pkList: [{ self: studentA, opponent: studentB, time: '' }], savedExams: [] }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  result = await json(`http://127.0.0.1:${pkPort}/save.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ pkList: [{ self: '副科老师', opponent: studentA, time: '' }], savedExams: [] }),
  });
  assert.equal(result.response.status, 400);

  process.stdout.write('学号 1～52 与姓名映射有效；六类老师账号可登录且不参与积分、目标和 PK。\n');
})().finally(async () => {
  for (const child of children) child.kill();
  await new Promise(resolve => setTimeout(resolve, 100));
  if (runtimeDir.startsWith(os.tmpdir())) fs.rmSync(runtimeDir, { recursive: true, force: true });
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
