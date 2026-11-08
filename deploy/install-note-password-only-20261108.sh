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
for tool in node pm2 curl flock; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9

live=/root/telegram-notes
module="$live/note-security.cjs"
page="$live/public/index.html"
for file in "$module" "$page"; do
  [[ -f "$file" && "$(readlink -f "$file")" == "$file" ]]
done
pm2 jlist | node -e '
const fs=require("node:fs"), assert=require("node:assert/strict");
const list=JSON.parse(fs.readFileSync(0,"utf8")).filter(p=>p.name==="telegram-notes");
assert.equal(list.length,1);
assert.equal(list[0].pm2_env.exec_mode,"fork_mode");
assert.equal(list[0].pm2_env.pm_exec_path,"/root/telegram-notes/server.js");
assert.equal(String(list[0].pm2_env.PORT||3000),"3000");
'
stage=$(mktemp -d /root/.note-password-only-stage-XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
base="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$release"
for asset in note-security.cjs note-security-source/note-crypto.js note-security-source/security-client.js note-security-source/security.css; do
  curl -fLsS --connect-timeout 15 --max-time 60 --retry 3 "$base/$asset" -o "$stage/${asset##*/}"
done

node - "$stage" "$module" "$page" <<'NOTE_PATCH'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const [stage, moduleFile, pageFile] = process.argv.slice(2);
const normalize = code => code.trim().replace(/\r\n/g, '\n');
const digest = code => createHash('sha256').update(normalize(code)).digest('hex');
const staged = file => fs.readFileSync(path.join(stage, file), 'utf8');
const moduleAfter = '45a245c04536deed8e01688b5ba1750250ce5524419ef45f0bd00fba27e93607';
assert.equal(digest(staged('note-security.cjs')), moduleAfter, 'Unexpected download for security module');
assert.ok(['9a2d1783605c1cb2ff51676c1a3078edc51d7bb76a700e2659c110cfbc02af79', moduleAfter]
  .includes(digest(fs.readFileSync(moduleFile, 'utf8'))), 'Unrecognized installed security module');

const assets = [
  ['script', 'note-crypto', 'note-crypto.js', '0a2e594be39a1e947a9fcb90b89791889c9ac377914d7490bce5b992d8b04a71', 'c34d11280ba26c0ad7e9a0343f7dd88c79668aa5922fa5d65c2a1c01a52daa3c'],
  ['script', 'note-security-client', 'security-client.js', '4dd35ddb47331fafae387a19c1001e799ed637432c86d7759c34f826bb414392', 'f29620bdd04bf1617c9d2ba30d8cfa075560e09406460a928ce14c8a94b63838'],
  ['style', 'note-security-style', 'security.css', 'd31d383780bb524da0e713af63f7113d65c00710b382c292bef7f168d0be1e42', 'd0d439b0dcef22b0d0f5714b2652e3968ac85981159a20986cf4e6cf10c99f90']
];
let page = fs.readFileSync(pageFile, 'utf8');
for (const [tag, id, file, before, after] of assets) {
  const replacement = normalize(staged(file));
  assert.equal(digest(replacement), after, 'Unexpected download for ' + file);
  if (tag === 'script') new vm.Script(replacement, { filename: file });
  const block = new RegExp('(<'+tag+' id="'+id+'">)([\\s\\S]*?)(</'+tag+'>)', 'g');
  const matches = [...page.matchAll(block)];
  assert.equal(matches.length, 1, 'Expected a single block for ' + id);
  const [current, open, code, close] = matches[0];
  if (digest(code) === after) continue;
  assert.equal(digest(code), before, 'Unrecognized installed block for ' + id);
  page = page.replace(current, () => open + '\n' + replacement + '\n' + close);
}
fs.writeFileSync(path.join(stage, 'index.html'), page);
NOTE_PATCH

node --check "$stage/note-security.cjs"
if cmp -s "$stage/note-security.cjs" "$module" && cmp -s "$stage/index.html" "$page"; then
  echo 'NOTE_PASSWORD_ONLY_ALREADY_INSTALLED'
  exit 0
fi

backup=$(mktemp -d /root/note-password-only-code-backup-XXXXXXXX)
cp -a "$module" "$backup/note-security.cjs"
cp -a "$page" "$backup/index.html"

replace_file() {
  chmod --reference="$2" "$1"
  chown --reference="$2" "$1"
  mv -f -- "$1" "$2"
}
rollback() {
  trap - ERR INT TERM
  cp -a "$backup/note-security.cjs" "$module" || true
  pm2 restart telegram-notes >/dev/null || true
  echo "更新失败。原代码备份：$backup" >&2
  exit 1
}
trap rollback ERR INT TERM
replace_file "$stage/note-security.cjs" "$module"
pm2 restart telegram-notes >/dev/null
probe=$(node -e 'process.stdout.write("password-probe-"+require("node:crypto").randomBytes(12).toString("hex"))')
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
# Once the new client is visible, production may contain v2 notes.
trap - ERR INT TERM
replace_file "$stage/index.html" "$page"
curl --noproxy '*' -fsS --retry 3 --max-time 15 http://127.0.0.1:3000/ -o "$stage/served.html"
cmp "$page" "$stage/served.html"
echo "NOTE_PASSWORD_ONLY_UPDATE_SUCCESS backup=$backup"
