#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
domain=tbl.lernicks.cn
webroot=/var/lib/letsencrypt
https_conf=/etc/nginx/conf.d/tbl-direct-https.conf
hook=/etc/letsencrypt/renewal-hooks/deploy/tbl-nginx-reload
mode=${1:---inspect}
[[ $EUID == 0 ]]
[[ $mode == --inspect || $mode == --apply ]] || exit 2

if ! command -v node >/dev/null; then
  set +eu
  export NVM_DIR=/root/.nvm
  [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
  set -Eeuo pipefail
fi
command -v node >/dev/null
exec 9>/root/.tbl-origin-https.lock
flock -n 9
stage=$(mktemp -d /root/tbl-origin-https-XXXXXXXX)
nginx -T > "$stage/effective"
# Use the active configuration's filename, not a guessed sites-enabled link.
live=$(awk '
  /^# configuration file / { f=$0; sub(/^# configuration file /,"",f); sub(/:$/,"",f) }
  /^[[:space:]]*server_name[[:space:]]/ {
    for (i=2;i<=NF;i++) {
      n=$i; gsub(/[;"\047]/,"",n)
      if (tolower(n)=="tbl.lernicks.cn") print f
    }
  }' "$stage/effective")
[[ $live == /etc/nginx/* && $live != *$'\n'* ]]
live=$(readlink -f -- "$live")
[[ $live == /etc/nginx/* && -f $live && ! -e $https_conf && ! -L $https_conf ]]

TBL_PATCHER
node "$stage/prepare.cjs" "$live" "$stage"
printf 'ACTIVE_CONFIG=%s\nSTAGE=%s\n' "$live" "$stage"
if [[ $mode == --inspect ]]; then
  diff -u -- "$live" "$stage/http.conf" || [[ $? == 1 ]]
  apt-cache policy certbot | head -8
  exit 0
fi

[[ ! -e $hook && ! -L $hook ]]
cp -a -- "$live" "$stage/original"
if ! command -v certbot >/dev/null; then
  apt-get update -o Acquire::Retries=2
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends certbot
fi
[[ $(sha256sum "$live" | cut -d' ' -f1) == $(cat "$stage/source.sha256") ]]

probe=
rollback() {
  trap - ERR INT TERM
  cp -a -- "$stage/original" "$live" || true
  rm -f -- "$https_conf" "$hook"
  [[ -z $probe ]] || rm -f -- "$probe"
  nginx -t && systemctl reload nginx || true
  printf 'Nginx restored. Backup: %s\n' "$stage/original" >&2
  exit 1
}
trap rollback ERR INT TERM
cat "$stage/http.conf" > "$live"
install -d -m 755 "$webroot/.well-known/acme-challenge"
nginx -t
systemctl reload nginx
token="tbl-probe-$(openssl rand -hex 12)"
probe="$webroot/.well-known/acme-challenge/$token"
printf '%s' "$token" > "$probe"
chmod 644 "$probe"
[[ $(curl -fsSL --max-time 20 "http://$domain/.well-known/acme-challenge/$token") == "$token" ]]
rm -f -- "$probe"
probe=

certbot certonly --webroot -w "$webroot" --cert-name "$domain" -d "$domain" \
  --non-interactive --keep-until-expiring --agree-tos --register-unsafely-without-email
install -m 644 "$stage/https.conf" "$https_conf"
nginx -t
systemctl reload nginx
curl --noproxy '*' --resolve "$domain:443:127.0.0.1" -fsS --max-time 10 "https://$domain/" > "$stage/https-index"
curl --noproxy '*' --resolve "$domain:443:127.0.0.1" -fsS --max-time 10 "https://$domain/api/status" > "$stage/https-status"
node -e 'const fs=require("fs");if(!JSON.parse(fs.readFileSync(process.argv[1])).ok)process.exit(1)' "$stage/https-status"
install -d -m 755 "$(dirname "$hook")"
cat > "$hook" <<'RENEW'
#!/bin/sh
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/tbl.lernicks.cn ]; then
    nginx -t && systemctl reload nginx
fi
RENEW
chmod 755 "$hook"
systemctl enable --now certbot.timer
certbot renew --cert-name "$domain" --dry-run
trap - ERR INT TERM
openssl x509 -in "/etc/letsencrypt/live/$domain/fullchain.pem" -noout -enddate
printf 'TBL_ORIGIN_HTTPS_READY backup=%s/original\n' "$stage"
