const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const pages=[['main','main-site/index.html'],['note','note-site/index.html'],['tbl','tbl-site/index.html'],['mk','mk-site/index.html'],['document','mk-site/document.html']];
const css=fs.readFileSync(path.join(__dirname,'folio.css'),'utf8'),js=fs.readFileSync(path.join(__dirname,'folio.js'),'utf8');
new vm.Script(js);
function strip(html){return html.replace(/<!-- FOLIO START -->[\s\S]*?<!-- FOLIO END -->\s*/g,'')}
function patch(html,site){
 const clean=strip(html);assert.ok(clean.includes('id="astra-theme"'),'Install the existing Astra design first');
 assert.ok(clean.includes('data-astra-site="'+site+'"'),'Unexpected site markup: '+site);
 assert.ok(clean.includes('</head>'),'Missing head: '+site);
 const result=clean.replace('</head>',`<!-- FOLIO START -->\n<style id="folio-style">\n${css}\n</style>\n<script id="folio-design">\n${js}\n</script>\n<!-- FOLIO END -->\n</head>`);
 assert.equal(strip(result),clean,'Existing HTML must be preserved exactly');return result;
}
if(require.main===module){const root=path.resolve(process.env.FOLIO_BUILD_ROOT||path.join(__dirname,'..'));for(const[site,file]of pages){const target=path.join(root,file);fs.writeFileSync(target,patch(fs.readFileSync(target,'utf8'),site));console.log('Folio: '+file)}}
module.exports={pages,patch,strip};
