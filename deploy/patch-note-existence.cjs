'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
function patch(html,client,css){
 const block=`<!-- NOTE EXISTENCE START -->\n<style id="note-existence-style">${css}</style>\n<script id="note-existence-client">\n${client.trim()}\n</script>\n<!-- NOTE EXISTENCE END -->\n`;
 if(html.includes('id="note-existence-client"')){
  if(html.includes(client.trim()) && html.includes(css))return html;
  const matches=[...html.matchAll(/<!-- NOTE EXISTENCE START -->[\s\S]*?<!-- NOTE EXISTENCE END -->\r?\n/g)];
  assert.equal(matches.length,1,'Cannot identify existence block');
  const previous=matches[0][0],hash=crypto.createHash('sha256').update(previous.replace(/\r\n/g,'\n')).digest('hex');
  assert.equal(hash,'124ad751588cb076959d0326d0bd16057fe160973d81a1739965d9d2c8b7d74e','Different existence client installed');
  const result=html.replace(previous,()=>block);assert.equal(result.replace(block,()=>previous),html,'Existing page changed');
  new vm.Script(client);return result;
 }
 assert.ok(html.includes('id="note-security-client"'),'Security release must be installed first');
 assert.equal(html.split('</body>').length,2);
 const result=html.replace('</body>',()=>block+'</body>');
 assert.equal(result.replace(block,''),html,'Existing page changed');
 new vm.Script(client);
 return result;
}
module.exports={patch};
if(require.main===module){const[live,out,client,css]=process.argv.slice(2);assert.equal(fs.realpathSync(live),path.resolve(live));fs.writeFileSync(out,patch(fs.readFileSync(live,'utf8'),fs.readFileSync(client,'utf8'),fs.readFileSync(css,'utf8')));}
