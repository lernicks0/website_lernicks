#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
if ! command -v node >/dev/null; then
  set +eu
  export NVM_DIR=/root/.nvm
  [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
  set -Eeuo pipefail
fi
exec 9>/root/.classic-class-tools.lock
flock -n 9
work=$(mktemp -d /root/.classic-class-tools-XXXXXXXX)
trap 'rm -f -- "$work/install.cjs"; rmdir -- "$work"' EXIT
cat > "$work/install.cjs" <<'CLASSIC_TOOLS_SOURCE'
const bundledToolsCss = "html.astra[data-design=\"classic\"][data-astra-site] {\n  --bg:#12203a; --page:var(--bg); --text:#eee6d3; --muted:#a8b7ce;\n  --line:#ffffff24; --border:var(--line); --border-light:#ffffff43;\n  --paper:#f4ecd8; --paper-light:#fff8e7; --paper-ink:#241d12;\n  --paper-muted:#635641; --paper-line:#c9bd9c; --post-gold:#e7b98f;\n  --a-paper:#1d2d48; --a-soft:#263a59; --a-ink:var(--bg);\n  --a-accent:var(--post-gold); --a-on-accent:#241d12;\n  --surface:var(--a-paper); --surface-2:var(--a-soft); --surface-3:var(--a-soft);\n  --panel:var(--a-paper); --panel2:var(--a-soft); --muted-2:var(--muted);\n  --cyan:#aad9cb; --green:#a0d0b9; --gold:var(--post-gold); --red:#ffa99d;\n  --purple:#dfc9ec; --amber:var(--post-gold); --blue:#adc9ef;\n  --stamp:#2c615a;\n  color-scheme:dark;\n}\nhtml.astra[data-design=\"classic\"][data-astra-site=\"pk\"] { --stamp:#933f36; }\nhtml.astra[data-design=\"classic\"][data-astra-site=\"goal\"] { --stamp:#6b507f; }\n\nhtml.astra[data-design=\"classic\"] :is(.app,.topbar,.container,.site-credit) { max-width:1080px; }\nhtml.astra[data-design=\"classic\"] :is(.app,.topbar) { padding-top:18px; }\nhtml.astra[data-design=\"classic\"] :is(.brand-caption,.brand p,.brand .subtitle,.hero-kicker,.eyebrow,.surface-eyebrow) {\n  font-family:Consolas,\"Courier New\",monospace;\n  letter-spacing:.09em;\n}\nhtml.astra[data-design=\"classic\"] .mark {\n  color:var(--post-gold); background:none; border:1px dashed #e7b98f91; border-radius:50%;\n}\nhtml.astra[data-design=\"classic\"] :is(.topbar,.app>header) { border-color:var(--line); }\nhtml.astra[data-design=\"classic\"] .hero { align-items:center; }\nhtml.astra[data-design=\"classic\"] .hero h2 span { color:var(--post-gold); }\nhtml.astra[data-design=\"classic\"] :is(.btn,.design-switch select,.security-tools button) { border-radius:4px; }\nhtml.astra[data-design=\"classic\"] .actions :is(.btn,.mode) { white-space:nowrap; }\nhtml.astra[data-design=\"classic\"] .actions>a.btn { display:inline-flex; align-items:center; }\n\nhtml.astra[data-design=\"classic\"] :is(.stats,.student,.surface,.saved-section,.win-section,.dialog,.dlg-box,.gate-card) {\n  --a-paper:var(--paper); --a-soft:#eee1c5; --text:var(--paper-ink); --muted:var(--paper-muted);\n  --a-accent:var(--stamp); --a-on-accent:#fff8e7; --line:var(--paper-line);\n  --border:var(--paper-line); --border-light:var(--paper-line);\n  --surface:var(--paper); --surface-2:#eee1c5; --surface-3:#e6d7b6;\n  --panel:var(--paper); --panel2:#eee1c5; --muted-2:var(--paper-muted);\n  --cyan:var(--stamp); --green:#29624c; --gold:#795521; --red:#92362e; --purple:#674878;\n  --amber:#795521; --blue:#315674;\n  background:var(--paper); color:var(--paper-ink); border-radius:4px;\n  color-scheme:light;\n}\nhtml.astra[data-design=\"classic\"] .stats {\n  background:radial-gradient(circle at 8px 0,var(--bg) 5px,transparent 5.6px) 0 0/16px 9px repeat-x,var(--paper);\n  border:0; padding:12px 10px 3px; align-self:stretch; gap:0;\n}\nhtml.astra[data-design=\"classic\"] .stat { color:var(--paper-muted); padding:10px 14px; min-height:68px; }\nhtml.astra[data-design=\"classic\"] .stat strong { color:var(--stamp); }\nhtml.astra[data-design=\"classic\"] .students { gap:12px; }\nhtml.astra[data-design=\"classic\"] .student { padding:14px 16px; border:1px solid var(--paper-line); }\nhtml.astra[data-design=\"classic\"] .student:hover { background:var(--paper-light); }\nhtml.astra[data-design=\"classic\"] .dialog :is(.field,.btn:not(.primary):not(.danger)),\nhtml.astra[data-design=\"classic\"] :is(.dlg-box,.gate-card) input { background:var(--paper-light); color:var(--paper-ink); }\nhtml.astra[data-design=\"classic\"] .dialog .close { color:var(--paper-ink); }\nhtml.astra[data-design=\"classic\"] .help-step strong { color:var(--stamp); }\n\nhtml.astra[data-design=\"classic\"][data-astra-site=\"pk\"] :is(.surface,.saved-section,.win-section) {\n  background:var(--paper); border:0; border-radius:4px; padding:22px;\n}\nhtml.astra[data-design=\"classic\"][data-astra-site=\"pk\"] .roster-surface {\n  padding-top:27px;\n  background:radial-gradient(circle at 8px 0,var(--bg) 5px,transparent 5.6px) 0 0/16px 9px repeat-x,var(--paper);\n}\nhtml.astra[data-design=\"classic\"] .surface-count { color:var(--stamp); background:var(--a-soft); }\nhtml.astra[data-design=\"classic\"] .pk-result-area { background:transparent; border-color:var(--paper-line); box-shadow:none; }\nhtml.astra[data-design=\"classic\"][data-astra-site=\"pk\"] .name-btn:hover { color:var(--paper-ink); background:var(--paper-light); }\nhtml.astra[data-design=\"classic\"][data-astra-site=\"pk\"] .name-btn.sel { color:#fff8e7; background:var(--stamp); border-color:var(--stamp); }\nhtml.astra[data-design=\"classic\"] .status-bar .selected-name { color:var(--post-gold); background:var(--a-soft); }\nhtml.astra[data-design=\"classic\"] .site-credit { color:var(--muted); }\n\n@media (max-width:600px) {\n  html.astra[data-design=\"classic\"] :is(.app,.topbar,.container,.site-credit) { width:calc(100% - 28px); }\n  html.astra[data-design=\"classic\"] :is(.app>header,.topbar) { gap:12px; }\n  html.astra[data-design=\"classic\"] .hero h2 { font-size:clamp(25px,8vw,36px); }\n  html.astra[data-design=\"classic\"] .toolbar { flex-wrap:wrap; }\n  html.astra[data-design=\"classic\"] .toolbar-left { flex-wrap:wrap; width:100%; }\n  html.astra[data-design=\"classic\"] .toolbar :is(.search,select) { min-width:0; max-width:100%; }\n  html.astra[data-design=\"classic\"][data-astra-site=\"pk\"] :is(.surface,.saved-section,.win-section) { padding:16px; }\n  html.astra[data-design=\"classic\"][data-astra-site=\"pk\"] .roster-surface { padding-top:22px; }\n}";
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const marker = '<!-- CLASSIC CLASS TOOLS 20261111 -->';
const sites = [
  { name: 'pk', file: '/root/pk/pk.html', port: 1145, route: '/pk.html' },
  { name: 'sco', file: '/root/sco/index.html', port: 1146, route: '/index.html' },
  { name: 'goal', file: '/root/goal/index.html', port: 1152, route: '/index.html' },
];
const css = typeof bundledToolsCss === 'undefined'
  ? fs.readFileSync(path.join(__dirname, '../design/classic-post-tools.css'), 'utf8').trim()
  : bundledToolsCss;

function replaceOne(source, oldText, newText) {
  const index = source.indexOf(oldText);
  assert.ok(index >= 0 && source.indexOf(oldText, index + oldText.length) < 0,
    `Unrecognized page, expected one occurrence of ${oldText}`);
  return source.slice(0, index) + newText + source.slice(index + oldText.length);
}

function patch(name, html) {
  assert.ok(html.includes(`data-astra-site="${name}"`), `Wrong page for ${name}`);
  if (html.includes(marker)) return html;
  const begin = html.indexOf('<script id="astra-theme">');
  const end = html.indexOf('</script>', begin);
  assert.ok(begin >= 0 && end > begin, `Missing theme script for ${name}`);
  let theme = html.slice(begin, end);
  theme = replaceOne(theme, "[['astra', '新版'], ['original', '原版']]", "[['classic', '经典'], ['astra', '浅色'], ['original', '科技']]");
  theme = replaceOne(theme, "var selected = 'astra';", "var selected = 'classic';");
  theme = replaceOne(theme, "'lernicks_design_v1'", "'lernicks_class_design_v2'");
  theme = replaceOne(theme, "root.classList.toggle('astra', value === 'astra');", "root.classList.toggle('astra', value !== 'original');");
  theme = replaceOne(theme, "value === 'astra' ? '#f6f7f9'", "value === 'classic' ? '#12203a' : value === 'astra' ? '#f6f7f9'");
  html = html.slice(0, begin) + theme + html.slice(end);
  return replaceOne(html, '</head>', `${marker}\n<style id="classic-class-tools">\n${css}\n</style>\n</head>`);
}

function replaceFile(file, content, stat) {
  const directory = fs.mkdtempSync(path.join(path.dirname(file), '.classic-tools-'));
  const temporary = path.join(directory, 'page.html');
  try {
    fs.writeFileSync(temporary, content);
    fs.chownSync(temporary, stat.uid, stat.gid);
    fs.chmodSync(temporary, stat.mode & 0o777);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    fs.rmdirSync(directory);
  }
}

async function install(mode) {
  assert.ok(mode === '--check' || mode === '--apply', 'Use --check or --apply');
  assert.equal(process.getuid(), 0, 'Run with sudo');
  const pages = sites.map(site => {
    const stat = fs.statSync(site.file);
    assert.ok(stat.isFile() && fs.realpathSync(site.file) === site.file, `Unexpected path ${site.file}`);
    const before = fs.readFileSync(site.file, 'utf8');
    return { ...site, stat, before, after: patch(site.name, before) };
  });
  if (mode === '--check') {
    console.log('CLASSIC_TOOLS_CHECK_SUCCESS pk sco goal');
    return;
  }
  const changed = pages.filter(page => page.before !== page.after);
  if (!changed.length) {
    console.log('CLASSIC_TOOLS_ALREADY_INSTALLED');
    return;
  }
  const backup = fs.mkdtempSync('/root/classic-tools-code-backup-');
  for (const page of changed) fs.copyFileSync(page.file, path.join(backup, `${page.name}.html`));
  const written = [];
  try {
    for (const page of changed) {
      assert.equal(fs.readFileSync(page.file, 'utf8'), page.before, `${page.name} changed after staging`);
      replaceFile(page.file, page.after, page.stat);
      written.push(page);
    }
    await Promise.all(pages.map(async page => {
      const response = await fetch(`http://127.0.0.1:${page.port}${page.route}`, {
        headers: { host: `${page.name}.lernicks.cn`, 'x-forwarded-proto': 'https' },
        signal: AbortSignal.timeout(10000),
      });
      assert.ok(response.ok && (await response.text()).includes(marker), `${page.name} failed origin verification`);
    }));
  } catch (error) {
    for (const page of written.reverse()) {
      try { replaceFile(page.file, page.before, page.stat); }
      catch (restoreError) { console.error(`Could not restore ${page.file}`, restoreError.message); }
    }
    throw Error(`Install failed; backup=${backup}`, { cause: error });
  }
  console.log(`CLASSIC_TOOLS_INSTALL_SUCCESS backup=${backup}`);
}

if (require.main === module) {
  install(process.argv[2] || '--check').catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { patch };
CLASSIC_TOOLS_SOURCE
node "$work/install.cjs" "${1:---check}"
