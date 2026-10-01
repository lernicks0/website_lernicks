#!/usr/bin/env bash
set -euo pipefail
COMMIT="${1:?请提供固定发布提交}"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo '提交编号不正确'; exit 1; }
BASE="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$COMMIT"
EXPECTED='a3b2cc57fa6ae6afb35f605c3a4b9bda6fe0a3f7d11907b04c0ce1f8fde400fe'
# WebShell 的非交互 Bash 不会自动执行 .bashrc，先载入服务器已有 nvm。
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  SB_NVM_DIR="${NVM_DIR:-/root/.nvm}"
  if test -s "$SB_NVM_DIR/nvm.sh"; then
    # nvm 初始化可能读取未设置的变量；只在载入期间关闭 nounset。
    set +u
    . "$SB_NVM_DIR/nvm.sh" --no-use
    set -u
    nvm use --silent default >/dev/null 2>&1 || nvm use --silent node >/dev/null 2>&1 || true
  fi
fi
for tool in node pm2 curl tar nginx sha256sum cmp; do command -v "$tool" >/dev/null || { echo "缺少 $tool；请先载入既有 nvm/PM2 环境。"; exit 1; }; done
test "$(id -u)" = 0 || { echo '请用服务器 root 的 WebShell 执行'; exit 1; }
TARGET=/root/sb
NGINX_FILE=/etc/nginx/conf.d/sb-lernicks.conf
STAGE=$(mktemp -d /tmp/sb-install-XXXXXXXX)
trap 'rm -rf -- "$STAGE"' EXIT
curl -fL --retry 3 --connect-timeout 15 --max-time 180 "$BASE/deploy/sb-20261001.tar.gz" -o "$STAGE/sb.tar.gz"
echo "$EXPECTED  $STAGE/sb.tar.gz" | sha256sum -c -
tar -xzf "$STAGE/sb.tar.gz" -C "$STAGE"
node --check "$STAGE/sb/server.js"
node --check "$STAGE/sb/app.js"
FILES=(index.html style.css app.js server.js favicon.svg assets/trio.webp)
for file in "${FILES[@]}"; do test -s "$STAGE/sb/$file"; done
nginx -t
nginx -T > "$STAGE/nginx-before.txt" 2>&1
ADD_NGINX=0
if ! grep -Eq 'server_name[^;]*[[:space:]]sb\.lernicks\.cn([[:space:];]|$)' "$STAGE/nginx-before.txt"; then
  test ! -e "$NGINX_FILE" || { echo '已有同名 Nginx 配置，请先核对'; exit 1; }
  grep -Eq 'include[[:space:]]+/etc/nginx/conf.d/\*\.conf' "$STAGE/nginx-before.txt" || { echo 'Nginx 未载入 conf.d；请按 DEPLOY-SB.md 接入域名配置'; exit 1; }
  ADD_NGINX=1
fi
pm2 jlist > "$STAGE/pm2-before.json"
HAD_PROCESS=$(node - "$STAGE/pm2-before.json" <<'NODE'
const fs = require('fs');
const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter(p => p.name === 'sb-server');
if (items.length > 1) throw Error('有多个 sb-server，请先检查');
if (items.length) {
  const env = items[0].pm2_env;
  if (env.pm_exec_path !== '/root/sb/server.js' || (env.SB_PORT && String(env.SB_PORT) !== '1155')) throw Error('sb-server 指向其他程序或端口，拒绝覆盖');
}
console.log(items.length ? 1 : 0);
NODE
)
if test "$HAD_PROCESS" = 0; then
  node - <<'NODE'
const server = require('net').createServer();
server.once('error', () => { console.error('1155 端口已被其他程序使用，未进行安装'); process.exitCode = 1; });
server.listen(1155, '127.0.0.1', () => server.close());
NODE
fi
# 不覆盖链接目标，保留目录里其他文件和任何业务数据。
test ! -L "$TARGET" && test ! -L "$TARGET/assets" || { echo '目标目录为符号链接，请先核对'; exit 1; }
mkdir -p "$TARGET/assets"
for file in "${FILES[@]}"; do
  test ! -L "$TARGET/$file" || { echo "目标文件为符号链接：$file"; exit 1; }
done
BACKUP=$(mktemp -d /root/sb-code-backup-XXXXXXXX)
chmod 700 "$BACKUP"
mkdir -p "$BACKUP/assets"
for file in "${FILES[@]}"; do
  if test -e "$TARGET/$file"; then cp -a "$TARGET/$file" "$BACKUP/$file"; fi
done
cp "$STAGE/pm2-before.json" "$BACKUP/pm2-before.json"
ADDED_NGINX=0
rollback() {
  echo "安装未完成，恢复本次修改。备份：$BACKUP"
  trap - ERR
  set +e
  for file in "${FILES[@]}"; do
    if test -e "$BACKUP/$file"; then cp -a "$BACKUP/$file" "$TARGET/$file"; else rm -f -- "$TARGET/$file"; fi
  done
  if test "$ADDED_NGINX" = 1; then rm -f -- "$NGINX_FILE"; fi
  if test "$HAD_PROCESS" = 1; then pm2 restart sb-server; else pm2 delete sb-server; fi
  nginx -t && systemctl reload nginx
  exit 1
}
trap rollback ERR
for file in "${FILES[@]}"; do cp "$STAGE/sb/$file" "$TARGET/$file"; done
if test "$HAD_PROCESS" = 1; then
  pm2 restart sb-server
else
  SB_PORT=1155 pm2 start "$TARGET/server.js" --name sb-server --cwd "$TARGET"
fi
if test "$ADD_NGINX" = 1; then
  cp "$STAGE/nginx-sb.conf" "$NGINX_FILE"
  ADDED_NGINX=1
fi
nginx -t
systemctl reload nginx
curl -fsS --retry 8 --retry-connrefused --retry-delay 1 --max-time 20 http://127.0.0.1:1155/healthz > "$STAGE/health.json"
node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!v.ok||v.site!=="shenren-club")throw Error("小站健康检查失败")' "$STAGE/health.json"
curl -fsS --max-time 10 -H 'Host: sb.lernicks.cn' http://127.0.0.1/healthz > "$STAGE/proxy.json"
node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!v.ok||v.site!=="shenren-club")throw Error("sb 域名转发检查失败")' "$STAGE/proxy.json"
for file in index.html style.css app.js favicon.svg assets/trio.webp; do
  curl -fsS --max-time 15 -H 'Host: sb.lernicks.cn' "http://127.0.0.1/$file" -o "$STAGE/served-file"
  cmp "$STAGE/served-file" "$TARGET/$file"
done
pm2 save
trap - ERR
echo "SB_INSTALL_SUCCESS commit=$COMMIT backup=$BACKUP"
echo '请添加 sb → 124.223.201.40 的代理 A 记录，再打开 https://sb.lernicks.cn 检查公网结果。'
