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
