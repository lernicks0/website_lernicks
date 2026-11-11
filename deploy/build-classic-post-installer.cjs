'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const assets = Object.fromEntries(['cla', 'note'].map(site => [site, read(`design/classic-post-${site}.css`).trim()]));
const patch = read('deploy/patch-classic-post.cjs').trimEnd();
const installer = `#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
mode=\${1:---check}
[[ "$mode" == --check || "$mode" == --apply ]] || { echo '用法：--check 或 --apply' >&2; exit 1; }
if ! command -v node >/dev/null; then
  set +eu
  export NVM_DIR=/root/.nvm
  [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
  set -Eeuo pipefail
fi
for tool in node curl flock; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9
cla=/root/cla/index.html
note=/root/telegram-notes/public/index.html
for file in "$cla" "$note"; do
  [[ -f "$file" && "$(readlink -f "$file")" == "$file" ]]
done
stage=$(mktemp -d /root/.classic-post-stage-XXXXXXXX)
trap 'rm -f -- "$stage/patch.cjs" "$stage/cla.html" "$stage/note.html" "$stage/response"; rmdir -- "$stage"' EXIT
cat > "$stage/patch.cjs" <<'CLASSIC_POST_PATCH'
const classicPostAssets = ${JSON.stringify(assets)};
${patch}
CLASSIC_POST_PATCH
node "$stage/patch.cjs" "$cla" "$note" "$stage"
if [[ "$mode" == --check ]]; then
  echo 'CLASSIC_POST_CHECK_SUCCESS：两页通过预检，未修改页面。'
  exit 0
fi
if cmp -s "$cla" "$stage/cla.html" && cmp -s "$note" "$stage/note.html"; then
  echo 'CLASSIC_POST_ALREADY_INSTALLED'
  exit 0
fi

backup=$(mktemp -d /root/classic-post-code-backup-XXXXXXXX)
cp -p -- "$cla" "$backup/cla.html"
cp -p -- "$note" "$backup/note.html"
replace_page() (
  set -e
  local dest=$1 src=$2 tmp
  tmp=$(mktemp "\${dest%/*}/.classic-post-XXXXXXXX")
  trap 'rm -f -- "$tmp"' EXIT
  cp -p -- "$dest" "$tmp"
  cat "$src" > "$tmp"
  mv -fT -- "$tmp" "$dest"
)
restore() {
  local rc=$?
  trap - ERR
  set +e
  replace_page "$cla" "$backup/cla.html" || echo 'CLA 自动恢复失败' >&2
  replace_page "$note" "$backup/note.html" || echo '便签自动恢复失败' >&2
  echo "CLASSIC_POST_INSTALL_FAILED backup=$backup" >&2
  exit "$rc"
}
trap restore ERR
replace_page "$cla" "$stage/cla.html"
replace_page "$note" "$stage/note.html"
check_page() {
  curl -fsSL --max-time 10 -H "Host: $2" -H 'X-Forwarded-Proto: https' "$1" -o "$stage/response"
  grep -Fq '<!-- CLASSIC POST 20261111 -->' "$stage/response"
}
check_page http://127.0.0.1:1147/index.html cla.lernicks.cn
check_page http://127.0.0.1:3000/ note.lernicks.cn
trap - ERR
echo "CLASSIC_POST_INSTALL_SUCCESS backup=$backup"
`;
fs.writeFileSync(path.join(root, 'deploy/install-classic-post-20261111.sh'), installer);
