const fs=require('node:fs'),path=require('node:path');
const patch=fs.readFileSync(path.join(__dirname,'patch-note-default-e2ee.cjs')).toString('base64');
const script=`#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0 || { echo '请使用 sudo bash。' >&2; exit 1; }
if ! command -v node >/dev/null; then
 set +eu
 export NVM_DIR=/root/.nvm
 [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
 set -Eeuo pipefail
fi
for tool in node curl flock; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9
live=/root/telegram-notes/public/index.html
test -f "$live"; test "$(readlink -f "$live")" = "$live"
stage=$(mktemp -d /tmp/note-default-e2ee-XXXXXXXX); chmod 700 "$stage"
base64 -d > "$stage/patch.cjs" <<'NOTE_DEFAULT_ASSET'
${patch}
NOTE_DEFAULT_ASSET
node "$stage/patch.cjs" "$live" "$stage/index.html"
backup=$(mktemp -d /root/note-default-e2ee-code-backup-XXXXXXXX); chmod 700 "$backup"
cp -a "$live" "$backup/index.html"
rollback(){ trap - ERR INT TERM; cp -a "$backup/index.html" "$live"; echo "恢复原页面：$backup" >&2; exit 1; }
trap rollback ERR INT TERM
cp "$stage/index.html" "$live.note-default-e2ee-next"; chmod 644 "$live.note-default-e2ee-next"; mv -f "$live.note-default-e2ee-next" "$live"
curl --noproxy '*' -fsS --retry 3 --max-time 15 http://127.0.0.1:3000/ -o "$stage/served.html"
cmp "$stage/index.html" "$stage/served.html"
trap - ERR INT TERM
echo "NOTE_DEFAULT_E2EE_UPDATE_SUCCESS backup=$backup"
echo '新便签默认端到端加密；已有便签与数据保持原状，未重启进程。'
`;
fs.writeFileSync(path.join(__dirname,'install-note-default-e2ee-20261106.sh'),script.replace(/\r\n/g,'\n'));
console.log('Built default note encryption installer');
