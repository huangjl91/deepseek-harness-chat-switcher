import { WebContentsView, ipcMain, session, shell, nativeTheme } from 'electron';
import { fileURLToPath } from 'node:url';

const CHAT_URL = 'https://chat.deepseek.com/';
const COMMAND = 'dsh-local-chat:command';
const STATE = 'dsh-local-chat:state';

// The website gets its own persistent session and no Harness preload or API credentials.
export function installChatMode(window, permitted = () => true) {
  const toolbar = new WebContentsView({ webPreferences: {
    preload: fileURLToPath(new URL('./preload-chat-toolbar.cjs', import.meta.url)),
    nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true
  }});
  toolbar.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb');
  window.contentView.addChildView(toolbar);
  toolbar.setVisible(false);
  let chat;
  let mode = 'work';
  let status = '';
  let disposed = false;
  let toolbarReady = false;
  let chatNeedsLogin = false;
  const owned = () => !disposed && !window.isDestroyed();
  const enabled = () => owned() && permitted() && window.webContents.getURL().startsWith('dsh-app://app/');
  const publish = () => {
    if (toolbarReady && !toolbar.webContents.isDestroyed()) toolbar.webContents.send(STATE, { mode, status, chatNeedsLogin });
  };
  const layout = () => {
    if (!owned()) return;
    const [width, height] = window.getContentSize();
    const barWidth = Math.min(440, Math.max(240, width - 210));
    toolbar.setBounds({ x: Math.max(60, Math.floor((width - barWidth) / 2)), y: 4, width: barWidth, height: 32 });
    toolbar.setVisible(enabled());
    if (chat) {
      chat.setBounds({ x: 0, y: 44, width, height: Math.max(0, height - 44) });
      chat.setVisible(enabled() && mode === 'chat');
    }
  };
  // Windows hit-tests draggable regions from the main renderer even over child
  // views. Exclude the switcher rectangle there so physical clicks reach it.
  const reserveToolbarInput = () => {
    if (!enabled()) return;
    window.webContents.insertCSS(`body::after {
      content: ''; position: fixed; top: 4px;
      left: max(60px, calc((100vw - clamp(240px, calc(100vw - 210px), 440px)) / 2));
      width: clamp(240px, calc(100vw - 210px), 440px); height: 32px;
      z-index: 2147483647; pointer-events: auto; -webkit-app-region: no-drag;
    }`).catch(() => {});
  };
  const external = url => {
    try {
      const u = new URL(url);
      if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) shell.openExternal(u.href).catch(() => {});
    } catch {}
  };
  const allowed = url => {
    try { return new URL(url).origin === 'https://chat.deepseek.com'; } catch { return false; }
  };
  const bindKeys = contents => {
    const handler = (event, input) => {
      if (input.type !== 'keyDown' || !input.control || !input.shift || input.alt || input.meta) return;
      if (input.code === 'Digit1' || input.code === 'Digit2') {
        if (!enabled()) return;
        event.preventDefault();
        switchMode(input.code === 'Digit2' ? 'chat' : 'work');
      }
    };
    contents.on('before-input-event', handler);
    return () => { if (!contents.isDestroyed()) contents.off('before-input-event', handler); };
  };
  const createChat = () => {
    const browserSession = session.fromPartition('persist:dsh-web-chat');
    // Persist the website's login cookies before hiding or closing its view.
    const saveChatCookies = () => { browserSession.cookies.flushStore().catch(() => {}); };
    browserSession.cookies.on('changed', saveChatCookies);
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    const view = new WebContentsView({ webPreferences: {
      session: browserSession, nodeIntegration: false, contextIsolation: true,
      sandbox: true, webSecurity: true, webviewTag: false
    }});
    chat = view;
    // Keep website detection compatible with an ordinary Chromium browser.
    view.webContents.setUserAgent(view.webContents.getUserAgent().replace(/\sElectron\/\S+/g, '').replace(/\sDeepSeek[- ]Harness\/\S+/g, ''));
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) view.webContents.loadURL(url).catch(() => {});
      else external(url);
      return { action: 'deny' };
    });
    const navigation = (event, url) => {
      if (!allowed(url)) { event.preventDefault(); external(url); }
    };
    view.webContents.on('will-navigate', navigation);
    view.webContents.on('will-redirect', navigation);
    view.webContents.on('will-attach-webview', event => event.preventDefault());
    view.webContents.on('did-start-loading', () => { status = '正在加载官网…'; publish(); });
    view.webContents.on('did-finish-load', () => {
      status = '';
      chatNeedsLogin = /\/(?:sign_in|login)(?:\/|$)/.test(new URL(view.webContents.getURL()).pathname);
      saveChatCookies();
      publish();
    });
    view.webContents.on('destroyed', () => browserSession.cookies.off('changed', saveChatCookies));
    view.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) { status = '加载失败，点击 ↻ 重试或 ↗ 用浏览器打开'; publish(); }
    });
    view.webContents.on('render-process-gone', () => { status = '页面已停止，点击 ↻ 重新加载'; publish(); });
    view.webContents.on('context-menu', async (_event, info) => {
      const { Menu } = await import('electron');
      if (!owned()) return;
      const items = info.isEditable ? [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] : info.selectionText ? [{ role: 'copy' }] : [];
      if (items.length) Menu.buildFromTemplate(items).popup({ window });
    });
    bindKeys(view.webContents);
    window.contentView.addChildView(view);
    window.contentView.addChildView(toolbar); // Keep the switcher above the website.
    view.webContents.loadURL(CHAT_URL).catch(() => {
      if (owned()) { status = '加载失败，点击 ↻ 重试或 ↗ 用浏览器打开'; publish(); }
    });
    return view;
  };
  const switchMode = next => {
    if (!enabled() || !['work', 'chat'].includes(next)) return;
    mode = next;
    if (chat && next === 'work') chat.webContents.session.cookies.flushStore().catch(() => {});
    if (next === 'chat' && !chat) createChat();
    layout();
    publish();
    if (next === 'chat') chat.webContents.focus();
    else window.webContents.focus();
  };
  const command = (event, action) => {
    if (!enabled() || event.sender !== toolbar.webContents || event.senderFrame !== toolbar.webContents.mainFrame) return;
    if (action === 'work' || action === 'chat') switchMode(action);
    else if (action === 'reload' && chat && mode === 'chat') {
      if (allowed(chat.webContents.getURL())) chat.webContents.reload();
      else chat.webContents.loadURL(CHAT_URL).catch(() => {});
    } else if (action === 'external') external(CHAT_URL);
  };
  ipcMain.on(COMMAND, command);
  const removeWorkKeys = bindKeys(window.webContents);
  bindKeys(toolbar.webContents);
  toolbar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  toolbar.webContents.on('will-navigate', event => event.preventDefault());
  toolbar.webContents.on('did-finish-load', () => { toolbarReady = true; publish(); layout(); });
  toolbar.webContents.loadFile(fileURLToPath(new URL('../renderer/chat-toolbar.html', import.meta.url))).catch(() => {});
  window.on('resize', layout);
  window.on('enter-full-screen', layout);
  window.on('leave-full-screen', layout);
  window.webContents.on('did-finish-load', () => { reserveToolbarInput(); layout(); });
  const hideForNavigation = (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame && owned()) { toolbar.setVisible(false); chat?.setVisible(false); }
  };
  window.webContents.on('did-start-navigation', hideForNavigation);
  // Honor the existing mandatory-update gate even when the chat view is open.
  const gateTimer = setInterval(layout, 1000);
  gateTimer.unref();
  window.once('closed', () => {
    disposed = true;
    clearInterval(gateTimer);
    ipcMain.off(COMMAND, command);
    removeWorkKeys();
    for (const view of [chat, toolbar]) if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
  });
}
