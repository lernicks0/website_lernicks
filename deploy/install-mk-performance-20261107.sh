#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "$(id -u)" == 0 ]] || { echo '请使用 sudo bash 运行。' >&2; exit 1; }
release=${1:?请传入完整的发布提交 ID}
[[ "$release" =~ ^[a-f0-9]{40}$ ]]
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  set +eu
  export NVM_DIR=/root/.nvm
  [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
  set -Eeuo pipefail
fi
for tool in node pm2 curl tar flock sha256sum; do command -v "$tool" >/dev/null; done

live=/root/mk
[[ "$(readlink -f "$live")" == "$live" && -d "$live" ]]
pm2 describe mk-server >/dev/null
exec 9>/root/.mk-performance-install.lock
flock -n 9

stage=$(mktemp -d /root/.mk-performance-stage-XXXXXXXX)
archive="$stage/release.tar.gz"
url="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$release/deploy/releases/mk-performance-20261107.tar.gz"
curl -fLsS --connect-timeout 15 --max-time 90 --retry 3 -o "$archive" "$url"
echo "efef403ceb8fee47352a99912074cb9e5a09b9c04caa8d9c186796c19ca96cf0  $archive" | sha256sum -c -
tar -xzf "$archive" -C "$stage"

files=(server.js index.html document.html html-support.js)
old_hashes=(
  60ea09931a971b7265b87482da778e2cbe356f295400abdf05ce6b42d5e010cd
  7750bb517cac5a830907ce7dcc5ed386119b20d2d3b6392c18d4354bf07e521c
  8b72962e87ff5a0577adcb8bf061fd4dc50c7452ce8f850f92982862dc2b64ad
  271c22cf4457842a9e6ec0bff08e9fc5792be7f0f5208a99cff46804212ff835
)
for i in "${!files[@]}"; do
  file=${files[$i]}
  [[ -f "$stage/$file" && -f "$live/$file" && ! -L "$live/$file" ]]
  if ! cmp -s "$stage/$file" "$live/$file"; then
    echo "${old_hashes[$i]}  $live/$file" | sha256sum -c -
  fi
done
echo "c2f26ea4fc0d88141c9aa430eb515ac86fce59418ceebd85fa475b87a8d6c3e6  $live/purify.min.js" | sha256sum -c -
node --check "$stage/server.js"
node --check "$stage/html-support.js"
if [[ -e "$live/vendor" || -L "$live/vendor" ]]; then
  [[ -d "$live/vendor" && ! -L "$live/vendor" ]]
  diff -qr "$stage/vendor" "$live/vendor"
fi

backup=$(mktemp -d /root/mk-performance-code-backup-XXXXXXXX)
for file in "${files[@]}"; do cp -a "$live/$file" "$backup/$file"; done
new_vendor=false
rollback() {
  trap - ERR INT TERM
  for file in "${files[@]}"; do cp -a "$backup/$file" "$live/$file"; done
  if [[ "$new_vendor" == true && -d "$live/vendor" ]]; then mv "$live/vendor" "$stage/failed-vendor"; fi
  pm2 restart mk-server || true
  echo "更新失败，已尝试恢复原程序。备份 $backup" >&2
  exit 1
}
trap rollback ERR INT TERM
if [[ ! -d "$live/vendor" ]]; then
  chmod -R u=rwX,go=rX "$stage/vendor"
  new_vendor=true
  mv "$stage/vendor" "$live/vendor"
fi
for file in "${files[@]}"; do
  chmod --reference="$live/$file" "$stage/$file"
  chown --reference="$live/$file" "$stage/$file"
  mv -f "$stage/$file" "$live/$file"
done
pm2 restart mk-server

base=http://127.0.0.1:1151
healthy=false
for attempt in {1..10}; do
  if curl --noproxy '*' -fsS --max-time 3 "$base/api/status" -o "$stage/status.json" \
      && node -e 'if (require(process.argv[1]).ok !== true) process.exit(1)' "$stage/status.json"; then
    healthy=true
    break
  fi
  sleep 1
done
[[ "$healthy" == true ]]
curl --noproxy '*' -fsS --max-time 10 "$base/" -o "$stage/served.html"
asset=$(node -e '
  const html = require("fs").readFileSync(process.argv[1], "utf8");
  const match = html.match(/src="(\/mk-assets\/[a-f0-9]{20}\/html-support\.js)"/);
  if (!match || html.includes("__MK_ASSET_VERSION__")) process.exit(1);
  process.stdout.write(match[1]);
' "$stage/served.html")
curl --noproxy '*' -fsS --max-time 10 -D "$stage/asset.headers" "$base$asset" -o "$stage/asset.js"
cmp "$live/html-support.js" "$stage/asset.js"
grep -iq '^cache-control: public, max-age=31536000, immutable' "$stage/asset.headers"
trap - ERR INT TERM
echo "MK_PERFORMANCE_UPDATE_SUCCESS backup=$backup"
