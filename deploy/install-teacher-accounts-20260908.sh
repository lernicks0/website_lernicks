#!/usr/bin/env bash
set -Eeuo pipefail
COMMIT=${1:?请提供固定发布提交}
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || exit 1
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
fi
for tool in node pm2 curl tar sha256sum; do command -v "$tool" >/dev/null; done
test -f /root/class-auth/roster.json
test -f /root/class-auth/accounts.json
pm2 describe class-auth >/dev/null
STAGE=$(mktemp -d /tmp/teacher-accounts-XXXXXXXX)
curl -fL --retry 3 --connect-timeout 15 --max-time 180 "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$COMMIT/deploy/releases/teacher-accounts-20260908.tar.gz" -o "$STAGE/update.tar.gz"
echo "964b52822ca53ae62ab7e3d35c3e7f2009a413f8eca763169ac8072a2f61e863  $STAGE/update.tar.gz" | sha256sum -c -
tar -xzf "$STAGE/update.tar.gz" -C "$STAGE"
FILES=(participants.js widget.js manage.js init-private-roster.js teachers.js migrate-teachers.js roster.example.json)
for file in "${FILES[@]}"; do
  test -f "$STAGE/class-auth/$file"
  if [[ "$file" = *.js ]]; then node --check "$STAGE/class-auth/$file"; fi
done
CLASS_ROSTER_FILE=/root/class-auth/roster.json node -e 'require(process.argv[1])' "$STAGE/class-auth/participants.js"
pm2 jlist > "$STAGE/processes.json"
mapfile -t PROCESSES < <(node -e 'const names=new Set(["class-auth","pk-server","sco-server","goal-server","cla-server","news-server"]);for(const p of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")))if(names.has(p.name)&&p.pm2_env.status==="online")console.log(p.name)' "$STAGE/processes.json")
[[ " ${PROCESSES[*]} " = *' class-auth '* ]] || { echo '账号服务当前未运行，安装停止'; exit 1; }
BACKUP=$(mktemp -d /root/teacher-accounts-backup-XXXXXXXX)
chmod 700 "$BACKUP"
for file in "${FILES[@]}"; do
  if [ -f "/root/class-auth/$file" ]; then cp -a "/root/class-auth/$file" "$BACKUP/$file"; fi
done
pm2 stop class-auth >/dev/null
DATA_READY=0
rollback() {
  trap - ERR
  set +e
  pm2 stop class-auth >/dev/null
  for file in "${FILES[@]}"; do
    if [ -f "$BACKUP/$file" ]; then cp -a "$BACKUP/$file" "/root/class-auth/$file"; fi
  done
  if [ "$DATA_READY" = 1 ]; then
    for file in roster.json accounts.json sessions.json; do
      if [ -f "$BACKUP/$file" ]; then cp -a "$BACKUP/$file" "/root/class-auth/$file"; fi
    done
  fi
  for name in "${PROCESSES[@]}"; do pm2 restart "$name" >/dev/null; done
  echo "更新失败，已尝试恢复。备份：$BACKUP" >&2
  exit 1
}
trap rollback ERR
for file in roster.json accounts.json sessions.json; do
  if [ -f "/root/class-auth/$file" ]; then cp -a "/root/class-auth/$file" "$BACKUP/$file"; chmod 600 "$BACKUP/$file"; fi
done
DATA_READY=1
for file in "${FILES[@]}"; do cp -a "$STAGE/class-auth/$file" "/root/class-auth/$file"; done
node /root/class-auth/migrate-teachers.js
node -e 'const s=require("/root/class-auth/store");for(const id of ["chi","mat","eng","sci","com","tec"]){const a=s.publicAccount(id);if(!a||a.role!=="teacher"||!a.isAdmin||a.countsAsStudent)throw Error("Teacher validation failed")}if(s.publicAccount("ls"))throw Error("Legacy teacher ID still enabled")'
for name in "${PROCESSES[@]}"; do pm2 restart "$name" >/dev/null; done
curl -fsS --retry 6 --retry-connrefused --retry-delay 1 --max-time 20 http://127.0.0.1:1153/api/session > "$STAGE/session.json"
node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(typeof a.ok!=="boolean"||!("account" in a))throw Error("Account service check failed")' "$STAGE/session.json"
trap - ERR
echo "TEACHER_ACCOUNTS_SUCCESS backup=$BACKUP"
echo '语文 chi、数学 mat、英语 eng、科学 sci、社会 com，副科共用 tec。'
echo 'tec 保留原 ls 密码；请在管理全班账号中为五个主科账号设置密码。'
