const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./note-security.integration.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const f=await fixture({letter:{content:'不得取回的正文',burnAfterRead:true,hasPassword:false,revision:'fixture-version'}});
 const browser=await chromium.launch({headless:true,channel:'msedge'}),requests=[],errors=[];
 try{
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/notes/'))requests.push({method:r.method(),path:new URL(r.url()).pathname});});
  await page.goto(f.origin+'/');await page.locator('.note-check-home-entry').click();await page.locator('#noteCheckPage').waitFor();
  assert.ok(page.url().endsWith('#/check'));assert.equal(await page.locator('#settingsPanel').count(),0);assert.equal(await page.locator('#editorArea').count(),0);
  await page.locator('#checkNoteExists').click();assert.match(await page.locator('#noteExistsStatus').textContent(),/请先输入/);assert.equal(requests.length,0);
  const before=fs.readFileSync(f.file,'utf8');
  await page.locator('#noteCheckSlug').fill('letter');await page.locator('#checkNoteExists').click();await page.locator('[data-result=exists]').waitFor();
  assert.equal(fs.readFileSync(f.file,'utf8'),before,'Checking a burn note must not mutate or consume it');assert.ok(!(await page.locator('body').textContent()).includes('不得取回的正文'));
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
  console.log('PASS: separate route/entry, direct links, existing/missing/error results, no content reads/writes/burn, cancelled stale result, 1440/390/320 layout, themes and navigation.');
 }finally{await browser.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
