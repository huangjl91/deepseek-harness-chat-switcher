const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  const work=document.getElementById('work'),chat=document.getElementById('chat');
  const hint=document.getElementById('hint'),reload=document.getElementById('reload'),external=document.getElementById('external');
  const toggle=document.getElementById('mode-toggle'),menu=document.getElementById('mode-menu'),label=document.getElementById('mode-label');
  const send=action=>ipcRenderer.send('dsh-local-chat:command',action);
  for(const button of [work,chat,reload,external])button.addEventListener('click',()=>send(button.id));
  toggle.addEventListener('click',()=>send('menu-toggle'));
  window.addEventListener('blur',()=>send('menu-close'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){send('menu-close');toggle.focus()}if(!menu.hidden&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();(document.activeElement===work?chat:work).focus()}});
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!toggle.contains(event.target))send('menu-close')});
  ipcRenderer.on('dsh-local-chat:state',(_event,state)=>{
    const active=state.mode==='chat';label.textContent=active?'聊天':'工作';
    work.setAttribute('aria-checked',String(!active));chat.setAttribute('aria-checked',String(active));
    work.setAttribute('aria-pressed',String(!active));chat.setAttribute('aria-pressed',String(active));
    toggle.setAttribute('aria-expanded',String(state.menuOpen));menu.hidden=!state.menuOpen;reload.hidden=!active;
    hint.textContent=state.status?(state.status.startsWith('正在')?'加载中…':'加载异常'):active&&state.chatNeedsLogin?'请在此页登录':active?'官网 · 不用 API':'';
    hint.title=state.status||'外部浏览器、内置聊天和工作授权分别保存登录。';
  });
});
