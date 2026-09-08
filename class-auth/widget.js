(function () {
  if (window.ClassAccount) return;

  var account = null;
  var button = null;
  var root = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  async function api(path, options) {
    options = options || {};
    var response = await fetch('/account-api' + path, {
      credentials: 'same-origin',
      cache: 'no-store',
      method: options.method || 'GET',
      headers: {'Content-Type':'application/json'},
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var data = {};
    try { data = await response.json(); } catch (_) { data.message = '账号服务返回内容不正确'; }
    if (!response.ok) throw new Error(data.message || '操作失败');
    return data;
  }

  function emit() {
    updateButton();
    window.dispatchEvent(new CustomEvent('class-account-change', { detail: { account: account } }));
  }

  function ensureStyle() {
    if (document.getElementById('classAccountStyle')) return;
    var style = document.createElement('style');
    style.id = 'classAccountStyle';
    style.textContent = [
      '.ca-fab{position:fixed;right:16px;bottom:16px;z-index:9990;border:1px solid rgba(92,228,255,.35);border-radius:999px;padding:10px 15px;color:#eafaff;background:#10283f;box-shadow:0 12px 38px rgba(0,0,0,.35);font:700 13px "Microsoft YaHei",sans-serif;cursor:pointer}',
      '.ca-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,8,15,.86);backdrop-filter:blur(10px)}',
      '.ca-card{position:relative;width:min(440px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(92,228,255,.28);border-radius:22px;padding:25px;color:#eefaff;background:linear-gradient(150deg,#102a43,#071522);box-shadow:0 32px 100px rgba(0,0,0,.6);font-family:"Microsoft YaHei",system-ui,sans-serif}',
      '.ca-card.ca-wide{width:min(650px,100%)}.ca-card h2{margin:0 38px 8px 0;font-size:24px}.ca-card p{color:#9bb2c3;line-height:1.7;font-size:13px}.ca-close{position:absolute;right:14px;top:13px;width:34px;height:34px;border:1px solid rgba(92,228,255,.22);border-radius:50%;color:#9bb2c3;background:transparent;cursor:pointer}',
      '.ca-field{display:block;width:100%;margin-top:10px;border:1px solid rgba(92,228,255,.24);border-radius:11px;padding:11px 13px;color:#eefaff;background:#071827;outline:none;font:inherit}.ca-field:focus{border-color:#5ce4ff;box-shadow:0 0 0 3px rgba(92,228,255,.08)}',
      '.ca-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:17px}.ca-button{border:1px solid rgba(92,228,255,.25);border-radius:11px;padding:10px 14px;color:#eefaff;background:#102a43;cursor:pointer;font:700 13px "Microsoft YaHei",sans-serif}.ca-button.primary{border:0;color:#06151e;background:linear-gradient(135deg,#5ce4ff,#70efb7)}.ca-button.warn{color:#ffd06e;border-color:rgba(255,208,110,.35)}.ca-button.danger{color:#ff8197;border-color:rgba(255,129,151,.35)}',
      '.ca-error{min-height:20px;margin-top:9px;color:#ff8197;font-size:13px}.ca-user{padding:14px;border:1px solid rgba(92,228,255,.2);border-radius:13px;background:rgba(7,24,39,.7)}.ca-user strong{font-size:20px}.ca-role{display:inline-block;margin-left:8px;padding:4px 8px;border-radius:99px;color:#70efb7;background:rgba(112,239,183,.09);font-size:11px}',
      '.ca-tabs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px}.ca-note{padding:12px;border-radius:11px;color:#ffd06e!important;background:rgba(255,208,110,.08)}.ca-account-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:12px}.ca-status{font-size:12px;color:#9bb2c3}.ca-status.on{color:#70efb7}',
      '@media(max-width:480px){.ca-actions,.ca-tabs,.ca-account-row{grid-template-columns:1fr;flex-direction:column}.ca-button{width:100%}}',
      '#classAccountRoot{color-scheme:dark;--ca-paper:#102a43;--ca-field:#071827;--ca-text:#eefaff;--ca-muted:#a9bdcc;--ca-line:#466078;--ca-accent:#5ce4ff;--ca-on-accent:#06151e;--ca-success:#70efb7;--ca-danger:#ff8197;--ca-warn:#ffd06e;--ca-note:#28303b;--ca-role:#143e3e;--ca-overlay:#02080fd9}',
      '#classAccountRoot[data-theme="light"]{color-scheme:light;--ca-paper:#fff;--ca-field:#f4f6f8;--ca-text:#1a2331;--ca-muted:#596674;--ca-line:#b8c4ce;--ca-accent:#245de2;--ca-on-accent:#fff;--ca-success:#217350;--ca-danger:#b73849;--ca-warn:#855012;--ca-note:#fff4dc;--ca-role:#e8f4ed;--ca-overlay:#17233770}',
      '#classAccountRoot,#classAccountRoot *{box-sizing:border-box}#classAccountRoot .ca-overlay{background:var(--ca-overlay)}',
      '#classAccountRoot .ca-card{background:var(--ca-paper);color:var(--ca-text);border-color:var(--ca-line)}#classAccountRoot .ca-card h2{color:var(--ca-text)}#classAccountRoot .ca-card p{color:var(--ca-muted)}',
      '#classAccountRoot .ca-field,#classAccountRoot .ca-field option{color:var(--ca-text);background:var(--ca-field);border-color:var(--ca-line);color-scheme:inherit}#classAccountRoot .ca-field{min-width:0;max-width:100%}#classAccountRoot .ca-field::placeholder{color:var(--ca-muted);opacity:1}',
      '#classAccountRoot .ca-field:focus,#classAccountRoot :focus-visible{outline:2px solid var(--ca-accent);outline-offset:2px;border-color:var(--ca-accent);box-shadow:none}',
      '#classAccountRoot .ca-button,#classAccountRoot .ca-close{background:var(--ca-field);color:var(--ca-text);border-color:var(--ca-line)}#classAccountRoot .ca-button.primary{background:var(--ca-accent);color:var(--ca-on-accent)}',
      '#classAccountRoot .ca-button.warn{color:var(--ca-warn)}#classAccountRoot .ca-button.danger,#classAccountRoot .ca-error{color:var(--ca-danger)}#classAccountRoot .ca-error.ca-success{color:var(--ca-success)}',
      '#classAccountRoot .ca-user{background:var(--ca-field);border-color:var(--ca-line);overflow-wrap:anywhere}#classAccountRoot .ca-role{color:var(--ca-success);background:var(--ca-role)}',
      '#classAccountRoot .ca-card .ca-note{color:var(--ca-warn)!important;background:var(--ca-note)}#classAccountRoot .ca-status{color:var(--ca-muted)}#classAccountRoot .ca-card .ca-status.on{color:var(--ca-success)}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureRoot() {
    ensureStyle();
    if (!root) {
      root = document.createElement('div');
      root.id = 'classAccountRoot';
      document.body.appendChild(root);
      var syncTheme = function () {
        root.dataset.theme = getComputedStyle(document.documentElement).colorScheme === 'light' ? 'light' : 'dark';
      };
      syncTheme();
      new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-design'] });
    }
    button = document.querySelector('[data-class-account]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'ca-fab';
      button.setAttribute('data-class-account', '');
      document.body.appendChild(button);
    }
    if (!button.dataset.caBound) {
      button.dataset.caBound = '1';
      button.addEventListener('click', open);
    }
    updateButton();
  }

  function updateButton() {
    if (!button) return;
    button.textContent = account ? ((account.isAdmin ? '⭐ ' : '👤 ') + account.name) : '👤 登录账号';
    button.title = account ? '打开账号中心' : '登录班级账号';
  }

  function close() { if (root) root.innerHTML = ''; }

  function showCard(html, wide) {
    ensureRoot();
    root.innerHTML = '<div class="ca-overlay"><div class="ca-card'+(wide?' ca-wide':'')+'"><button class="ca-close" type="button">×</button>'+html+'</div></div>';
    root.querySelector('.ca-close').onclick = close;
    root.querySelector('.ca-overlay').onclick = function (event) { if (event.target === event.currentTarget) close(); };
  }

  function loginView() {
    showCard('<h2>登录 803 班级账号</h2><p>同学请输入自己的学号（1～52），老师账号：语文 chi、数学 mat、英语 eng、科学 sci、社会 com，其他副科共用 tec。姓名名单不会在登录页公开。</p><input id="caLoginId" class="ca-field" type="text" autocomplete="username" maxlength="8" placeholder="输入学号或老师账号"><input id="caLoginPassword" class="ca-field" type="password" autocomplete="current-password" placeholder="输入密码"><div id="caError" class="ca-error"></div><div class="ca-actions"><button id="caLoginButton" class="ca-button primary" type="button">登录</button></div>');
    var submit = async function () {
      var id = root.querySelector('#caLoginId').value;
      var password = root.querySelector('#caLoginPassword').value;
      var error = root.querySelector('#caError');
      if (!id || !password) { error.textContent = '请输入学号或老师账号，以及密码'; return; }
      try {
        var data = await api('/login', { method: 'POST', body: { id: id, password: password } });
        account = data.account;
        close(); emit();
      } catch (problem) { error.textContent = problem.message; }
    };
    root.querySelector('#caLoginButton').onclick = submit;
    root.querySelector('#caLoginId').onkeydown = function (event) { if (event.key === 'Enter') root.querySelector('#caLoginPassword').focus(); };
    root.querySelector('#caLoginPassword').onkeydown = function (event) { if (event.key === 'Enter') submit(); };
  }

  function accountView() {
    var roleLabel = account.role === 'teacher' ? '老师 · 管理员' : (account.isAdmin ? '学生管理员' : '同学');
    var accountLabel = account.role === 'teacher' ? (esc(account.name)+' · 账号 '+esc(account.id)) : (esc(account.name)+' · 学号 '+esc(account.id));
    showCard('<h2>班级账号中心</h2><div class="ca-user"><strong>'+accountLabel+'</strong><span class="ca-role">'+roleLabel+'</span></div><div class="ca-tabs"><button id="caChangeButton" class="ca-button" type="button">修改我的密码</button>'+(account.isAdmin?'<button id="caManageButton" class="ca-button warn" type="button">管理全班账号</button>':'')+'</div><div class="ca-actions"><button id="caLogoutButton" class="ca-button danger" type="button">退出登录</button></div>');
    root.querySelector('#caChangeButton').onclick = changePasswordView;
    if (account.isAdmin) root.querySelector('#caManageButton').onclick = manageView;
    root.querySelector('#caLogoutButton').onclick = async function () {
      try { await api('/logout', { method: 'POST' }); } catch (_) {}
      account = null; close(); emit();
    };
  }

  function changePasswordView() {
    showCard('<h2>修改我的密码</h2><p>修改后，其他设备上的旧登录会失效。</p><input id="caCurrentPassword" class="ca-field" type="password" autocomplete="current-password" placeholder="当前密码"><input id="caNewPassword" class="ca-field" type="password" autocomplete="new-password" placeholder="新密码（至少 6 个字符）"><div id="caError" class="ca-error"></div><div class="ca-actions"><button id="caBack" class="ca-button" type="button">返回</button><button id="caSavePassword" class="ca-button primary" type="button">保存新密码</button></div>');
    root.querySelector('#caBack').onclick = accountView;
    root.querySelector('#caSavePassword').onclick = async function () {
      try {
        var data = await api('/change-password', { method: 'POST', body: {
          currentPassword: root.querySelector('#caCurrentPassword').value,
          newPassword: root.querySelector('#caNewPassword').value
        }});
        account = data.account; close(); emit();
      } catch (problem) { root.querySelector('#caError').textContent = problem.message; }
    };
  }

  async function manageView() {
    showCard('<h2>管理全班账号</h2><p class="ca-note">为了保护同学，旧密码无法查看。管理员可以直接设置一个新密码。</p><div id="caManageLoading">正在读取账号…</div>', true);
    try {
      var data = await api('/accounts');
      var options = data.accounts.map(function (item) {
        var suffix = item.role === 'teacher' ? '（老师 · 管理员）' : (item.isAdmin ? '（学生管理员）' : '');
        var label = item.role === 'teacher' ? (esc(item.id)+' · '+esc(item.name)) : ('学号 '+esc(item.id)+' · '+esc(item.name));
        return '<option value="'+esc(item.id)+'" data-enabled="'+(item.hasPassword?'1':'0')+'">'+label+suffix+'</option>';
      }).join('');
      var enabled = data.accounts.filter(function (item) { return item.hasPassword; }).length;
      root.querySelector('#caManageLoading').innerHTML = '<p class="ca-status on">已设置密码：'+enabled+' / '+data.accounts.length+'</p><select id="caManageId" class="ca-field">'+options+'</select><div class="ca-account-row"><input id="caManagePassword" class="ca-field" type="password" autocomplete="new-password" placeholder="输入新的临时密码"><button id="caSetPassword" class="ca-button primary" type="button">设置新密码</button></div><div id="caManageStatus" class="ca-error"></div><div class="ca-actions"><button id="caBack" class="ca-button" type="button">返回账号中心</button></div>';
      root.querySelector('#caBack').onclick = accountView;
      root.querySelector('#caSetPassword').onclick = async function () {
        var id = root.querySelector('#caManageId').value;
        var password = root.querySelector('#caManagePassword').value;
        var status = root.querySelector('#caManageStatus');
        try {
          await api('/accounts/password', { method: 'POST', body: { id: id, password: password } });
          status.classList.add('ca-success');
          status.textContent = '已为 '+id+' 设置新密码，旧登录已退出。';
          root.querySelector('#caManagePassword').value = '';
          if (id === account.id) { account = null; setTimeout(function () { close(); emit(); }, 900); }
        } catch (problem) { status.classList.remove('ca-success'); status.textContent = problem.message; }
      };
    } catch (problem) {
      root.querySelector('#caManageLoading').textContent = problem.message;
    }
  }

  function open() { account ? accountView() : loginView(); }

  var ready = (async function () {
    ensureRoot();
    try {
      var data = await api('/session');
      account = data.account || null;
    } catch (_) { account = null; }
    emit();
    return account;
  })();

  window.ClassAccount = {
    ready: ready,
    open: open,
    refresh: async function () {
      try { account = (await api('/session')).account || null; } catch (_) { account = null; }
      emit(); return account;
    },
    requireLogin: function () { if (!account) loginView(); return !!account; }
  };
  Object.defineProperty(window.ClassAccount, 'account', { get: function () { return account; } });
})();
