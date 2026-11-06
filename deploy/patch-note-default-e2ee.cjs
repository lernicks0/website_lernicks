'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const changes=[
 ["if (!m.exists) return editor(root, slug, { ...m, content:'', secret:null, password:'', token:null }, current);", "if (!m.exists) return editor(root, slug, { ...m, encrypted:true, content:'', secret:null, password:'', token:null }, current);"],
 ['随写随存，用链接分享。可以设置问题、端到端加密，或留一封阅后即焚的信。','新建便签默认端到端加密，可设置密码、问题或阅后即焚。'],
 ['<span>端到端加密</span>','<span>端到端加密（新便签默认开启）</span>'],
 ['请保存完整链接；刷新后需重新用完整链接打开','请点击“复制链接”保存完整链接；仅有代号无法解密']
];
function patchClient(client){
 for(const[before,after]of changes){
  if(client.includes(after)){assert.ok(!client.includes(before),'Mixed default encryption versions');continue;}
  assert.equal(client.split(before).length,2,'Unknown note client: '+before.slice(0,60));client=client.replace(before,()=>after);
 }
 new vm.Script(client);return client;
}
function patchHtml(html){
 const matches=[...html.matchAll(/(<script id="note-security-client">)([\s\S]*?)(<\/script>)/g)];
 assert.equal(matches.length,1,'Security client missing or duplicated');
 const m=matches[0],body=patchClient(m[2]);return html.replace(m[0],()=>m[1]+body+m[3]);
}
module.exports={patchClient,patchHtml};
if(require.main===module){const[live,out]=process.argv.slice(2);assert.equal(fs.realpathSync(live),path.resolve(live));fs.writeFileSync(out,patchHtml(fs.readFileSync(live,'utf8')));}
