#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  set +eu
  export NVM_DIR=/root/.nvm
  [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
  set -Eeuo pipefail
fi
for tool in nginx systemctl python3 curl flock node pm2 ss; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9

entry=/etc/nginx/sites-enabled/default
live=$(readlink -f "$entry")
case "$live" in
  /etc/nginx/sites-available/default|/etc/nginx/sites-enabled/default) ;;
  *) echo "未知的 Nginx 配置位置 $live" >&2; exit 1 ;;
esac
[[ -f "$live" ]]
app=/root/telegram-notes/server.js
[[ -f "$app" && "$(readlink -f "$app")" == "$app" ]]
pm2 jlist | node -e '
const fs=require("node:fs"), assert=require("node:assert/strict");
const list=JSON.parse(fs.readFileSync(0,"utf8")).filter(p=>p.name==="telegram-notes");
assert.equal(list.length,1);
const p=list[0].pm2_env;
assert.equal(p.exec_mode,"fork_mode");
assert.equal(p.pm_exec_path,"/root/telegram-notes/server.js");
assert.equal(String(p.PORT||3000),"3000");
assert.equal(p.NOTE_BIND_HOST||"127.0.0.1","127.0.0.1");
'
stage=$(mktemp -d /root/.note-https-gate-stage-XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT

python3 - "$live" "$stage/default" <<'NOTE_HTTPS_PATCH'
import re
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:])
config = source.read_bytes().decode("utf-8")
host = "    server_name note.lernicks.cn;\n"
server = "server {\n    listen 80;\n" + host
upstream = "        proxy_pass http://127.0.0.1:3000;\n"
if config.count(server) != 1 or config.count(host) != 1 or config.count(upstream) != 1:
    raise SystemExit("便签虚拟主机或上游配置不符合已核对的版本")
ranges = (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22", "2400:cb00::/32",
    "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
    "2a06:98c0::/29", "2c0f:f248::/32",
)
geo = (
    "# Cloudflare origin networks (https://www.cloudflare.com/ips/) for note.lernicks.cn.\n"
    "geo $realip_remote_addr $note_from_cloudflare {\n"
    "    default 0;\n"
    + "".join(f"    {network} 1;\n" for network in ranges)
    + "}\n\n"
)
gate = (
    "\n"
    "    if ($note_from_cloudflare = 0) { return 403; }\n"
    "    if ($http_x_forwarded_proto != https) { return 308 https://note.lernicks.cn$request_uri; }\n"
)
if "$note_from_cloudflare" in config:
    if config.count(geo + server + gate) != 1:
        raise SystemExit("发现不匹配的旧 HTTPS 限制，停止修改")
    target.write_bytes(config.encode("utf-8"))
    sys.exit()
following = re.split(r"(?m)^server\s*\{", config.split(server, 1)[1], maxsplit=1)[0]
if upstream not in following:
    raise SystemExit("便签虚拟主机未指向预期上游")
target.write_bytes(config.replace(server, geo + server + gate, 1).encode("utf-8"))
NOTE_HTTPS_PATCH
python3 - "$app" "$stage/server.js" <<'NOTE_BIND_PATCH'
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:])
code = source.read_bytes()
before = b"app.listen(PORT, () => {"
after = b"app.listen(PORT, process.env.NOTE_BIND_HOST || '127.0.0.1', () => {"
if code.count(before) + code.count(after) != 1:
    raise SystemExit("便签监听入口不符合已核对的版本")
target.write_bytes(code.replace(before, after, 1))
NOTE_BIND_PATCH
node --check "$stage/server.js"

probe="/api/notes/https-probe-$(python3 -c 'import secrets; print(secrets.token_hex(12))')/meta"
check_https() {
  curl --noproxy '*' -fsS --connect-timeout 5 --max-time 12 "https://note.lernicks.cn$probe" -o "$stage/meta.json" &&
    python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["exists"] is False' "$stage/meta.json"
}
check_gate() {
  local direct redirect
  direct=$(curl --noproxy '*' -sS --max-time 5 -o /dev/null -w '%{http_code}' \
    -H 'Host: note.lernicks.cn' -H 'X-Forwarded-Proto: https' -H 'CF-Connecting-IP: 192.0.2.1' "http://127.0.0.1$probe")
  [[ "$direct" == 403 ]] || return 1
  redirect=$(curl --noproxy '*' -sS --connect-timeout 5 --max-time 12 -o /dev/null \
    -w '%{http_code} %{redirect_url}' "http://note.lernicks.cn$probe")
  [[ "$redirect" == "308 https://note.lernicks.cn$probe" ]] || return 1
  check_https
}
check_loopback() {
  [[ "$(ss -lntH '( sport = :3000 )' | awk '{print $4}')" == 127.0.0.1:3000 ]]
}
check_https
if cmp -s "$live" "$stage/default" && cmp -s "$app" "$stage/server.js"; then
  check_gate
  check_loopback
  echo 'NOTE_HTTPS_GATE_ALREADY_INSTALLED'
  exit 0
fi

backup=$(mktemp -d /root/note-https-gate-backup-XXXXXXXX)
cp -a "$live" "$backup/default"
cp -a "$app" "$backup/server.js"
app_changed=false
rollback() {
  trap - ERR INT TERM
  set +e
  cp -a "$backup/default" "$live"
  nginx -t && systemctl reload nginx
  if [[ "$app_changed" == true ]]; then
    cp -a "$backup/server.js" "$app"
    pm2 restart telegram-notes >/dev/null
  fi
  echo "未通过检查，已恢复 Nginx 配置 $backup" >&2
  exit 1
}
trap rollback ERR INT TERM
pending=$(mktemp "$(dirname "$live")/.note-https-next-XXXXXXXX")
cp "$stage/default" "$pending"
chmod --reference="$live" "$pending"
chown --reference="$live" "$pending"
mv -f "$pending" "$live"
nginx -t
systemctl reload nginx
if ! cmp -s "$app" "$stage/server.js"; then
  chmod --reference="$app" "$stage/server.js"
  chown --reference="$app" "$stage/server.js"
  app_changed=true
  mv -f "$stage/server.js" "$app"
  pm2 restart telegram-notes >/dev/null
fi
passed=false
for attempt in {1..8}; do
  if check_loopback && check_gate; then passed=true; break; fi
  sleep 1
done
[[ "$passed" == true ]]
trap - ERR INT TERM
echo "NOTE_HTTPS_GATE_SUCCESS backup=$backup"
