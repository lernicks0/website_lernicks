#!/usr/bin/env bash
set -Eeuo pipefail
release_commit=${1:?Pass the full release commit}
[[ "$release_commit" =~ ^[a-f0-9]{40}$ ]] || exit 1
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
fi
command -v node >/dev/null
command -v pm2 >/dev/null
stage_dir=$(mktemp -d /tmp/lernicks-design-XXXXXXXX)
archive="$stage_dir/design.tar.gz"
curl -fL --retry 3 --connect-timeout 15 --max-time 180 "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@${release_commit}/deploy/releases/design-20260906.tar.gz" -o "$archive"
echo "5dab79fd8430771a16c8a2011b0686971f1ede04c8e5d497fa4f4bef2e4245a7  $archive" | sha256sum -c -
tar -xzf "$archive" -C "$stage_dir"
specs=(
 'main/index.html|main-site/index.html|1149|main-server'
 'cla/index.html|cla-site/index.html|1147|cla-server'
 'pk/pk.html|pk-redesign-preview/pk.html|1145|pk-server'
 'sco/index.html|sco-site/index.html|1146|sco-server'
 'goal/index.html|goal-site/index.html|1152|goal-server'
 'telegram-notes/public/index.html|note-site/index.html|3000|telegram-notes'
 'mk/index.html|mk-site/index.html|1151|mk-server'
 'mk/document.html|mk-site/document.html|1151|mk-server'
 'tbl/index.html|tbl-site/index.html|1148|tbl-server'
)
for spec in "${specs[@]}"; do
 IFS='|' read -r live_file work_file port process <<< "$spec"
 test -f "/root/$live_file"
 test "$(readlink -f "/root/$live_file")" = "/root/$live_file"
 pm2 describe "$process" >/dev/null
 mkdir -p "$stage_dir/work/$(dirname "$work_file")"
 cp -a "/root/$live_file" "$stage_dir/work/$work_file"
done
DESIGN_BUILD_ROOT="$stage_dir/work" node "$stage_dir/design/build.js"
node "$stage_dir/deploy/validate-design.cjs" "$stage_dir/work"
backup_dir=$(mktemp -d /root/design-code-backup-XXXXXXXX)
for spec in "${specs[@]}"; do
 IFS='|' read -r live_file work_file port process <<< "$spec"
 mkdir -p "$backup_dir/$(dirname "$live_file")"
 cp -a "/root/$live_file" "$backup_dir/$live_file"
done
processes=(main-server cla-server pk-server sco-server goal-server telegram-notes mk-server tbl-server)
rollback(){
 trap - ERR
 echo "Update failed; restoring page backups from $backup_dir" >&2
 for spec in "${specs[@]}"; do
  IFS='|' read -r live_file work_file port process <<< "$spec"
  cp -a "$backup_dir/$live_file" "/root/$live_file"
 done
 for process in "${processes[@]}"; do pm2 restart "$process" >/dev/null || true; done
 exit 1
}
trap rollback ERR
for spec in "${specs[@]}"; do
 IFS='|' read -r live_file work_file port process <<< "$spec"
 cp -a "$stage_dir/work/$work_file" "/root/$live_file"
done
for process in "${processes[@]}"; do pm2 restart "$process" >/dev/null; done
for spec in "${specs[@]}"; do
 IFS='|' read -r live_file work_file port process <<< "$spec"
 # Reading the MK document template requires a document URL; its file was validated above.
 if [ "$live_file" = 'mk/document.html' ]; then continue; fi
 healthy=false
 for attempt in 1 2 3 4 5; do
  if curl -fsSL --max-redirs 5 --max-time 15 "http://127.0.0.1:$port/" -o "$stage_dir/served.html" && grep -q 'id="astra-theme"' "$stage_dir/served.html"; then healthy=true; break; fi
  sleep 1
 done
 if [ "$healthy" != true ]; then echo "Page check failed: $process at http://127.0.0.1:$port/" >&2; fi
 test "$healthy" = true
 echo "OK: $process / $port"
done
trap - ERR
echo "DESIGN_DEPLOY_SUCCESS commit=$release_commit backup=$backup_dir"
