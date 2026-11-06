/* Dedicated existence lookup. Never opens, unlocks, saves, or consumes a note. */
(function(){
  'use strict';
  const app=document.getElementById('app');
  function attach(){
    const nav=app.querySelector('.topnav nav');
    if(nav && !nav.querySelector('[data-note-check-entry]')){
      const link=document.createElement('a');link.href='#/check';link.textContent='查询便签';link.setAttribute('data-note-check-entry','');nav.prepend(link);
    }
    const home=app.querySelector('.home-wrap');
    if(home && !home.querySelector('.note-check-home-entry')){
      const link=document.createElement('a');link.href='#/check';link.textContent='查询便签是否存在 →';link.className='note-check-home-entry';home.append(link);
    }
    if(location.hash==='#/check' && !document.getElementById('noteCheckPage'))render();
  }
  function render(){
    const header=app.querySelector('.topnav');app.replaceChildren();if(header)app.append(header);
    const page=document.createElement('div');page.id='noteCheckPage';page.className='note-check-wrap';
    page.innerHTML='<p class="note-check-eyebrow">NOTE LOOKUP</p><h1>查询便签</h1><p class="note-check-intro">只查询指定代号是否存在，不打开正文，不触发阅后即焚。</p><div class="note-check-card"><label for="noteCheckSlug">笔记代号</label><input id="noteCheckSlug" placeholder="输入要查询的笔记代号" autocomplete="off" maxlength="60"><button id="checkNoteExists" type="button">查询是否存在</button><p id="noteExistsStatus" class="note-exists-status" role="status" aria-live="polite"></p></div><p class="note-check-foot">已销毁的便签和未创建的便签都显示为“不存在”，不保留销毁记录。</p><a class="note-check-back" href="#/">← 返回首页</a>';
    app.append(page);
    const input=page.querySelector('#noteCheckSlug'),button=page.querySelector('#checkNoteExists'),status=page.querySelector('#noteExistsStatus');
    let serial=0,controller;
    function reset(){serial++;controller?.abort();button.disabled=false;status.textContent='';status.removeAttribute('data-result');}
    input.addEventListener('input',reset);
    async function check(){
      reset();
      const slug=input.value.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-_\u4e00-\u9fa5]/g,'').slice(0,50);
      if(!slug){status.textContent='请先输入笔记代号。';input.focus();return;}
      const current=serial;controller=new AbortController();button.disabled=true;status.textContent='查询中…';
      try{
        const response=await fetch('/api/notes/'+encodeURIComponent(slug)+'/meta',{method:'GET',cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer',signal:controller.signal});
        if(!response.ok)throw Error('QUERY_FAILED');
        const data=await response.json();if(typeof data.exists!=='boolean')throw Error('INVALID_RESPONSE');
        if(current!==serial || !status.isConnected)return;
        status.dataset.result=data.exists?'exists':'missing';
        status.textContent=data.exists?'「'+slug+'」已存在。查询未打开内容，也未触发阅后即焚。':'未找到「'+slug+'」：可能尚未创建或已经销毁。';
      }catch(e){
        if(current===serial && status.isConnected && e.name!=='AbortError'){status.dataset.result='error';status.textContent='查询失败，请稍后重试；目前无法确认是否存在。';}
      }finally{if(current===serial && button.isConnected)button.disabled=false;}
    }
    button.onclick=check;input.onkeydown=e=>{if(e.key==='Enter' && !button.disabled)check();};input.focus();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();
  window.addEventListener('hashchange',attach);
  new MutationObserver(attach).observe(app,{childList:true,subtree:true});
})();
