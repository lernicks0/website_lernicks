const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const work=process.argv[2];
const pages=[['main','main-site/index.html'],['cla','cla-site/index.html'],['pk','pk-redesign-preview/pk.html'],['sco','sco-site/index.html'],['goal','goal-site/index.html'],['note','note-site/index.html'],['mk','mk-site/index.html'],['document','mk-site/document.html'],['tbl','tbl-site/index.html']];
for(const [site,file] of pages){
 const html=fs.readFileSync(path.join(work,file),'utf8'),before=fs.readFileSync(path.join(work,'design-baseline',site+'.html'),'utf8');
 for(const type of ['script','style']){
  const blocks=text=>[...text.matchAll(new RegExp('<'+type+'\\b([^>]*)>([\\s\\S]*?)<\\/'+type+'>','g'))].filter(m=>!m[1].includes('astra-')).map(m=>m[0]);
  if(JSON.stringify(blocks(html))!==JSON.stringify(blocks(before)))throw Error('Original '+type+' changed: '+site);
 }
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
 if(!html.includes('data-astra-site="'+site+'"')||!html.includes("['astra', '新版']"))throw Error('Design missing: '+site);
}
console.log('All nine pages validated; existing scripts and CSS preserved.');
