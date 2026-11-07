#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
release=${1:?请传入完整发布提交 ID}
[[ "$release" =~ ^[a-f0-9]{40}$ ]]
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  set +eu
  export NVM_DIR=/root/.nvm
  [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
  set -Eeuo pipefail
fi
for tool in node pm2 curl flock sha256sum; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9
live=/root/telegram-notes
file="$live/note-security.cjs"
[[ -f "$file" && "$(readlink -f "$file")" == "$file" ]]
pm2 jlist | node -e '
const fs=require("node:fs"), assert=require("node:assert/strict");
const list=JSON.parse(fs.readFileSync(0,"utf8")).filter(p=>p.name==="telegram-notes");
assert.equal(list.length,1);
assert.equal(list[0].pm2_env.exec_mode,"fork_mode");
assert.equal(list[0].pm2_env.pm_exec_path,"/root/telegram-notes/server.js");
assert.equal(String(list[0].pm2_env.PORT||3000),"3000");
'
stage=$(mktemp -d /root/.note-ip-limit-stage-XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
next="$stage/note-security.cjs"
url="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$release/note-security.cjs"
curl -fLsS --connect-timeout 15 --max-time 60 --retry 3 "$url" -o "$next"
printf '%s  %s\n' eafaf1a714d53f46e9ecd77bedd75e4028114077c19a8889e6a9126e02194388 "$next" | sha256sum -c -
node --check "$next"
if cmp -s "$next" "$file"; then echo 'NOTE_IP_LIMIT_ALREADY_INSTALLED'; exit 0; fi
printf '%s  %s\n' 346d9cea6750f4b5e275ff94bac3d7c5b5837191efc80ced514d3315823ce8ab "$file" | sha256sum -c -

# Run the staged module with synthetic data on this host before restarting production.
node - "$stage" "$live" <<'NOTE_IP_SMOKE'
const [stage,live]=process.argv.slice(2);
const assert=require('node:assert/strict'), path=require('node:path'), fs=require('node:fs');
const {createRequire}=require('node:module');
const deps=createRequire(path.join(live,'server.js'));
const express=deps('express'), bcrypt=deps('bcryptjs');
const dataDir=path.join(stage,'fixture');
fs.mkdirSync(dataDir);
fs.writeFileSync(path.join(dataDir,'notes.json'),JSON.stringify({
  demo:{content:'synthetic fixture',hasPassword:true,passwordHash:bcrypt.hashSync('fixture-password',4),updatedAt:1}
}));
const app=express(); app.use(express.json());
require(path.join(stage,'note-security.cjs')).install(app,{dataDir,express,bcrypt});
const server=app.listen(0,'127.0.0.1',async()=>{
  try {
    async function attempt(ip,password) {
      return fetch('http://127.0.0.1:'+server.address().port+'/api/notes/demo/read',{
        method:'POST', headers:{'content-type':'application/json','x-real-ip':'104.16.1.1','cf-connecting-ip':ip},
        body:JSON.stringify({password})
      });
    }
    for(let i=0;i<5;i++) {
      const denied=await attempt('192.0.2.1','wrong'); assert.equal(denied.status,401); await denied.body.cancel();
    }
    const blocked=await attempt('192.0.2.1','fixture-password');
    assert.equal(blocked.status,429); assert.ok(Number(blocked.headers.get('retry-after'))>0); await blocked.body.cancel();
    const allowed=await attempt('192.0.2.2','fixture-password');
    assert.equal(allowed.status,200); assert.equal((await allowed.json()).content,'synthetic fixture');
    console.log('NOTE_IP_LIMIT_SMOKE_OK');
  } catch(error) { console.error(error); process.exitCode=1; }
  finally { server.close(); }
});
NOTE_IP_SMOKE

backup=$(mktemp -d /root/note-ip-limit-code-backup-XXXXXXXX)
cp -a "$file" "$backup/note-security.cjs"
rollback() {
  trap - ERR INT TERM
  echo "更新失败，恢复模块：$backup" >&2
  cp -a "$backup/note-security.cjs" "$file" || true
  pm2 restart telegram-notes >/dev/null || true
  exit 1
}
trap rollback ERR INT TERM
chmod --reference="$file" "$next"
chown --reference="$file" "$next"
mv -f "$next" "$file"
pm2 restart telegram-notes >/dev/null
probe=$(node -e 'process.stdout.write("ip-probe-"+require("node:crypto").randomBytes(12).toString("hex"))')
ready=false
for attempt in {1..15}; do
  if curl --noproxy '*' -fsS --max-time 3 "http://127.0.0.1:3000/api/notes/$probe/meta" -o "$stage/meta.json" 2>/dev/null \
     && node -e 'if(require(process.argv[1]).exists!==false)process.exit(1)' "$stage/meta.json"; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]]
trap - ERR INT TERM
echo "NOTE_IP_LIMIT_UPDATE_SUCCESS backup=$backup"
