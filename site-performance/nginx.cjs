// 在已有配置中只为本站 server 块添加压缩设置，保留证书、转发和缓存策略。
const allowed = new Set(['lernicks.cn','www.lernicks.cn', ...['note','mk','tbl','cla','pk','sco','goal','news'].map(s=>s+'.lernicks.cn')]);
const settings = '\n    # lernicks-performance-gzip\n    gzip on;\n    gzip_vary on;\n    gzip_min_length 1024;\n    gzip_comp_level 5;\n    gzip_proxied any;\n    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;\n';
function blocks(text) {
  const result=[],stack=[]; let start=0,quote='',comment=false,escaped=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(comment){if(c==='\n')comment=false;continue;}
    if(escaped){escaped=false;continue;}
    if(c==='\\'){escaped=true;continue;}
    if(quote){if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='#'){comment=true;continue;}
    if(c==='{'){const b={type:text.slice(start,i).replace(/#[^\n]*/g,'').trim(),open:i,children:[]};if(stack.length)stack.at(-1).children.push(b);stack.push(b);start=i+1;}
    if(c===';')start=i+1;
    if(c==='}'){const b=stack.pop();if(!b)throw Error('Nginx braces mismatch');b.close=i;result.push(b);start=i+1;}
  }
  if(stack.length||quote)throw Error('Incomplete Nginx config');return result;
}
function patch(text) {
  const edits=[];
  for(const block of blocks(text).filter(b=>b.type==='server')) {
    let direct=text.slice(block.open+1,block.close);
    for(const child of [...block.children].reverse())direct=direct.slice(0,child.open-block.open-1)+' '.repeat(child.close-child.open+1)+direct.slice(child.close-block.open);
    const uncommented=direct.replace(/#[^\n]*/g,'');
    const names=[...uncommented.matchAll(/\bserver_name\s+([^;]+);/g)].flatMap(m=>m[1].split(/\s+/));
    if(!names.some(n=>allowed.has(n.replace(/["']/g,''))))continue;
    if(direct.includes('# lernicks-performance-gzip'))continue;
    // 已有 gzip 配置保持不动；公开页面仍由 Node 层预压缩。
    if(/\bgzip(?:_\w+)?\s+[^;]+;/.test(uncommented))continue;
    edits.push(block.close);
  }
  for(const i of edits.sort((a,b)=>b-a))text=text.slice(0,i)+settings+text.slice(i);
  return text;
}
module.exports={patch};
