#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $(id -u) == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
mode=${1:---inspect}
case "$mode" in
  --inspect|--apply) ;;
  *) echo '用法: sudo bash SCRIPT [--inspect|--apply]' >&2; exit 2 ;;
esac
for tool in nginx python3 flock; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9

live=$(readlink -f /etc/nginx/sites-enabled/default)
case "$live" in
  /etc/nginx/sites-available/default|/etc/nginx/sites-enabled/default) ;;
  *) echo '实际配置路径与便签部署记录不符。' >&2; exit 1 ;;
esac
stage=$(mktemp -d /root/.note-no-access-log-XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
cp -a -- "$live" "$stage/original"
nginx -T > "$stage/effective.conf"

python3 - "$stage/original" "$stage/default" "$stage/effective.conf" <<'NOTE_PATCH'
import re
import sys
from pathlib import Path

source, target, effective = map(Path, sys.argv[1:])
config = source.read_bytes().decode('utf-8')
active = effective.read_bytes().decode('utf-8')
header = '    server_name note.lernicks.cn;\n'
server = 'server {\n    listen 80;\n' + header
names = re.findall(r'(?m)^\s*server_name\s+([^;\n]+);', active)
matches = [name for name in names if 'note.lernicks.cn' in [token.strip('"\'').lower() for token in name.split()]]
if matches != ['note.lernicks.cn'] or config.count(server) != 1:
    raise SystemExit('便签站有多个或未知的虚拟主机配置，停止修改。')
start = config.index(server)
end = re.search(r'(?m)^}', config[start:])
if end is None:
    raise SystemExit('无法识别便签虚拟主机的结束位置。')
block = config[start:start + end.end()]
if 'proxy_pass http://127.0.0.1:3000;' not in block:
    raise SystemExit('便签上游与部署记录不符。')
if '$note_from_cloudflare = 0' not in block:
    raise SystemExit('找不到已部署的便签源站访问限制。')
directives = re.sub(r'(?m)^\s*#.*$', '', block)
if re.search(r'\binclude\s', directives):
    raise SystemExit('便签站存在嵌套配置，需先确认其日志设置。')

logs = re.findall(r'\baccess_log\s+([^;]+);', directives)
if logs not in ([], ['off']):
    raise SystemExit('便签站有自定义访问日志，需先核对其归属及继承关系。')
if logs == ['off'] and header + '    access_log off;\n' not in block:
    raise SystemExit('现有 access_log off 位于未知的配置层级。')

if not logs:
    config = config[:start] + block.replace(header, header + '    access_log off;\n', 1) + config[start + len(block):]
target.write_bytes(config.encode('utf-8'))
print('便签访问日志：' + ('站点级关闭' if logs else '继承上层设置'))
print('待生效配置：便签虚拟主机 access_log off')
print('Nginx 配置中的日志路径（仅路径，供核对共享范围）：')
for kind, name in sorted(set(re.findall(r'(?m)^\s*(access_log|error_log)\s+(/var/log/nginx/[\w./-]+)(?:\s|;)', active))):
    print(f'  {kind} {name}')
    path = Path(name)
    if path.is_file() and not path.is_symlink():
        print(f'    {path.name} {path.stat().st_size} bytes')
    for rotation in sorted(path.parent.glob(path.name + '.*')):
        if rotation.is_file() and not rotation.is_symlink():
            print(f'    {rotation.name} {rotation.stat().st_size} bytes')
NOTE_PATCH

if [[ "$mode" == --inspect ]]; then
  diff -u -- "$stage/original" "$stage/default" || [[ $? == 1 ]]
  exit 0
fi

cmp -s -- "$live" "$stage/original" || { echo 'Nginx 配置已变化，请重新检查。' >&2; exit 1; }
if ! cmp -s -- "$live" "$stage/default"; then
  command -v systemctl >/dev/null
  backup=$(mktemp -d /root/note-no-access-log-config-backup-XXXXXXXX)
  cp -a -- "$live" "$backup/default"
  cp -a -- "$live" "$stage/replacement"
  cat "$stage/default" > "$stage/replacement"
  rollback() {
    trap - ERR INT TERM
    cp -a -- "$backup/default" "$live"
    nginx -t && systemctl reload nginx || true
    echo "已尝试恢复原配置 $backup/default" >&2
    exit 1
  }
  trap rollback ERR INT TERM
  mv -f -- "$stage/replacement" "$live"
  nginx -t
  systemctl reload nginx
  systemctl is-active --quiet nginx
  trap - ERR INT TERM
  echo "NOTE_NO_ACCESS_LOG_APPLIED backup=$backup"
else
  echo 'NOTE_NO_ACCESS_LOG_ALREADY_CONFIGURED'
fi
