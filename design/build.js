const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.DESIGN_BUILD_ROOT ? path.resolve(process.env.DESIGN_BUILD_ROOT) : path.resolve(__dirname, '..');
const pages = [
  ['main', 'main-site/index.html'], ['cla', 'cla-site/index.html'],
  ['pk', 'pk-redesign-preview/pk.html'], ['sco', 'sco-site/index.html'],
  ['goal', 'goal-site/index.html'], ['note', 'note-site/index.html'],
  ['mk', 'mk-site/index.html'], ['document', 'mk-site/document.html'], ['tbl', 'tbl-site/index.html'],
];
const css = fs.readFileSync(path.join(__dirname, 'astra.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, 'astra-theme.js'), 'utf8');
const baseline = process.env.DESIGN_BUILD_ROOT ? path.join(root, 'design-baseline') : path.join(__dirname, 'baseline');
fs.mkdirSync(baseline, { recursive: true });
const hashes = {};
for (const [site, relative] of pages) {
  const file = path.join(root, relative);
  let html = fs.readFileSync(file, 'utf8');
  const backup = path.join(baseline, site + '.html');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, html);
  hashes[relative] = crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex');
  html = html.replace(/\sdata-astra-site="[^"]*"/g, '').replace('<html lang="zh-CN"', `<html lang="zh-CN" data-astra-site="${site}"`);
  html = html.replace(/<!-- ASTRA HEAD START -->[\s\S]*?<!-- ASTRA HEAD END -->\s*/g, '');
  html = html.replace('</head>', `<!-- ASTRA HEAD START -->\n<style id="astra-style">\n${css}\n</style>\n<script id="astra-theme">\n${js}\n</script>\n<!-- ASTRA HEAD END -->\n</head>`);
  if (site === 'main' && !html.includes('id="astra-main-title"')) {
    html = html.replace(/(<section class="hero">[\s\S]*?)(<h2>[\s\S]*?<\/h2>)/, '$1<div class="legacy-only">$2</div><h2 id="astra-main-title" class="astra-only">随手记下，<br>轻松分享。</h2>');
    const samples = {
      note: '<div class="astra-specimen astra-only" aria-hidden="true"><div class="spec-sheet"><small>NOTE / 01</small>留一张便签，<br>给需要的人。<div class="spec-line"></div><div class="spec-line"></div></div></div>',
      image: '<div class="astra-specimen picture astra-only" aria-hidden="true"><div class="spec-photo"><i class="spec-sun"></i></div><span class="spec-file">image.png ↗</span></div>',
      document: '<div class="astra-specimen document astra-only" aria-hidden="true"><div class="spec-sheet"><small>DOCUMENT / 03</small>文字，也可以很漂亮。<span class="spec-formula">E = mc²</span></div></div>',
    };
    for (const [name, sample] of Object.entries(samples)) html = html.replace(new RegExp(`(<a class="card ${name}"[^>]*>)`), '$1' + sample);
    html = html.replace('<h3>到笔记</h3>', '<h3><span class="legacy-only">到笔记</span><span class="astra-only">便签 · 留下想说的话</span></h3>')
      .replace('<h3>到图床</h3>', '<h3><span class="legacy-only">到图床</span><span class="astra-only">图床 · 分享眼前的画面</span></h3>')
      .replace('<h3>到文档</h3>', '<h3><span class="legacy-only">到文档</span><span class="astra-only">文档 · 让想法成篇</span></h3>');
  }
  if (site === 'pk' && !html.includes('class="astra-arena-nav')) {
    html = html.replace('<div class="dashboard-grid">', '<nav class="astra-arena-nav astra-only" aria-label="擂台赛导航"><a href="#astra-matches">本轮对阵</a><a href="#savedSection">比赛档案</a><a href="https://goal.lernicks.cn">考试目标 ↗</a><a href="https://cla.lernicks.cn">班级中心 ↗</a></nav>\n        <div class="dashboard-grid" id="astra-matches">');
  }
  fs.writeFileSync(file, html);
  console.log(`${site}: ${Buffer.byteLength(html)} bytes`);
}
fs.writeFileSync(path.join(baseline, 'sha256.json'), JSON.stringify(hashes, null, 2) + '\n');
module.exports = { pages };
