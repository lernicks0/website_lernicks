'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {createRequire} = require('node:module');
const root=path.resolve(__dirname,'..'),source=fs.existsSync(path.join(root,'note-site'))?'note-site':'note-security-source';
const dep = createRequire(path.join(root,fs.existsSync(path.join(root,'package.json'))?'package.json':'deploy/note-security-runtime/package.json'));
const express = dep('express'), bcrypt = dep('bcryptjs');
const {install} = require(path.join(root,source,'note-security.cjs')), C = require(path.join(root,source,'note-crypto.js'));
async function fixture(seed = {}) {
  const base=path.resolve(__dirname,'../deploy/note-security-runtime/fixtures');fs.mkdirSync(base,{recursive:true});
  const dir = fs.mkdtempSync(path.join(base,'note-security-'));
  const file = path.join(dir,'notes.json'); fs.writeFileSync(file,JSON.stringify(seed));
  const app = express(); app.use(express.json({limit:'4mb'})); install(app,{dataDir:dir,express,bcrypt});
  app.get('/',(req,res)=>res.type('html').send(fs.readFileSync(path.join(root,source==='note-site'?'note-site/index.html':'public/index.html'))));
  const server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const origin = 'http://127.0.0.1:' + server.address().port;
  const api = async(slug, method='GET', body, suffix='', headers={}) => {const r=await fetch(origin+'/api/notes/'+encodeURIComponent(slug)+suffix,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,data:method==='HEAD'?null:await r.json()};};
  return {dir,file,origin,api,store:()=>JSON.parse(fs.readFileSync(file,'utf8')),close:()=>new Promise(r=>server.close(r))};
}
module.exports = {fixture};
async function main(){
  const f=await fixture({legacy:{content:'旧正文',hasPassword:false,updatedAt:11},protected:{content:'旧私密正文',hasPassword:true,passwordHash:await bcrypt.hash('legacy-password',4),updatedAt:12}});
  const {api}=f;
  try {
    assert.equal((await api('legacy')).data.content,'旧正文');
    assert.equal((await api('protected')).status,403);
    let r=await api('protected','POST',{password:'wrong'},'/unlock');assert.equal(r.status,401);assert.ok(f.store().protected);
    r=await api('protected','POST',{password:'legacy-password'},'/unlock');assert.equal(r.data.content,'旧私密正文');
    let p=await api('protected','PUT',{token:r.data.token,revision:r.data.revision,content:'更新旧便签',question:'旧密码是什么？'});assert.equal(p.status,200);
    assert.equal((await api('protected','GET',undefined,'/meta')).data.question,'旧密码是什么？');
    const edge = { 'x-real-ip': '104.16.1.1' };
    const first = { ...edge, 'cf-connecting-ip': '2001:db8::10' };
    const second = { ...edge, 'cf-connecting-ip': '2001:db8::20' };
    for (let i=0;i<5;i++) {
      r=await api('protected','POST',{password:'wrong'},i%2?'/read':'/unlock',first);
      assert.equal(r.status,401);
    }
    r=await api('protected','POST',{password:'legacy-password'},'/read',{...first,'cf-connecting-ip':'2001:db8:0:0:0:0:0:10'});
    assert.equal(r.status,429);
    assert.ok(Number(r.headers.get('retry-after'))>0 && Number(r.headers.get('retry-after'))<=60);
    assert.equal((await api('protected','POST',{password:'legacy-password'},'/unlock',second)).status,200);
    assert.equal((await api('protected','POST',{password:'legacy-password'},'/read',edge)).status,400);
    const other=await api('other','PUT',{create:true,content:'另一个便签',setPassword:'other-pass'});assert.equal(other.status,200);
    assert.equal((await api('other','POST',{password:'other-pass'},'/read',first)).status,200);
    const direct={'x-real-ip':'198.51.100.10'};
    for(let i=0;i<5;i++) assert.equal((await api('protected','POST',{password:'wrong'},'/read',{...direct,'cf-connecting-ip':'203.0.113.'+(i+1)})).status,401);
    assert.equal((await api('protected','POST',{password:'legacy-password'},'/read',{...direct,'cf-connecting-ip':'203.0.113.99','x-forwarded-for':'203.0.113.100'})).status,429);
    const realNow=Date.now;
    Date.now=()=>realNow()+61000;
    try { assert.equal((await api('protected','POST',{password:'legacy-password'},'/read',direct)).status,200); }
    finally { Date.now=realNow; }
    let n=await api('burn','PUT',{create:true,content:'一次性正文',burnAfterRead:true});assert.equal(n.status,200);
    assert.match(n.headers.get('cache-control'),/no-store/);
    assert.equal((await api('burn')).status,403);assert.equal((await api('burn','HEAD')).status,403);
    assert.equal((await api('burn','POST',{password:''},'/unlock')).status,409);
    assert.ok(f.store().burn,'GET, HEAD, meta and old auto-unlock must not burn');
    const readers=await Promise.all(Array.from({length:20},()=>api('burn','POST',{confirmRead:true,revision:n.data.revision},'/read')));
    assert.equal(readers.filter(r=>r.status===200).length,1);assert.equal(readers.filter(r=>r.status===410).length,19);
    assert.equal(readers.find(r=>r.status===200).data.content,'一次性正文');assert.equal(readers.find(r=>r.status===200).data.token,undefined);
    assert.equal(f.store().burn,undefined);
    assert.equal((await api('burn','PUT',{token:n.data.token,revision:n.data.revision,content:'不能复活'})).status,410);
    n=await api('question','PUT',{create:true,content:'机密',setPassword:'答案',question:'我们的暗号？',burnAfterRead:true});
    r=await api('question','POST',{password:'错',revision:n.data.revision,confirmRead:true},'/read');assert.equal(r.status,410);assert.equal(r.data.destroyed,true);assert.equal(f.store().question,undefined);
    n=await api('correct','PUT',{create:true,content:'正确答案可读',setPassword:'yes',burnAfterRead:true});
    r=await api('correct','POST',{password:'yes',confirmRead:true,revision:n.data.revision},'/read');assert.equal(r.data.content,'正确答案可读');assert.equal(f.store().correct,undefined);
    const secret=C.random(32), salt=C.random(16), keys=await C.derive(secret,'a strong answer',salt), envelope=await C.encrypt('端到端的秘密 <script> $x$',keys,'encrypted');
    const encrypted={create:true,encrypted:true,envelope,accessKey:keys.accessKey,hasPassword:true,question:'约定的暗号？',burnAfterRead:false};
    n=await api('encrypted','PUT',encrypted);assert.equal(n.status,200);
    assert.ok(!JSON.stringify(f.store()).includes('端到端的秘密'));assert.equal(f.store().encrypted.content,undefined);assert.equal(f.store().encrypted.accessKey,undefined);
    assert.equal((await api('encrypted')).status,403);
    r=await api('encrypted','POST',{accessKey:keys.accessKey,revision:n.data.revision},'/read');assert.equal(r.status,200);assert.equal(await C.decrypt(r.data.envelope,keys,'encrypted'),'端到端的秘密 <script> $x$');
    await assert.rejects(C.decrypt(r.data.envelope,keys,'other-slug'));
    const corrupt={...r.data.envelope,ciphertext:(r.data.envelope.ciphertext[0]==='A'?'B':'A')+r.data.envelope.ciphertext.slice(1)};await assert.rejects(C.decrypt(corrupt,keys,'encrypted'));
    const wrong=await C.derive(secret,'wrong',salt);
    r=await api('encrypted','POST',{accessKey:wrong.accessKey},'/read');assert.equal(r.status,401);assert.ok(f.store().encrypted);
    const nextKeys=await C.derive(secret,'new answer',C.random(16));
    const nextEnvelope=await C.encrypt('密码轮换',nextKeys,'encrypted');
    p=await api('encrypted','PUT',{revision:n.data.revision,token:n.data.token,encrypted:true,envelope:nextEnvelope,accessKey:nextKeys.accessKey,hasPassword:true,burnAfterRead:true});
    // A later reader invalidated the original owner's token; fetch a fresh normal editor token to rotate.
    assert.equal(p.status,401);
    r=await api('encrypted','POST',{accessKey:keys.accessKey},'/read');
    p=await api('encrypted','PUT',{revision:r.data.revision,token:r.data.token,encrypted:true,envelope:nextEnvelope,accessKey:nextKeys.accessKey,hasPassword:true,burnAfterRead:true});assert.equal(p.status,200);
    r=await api('encrypted','POST',{accessKey:keys.accessKey,confirmRead:true,revision:p.data.revision},'/read');assert.equal(r.status,410);assert.equal(f.store().encrypted,undefined);
    n=await api('disk-failure','PUT',{create:true,content:'不能在删除落盘前交付',burnAfterRead:true});
    const rename=fs.renameSync;fs.renameSync=(a,b)=>{if(b===f.file)throw Error('fixture disk error');return rename(a,b);};
    try {r=await api('disk-failure','POST',{confirmRead:true,revision:n.data.revision},'/read');assert.equal(r.status,500);assert.equal(r.data.content,undefined);}finally{fs.renameSync=rename;}
    assert.ok(f.store()['disk-failure']);assert.equal(fs.existsSync(f.file+'.next'),false);
    r=await api('disk-failure','POST',{confirmRead:true,revision:n.data.revision},'/read');assert.equal(r.status,200);
    n=await api('__proto__','PUT',{create:true,content:'合法代号'});assert.equal(n.status,200);assert.equal((await api('__proto__')).data.content,'合法代号');
    // Failed/stale saves may never overwrite another editor or recreate a deleted note.
    assert.equal((await api('legacy','PUT',{revision:'stale',content:'stale'})).status,409);
    assert.equal((await api('missing','PUT',{content:'implicit creation forbidden'})).status,410);
    assert.equal((await api('bad-envelope','PUT',{create:true,encrypted:true,envelope:{...envelope,iterations:1},accessKey:keys.accessKey,hasPassword:true})).status,400);
    assert.equal((await api('bad-plaintext','PUT',{...encrypted,content:'plaintext'})).status,400);
    const disk=f.store(); await f.close();
    const restart=await fixture(disk);try{assert.equal((await restart.api('burn','GET',undefined,'/meta')).data.exists,false);assert.equal((await restart.api('protected','POST',{password:'legacy-password'},'/read')).data.content,'更新旧便签');}finally{await restart.close();}
    console.log('PASS note security: per-IP bans, proxy header checks, expiry, legacy access, custom questions, single-use concurrent reads, wrong-password destruction, encrypted auth/key rotation/tampering, no resurrection, durable deletion and disk-failure safety, restart, no-store, GET/HEAD safety.');
  } finally { await f.close(); }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
