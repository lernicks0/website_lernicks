#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
mode=${1:---check}
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
const classicPostAssets = {"cla":"html[data-astra-site=\"cla\"]{--post-ink:#12203a;--post-paper:#f4ecd8;--post-cream:#eee6d3;--post-muted:#a8b7ce;--post-mono:Consolas,\"Courier New\",monospace}\nhtml[data-astra-site=\"cla\"] .top-actions>.badge:first-child{display:inline-flex}\nhtml[data-astra-site=\"cla\"] .top-actions{flex-flow:row wrap;max-width:none}\n.cla-index-line{display:none}\nhtml[data-design=\"classic\"][data-astra-site=\"cla\"] body{color:var(--post-cream);background:var(--post-ink);overflow-x:visible}\nhtml[data-design=\"classic\"] body::before,html[data-design=\"classic\"] body::after{display:none}\nhtml[data-design=\"classic\"] .page{width:min(1080px,calc(100% - 64px));padding:0 0 26px}\nhtml[data-design=\"classic\"] .top{min-height:84px;padding:16px 0;border-bottom:1px solid #ffffff24;flex-wrap:wrap;align-items:center}\nhtml[data-design=\"classic\"] .logo{width:44px;height:44px;flex:none;color:#e7b98f;border:1px dashed #e7b98f91;border-radius:50%;background:none;box-shadow:none;font:700 16px var(--post-mono)}\nhtml[data-design=\"classic\"] .brand h1{font-size:17px;letter-spacing:.025em}\nhtml[data-design=\"classic\"] .brand p{display:block;font:10px var(--post-mono);letter-spacing:.13em;color:var(--post-muted)}\nhtml[data-design=\"classic\"] .top-actions{justify-content:flex-start;gap:6px}\nhtml[data-design=\"classic\"] .top-actions .badge{display:inline-flex;align-items:center;min-height:38px;border:1px solid transparent;color:var(--post-cream);border-radius:4px;background:transparent;text-decoration:none;padding:6px 10px;white-space:nowrap;font-size:13px}\nhtml[data-design=\"classic\"] .top-actions div.badge{color:#abd2c3}\nhtml[data-design=\"classic\"] .top-actions :is(a,button).badge:hover{border-color:#ffffff35;background:#ffffff0b}\nhtml[data-design=\"classic\"] .design-switch{color:var(--post-muted);margin-left:4px}\nhtml[data-design=\"classic\"] .design-switch select{min-width:72px;min-height:38px;border-radius:4px;color:var(--post-cream)}\nhtml[data-design=\"classic\"] .hero{padding:clamp(48px,9vh,94px) 0 40px;text-align:left}\nhtml[data-design=\"classic\"] .eyebrow{color:#e7b98f;font:12px var(--post-mono);letter-spacing:.17em}\nhtml[data-design=\"classic\"] .hero h2{font-size:clamp(32px,5.8vw,60px);line-height:1.21;letter-spacing:-.025em;margin:15px 0 13px}\nhtml[data-design=\"classic\"] .hero h2 br{display:none}\nhtml[data-design=\"classic\"] .hero .shine{color:#e7b98f;background:none}\nhtml[data-design=\"classic\"] .hero p{margin:0;color:var(--post-muted);font-size:15px}\nhtml[data-design=\"classic\"] .cla-index-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 14px;color:var(--post-muted);font:11px var(--post-mono);letter-spacing:.11em}\nhtml[data-design=\"classic\"] .cla-index-line strong{color:var(--post-cream);font:600 14px system-ui,sans-serif;letter-spacing:.08em}\nhtml[data-design=\"classic\"] .sites{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}\nhtml[data-design=\"classic\"] .card{display:flex;flex-direction:column;align-items:flex-start;min-height:260px;padding:32px 23px 19px;border:0;border-radius:3px;color:#241d12;background:var(--post-paper);box-shadow:0 20px 40px -25px #000c;transition:transform .18s,background-color .18s}\nhtml[data-design=\"classic\"] .card::before{inset:0 0 auto;width:auto;height:9px;border-radius:0;opacity:1;filter:none;background:radial-gradient(circle at 8px 0,var(--post-ink) 5px,transparent 5.6px) 0 0/16px 9px repeat-x}\nhtml[data-design=\"classic\"] .card:is(:hover,:focus-visible){transform:translateY(-3px);background:#fff3da}\nhtml[data-design=\"classic\"] .card:hover::before{transform:none;opacity:1}\nhtml[data-design=\"classic\"] .card.pk{--accent:#933f36}\nhtml[data-design=\"classic\"] .card.sco{--accent:#2c615a}\nhtml[data-design=\"classic\"] .card.goal{--accent:#6b507f}\nhtml[data-design=\"classic\"] .card-no{color:var(--accent);font:700 11px var(--post-mono);letter-spacing:.09em;max-width:calc(100% - 54px)}\nhtml[data-design=\"classic\"] .card .icon{position:absolute;top:23px;right:20px;width:43px;height:43px;margin:0;border:1px dashed currentColor;border-radius:50%;font-size:22px;color:var(--accent);background:none;box-shadow:none}\nhtml[data-design=\"classic\"] .card h3{font-size:21px;line-height:1.35;margin:26px 0 9px}\nhtml[data-design=\"classic\"] .card p{flex:1;color:#5d5140;padding:0;font-size:14px;line-height:1.7}\nhtml[data-design=\"classic\"] .card .enter{position:static;width:100%;margin-top:18px;border-top:1px dashed #bcb094;padding-top:12px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--accent)}\nhtml[data-design=\"classic\"] .card .enter span{width:26px;height:26px;margin:0;transition:none}\nhtml[data-design=\"classic\"] .card:hover .enter span{transform:none;background:var(--accent);color:var(--post-paper)}\nhtml[data-design=\"classic\"] .modal-card{color:#241d12;background:var(--post-paper);border:0;border-radius:4px}\nhtml[data-design=\"classic\"] .modal-card p{color:#5d5140}\nhtml[data-design=\"classic\"] .modal-close{color:var(--post-cream);background:var(--post-ink);border-radius:4px}\nhtml[data-design=\"classic\"] footer{color:var(--post-muted);padding:16px 0 0;border-top:1px solid #ffffff24;line-height:1.6}\nhtml[data-design=\"classic\"] :is(.page,.modal-card) :focus-visible{outline:2px solid #e7b98f;outline-offset:4px}\n@media(max-width:760px){\n  html[data-design=\"classic\"] .page{width:calc(100% - 36px)}\n  html[data-design=\"classic\"] .top{gap:12px}\n  html[data-design=\"classic\"] .hero{padding:40px 0 30px}\n  html[data-design=\"classic\"] .sites{grid-template-columns:1fr;gap:14px}\n  html[data-design=\"classic\"] .card{min-height:0;padding:25px 18px 14px}\n  html[data-design=\"classic\"] .card h3{margin:16px 0 6px}\n  html[data-design=\"classic\"] .card .icon{top:17px;right:15px;width:36px;height:36px;font-size:18px}\n  html[data-design=\"classic\"] .card .enter{margin-top:12px;padding-top:9px}\n}\n@media(prefers-reduced-motion:reduce){html[data-design=\"classic\"] .card{transition:none}}","note":"html[data-design=\"classic\"][data-astra-site=\"note\"]{--muted:#a8b7ce;--post-border:#ffffff24;--post-gold:#e7b98f;--post-rule:#c9bd9c}\n.note-slug-row{display:flex;gap:10px;min-width:0}\n.note-slug-row .slug-input{min-width:0;flex:1}\n.note-card-caption{display:none}\n.note-slug-error{margin:10px 0 0;font-size:13px;color:var(--seal);line-height:1.5}\n.note-slug-error:empty{display:none}\n#randomBtn{padding:8px 12px;border-radius:4px;background:#e2d5b9;color:#4c4433;white-space:nowrap;font-size:13px}\nhtml[data-design=\"classic\"] .topnav{width:min(1080px,calc(100% - 64px));min-height:84px;padding:16px 0;border-bottom:1px solid var(--post-border);flex-wrap:wrap;gap:10px;letter-spacing:0}\nhtml[data-design=\"classic\"] .topnav .brand{display:inline-flex;align-items:center;gap:8px;min-height:38px;font-size:15px;letter-spacing:.06em}\nhtml[data-design=\"classic\"] .topnav nav{min-width:0;max-width:100%;gap:8px 14px;flex-wrap:wrap;justify-content:flex-start}\nhtml[data-design=\"classic\"] .topnav nav a{margin:0;display:inline-flex;align-items:center;min-height:38px;color:var(--muted);white-space:nowrap}\nhtml[data-design=\"classic\"] .topnav nav a:is(:hover,[aria-current=\"page\"]){color:var(--text-light);text-decoration:underline;text-underline-offset:4px}\nhtml[data-design=\"classic\"] .design-switch{color:var(--muted)}\nhtml[data-design=\"classic\"] .design-switch select{min-height:38px;border-radius:4px}\nhtml[data-design=\"classic\"] .home-wrap{flex:0 0 auto;width:min(100%,660px);justify-content:flex-start;padding:clamp(50px,10vh,104px) 18px 60px}\nhtml[data-design=\"classic\"] .telegram-title{font-size:clamp(29px,5vw,48px);line-height:1.24;margin:0;text-wrap:balance}\nhtml[data-design=\"classic\"] .telegram-sub{margin:12px 0 28px;font-size:14px;line-height:1.75;text-wrap:pretty}\nhtml[data-design=\"classic\"] .telegram-card{width:min(100%,480px);padding:31px 28px 25px;border-radius:3px}\nhtml[data-design=\"classic\"] .perforation{height:9px;background:radial-gradient(circle at 8px 0,var(--ink) 5px,transparent 5.6px) 0 0/16px 9px repeat-x}\nhtml[data-design=\"classic\"] .note-card-caption{display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:0 0 12px;border-bottom:1px dashed var(--post-rule);color:#a13d33;font:700 11px var(--font-mono);letter-spacing:.09em}\nhtml[data-design=\"classic\"] .note-card-caption strong{font:650 16px var(--font-body);color:var(--text-dark);letter-spacing:.06em}\nhtml[data-design=\"classic\"] .telegram-card label{margin:18px 0 7px;font:600 13px var(--font-body);letter-spacing:0}\nhtml[data-design=\"classic\"] .slug-input{min-height:44px;font-size:16px;border-width:1px}\nhtml[data-design=\"classic\"] #randomBtn:hover{background:#d8c9aa}\nhtml[data-design=\"classic\"] :is(.go-btn,.note-check-card button){min-height:44px;border-radius:4px;letter-spacing:.07em;font:600 14px var(--font-body)}\nhtml[data-design=\"classic\"] .telegram-card .go-btn{margin-top:18px}\nhtml[data-design=\"classic\"] .home-hint{margin:17px 0 0;font-size:13px;line-height:1.7;color:var(--muted)}\nhtml[data-design=\"classic\"] .note-check-home-entry{display:flex;align-items:center;min-height:40px;margin:10px 0 0;color:var(--post-gold);text-underline-offset:4px}\nhtml[data-design=\"classic\"] .note-wrap{padding:16px 0 44px}\nhtml[data-design=\"classic\"] :is(.note-bar,.paper-page,.settings-panel,.security-summary){width:min(880px,calc(100% - 36px))}\nhtml[data-design=\"classic\"] .note-bar{padding:8px 0 12px;gap:10px 14px}\nhtml[data-design=\"classic\"] .postmark{min-width:0;max-width:100%;border-color:#ffffff55;border-radius:4px;overflow-wrap:anywhere}\nhtml[data-design=\"classic\"] .postmark .dot{flex:none;background:#87bfad}\nhtml[data-design=\"classic\"] .note-actions{flex-wrap:wrap;gap:8px}\nhtml[data-design=\"classic\"] .icon-btn{border:1px solid var(--post-border);border-radius:4px;min-height:38px;padding:7px 12px}\nhtml[data-design=\"classic\"] .paper-page{min-height:0;border-radius:3px;display:flex;flex-direction:column}\nhtml[data-design=\"classic\"] .paper-page textarea{display:block;min-height:52vh;padding:24px clamp(18px,4vw,42px);font-size:16px;line-height:1.85}\nhtml[data-design=\"classic\"] .paper-page:focus-within{outline:2px solid var(--post-gold);outline-offset:2px}\nhtml[data-design=\"classic\"] .save-status{position:static;max-width:none;min-height:35px;padding:9px 0;margin:0 clamp(16px,4vw,40px);border-top:1px dashed var(--post-rule);color:#665942;text-align:right;overflow-wrap:anywhere}\nhtml[data-design=\"classic\"] .security-summary{margin:12px 0 0}\nhtml[data-design=\"classic\"] .settings-panel{padding:18px clamp(16px,4vw,26px);border:1px solid var(--post-border)}\nhtml[data-design=\"classic\"] .settings-panel .burn-warning,html[data-design=\"classic\"] .settings-panel .security-error{color:#f5a294}\nhtml[data-design=\"classic\"] .settings-panel .apply{min-height:40px}\nhtml[data-design=\"classic\"] .gate-wrap{padding-top:54px}\nhtml[data-design=\"classic\"] :is(.gate-card,.fb-card,.note-check-card){border-radius:4px}\nhtml[data-design=\"classic\"] .gate-card .go-btn{margin-top:6px}\nhtml[data-design=\"classic\"] .gate-card .security-error{color:#a13d33}\nhtml[data-design=\"classic\"] .note-check-wrap{margin:clamp(36px,8vh,72px) auto 50px}\nhtml[data-design=\"classic\"] .note-check-card{box-shadow:0 18px 34px -22px #000c}\nhtml[data-design=\"classic\"] .note-check-card button{background:var(--ink)}\nhtml[data-design=\"classic\"] .note-check-card button:hover{background:var(--teal-dark)}\nhtml[data-design=\"classic\"] .note-check-back,html[data-design=\"classic\"] .gate-card a{text-decoration:underline;text-underline-offset:4px}\nhtml[data-design=\"classic\"] #app :focus-visible{outline:2px solid var(--post-gold);outline-offset:3px}\nhtml[data-design=\"classic\"] #app :is(.telegram-card,.gate-card,.fb-card,.note-check-card) :focus-visible{outline-color:var(--teal-dark)}\nhtml[data-design=\"classic\"] #app .paper-page textarea:focus-visible{outline:none}\n@media(max-width:620px){\n  html[data-design=\"classic\"] .topnav{width:calc(100% - 36px);padding:9px 0 11px;gap:4px 12px}\n  html[data-design=\"classic\"] .topnav nav{width:100%;gap:5px 11px}\n  html[data-design=\"classic\"] .topnav nav a{font-size:12px}\n  html[data-design=\"classic\"] .design-switch{margin-left:auto}\n  html[data-design=\"classic\"] .design-switch>span{display:none}\n  html[data-design=\"classic\"] .design-switch select{min-width:68px;padding-right:17px}\n  html[data-design=\"classic\"] .home-wrap{padding-top:44px}\n  html[data-design=\"classic\"] .telegram-title{word-break:keep-all}\n  html[data-design=\"classic\"] .telegram-card{padding:26px 17px 20px}\n  html[data-design=\"classic\"] .paper-page textarea{min-height:40vh}\n}\n@media(prefers-reduced-motion:reduce){html[data-design=\"classic\"] #app *{transition:none}}"};
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const MARKER = '<!-- CLASSIC POST 20261111 -->';
const cssFor = site => typeof classicPostAssets === 'undefined'
  ? fs.readFileSync(path.join(__dirname, `../design/classic-post-${site}.css`), 'utf8').trim()
  : classicPostAssets[site];

function replaceOne(html, old, next) {
  const at = html.indexOf(old);
  if (at === -1 || html.indexOf(old, at + old.length) !== -1) {
    throw Error(`Unrecognized page: expected one ${JSON.stringify(old.slice(0, 72))}`);
  }
  return html.slice(0, at) + next + html.slice(at + old.length);
}

function patch(site, html) {
  if (!['cla', 'note'].includes(site) || !html.includes(`data-astra-site="${site}"`)) {
    throw Error(`Unexpected page for ${site}`);
  }
  if (html.includes(MARKER)) return html;
  const start = '<script id="astra-theme">';
  const themeAt = html.indexOf(start);
  const themeEnd = html.indexOf('</script>', themeAt);
  if (themeAt < 0 || themeEnd < 0) throw Error(`Missing theme script for ${site}`);
  let theme = html.slice(themeAt, themeEnd);
  theme = replaceOne(theme, "var selected = 'astra';", "var selected = 'classic';");
  if (site === 'cla') {
    // The former default is not a CLA classic preference. Store new choices separately.
    theme = replaceOne(theme, "'lernicks_design_v1'", "'lernicks_cla_design_v2'");
    theme = replaceOne(theme, "[['astra', '新版'], ['original', '原版']]", "[['classic', '经典'], ['astra', '浅色'], ['original', '科技']]");
    theme = replaceOne(theme, ': oldColor);', ": (value === 'classic' ? '#12203a' : oldColor));");
    html = replaceOne(html, '<main class="sites">', '<div class="cla-index-line" aria-hidden="true"><strong>班级工具</strong><span>CLASS TOOLS / 01–03</span></div>\n    <main class="sites" aria-label="班级工具">');
  } else {
    const homeAt = html.indexOf('  function home(){');
    const homeEnd = html.indexOf('  async function open(', homeAt);
    if (homeAt < 0 || homeEnd < 0) throw Error('Unrecognized note homepage');
    let home = html.slice(homeAt, homeEnd);
    const old = home;
    home = replaceOne(home, '<div class="home-wrap">', '<main class="home-wrap">');
    home = replaceOne(home, '写点什么，发给需要的人', '写点什么， 发给需要的人');
    home = replaceOne(home, '<div class="perforation"></div>', '<div class="perforation" aria-hidden="true"></div><div class="note-card-caption" aria-hidden="true"><strong>便签入口</strong><span>NOTE ID</span></div>');
    home = replaceOne(home, '笔记代号 · Note ID', '便签代号');
    home = replaceOne(home, '<div style="display:flex;gap:8px;min-width:0">', '<div class="note-slug-row">');
    home = replaceOne(home, 'autocomplete="off" style="min-width:0;flex:1"', 'autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="noteSlugError"');
    home = replaceOne(home, '<button id="randomBtn">🎲 随机</button>', '<button id="randomBtn" type="button">随机代号</button>');
    home = replaceOne(home, '打开 / 创建</button></div>', '打开或创建</button><p class="note-slug-error" id="noteSlugError" role="alert"></p></div>');
    home = replaceOne(home, '设有密码或问题的新便签可用代号打开。使用链接密钥的便签请保存完整分享链接。</p></div>', '设了密码或问题？输入代号即可打开。使用链接密钥的便签需要完整分享链接。</p></main>');
    home = replaceOne(home, "if(s) location.hash = '#/n/' + encodeURIComponent(s);", "if(s) location.hash = '#/n/' + encodeURIComponent(s); else { error.textContent = '请输入代号，或点击随机代号。'; input.setAttribute('aria-invalid', 'true'); input.focus(); }");
    home = replaceOne(home, '    const go =', "    const error = document.getElementById('noteSlugError');\n    const clearError = () => { error.textContent = ''; input.removeAttribute('aria-invalid'); };\n    input.addEventListener('input', clearError);\n    const go =");
    home = replaceOne(home, "input.value = 'note-' + NoteCrypto.random(9);", "input.value = 'note-' + NoteCrypto.random(9); clearError();");
    home = replaceOne(home, "if(e.key === 'Enter') go(); }; input.focus();", "if(e.key === 'Enter' && !e.isComposing) go(); };");
    html = replaceOne(html, old, home);
  }
  // The body changes occur after the theme block and do not affect these offsets.
  html = html.slice(0, themeAt) + theme + html.slice(themeEnd);
  return replaceOne(html, '</head>', `${MARKER}\n<style id="classic-post-style">\n${cssFor(site)}\n</style>\n</head>`);
}

if (require.main === module) {
  const [cla, note, out] = process.argv.slice(2);
  if (!out) throw Error('Usage: node patch-classic-post.cjs CLA_HTML NOTE_HTML OUTPUT_DIR');
  const pages = [['cla', cla], ['note', note]].map(([site, source]) => [site, patch(site, fs.readFileSync(source, 'utf8'))]);
  for (const [site, html] of pages) fs.writeFileSync(path.join(out, `${site}.html`), html);
}
module.exports = { patch };
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
  tmp=$(mktemp "${dest%/*}/.classic-post-XXXXXXXX")
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
