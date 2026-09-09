(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const categories = ['运动会预选赛', '日常生活', '八卦', '专题'];
  const statuses = { pending: '待审核', published: '已发布', rejected: '已退回' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const date = value => new Date(value).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });
  let me = {}, routeVersion = 0, category = '', page = 1, draft = null, editorOwner = null;
  let noticeTimer;
  const anonymousGuidanceSeen = new Set(), anonymousGuidancePending = new Map();
  function anonymousGuidance() {
    const owner = me.account?.id;
    if (!owner || anonymousGuidanceSeen.has(owner)) return Promise.resolve(true);
    if (anonymousGuidancePending.has(owner)) return anonymousGuidancePending.get(owner);
    const task = (async () => {
      try {
        const result = await api('/api/mine');
        if (result.articles.some(a => a.anonymous)) { anonymousGuidanceSeen.add(owner); return true; }
      } catch (_) { /* 无法读取历史时仍展示说明，避免漏掉首次提示。 */ }
      if (me.account?.id !== owner || !$('#newsForm')) return false;
      return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'guidance-dialog';
        dialog.setAttribute('aria-labelledby', 'guidanceTitle');
        dialog.innerHTML = '<h2 id="guidanceTitle">拒稿答疑</h2><p>首次匿名投稿前，请了解：</p><p>稿件中出现不文明用语、涉及敏感话题等情况，将会被拒稿。</p><p class="help">匿名仅对读者隐藏姓名，审核人仍可查看投稿人。请文明表达，认真核实内容。</p><button type="button" class="primary">我已了解</button>';
        document.body.appendChild(dialog);
        const finish = accepted => { if (accepted) anonymousGuidanceSeen.add(owner); dialog.close(); dialog.remove(); resolve(accepted); };
        $('button', dialog).onclick = () => finish(true);
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        dialog.showModal();
      });
    })().finally(() => anonymousGuidancePending.delete(owner));
    anonymousGuidancePending.set(owner, task);
    return task;
  }
  function notice(message) { $('#notice').textContent = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').textContent = '', 5500); }
  async function api(url, data) {
    const response = await fetch(url, { credentials:'same-origin', cache:'no-store', ...(data ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '操作失败，请重试');
    return result;
  }
  let identityPending;
  function identity() {
    if (identityPending) return identityPending;
    identityPending = (async () => {
      me = await api('/api/me');
      $('#reviewNav').hidden = !me.canReview;
      $('#pendingCount').textContent = me.pending ? `(${me.pending})` : '';
    })().finally(() => { identityPending = null; });
    return identityPending;
  }
  function headline(a, editable = false) {
    return `<div class="headline"><h1>${esc(a.title || (editable ? '在这里写下新闻主标题' : ''))}</h1>${['kicker','subtitle'].map(key => a[key] ? `<p class="aux ${key} ${editable ? 'draggable' : ''}" data-position="${key}" ${editable ? 'tabindex="0" role="button" aria-label="拖动调整位置，也可使用方向键"' : ''}>${esc(a[key])}</p>` : '').join('')}</div>`;
  }
  function place(root, positions) {
    root.querySelectorAll('[data-position]').forEach(el => {
      const key = el.dataset.position, p = positions?.[key] || { x:0, y:key === 'kicker' ? 0 : 100 };
      const box = el.parentElement;
      el.style.left = `${Math.max(0, box.clientWidth - el.offsetWidth) * p.x / 100}px`;
      el.style.top = `${Math.max(0, box.clientHeight - el.offsetHeight) * p.y / 100}px`;
    });
  }
  function article(a) {
    return `<article class="reading"><span class="tag">${esc(a.category)}</span>${headline(a)}<div class="meta"><span>${esc(a.author || (a.anonymous ? '匿名投稿' : a.authorName))}</span><span>${date(a.publishedAt || a.submittedAt)}</span></div><div class="article-body">${esc(a.body)}</div></article>`;
  }
  function loginGate() {
    $('#view').innerHTML = '<div class="empty"><h1>登录班级账号后继续</h1><p>使用与擂台赛、积分中心相同的账号。</p><button class="primary" id="signIn">登录账号</button></div>';
    $('#signIn').onclick = () => window.ClassAccount?.open();
  }
  async function home(version) {
    const result = await api(`/api/articles?category=${encodeURIComponent(category)}&page=${page}`);
    if (version !== routeVersion) return;
    $('#view').innerHTML = `<div class="section-head"><h1>班级新鲜事<span style="color:var(--blue)">。</span></h1><span class="muted">${result.total} 篇新闻已发布</span></div><div class="filters" aria-label="新闻分区">${['',...categories].map(c => `<button data-category="${esc(c)}" class="${c === category ? 'active' : ''}" aria-pressed="${c === category}">${c || '全部新闻'}</button>`).join('')}</div>${result.articles.length ? `<div class="articles">${result.articles.map(a => `<a class="news-card" href="#article/${a.id}"><span class="tag">${esc(a.category)}</span>${a.kicker ? `<div class="muted">${esc(a.kicker)}</div>` : ''}<h2>${esc(a.title)}</h2>${a.subtitle ? `<p>${esc(a.subtitle)}</p>` : ''}<p>${esc(a.excerpt)}</p><div class="meta"><span>${esc(a.author)}</span><span>${date(a.publishedAt)}</span><span>阅读全文 ↗</span></div></a>`).join('')}</div>` : '<div class="empty"><h2>这一页，等你来写</h2><p>这里还没有已发布的新闻。分享班级里的第一件新鲜事吧。</p><a class="primary" href="#write">写一篇投稿</a></div>'}<div class="pager">${page > 1 ? '<button id="prev">上一页</button>' : ''}${result.total > 20 ? `<span>第 ${page} 页</span>` : ''}${page * 20 < result.total ? '<button id="next">下一页</button>' : ''}</div>`;
    document.querySelectorAll('[data-category]').forEach(b => b.onclick = () => { category = b.dataset.category; page = 1; render(); });
    if ($('#prev')) $('#prev').onclick = () => { page--; render(); };
    if ($('#next')) $('#next').onclick = () => { page++; render(); };
  }
  function emptyDraft() { return { title:'', kicker:'', subtitle:'', body:'', category:categories[0], anonymous:false, positions:{kicker:{x:0,y:0},subtitle:{x:0,y:100}} }; }
  function edit() {
    if (!me.account) return loginGate();
    if (!draft || editorOwner !== me.account.id) draft = emptyDraft();
    editorOwner = me.account.id;
    $('#view').innerHTML = `<div class="section-head"><h1>写下班级的新鲜事</h1><span class="muted">递交审核，通过后发布</span></div><div class="editor"><form id="newsForm" class="panel"><label>主标题 · 必填<input name="title" maxlength="80" required value="${esc(draft.title)}" placeholder="给新闻一个清晰的标题"></label><div class="two"><label>分区<select name="category">${categories.map(c=>`<option ${c===draft.category?'selected':''}>${c}</option>`).join('')}</select></label><label>署名方式<select name="anonymous"><option value="false" ${!draft.anonymous?'selected':''}>实名投稿</option><option value="true" ${draft.anonymous?'selected':''}>匿名投稿</option></select></label></div><p class="help">实名显示账号姓名；匿名对读者隐藏姓名，审核人仍可查看投稿人。</p><label>引题 · 可选<input name="kicker" maxlength="80" value="${esc(draft.kicker)}" placeholder="在主标题前，交代新闻背景"></label><label>副标题 · 可选<input name="subtitle" maxlength="120" value="${esc(draft.subtitle)}" placeholder="补充新闻细节"></label><div class="two"><label>引题预设位置<select id="kickerPreset"><option value="">自定义位置</option><option value="0,0">左上</option><option value="50,0">上方居中</option><option value="100,0">右上</option><option value="0,100">左下</option></select></label><label>副标题预设位置<select id="subtitlePreset"><option value="">自定义位置</option><option value="0,100">左下</option><option value="50,100">下方居中</option><option value="100,100">右下</option><option value="0,0">左上</option></select></label></div><label>正文 · 必填<textarea name="body" maxlength="30000" required placeholder="记录发生了什么、时间、地点，以及你想分享的细节。支持分段。">${esc(draft.body)}</textarea></label><div class="toolbar"><button type="submit" class="primary">递交审核 →</button><a href="#home">返回首页</a></div><p class="help" id="formStatus" role="status"></p></form><section class="preview panel"><h2>版面预览</h2><p class="help">引题、副标题可直接拖动，也可选中后用方向键微调。主标题保持居中。</p><div id="previewArticle"></div></section></div>`;
    const form = $('#newsForm');
    form.addEventListener('input', event => {
      if (event.target.name) { draft[event.target.name] = event.target.name === 'anonymous' ? event.target.value === 'true' : event.target.value; preview(); }
      if (event.target.name === 'anonymous' && draft.anonymous) anonymousGuidance();
    });
    for (const key of ['kicker','subtitle']) {
      const select = $(`#${key}Preset`);
      const current = `${draft.positions[key].x},${draft.positions[key].y}`;
      select.value = [...select.options].some(o=>o.value===current) ? current : '';
      select.onchange = () => { if (!select.value) return; const [x,y] = select.value.split(',').map(Number); draft.positions[key] = {x,y}; preview(); };
    }
    form.onsubmit = async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', form); button.disabled = true;
      if (draft.anonymous && !(await anonymousGuidance())) { button.disabled = false; return; }
      if (!form.isConnected || editorOwner !== me.account?.id) return;
      $('#formStatus').textContent = '正在送达审核箱…';
      try {
        await api('/api/submit', draft); draft = null;
        notice('投稿成功，已递交审核。'); location.hash = '#mine';
      } catch(error) { $('#formStatus').textContent = error.message; button.disabled = false; }
    };
    preview();
    if (draft.anonymous) anonymousGuidance();
  }
  function preview() {
    const root = $('#previewArticle'); if (!root || !draft) return;
    root.innerHTML = `<span class="tag">${esc(draft.category)}</span>${headline(draft,true)}<p class="meta">${draft.anonymous ? '匿名投稿' : esc(me.account?.name)}</p><div class="article-body">${esc(draft.body || '你的正文会显示在这里。')}</div>`;
    place(root, draft.positions);
    root.querySelectorAll('.draggable').forEach(el => {
      const key = el.dataset.position;
      let dragging = null;
      el.onpointerdown = e => { e.preventDefault(); el.focus(); dragging = {x:e.clientX,y:e.clientY,left:el.offsetLeft,top:el.offsetTop}; el.setPointerCapture(e.pointerId); };
      el.onpointermove = e => {
        if (!dragging) return;
        const width = el.parentElement.clientWidth-el.offsetWidth, height = el.parentElement.clientHeight-el.offsetHeight;
        draft.positions[key] = { x:width > 0 ? Math.max(0,Math.min(100,(dragging.left+e.clientX-dragging.x)/width*100)) : 0,
          y:height > 0 ? Math.max(0,Math.min(100,(dragging.top+e.clientY-dragging.y)/height*100)) : 0 };
        $(`#${key}Preset`).value = ''; place(root,draft.positions);
      };
      el.onpointerup = el.onpointercancel = () => { dragging = null; };
      el.onkeydown = e => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
        e.preventDefault(); const p = draft.positions[key], step = e.shiftKey ? 5 : 1;
        p.x = Math.max(0,Math.min(100,p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)));
        p.y = Math.max(0,Math.min(100,p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)));
        $(`#${key}Preset`).value=''; place(root,draft.positions);
      };
    });
  }
  async function submissions(review, version) {
    if (!me.account) return loginGate();
    if (review && !me.canReview) { $('#view').innerHTML='<div class="empty"><h1>审核箱仅对审核人开放</h1><a href="#home">返回新闻首页</a></div>'; return; }
    const result = await api(review ? '/api/review' : '/api/mine');
    if(version!==routeVersion) return;
    $('#view').innerHTML=`<div class="section-head"><h1>${review?'审核箱':'我的投稿'}</h1><span class="muted">${review?'待审核':'全部投稿'} · ${result.articles.length} 篇</span></div>${result.articles.length ? result.articles.map(a=>`<section class="panel review-item" data-id="${a.id}"><div class="meta"><span class="status">${statuses[a.status]}</span><span>${esc(a.category)}</span><span>${date(a.submittedAt)}</span>${review?`<span>投稿人：${esc(a.authorName)} · ${a.anonymous?'对外匿名':'实名'}</span>`:''}</div><details><summary>${esc(a.title)}</summary>${article(a)}</details>${a.reviewNote?`<p class="review-note">审核意见：${esc(a.reviewNote)}</p>`:''}${review?`<label>审核意见（退回时必填）<textarea data-note maxlength="500" rows="2" style="min-height:80px" placeholder="写下需要修改的地方"></textarea></label><div class="toolbar"><button class="primary" data-action="approve">通过并发布</button><button data-action="reject">退回修改</button></div>`:a.status==='published'?`<a class="tag" href="#article/${a.id}">查看已发布新闻 ↗</a>`:a.status==='rejected'?'<button data-rewrite>修改后重新投稿</button>':''}</section>`).join(''):`<div class="empty"><h2>${review?'暂时没有待审核稿件':'你还没有投稿'}</h2><p>${review?'新投稿送达后，会出现在这里。':'记录一件今天发生的新鲜事吧。'}</p>${review?'':'<a class="primary" href="#write">写一篇投稿</a>'}</div>`}`;
    result.articles.forEach(a=>{
      const root=$(`[data-id="${a.id}"]`);
      $('details',root).ontoggle=()=>place(root,a.positions);
      root.dataset.positions=JSON.stringify(a.positions);
      if($('[data-rewrite]',root)) $('[data-rewrite]',root).onclick=()=>{draft={...a,positions:structuredClone(a.positions)};editorOwner=me.account.id;location.hash='#write';};
      root.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
        const note=$('[data-note]',root).value.trim();
        if(button.dataset.action==='reject'&&!note) return notice('请填写退回原因，方便投稿人修改。');
        root.querySelectorAll('button').forEach(b=>b.disabled=true);
        try {await api(`/api/review/${a.id}`,{action:button.dataset.action,note});notice(button.dataset.action==='approve'?'新闻已发布。':'已退回，投稿人可在“我的投稿”查看意见。');await render();}
        catch(error){notice(error.message);root.querySelectorAll('button').forEach(b=>b.disabled=false);}
      });
    });
  }
  async function render() {
    const version=++routeVersion, route=location.hash.slice(1)||'home';
    document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===route));
    $('#view').innerHTML='<p class="muted" role="status">正在加载…</p>';
    try {
      if (['write','mine','review'].includes(route)) { await identity(); if(version!==routeVersion)return; }
      else identity().catch(() => {});
      if(route==='write')return edit();
      if(route==='mine'||route==='review')return await submissions(route==='review',version);
      if(route.startsWith('article/')){
        const {article:a}=await api('/api/articles/'+encodeURIComponent(route.slice(8)));if(version!==routeVersion)return;
        $('#view').innerHTML=`<p><a class="tag" href="#home">← 返回新闻首页</a></p>${article(a)}`;
        $('.reading').dataset.positions=JSON.stringify(a.positions);place($('#view'),a.positions);return;
      }
      await home(version);
    }catch(error){if(version===routeVersion){$('#view').innerHTML=`<div class="empty"><h2>暂时无法加载</h2><p>${esc(error.message)}</p><button id="retry">重新加载</button></div>`;$('#retry').onclick=render;}}
  }
  window.addEventListener('hashchange',render);
  window.addEventListener('class-account-change',()=>{
    draft=null;editorOwner=null;
    // 登录初始事件不重复下载公开新闻；私密视图依然重新验证。
    const route=location.hash.slice(1)||'home';
    const refresh=()=>['write','mine','review'].includes(route)?render():identity().catch(()=>{});
    if(identityPending) identityPending.then(refresh,refresh); else refresh();
  });
  window.addEventListener('beforeunload',event=>{if(draft&&(draft.title||draft.body||draft.kicker||draft.subtitle)){event.preventDefault();event.returnValue='';}});
  window.addEventListener('resize',()=>{
    if($('#previewArticle')&&draft)place($('#previewArticle'),draft.positions);
    document.querySelectorAll('[data-positions]').forEach(root=>place(root,JSON.parse(root.dataset.positions)));
  });
  // 站内审核箱每半分钟刷新待审数量，不向外部平台发送消息。
  setInterval(async()=>{if(document.hidden||!me.canReview)return;try{const old=me.pending;await identity();if(old!==me.pending){if(location.hash==='#review')render();else notice(`审核箱有 ${me.pending} 篇待审稿件`);}}catch(_){}},30000);
  $('#today').textContent=date(new Date());
  render();
})();
