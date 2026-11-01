const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'deploy/tbl-speed-preview');fs.mkdirSync(out,{recursive:true});
const source=path.join(root,fs.existsSync(path.join(root,'tbl-site'))?'tbl-site':'tbl');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const ctx=await browser.newContext();const requests=[],uploads=[],errors=[];
  await ctx.addInitScript(()=>localStorage.setItem('lernicks_tbl_uploads_v1',JSON.stringify(Array.from({length:20},(_,i)=>({id:String(i),url:'http://tbl.test/i/old-'+i+'.png',name:'旧图片 '+i,kind:'image'})))));
  await ctx.route('http://tbl.test/**',async route=>{
   const req=route.request(),url=new URL(req.url());requests.push(url.pathname);
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(source,'index.html'))});
   if(url.pathname==='/api/status')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,usedBytes:20000000,maxBytes:3221225472,uploadCount:40})});
   if(url.pathname==='/api/upload'){uploads.push(req.postDataBuffer());return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,id:'f'.repeat(20),url:'/i/new-file.webp',originalName:'test.webp',kind:'image',deleteCode:'fixture'})})}
   return route.fulfill({status:404,body:''});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});await page.goto('http://tbl.test/');
   await page.locator('[data-design-picker]').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.locator('#historyList').scrollIntoViewIfNeeded();assert.equal(await page.locator('#historyList img[src^="http"]').count(),0);
   await page.screenshot({path:path.join(out,`tbl-${width}.png`),fullPage:true});
  }
  assert.equal(requests.filter(p=>p.startsWith('/i/')).length,0,'History must not download originals');
  const dataUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1000;const x=c.getContext('2d'),pixels=x.createImageData(c.width,c.height);let seed=13;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=((i/4)%1600)/8;pixels.data[i+1]=90+(seed>>>28);pixels.data[i+2]=(i/6400)/5;pixels.data[i+3]=255}x.putImageData(pixels,0,0);return c.toDataURL('image/png')});
  const png=Buffer.from(dataUrl.split(',')[1],'base64');assert.ok(png.length>256*1024);
  await page.locator('#fileInput').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});
  await page.locator('#uploadButton').click();await page.locator('#result.show').waitFor();
  assert.ok(uploads[0].length<png.length*0.9);assert.match(uploads[0].toString('latin1'),/filename="test.webp"/);
  assert.match(await page.locator('#resultPreview').getAttribute('src'),/^blob:/);
  assert.equal(requests.filter(p=>p.startsWith('/i/')).length,0,'Result must reuse the local image');
  assert.equal(await page.locator('#historyList img[src^="data:image/"]').count(),1);
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(out,'tbl-result-390.png'),fullPage:true});
  await page.locator('#result button').first().click();await page.locator('#smartCompress').uncheck();
  await page.locator('#fileInput').setInputFiles({name:'original.png',mimeType:'image/png',buffer:png});await page.locator('#uploadButton').click();await page.locator('#result.show').waitFor();
  assert.ok(uploads[1].includes(png),'Original mode must upload the exact bytes');
  const skip=await page.evaluate(async()=>{
   const result=[];
   const apng=[137,80,78,71,13,10,26,10,0,0,0,8,97,99,84,76,0,0,0,2,0,0,0,0,0,0,0,0];
   for(const [name,type,data]of [['a.gif','image/gif',[71,73,70,56,57,97]],['a.webp','image/webp',[82,73,70,70]],['a.png','image/png',apng],['a.bin','application/octet-stream',[0,1,2]]]){const f=new File([new Uint8Array(data),new Uint8Array(300000)],name,{type});result.push((await TblSpeed.prepare(f,true)).file===f)}
   return result;
  });assert.ok(skip.every(Boolean));assert.deepEqual(errors,[]);
  const result={originalPngBytes:png.length,optimizedMultipartBytes:uploads[0].length,reductionPercent:Math.round((1-uploads[0].length/png.length)*100),historyOriginalRequests:0,resultOriginalRequests:0};fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(result,null,2));console.log('PASS: desktop/mobile layout, 20 legacy records without image downloads, real WebP compression, local result preview, exact original mode, animation/file bypass');console.log(result);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
