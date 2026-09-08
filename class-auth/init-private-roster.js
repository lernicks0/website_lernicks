const fs = require('fs');
const path = require('path');
const { TEACHERS } = require('./teachers');

const accountsFile = process.env.CLASS_ACCOUNTS_FILE || path.join(__dirname, 'accounts.json');
const rosterFile = process.env.CLASS_ROSTER_FILE || path.join(__dirname, 'roster.json');
const backupFile = `${accountsFile}.before-school-number.json`;
const teacherId = 'ls';
const teacherName = '老师';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

async function atomicWrite(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(temp, file);
    await fs.promises.chmod(file, 0o600).catch(() => {});
  } catch (error) {
    await fs.promises.unlink(temp).catch(() => {});
    throw error;
  }
}

async function readJson(file, required = true) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch (error) {
    if (!required && error && error.code === 'ENOENT') return null;
    throw new Error(`无法读取 ${file}：${error.message || error}`);
  }
}

function validPasswordAccount(item) {
  if (!item || typeof item !== 'object') return { password: null, passwordUpdatedAt: null };
  return {
    password: item.password || null,
    passwordUpdatedAt: item.passwordUpdatedAt || null,
  };
}

async function main() {
  const saved = await readJson(accountsFile);
  const oldRoster = await readJson(rosterFile, false);
  const savedAccounts = saved && saved.accounts && typeof saved.accounts === 'object' ? saved.accounts : {};

  let studentNames = [];
  if (oldRoster && Array.isArray(oldRoster.accounts)) {
    studentNames = oldRoster.accounts
      .filter(item => item && (item.role === 'student' || item.role === 'student-admin'))
      .map(item => String(item.name || item.id || '').trim())
      .filter(Boolean);
  }
  if (!studentNames.length) {
    const existingIds = Object.keys(savedAccounts).map(value => value.trim()).filter(Boolean);
    if (existingIds.some(id => /^\d+$/.test(id))) {
      throw new Error('账号已经是学号格式，但缺少含姓名映射的私密名单，无法自动恢复姓名');
    }
    studentNames = existingIds.filter(id => id !== teacherName && id.toLowerCase() !== teacherId && !TEACHERS.some(item => item.id === id.toLowerCase() || item.name === id));
  }
  if (!studentNames.length) throw new Error('已有账号文件中没有学生账号，无法迁移私密名单');
  if (new Set(studentNames).size !== studentNames.length) throw new Error('现有私密名单中存在重复姓名');

  const adminNumbers = new Set((await readStdin()).map(value => String(Number(value))));
  if (!adminNumbers.size || adminNumbers.has('NaN')) {
    throw new Error('请通过标准输入提供至少一个学生管理员学号，每行一个');
  }
  for (const id of adminNumbers) {
    const number = Number(id);
    if (!Number.isInteger(number) || number < 1 || number > studentNames.length) {
      throw new Error(`学生管理员学号必须在 1～${studentNames.length} 之间`);
    }
  }

  if (!fs.existsSync(backupFile)) {
    await fs.promises.copyFile(accountsFile, backupFile);
    await fs.promises.chmod(backupFile, 0o600).catch(() => {});
  }

  const rosterAccounts = studentNames.map((name, index) => {
    const id = String(index + 1);
    return { id, name, role: adminNumbers.has(id) ? 'student-admin' : 'student' };
  });
  rosterAccounts.push(...TEACHERS);

  const migratedAccounts = {};
  for (const item of rosterAccounts) {
    const oldAccount = savedAccounts[item.id] || savedAccounts[item.name] || (item.id === 'tec' ? savedAccounts.ls || savedAccounts[teacherName] : null);
    migratedAccounts[item.id] = validPasswordAccount(oldAccount);
  }

  await atomicWrite(accountsFile, { version: 1, accounts: migratedAccounts });
  await atomicWrite(rosterFile, { version: 2, accounts: rosterAccounts });
  console.log(`学号登录已初始化：${studentNames.length} 个学生账号，${adminNumbers.size} 个学生管理员，老师账号为 chi、mat、eng、sci、com、tec。`);
  console.log(`迁移前账号备份：${backupFile}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
