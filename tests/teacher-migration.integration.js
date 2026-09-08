const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-migration-'));
const rosterFile = path.join(dir, 'roster.json'), accountsFile = path.join(dir, 'accounts.json'), sessionsFile = path.join(dir, 'sessions.json');
const env = { ...process.env, CLASS_ROSTER_FILE: rosterFile, CLASS_ACCOUNTS_FILE: accountsFile, CLASS_SESSIONS_FILE: sessionsFile };
const students = [{ id: '1', name: '测试甲', role: 'student-admin' }, { id: '2', name: '测试乙', role: 'student' }];
const old = { password: { salt: 'ab'.repeat(16), hash: 'cd'.repeat(64) }, passwordUpdatedAt: '2026-01-01' };
const existing = { password: { salt: 'ef'.repeat(16), hash: '01'.repeat(64) }, passwordUpdatedAt: '2026-02-01' };
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function migrate() { return spawnSync(process.execPath, [path.join(root, 'class-auth/migrate-teachers.js')], { env, encoding: 'utf8', windowsHide: true }); }
try {
  fs.writeFileSync(rosterFile, JSON.stringify({ version: 2, accounts: students.concat({ id: 'ls', name: '老师', role: 'teacher' }) }));
  fs.writeFileSync(accountsFile, JSON.stringify({ version: 1, accounts: { '1': existing, '2': old, ls: old, mat: existing } }));
  fs.writeFileSync(sessionsFile, JSON.stringify({ version: 1, sessions: { oldTeacher: { id: 'ls' }, student: { id: '1' }, existingTeacher: { id: 'mat' } } }));
  const initial = [rosterFile, accountsFile, sessionsFile].map(file => fs.readFileSync(file));
  let result = migrate();
  assert.equal(result.status, 0, result.stderr);
  const roster = read(rosterFile), accounts = read(accountsFile), sessions = read(sessionsFile);
  assert.deepEqual(roster.accounts.slice(0, 2), students);
  assert.deepEqual(roster.accounts.slice(2).map(item => item.id), ['chi', 'mat', 'eng', 'sci', 'com', 'tec']);
  assert.deepEqual(accounts.accounts['1'], existing);
  assert.deepEqual(accounts.accounts['2'], old);
  assert.deepEqual(accounts.accounts.tec, old);
  assert.deepEqual(accounts.accounts.mat, existing);
  assert.equal(accounts.accounts.chi.password, null);
  assert.equal(accounts.accounts.ls, undefined);
  assert.deepEqual(sessions.sessions, { student: { id: '1' }, existingTeacher: { id: 'mat' } });
  const backup = fs.readdirSync(dir).find(name => name.startsWith('teacher-accounts-backup-'));
  initial.forEach((data, index) => assert.deepEqual(fs.readFileSync(path.join(dir, backup, `${index}.json`)), data));
  const first = [rosterFile, accountsFile, sessionsFile].map(file => fs.readFileSync(file));
  result = migrate();
  assert.equal(result.status, 0, result.stderr);
  first.forEach((data, index) => assert.deepEqual(fs.readFileSync([rosterFile, accountsFile, sessionsFile][index]), data));
  roster.accounts.push({ id: 'other', name: '未知老师', role: 'teacher' });
  fs.writeFileSync(rosterFile, JSON.stringify(roster));
  result = migrate();
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readFileSync(accountsFile), first[1]);
  console.log('PASS: legacy teacher migration, password/session preservation, backups, idempotence, invalid roster rejection.');
} finally {
  if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('teacher-migration-')) fs.rmSync(dir, { recursive: true, force: true });
}
