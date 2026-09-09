const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {patchServer,patchPage}=require('./patch.cjs');
function applyChanges(text,changes){
  text=text.replace(/\r\n/g,'\n');
  for(const change of changes){
    if(text.includes(change.after))continue;
    if(!change.before || text.split(change.before).length!==2)throw Error('文件版本已变化，无法安全应用局部补丁');
    text=text.replace(change.before,change.after);
  }
  return text;
}
const sites=[['main','main','index.html'],['cla','cla','index.html'],['pk','pk','pk.html'],['sco','sco','index.html'],['goal','goal','index.html'],['mk','mk','index.html'],['tbl','tbl','index.html'],['news','news','index.html'],['class-auth','auth',null],['telegram-notes','note','public/index.html']];
function command(file,args){return execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:90000});}
function install(){
  if(process.platform!=='linux')throw Error('安装器只在 Linux 服务器运行');
  const root='/root',backup=fs.mkdtempSync('/root/performance-backup-');fs.chmodSync(backup,0o700);
  const updates=new Map(),originals=new Map();
  const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'changes.json'),'utf8'));
  for(const entry of spec){const file=path.join(root,entry.path);if(!fs.existsSync(file))continue;try{updates.set(file,applyChanges(fs.readFileSync(file,'utf8'),entry.changes));}catch(e){throw Error(entry.path+': '+e.message);}}
  for(const [folder,site,html] of sites){
    const entry=path.join(root,folder,'server.js');if(!fs.existsSync(entry))continue;
    updates.set(entry,patchServer(updates.get(entry)||fs.readFileSync(entry,'utf8'),site));
    if(html){const file=path.join(root,folder,html);if(fs.existsSync(file)){const before=fs.readFileSync(file,'utf8'),after=patchPage(before,site);if(after!==before)updates.set(file,after);}}
  }
  const target=path.join(root,'site-performance');
  for(const name of ['static.cjs'])updates.set(path.join(target,name),fs.readFileSync(path.join(__dirname,name),'utf8'));
  command('nginx',['-t']);
  const config=command('nginx',['-T']);const {patch}=require('./nginx.cjs');
  for(const match of config.matchAll(/^# configuration file (.+):$/gm)){
    const name=fs.realpathSync(match[1]);if(!name.startsWith('/etc/nginx/'))continue;
    const before=fs.readFileSync(name,'utf8'),after=patch(before);if(before!==after)updates.set(name,after);
  }
  const processes=JSON.parse(command('pm2',['jlist']));
  const restart=processes.filter(p=>updates.has(p.pm2_env?.pm_exec_path)).map(p=>p.name);
  if(!restart.length)throw Error('未找到待更新网站的 PM2 进程，未修改服务器');
  // 先在临时目录检查全部 JS，再备份。不同于整站覆盖，只有匹配到的代码片段会更新。
  let index=0;
  for(const [file,data] of updates){
    if(/\.(?:js|cjs)$/.test(file)){const check=path.join(backup,'check-'+index+'.cjs');fs.writeFileSync(check,data);command(process.execPath,['--check',check]);}
    const exists=fs.existsSync(file),save=path.join(backup,String(index++));
    if(exists)fs.copyFileSync(file,save);
    originals.set(file,{save,exists,mode:exists?fs.statSync(file).mode&0o777:0o644});
  }
  fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify([...originals],null,2),{mode:0o600});
  const write=(file,data,mode)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.perf-tmp',data,{mode});fs.renameSync(file+'.perf-tmp',file);};
  try{
    for(const [file,data] of updates)write(file,data,originals.get(file).mode);
    command('nginx',['-t']);
    for(const name of restart)command('pm2',['restart',name]);
    command('systemctl',['reload','nginx']);
    const ports={main:1149,cla:1147,pk:1145,sco:1146,goal:1152,mk:1151,tbl:1148,news:1154,'class-auth':1153,'telegram-notes':3000};
    for(const [folder,site] of sites){
      const entry=path.join(root,folder,'server.js');if(!processes.some(p=>p.pm2_env?.pm_exec_path===entry))continue;
      const suffix=site==='auth'?'/api/widget.js':'/';
      const response=command('curl',['-fsSL','--max-redirs','5','--retry','8','--retry-connrefused','--retry-delay','1','--max-time','20','-D','-','-o','/dev/null','-H','Accept-Encoding: gzip',`http://127.0.0.1:${ports[folder]}${suffix}`]);
      if(!/etag:/i.test(response)||(!/content-encoding: gzip/i.test(response)&&site!=='news'))throw Error(folder+' 页面压缩/缓存校验失败');
    }
    command('pm2',['save']);
  }catch(error){
    for(const [file,info] of originals){if(info.exists)write(file,fs.readFileSync(info.save),info.mode);else fs.rmSync(file,{force:true});}
    for(const name of restart){try{command('pm2',['restart',name]);}catch(_){}}
    try{command('nginx',['-t']);command('systemctl',['reload','nginx']);}catch(_){}
    throw Error('安装失败，已恢复程序。备份：'+backup+'；'+error.message);
  }
  console.log('PERFORMANCE_UPDATE_SUCCESS backup='+backup);
  console.log('已更新：'+restart.join(', ')+'。请刷新网页。');
}
if(require.main===module)install();
module.exports={applyChanges,sites};
