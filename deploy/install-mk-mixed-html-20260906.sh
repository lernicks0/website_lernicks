#!/usr/bin/env bash
set -Eeuo pipefail

# Download a pinned release; update code only, preserving all stored documents.
release_commit=${1:?Please pass the full GitHub commit ID}
[[ "$release_commit" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit ID' >&2; exit 1; }
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
fi
command -v node >/dev/null
command -v pm2 >/dev/null
test -d /root/mk
pm2 describe mk-server >/dev/null

stage_dir=$(mktemp -d /tmp/mk-html-update-XXXXXXXX)
archive="$stage_dir/update.tar.gz"
release_url="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@${release_commit}/deploy/releases/mk-mixed-html-20260906.tar.gz"
curl -fL --connect-timeout 15 --max-time 180 --retry 3 --retry-delay 2 "$release_url" -o "$archive"
echo "41184038cea3ad55577ca1b9c1f7e4a0663647625115a87f4b7b185b76b9bf08  $archive" | sha256sum -c -
tar -xzf "$archive" -C "$stage_dir"
files=(index.html document.html server.js html-support.js purify.min.js purify.LICENSE)
for file in "${files[@]}"; do test -f "$stage_dir/$file"; done
node --check "$stage_dir/server.js"
node --check "$stage_dir/html-support.js"

backup_dir=$(mktemp -d /root/mk-code-backup-XXXXXXXX)
for file in "${files[@]}"; do
  if [ -f "/root/mk/$file" ]; then cp -a "/root/mk/$file" "$backup_dir/"; fi
done
rollback() {
  trap - ERR
  echo "Update failed; restoring code from $backup_dir" >&2
  for file in "${files[@]}"; do
    if [ -f "$backup_dir/$file" ]; then cp -a "$backup_dir/$file" "/root/mk/$file"; fi
  done
  pm2 restart mk-server || true
  exit 1
}
trap rollback ERR
for file in "${files[@]}"; do cp -a "$stage_dir/$file" "/root/mk/$file"; done
pm2 restart mk-server
healthy=false
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 10 http://127.0.0.1:1151/api/status > "$stage_dir/status.json" \
    && node -e 'if(!JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok)process.exit(1)' "$stage_dir/status.json"; then
    healthy=true
    break
  fi
  sleep 1
done
test "$healthy" = true
curl -fsS --max-time 10 http://127.0.0.1:1151/html-support.js -o "$stage_dir/served-helper.js"
cmp "$stage_dir/html-support.js" "$stage_dir/served-helper.js"
curl -fsS --max-time 10 http://127.0.0.1:1151/purify.min.js -o "$stage_dir/served-purify.js"
cmp "$stage_dir/purify.min.js" "$stage_dir/served-purify.js"
trap - ERR
echo "Markdown + HTML updated successfully. Backup: $backup_dir"
echo 'Open https://mk.lernicks.cn and press Ctrl+F5.'
