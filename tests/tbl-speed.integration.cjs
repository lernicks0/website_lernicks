// Only isolated fixtures. Never writes to the production server or workspace business data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),http=require('node:http');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(root,'deploy/tbl-speed-test-'));
const source=path.join(root,fs.existsSync(path.join(root,'tbl-site'))?'tbl-site':'tbl');
const bytes=Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
let child;
(async()=>{
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 fs.mkdirSync(path.join(dir,'tbl/data'),{recursive:true});fs.mkdirSync(path.join(dir,'tbl/uploads'));fs.mkdirSync(path.join(dir,'site-performance'));
 for(const f of ['server.js','index.html','media-delivery.cjs'])fs.copyFileSync(path.join(source,f),path.join(dir,'tbl',f));
 fs.copyFileSync(path.join(root,'site-performance/static.cjs'),path.join(dir,'site-performance/static.cjs'));
 const records=['image','video','file'].map((kind,i)=>({id:String(i).repeat(20),fileName:`fixture-${i}.bin`,originalName:'示例.dat',mime:kind==='image'?'image/png':kind==='video'?'video/mp4':'application/octet-stream',kind,size:bytes.length,createdAt:new Date().toISOString()}));
 fs.writeFileSync(path.join(dir,'tbl/data/images.json'),JSON.stringify(records));for(const r of records)fs.writeFileSync(path.join(dir,'tbl/uploads',r.fileName),bytes);
 let output='';child=spawn(process.execPath,[path.join(dir,'tbl/server.js')],{env:{...process.env,TBL_PORT:String(port),TBL_MIN_FREE_MB:'0.001'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 const base=`http://127.0.0.1:${port}`;
 for(let n=0;n<50;n++){try{if((await fetch(base+'/api/status')).ok)break}catch(_){}await new Promise(r=>setTimeout(r,50));if(n===49)throw Error(output)}
 const request=(url,options={})=>fetch(base+url,options);
 for(const r of records){
  const url='/i/'+r.fileName,full=await request(url);assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);const etag=full.headers.get('etag');assert.ok(etag);assert.match(full.headers.get('cache-control'),/immutable/);
  const head=await request(url,{method:'HEAD',headers:{Range:'bytes=5-8'}});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  const cached=await request(url,{headers:{'If-None-Match':'W/'+etag}});assert.equal(cached.status,304);
  assert.equal((await request(url,{headers:{'If-Modified-Since':full.headers.get('last-modified')}})).status,304);
  for(const [range,start,end]of [['bytes=4-7',4,8],['bytes=-4',bytes.length-4,bytes.length],['bytes=4-',4,bytes.length],['bytes=4-9999',4,bytes.length]]){const part=await request(url,{headers:{Range:range}});assert.equal(part.status,206,range);assert.deepEqual(Buffer.from(await part.arrayBuffer()),bytes.subarray(start,end));}
  assert.equal((await request(url,{headers:{Range:'bytes=-0'}})).status,416);assert.equal((await request(url,{headers:{Range:'bytes=999-'}})).status,416);
  assert.equal((await request(url,{headers:{Range:'bytes=0-3','If-Range':'"old"'}})).status,200);
  if(r.kind==='file')assert.match(full.headers.get('content-disposition'),/^attachment/);
 }
 assert.equal((await request('/i/missing.png')).status,404);
 const denied=new FormData();denied.append('image',new Blob([bytes]),'file.dat');assert.equal((await request('/api/upload',{method:'POST',body:denied})).status,403);
 assert.equal((await request('/api/upload',{method:'POST',headers:{'X-TBL-Admin-Key':'invalid'},body:denied})).status,403);
 const form=new FormData();const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S5kAAAAASUVORK5CYII=','base64');form.append('image',new Blob([png],{type:'image/png'}),'fixture.png');
 const upload=await request('/api/upload',{method:'POST',body:form});const item=await upload.json();assert.equal(upload.status,201,JSON.stringify(item)+' '+output);assert.deepEqual(Buffer.from(await(await request(item.url)).arrayBuffer()),png);
 assert.equal((await request('/api/images/'+item.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deleteCode:'wrong'})})).status,403);
 assert.equal((await request('/api/images/'+item.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deleteCode:item.deleteCode})})).status,200);assert.equal((await request(item.url)).status,404);
 assert.equal((await request('/api/status')).headers.get('cache-control'),'no-store');
 console.log('PASS: originals unchanged, upload/delete, image/video/file ranges, suffix ranges, HEAD, ETag/304, If-Range and private API cache policy');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(child){child.kill();await new Promise(r=>child.once('exit',r))}fs.rmSync(dir,{recursive:true,force:true})});
