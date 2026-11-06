#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0 || { echo '请使用 sudo bash。' >&2; exit 1; }
if ! command -v node >/dev/null; then
 set +eu
 export NVM_DIR=/root/.nvm
 [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
 set -Eeuo pipefail
fi
for tool in node curl flock; do command -v "$tool" >/dev/null; done
exec 9>/root/.note-security-install.lock
flock -n 9
live=/root/telegram-notes/public/index.html
test -f "$live"; test "$(readlink -f "$live")" = "$live"
stage=$(mktemp -d /tmp/note-default-e2ee-XXXXXXXX); chmod 700 "$stage"
base64 -d > "$stage/patch.cjs" <<'NOTE_DEFAULT_ASSET'
J3VzZSBzdHJpY3QnOwpjb25zdCBmcz1yZXF1aXJlKCdub2RlOmZzJykscGF0aD1yZXF1aXJlKCdub2RlOnBhdGgnKSxhc3NlcnQ9cmVxdWlyZSgnbm9kZTphc3NlcnQvc3RyaWN0Jyksdm09cmVxdWlyZSgnbm9kZTp2bScpOwpjb25zdCBjaGFuZ2VzPVsKIFsiaWYgKCFtLmV4aXN0cykgcmV0dXJuIGVkaXRvcihyb290LCBzbHVnLCB7IC4uLm0sIGNvbnRlbnQ6JycsIHNlY3JldDpudWxsLCBwYXNzd29yZDonJywgdG9rZW46bnVsbCB9LCBjdXJyZW50KTsiLCAiaWYgKCFtLmV4aXN0cykgcmV0dXJuIGVkaXRvcihyb290LCBzbHVnLCB7IC4uLm0sIGVuY3J5cHRlZDp0cnVlLCBjb250ZW50OicnLCBzZWNyZXQ6bnVsbCwgcGFzc3dvcmQ6JycsIHRva2VuOm51bGwgfSwgY3VycmVudCk7Il0sCiBbJ+maj+WGmemaj+WtmO+8jOeUqOmTvuaOpeWIhuS6q+OAguWPr+S7peiuvue9rumXrumimOOAgeerr+WIsOerr+WKoOWvhu+8jOaIlueVmeS4gOWwgemYheWQjuWNs+eEmueahOS/oeOAgicsJ+aWsOW7uuS+v+etvum7mOiupOerr+WIsOerr+WKoOWvhu+8jOWPr+iuvue9ruWvhueggeOAgemXrumimOaIlumYheWQjuWNs+eEmuOAgiddLAogWyc8c3Bhbj7nq6/liLDnq6/liqDlr4Y8L3NwYW4+JywnPHNwYW4+56uv5Yiw56uv5Yqg5a+G77yI5paw5L6/562+6buY6K6k5byA5ZCv77yJPC9zcGFuPiddLAogWyfor7fkv53lrZjlrozmlbTpk77mjqXvvJvliLfmlrDlkI7pnIDph43mlrDnlKjlrozmlbTpk77mjqXmiZPlvIAnLCfor7fngrnlh7vigJzlpI3liLbpk77mjqXigJ3kv53lrZjlrozmlbTpk77mjqXvvJvku4XmnInku6Plj7fml6Dms5Xop6Plr4YnXQpdOwpmdW5jdGlvbiBwYXRjaENsaWVudChjbGllbnQpewogZm9yKGNvbnN0W2JlZm9yZSxhZnRlcl1vZiBjaGFuZ2VzKXsKICBpZihjbGllbnQuaW5jbHVkZXMoYWZ0ZXIpKXthc3NlcnQub2soIWNsaWVudC5pbmNsdWRlcyhiZWZvcmUpLCdNaXhlZCBkZWZhdWx0IGVuY3J5cHRpb24gdmVyc2lvbnMnKTtjb250aW51ZTt9CiAgYXNzZXJ0LmVxdWFsKGNsaWVudC5zcGxpdChiZWZvcmUpLmxlbmd0aCwyLCdVbmtub3duIG5vdGUgY2xpZW50OiAnK2JlZm9yZS5zbGljZSgwLDYwKSk7Y2xpZW50PWNsaWVudC5yZXBsYWNlKGJlZm9yZSwoKT0+YWZ0ZXIpOwogfQogbmV3IHZtLlNjcmlwdChjbGllbnQpO3JldHVybiBjbGllbnQ7Cn0KZnVuY3Rpb24gcGF0Y2hIdG1sKGh0bWwpewogY29uc3QgbWF0Y2hlcz1bLi4uaHRtbC5tYXRjaEFsbCgvKDxzY3JpcHQgaWQ9Im5vdGUtc2VjdXJpdHktY2xpZW50Ij4pKFtcc1xTXSo/KSg8XC9zY3JpcHQ+KS9nKV07CiBhc3NlcnQuZXF1YWwobWF0Y2hlcy5sZW5ndGgsMSwnU2VjdXJpdHkgY2xpZW50IG1pc3Npbmcgb3IgZHVwbGljYXRlZCcpOwogY29uc3QgbT1tYXRjaGVzWzBdLGJvZHk9cGF0Y2hDbGllbnQobVsyXSk7cmV0dXJuIGh0bWwucmVwbGFjZShtWzBdLCgpPT5tWzFdK2JvZHkrbVszXSk7Cn0KbW9kdWxlLmV4cG9ydHM9e3BhdGNoQ2xpZW50LHBhdGNoSHRtbH07CmlmKHJlcXVpcmUubWFpbj09PW1vZHVsZSl7Y29uc3RbbGl2ZSxvdXRdPXByb2Nlc3MuYXJndi5zbGljZSgyKTthc3NlcnQuZXF1YWwoZnMucmVhbHBhdGhTeW5jKGxpdmUpLHBhdGgucmVzb2x2ZShsaXZlKSk7ZnMud3JpdGVGaWxlU3luYyhvdXQscGF0Y2hIdG1sKGZzLnJlYWRGaWxlU3luYyhsaXZlLCd1dGY4JykpKTt9Cg==
NOTE_DEFAULT_ASSET
node "$stage/patch.cjs" "$live" "$stage/index.html"
backup=$(mktemp -d /root/note-default-e2ee-code-backup-XXXXXXXX); chmod 700 "$backup"
cp -a "$live" "$backup/index.html"
rollback(){ trap - ERR INT TERM; cp -a "$backup/index.html" "$live"; echo "恢复原页面：$backup" >&2; exit 1; }
trap rollback ERR INT TERM
cp "$stage/index.html" "$live.note-default-e2ee-next"; chmod 644 "$live.note-default-e2ee-next"; mv -f "$live.note-default-e2ee-next" "$live"
curl --noproxy '*' -fsS --retry 3 --max-time 15 http://127.0.0.1:3000/ -o "$stage/served.html"
cmp "$stage/index.html" "$stage/served.html"
trap - ERR INT TERM
echo "NOTE_DEFAULT_E2EE_UPDATE_SUCCESS backup=$backup"
echo '新便签默认端到端加密；已有便签与数据保持原状，未重启进程。'
