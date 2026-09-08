const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { patch } = require('../deploy/add-news-entry.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-test-'));
const root = path.resolve(__dirname, '..');
const newsPath = fs.existsSync(path.join(root,'news-site')) ? 'news-site' : 'news';
const claPath = fs.existsSync(path.join(root,'cla-site')) ? 'cla-site' : 'cla';
const children = [];
async function freePort() { return new Promise(resolve => { const s = net.createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));}); }); }
function start(file, env) {
  const child = spawn(process.execPath,[path.join(root,file)],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],windowsHide:true});
  children.push(child);child.output='';child.stdout.on('data',d=>child.output+=d);child.stderr.on('data',d=>child.output+=d);return child;
}
async function ready(url, child) { for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error(child.output);try{if((await fetch(url)).ok)return;}catch(_){}await new Promise(r=>setTimeout(r,50));}throw Error('启动超时 '+child.output); }
(async()=>{
  const authPort=await freePort(),newsPort=await freePort();
  const env={CLASS_AUTH_PORT:String(authPort),CLASS_AUTH_HOST:'127.0.0.1',CLASS_ROSTER_FILE:path.join(dir,'roster.json'),CLASS_ACCOUNTS_FILE:path.join(dir,'accounts.json'),CLASS_SESSIONS_FILE:path.join(dir,'sessions.json'),NEWS_PORT:String(newsPort),NEWS_DATA_FILE:path.join(dir,'news.json')};
  fs.writeFileSync(env.CLASS_ROSTER_FILE,JSON.stringify({version:2,accounts:[{id:'1',name:'王韩润',role:'student-admin'},{id:'2',name:'测试投稿人',role:'student'},{id:'3',name:'其他管理员',role:'student-admin'},{id:'ls',name:'测试老师',role:'teacher'}]}));
  for(const id of ['1','2','3','ls']){const r=spawnSync(process.execPath,[path.join(root,'class-auth/manage.js'),'set-password',id],{env:{...process.env,...env},input:'NewsTest123!',encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
  const auth=start('class-auth/server.js',env);await ready(`http://127.0.0.1:${authPort}/api/session`,auth);
  let news=start(newsPath+'/server.js',env);const base=`http://127.0.0.1:${newsPort}`;await ready(base,news);
  async function call(url,{cookie='',data,method,headers={}}={}){const res=await fetch(base+url,{method:method||(data?'POST':'GET'),headers:{...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});const text=await res.text();let body;try{body=JSON.parse(text)}catch(_){body=text}return{res,body,text};}
  const cookies={};for(const id of ['1','2','3','ls']){const {res}=await call('/account-api/login',{data:{id,password:'NewsTest123!'}});assert.equal(res.status,200);cookies[id]=res.headers.get('set-cookie').split(';')[0];}
  const fields={title:'预选赛新消息',kicker:'引题',subtitle:'副标题',body:'第一段。\n\n第二段 <script>alert(1)</script>',category:'运动会预选赛',anonymous:true,positions:{kicker:{x:24,y:8},subtitle:{x:80,y:90}}};
  assert.equal((await call('/api/submit',{data:fields})).res.status,401);
  const submit=await call('/api/submit',{cookie:cookies['2'],data:{...fields,authorName:'王韩润',status:'published'}});assert.equal(submit.res.status,201);const id=submit.body.article.id;
  assert.equal(submit.body.article.authorName,'测试投稿人');assert.equal(submit.body.article.status,'pending');
  assert.equal((await call('/api/articles')).body.total,0);
  assert.equal((await call('/api/articles/'+id)).res.status,404);
  assert.equal((await call('/api/mine',{cookie:cookies['3']})).body.articles.length,0);
  for(const who of ['2','3','ls']){assert.equal((await call('/api/review',{cookie:cookies[who]})).res.status,403);assert.equal((await call('/api/review/'+id,{cookie:cookies[who],data:{action:'approve'}})).res.status,403);}
  assert.equal((await call('/api/me',{cookie:cookies['1']})).body.pending,1);
  assert.equal((await call('/api/review',{cookie:cookies['1']})).body.articles[0].authorName,'测试投稿人');
  assert.equal((await call('/api/review/'+id,{cookie:cookies['1'],data:{action:'approve'},headers:{origin:'https://evil.example'}})).res.status,403);
  assert.equal((await call('/api/review/'+id,{cookie:cookies['1'],data:{action:'approve'}})).res.status,200);
  const pub=await call('/api/articles/'+id);assert.equal(pub.res.status,200);assert.equal(pub.body.article.author,'匿名投稿');assert.deepEqual(pub.body.article.positions,fields.positions);
  for(const url of ['/api/articles','/api/articles/'+id]){const p=await call(url);for(const key of ['authorId','authorName','reviewerId','测试投稿人'])assert.ok(!p.text.includes(key),`Public leak: ${key}`);}
  assert.equal((await call('/api/review/'+id,{cookie:cookies['1'],data:{action:'reject',note:'再次审核'}})).res.status,409);
  const rejected=(await call('/api/submit',{cookie:cookies['2'],data:{...fields,anonymous:false,category:'日常生活'}})).body.article;
  assert.equal((await call('/api/review/'+rejected.id,{cookie:cookies['1'],data:{action:'reject'}})).res.status,400);
  await call('/api/review/'+rejected.id,{cookie:cookies['1'],data:{action:'reject',note:'请补充时间'}});
  assert.equal((await call('/api/mine',{cookie:cookies['2']})).body.articles[0].reviewNote,'请补充时间');
  assert.equal((await call('/api/articles/'+rejected.id)).res.status,404);
  const real=(await call('/api/submit',{cookie:cookies['2'],data:{...fields,anonymous:false,category:'专题'}})).body.article;
  await call('/api/review/'+real.id,{cookie:cookies['1'],data:{action:'approve'}});
  assert.equal((await call('/api/articles/'+real.id)).body.article.author,'测试投稿人');
  assert.equal((await call('/api/articles?category='+encodeURIComponent('专题'))).body.total,1);
  for(const change of [{title:''},{category:'不存在'},{anonymous:'true'},{positions:{kicker:{x:101,y:0}}},{body:'a'.repeat(30001)}])assert.equal((await call('/api/submit',{cookie:cookies['2'],data:{...fields,...change}})).res.status,400);
  for(const file of ['/server.js','/data/news.json','/../class-auth/accounts.json','/app.js.bak'])assert.equal((await call(file)).res.status,404);
  const parallel=await Promise.all(Array.from({length:5},(_,i)=>call('/api/submit',{cookie:cookies['2'],data:{...fields,title:'并发 '+i}})));assert.ok(parallel.every(r=>r.res.status===201));
  const before=(await call('/api/mine',{cookie:cookies['2']})).body.articles.length;assert.equal(before,8);
  await new Promise(resolve=>{news.once('exit',resolve);news.kill();});news=start(newsPath+'/server.js',env);await ready(base,news);
  assert.equal((await call('/api/mine',{cookie:cookies['2']})).body.articles.length,before);
  assert.equal((await call('/api/articles')).body.total,2);
  const html=fs.readFileSync(path.join(root,claPath,'index.html'),'utf8');const modified=patch(html);assert.ok(modified.includes('https://news.lernicks.cn'));assert.equal(patch(modified),modified);
  console.log('PASS: shared login, reviewer-only approval, anonymity, rejection, validation, CSRF, protected files, concurrent writes, restart persistence, cla patch');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await Promise.all(children.filter(c=>c.exitCode===null).map(c=>new Promise(r=>{c.once('exit',r);c.kill();})));fs.rmSync(dir,{recursive:true,force:true});});
