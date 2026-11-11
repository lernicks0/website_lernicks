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
