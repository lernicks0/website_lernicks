'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), vm = require('node:vm'), crypto = require('node:crypto');
const digest = s => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
function patchHtml(html, assets) {
  if(html.includes('id="note-security-client"')) {
    assert.ok(html.includes(assets.client.trim()) && html.includes(assets.crypto.trim()) && html.includes(assets.css.trim()), 'Different note security version installed'); return html;
  }
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  const business = scripts.filter(m => m[1].includes("const app = document.getElementById('app');") && m[1].includes('function renderNote(slug)'));
  assert.equal(business.length, 1, 'Cannot identify old note client');
  assert.equal(digest(business[0][1].trim()), assets.clientHash.trim(), 'Note client changed; review before patching');
  html = html.replace(business[0][0], `<script id="note-crypto">\n${assets.crypto.trim()}\n</script>\n<script id="note-security-client">\n${assets.client.trim()}\n</script>`);
  assert.equal(html.split('</head>').length, 2);
  html = html.replace('</head>', `<meta name="referrer" content="no-referrer">\n<style id="note-security-style">\n${assets.css.trim()}\n</style>\n</head>`);
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  return html;
}
function patchServer(server, expectedHash, sections) {
  if(server.includes("require('./note-security.cjs').install")) return server;
  const start = server.indexOf('// 查询笔记基本信息'), end = server.indexOf('// ---------- 反馈 API ----------');
  assert.ok(start > 0 && end > start, 'Cannot identify old note routes');
  assert.equal(digest(server.slice(start, end).trim()), expectedHash.trim(), 'Note routes changed; review before patching');
  // Remove the obsolete store, delayed writer, tokens and routes; feedback stays intact.
  server = server.slice(0, start) + "require('./note-security.cjs').install(app, { dataDir: DATA_DIR });\n\n" + server.slice(end);
  server = server.replace(/^const NOTES_FILE = .*\r?\n/m, '');
  server = server.replace(/^let notes = loadJson\(NOTES_FILE[^\n]*\r?\n/m, '');
  const persistStart = server.indexOf('let saveTimerNotes = null;'), persistEnd = server.indexOf('let saveTimerFeedback = null;');
  assert.ok(persistStart > 0 && persistEnd > persistStart);
  assert.equal(digest(server.slice(persistStart,persistEnd)),sections.persist,'Note writer changed; review before patching');
  server = server.slice(0,persistStart) + server.slice(persistEnd);
  const tokenStart = server.indexOf('// 内存中维护'), tokenEnd = server.indexOf('app.use(express.json');
  assert.ok(tokenStart > 0 && tokenEnd > tokenStart);
  assert.equal(digest(server.slice(tokenStart,tokenEnd)),sections.tokens,'Note authentication changed; review before patching');
  server = server.slice(0,tokenStart) + server.slice(tokenEnd);
  server = server.replace("app.use(express.json({ limit: '2mb' }));", "app.use(express.json({ limit: '4mb' }));");
  assert.ok(!server.includes('persistNotes') && !server.includes('unlockTokens') && !server.includes('NOTES_FILE'));
  new vm.Script(server); return server;
}
module.exports = { patchHtml, patchServer, digest };
if(require.main === module){
  const [live, stage, assetDir] = process.argv.slice(2);
  const read = name => fs.readFileSync(path.join(assetDir, name), 'utf8');
  for(const name of ['server.js','public/index.html']) assert.equal(fs.realpathSync(path.join(live,name)), path.resolve(live,name));
  const html = patchHtml(fs.readFileSync(path.join(live,'public/index.html'),'utf8'), {client:read('security-client.js'), crypto:read('note-crypto.js'), css:read('security.css'), clientHash:read('client.sha256')});
  const server = patchServer(fs.readFileSync(path.join(live,'server.js'),'utf8'), read('routes.sha256'),JSON.parse(read('sections.json')));
  fs.mkdirSync(path.join(stage,'public'),{recursive:true});
  fs.writeFileSync(path.join(stage,'public/index.html'),html); fs.writeFileSync(path.join(stage,'server.js'),server);
  fs.copyFileSync(path.join(assetDir,'note-security.cjs'),path.join(stage,'note-security.cjs'));
}
