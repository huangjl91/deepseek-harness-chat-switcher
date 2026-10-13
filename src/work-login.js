import { BrowserWindow, session, shell } from 'electron';

// Keep official PKCE authorization intact. This window owns only browser cookies,
// never the Harness account grant, and never shares the chat/browser session.
export function createWorkLoginBrowser({ getParent, cancel, focusOwner }) {
  let current;
  let currentId;
  let completed = false;
  const close = () => {
    completed = true;
    if (current && !current.isDestroyed()) current.close();
    current = undefined;
    currentId = undefined;
  };
  return {
    open(url, id, callbackUrl) {
      const authorize = new URL(url);
      const callback = new URL(callbackUrl);
      if (authorize.protocol !== 'https:' || authorize.username || authorize.password || authorize.pathname !== '/dsh/authorize') throw new Error('Invalid work authorization page');
      if (callback.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(callback.hostname) || !callback.port || callback.username || callback.password) throw new Error('Invalid local work callback');
      if (currentId === id && current && !current.isDestroyed()) { current.show(); current.focus(); return; }
      close();
      completed = false;
      currentId = id;
      const browserSession = session.fromPartition('persist:dsh-work-login');
      const parent = getParent();
      const window = new BrowserWindow({
        title: '工作登录 · DeepSeek Harness', width: 980, height: 760,
        minWidth: 620, minHeight: 600, show: false,
        ...(parent && !parent.isDestroyed() ? { parent } : {}),
        autoHideMenuBar: true,
        webPreferences: { session: browserSession, nodeIntegration: false, contextIsolation: true,
          sandbox: true, webSecurity: true, webviewTag: false }
      });
      current = window;
      const allowed = destination => {
        try {
          const u = new URL(destination);
          if (u.username || u.password) return false;
          if (u.origin === callback.origin) return u.pathname === '/oauth/callback';
          return u.protocol === 'https:' && (u.origin === authorize.origin || u.hostname === 'deepseek.com' || u.hostname.endsWith('.deepseek.com'));
        } catch { return false; }
      };
      const external = destination => {
        try {
          const u = new URL(destination);
          if (u.protocol === 'https:' && !u.username && !u.password) shell.openExternal(u.href).catch(() => {});
        } catch {}
      };
      const navigate = (event, destination) => {
        if (!allowed(destination)) { event.preventDefault(); external(destination); }
      };
      window.webContents.on('will-navigate', navigate);
      window.webContents.on('will-redirect', navigate);
      window.webContents.on('will-attach-webview', event => event.preventDefault());
      window.webContents.setWindowOpenHandler(({ url: destination }) => {
        if (allowed(destination)) window.loadURL(destination).catch(() => {});
        else external(destination);
        return { action: 'deny' };
      });
      window.webContents.on('page-title-updated', event => event.preventDefault());
      const saveCookies = () => { browserSession.cookies.flushStore().catch(() => {}); };
      browserSession.cookies.on('changed', saveCookies);
      window.on('closed', () => {
        browserSession.cookies.off('changed', saveCookies);
        saveCookies();
        if (current !== window) return;
        current = undefined;
        currentId = undefined;
        if (!completed) Promise.resolve(cancel(id)).catch(() => {});
      });
      window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show(); });
      window.loadURL(authorize.href).catch(() => {
        if (!window.isDestroyed()) window.show();
      });
      window.show();
      window.focus();
    },
    sync(state) {
      if (!current) return;
      const attempt = state.attempt;
      if (attempt?.id === currentId && ['succeeded', 'failed', 'expired'].includes(attempt.phase)) {
        close();
        focusOwner();
      } else if (attempt === null || attempt?.id !== currentId) close();
    },
    dispose: close
  };
}
