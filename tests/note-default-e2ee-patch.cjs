const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=fs.existsSync(path.join(root,'note-site'))?'note-site/index.html':'public/index.html';
const html=fs.readFileSync(path.join(root,file),'utf8'),{patchHtml,patchClient}=require('../deploy/patch-note-default-e2ee.cjs');
const client=html.match(/<script id="note-security-client">([\s\S]*?)<\/script>/)[1];
assert.ok(client.includes("{ ...m, encrypted:true, content:''"));assert.equal(patchHtml(html),html);assert.equal(patchClient(client),client);
assert.throws(()=>patchClient('unrecognized client'),/Unknown/);assert.throws(()=>patchHtml('<html></html>'),/missing/);
for(const marker of ['note-existence-client','note-crypto','folio-design'])assert.equal(patchHtml(html).match(new RegExp('<script id="'+marker+'">[\\s\\S]*?<\\/script>'))[0],html.match(new RegExp('<script id="'+marker+'">[\\s\\S]*?<\\/script>'))[0]);
console.log('PASS default encryption patch: only new note state defaults encrypted; lookup, crypto, design unchanged; idempotence and unknown client guard.');
