const fs = require('fs');
const path = require('path');
const { TEACHERS } = require('./teachers');

const ROSTER_FILE = process.env.CLASS_ROSTER_FILE || path.join(__dirname, 'roster.json');
const VALID_ROLES = new Set(['student', 'student-admin', 'teacher']);

function readRoster() {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`找不到私密名单文件：${ROSTER_FILE}。请先在服务器初始化 roster.json。`);
    }
    throw new Error(`私密名单文件无法读取：${error.message || error}`);
  }

  if (!value || !Array.isArray(value.accounts)) {
    throw new Error('私密名单格式不正确：accounts 必须是数组');
  }

  const seenIds = new Set();
  const seenNames = new Set();
  const accounts = value.accounts.map((item, index) => {
    const id = String(item && item.id || '').trim();
    const name = String(item && item.name || '').trim();
    const role = String(item && item.role || '').trim();
    if (!id || id.length > 50) throw new Error(`私密名单第 ${index + 1} 个账号 ID 不正确`);
    if (!name || name.length > 50) throw new Error(`私密名单第 ${index + 1} 个姓名不正确`);
    if (!VALID_ROLES.has(role)) throw new Error(`私密名单中的账号 ${id} 角色不正确`);
    if (seenIds.has(id)) throw new Error(`私密名单中存在重复账号：${id}`);
    if (seenNames.has(name)) throw new Error(`私密名单中存在重复姓名：${name}`);
    seenIds.add(id);
    seenNames.add(name);
    return { id, name, role };
  });

  if (!accounts.some(item => item.role === 'student' || item.role === 'student-admin')) {
    throw new Error('私密名单至少需要一个学生账号');
  }
  if (!accounts.some(item => item.role === 'teacher')) {
    throw new Error('私密名单至少需要一个老师账号');
  }

  const students = accounts.filter(item => item.role === 'student' || item.role === 'student-admin');
  students.forEach((item, index) => {
    if (item.id !== String(index + 1)) {
      throw new Error(`学生学号必须按名单顺序连续排列，应为 ${index + 1}`);
    }
  });
  const teachers = accounts.filter(item => item.role === 'teacher');
  const legacy = teachers.length === 1 && teachers[0].id === 'ls';
  if (!legacy && (teachers.length !== TEACHERS.length || TEACHERS.some(item => !teachers.some(teacher => teacher.id === item.id)))) {
    throw new Error('老师账号应为 chi、mat、eng、sci、com、tec；请运行 migrate-teachers.js 更新名单');
  }

  return { version: 2, accounts };
}

const ROSTER = readRoster();
const STUDENT_NAMES = ROSTER.accounts
  .filter(item => item.role === 'student' || item.role === 'student-admin')
  .map(item => item.name);
const STUDENT_IDS = ROSTER.accounts
  .filter(item => item.role === 'student' || item.role === 'student-admin')
  .map(item => item.id);
const TEACHER_IDS = ROSTER.accounts.filter(item => item.role === 'teacher').map(item => item.id);
const ADMIN_IDS = ROSTER.accounts
  .filter(item => item.role === 'student-admin' || item.role === 'teacher')
  .map(item => item.id);
const ROLE_BY_ID = new Map(ROSTER.accounts.map(item => [item.id, item.role]));
const ACCOUNT_BY_ID = new Map(ROSTER.accounts.map(item => [item.id, item]));

module.exports = {
  ROSTER_FILE,
  ROSTER,
  STUDENT_NAMES,
  STUDENT_IDS,
  TEACHER_IDS,
  ADMIN_IDS,
  ROLE_BY_ID,
  ACCOUNT_BY_ID,
  readRoster
};
