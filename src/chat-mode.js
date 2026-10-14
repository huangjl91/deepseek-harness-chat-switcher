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
  let warmupTimer;
  const previousLayout = new WeakMap();
  const owned = () => !disposed && !window.isDestroyed();
  const enabled = () => owned() && permitted() && window.webContents.getURL().startsWith('dsh-app://app/');
  const publish = () => {
    if (toolbarReady && !toolbar.webContents.isDestroyed()) toolbar.webContents.send(STATE, { mode, status, chatNeedsLogin });
  };
  const applyLayout = (view, bounds, visible) => {
    const previous = previousLayout.get(view);
    if (!previous || Object.keys(bounds).some(key => previous.bounds[key] !== bounds[key])) view.setBounds(bounds);
    if (!previous || previous.visible !== visible) view.setVisible(visible);
    previousLayout.set(view, { bounds, visible });
  };
  const layout = () => {
    if (!owned()) return;
    const [width, height] = window.getContentSize();
    const barWidth = Math.min(440, Math.max(240, width - 210));
    applyLayout(toolbar, { x: Math.max(60, Math.floor((width - barWidth) / 2)), y: 4, width: barWidth, height: 32 }, enabled());
    if (chat) {
      applyLayout(chat, { x: 0, y: 44, width, height: Math.max(0, height - 44) }, enabled() && mode === 'chat');
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
      sandbox: true, webSecurity: true, webviewTag: false,
      backgroundThrottling: false, focusOnNavigation: false
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
    view.setVisible(false);
    window.contentView.addChildView(view);
    window.contentView.addChildView(toolbar); // Keep the switcher above the website.
    layout(); // Give the hidden page its real viewport before starting navigation.
    view.webContents.loadURL(CHAT_URL).catch(() => {
      if (owned()) { status = '加载失败，点击 ↻ 重试或 ↗ 用浏览器打开'; publish(); }
    });
    return view;
  };
  const cancelWarmup = () => {
    if (warmupTimer !== undefined) clearTimeout(warmupTimer);
    warmupTimer = undefined;
  };
  const scheduleWarmup = () => {
    if (!enabled() || chat || warmupTimer !== undefined || !window.isVisible()) return;
    // Let the workspace finish its first paint, then load the existing isolated
    // website session without taking focus or changing the selected mode.
    warmupTimer = setTimeout(() => {
      warmupTimer = undefined;
      if (enabled() && window.isVisible() && !chat) createChat();
    }, 750);
    warmupTimer.unref();
  };
  const switchMode = next => {
    if (!enabled() || !['work', 'chat'].includes(next)) return;
    mode = next;
    if (next === 'chat') cancelWarmup();
    if (chat && next === 'work') chat.webContents.session.cookies.flushStore().catch(() => {});
    if (next === 'chat' && !chat) createChat();
    layout();
    publish();
    if (next === 'chat') chat.webContents.focus();
    else window.webContents.focus();
    scheduleWarmup();
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
  window.on('show', scheduleWarmup);
  window.on('hide', cancelWarmup);
  window.webContents.on('did-finish-load', () => { reserveToolbarInput(); layout(); scheduleWarmup(); });
  const hideForNavigation = (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace && owned()) {
      cancelWarmup();
      toolbar.setVisible(false); chat?.setVisible(false);
      previousLayout.delete(toolbar);
      if (chat) previousLayout.delete(chat);
    }
  };
  window.webContents.on('did-start-navigation', hideForNavigation);
  // Honor the existing mandatory-update gate even when the chat view is open.
  const gateTimer = setInterval(() => { layout(); scheduleWarmup(); }, 1000);
  gateTimer.unref();
  window.once('closed', () => {
    disposed = true;
    clearInterval(gateTimer);
    cancelWarmup();
    ipcMain.off(COMMAND, command);
    removeWorkKeys();
    for (const view of [chat, toolbar]) if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
  });
}
