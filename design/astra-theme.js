/* Astra 外观层。切换只更新页面属性，不重新加载、不触碰业务数据。 */
(function () {
  'use strict';
  var root = document.documentElement;
  var site = root.getAttribute('data-astra-site');
  var isNote = site === 'note';
  var storageKey = 'lernicks_design_v1';
  var meta = document.querySelector('meta[name="theme-color"]');
  var oldColor = meta ? meta.content : '#07111f';
  var choices = isNote ? [['astra', '新版'], ['classic', '经典'], ['tech', '科技']] : [['astra', '新版'], ['original', '原版']];
  function valid(value) { return choices.some(function (item) { return item[0] === value; }); }
  var selected = 'astra';
  try {
    var stored = localStorage.getItem(storageKey);
    if (valid(stored)) selected = stored;
    // 保留笔记使用者之前明确选过的经典 / 科技偏好。
    else if (isNote && !stored) {
      var previous = localStorage.getItem('tg_note_theme_v1');
      if (previous === 'classic' || previous === 'tech') selected = previous;
    }
  } catch (_) {}
  function apply(value, save) {
    if (!valid(value)) return;
    selected = value;
    root.setAttribute('data-design', value);
    root.classList.toggle('astra', value === 'astra');
    if (isNote) root.setAttribute('data-note-theme', value === 'tech' ? 'tech' : 'classic');
    if (meta) meta.content = value === 'astra' ? '#f6f7f9' : (isNote ? (value === 'tech' ? '#050b14' : '#12203a') : oldColor);
    document.querySelectorAll('[data-design-picker]').forEach(function (input) { input.value = value; });
    if (save) {
      try {
        localStorage.setItem(storageKey, value);
        if (isNote && value !== 'astra') localStorage.setItem('tg_note_theme_v1', value);
      } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('lernicks-design-change', { detail: { design: value } }));
  }
  apply(selected, false);
  function mount() {
    var target = isNote ? document.querySelector('.topnav nav') : document.querySelector('.top-actions, .security-tools, header .actions');
    if (!target) {
      var header = document.querySelector('header.topbar, .top');
      if (!header) return;
      target = document.createElement('div');
      target.className = 'astra-header-actions';
      var home = header.querySelector('.home, .home-link');
      if (home) target.appendChild(home);
      header.appendChild(target);
    }
    if (target.querySelector('[data-design-picker]')) return;
    var label = document.createElement('label');
    label.className = 'design-switch';
    var text = document.createElement('span');
    text.textContent = '外观';
    var input = document.createElement('select');
    input.setAttribute('data-design-picker', '');
    input.setAttribute('aria-label', '网站外观');
    choices.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item[0]; option.textContent = item[1]; input.appendChild(option);
    });
    input.value = selected;
    label.appendChild(text); label.appendChild(input); target.appendChild(label);
  }
  document.addEventListener('change', function (event) {
    if (event.target.matches('[data-design-picker]')) apply(event.target.value, true);
  });
  window.addEventListener('storage', function (event) {
    if (event.key === storageKey && valid(event.newValue)) apply(event.newValue, false);
  });
  document.addEventListener('DOMContentLoaded', function () {
    mount();
    if (isNote) {
      var app = document.getElementById('app');
      if (app) new MutationObserver(mount).observe(app, { childList: true, subtree: true });
    }
    if (site === 'pk') {
      // 由现有成绩文字生成新版记分牌；原文字保留，原版仍可直接显示。
      function scoreboards() {
        document.querySelectorAll('.pk-item').forEach(function (row) {
          if (row.querySelector('.astra-scoreboard')) return;
          var versus = row.querySelector('.pk-vs');
          var self = row.querySelector('.pk-self');
          var opponent = row.querySelector('.pk-opp');
          var scores = versus && versus.textContent.match(/^\((\d+(?:\.\d+)?)\) PK \((\d+(?:\.\d+)?)\)$/);
          if (!scores || !self || !opponent) return;
          var board = document.createElement('div');
          board.className = 'astra-scoreboard astra-only';
          function competitor(name, score) {
            var side = document.createElement('div');
            var label = document.createElement('span'); label.textContent = name;
            var value = document.createElement('strong'); value.textContent = score;
            side.appendChild(label); side.appendChild(value); return side;
          }
          board.appendChild(competitor(self.textContent, scores[1]));
          var vs = document.createElement('em'); vs.textContent = 'VS'; board.appendChild(vs);
          board.appendChild(competitor(opponent.textContent, scores[2]));
          Array.from(row.children).forEach(function (child) {
            if (!child.classList.contains('score-info')) child.setAttribute('data-astra-score-source', '');
          });
          row.appendChild(board);
        });
      }
      scoreboards();
      ['.container', '#dlgContainer'].forEach(function (selector) {
        var container = document.querySelector(selector);
        if (container) new MutationObserver(scoreboards).observe(container, { childList: true, subtree: true });
      });
    }
  });
  window.LernicksDesign = { set: function (value) { apply(value, true); }, get: function () { return selected; } };
})();
