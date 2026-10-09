// All network writes are fixtures. No production or local business data is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const{pages,patch,strip}=require('../design/build-folio.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'design/folio-preview');fs.mkdirSync(out,{recursive:true});
const files=Object.fromEntries(pages),id='f0110de012345678';
const content='# 让想法成篇\n\n一份混合排版的示例。\n\n> 把灵感留在这里。\n\n行内公式 $E=mc^2$\n\n$$\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}$$\n\n<details><summary>展开 HTML 内容</summary>混合排版正常。</details>\n\n```html\n<strong>源码</strong>\n```';
for(const[site,file]of pages){const html=fs.readFileSync(path.join(root,file),'utf8');assert.equal(strip(patch(html,site)),strip(html));assert.equal(patch(patch(html,site),site),patch(html,site));assert.equal((html.match(/id="folio-style"/g)||[]).length,1)}
function contrast(a,b){function l(s){return s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)}let x=l(a),y=l(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[],requests=[];
 try{
 const ctx=await browser.newContext();
 await ctx.route('http://folio.test/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;let data={ok:true};
  if(req.method()!=='GET')requests.push({path:p,method:req.method(),body:req.postData()});
  if(p==='/favicon.png')return route.fulfill({status:204});
  if(p.startsWith('/api/')){
   if(p==='/api/status')data={ok:true,usedBytes:0,maxBytes:500*1024*1024,documentCount:0,uploadCount:0};
   else if(p.endsWith('/meta'))data={exists:true,hasPassword:false};
   else if(p.startsWith('/api/notes/'))data={ok:true,content:'把灵感留在这里。',hasPassword:false};
   else if(p==='/api/documents/'+id)data={document:{id,title:'把想法写成一页',format:'mixed',content,size:640,updatedAt:'2026-10-09T00:00:00Z'}};
   else if(p==='/api/documents')data={ok:true,key:'fixture-key',viewUrl:'/d/'+id,editUrl:'/d/'+id+'/pre',rawUrl:'/raw/'+id};
   else if(p==='/api/upload')data={ok:true,id:'sample',url:'/sample.png',deleteCode:'fixture-delete',kind:'image',originalName:'sample.png'};
   else if(p==='/api/feedback')data={ok:true,feedback:[],items:[]};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  }
  if(p==='/sample.png')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S5kAAAAASUVORK5CYII=','base64')});
  if(p==='/html-support.js'||p==='/purify.min.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'mk-site',p.slice(1)))});
  const site=p.startsWith('/d/')?'document':p.split('/')[1]||'main';
  if(!files[site])return route.fulfill({status:404});
  return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,files[site]),'utf8')});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const width of[1440,390,320]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const site of['main','note','tbl','mk','document']){
   await page.goto('http://folio.test/'+(site==='document'?'d/'+id:site+'/'),{waitUntil:'domcontentloaded'});
   await page.locator('[data-design-picker]').first().waitFor();
   if(site==='document')await page.locator('#documentShell.show').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.getAttribute('data-folio')),site);
   const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bg:getComputedStyle(document.body).backgroundColor,fg:getComputedStyle(document.body).color}));
   assert.ok(metrics.scroll<=width+1,`${site} ${width}px overflows: ${metrics.scroll}`);
   assert.ok(contrast(metrics.bg,metrics.fg)>=7,`${site} low text contrast`);
   if(width!==320)await page.screenshot({path:path.join(out,`${site}-${width}.png`),fullPage:true});
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://folio.test/note/');await page.locator('#slugInput').fill('my-letter');
 await page.locator('[data-design-picker]').selectOption('tech');assert.equal(await page.locator('#slugInput').inputValue(),'my-letter');
 await page.locator('[data-design-picker]').selectOption('astra');assert.equal(await page.locator('#slugInput').inputValue(),'my-letter');
 await page.locator('#goBtn').click();await page.locator('#editorArea').fill('未保存正文 $x^2$ <details>');
 await page.locator('[data-design-picker]').selectOption('classic');assert.equal(await page.locator('#editorArea').inputValue(),'未保存正文 $x^2$ <details>');
 await page.locator('[data-design-picker]').selectOption('astra');assert.equal(await page.locator('#editorArea').inputValue(),'未保存正文 $x^2$ <details>');
 await page.waitForTimeout(900);assert.ok(requests.some(r=>r.method==='PUT'&&r.path==='/api/notes/my-letter'&&r.body.includes('未保存正文')));
 await page.screenshot({path:path.join(out,'note-editor-390.png'),fullPage:true});
 await page.goto('http://folio.test/tbl/');await page.locator('#fileInput').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S5kAAAAASUVORK5CYII=','base64')});
 await page.locator('#uploadButton').click();await page.locator('#result.show').waitFor();assert.match(await page.locator('#directLink').inputValue(),/sample\.png/);
 await page.screenshot({path:path.join(out,'tbl-result-390.png'),fullPage:true});
 await page.goto('http://folio.test/mk/');await page.locator('#titleInput').fill('我的文档');await page.locator('#contentInput').fill(content);await page.locator('#previewButton').click();
 await page.waitForFunction(()=>typeof window.markdownit==='function'&&typeof window.renderMathInElement==='function',{timeout:20000});
 // Clicking after dependencies load ensures the real renderer runs.
 await page.locator('#previewButton').click();await page.locator('#previewButton').click();
 assert.equal(await page.locator('#createPreview details').count(),1);assert.ok(await page.locator('#createPreview .katex').count()>0);assert.equal(await page.locator('#createPreview pre code').textContent(),'<strong>源码</strong>\n');
 await page.locator('[data-design-picker]').selectOption('original');assert.equal(await page.locator('#contentInput').inputValue(),content);await page.locator('[data-design-picker]').selectOption('astra');
 await page.screenshot({path:path.join(out,'mk-preview-390.png'),fullPage:true});await page.locator('#createButton').click();await page.locator('#result.show').waitFor();assert.equal(await page.locator('#documentKey').inputValue(),'fixture-key');
 await page.goto('http://folio.test/d/'+id);await page.locator('#documentShell.show').waitFor();
 let newWidth=await page.locator('.page').evaluate(el=>el.getBoundingClientRect().width);await page.locator('[data-design-picker]').selectOption('original');let oldWidth=await page.locator('.page').evaluate(el=>el.getBoundingClientRect().width);assert.equal(newWidth,oldWidth);await page.locator('[data-design-picker]').selectOption('astra');
 await page.locator('#sourceTab').click();assert.equal(await page.locator('.source-view').textContent(),content);await page.locator('#renderTab').click();assert.equal(await page.locator('#article details').count(),1);
 await page.goto('http://folio.test/d/'+id+'/pre');await page.locator('#keyInput').fill('fixture-key');await page.locator('#verifyButton').click();await page.locator('#editor.show').waitFor();await page.locator('#editContent').fill('编辑后的正文');await page.locator('#saveButton').click();await page.waitForTimeout(100);assert.ok(requests.some(r=>r.method==='PUT'&&r.path==='/api/documents/'+id&&r.body.includes('编辑后的正文')));
 assert.deepEqual(errors,[]);console.log('PASS: 5 pages at 1440/390/320px, no overflow or JS errors, strong text contrast, note autosave and theme preservation, upload result, mixed preview, document creation/read/source/edit, identical reading width.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
