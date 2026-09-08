const fs = require('node:fs');
function patch(html) {
  if (html.includes('https://news.lernicks.cn')) return html;
  const target = '<div class="top-actions">';
  if (!html.includes(target)) throw new Error('无法定位班级中心导航，未修改原文件');
  return html.replace(target, target + '<a class="badge action" href="https://news.lernicks.cn">📰 班级新闻</a>');
}
if (require.main === module) {
  const file = process.argv[2] || '/root/cla/index.html';
  const before = fs.readFileSync(file, 'utf8'), after = patch(before);
  if (before !== after) {
    fs.copyFileSync(file, file + '.before-news-' + Date.now());
    const temp = file + '.news-update-' + process.pid;
    fs.writeFileSync(temp, after, { mode: fs.statSync(file).mode & 0o777 });
    fs.renameSync(temp, file);
  }
  console.log('班级新闻入口已就绪');
}
module.exports = { patch };
