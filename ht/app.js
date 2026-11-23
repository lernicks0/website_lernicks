'use strict';

const byId = id => document.getElementById(id);
const fileInput = byId('files');
const folderInput = byId('folder');
const dropzone = byId('dropzone');
const list = byId('file-list');
const entrySelect = byId('entry');
const uploadStatus = byId('upload-status');
const resultStatus = byId('result-status');
const submit = byId('submit');
const result = byId('result');
const editEntry = byId('edit-entry');
const saveEntry = byId('save-entry');
const shareField = byId('share-url');
const historyList = byId('history');
const storageKey = 'ht-projects';
const keyPattern = /^([a-f0-9]{24})\.([a-f0-9]{64})$/;
const html = /\.html?$/i;
let selected = [];
let preferredEntry = '';
let ready = false;
let publishing = false;
let saving = false;
let current;
let opened = 0;
let projects = [];

try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(stored)) projects = stored.filter(item => keyPattern.test(item?.key));
} catch {
  // The management link also works when browser storage is unavailable.
}

function status(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle('error', error);
}

function setOptions(select, values, value, placeholder) {
  select.replaceChildren();
  if (placeholder) {
    const option = new Option(placeholder, '');
    option.disabled = true;
    select.add(option);
  }
  for (const name of values) select.add(new Option(name, name));
  select.value = value;
}

function refreshFiles(message = '') {
  const paths = selected.map(item => item.name);
  const pages = paths.filter(name => html.test(name));
  const bytes = selected.reduce((sum, item) => sum + item.file.size, 0);
  const preferred = pages.includes(preferredEntry) ? preferredEntry :
    pages.find(name => name.toLowerCase() === 'index.html') || (pages.length === 1 ? pages[0] : '');
  setOptions(entrySelect, pages, preferred, preferred ? '' : pages.length ? '请选择一个 HTML' : '等待上传 HTML');
  entrySelect.disabled = !pages.length || publishing;
  byId('selection').hidden = !selected.length;
  byId('summary').textContent = `${selected.length} 个文件 · ${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  list.replaceChildren(...selected.map(item => {
    const li = document.createElement('li');
    li.textContent = item.name;
    return li;
  }));
  const error = selected.length > 100 ? '每个项目最多上传 100 个文件。' :
    bytes > 20 * 1024 * 1024 ? '每个项目最大 20 MB。' :
    selected.length && !pages.length ? '请添加一个 HTML 文件。' : '';
  ready = !error && !!pages.length;
  submit.disabled = publishing || !ready || !entrySelect.value;
  status(uploadStatus, error || message, !!error || !!message);
}

function addFiles(files, folder = false) {
  if (publishing) return;
  const seen = new Set(selected.map(item => item.name));
  let duplicate = false;
  for (const file of files) {
    const name = folder ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name;
    if (seen.has(name)) {
      duplicate = true;
      continue;
    }
    seen.add(name);
    selected.push({ name, file });
  }
  refreshFiles(duplicate ? '已保留先选的同路径文件。' : '');
}

function remember(project) {
  const item = { key: project.key, entry: project.entry };
  projects = [item, ...projects.filter(previous => previous.key !== item.key)].slice(0, 50);
  try { localStorage.setItem(storageKey, JSON.stringify(projects)); } catch {}
  renderHistory();
}

function renderHistory() {
  byId('history-empty').hidden = !!projects.length;
  historyList.replaceChildren(...projects.map(item => {
    const row = document.createElement('li');
    const name = document.createElement('span');
    const open = document.createElement('button');
    name.textContent = item.entry;
    open.type = 'button';
    open.className = 'plain';
    open.textContent = '管理';
    open.setAttribute('aria-label', `管理 ${item.entry}`);
    open.addEventListener('click', () => openProject(item.key));
    row.append(name, open);
    return row;
  }));
}

async function api(url, { method, key, body, type } = {}) {
  const headers = { 'X-HT-Request': '1' };
  if (key) headers.Authorization = 'Bearer ' + key.split('.')[1];
  if (type) headers['Content-Type'] = type;
  const response = await fetch(url, { method, headers, body, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function showProject(data, key, message = '', scroll = true) {
  current = { ...data, key };
  setOptions(editEntry, data.entries, data.entry);
  shareField.value = new URL(data.url, location.origin).href;
  byId('open').href = shareField.value;
  saveEntry.disabled = true;
  result.hidden = false;
  remember(current);
  status(resultStatus, message);
  if (scroll) result.scrollIntoView({ block: 'start' });
}

async function openProject(key) {
  const match = keyPattern.exec(key);
  if (!match) return;
  const request = ++opened;
  try {
    const data = await api('/api/projects/' + match[1], { key });
    if (request === opened) showProject(data, key);
  } catch (error) {
    if (request !== opened) return;
    const element = result.hidden ? uploadStatus : resultStatus;
    status(element, error.message, true);
    element.scrollIntoView({ block: 'nearest' });
  }
}

function setPublishing(state) {
  publishing = state;
  for (const id of ['choose-files', 'choose-folder', 'clear']) byId(id).disabled = state;
  submit.textContent = state ? '正在发布…' : '发布并生成链接';
  refreshFiles();
}

async function copy(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    status(resultStatus, label + '已复制。');
  } catch {
    window.prompt('复制' + label, value);
  }
}

byId('choose-files').addEventListener('click', () => fileInput.click());
byId('choose-folder').addEventListener('click', () => folderInput.click());
fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});
folderInput.addEventListener('change', () => {
  addFiles(folderInput.files, true);
  folderInput.value = '';
});
dropzone.addEventListener('dragover', event => {
  event.preventDefault();
  if (!publishing) dropzone.classList.add('active');
});
dropzone.addEventListener('dragleave', event => {
  if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('active');
});
dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('active');
  if (Array.from(event.dataTransfer.items).some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
    status(uploadStatus, '请点击「选择文件夹」上传完整目录。', true);
    return;
  }
  addFiles(event.dataTransfer.files);
});
byId('clear').addEventListener('click', () => {
  selected = [];
  preferredEntry = '';
  refreshFiles();
});
entrySelect.addEventListener('change', () => {
  preferredEntry = entrySelect.value;
  submit.disabled = publishing || !ready || !entrySelect.value;
});
byId('publish').addEventListener('submit', async event => {
  event.preventDefault();
  if (publishing || !ready || !entrySelect.value) return;
  const manifest = { files: selected.map(item => item.name), entry: entrySelect.value };
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));
  for (const item of selected) form.append('file', item.file, 'file');
  setPublishing(true);
  const request = ++opened;
  let message = '';
  try {
    const data = await api('/api/projects', { method: 'POST', body: form });
    const key = data.id + '.' + data.token;
    selected = [];
    preferredEntry = '';
    if (request === opened) showProject(data, key, '发布成功。');
    else remember({ ...data, key });
  } catch (error) {
    message = error.message;
  } finally {
    setPublishing(false);
    if (message) status(uploadStatus, message, true);
  }
});
byId('copy-share').addEventListener('click', () => copy(shareField.value, '分享链接'));
byId('copy-manage').addEventListener('click', () => copy(location.origin + '/#manage=' + current.key, '管理链接'));
editEntry.addEventListener('change', () => {
  saveEntry.disabled = saving || editEntry.value === current.entry;
});
byId('edit').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving || !current || editEntry.value === current.entry) return;
  const { id, key } = current;
  const entry = editEntry.value;
  saving = true;
  saveEntry.disabled = true;
  editEntry.disabled = true;
  status(resultStatus, '正在保存…');
  try {
    const data = await api('/api/projects/' + id, {
      method: 'PATCH', key, body: JSON.stringify({ entry }), type: 'application/json',
    });
    if (current.id === id) showProject(data, key, '入口已更新。', false);
    else remember({ ...data, key });
  } catch (error) {
    if (current.id === id) status(resultStatus, error.message, true);
  } finally {
    saving = false;
    editEntry.disabled = false;
    saveEntry.disabled = editEntry.value === current.entry;
  }
});

function openFromHash() {
  if (!location.hash.startsWith('#manage=')) return;
  const key = location.hash.slice('#manage='.length);
  history.replaceState(null, '', location.pathname + location.search);
  openProject(key);
}

refreshFiles();
renderHistory();
openFromHash();
window.addEventListener('hashchange', openFromHash);
