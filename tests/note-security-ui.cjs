'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./note-security.integration.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const C=require(fs.existsSync(path.join(__dirname,'../note-site'))?'../note-site/note-crypto.js':'../note-security-source/note-crypto.js');
async function main(){
 const f=await fixture();
 let browser;
 const out=path.resolve(__dirname,'../deploy/note-security-preview');fs.mkdirSync(out,{recursive:true});
 const writes=[],errors=[];
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const owner=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const p=await owner.newPage();p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(r.method()==='PUT')writes.push(JSON.parse(r.postData()));});
  await p.goto(f.origin+'/#/n/secret-letter');
  await p.locator('#editorArea').fill('这是一封加密的信。 <script>alert(1)</script>');
  await p.waitForTimeout(900);assert.equal(writes.length,0,'New notes must not upload plaintext before protection is chosen');
  assert.equal(await p.locator('#e2ee').isChecked(),true,'New notes must default to E2EE');await p.locator('#burnAfterRead').check();
  await p.locator('#protectionMode').selectOption('question');await p.locator('#customQuestion').fill('我们约定的暗号是什么？');await p.locator('#newPw').fill('a-long-private-answer');
  for(const width of[1440,390,320]){
   await p.setViewportSize({width,height:950});
   await p.locator('#newPw').blur();await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(150);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No layout overflow at '+width);
   await p.screenshot({path:path.join(out,'settings-'+width+'.png'),fullPage:true});
  }
  await p.locator('#saveSettings').click();await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();
  assert.equal(writes.length,1);assert.ok(writes[0].envelope);assert.equal(writes[0].content,undefined);assert.equal(writes[0].setPassword,undefined);
  assert.equal(writes[0].envelope.v,2);
  assert.ok(!JSON.stringify(f.store()).includes('这是一封加密的信'));assert.ok(!JSON.stringify(writes).includes('a-long-private-answer'));
  await p.locator('#copyLink').click();await p.locator('#copyLink').filter({hasText:'已复制'}).waitFor();
  const link=await p.evaluate(()=>navigator.clipboard.readText());assert.equal(link,f.origin+'/#/n/secret-letter');
  const reader=await browser.newContext();const q=await reader.newPage();q.on('pageerror',e=>errors.push(e.message));
  await q.goto(f.origin+'/');await q.locator('#slugInput').fill('secret-letter');await q.locator('#goBtn').click();
  await q.locator('#pwInput').waitFor();
  assert.equal(await q.locator('.gate-card input').count(),1);
  assert.ok(f.store()['secret-letter']);assert.equal((await q.locator('.security-question').textContent()),'我们约定的暗号是什么？');
  const reads=[];
  q.on('request', request => {if(request.url().endsWith('/secret-letter/read')) reads.push(JSON.parse(request.postData()));});
  await q.locator('#pwInput').fill('a-long-private-answer');await q.locator('#pwGo').click();await q.locator('#editorArea').waitFor();
  assert.equal(await q.locator('#editorArea').inputValue(),'这是一封加密的信。 <script>alert(1)</script>');
  assert.equal(await q.locator('#editorArea').getAttribute('readonly'),'');assert.equal(f.store()['secret-letter'],undefined);
  assert.equal(reads.length,1);assert.equal(reads[0].cryptoVersion,2);assert.match(reads[0].accessKey,/^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(reads).includes('a-long-private-answer'));
  assert.ok(q.url().endsWith('#/'));assert.equal(await q.locator('#destroyBtn').count(),0);assert.equal(await q.locator('#saveSettings').count(),0);
  assert.equal(await q.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('tg_note_pw_'))),false);
  await q.screenshot({path:path.join(out,'read-destroyed-390.png'),fullPage:true});
  await p.locator('.gate-card h3').filter({hasText:'便签已销毁'}).waitFor({timeout:10000});
  assert.equal(await p.locator('#editorArea').count(),0,'Author page must clear after remote destruction');
  await q.reload();await q.locator('#slugInput').waitFor();assert.equal(await q.locator('#editorArea').count(),0);
  // Old frontends and blank submissions do not consume a password-only note.
  await p.goto(f.origin+'/#/n/wrong-encrypted');
  await p.locator('#editorArea').fill('加密的正文');
  await p.locator('#burnAfterRead').check();
  await p.locator('#protectionMode').selectOption('password');
  await p.locator('#newPw').fill('original-private-password');
  await p.locator('#saveSettings').click();await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();
  const wrongMeta=(await f.api('wrong-encrypted','GET',undefined,'/meta')).data;
  const stale=await f.api('wrong-encrypted','POST',{confirmRead:true,revision:wrongMeta.revision,accessKey:C.random(32)},'/read');
  assert.equal(stale.data.error,'CRYPTO_VERSION_REQUIRED');assert.ok(f.store()['wrong-encrypted']);
  await q.goto(f.origin+'/#/n/wrong-encrypted');await q.locator('#pwGo').click();
  assert.match(await q.locator('#pwErr').textContent(),/请输入/);assert.ok(f.store()['wrong-encrypted']);
  await q.locator('#pwInput').fill('incorrect');await q.locator('#pwInput').press('Enter');
  await q.locator('.gate-card h3').filter({hasText:'便签已销毁'}).waitFor();
  assert.equal(f.store()['wrong-encrypted'],undefined);assert.equal(await q.locator('#editorArea').count(),0);
  // An incorrect answer must destroy a plain burn note and must never display its content.
  const n=await f.api('wrong-answer','PUT',{create:true,content:'错误时不可泄漏',setPassword:'correct-answer',question:'暗号？',burnAfterRead:true});assert.equal(n.status,200);
  await q.goto(f.origin+'/#/n/wrong-answer');await q.locator('#pwInput').fill('incorrect');await q.locator('#pwGo').click();
  await q.locator('.gate-card h3').filter({hasText:'便签已销毁'}).waitFor();assert.equal(f.store()['wrong-answer'],undefined);assert.ok(!(await q.locator('body').textContent()).includes('错误时不可泄漏'));
  // Non-burn encryption: autosave, theme switches, settings changes and password removal.
  await p.goto(f.origin+'/#/n/editable');await p.locator('#editorArea').fill('第一版');await p.locator('#e2ee').check();await p.locator('#saveSettings').click();await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();
  await p.locator('#editorArea').fill('第二版 $x$ <b>保留源码</b>');
  await p.locator('[data-design-picker]').selectOption('tech');assert.equal(await p.locator('#editorArea').inputValue(),'第二版 $x$ <b>保留源码</b>');
  await p.locator('[data-design-picker]').selectOption('astra');
  await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();assert.ok(!JSON.stringify(f.store()).includes('第二版'));
  await p.locator('#lockBtn').click();await p.locator('#e2ee').uncheck();await p.locator('#protectionMode').selectOption('password');await p.locator('#newPw').fill('plain-password');await p.locator('#saveSettings').click();await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();
  assert.equal(f.store().editable.encrypted,false);assert.equal(f.store().editable.hasPassword,true);
  await p.locator('#lockBtn').click();await p.locator('#protectionMode').selectOption('none');await p.locator('#saveSettings').click();await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();assert.equal(f.store().editable.hasPassword,false);
  // Editing a consumed page's old owner token cannot recreate it.
  assert.equal((await f.api('wrong-answer','PUT',{revision:n.data.revision,token:n.data.token,content:'resurrect'})).status,410);
  // Existing plaintext notes retain their format; choosing plaintext for a new note is explicit.
  assert.equal((await f.api('legacy-plain','PUT',{create:true,content:'旧明文便签'})).status,200);
  await p.goto(f.origin+'/#/n/legacy-plain');await p.locator('#editorArea').waitFor();assert.equal(await p.locator('#e2ee').isChecked(),false);await p.locator('#editorArea').fill('旧明文便签正常保存');await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();assert.equal(f.store()['legacy-plain'].encrypted,false);
  await p.goto(f.origin+'/#/n/explicit-plain');await p.locator('#editorArea').fill('明确选择普通模式');assert.equal(await p.locator('#e2ee').isChecked(),true);await p.locator('#e2ee').uncheck();await p.locator('#saveSettings').click();await p.locator('#saveStatus').filter({hasText:'已保存'}).waitFor();assert.equal(f.store()['explicit-plain'].encrypted,false);
  // Legacy encrypted notes still use their original link until explicitly converted.
  const secret=C.random(32), password='legacy-private-password';
  const keys=await C.derive(secret,password,C.random(16));
  const envelope=await C.encrypt('旧格式加密便签',keys,'legacy-encrypted');
  assert.equal((await f.api('legacy-encrypted','PUT',{create:true,encrypted:true,hasPassword:true,envelope,accessKey:keys.accessKey})).status,200);
  const oldUrl=f.origin+'/#/n/legacy-encrypted', originalLink=oldUrl+'?k='+secret;
  await q.goto(oldUrl);await q.getByText('请打开原来的完整分享链接。',{exact:false}).waitFor();
  assert.equal(await q.locator('.gate-card input').count(),0);
  await q.goto(originalLink);await q.locator('#pwInput').fill(password);await q.locator('#pwGo').click();
  await q.locator('#editorArea').waitFor();assert.equal(await q.locator('#editorArea').inputValue(),'旧格式加密便签');
  assert.equal(f.store()['legacy-encrypted'].envelope.v,1);
  await q.locator('#lockBtn').click();assert.equal(await q.locator('#usePasswordOnly').isChecked(),false);
  await q.locator('#usePasswordOnly').check();await q.locator('#saveSettings').click();
  await q.locator('#securitySummary').filter({hasText:'可用代号和密码或答案打开'}).waitFor();
  assert.equal(f.store()['legacy-encrypted'].envelope.v,2);
  for(const url of [oldUrl,originalLink]){
    await q.goto(f.origin+'/#/');
    await q.goto(url);await q.locator('#pwInput').fill(password);
    assert.equal(await q.locator('.gate-card input').count(),1);await q.locator('#pwGo').click();
    await q.locator('#editorArea').waitFor();assert.equal(await q.locator('#editorArea').inputValue(),'旧格式加密便签');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS note UI: password-only access by ID, correct/incorrect burn, legacy link and migration, autosave, layouts and ciphertext-only uploads.');
 }finally{await browser?.close();await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
