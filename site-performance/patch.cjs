const fs = require('node:fs');
function patchServer(code, site) {
  if (code.includes('/* lernicks-performance */')) return code;
  const header = `/* lernicks-performance */ require('../site-performance/static.cjs').install(__dirname, '${site}');\n`;
  if(code.startsWith('#!')){const end=code.indexOf('\n')+1;return code.slice(0,end)+header+code.slice(end);}
  return header + code;
}
function patchPage(code,site) {
  if (site==='sco'||site==='goal') {
    // ready 和初始 change 事件二者只处理一次；后续登录变更仍会刷新。
    if (!code.includes('accountInitialHandled')) {
      code=code.replace("window.addEventListener('class-account-change',event=>{", "let accountInitialHandled=false;\n    window.addEventListener('class-account-change',event=>{accountInitialHandled=true;");
      code=code.replace('ClassAccount.ready.then(account=>{', 'ClassAccount.ready.then(account=>{if(accountInitialHandled)return;accountInitialHandled=true;');
    }
  }
  if (site==='pk' && !code.includes('accountInitialHandled')) {
    code=code.replace("window.addEventListener('class-account-change', function(event){", "var accountInitialHandled=false;\nwindow.addEventListener('class-account-change', function(event){\n    accountInitialHandled=true;");
    code=code.replace('window.ClassAccount.ready.then(function(account){', 'window.ClassAccount.ready.then(function(account){ if(accountInitialHandled)return;accountInitialHandled=true;');
  }
  return code;
}
if(require.main===module){const [file,kind,site]=process.argv.slice(2);const before=fs.readFileSync(file,'utf8');fs.writeFileSync(file,kind==='server'?patchServer(before,site):patchPage(before,site));}
module.exports={patchServer,patchPage};
