const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {patchHtml,patchServer}=require('../deploy/patch-tbl-speed.cjs');
const root=path.resolve(__dirname,'..'),source=path.join(root,fs.existsSync(path.join(root,'tbl-site'))?'tbl-site':'tbl');
const client=fs.readFileSync(path.join(source,'speed-client.js'),'utf8');
const live=fs.readFileSync(path.join(root,'test-fixtures/tbl-speed-baseline/index.html'),'utf8');
const before=fs.readFileSync(path.join(root,'test-fixtures/tbl-speed-baseline/server.js'),'utf8');
const delivery=fs.readFileSync(path.join(root,'deploy/tbl-speed-assets/original-delivery.txt'),'utf8');
const html=patchHtml(live,client);assert.equal(patchHtml(html,client),html);
const server=patchServer(before,delivery);assert.equal(patchServer(server,delivery),server);
assert.equal(patchServer(before.replace(/\r\n/g,'\n'),delivery).replace(/\r\n/g,'\n'),server.replace(/\r\n/g,'\n'));
assert.throws(()=>patchHtml(live.replace('function uploadSelected(){','function customUpload(){'),client),/context differs/);
assert.throws(()=>patchServer(before.replace('const isInlineMedia =','const customMedia ='),delivery),/context differs/);
for(const marker of ['<!-- FOLIO START -->','<!-- ASTRA']){
 const block=source=>source.match(marker==='<!-- FOLIO START -->'?/<!-- FOLIO START -->[\s\S]*?<!-- FOLIO END -->/:/<!-- ASTRA[^]*?<!-- ASTRA[^]*?END[^]*?-->/)?.[0];
 if(block(live))assert.equal(block(live),block(html));
}
assert.ok(server.includes("path.join(ROOT_DIR, 'uploads')"));assert.ok(server.includes("path.join(DATA_DIR, 'images.json')"));
console.log('PASS: live HTML and current remote server patch, LF/CRLF, idempotency, preserve design and data paths, stop on unfamiliar code');
