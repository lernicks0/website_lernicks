#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
domain=tbl.lernicks.cn
webroot=/var/www/tbl-acme
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

cat > "$stage/prepare.cjs" <<'TBL_PATCH_JS'
// Read an existing Nginx site file and stage only tbl's HTTP challenge and HTTPS virtual host.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function tokens(source){
 const result=[],pattern=/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{};]|[^\s{};#]+/g;
 for(const m of source.matchAll(pattern))if(!m[0].startsWith('#'))result.push({value:m[0],start:m.index,end:m.index+m[0].length});
 return result;
}
function prepare(source){
 assert.ok(!source.includes('# tbl-direct-acme-20261101'),'Challenge configuration already exists; inspect before reinstalling');
 const all=tokens(source),matches=[];
 for(let i=0;i<all.length-1;i++)if(all[i].value==='server'&&all[i+1].value==='{'){
  let depth=1,j=i+2,names=[],nameEnd=-1;
  for(;j<all.length&&depth;j++){
   if(all[j].value==='{')depth++;else if(all[j].value==='}')depth--;
   else if(depth===1&&all[j].value==='server_name'){
    names=[];for(let k=j+1;k<all.length&&all[k].value!==';';k++)names.push(all[k].value);
    const end=all.slice(j+1).find(t=>t.value===';');assert.ok(end);nameEnd=end.end;
   }
  }
  assert.equal(depth,0,'Unbalanced Nginx block');
  if(names.includes('tbl.lernicks.cn'))matches.push({start:all[i].start,end:all[j-1].end,names,nameEnd});
 }
 assert.equal(matches.length,1,'Expected one existing tbl virtual host');const target=matches[0];
 assert.deepEqual(target.names,['tbl.lernicks.cn'],'Refuse to change a shared virtual host');
 const original=source.slice(target.start,target.end);
 assert.ok(!original.includes('acme-challenge'),'Existing ACME handling needs inspection');
 assert.equal((original.match(/\blisten\s+80\s*;/g)||[]).length,1,'Expected plain port 80');
 assert.equal((original.match(/\blisten\s+/g)||[]).length,1,'Unexpected additional listeners');
 assert.ok(/proxy_pass\s+http:\/\/127\.0\.0\.1:1148\s*;/.test(original),'Unexpected tbl upstream');
 const challenge='\n\n    # tbl-direct-acme-20261101\n    location ^~ /.well-known/acme-challenge/ {\n        root /var/www/tbl-acme;\n        default_type text/plain;\n        try_files $uri =404;\n    }';
 const at=target.nameEnd;
 const http=source.slice(0,at)+challenge+source.slice(at);
 assert.equal(http.replace(challenge,''),source,'Unrelated HTTP configuration changed');
 let tls=original.replace(/\blisten\s+80\s*;/,'listen 443 ssl http2;');
 const cert='\n    ssl_certificate /etc/letsencrypt/live/tbl.lernicks.cn/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/tbl.lernicks.cn/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_session_cache shared:TBL_TLS:4m;\n    ssl_session_timeout 1d;\n    ssl_session_tickets off;';
 tls=tls.replace(/server_name\s+tbl\.lernicks\.cn\s*;/,m=>m+cert+challenge);
 // Direct visitors cannot spoof the Cloudflare client-IP header used by the app's rate limiter.
 assert.equal((tls.match(/proxy_set_header\s+X-Real-IP\s+\$remote_addr\s*;/g)||[]).length,1);
 tls=tls.replace(/proxy_set_header\s+X-Real-IP\s+\$remote_addr\s*;/,m=>m+'\n        proxy_set_header CF-Connecting-IP "";');
 return {http,tls:'# tbl-direct-https-20261101\n'+tls+'\n'};
}
module.exports={prepare,tokens};
if(require.main===module){
 const [input,stage]=process.argv.slice(2);assert.ok(input&&stage);
 assert.equal(fs.realpathSync(input),path.resolve(input),'Use the resolved site configuration path');
 const source=fs.readFileSync(input,'utf8'),result=prepare(source);
 fs.mkdirSync(stage,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(stage,'http.conf'),result.http);fs.writeFileSync(path.join(stage,'https.conf'),result.tls);
 fs.writeFileSync(path.join(stage,'source.sha256'),crypto.createHash('sha256').update(source).digest('hex')+'\n');
 console.log('STAGED: HTTP ACME challenge only; separate tbl HTTPS host; no HTTP redirect or DNS changes.');
}
TBL_PATCH_JS
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
install -d -m 755 "$webroot" "$webroot/.well-known" "$webroot/.well-known/acme-challenge"
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
