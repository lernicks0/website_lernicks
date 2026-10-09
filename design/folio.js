/* Presentation only: never reads or writes note, document, account, or upload data. */
(function(){
 'use strict';
 var root=document.documentElement,site=root.getAttribute('data-astra-site');
 if(['main','note','tbl','mk','document'].indexOf(site)<0)return;
 root.setAttribute('data-folio',site);
 var links=[['note','便签','https://note.lernicks.cn'],['tbl','图床','https://tbl.lernicks.cn'],['mk','文档','https://mk.lernicks.cn']];
 var art='<svg viewBox="0 0 470 290" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><pattern id="folio-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#c6c9ba"/></pattern></defs><ellipse cx="240" cy="152" rx="202" ry="123" fill="url(#folio-dots)"/><g transform="translate(259 51) rotate(9)"><rect x="5" y="7" width="155" height="184" rx="3" fill="#e5e0d8"/><rect width="155" height="184" rx="3" fill="#fffefa" stroke="#d8d5cd"/><path d="M20 37h115M20 111h115M20 130h92M20 149h105" stroke="#d8d5cd"/><text x="20" y="26" fill="#70538c" font-size="9" font-family="monospace">03 / DOCUMENT</text><text x="77" y="84" text-anchor="middle" fill="#70538c" font-size="27" font-family="Georgia" font-style="italic">E = mc²</text></g><g transform="translate(43 75) rotate(-10)"><rect x="5" y="7" width="165" height="156" rx="3" fill="#e5e0d8"/><rect width="165" height="156" rx="3" fill="#fffefa" stroke="#d8d5cd"/><text x="18" y="27" fill="#b34c2b" font-size="9" font-family="monospace">01 / A LITTLE NOTE</text><path d="M18 40h129M18 88h129M18 106h115M18 124h126" stroke="#d8d5cd"/><text x="18" y="70" fill="#474b40" font-size="14" font-family="Microsoft YaHei">把灵感留在这里。</text><circle cx="139" cy="16" r="10" fill="#f0e4d7"/><text x="135" y="20" font-size="12" fill="#b34c2b" font-family="Georgia" font-style="italic">L</text></g><g transform="translate(169 122) rotate(5)"><rect x="5" y="7" width="154" height="134" rx="3" fill="#d7d9cb"/><rect width="154" height="134" rx="3" fill="#fffefa" stroke="#d8d5cd"/><rect x="9" y="9" width="136" height="99" fill="#d1ddc9"/><circle cx="113" cy="33" r="13" fill="#f2dca6"/><path d="M9 108V83l37-36 55 61" fill="#91af86"/><path d="M46 108l59-60 40 29v31" fill="#4c7358"/><text x="15" y="123" fill="#356c53" font-size="8" font-family="monospace">02 / A MOMENT TO SHARE</text></g><path d="M97 33q20-13 37-2m-10-10 10 10-14 9M391 255q-15 18-37 14m10 10-10-10 13-8" fill="none" stroke="#a2a88f" stroke-width="1.5" stroke-linecap="round"/></svg>';
 function enhance(){
  var header=document.querySelector(site==='note'?'.topnav':'.topbar');
  if(header&&!header.querySelector('.folio-nav')){
   var nav=document.createElement('nav');nav.className='folio-nav folio-only';nav.setAttribute('aria-label','Lernicks 工具');
   links.forEach(function(item){var a=document.createElement('a');a.href=item[2];a.textContent=item[1];if(site===item[0]||(site==='document'&&item[0]==='mk'))a.setAttribute('aria-current','page');nav.appendChild(a)});
   var actions=header.querySelector('.top-actions,.astra-header-actions');header.insertBefore(nav,actions||null);
  }
  if(site==='main'){
   var hero=document.querySelector('.hero');
   if(hero&&!hero.querySelector('.folio-hero-art')){var drawing=document.createElement('div');drawing.className='folio-hero-art folio-only';drawing.setAttribute('aria-hidden','true');drawing.innerHTML=art;hero.appendChild(drawing)}
   var title=document.getElementById('astra-main-title');if(title&&!title.hasAttribute('data-folio-title')){title.innerHTML='小小工具，<br>装下你的灵感。';title.setAttribute('data-folio-title','')}
   var sites=document.querySelector('.sites');if(sites&&!document.querySelector('.folio-section-label')){var label=document.createElement('div');label.className='folio-section-label folio-only';label.innerHTML='<strong>从这里，开始一件小事</strong><span>THE EVERYDAY COLLECTION / 01—03</span>';sites.before(label)}
   [['note','便签电报','给一段话起个名字。随写随存，用链接分享，也可以设置访问密码。'],['image','公共图床','拖入或粘贴一张图片。获取直链，让眼前的画面出现在任何地方。'],['document','混合文档','把文字、公式和 HTML 写在同一页。认真排版，轻松分享。']].forEach(function(item){var card=document.querySelector('.card.'+item[0]);if(card&&!card.querySelector('.folio-copy')){var heading=card.querySelector('h3 .astra-only');if(heading)heading.textContent=item[1];var p=document.createElement('p');p.className='folio-copy folio-only';p.textContent=item[2];var old=card.querySelector('p');if(old)old.after(p)}});
  }
  if(site==='note'){
   var noteTitle=document.querySelector('.telegram-title');if(noteTitle&&!noteTitle.hasAttribute('data-folio-title')){var original=noteTitle.textContent;noteTitle.innerHTML='';var old=document.createElement('span');old.className='legacy-only';old.textContent=original;noteTitle.appendChild(old);var fresh=document.createElement('span');fresh.className='folio-only';fresh.innerHTML='写点什么，<br>给需要的人。';noteTitle.appendChild(fresh);noteTitle.setAttribute('data-folio-title','')}
   var brand=header&&header.querySelector('.brand');if(brand&&!brand.querySelector('.folio-note-brand')){var oldBrand=document.createElement('span');oldBrand.className='legacy-only';while(brand.firstChild)oldBrand.appendChild(brand.firstChild);brand.appendChild(oldBrand);var newBrand=document.createElement('span');newBrand.className='folio-note-brand folio-only';newBrand.innerHTML='<i aria-hidden="true">L.</i><span>便签电报</span>';brand.appendChild(newBrand)}
  }
  var meta=document.querySelector('meta[name="theme-color"]');if(meta&&root.classList.contains('astra'))meta.content='#f7f6f2';
 }
 document.addEventListener('DOMContentLoaded',function(){enhance();if(site==='note'){var app=document.getElementById('app');if(app)new MutationObserver(enhance).observe(app,{childList:true,subtree:true})}});
 window.addEventListener('lernicks-design-change',enhance);
})();
