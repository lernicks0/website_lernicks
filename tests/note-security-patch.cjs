'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {patchHtml,patchServer}=require('../deploy/patch-note-security.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base='test-fixtures/note-security-baseline/',source=fs.existsSync(path.join(root,'note-site'))?'note-site':'note-security-source';
const html=read(base+'public/index.html'),server=read(base+'server.js');
const assets={client:read(source+'/security-client.js'),crypto:read(source+'/note-crypto.js'),css:read(source+'/security.css'),clientHash:read('deploy/note-security-assets/client.sha256')};
const hash=read('deploy/note-security-assets/routes.sha256'),sections=JSON.parse(read('deploy/note-security-assets/sections.json'));
const after=patchHtml(html,assets),backend=patchServer(server,hash,sections);
assert.equal(patchHtml(after,assets),after);assert.equal(patchServer(backend,hash,sections),backend);
const current=read(source==='note-site'?'note-site/index.html':'public/index.html').replace(/<!-- NOTE EXISTENCE START -->[\s\S]*?<!-- NOTE EXISTENCE END -->\r?\n/,'');
assert.equal(after.replace(/\r\n/g,'\n'),current.replace(/\r\n/g,'\n'));assert.equal(backend.replace(/\r\n/g,'\n'),read(source==='note-site'?'note-site/server.js':'server.js').replace(/\r\n/g,'\n'));
assert.equal(patchServer(server.replace(/\r\n/g,'\n'),hash,sections).replace(/\r\n/g,'\n'),backend.replace(/\r\n/g,'\n'));
assert.throws(()=>patchHtml(html.replace('function renderGate(root, slug)','function renderGateChanged(root, slug)'),assets),/client changed/);
assert.throws(()=>patchServer(server.replace("const token = crypto.randomBytes(24)","const token = crypto.randomBytes(32)"),hash,sections),/authentication changed/);
assert.throws(()=>patchServer(server.replace('content.slice(0, 500000)','content.slice(0, 400000)'),hash,sections),/routes changed/);
assert.throws(()=>patchServer(server.replace('let saveTimerNotes = null;','let saveTimerNotes = null; // custom'),hash,sections));
for(const pattern of[/<!-- FOLIO START -->[\s\S]*?<!-- FOLIO END -->/,/<style id="astra-theme">[\s\S]*?<\/style>/])assert.equal(after.match(pattern)?.[0],html.match(pattern)?.[0]);
assert.equal(backend.slice(backend.indexOf('// ---------- 反馈 API ----------')),server.slice(server.indexOf('// ---------- 反馈 API ----------')));
assert.ok(backend.includes("require('../site-performance/static.cjs')"));assert.ok(!backend.includes('persistNotes'));
const installer=read('deploy/install-note-security-20261106.sh');
const embedded=[...installer.matchAll(/base64 -d > "\$stage\/assets\/([^\"]+)" <<'NOTE_ASSET'\n([A-Za-z0-9+/=]+)\nNOTE_ASSET/g)];
assert.equal(embedded.length,8);
for(const m of embedded){
 const expected=m[1]==='note-security.cjs'?read(source+'/note-security.cjs'):m[1]==='patch-note-security.cjs'?read('deploy/patch-note-security.cjs'):['client.sha256','routes.sha256','sections.json'].includes(m[1])?read('deploy/note-security-assets/'+m[1]):read(source+'/'+m[1]);
 assert.equal(Buffer.from(m[2],'base64').toString().replace(/\r\n/g,'\n'),expected.replace(/\r\n/g,'\n'),'Embedded asset '+m[1]);
}
console.log('PASS note installer patch: exact known client/auth/writer/routes, LF/CRLF, preserve all design and feedback, idempotence, stop on unknown modifications.');
