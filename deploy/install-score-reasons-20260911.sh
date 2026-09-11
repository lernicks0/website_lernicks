#!/usr/bin/env bash
set -Eeuo pipefail
COMMIT=${1:?请提供固定发布提交}
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || exit 1
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
fi
test -f /root/sco/server.js
test -f /root/sco/index.html
pm2 describe sco-server >/dev/null
STAGE=$(mktemp -d /tmp/score-reasons-XXXXXXXX)
for file in server.js index.html; do
  curl -fL --retry 3 --connect-timeout 15 --max-time 180 "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$COMMIT/sco/$file" -o "$STAGE/$file"
done
echo "11b7d6784207ec0aa063f9e8933f14f6c9e620ad8d88ab0e92a4d2058919907a  $STAGE/server.js" | sha256sum -c -
echo "228da475ece70e4ad6b259caa257bb883bfa7fc0618f9d898012a31d6f5da59a  $STAGE/index.html" | sha256sum -c -
node --check "$STAGE/server.js"
BACKUP=$(mktemp -d /root/score-reasons-backup-XXXXXXXX)
cp -a /root/sco/server.js /root/sco/index.html "$BACKUP/"
rollback() {
  trap - ERR
  cp -a "$BACKUP/server.js" "$BACKUP/index.html" /root/sco/
  pm2 restart sco-server >/dev/null
  echo "更新失败，已恢复程序。备份：$BACKUP" >&2
  exit 1
}
trap rollback ERR
cp "$STAGE/server.js" "$STAGE/index.html" /root/sco/
pm2 restart sco-server >/dev/null
curl -fsS --retry 6 --retry-connrefused --retry-delay 1 --max-time 20 http://127.0.0.1:1146/index.html -o "$STAGE/served.html"
grep -q 'deductionReason' "$STAGE/served.html"
STATUS=$(curl -sS --max-time 20 -o "$STAGE/state.json" -w '%{http_code}' http://127.0.0.1:1146/api/state)
test "$STATUS" = 401
trap - ERR
echo "SCORE_REASONS_SUCCESS backup=$BACKUP"
echo '请刷新积分站。扣分可选择预设或手写原因，留空默认自习课讲话/打闹。'
