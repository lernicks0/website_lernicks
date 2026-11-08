(function(){
  'use strict';
  const app = document.getElementById('app');
  // Retire the old client's persistent plaintext password cache, preserving theme preferences.
  try { for(const key of Object.keys(localStorage)) if(key.startsWith('tg_note_pw_')) localStorage.removeItem(key); } catch(_) {}
  let dispose = () => {}, generation = 0;
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const endpoint = slug => '/api/notes/' + encodeURIComponent(slug);
  const messages = { CONFLICT:'便签已被其他页面修改，请重新打开后再试。', UNAUTHORIZED:'编辑权限已失效，请重新打开。', STORAGE_ERROR:'保存失败，请稍后重试。', PASSWORD_TOO_LONG:'普通密码／答案最多 72 个 UTF-8 字节，请缩短或启用端到端加密。', CONTENT_TOO_LARGE:'正文最多 500000 字。', TOO_MANY_ATTEMPTS:'尝试过于频繁，请一分钟后再试。', WRONG_PASSWORD:'密码、答案或链接密钥不正确。', HTTPS_REQUIRED:'端到端加密需要 HTTPS 和支持 Web Crypto 的浏览器。' };
  function failure(r) { return new Error(messages[r.data?.error] || (r.status === 410 ? '便签不存在或已销毁。' : '操作失败，请重试。')); }
  async function api(url, method = 'GET', body) {
    const r = await fetch(url, { method, cache:'no-store', credentials:'same-origin', referrerPolicy:'no-referrer', headers:{'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json(); return { ok:r.ok, status:r.status, data };
  }
  window.toggleNoteTheme = function(){
    const next = document.documentElement.getAttribute('data-note-theme') === 'tech' ? 'classic' : 'tech';
    document.documentElement.setAttribute('data-note-theme', next);
    document.getElementById('themeColor').content = next === 'tech' ? '#050b14' : '#12203a';
    try { localStorage.setItem('tg_note_theme_v1', next); } catch (_) {}
  };
  function nav(){ return `<div class="topnav"><a href="#/" class="brand">✎ <b>便签电报</b> / notes</a><nav><a href="https://lernicks.cn">主站</a><a href="#/">首页</a><a href="#/feedback">问题反馈</a><button class="theme-toggle" onclick="toggleNoteTheme()" aria-label="切换网站主题"><span class="theme-to-tech">⌁ 科技</span><span class="theme-to-classic">✎ 经典</span></button></nav></div>`; }
  function scrub(){ history.replaceState(null, '', location.pathname + location.search + '#/'); }
  function forget(slug) { try { localStorage.removeItem('tg_note_pw_' + slug); sessionStorage.removeItem('tg_note_pw_' + slug); } catch (_) {} }
  function notice(root, message){ root.innerHTML = `<div class="gate-wrap"><div class="gate-card"><h3>便签已销毁</h3><p>${escapeHtml(message)}</p><a href="#/">返回首页</a></div></div>`; }
  function home(){
    app.innerHTML = nav() + `<div class="home-wrap"><h1 class="telegram-title">写点什么，发给需要的人</h1><p class="telegram-sub">新建便签默认端到端加密，可设置密码、问题或阅后即焚。</p><div class="telegram-card"><div class="perforation"></div><label for="slugInput">笔记代号 · Note ID</label><div style="display:flex;gap:8px;min-width:0"><input class="slug-input" id="slugInput" placeholder="例如 mynote-2026" autocomplete="off" style="min-width:0;flex:1"><button id="randomBtn">🎲 随机</button></div><button class="go-btn" id="goBtn">打开 / 创建</button></div><p class="home-hint">加密便签请保存完整分享链接。密码、答案和解密密钥不会在此浏览器中持久保存。</p></div>`;
    const input = document.getElementById('slugInput');
    const go = () => { const s = input.value.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-_\u4e00-\u9fa5]/g,'').slice(0,50); if(s) location.hash = '#/n/' + encodeURIComponent(s); };
    document.getElementById('goBtn').onclick = go;
    document.getElementById('randomBtn').onclick = () => { input.value = 'note-' + NoteCrypto.random(9); };
    input.onkeydown = e => { if(e.key === 'Enter') go(); }; input.focus();
  }
  async function open(slug, secret, current){
    forget(slug);
    app.innerHTML = nav() + '<div id="noteRoot" style="width:100%;display:flex;flex:1;flex-direction:column;align-items:center"><p role="status">加载中…</p></div>';
    const root = document.getElementById('noteRoot');
    try {
      const r = await api(endpoint(slug) + '/meta'); if(current !== generation) return; if(!r.ok) throw failure(r);
      const m = r.data;
      if (!m.exists) return editor(root, slug, { ...m, encrypted:true, content:'', secret:null, password:'', token:null }, current);
      if (m.encrypted || m.hasPassword || m.burnAfterRead) return gate(root, slug, m, secret, current);
      const p = await api(endpoint(slug)); if(current !== generation) return; if(!p.ok) throw failure(p);
      if(p.data.hasPassword || p.data.burnAfterRead || p.data.encrypted) throw Error('便签保护设置已变化，请重新打开。');
      editor(root, slug, { ...p.data, secret:null, password:'', token:null }, current);
    } catch(e) { if(current === generation) root.innerHTML = '<p role="alert">' + escapeHtml(e.message) + '</p>'; }
  }
  function gate(root, slug, m, secret, current){
    root.innerHTML = `<div class="gate-wrap"><div class="gate-card"><div class="wax-seal">🔒</div><h3>${escapeHtml(slug)}</h3><p>${m.encrypted ? '端到端加密便签' : '受保护的便签'}</p>${m.question ? `<p class="security-question">${escapeHtml(m.question)}</p>` : ''}${m.hasPassword ? `<label for="pwInput">${m.question ? '答案（严格区分大小写和空格）' : '访问密码'}</label><input type="password" id="pwInput" autocomplete="off" placeholder="${m.question ? '输入答案' : '输入密码'}" maxlength="200">` : ''}${m.encrypted && !secret ? '<label for="linkKey">口述口令、完整加密链接或链接密钥</label><input id="linkKey" type="password" autocomplete="off" maxlength="2048">' : ''}<p class="burn-warning">${m.burnAfterRead ? '阅后即焚：点击阅读后立即从服务器删除。输错密码、答案或口令同样会销毁。关闭或刷新后无法恢复。' : '密码、答案和密钥仅在本页面内存中使用。'}</p><p id="pwErr" class="security-error" role="alert"></p><button class="go-btn" id="pwGo">${m.burnAfterRead ? '阅读并销毁' : '解锁阅读'}</button></div></div>`;
    const button = document.getElementById('pwGo'), input = document.getElementById('pwInput'), error = document.getElementById('pwErr');
    const keyInput = document.getElementById('linkKey');
    button.onclick = async () => {
      button.disabled = true; error.textContent = '';
      try {
        let key = secret, keys = null;
        const password = input?.value || '';
        if(m.encrypted){
          key = key || keyInput?.value.trim();
          if(key?.includes('#')) key = new URLSearchParams(key.split('?').slice(1).join('?')).get('k');
          if(!key || !/^[A-Za-z0-9_-]{43}$/.test(key)) key = await NoteCrypto.spokenSecret(key || '');
          keys = await NoteCrypto.derive(key, password, m.crypto.salt);
        }
        const b = { confirmRead:true, revision:m.revision };
        if(m.encrypted) b.accessKey = keys.accessKey; else b.password = password;
        const r = await api(endpoint(slug) + '/read', 'POST', b);
        if(current !== generation) return;
        if(r.status === 410){ forget(slug); scrub(); notice(root, r.data.destroyed ? '输入有误，这份阅后即焚便签已销毁，未保留阅读记录。' : '这份便签已不存在。'); return; }
        if(!r.ok) throw failure(r);
        if(r.data.destroyed){ forget(slug); scrub(); }
        let content;
        try { content = m.encrypted ? await NoteCrypto.decrypt(r.data.envelope, keys, slug) : r.data.content; }
        catch (_) { throw Error(r.data.destroyed ? '服务器副本已销毁，但密文校验失败，无法显示正文。' : '密文校验失败，正文未显示。'); }
        if(current !== generation) return;
        editor(root, slug, { ...r.data, content, secret:key, keys, password, token:r.data.token || null }, current);
      } catch(e) { if(current === generation && root.isConnected) { error.textContent = e.message; button.disabled = false; } }
    };
    for (const field of [keyInput, input]) {
      if (field) field.onkeydown = event => { if (event.key === 'Enter' && !button.disabled) button.click(); };
    }
    (keyInput || input)?.focus();
  }
  function editor(root, slug, state, current){
    const burned = !!state.destroyed;
    root.innerHTML = `<div class="note-wrap"><div class="note-bar"><div class="postmark"><span class="dot"></span>${burned ? '一次性阅读' : escapeHtml(slug)}</div><div class="note-actions">${burned ? '' : '<button class="icon-btn" id="copyLink">🔗 复制链接</button><button class="icon-btn" id="lockBtn">保护设置</button><button class="icon-btn seal" id="destroyBtn">销毁</button>'}</div></div><div class="paper-page"><textarea id="editorArea" maxlength="500000" aria-label="便签正文" placeholder="开始写下你想说的话…" ${burned ? 'readonly' : ''}>${escapeHtml(state.content)}</textarea><div class="save-status" id="saveStatus" role="status">${burned ? '服务器副本已销毁 · 仅此页可读' : state.exists ? '已保存' : '尚未保存 · 请先选择保护方式'}</div></div>${burned ? '<p class="security-summary">便签和访问凭据已删除，站内不保留阅读记录，当前地址记录已替换。关闭或刷新后无法再次读取。</p>' : `<p id="securitySummary" class="security-summary"></p><p id="spokenShareResult" class="security-summary" hidden></p><div class="settings-panel ${state.exists ? '' : 'open'}" id="settingsPanel"><label class="security-check"><input id="burnAfterRead" type="checkbox" ${state.burnAfterRead ? 'checked' : ''}><span>阅后即焚：下一个人阅读即销毁</span></label><p class="settings-note burn-warning">读者提交错误密码或答案也会销毁。当前编辑页不触发，阅读后只保留读者已经打开的页面。</p><label class="security-check"><input id="e2ee" type="checkbox" ${state.encrypted ? 'checked' : ''}><span>端到端加密（新便签默认开启）</span></label>${state.exists ? '' : '<label class="security-check"><input id="spokenShare" type="checkbox"><span>生成口述口令（用代号和口令打开）</span></label>'}<p class="settings-note">正文在浏览器内加密。请复制并保存完整分享链接；密钥、密码或答案丢失后无法恢复。自定义问题公开可见，请使用难猜的答案。</p><div class="security-fields"><label for="protectionMode">访问验证</label><select id="protectionMode"><option value="none">无需密码</option><option value="password">密码</option><option value="question">自定义问题</option></select><label for="customQuestion">自定义问题（选择问题验证时必填）</label><input id="customQuestion" type="text" maxlength="200" value="${escapeHtml(state.question)}" placeholder="例如：约定的那句话是什么？"><label for="newPw">密码 / 问题答案</label><input id="newPw" type="password" autocomplete="new-password" maxlength="200" placeholder="${state.hasPassword ? '留空保留现有密码或答案' : '设置密码或答案'}"><button class="apply" id="saveSettings">${state.exists ? '保存保护设置' : '保存并创建便签'}</button></div><p id="settingsError" class="security-error" role="alert"></p><p class="settings-note">阅后即焚只保留当前打开页面的正文；无法撤回对方的截图或复制内容，也无法代删浏览器及第三方代理日志。</p></div>`}</div>`;
    const area = document.getElementById('editorArea'), status = document.getElementById('saveStatus');
    const spokenOption = document.getElementById('spokenShare');
    const spokenResult = document.getElementById('spokenShareResult');
    const encryption = document.getElementById('e2ee');
    let draftSpoken = '';
    let timer, watch, stopped = false, dirty = false, chain = Promise.resolve(), settingsBusy = false;
    function showSpokenPhrase(phrase, saved) {
      if (!spokenResult) return;
      spokenResult.hidden = !phrase;
      spokenResult.textContent = phrase ? '口述口令：' + phrase + (saved ? '。请在离开页面前记下。' : '。保存便签后生效。') : '';
    }
    function updateSpokenOption() {
      if (!spokenOption || state.exists) return;
      spokenOption.disabled = !encryption.checked;
      if (encryption.checked && spokenOption.checked) {
        if (!draftSpoken) draftSpoken = NoteCrypto.randomSpokenPhrase();
        showSpokenPhrase(draftSpoken, false);
      } else {
        showSpokenPhrase('', false);
      }
    }
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(watch);
      state.secret = null;
      state.keys = null;
      state.password = '';
      state.content = '';
      draftSpoken = '';
      showSpokenPhrase('', false);
      area.value = '';
    };
    dispose = stop;
    // BFCache must not retain a consumed note or its keys when navigating away.
    const hide = () => { stop(); }; window.addEventListener('pagehide', hide, {once:true});
    const oldDispose = dispose; dispose = () => { window.removeEventListener('pagehide', hide); oldDispose(); };
    if(burned) { state.content = ''; state.secret = null; state.keys = null; state.password = ''; return; }
    const panel = document.getElementById('settingsPanel'), mode = document.getElementById('protectionMode');
    mode.value = state.hasPassword ? state.question ? 'question' : 'password' : 'none';
    const summary = () => { if(!state.exists) { document.getElementById('securitySummary').textContent = '尚未创建 · 选择保护方式后保存'; return; } document.getElementById('securitySummary').textContent = [state.burnAfterRead ? '阅后即焚已开启（输错即销毁）' : '普通便签', state.encrypted ? '端到端加密' : '服务器保存正文', state.hasPassword ? state.question ? '问题验证' : '密码验证' : '无需密码', state.encrypted ? '请点击“复制链接”保存完整链接；仅有代号无法解密' : ''].filter(Boolean).join(' · '); };
    summary();
    updateSpokenOption();
    watch = setInterval(async () => {
      if(stopped || !state.exists || !state.burnAfterRead || settingsBusy || current !== generation) return;
      try {
        const r = await api(endpoint(slug) + '/meta');
        if(current === generation && r.ok && !r.data.exists) { stop(); forget(slug); scrub(); notice(root, '这份阅后即焚便签已被读取或因输入有误而销毁。'); }
      } catch(_) {}
    }, 2500);
    function markError(e){ status.textContent = e.message; document.getElementById('settingsError').textContent = e.message; }
    async function save(config){
      if(stopped || current !== generation) return false;
      const text = area.value;
      status.textContent = '保存中…';
      const next = config || { encrypted:!!state.encrypted, burnAfterRead:!!state.burnAfterRead, hasPassword:!!state.hasPassword, question:state.question || '', password:state.password || '', secret:state.secret, keys:state.keys };
      const b = { revision:state.revision, token:state.token, create:!state.exists, burnAfterRead:next.burnAfterRead, encrypted:next.encrypted, question:next.question };
      const spokenPhrase = !state.exists && next.encrypted && spokenOption?.checked ? draftSpoken : '';
      if(next.encrypted){
        if (spokenPhrase) next.secret = await NoteCrypto.spokenSecret(spokenPhrase);
        if(!next.secret) next.secret = NoteCrypto.random(32);
        if(!next.keys || config) next.keys = await NoteCrypto.derive(next.secret, next.password, NoteCrypto.random(16));
        b.envelope = await NoteCrypto.encrypt(text, next.keys, slug); b.accessKey = next.keys.accessKey; b.hasPassword = next.hasPassword;
      } else { b.content = text; if(config) b.setPassword = next.password; }
      if(stopped || current !== generation) return false;
      const r = await api(endpoint(slug), 'PUT', b);
      if(!r.ok){
        if(r.status === 410) { stop(); forget(slug); area.readOnly = true; scrub(); status.textContent = '便签已销毁，无法恢复或保存'; return false; }
        if(r.status === 409 || r.status === 401) { stopped = true; clearTimeout(timer); }
        throw failure(r);
      }
      if(current !== generation) return false;
      Object.assign(state, next, r.data, { content:text });
      if(!state.encrypted) { state.secret = null; state.keys = null; showSpokenPhrase('', false); }
      if (spokenPhrase) showSpokenPhrase(spokenPhrase, true);
      spokenOption?.closest('label').remove();
      draftSpoken = '';
      status.textContent = '已保存 · ' + new Date().toLocaleTimeString(); summary();
      return true;
    }
    function enqueue(fn){ const next = chain.then(fn); chain = next.catch(e => { if(current === generation) markError(e); }); return next; }
    area.oninput = () => { clearTimeout(timer); status.textContent = !state.exists || dirty ? '待保存 · 请点击保存保护设置' : '输入中…'; if(state.exists && !dirty && !stopped) timer = setTimeout(() => enqueue(() => save()).catch(()=>{}), 700); };
    panel.addEventListener('input', event => {
      dirty = true; clearTimeout(timer); status.textContent = '保护设置待保存';
      if (event.target === spokenOption || event.target === encryption) updateSpokenOption();
    });
    document.getElementById('lockBtn').onclick = () => panel.classList.toggle('open');
    document.getElementById('saveSettings').onclick = async () => {
      if(settingsBusy || stopped) return;
      const button = document.getElementById('saveSettings'), err = document.getElementById('settingsError'); err.textContent = '';
      const selected = mode.value, password = selected === 'none' ? '' : document.getElementById('newPw').value || (state.hasPassword ? state.password : '');
      const question = selected === 'question' ? document.getElementById('customQuestion').value.trim() : '';
      if(selected !== 'none' && !password) { err.textContent = '请设置密码或答案。'; return; }
      if(selected === 'question' && !question) { err.textContent = '请填写自定义问题。'; return; }
      const config = { encrypted:document.getElementById('e2ee').checked, burnAfterRead:document.getElementById('burnAfterRead').checked, hasPassword:selected !== 'none', question, password, secret:state.secret, keys:state.keys };
      settingsBusy = true; button.disabled = true; area.readOnly = true; clearTimeout(timer);
      for(const el of panel.querySelectorAll('input,select')) el.disabled = true;
      try { const ok = await enqueue(() => save(config)); if(ok) { dirty = false; document.getElementById('newPw').value = ''; button.textContent = '保存保护设置'; panel.classList.remove('open'); } }
      catch(_) {} finally { settingsBusy = false; if(current === generation) { button.disabled = stopped; area.readOnly = stopped; for(const el of panel.querySelectorAll('input,select')) el.disabled = false; updateSpokenOption(); } }
    };
    document.getElementById('copyLink').onclick = async e => {
      const button = e.currentTarget;
      if(!state.exists || dirty || settingsBusy || stopped) { status.textContent = '请先保存便签及保护设置。'; return; }
      try {
        clearTimeout(timer); await enqueue(() => save());
        if(stopped || current !== generation) return;
        const url = location.origin + location.pathname + '#/n/' + encodeURIComponent(slug) + (state.encrypted ? '?k=' + state.secret : '');
        try { await navigator.clipboard.writeText(url); button.textContent = '✓ 已复制'; } catch(_) { prompt('保存完整分享链接：', url); }
      } catch(_) {}
    };
    document.getElementById('destroyBtn').onclick = async () => {
      if(!confirm('确定销毁这份便签？此操作无法撤销。')) return;
      clearTimeout(timer);
      try { await enqueue(async () => { if(!state.exists) { stop(); scrub(); notice(root, '未保存的便签已丢弃。'); return; } const r = await api(endpoint(slug), 'DELETE', { token:state.token, revision:state.revision }); if(!r.ok) throw failure(r); stop(); forget(slug); scrub(); notice(root, '正文和访问凭据已删除。'); }); } catch(_) {}
    };
  }
  function route(){
    dispose(); dispose = () => {}; generation++;
    const current = generation, hash = location.hash || '#/';
    if(hash.startsWith('#/n/')){
      try {
        const [name, query] = hash.slice(4).split('?'), slug = decodeURIComponent(name), secret = new URLSearchParams(query || '').get('k');
        if(secret) history.replaceState(null, '', location.pathname + location.search + '#/n/' + encodeURIComponent(slug));
        open(slug, secret, current);
      } catch(_) { home(); }
    } else if(hash === '#/feedback') feedback(); else home();
  }
  function feedback(){
    app.innerHTML = nav() + `<div class="fb-wrap"><div class="fb-card"><div class="perforation"></div><h2>问题反馈</h2><p class="desc">遇到问题、有改进想法，或者只是想打个招呼？写在下面。反馈公开可见，请不要包含隐私信息。</p><label for="fbName">你的称呼（可选）</label><input type="text" id="fbName" placeholder="匿名"><label for="fbMsg">反馈内容</label><textarea id="fbMsg" placeholder="说说发生了什么…"></textarea><button class="go-btn fb-submit" id="fbSubmit">提交反馈</button><p class="fb-msg" id="fbMsgOk">已收到，感谢反馈！</p></div><div class="fb-list-wrap"><div class="fb-list-title">最近反馈</div><div id="fbList"></div></div></div>`;
    const list=document.getElementById('fbList');
    async function load(){
      try{ const r=await api('/api/feedback?limit=25'); if(!list.isConnected)return;
        list.innerHTML=r.data.items?.length?r.data.items.map(it=>`<div class="fb-item"><div class="meta"><span>${escapeHtml(it.name)}</span><span>${escapeHtml(new Date(it.createdAt).toLocaleString())}</span></div><div class="body">${escapeHtml(it.message)}</div></div>`).join(''):'<p class="fb-empty">还没有反馈，来写第一条吧</p>';
      }catch(_){if(list.isConnected)list.textContent='加载失败，请稍后重试。';}
    }
    document.getElementById('fbSubmit').onclick=async()=>{
      const name=document.getElementById('fbName').value.trim().slice(0,30),message=document.getElementById('fbMsg').value.trim();if(!message)return;
      try{const r=await api('/api/feedback','POST',{name,message});if(!r.ok)throw failure(r);if(!list.isConnected)return;document.getElementById('fbMsg').value='';document.getElementById('fbName').value='';document.getElementById('fbMsgOk').style.display='block';load();}catch(_){alert('提交失败，请稍后再试');}
    };load();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('pageshow', e => { if(e.persisted) route(); });
  route();
})();
