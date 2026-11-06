'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.existsSync(path.join(root,'note-site'))?'note-site':'note-security-source';
const client=fs.readFileSync(path.join(root,source,'security-client.js'),'utf8').trim();
const cipher=fs.readFileSync(path.join(root,source,'note-crypto.js'),'utf8').trim();
const css=fs.readFileSync(path.join(root,source,'security.css'),'utf8').trim();
const htmlFile=path.join(root,source,'index.html');
if(fs.existsSync(htmlFile)){
 let html=fs.readFileSync(htmlFile,'utf8');
 for(const[id,tag,body]of [['note-security-client','script',client],['note-crypto','script',cipher],['note-security-style','style',css]]){
  const re=new RegExp('<'+tag+' id="'+id+'">[\\s\\S]*?<\\/'+tag+'>');
  if(!re.test(html))throw Error('Missing embedded asset '+id);
  html=html.replace(re,()=>'<'+tag+' id="'+id+'">\n'+body+'\n</'+tag+'>');
 }
 fs.writeFileSync(htmlFile,html);
}
const assets={ 'patch-note-security.cjs':'deploy/patch-note-security.cjs','note-security.cjs':source+'/note-security.cjs','security-client.js':source+'/security-client.js','note-crypto.js':source+'/note-crypto.js','security.css':source+'/security.css','client.sha256':'deploy/note-security-assets/client.sha256','routes.sha256':'deploy/note-security-assets/routes.sha256','sections.json':'deploy/note-security-assets/sections.json'};
const unpack=Object.entries(assets).map(([name,file])=>`base64 -d > "$stage/assets/${name}" <<'NOTE_ASSET'\n${fs.readFileSync(path.join(root,file)).toString('base64')}\nNOTE_ASSET`).join('\n');
const script=`#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [ "$(id -u)" != 0 ]; then echo '请使用 sudo bash；需要更新 /root/telegram-notes 和 telegram-notes 进程。' >&2; exit 1; fi
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
 set +eu
 export NVM_DIR=/root/.nvm
 [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
 set -Eeuo pipefail
fi
for tool in node pm2 curl flock; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9 || { echo '另一个便签更新正在进行。' >&2; exit 1; }
live=/root/telegram-notes
test -d "$live"; test "$(readlink -f "$live")" = "$live"
for file in server.js public/index.html note-security.cjs; do
 if [ -e "$live/$file" ] || [ -L "$live/$file" ]; then test -f "$live/$file"; test "$(readlink -f "$live/$file")" = "$live/$file"; fi
done
stage=$(mktemp -d /tmp/note-security-XXXXXXXX)
chmod 700 "$stage"; mkdir -p "$stage/assets"
${unpack}
pm2 jlist > "$stage/processes.json"
node - "$stage/processes.json" <<'NOTE_PROCESS'
const fs=require('fs'),assert=require('assert');
const all=JSON.parse(fs.readFileSync(process.argv[2])),p=all.filter(x=>x.name==='telegram-notes');
assert.equal(p.length,1,'Single note process required');
assert.equal(p[0].pm2_env.exec_mode,'fork_mode','Single fork process required');
assert.equal(p[0].pm2_env.pm_exec_path,'/root/telegram-notes/server.js','Unexpected note script');
assert.equal(String(p[0].pm2_env.PORT||3000),'3000','Unexpected note port');
NOTE_PROCESS
node "$stage/assets/patch-note-security.cjs" "$live" "$stage/pages" "$stage/assets"
node --check "$stage/pages/server.js"; node --check "$stage/pages/note-security.cjs"
# Only code is backed up; never create a historical copy of note data.
backup=$(mktemp -d /root/note-security-code-backup-XXXXXXXX); chmod 700 "$backup"; mkdir -p "$backup/public"
for file in server.js public/index.html note-security.cjs; do
 if [ -f "$live/$file" ]; then cp -a "$live/$file" "$backup/$file"; else touch "$backup/$file.absent"; fi
done
rollback(){
 trap - ERR INT TERM
 echo "安装失败，恢复代码：$backup" >&2
 for file in server.js public/index.html note-security.cjs; do
  if [ -f "$backup/$file.absent" ]; then rm -f "$live/$file"; else cp -a "$backup/$file" "$live/$file" || true; fi
 done
 pm2 restart telegram-notes >/dev/null || true
 exit 1
}
trap rollback ERR INT TERM
for file in server.js public/index.html note-security.cjs; do
 cp "$stage/pages/$file" "$live/$file.note-security-next"
 chmod 644 "$live/$file.note-security-next"
 mv -f "$live/$file.note-security-next" "$live/$file"
done
pm2 restart telegram-notes >/dev/null
ready=0
for attempt in $(seq 1 20); do
 if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:3000/ -o "$stage/index.html"; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1
node - "$stage" <<'NOTE_VERIFY'
const fs=require('fs'),assert=require('assert');const d=process.argv[2];
assert(fs.readFileSync(d+'/index.html','utf8').includes('id="note-security-client"'));
assert.equal(fs.readFileSync(d+'/index.html','utf8'),fs.readFileSync(d+'/pages/public/index.html','utf8'));
NOTE_VERIFY
trap - ERR INT TERM
echo "NOTE_SECURITY_UPDATE_SUCCESS backup=$backup"
echo '仅更新便签代码。旧便签数据保留；新建便签可选择阅后即焚、问题验证和端到端加密。'
`;
fs.writeFileSync(path.join(__dirname,'install-note-security-20261106.sh'),script.replace(/\r\n/g,'\n'));
console.log('Built self-contained note security installer');
