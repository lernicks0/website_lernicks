// Read an existing Nginx site file and stage only tbl's HTTP challenge and HTTPS virtual host.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function tokens(source){
 const result=[],pattern=/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{};]|[^\s{};#]+/g;
 for(const m of source.matchAll(pattern))if(!m[0].startsWith('#'))result.push({value:m[0],start:m.index,end:m.index+m[0].length});
 return result;
}
function prepare(source){
 assert.ok(!source.includes('# tbl-direct-acme-20261101'),'Challenge configuration already exists; inspect before reinstalling');
 const all=tokens(source),matches=[];
 for(let i=0;i<all.length-1;i++)if(all[i].value==='server'&&all[i+1].value==='{'){
  let depth=1,j=i+2,names=[],nameEnd=-1;
  for(;j<all.length&&depth;j++){
   if(all[j].value==='{')depth++;else if(all[j].value==='}')depth--;
   else if(depth===1&&all[j].value==='server_name'){
    names=[];for(let k=j+1;k<all.length&&all[k].value!==';';k++)names.push(all[k].value);
    const end=all.slice(j+1).find(t=>t.value===';');assert.ok(end);nameEnd=end.end;
   }
  }
  assert.equal(depth,0,'Unbalanced Nginx block');
  if(names.includes('tbl.lernicks.cn'))matches.push({start:all[i].start,end:all[j-1].end,names,nameEnd});
 }
 assert.equal(matches.length,1,'Expected one existing tbl virtual host');const target=matches[0];
 assert.deepEqual(target.names,['tbl.lernicks.cn'],'Refuse to change a shared virtual host');
 const original=source.slice(target.start,target.end);
 assert.ok(!original.includes('acme-challenge'),'Existing ACME handling needs inspection');
 assert.equal((original.match(/\blisten\s+80\s*;/g)||[]).length,1,'Expected plain port 80');
 assert.equal((original.match(/\blisten\s+/g)||[]).length,1,'Unexpected additional listeners');
 assert.ok(/proxy_pass\s+http:\/\/127\.0\.0\.1:1148\s*;/.test(original),'Unexpected tbl upstream');
 const challenge='\n\n    # tbl-direct-acme-20261101\n    location ^~ /.well-known/acme-challenge/ {\n        root /var/www/tbl-acme;\n        default_type text/plain;\n        try_files $uri =404;\n    }';
 const at=target.nameEnd;
 const http=source.slice(0,at)+challenge+source.slice(at);
 assert.equal(http.replace(challenge,''),source,'Unrelated HTTP configuration changed');
 let tls=original.replace(/\blisten\s+80\s*;/,'listen 443 ssl http2;');
 const cert='\n    ssl_certificate /etc/letsencrypt/live/tbl.lernicks.cn/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/tbl.lernicks.cn/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_session_cache shared:TBL_TLS:4m;\n    ssl_session_timeout 1d;\n    ssl_session_tickets off;';
 tls=tls.replace(/server_name\s+tbl\.lernicks\.cn\s*;/,m=>m+cert+challenge);
 // Direct visitors cannot spoof the Cloudflare client-IP header used by the app's rate limiter.
 assert.equal((tls.match(/proxy_set_header\s+X-Real-IP\s+\$remote_addr\s*;/g)||[]).length,1);
 tls=tls.replace(/proxy_set_header\s+X-Real-IP\s+\$remote_addr\s*;/,m=>m+'\n        proxy_set_header CF-Connecting-IP "";');
 return {http,tls:'# tbl-direct-https-20261101\n'+tls+'\n'};
}
module.exports={prepare,tokens};
if(require.main===module){
 const [input,stage]=process.argv.slice(2);assert.ok(input&&stage);
 assert.equal(fs.realpathSync(input),path.resolve(input),'Use the resolved site configuration path');
 const source=fs.readFileSync(input,'utf8'),result=prepare(source);
 fs.mkdirSync(stage,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(stage,'http.conf'),result.http);fs.writeFileSync(path.join(stage,'https.conf'),result.tls);
 fs.writeFileSync(path.join(stage,'source.sha256'),crypto.createHash('sha256').update(source).digest('hex')+'\n');
 console.log('STAGED: HTTP ACME challenge only; separate tbl HTTPS host; no HTTP redirect or DNS changes.');
}
