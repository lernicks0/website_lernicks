const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./note-security.integration.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const f=await fixture({letter:{content:'不得取回的正文',burnAfterRead:true,hasPassword:false,revision:'fixture-version'},'中文代号':{content:'中文测试',hasPassword:false},'Mixed-ID':{content:'保留大小写',hasPassword:false}});
 const browser=await chromium.launch({headless:true,channel:'msedge'}),requests=[],errors=[];
 try{
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/notes/'))requests.push({method:r.method(),path:new URL(r.url()).pathname,url:r.url(),headers:r.headers()});});
  await page.goto(f.origin+'/');await page.locator('.note-check-home-entry').click();await page.locator('#noteCheckPage').waitFor();
  assert.ok(page.url().endsWith('#/check'));assert.equal(await page.locator('#settingsPanel').count(),0);assert.equal(await page.locator('#editorArea').count(),0);
  await page.locator('#checkNoteExists').click();assert.match(await page.locator('#noteExistsStatus').textContent(),/请先输入/);assert.equal(requests.length,0);
  const before=fs.readFileSync(f.file,'utf8');
  await page.locator('#noteCheckSlug').fill('letter');await page.locator('#checkNoteExists').click();await page.locator('[data-result=exists]').waitFor();
  assert.equal(fs.readFileSync(f.file,'utf8'),before,'Checking a burn note must not mutate or consume it');assert.ok(!(await page.locator('body').textContent()).includes('不得取回的正文'));
  const secret='fixture-link-key-never-send';
  for(const value of ['https://note.lernicks.cn/#/n/letter?k='+secret,'note.lernicks.cn/#/n/letter','/#/n/letter','#/n/letter',f.origin+'/#/n/letter']){
   await page.locator('#noteCheckSlug').fill(value);await page.locator('#checkNoteExists').click();await page.locator('[data-result=exists]').waitFor();assert.equal(requests.at(-1).path,'/api/notes/letter/meta');
  }
  assert.ok(!JSON.stringify(requests).includes(secret),'Link key must not enter a request URL, body, or header');assert.equal(fs.readFileSync(f.file,'utf8'),before);
  await page.locator('#noteCheckSlug').fill('https://note.lernicks.cn/#/n/'+encodeURIComponent('中文代号'));await page.locator('#checkNoteExists').click();await page.locator('[data-result=exists]').waitFor();assert.equal(requests.at(-1).path,'/api/notes/'+encodeURIComponent('中文代号')+'/meta');
  await page.locator('#noteCheckSlug').fill('https://note.lernicks.cn/#/n/Mixed-ID');await page.locator('#checkNoteExists').click();await page.locator('[data-result=exists]').waitFor();assert.equal(requests.at(-1).path,'/api/notes/Mixed-ID/meta');
  const count=requests.length;
  for(const value of ['https://example.com/#/n/letter','example.com/#/n/letter','https://note.lernicks.cn/','https://note.lernicks.cn/#/n/%ZZ','javascript:alert(1)','https://note.lernicks.cn/#/n/'+('a'.repeat(61))]){
   await page.locator('#noteCheckSlug').fill(value);await page.locator('#checkNoteExists').click();await page.locator('[data-result=error]').waitFor();assert.equal(requests.length,count,'Invalid link must not send a request');
  }
  await page.locator('#noteCheckSlug').fill('not-created');await page.locator('#noteCheckSlug').press('Enter');await page.locator('[data-result=missing]').waitFor();
  assert.ok(!f.store()['not-created']);
  assert.ok(requests.every(r=>r.method==='GET' && r.path.endsWith('/meta')));
  await page.route('**/api/notes/error-case/meta',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.locator('#noteCheckSlug').fill('error-case');await page.locator('#checkNoteExists').click();await page.locator('[data-result=error]').waitFor();assert.match(await page.locator('#noteExistsStatus').textContent(),/无法确认/);
  let release;const delayed=new Promise(r=>release=r);await page.route('**/api/notes/delayed/meta',async r=>{await delayed;try{await r.fulfill({contentType:'application/json',body:'{"exists":true}'});}catch(_){}});
  await page.locator('#noteCheckSlug').fill('delayed');const requestStarted=page.waitForRequest('**/api/notes/delayed/meta');await page.locator('#checkNoteExists').click();await requestStarted;
  await page.locator('#noteCheckSlug').fill('changed');release();await page.waitForTimeout(100);assert.equal(await page.locator('#noteExistsStatus').textContent(),'','Stale response must not overwrite a changed input');
  const out=path.resolve(__dirname,'../deploy/note-existence-preview');fs.mkdirSync(out,{recursive:true});
  for(const width of[1440,390,320]){
   await page.setViewportSize({width,height:900});await page.goto(f.origin+'/#/check');await page.locator('#noteCheckPage').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'check-'+width+'.png'),fullPage:true});
  }
  await page.locator('[data-design-picker]').selectOption('tech');assert.equal(await page.locator('#noteCheckPage').count(),1);await page.locator('[data-design-picker]').selectOption('astra');
  await page.locator('.note-check-back').click();await page.locator('#slugInput').waitFor();assert.equal(await page.locator('#noteCheckPage').count(),0);
  assert.equal(await page.locator('[data-note-check-entry]').count(),1);assert.deepEqual(errors,[]);
  console.log('PASS: separate route, note IDs/full URLs/encrypted links, no link key transmitted, exact Unicode/case, invalid links rejected, no reads/writes/burn, error/stale result, 1440/390/320 layout, themes and navigation.');
 }finally{await browser.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
