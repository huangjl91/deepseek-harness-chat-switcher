import { WebContentsView, ipcMain, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';

const CHAT_URL = 'https://chat.deepseek.com/';
const COMMAND = 'dsh-local-chat:command';
const STATE = 'dsh-local-chat:state';
const PLUGIN = 'dsh-local-chat:plugin';

// The website gets its own persistent session and no Harness preload or API credentials.
export function installChatMode(window, permitted = () => true) {
  const toolbar = new WebContentsView({ webPreferences: {
    preload: fileURLToPath(new URL('./preload-chat-toolbar.cjs', import.meta.url)),
    nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true
  }});
  toolbar.setBackgroundColor('#00000000');
  window.contentView.addChildView(toolbar);
  toolbar.setVisible(false);
  let chat;
  let mode = 'work';
  let status = '';
  let disposed = false;
  let toolbarReady = false;
  let chatNeedsLogin = false;
  let pluginActive = false;
  let menuOpen = false;
  let toolbarCss;
  let warmupTimer;
  const previousLayout = new WeakMap();
  const owned = () => !disposed && !window.isDestroyed();
  const enabled = () => owned() && pluginActive && permitted() && window.webContents.getURL().startsWith('dsh-app://app/');
  const publish = () => {
    if (toolbarReady && !toolbar.webContents.isDestroyed()) toolbar.webContents.send(STATE, { mode, status, chatNeedsLogin, menuOpen });
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
    const x = Math.min(170, Math.max(110, Math.floor(width * 0.2)));
    const barWidth = Math.min(370, width - x - 150);
    applyLayout(toolbar, { x, y: 4, width: barWidth, height: menuOpen ? 196 : 32 }, enabled());
    if (chat) {
      applyLayout(chat, { x: 0, y: 44, width, height: Math.max(0, height - 44) }, enabled() && mode === 'chat');
    }
  };
  // Windows hit-tests draggable regions from the main renderer even over child
  // views. Exclude the switcher rectangle there so physical clicks reach it.
  const reserveToolbarInput = () => {
    if (toolbarCss) window.webContents.removeInsertedCSS(toolbarCss).catch(() => {});
    toolbarCss = undefined;
    if (!enabled()) return;
    window.webContents.insertCSS(`body::after {
      content: ''; position: fixed; top: 4px;
      left: min(170px, max(110px, 20vw));
      width: min(370px, calc(100vw - min(170px, max(110px, 20vw)) - 150px)); height: 32px;
      z-index: 2147483647; pointer-events: auto; -webkit-app-region: no-drag;
    }`).then(key => {
      if (enabled()) toolbarCss = key;
      else window.webContents.removeInsertedCSS(key).catch(() => {});
    }).catch(() => {});
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
    menuOpen = false;
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
    else if (action === 'menu-toggle' || action === 'menu-close') {
      menuOpen = action === 'menu-toggle' ? !menuOpen : false;
      layout(); publish();
    }
    else if (action === 'reload' && chat && mode === 'chat') {
      if (allowed(chat.webContents.getURL())) chat.webContents.reload();
      else chat.webContents.loadURL(CHAT_URL).catch(() => {});
    } else if (action === 'external') external(CHAT_URL);
  };
  const pluginCommand = (event, action) => {
    if (!owned() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url?.startsWith('dsh-app://app/')) throw new Error('Rejected chat plugin command');
    if (!['activate', 'deactivate'].includes(action)) throw new Error('Invalid chat plugin action');
    pluginActive = action === 'activate';
    if (!pluginActive) { mode = 'work'; menuOpen = false; cancelWarmup(); }
    if (chat) chat.webContents.setBackgroundThrottling(!pluginActive);
    reserveToolbarInput(); layout(); publish(); scheduleWarmup();
    return { active: pluginActive, protocolVersion: 1 };
  };
  ipcMain.handle(PLUGIN, pluginCommand);
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
  window.on('blur', () => { menuOpen = false; layout(); publish(); });
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
    ipcMain.removeHandler(PLUGIN);
    removeWorkKeys();
    for (const view of [chat, toolbar]) if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
  });
}
