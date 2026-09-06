const fs=require('node:fs'),vm=require('node:vm');
const file=process.argv[2]||'/root/mk/document.html';
const before=fs.readFileSync(file,'utf8');
if(!before.includes('data-astra-site="document"'))throw Error('Install the new design first.');
const css=`html[data-astra-site="document"] body.reader-mode .page{width:min(1060px,calc(100% - 64px));margin-inline:auto}
html[data-astra-site="document"] body.reader-mode .article:not(.html-preview){padding-inline:clamp(22px,5vw,68px)}
@media(max-width:600px){html[data-astra-site="document"] body.reader-mode .page{width:calc(100% - 32px)}html[data-astra-site="document"] body.reader-mode .article:not(.html-preview){padding-inline:20px}}`;
const after=before.replace(/<style id="astra-document-width">[\s\S]*?<\/style>\s*/g,'').replace('</head>','<style id="astra-document-width">\n'+css+'\n</style>\n</head>');
if(after===before){console.log('Width already updated.');process.exit(0);}
for(const m of after.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const backup=file+'.width-backup-'+Date.now();
fs.copyFileSync(file,backup);
const temporary=file+'.width-update-'+process.pid;
fs.writeFileSync(temporary,after,{mode:fs.statSync(file).mode & 0o777});
fs.renameSync(temporary,file);
console.log('DOCUMENT_WIDTH_UPDATED backup='+backup);
