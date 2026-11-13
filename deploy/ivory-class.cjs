'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { install, sites: tools, replaceOne } = require('./classic-post-tools.cjs');
const sites = [{ name: 'cla', file: '/root/cla/index.html', port: 1147, route: '/index.html' }, ...tools];
const marker = '<!-- IVORY CLASS 20261113 -->';
const css = typeof bundledIvoryCss === 'undefined'
  ? fs.readFileSync(path.join(__dirname, '../design/ivory-class.css'), 'utf8').trim()
  : bundledIvoryCss;

function patch(name, html) {
  assert.ok(sites.some(site => site.name === name) && html.includes(`data-astra-site="${name}"`), `Wrong page for ${name}`);
  if (html.includes(marker)) return html;
  const themeStart = html.indexOf('<script id="astra-theme">');
  const themeEnd = html.indexOf('</script>', themeStart);
  assert.ok(themeStart >= 0 && themeEnd > themeStart, `Missing theme script for ${name}`);
  const previous = html.slice(themeStart, themeEnd);
  let theme = replaceOne(previous, "[['classic', '经典'], ['astra', '浅色'], ['original', '科技']]",
    "[['ivory', '米白'], ['classic', '经典'], ['astra', '浅色'], ['original', '科技']]");
  theme = replaceOne(theme, "var selected = 'classic';", "var selected = 'ivory';");
  theme = replaceOne(theme, "if (meta) meta.content = ", "if (meta) meta.content = value === 'ivory' ? '#f7f2e8' : ");
  html = replaceOne(html, previous, theme);

  // Share the classic layout. The new stylesheet changes the palette only.
  const layoutStart = html.indexOf(name === 'cla' ? '<style id="classic-post-style">' : '<style id="classic-class-tools">');
  const layoutEnd = html.indexOf('</style>', layoutStart);
  assert.ok(layoutStart >= 0 && layoutEnd > layoutStart, `Missing classic layout for ${name}`);
  const layout = html.slice(layoutStart, layoutEnd);
  assert.ok(layout.includes('[data-design="classic"]'));
  html = replaceOne(html, layout, layout.replaceAll('[data-design="classic"]', ':is([data-design="classic"],[data-design="ivory"])'));
  return replaceOne(html, '</head>', `${marker}\n<style id="ivory-class-style">\n${css}\n</style>\n</head>`);
}

if (require.main === module) {
  install(process.argv[2] || '--check', { sites, patch, marker, label:'IVORY_CLASS', backup:'ivory-class' })
    .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { patch };
