// Run while the account service is stopped. Never prints passwords or student names.
const fs = require('fs');
const path = require('path');
const { TEACHERS } = require('./teachers');
const rosterFile = process.env.CLASS_ROSTER_FILE || path.join(__dirname, 'roster.json');
const accountsFile = process.env.CLASS_ACCOUNTS_FILE || path.join(__dirname, 'accounts.json');
const sessionsFile = process.env.CLASS_SESSIONS_FILE || path.join(__dirname, 'sessions.json');

function main() {
  // Use the same validation as the services before modifying anything.
  const { ROSTER } = require('./participants');
  const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  if (!accounts.accounts || typeof accounts.accounts !== 'object' || Array.isArray(accounts.accounts)) throw new Error('账号文件格式错误');
  const roster = JSON.parse(fs.readFileSync(rosterFile, 'utf8'));
  const hasSessions = fs.existsSync(sessionsFile);
  const sessions = hasSessions ? JSON.parse(fs.readFileSync(sessionsFile, 'utf8')) : { version: 1, sessions: {} };
  if (!sessions.sessions || typeof sessions.sessions !== 'object' || Array.isArray(sessions.sessions)) throw new Error('登录状态文件格式错误');
  const students = roster.accounts.filter(item => item.role !== 'teacher');
  roster.accounts = students.concat(TEACHERS.map(item => ({ ...item })));
  roster.version = 3;
  for (const teacher of TEACHERS) {
    if (!Object.prototype.hasOwnProperty.call(accounts.accounts, teacher.id)) {
      accounts.accounts[teacher.id] = teacher.id === 'tec' && accounts.accounts.ls
        ? accounts.accounts.ls : { password: null, passwordUpdatedAt: null };
    }
  }
  delete accounts.accounts.ls;
  for (const [token, session] of Object.entries(sessions.sessions)) {
    if (session && session.id === 'ls') delete sessions.sessions[token];
  }
  const updates = [[rosterFile, roster], [accountsFile, accounts]];
  if (hasSessions) updates.push([sessionsFile, sessions]);
  const backup = fs.mkdtempSync(path.join(path.dirname(accountsFile), 'teacher-accounts-backup-'));
  fs.chmodSync(backup, 0o700);
  const staged = [];
  try {
    for (const [index, [file, data]] of updates.entries()) {
      const copy = path.join(backup, `${index}.json`);
      fs.copyFileSync(file, copy);
      fs.chmodSync(copy, 0o600);
      const temp = `${file}.teachers-${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
      staged.push({ file, copy, temp });
    }
    for (const item of staged) fs.renameSync(item.temp, item.file);
  } catch (error) {
    for (const item of staged) {
      fs.copyFileSync(item.copy, item.file);
      if (fs.existsSync(item.temp)) fs.unlinkSync(item.temp);
    }
    throw error;
  }
  console.log(`老师账号已更新：chi、mat、eng、sci、com、tec；保留 ${ROSTER.accounts.filter(item => item.role !== 'teacher').length} 个学生账号。`);
  console.log('原 ls 密码由 tec 继承，已有新账号密码保持不变；未设置密码的账号由管理员启用。');
  console.log(`私密备份：${backup}`);
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
