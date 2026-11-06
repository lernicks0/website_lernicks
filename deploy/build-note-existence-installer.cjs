const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),src=fs.existsSync(path.join(root,'note-site'))?'note-site':'note-security-source';
const assets={'patch.cjs':'deploy/patch-note-existence.cjs','client.js':src+'/existence-client.js','style.css':src+'/existence.css'};
const unpack=Object.entries(assets).map(([name,file])=>`base64 -d > "$stage/${name}" <<'NOTE_EXISTS_ASSET'\n${fs.readFileSync(path.join(root,file)).toString('base64')}\nNOTE_EXISTS_ASSET`).join('\n');
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
stage=$(mktemp -d /tmp/note-existence-XXXXXXXX); chmod 700 "$stage"
${unpack}
node "$stage/patch.cjs" "$live" "$stage/index.html" "$stage/client.js" "$stage/style.css"
backup=$(mktemp -d /root/note-existence-code-backup-XXXXXXXX); chmod 700 "$backup"
cp -a "$live" "$backup/index.html"
rollback(){ trap - ERR INT TERM; cp -a "$backup/index.html" "$live"; echo "恢复原页面：$backup" >&2; exit 1; }
trap rollback ERR INT TERM
cp "$stage/index.html" "$live.note-existence-next"; chmod 644 "$live.note-existence-next"; mv -f "$live.note-existence-next" "$live"
curl --noproxy '*' -fsS --retry 3 --max-time 15 http://127.0.0.1:3000/ -o "$stage/served.html"
cmp "$stage/index.html" "$stage/served.html"
trap - ERR INT TERM
echo "NOTE_EXISTENCE_UPDATE_SUCCESS backup=$backup"
echo '已添加独立查询便签入口；没有修改后端、便签数据或重启进程。'
`;
fs.writeFileSync(path.join(__dirname,'install-note-existence-20261106.sh'),script.replace(/\r\n/g,'\n'));
const html=path.join(root,src==='note-site'?'note-site/index.html':'public/index.html');
let s=fs.readFileSync(html,'utf8').replace(/<!-- NOTE EXISTENCE START -->[\s\S]*?<!-- NOTE EXISTENCE END -->\r?\n/,'');
s=require('./patch-note-existence.cjs').patch(s,fs.readFileSync(path.join(root,src,'existence-client.js'),'utf8'),fs.readFileSync(path.join(root,src,'existence.css'),'utf8'));
fs.writeFileSync(html,s);
console.log('Built standalone note existence page installer');
