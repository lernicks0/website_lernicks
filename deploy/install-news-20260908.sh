#!/usr/bin/env bash
set -euo pipefail
COMMIT="${1:?请提供固定发布提交}"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo '提交编号不正确'; exit 1; }
BASE="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$COMMIT"
for tool in node pm2 curl tar nginx sha256sum; do command -v "$tool" >/dev/null || { echo "缺少 $tool"; exit 1; }; done
test -f /root/class-auth/client.js
test -f /root/cla/index.html
node -e 'const fs=require("fs");const roster=JSON.parse(fs.readFileSync("/root/class-auth/roster.json","utf8"));if(roster.accounts.filter(a=>a.name==="王韩润").length!==1)throw Error("私密名单中未能唯一匹配王韩润，请先核对账号名单");'
curl -fsS --max-time 10 http://127.0.0.1:1153/api/session >/dev/null
STAGE=$(mktemp -d /tmp/news-install-XXXXXXXX)
BACKUP=$(mktemp -d /root/news-code-backup-XXXXXXXX)
chmod 700 "$BACKUP"
curl -fL --retry 3 --connect-timeout 15 --max-time 180 "$BASE/deploy/news-20260908.tar.gz" -o "$STAGE/news.tar.gz"
curl -fL --retry 3 --connect-timeout 15 --max-time 90 "$BASE/deploy/news-20260908.sha256" -o "$STAGE/news.sha256"
(cd "$STAGE" && sha256sum -c news.sha256)
tar -xzf "$STAGE/news.tar.gz" -C "$STAGE"
for file in server.js app.js; do node --check "$STAGE/news/$file"; done
node -e 'const fs=require("fs"),patch=require(process.argv[1]).patch;patch(fs.readFileSync("/root/cla/index.html","utf8"))' "$STAGE/add-news-entry.cjs"
nginx -t
nginx -T > "$STAGE/nginx-before.txt" 2>&1
NGINX_FILE=/etc/nginx/conf.d/news-lernicks.conf
ADD_NGINX=0
if ! grep -Eq 'server_name[^;]*news\.lernicks\.cn' "$STAGE/nginx-before.txt"; then
  test ! -e "$NGINX_FILE" || { echo '已有同名 Nginx 配置，请先检查'; exit 1; }
  grep -Eq 'include[[:space:]]+/etc/nginx/conf.d/\*\.conf' "$STAGE/nginx-before.txt" || { echo 'Nginx 未启用 conf.d，请手动接入 news 配置'; exit 1; }
  ADD_NGINX=1
fi
mkdir -p /root/news
for file in server.js index.html app.js style.css; do
  if test -e "/root/news/$file"; then cp -a "/root/news/$file" "$BACKUP/$file"; fi
done
cp -a /root/cla/index.html "$BACKUP/cla-index.html"
HAD_PROCESS=0
if pm2 describe news-server >/dev/null 2>&1; then HAD_PROCESS=1; fi
rollback() {
  echo "安装未完成，正在恢复程序。备份：$BACKUP"
  trap - ERR
  set +e
  for file in server.js index.html app.js style.css; do
    if test -e "$BACKUP/$file"; then cp -a "$BACKUP/$file" "/root/news/$file"; else rm -f "/root/news/$file"; fi
  done
  cp -a "$BACKUP/cla-index.html" /root/cla/index.html
  if test "$ADD_NGINX" = 1; then rm -f "$NGINX_FILE"; fi
  if test "$HAD_PROCESS" = 1; then pm2 restart news-server; else pm2 delete news-server; fi
  nginx -t && systemctl reload nginx
  pm2 restart cla-server
  exit 1
}
trap rollback ERR
for file in server.js index.html app.js style.css; do cp "$STAGE/news/$file" "/root/news/$file"; done
node "$STAGE/add-news-entry.cjs"
if test "$HAD_PROCESS" = 1; then pm2 restart news-server; else pm2 start /root/news/server.js --name news-server --cwd /root/news; fi
pm2 restart cla-server
if test "$ADD_NGINX" = 1; then cp "$STAGE/nginx-news.conf" "$NGINX_FILE"; fi
nginx -t
systemctl reload nginx
curl -fsS --retry 8 --retry-connrefused --retry-delay 1 --max-time 20 http://127.0.0.1:1154/api/articles > "$STAGE/articles.json"
node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!Array.isArray(v.articles))throw Error("新闻接口检查失败")' "$STAGE/articles.json"
curl -fsS --max-time 10 -H 'Host: news.lernicks.cn' http://127.0.0.1/api/articles > "$STAGE/proxy.json"
node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!Array.isArray(v.articles))throw Error("news 域名转发检查失败")' "$STAGE/proxy.json"
curl -fsSL --max-time 10 http://127.0.0.1:1147/ | grep -q 'https://news.lernicks.cn'
pm2 save
trap - ERR
echo "NEWS_INSTALL_SUCCESS commit=$COMMIT backup=$BACKUP"
echo '请确认 Cloudflare 已有 news → 124.223.201.40 的代理 A 记录，然后打开 https://news.lernicks.cn 验证。'
