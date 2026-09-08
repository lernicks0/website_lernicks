const { NAMES, setPassword, publicAccount, ensureFiles } = require('./store');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
}

async function main() {
  await ensureFiles();
  const command = process.argv[2];
  const id = process.argv[3];
  if (command === 'list') {
    for (const id of NAMES) {
      const account = publicAccount(id);
      const role = account.role === 'teacher' ? '老师（管理员）' : (account.isAdmin ? '学生管理员' : '同学');
      console.log(`${account.hasPassword ? '已启用' : '未设置'}\t${role}\t${account.id}\t${account.name}`);
    }
    return;
  }
  if (command === 'set-password' && id) {
    const password = await readStdin();
    await setPassword(id, password);
    console.log(`已为 ${id} 设置新密码，旧登录已失效。`);
    return;
  }
  console.error('用法：node manage.js list');
  console.error('或：printf 密码 | node manage.js set-password 学号（老师使用 chi/mat/eng/sci/com/tec）');
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
