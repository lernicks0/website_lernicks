#!/usr/bin/env bash
set -Eeuo pipefail
COMMIT=${1:?请提供固定发布提交}
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || exit 1
if ! command -v node >/dev/null; then
  if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
fi
test -f /root/class-auth/widget.js
STAGE=$(mktemp -d /tmp/account-ui-XXXXXXXX)
curl -fL --retry 3 --connect-timeout 15 --max-time 180 "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$COMMIT/class-auth/widget.js" -o "$STAGE/widget.js"
echo "8a367bf72b7fdd46ff42f18dfbdcf7501203e062136a81ec9382a0d04096ec1b  $STAGE/widget.js" | sha256sum -c -
node --check "$STAGE/widget.js"
BACKUP=$(mktemp -d /root/account-ui-backup-XXXXXXXX)
cp -a /root/class-auth/widget.js "$BACKUP/widget.js"
rollback() {
  trap - ERR
  cp -a "$BACKUP/widget.js" /root/class-auth/widget.js
  echo "校验失败，已恢复。备份：$BACKUP" >&2
  exit 1
}
trap rollback ERR
install -m 644 "$STAGE/widget.js" /root/class-auth/widget.js.new
mv /root/class-auth/widget.js.new /root/class-auth/widget.js
curl -fsS --max-time 20 http://127.0.0.1:1153/api/widget.js -o "$STAGE/served.js"
cmp "$STAGE/widget.js" "$STAGE/served.js"
trap - ERR
echo "ACCOUNT_UI_SUCCESS backup=$BACKUP"
echo '请关闭账号弹窗并刷新网页；电脑可按 Ctrl+F5 强制刷新。'
