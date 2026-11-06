'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
function patch(html,client,css){
 const block=`<!-- NOTE EXISTENCE START -->\n<style id="note-existence-style">${css}</style>\n<script id="note-existence-client">\n${client.trim()}\n</script>\n<!-- NOTE EXISTENCE END -->\n`;
 if(html.includes('id="note-existence-client"')){assert.ok(html.includes(client.trim()) && html.includes(css),'Different existence client installed');return html;}
 assert.ok(html.includes('id="note-security-client"'),'Security release must be installed first');
 assert.equal(html.split('</body>').length,2);
 const result=html.replace('</body>',()=>block+'</body>');
 assert.equal(result.replace(block,''),html,'Existing page changed');
 new vm.Script(client);
 return result;
}
module.exports={patch};
if(require.main===module){const[live,out,client,css]=process.argv.slice(2);assert.equal(fs.realpathSync(live),path.resolve(live));fs.writeFileSync(out,patch(fs.readFileSync(live,'utf8'),fs.readFileSync(client,'utf8'),fs.readFileSync(css,'utf8')));}
