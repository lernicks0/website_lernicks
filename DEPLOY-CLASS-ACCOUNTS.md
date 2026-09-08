> 2026-09-08 老师账号已更新为 chi、mat、eng、sci、com、tec。当前安装与密码迁移规则请看 [DEPLOY-TEACHER-ACCOUNTS.md](DEPLOY-TEACHER-ACCOUNTS.md)，下文 ls 为历史配置。

# 803 统一账号部署说明

## 账号规则

- PK、积分、目标和学校中心共用一套账号；学生账号是当前姓名排列顺序对应的学号 `1`～`52`，老师账号是 `ls`。
- 姓名与学号的对应关系只保存在服务器的私密文件中，不写入公开源码；未登录无法读取名单和班级数据。
- 普通同学只能修改自己的 PK 目标对手和考试目标，不能修改积分。
- 私密名单中标记为 `student-admin` 或 `teacher` 的账号拥有管理员权限。
- `ls` 对应老师身份；老师不计入学生人数、积分、积分排名、考试目标或擂台目标，也不能成为 PK 对手。
- 旧的管理员密钥入口已经删除。
- 密码只保存无法还原的加密结果。管理员能查看账号是否设置密码，也能重设密码，但不能看到旧密码。

## 第一次部署

在服务器 WebShell 中执行：

```bash
cd /root/telegram-notes
git pull origin master

mkdir -p /root/class-auth /root/pk /root/sco /root/cla /root/goal
cp -a class-auth/*.js /root/class-auth/
cp -a pk/pk.html pk/server.js pk/logo-803-pk-tech-v3.png /root/pk/
cp -a sco/index.html sco/server.js /root/sco/
cp -a cla/index.html cla/server.js /root/cla/
cp -a goal/index.html goal/server.js /root/goal/
```

上面的命令只复制程序，不会覆盖 PK、积分和目标数据。

先用已有 `accounts.json` 按当前姓名顺序生成学号和私密名单。下面两次输入的是学生管理员学号，输入时不会显示，也不会进入命令历史：

```bash
read -s -p "第一个学生管理员学号: " CLASS_ADMIN_ONE
echo
read -s -p "第二个学生管理员学号: " CLASS_ADMIN_TWO
echo
printf '%s\n%s\n' "$CLASS_ADMIN_ONE" "$CLASS_ADMIN_TWO" | node /root/class-auth/init-private-roster.js
unset CLASS_ADMIN_ONE CLASS_ADMIN_TWO
chmod 600 /root/class-auth/roster.json
```

迁移会保留现有密码，并把老师账号改为 `ls`；旧登录状态会失效，需要重新登录。原账号文件会私密备份为 `accounts.json.before-school-number.json`。

`roster.json` 只留在服务器，不提交 Git，也不要放入公开部署包。全新安装可参考 `class-auth/roster.example.json` 在服务器手工建立。

启动账号服务：

```bash
pm2 describe class-auth >/dev/null 2>&1 && pm2 restart class-auth || pm2 start /root/class-auth/server.js --name class-auth --cwd /root/class-auth
```

使用 `node /root/class-auth/manage.js list` 查看私密账号状态，再按下面的通用方式给管理员账号设置密码。学生输入学号，老师输入 `ls`：

```bash
read -s -p "管理员学号（老师输入 ls）: " CLASS_ACCOUNT_ID
echo
read -s -p "新密码: " CLASS_PASS
echo
printf '%s' "$CLASS_PASS" | node /root/class-auth/manage.js set-password "$CLASS_ACCOUNT_ID"
unset CLASS_ACCOUNT_ID CLASS_PASS
```

需要为每个管理员账号各执行一次。

重启四个网站：

```bash
pm2 restart pk-server
pm2 restart sco-server
pm2 restart cla-server
pm2 restart goal-server
pm2 save
```

## 检查

```bash
pm2 status
curl -sS http://127.0.0.1:1153/api/session
curl -sS http://127.0.0.1:1145/account-api/session
curl -sS http://127.0.0.1:1146/account-api/session
curl -sS http://127.0.0.1:1147/account-api/session
curl -sS http://127.0.0.1:1152/account-api/session
```

每条账号接口都应返回 JSON。没有登录时显示 `"account":null` 是正常的。

## 以后管理密码

管理员登录任意一个学校网站后，点击顶部账号按钮，再点“管理全班账号”，就可以给老师或同学设置、重设密码。

请不要删除下面四个文件，它们保存私密名单、账号、迁移备份和登录状态：

- `/root/class-auth/accounts.json`
- `/root/class-auth/accounts.json.before-school-number.json`（迁移前的私密备份）
- `/root/class-auth/sessions.json`
- `/root/class-auth/roster.json`（私密账号名单，建议权限为 `600`）
