/* Shared, cookie-persisted Music Utilities color theme. */
(function(){
  'use strict';
  const cookieName='music_utilities_theme';
  const themes=['ocean','forest','plum','midnight','charcoal','ivory','slate','burgundy','high-contrast'];
  function readCookie(){
    const match=document.cookie.split('; ').find(part=>part.startsWith(cookieName+'='));
    return match?decodeURIComponent(match.slice(cookieName.length+1)):'';
  }
  function apply(theme,remember){
    if(!themes.includes(theme))theme='ocean';
    document.documentElement.dataset.muTheme=theme;
    if(remember){
      const secure=location.protocol==='https:'?'; Secure':'';
      document.cookie=cookieName+'='+encodeURIComponent(theme)+'; Max-Age=31536000; Path=/; SameSite=Lax'+secure;
    }
    document.querySelectorAll('[data-mu-theme-select]').forEach(el=>{el.value=theme});
  }
  function init(){
    apply(readCookie(),false);
    const nav=document.querySelector('.mu-nav');
    if(!nav)return;
    const wrapper=document.createElement('label');
    wrapper.className='mu-theme-control';
    const title=document.createElement('span');
    title.textContent='Theme';
    const select=document.createElement('select');
    select.setAttribute('data-mu-theme-select','');
    select.setAttribute('aria-label','Color theme');
    [['ocean','Ocean'],['forest','Forest'],['plum','Plum'],['midnight','Midnight'],['charcoal','Charcoal'],['ivory','Ivory'],['slate','Slate'],['burgundy','Burgundy'],['high-contrast','High Contrast']].forEach(([value,label])=>{
      const option=document.createElement('option');
      option.value=value;option.textContent=label;select.appendChild(option);
    });
    select.addEventListener('change',()=>apply(select.value,true));
    wrapper.append(title,select);
    nav.appendChild(wrapper);
    apply(readCookie(),false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
