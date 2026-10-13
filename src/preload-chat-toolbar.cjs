const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  const work = document.getElementById('work');
  const chat = document.getElementById('chat');
  const hint = document.getElementById('hint');
  const reload = document.getElementById('reload');
  const external = document.getElementById('external');
  for (const button of [work, chat, reload, external]) button.addEventListener('click', () => ipcRenderer.send('dsh-local-chat:command', button.id));
  ipcRenderer.on('dsh-local-chat:state', (_event, state) => {
    const active = state.mode === 'chat';
    work.setAttribute('aria-pressed', String(!active));
    chat.setAttribute('aria-pressed', String(active));
    reload.hidden = !active;
    hint.textContent = state.status ? '加载异常' : '官网 · 不用 API';
    if (!state.status && active && state.chatNeedsLogin) hint.textContent = '请在此页登录';
    if (state.status.startsWith('正在')) hint.textContent = '加载中…';
    hint.title = state.status || (active && state.chatNeedsLogin ? '内置聊天、工作授权和外部浏览器分别保存登录。外部浏览器登录不会自动同步到此页。' : '聊天使用 DeepSeek 官网，不调用 Harness API。工作任务需另行停止。');
  });
});
