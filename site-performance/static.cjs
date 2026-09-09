// 只处理明确列出的公开页面与资源；其余请求交回原网站验证权限。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const gzip = promisify(zlib.gzip);
const hash = data => crypto.createHash('sha256').update(data).digest('hex').slice(0, 20);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.webp':'image/webp' };
const raw = new Map(), built = new Map();
async function read(file) {
  const stat = await fs.promises.stat(file);
  if (!stat.isFile() || stat.size > 5*1024*1024) throw Error('Not a small public file');
  const key = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  if (raw.get(file)?.key === key) return raw.get(file);
  const data = await fs.promises.readFile(file);
  const value = { key, data, hash:hash(data) };
  raw.set(file, value); return value;
}
function files(root, site) {
  const result = {};
  function add(url, file) { result[url] = path.resolve(root,file); }
  if (site === 'auth') { add('/api/widget.js','widget.js'); return result; }
  const index = site === 'pk' ? 'pk.html' : site === 'note' ? 'public/index.html' : 'index.html';
  if (!['cla','pk','sco','goal'].includes(site)) add('/', index);
  add('/'+(site === 'pk' ? 'pk.html' : 'index.html'),index);
  if (site === 'main') { add('/feedback',index); add('/feedback/',index); }
  if (['cla','sco','pk','goal','news'].includes(site)) add('/account-api/widget.js','../class-auth/widget.js');
  if (site === 'news') { add('/app.js','app.js'); add('/style.css','style.css'); }
  if (site === 'mk') { add('/html-support.js','html-support.js'); add('/purify.min.js','purify.min.js'); }
  if (site === 'pk') add('/logo-803-pk-tech-v3.png','logo-803-pk-tech-v3.png');
  return result;
}
function acceptsGzip(header = '') {
  const items = header.toLowerCase().split(',').map(s=>s.trim().split(';'));
  const item = items.find(v=>v[0]==='gzip') || items.find(v=>v[0]==='*');
  return !!item && !item.slice(1).some(p=>/^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(p));
}
function middleware(root, site) {
  const routes = files(root,site);
  return async (req,res,next) => {
    let url; try { url = new URL(req.url,'http://localhost'); } catch (_) { return next(); }
    const file = routes[url.pathname];
    if (!file || !['GET','HEAD'].includes(req.method) || req.headers.range) return next();
    try {
      const source = await read(file), ext = path.extname(file), isHtml = ext === '.html';
      let data = source.data, key = source.hash;
      if (isHtml) {
        // 只有公开白名单里的外部资源才加入内容版本号，更新会自动换 URL。
        let html = data.toString('utf8');
        const replacements = [];
        const tags = /<(?:script|link|img)\b[^>]*\b(?:src|href)=(['"])([^'"]+)\1[^>]*>/gi;
        for (const m of html.matchAll(tags)) {
          if (/^(?:https?:|data:|\/\/|#)/i.test(m[2])) continue;
          const resource = new URL(m[2],url);
          const asset = routes[resource.pathname];
          if (!asset || path.extname(asset)==='.html') continue;
          try { const value = await read(asset); resource.searchParams.set('v',value.hash); replacements.push([m[0],m[0].replace(m[2],resource.pathname+resource.search)]); key += value.hash; } catch (_) {}
        }
        const cached = built.get(file);
        if (cached?.key === key) data = cached.data;
        else { for (const [before,after] of replacements) html=html.replace(before,after); data=Buffer.from(html); }
      }
      let variant = built.get(file);
      if (!variant || variant.key !== key) {
        variant = {key, data, hash:hash(data)};
        // 压缩结果按内容版本复用，避免每次请求重复占用 CPU。
        variant.compressed = data.length >= 1024 && ['.html','.css','.js','.svg'].includes(ext) ? gzip(data,{level:5}) : Promise.resolve(null);
        built.set(file,variant);
      }
      const zipped = acceptsGzip(req.headers['accept-encoding']) ? await variant.compressed : null;
      const payload = zipped || variant.data;
      const etag = `"${variant.hash}${zipped?'-gzip':''}"`;
      const immutable = !isHtml && url.searchParams.get('v') === source.hash;
      res.setHeader('Content-Type',types[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control',immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
      res.setHeader('ETag',etag); res.setHeader('Vary','Accept-Encoding');
      res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','no-referrer');
      if (zipped) res.setHeader('Content-Encoding','gzip');
      if ((req.headers['if-none-match'] || '').split(',').some(t=>t.trim().replace(/^W\//,'')===etag || t.trim()==='*')) { res.writeHead(304); return res.end(); }
      res.setHeader('Content-Length',payload.length); res.writeHead(200); res.end(req.method==='HEAD' ? undefined : payload);
    } catch (_) { return next(); }
  };
}
function install(root, site) {
  const http = require('node:http'), original = http.createServer;
  const serve = middleware(root,site);
  http.createServer = function (...args) {
    const i = args.findIndex(a=>typeof a==='function');
    if (i>=0) { const handler=args[i]; args[i]=function(req,res){serve(req,res,()=>handler.call(this,req,res));}; }
    return original.apply(this,args);
  };
}
module.exports = { middleware, install, acceptsGzip };
