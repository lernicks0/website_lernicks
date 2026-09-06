const fs=require('node:fs');
const file=process.argv[2]||'/root/cla/index.html';
const before=fs.readFileSync(file,'utf8');
if(!before.includes('data-astra-site="cla"'))throw Error('Install the new design first.');
const block="<style id=\"astra-class-entries\">\n/* 三个班级工具保持同等层级和尺寸。 */\nhtml.astra[data-astra-site=\"cla\"] .sites{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}\nhtml.astra[data-astra-site=\"cla\"] :is(.card,.card.pk){grid-row:auto;display:flex;flex-direction:column;justify-content:flex-start;min-height:270px;padding:26px;background:var(--a-paper);color:var(--text);border:1px solid var(--line);--accent:var(--a-accent)}\nhtml.astra[data-astra-site=\"cla\"] .card.pk:after{display:none}\nhtml.astra[data-astra-site=\"cla\"] .sites .card h3{font-size:25px;margin:15px 0 8px;font-weight:600}\nhtml.astra[data-astra-site=\"cla\"] .sites .card p{flex:1;color:var(--muted);max-width:none;padding-bottom:0}\nhtml.astra[data-astra-site=\"cla\"] .sites .enter{position:static;align-self:flex-end;margin-top:24px;font-size:13px}\n@media(max-width:760px){\n html.astra[data-astra-site=\"cla\"] .sites{grid-template-columns:1fr}\n html.astra[data-astra-site=\"cla\"] :is(.card,.card.pk){min-height:235px;padding:24px}\n}\n\n</style>\n";
const after=before.replace(/<style id="astra-class-entries">[\s\S]*?<\/style>\s*/g,'').replace('</head>',block+'</head>');
if(after===before){console.log('Layout already updated.');process.exit(0);}
const backup=file+'.layout-backup-'+Date.now();fs.copyFileSync(file,backup);
const temp=file+'.layout-update-'+process.pid;fs.writeFileSync(temp,after,{mode:fs.statSync(file).mode&0o777});fs.renameSync(temp,file);
console.log('CLASS_LAYOUT_UPDATED backup='+backup);
