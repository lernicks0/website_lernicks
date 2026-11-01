const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.existsSync(path.join(root, 'tbl-site')) ? 'tbl-site' : 'tbl';
const assets = {
  'patch.cjs': 'deploy/patch-tbl-speed.cjs',
  'speed-client.js': source + '/speed-client.js',
  'media-delivery.cjs': source + '/media-delivery.cjs',
  'original-delivery.txt': 'deploy/tbl-speed-assets/original-delivery.txt'
};
const unpack = Object.entries(assets).map(([name, file]) => `base64 -d > "$stage/assets/${name}" <<'TBL_ASSET'\n${fs.readFileSync(path.join(root, file)).toString('base64')}\nTBL_ASSET`).join('\n');
const script = `#!/usr/bin/env bash
set -Eeuo pipefail
if [ "$(id -u)" != 0 ]; then echo '请用 sudo bash 运行；需要管理 /root/tbl 和 tbl-server。' >&2; exit 1; fi
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
 set +eu
 export NVM_DIR=/root/.nvm
 [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
 set -Eeuo pipefail
fi
command -v node >/dev/null; command -v pm2 >/dev/null; command -v curl >/dev/null
test -d /root/tbl; test "$(readlink -f /root/tbl)" = /root/tbl
pm2 describe tbl-server >/dev/null
for file in index.html server.js media-delivery.cjs; do
 if [ -e "/root/tbl/$file" ] || [ -L "/root/tbl/$file" ]; then test -f "/root/tbl/$file"; test "$(readlink -f "/root/tbl/$file")" = "/root/tbl/$file"; fi
done
stage=$(mktemp -d /tmp/tbl-speed-XXXXXXXX)
chmod 700 "$stage"; mkdir -p "$stage/assets"
${unpack}
node "$stage/assets/patch.cjs" /root/tbl "$stage/pages" "$stage/assets"
node --check "$stage/pages/server.js"; node --check "$stage/pages/media-delivery.cjs"
backup=$(mktemp -d /root/tbl-speed-backup-XXXXXXXX); chmod 700 "$backup"
for file in index.html server.js media-delivery.cjs; do
 if [ -f "/root/tbl/$file" ]; then cp -a "/root/tbl/$file" "$backup/$file"; else touch "$backup/$file.absent"; fi
done
rollback(){
 trap - ERR INT TERM
 echo "安装失败，恢复代码备份：$backup" >&2
 for file in index.html server.js media-delivery.cjs; do
  if [ -f "$backup/$file.absent" ]; then rm -f "/root/tbl/$file"; else cp -a "$backup/$file" "/root/tbl/$file" || true; fi
 done
 pm2 restart tbl-server >/dev/null || true
 exit 1
}
trap rollback ERR INT TERM
for file in index.html server.js media-delivery.cjs; do
 cp "$stage/pages/$file" "/root/tbl/$file.tbl-speed-next"
 chmod 644 "/root/tbl/$file.tbl-speed-next"
 mv -f "/root/tbl/$file.tbl-speed-next" "/root/tbl/$file"
done
pm2 restart tbl-server >/dev/null
ready=0
for attempt in $(seq 1 20); do
 if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:1148/ -o "$stage/index.html" &&
    curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:1148/api/status -o "$stage/status.json"; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1
node - "$stage" <<'TBL_VERIFY'
const fs=require('fs'),assert=require('assert');const d=process.argv[2];
assert(fs.readFileSync(d+'/index.html','utf8').includes('id="tbl-speed-client"'));
assert.equal(JSON.parse(fs.readFileSync(d+'/status.json')).ok,true);
TBL_VERIFY
trap - ERR INT TERM
echo "TBL_SPEED_UPDATE_SUCCESS backup=$backup"
echo '已更新图床代码，未修改 DNS、Nginx、其他站点或上传文件。国内线路仍需配置与验证。'
`;
fs.writeFileSync(path.join(__dirname, 'install-tbl-speed-20261101.sh'), script.replace(/\r\n/g, '\n'));
console.log('Built self-contained tbl speed installer');
