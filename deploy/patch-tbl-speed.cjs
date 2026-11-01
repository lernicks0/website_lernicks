const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), vm = require('node:vm');
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Patch context differs: ' + before.slice(0, 100));
  return source.replace(before, after);
}
function patchHtml(html, client) {
  if (html.includes('id="tbl-speed-client"')) {
    assert.ok(html.includes(client.trim()), 'Different speed client already installed'); return html;
  }
  html = once(html, '</head>', `<style id="tbl-speed-style">.speed-options{margin:18px 0;padding:14px;border:1px solid var(--line);border-radius:8px;font-size:13px;line-height:1.8}.speed-options label{display:flex;gap:9px;align-items:flex-start;cursor:pointer}.speed-options input{margin-top:5px;flex-shrink:0}.speed-options small{display:block;color:var(--muted);margin-left:22px}</style>\n<script id="tbl-speed-client">\n${client.trim()}\n</script>\n</head>`);
  html = once(html, '<div class="admin-key-box">', '<div class="speed-options"><label><input id="smartCompress" type="checkbox" checked><span>图片加速：压缩 JPEG / 静态 PNG，长边最多 2560 像素</span></label><small>会转为 WebP，可能损失细节；取消勾选保留原文件。GIF、动态 PNG、已有 WebP 和其他文件保持原样。</small></div>\n        <div class="admin-key-box">');
  html = once(html, "let selectedFile=null,previewObjectUrl='',uploading=false,currentUpload=null;", "let selectedFile=null,previewObjectUrl='',resultObjectUrl='',uploading=false,currentUpload=null;");
  html = once(html, 'if(!file){toast(', 'if(uploading)return;\n      if(!file){toast(');
  html = once(html, "function setUploading(value){uploading=value;", "function setUploading(value){uploading=value;adminKeyInput.disabled=value;document.getElementById('smartCompress').disabled=value;");
  html = once(html, 'function uploadSelected(){', 'async function uploadSelected(){');
  html = once(html, "const form=new FormData();form.append('image',selectedFile,selectedFile.name||'pasted-image.png');", "const prepared=await TblSpeed.prepare(selectedFile,document.getElementById('smartCompress').checked);\n      const uploadFile=prepared.file;\n      document.getElementById('fileMeta').textContent=uploadFile===selectedFile?formatBytes(uploadFile.size)+' · 保留原文件':formatBytes(selectedFile.size)+' → '+formatBytes(uploadFile.size)+' · WebP 网页图片';\n      const form=new FormData();form.append('image',uploadFile,uploadFile.name||'pasted-image.png');");
  html = once(html, 'showResult(data);loadStatus();', 'showResult(data,uploadFile,prepared.thumbnail);loadStatus();');
  html = once(html, 'xhr.timeout=30000;', 'xhr.timeout=120000;');
  html = once(html, 'function showResult(data){', "function showResult(data,localFile=null,thumbnail=''){\n      if(resultObjectUrl)URL.revokeObjectURL(resultObjectUrl);resultObjectUrl='';\n      if(localFile&&data.kind==='image')resultObjectUrl=URL.createObjectURL(localFile);");
  html = once(html, "name:data.originalName||selectedFile?.name||'file',kind,createdAt:", "name:data.originalName||selectedFile?.name||'file',kind,thumbnail,createdAt:");
  html = once(html, "if(kind==='image'){image.src=direct;", "if(kind==='image'){image.src=resultObjectUrl||direct;");
  html = once(html, "function saveHistory(items){localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,20)))}", "function saveHistory(items){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,20)))}catch(_){toast('浏览器存储已满，请单独保存链接与删除码',true)}}");
  html = once(html, "function resetUploader(){selectedFile=null;", "function resetUploader(){if(uploading)return;if(resultObjectUrl)URL.revokeObjectURL(resultObjectUrl);resultObjectUrl='';document.getElementById('resultPreview').removeAttribute('src');selectedFile=null;");
  const oldThumb = "let thumb;if(!item.kind||item.kind==='image'){thumb=document.createElement('img');thumb.src=item.url;thumb.alt=''}else{thumb=document.createElement('div');thumb.className='history-thumb';thumb.textContent=item.kind==='video'?'▶':'⇩'}";
  html = once(html, oldThumb, 'const thumb=TblSpeed.historyThumbnail(item);');
  html = once(html, '<video id="previewVideo" class="preview-video" controls>', '<video id="previewVideo" class="preview-video" controls preload="metadata">');
  html = once(html, '<video id="resultVideo" class="result-video" controls>', '<video id="resultVideo" class="result-video" controls preload="none">');
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  return html;
}
function patchServer(server, originalDelivery) {
  if (server.includes("require('./media-delivery.cjs')")) return server;
  const newline = server.includes('\r\n') ? '\r\n' : '\n';
  server = once(server, originalDelivery.replace(/\r?\n/g, newline), "    require('./media-delivery.cjs')(req, res, filePath, record, stats, downloadDisposition);" + newline);
  return once(server, 'server.requestTimeout = 30 * 1000;', 'server.requestTimeout = 120 * 1000;');
}
module.exports = { patchHtml, patchServer };
if (require.main === module) {
  const [live, stage, assets] = process.argv.slice(2);
  assert.ok(live && stage && assets);
  for (const file of ['index.html', 'server.js']) assert.equal(fs.realpathSync(path.join(live, file)), path.resolve(live, file), 'Unexpected symlink');
  const client = fs.readFileSync(path.join(assets, 'speed-client.js'), 'utf8');
  const delivery = fs.readFileSync(path.join(assets, 'original-delivery.txt'), 'utf8');
  fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(path.join(stage, 'index.html'), patchHtml(fs.readFileSync(path.join(live, 'index.html'), 'utf8'), client));
  const server = patchServer(fs.readFileSync(path.join(live, 'server.js'), 'utf8'), delivery);
  new vm.Script(server); fs.writeFileSync(path.join(stage, 'server.js'), server);
  fs.copyFileSync(path.join(assets, 'media-delivery.cjs'), path.join(stage, 'media-delivery.cjs'));
}
