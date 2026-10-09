const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),css=fs.readFileSync(path.join(root,'design/folio.css'),'utf8'),js=fs.readFileSync(path.join(root,'design/folio.js'),'utf8');
const block=`<!-- FOLIO START -->\n<style id="folio-style">\n${css}\n</style>\n<script id="folio-design">\n${js}\n</script>\n<!-- FOLIO END -->\n`;
const payload=`const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const entries=[['main','main/index.html'],['note','telegram-notes/public/index.html'],['tbl','tbl/index.html'],['mk','mk/index.html'],['document','mk/document.html']];
const block=${JSON.stringify(block)};
const stage=process.argv[2],live=path.resolve(process.argv[3]||'/root');
if(!stage)throw Error('Missing staging directory');
function strip(s){return s.replace(/<!-- FOLIO START -->[\\s\\S]*?<!-- FOLIO END -->\\s*/g,'')}
for(const[site,file]of entries){
 const target=path.join(live,file);assert.equal(fs.realpathSync(target),target,'Unexpected symlink: '+file);
 const before=fs.readFileSync(target,'utf8'),clean=strip(before);
 assert.ok(clean.includes('id="astra-theme"'),'Existing new design missing: '+file);
 assert.ok(clean.includes('data-astra-site="'+site+'"'),'Unexpected page: '+file);assert.ok(clean.includes('</head>'));
 const after=clean.replace('</head>',block+'</head>');assert.equal(strip(after),clean,'Existing page changed');
 for(const m of after.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/g))new vm.Script(m[1],{filename:file});
 const dest=path.join(stage,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,after);console.log('Validated: '+file);
}
`;
new vm.Script(payload);fs.writeFileSync(path.join(__dirname,'fix-folio-20261009.cjs'),payload);
const installer=`#!/usr/bin/env bash
set -Eeuo pipefail
test "$(id -u)" = 0 || { echo '请使用 sudo bash /tmp/folio-install.sh'; exit 1; }
if ! command -v node >/dev/null || ! command -v pm2 >/dev/null; then
  FOLIO_NVM_DIR="\${NVM_DIR:-/root/.nvm}"
  if test -s "$FOLIO_NVM_DIR/nvm.sh"; then
    set +u
    . "$FOLIO_NVM_DIR/nvm.sh" --no-use
    set -u
    nvm use --silent default >/dev/null 2>&1 || nvm use --silent node >/dev/null 2>&1 || true
  fi
fi
for tool in node pm2 curl; do command -v "$tool" >/dev/null || { echo "缺少 $tool；请先载入已有 Node/PM2 环境。"; exit 1; }; done
stage=$(mktemp -d /tmp/lernicks-folio-XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
cat > "$stage/patch.cjs" <<'FOLIO_PATCH'
${payload}FOLIO_PATCH
specs=('main/index.html|1149|main-server' 'telegram-notes/public/index.html|3000|telegram-notes' 'tbl/index.html|1148|tbl-server' 'mk/index.html|1151|mk-server' 'mk/document.html|1151|mk-server')
for spec in "\${specs[@]}"; do
 IFS='|' read -r file port process <<< "$spec"
 test -f "/root/$file" && test "$(readlink -f "/root/$file")" = "/root/$file"
 pm2 describe "$process" >/dev/null
done
node "$stage/patch.cjs" "$stage/pages"
backup=$(mktemp -d /root/folio-code-backup-XXXXXXXX)
chmod 700 "$backup"
for spec in "\${specs[@]}"; do
 IFS='|' read -r file port process <<< "$spec"
 mkdir -p "$backup/$(dirname "$file")"
 cp -a "/root/$file" "$backup/$file"
done
processes=(main-server telegram-notes tbl-server mk-server)
rollback(){
 trap - ERR INT TERM
 echo "安装失败，恢复页面备份：$backup" >&2
 for spec in "\${specs[@]}"; do
  IFS='|' read -r file port process <<< "$spec"
  cp -a "$backup/$file" "/root/$file" || true
 done
 for process in "\${processes[@]}"; do pm2 restart "$process" >/dev/null || true; done
 exit 1
}
trap rollback ERR INT TERM
for spec in "\${specs[@]}"; do
 IFS='|' read -r file port process <<< "$spec"
 temp="/root/$file.folio-$$"
 cp -a "/root/$file" "$temp"
 cat "$stage/pages/$file" > "$temp"
 mv -f "$temp" "/root/$file"
done
for process in "\${processes[@]}"; do pm2 restart "$process" >/dev/null; done
for spec in "\${specs[@]}"; do
 IFS='|' read -r file port process <<< "$spec"
 endpoint=/
 [[ "$file" = 'mk/document.html' ]] && endpoint=/d/0000000000000000
 curl -fsSL --max-redirs 5 --max-time 30 "http://127.0.0.1:$port$endpoint" -o "$stage/check.html"
 grep -q 'id="folio-style"' "$stage/check.html"
 grep -q 'id="folio-design"' "$stage/check.html"
 echo "OK: $file / $port"
done
trap - ERR INT TERM
echo "FOLIO_DEPLOY_SUCCESS backup=$backup"
`;
fs.writeFileSync(path.join(__dirname,'install-folio-20261009.sh'),installer);
console.log('Installer SHA-256: '+crypto.createHash('sha256').update(installer).digest('hex'));
