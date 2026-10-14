const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const assert = require('assert/strict');
let ids = 0;
class Contents extends EventEmitter {
  constructor() { super(); this.id = ++ids; this.mainFrame = {url:'dsh-app://app/'}; this.url = ''; this.closed = false; this.loads = []; this.messages = []; }
  isDestroyed() { return this.closed; }
  getURL() { return this.url; }
  getUserAgent() { return 'Chrome/148 Electron/41 DeepSeek-Harness/0.2'; }
  setUserAgent(value) { this.ua = value; }
  setBackgroundThrottling(value) { this.throttled = value; }
  setWindowOpenHandler(value) { this.popup = value; }
  async loadURL(url) { this.url = url; this.loads.push(url); }
  async loadFile(file) { this.file = file; }
  send(...args) { this.messages.push(args); }
  async insertCSS(css) { this.css = css; }
  focus() { this.focused = true; }
  reload() { this.reloaded = true; }
  close() { this.closed = true; this.emit('destroyed'); }
}
const views = [];
class View {
  constructor(options) { this.options = options; this.webContents = new Contents(); this.webContents.session=options.webPreferences.session; views.push(this); }
  setBackgroundColor() {}
  setVisible(value) { this.visible = value; this.visibilityChanges=(this.visibilityChanges||0)+1; }
  setBounds(value) { this.bounds = value; this.boundsChanges=(this.boundsChanges||0)+1; }
}
const ipcMain = new EventEmitter();
const handlers = new Map();
ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
ipcMain.removeHandler = channel => handlers.delete(channel);
const plugin = (window, action) => handlers.get('dsh-local-chat:plugin')({sender:window.webContents,senderFrame:window.webContents.mainFrame},action);
const opened = [];
const partitions = [];
const chatCookies = new EventEmitter();
let cookieFlushes=0;
chatCookies.flushStore=async()=>{cookieFlushes++;};
const timers = new Set();
const warmups = new Set();
const context = vm.createContext({ WebContentsView: View, ipcMain, session: { fromPartition(name) { partitions.push(name); return { cookies:chatCookies, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }; } }, shell: { async openExternal(url) { opened.push(url); } }, nativeTheme: { shouldUseDarkColors: false }, fileURLToPath: u => u.pathname, URL, setTimeout: fn => { const t={fn,unref(){}};warmups.add(t);return t; }, clearTimeout: t=>warmups.delete(t), setInterval: fn => { const t = { fn, unref() {} }; timers.add(t); return t; }, clearInterval: t => timers.delete(t) });
const source = fs.readFileSync(path.join(__dirname,'../src/chat-mode.js'), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function').replaceAll('import.meta.url', "'file:///app/lib/chat-mode.js'");
vm.runInContext(source, context);
const window = new EventEmitter();
window.webContents = new Contents();
window.webContents.url = 'dsh-app://app/';
window.getContentSize = () => [1280, 820];
window.isDestroyed = () => false;
let visible = true;
window.isVisible = () => visible;
window.contentView = { addChildView() {} };
let permitted = true;
context.installChatMode(window, () => permitted);
const toolbar = views[0];
toolbar.webContents.emit('did-finish-load');
window.webContents.emit('did-finish-load');
assert.equal(toolbar.visible,false,'An installed bridge alone must not enable the plugin');
assert.equal(warmups.size,0);
assert.throws(()=>handlers.get('dsh-local-chat:plugin')({sender:toolbar.webContents,senderFrame:toolbar.webContents.mainFrame},'activate'),/Rejected/);
assert.throws(()=>handlers.get('dsh-local-chat:plugin')({sender:window.webContents,senderFrame:{url:'dsh-app://app/'}},'activate'),/Rejected/);
plugin(window,'activate');
assert(window.webContents.css.includes('-webkit-app-region: no-drag'), 'Switcher excluded from native titlebar dragging');
assert.equal(toolbar.visible, true);
assert.equal(views.length, 1, 'Website waits for workspace startup to settle');
assert.equal(warmups.size, 1, 'Workspace load schedules one background warmup');
window.webContents.emit('did-start-navigation',{},'dsh-app://app/',true,true);
assert.equal(warmups.size,1,'Workspace history changes must not cancel preload');
const command = action => ipcMain.emit('dsh-local-chat:command', { sender: toolbar.webContents, senderFrame: toolbar.webContents.mainFrame }, action);
command('menu-toggle');
assert.equal(toolbar.bounds.height,196,'Dropdown has room for both mode choices');
assert.equal(toolbar.webContents.messages.at(-1)[1].menuOpen,true);
command('work');
assert.equal(toolbar.bounds.height,32,'Selection collapses the native dropdown');
ipcMain.emit('dsh-local-chat:command', { sender: window.webContents, senderFrame: window.webContents.mainFrame }, 'chat');
assert.equal(views.length, 1, 'Main/remote renderers cannot use toolbar IPC');
visible=false;
window.emit('hide');
assert.equal(warmups.size,0,'Hiding the workspace cancels unneeded preload');
visible=true;
window.emit('show');
for(const timer of [...warmups]) { warmups.delete(timer);timer.fn(); }
const chat = views[1];
assert.equal(chat.visible,false,'Preloading does not cover the work page');
assert.equal(chat.webContents.focused,undefined,'Preloading does not steal focus');
assert.equal(chat.options.webPreferences.backgroundThrottling,false);
assert.equal(chat.options.webPreferences.focusOnNavigation,false);
const workBoundsChanges=toolbar.boundsChanges;
const chatBoundsChanges=chat.boundsChanges;
for(const timer of timers)timer.fn();
assert.equal(toolbar.boundsChanges,workBoundsChanges,'Idle gate checks do not repeat native bounds updates');
assert.equal(chat.boundsChanges,chatBoundsChanges);
command('chat');
assert.equal(chat.visible, true);
assert.equal(chat.bounds.y, 44);
assert.deepEqual(chat.webContents.loads, ['https://chat.deepseek.com/']);
assert.deepEqual(partitions, ['persist:dsh-web-chat']);
assert.equal(chat.options.webPreferences.preload, undefined, 'No Harness bridge in the website');
assert.equal(chat.options.webPreferences.nodeIntegration, false);
command('work');
assert.equal(chat.visible, false);
chatCookies.emit('changed');
assert(cookieFlushes>0,'Login cookies are flushed without clearing storage');
command('chat');
assert.equal(views.length, 2, 'Switch preserves the same chat page');
assert.equal(chat.webContents.loads.length, 1, 'Switch does not reload or request a completion');
plugin(window,'deactivate');
assert.equal(toolbar.visible,false);
assert.equal(chat.visible,false);
assert.equal(chat.webContents.throttled,true);
command('chat');
assert.equal(chat.visible,false,'Disabled plugin ignores toolbar actions');
plugin(window,'activate');
assert.equal(chat.webContents.throttled,false);
assert.equal(chat.visible,false,'Enabling starts in Work');
command('chat');
assert.equal(chat.webContents.loads.length,1,'Plugin toggles preserve the website session and renderer');
window.getContentSize = () => [800, 600];
window.emit('resize');
assert.equal(chat.bounds.width, 800);
assert.equal(chat.bounds.height, 556);
let stopped = false;
chat.webContents.emit('will-navigate', { preventDefault() { stopped = true; } }, 'file:///secret');
assert.equal(stopped, true);
assert.equal(opened.length, 0, 'Non-web links are blocked');
command('reload');
assert.equal(chat.webContents.reloaded, true);
command('external');
assert.deepEqual(opened, ['https://chat.deepseek.com/']);
permitted = false;
for (const timer of timers) timer.fn();
assert.equal(chat.visible, false);
assert.equal(toolbar.visible, false, 'Mandatory update is respected');
permitted = true;
for (const timer of timers) timer.fn();
let prevented = false;
chat.webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { type: 'keyDown', control: true, shift: true, code: 'Digit1' });
assert.equal(prevented, true);
assert.equal(chat.visible, false, 'Keyboard can return to Work');
window.emit('closed');
assert.equal(chat.webContents.closed, true);
assert.equal(toolbar.webContents.closed, true);
assert.equal(ipcMain.listenerCount('dsh-local-chat:command'), 0);
assert.equal(handlers.size,0);
assert.equal(timers.size, 0);
assert.equal(warmups.size,0);
assert.equal(chatCookies.listenerCount('changed'),0);
// A click before the delayed preload must cancel that timer and create just
// one renderer; subsequent show events must reuse it.
const earlyWindow=new EventEmitter();
earlyWindow.webContents=new Contents();
earlyWindow.webContents.url='dsh-app://app/';
earlyWindow.getContentSize=()=>[1280,820];
earlyWindow.isDestroyed=()=>false;
earlyWindow.isVisible=()=>true;
earlyWindow.contentView={addChildView(){}};
context.installChatMode(earlyWindow);
earlyWindow.webContents.emit('did-finish-load');
plugin(earlyWindow,'activate');
const earlyToolbar=views[2];
assert.equal(warmups.size,1);
ipcMain.emit('dsh-local-chat:command',{sender:earlyToolbar.webContents,senderFrame:earlyToolbar.webContents.mainFrame},'chat');
assert.equal(warmups.size,0);
assert.equal(views.length,4,'Early click creates one chat renderer');
earlyWindow.emit('show');
assert.equal(warmups.size,0,'An existing chat view is never preloaded twice');
earlyWindow.emit('closed');
assert.equal(timers.size,0);
console.log('PASS: background preload, focus preservation, idle layout, session isolation, retained page, resize, update gate, shortcuts and cleanup.');
