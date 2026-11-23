#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

commit=${1:?请提供固定发布提交}
mode=${2:---check}
[[ "$commit" =~ ^[0-9a-f]{40}$ && "$mode" =~ ^--(check|apply)$ ]]
[[ $(id -u) == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
    export NVM_DIR=/root/.nvm
    if [[ -s "$NVM_DIR/nvm.sh" ]]; then
        set +u
        . "$NVM_DIR/nvm.sh" --no-use
        nvm use --silent default || nvm use --silent node
        set -u
    fi
fi
for command in node pm2 curl tar nginx flock sha256sum systemctl cmp install; do
    command -v "$command" >/dev/null || { echo "缺少 $command。" >&2; exit 1; }
done
node -e 'if (+process.versions.node.split(".")[0] < 20) throw Error("HT requires Node.js 20+")'

exec 9>/root/.ht-install.lock
flock -n 9
stage=$(mktemp -d /tmp/ht-install-XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
base="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$commit"
curl -fLSs --retry 3 --connect-timeout 15 --max-time 120 "$base/deploy/ht-20261123.tar.gz" -o "$stage/ht.tar.gz"
printf '%s  %s\n' '6a28e839a7a0cb814abd3e011932d7e8a658a13dfe3636f1b25731a16bfd4978' "$stage/ht.tar.gz" | sha256sum -c -
tar -xzf "$stage/ht.tar.gz" -C "$stage"
node --check "$stage/ht/server.js"
node --check "$stage/ht/app.js"

target=/root/ht
config=/etc/nginx/conf.d/ht-lernicks.conf
service=ht-server
files=(server.js index.html app.js style.css)
nginx -T >"$stage/nginx-before" 2>&1 || { echo '现有 Nginx 配置检查失败。' >&2; exit 1; }
pm2 jlist >"$stage/pm2-before"
state=$(node - "$stage/pm2-before" <<'NODE'
const fs = require('node:fs');
const matches = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter(item => item.name === 'ht-server');
if (matches.length > 1 || (matches.length && matches[0].pm2_env.pm_exec_path !== '/root/ht/server.js')) {
    throw Error('已有同名 PM2 进程，请核对。');
}
console.log(matches.length ? 'existing' : 'new');
NODE
)

verify() {
    local file route
    curl -fsS --retry 8 --retry-connrefused --retry-delay 1 --max-time 10 http://127.0.0.1:1156/healthz -o "$stage/health"
    curl -fsS --max-time 10 -H 'Host: ht.lernicks.cn' http://127.0.0.1/healthz -o "$stage/proxy"
    node -e 'for (const file of process.argv.slice(1)) { const value = JSON.parse(require("fs").readFileSync(file)); if (value.ok !== true || value.site !== "ht") throw Error("HT health check failed"); }' "$stage/health" "$stage/proxy"
    for file in index.html app.js style.css; do
        route="/$file"
        if [[ "$file" == index.html ]]; then route=/; fi
        curl -fsS --max-time 10 -H 'Host: ht.lernicks.cn' "http://127.0.0.1$route" -o "$stage/served"
        cmp "$stage/served" "$stage/ht/$file"
    done
}

if [[ "$state" == existing || -e "$target" || -L "$target" || -e "$config" || -L "$config" ]]; then
    [[ "$state" == existing && -d "$target" && ! -L "$target" && -f "$config" && ! -L "$config" ]] ||
        { echo '看到既有 HT 文件或进程，请先核对。' >&2; exit 1; }
    cmp "$stage/nginx-ht.conf" "$config"
    for file in "${files[@]}"; do
        [[ ! -L "$target/$file" ]]
        cmp "$stage/ht/$file" "$target/$file"
    done
    verify
    echo "HT_ALREADY_INSTALLED commit=$commit"
    exit 0
fi
if grep -Eq 'server_name[[:space:]]+([^;]*[[:space:]])?ht\.lernicks\.cn([[:space:];]|$)' "$stage/nginx-before"; then
    echo 'ht.lernicks.cn 已有 Nginx 配置，请先核对。' >&2
    exit 1
fi
grep -Eq 'include[[:space:]]+/etc/nginx/conf.d/\*\.conf' "$stage/nginx-before" ||
    { echo '现有 Nginx 未载入 conf.d。' >&2; exit 1; }
node -e 'const s = require("node:net").createServer(); s.listen(1156, "127.0.0.1", () => s.close());'
if [[ "$mode" == --check ]]; then
    echo "HT_PREFLIGHT_SUCCESS commit=$commit"
    exit 0
fi

mkdir -m 700 "$target"
started=0
nginx_added=0
rollback() {
    trap - ERR
    set +e
    if [[ "$nginx_added" == 1 ]]; then
        rm -f -- "$config"
        nginx -t && systemctl reload nginx
    fi
    if [[ "$started" == 1 ]]; then pm2 delete "$service"; fi
    for file in "${files[@]}"; do rm -f -- "$target/$file"; done
    rmdir "$target/data" "$target" 2>/dev/null
    echo 'HT 安装失败，已撤回本次配置，保留已有数据。' >&2
    exit 1
}
trap rollback ERR
for file in "${files[@]}"; do install -m 600 "$stage/ht/$file" "$target/$file"; done
started=1
HT_ORIGIN=https://ht.lernicks.cn HT_PORT=1156 HT_DATA_DIR="$target/data" \
    pm2 start "$target/server.js" --name "$service" --cwd "$target" --interpreter "$(command -v node)"
nginx_added=1
install -m 644 "$stage/nginx-ht.conf" "$config"
nginx -t
systemctl reload nginx
verify
pm2 save
trap - ERR
echo "HT_INSTALL_SUCCESS commit=$commit"
