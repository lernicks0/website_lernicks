#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ $(id -u) == 0 ]] || { echo '请通过 sudo bash 运行。' >&2; exit 1; }
release=${1:?请传入完整的发布提交 ID}
[[ $release =~ ^[a-f0-9]{40}$ ]]

live=/root/mk/document.html
old_sha=6e6d170bed1fdf166a356b7b210944b3c4fca82952db6a6b4dff30d177fbd01c
new_sha=68723e65c536efb579a01dbf780e54d7793a3a40dd85a28a11a9c6897d6a98ce
[[ $(readlink -f "$live") == "$live" && -f "$live" ]]
exec 9>/root/.mk-performance-install.lock
flock -n 9

current=$(sha256sum "$live")
current=${current%% *}
if [[ $current == "$new_sha" ]]; then
  echo 'MK_RENDER_UPDATE_SUCCESS already installed'
  exit 0
fi
[[ $current == "$old_sha" ]] || { echo '阅读页版本不匹配，安装已停止。' >&2; exit 1; }

stage=$(mktemp /root/mk/.document-render-XXXXXXXX)
trap 'rm -f -- "$stage"' EXIT
url="https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$release/mk/document.html"
curl -fLsS --connect-timeout 15 --max-time 60 --retry 3 -o "$stage" "$url"
echo "$new_sha  $stage" | sha256sum -c -

backup=$(mktemp -d /root/mk-render-code-backup-XXXXXXXX)
cp -a -- "$live" "$backup/document.html"
chmod --reference="$live" "$stage"
chown --reference="$live" "$stage"
mv -f -- "$stage" "$live"
echo "MK_RENDER_UPDATE_SUCCESS backup=$backup"
