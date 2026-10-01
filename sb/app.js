'use strict';
const members = {
  fish: { name: '水滴鱼', lines: ['别问，问就是在深度思考。', '今天的计划：没有计划。', '不是我不努力，是水的浮力太努力。', '情绪稳定，稳定地不想动。', '生活有起有落，我选择躺着。'] },
  elf: { name: '芙莉莲', lines: ['才等了十分钟，很快啊。', '这个宝箱，一定不是宝箱怪吧。', '再睡五分钟……人类的五分钟。', '我想收集让作业自己写完的魔法。', '下次见面，就约在一百年后吧。'] },
  dragon: { name: '奶龙', lines: ['我有一个成熟的想法：开饭！', '脑袋可以空，肚子不可以。', '今天的烦恼，明天再嚼。', '只要吃得够快，烦恼就追不上我。', '快乐很简单：再来一碗！'] }
};
const scenes = {
  break: { setting: '一个平平无奇的下午，大家决定什么也不做。', lines: [['fish', '我宣布：今天适合躺着。'], ['elf', '休息十年，应该够了吧。'], ['dragon', '躺着能吃东西吗？能的话我加入！']] },
  chest: { setting: '路边出现一个可疑的宝箱，精灵的眼睛亮了。', lines: [['elf', '这里面可能有很稀有的魔法。'], ['fish', '我看它好像有牙。'], ['dragon', '有牙？那它会跟我抢饭吗？']] },
  meal: { setting: '墙上的钟刚到十二点，奶龙已经坐在了餐桌前。', lines: [['dragon', '集合！这是今天最重要的会议！'], ['elf', '我研究了一种让面包变好吃的魔法。'], ['fish', '帮我送到嘴边，谢谢。']] }
};
const indices = { fish: 0, elf: 0, dragon: 0 };
const sceneKeys = Object.keys(scenes);
let activeScene = 'break';
let lastRandom = '';
let toastTimer;
function say(key) {
  indices[key] = (indices[key] + 1) % members[key].lines.length;
  const line = members[key].lines[indices[key]];
  const quote = document.getElementById('quote-' + key);
  quote.textContent = '“' + line + '”';
  quote.classList.remove('pulse');
  void quote.offsetWidth;
  quote.classList.add('pulse');
  return line;
}
document.querySelectorAll('[data-member]').forEach(button => {
  button.addEventListener('click', () => say(button.dataset.member));
});
function closeToast() { document.getElementById('toast').hidden = true; clearTimeout(toastTimer); }
document.getElementById('random-act').addEventListener('click', () => {
  const keys = Object.keys(members).filter(key => key !== lastRandom);
  const key = keys[Math.floor(Math.random() * keys.length)];
  lastRandom = key;
  document.getElementById('toast-name').textContent = members[key].name + '突然有话说';
  document.getElementById('toast-line').textContent = '“' + say(key) + '”';
  document.getElementById('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(closeToast, 10000);
});
document.getElementById('toast-close').addEventListener('click', closeToast);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeToast(); });
function showScene(key) {
  activeScene = key;
  const scene = scenes[key];
  document.getElementById('scene-setting').textContent = scene.setting;
  document.getElementById('scene').setAttribute('aria-labelledby', 'tab-' + key);
  document.querySelectorAll('[data-scene]').forEach(button => {
    const selected = button.dataset.scene === key;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  const dialogue = document.getElementById('dialogue');
  dialogue.replaceChildren(...scene.lines.map(([member, text]) => {
    const row = document.createElement('div'); row.className = 'dialogue-row';
    const avatar = document.createElement('span'); avatar.className = 'avatar ' + member; avatar.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img'); image.src = '/assets/trio.webp'; image.alt = ''; avatar.append(image);
    const content = document.createElement('div');
    const name = document.createElement('span'); name.className = 'line-name'; name.textContent = members[member].name;
    const line = document.createElement('p'); line.className = 'line-text'; line.textContent = text;
    content.append(name, line); row.append(avatar, content); return row;
  }));
}
document.querySelectorAll('[data-scene]').forEach(button => {
  button.addEventListener('click', () => showScene(button.dataset.scene));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = sceneKeys.indexOf(activeScene);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = sceneKeys.length - 1;
    else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + sceneKeys.length) % sceneKeys.length;
    showScene(sceneKeys[index]);
    document.getElementById('tab-' + activeScene).focus();
  });
});
document.getElementById('next-scene').addEventListener('click', () => {
  showScene(sceneKeys[(sceneKeys.indexOf(activeScene) + 1) % sceneKeys.length]);
});
showScene(activeScene);
