const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const assert = require('assert/strict');
let ids = 0;
class Contents extends EventEmitter {
  constructor() { super(); this.id = ++ids; this.mainFrame = {}; this.url = ''; this.closed = false; this.loads = []; this.messages = []; }
  isDestroyed() { return this.closed; }
  getURL() { return this.url; }
  getUserAgent() { return 'Chrome/148 Electron/41 DeepSeek-Harness/0.2'; }
  setUserAgent(value) { this.ua = value; }
  setWindowOpenHandler(value) { this.popup = value; }
  async loadURL(url) { this.url = url; this.loads.push(url); }
  async loadFile(file) { this.file = file; }
  send(...args) { this.messages.push(args); }
  async insertCSS(css) { this.css = css; }
  focus() { this.focused = true; }
  reload() { this.reloaded = true; }
  close() { this.closed = true; }
}
const views = [];
class View {
  constructor(options) { this.options = options; this.webContents = new Contents(); this.webContents.session=options.webPreferences.session; views.push(this); }
  setBackgroundColor() {}
  setVisible(value) { this.visible = value; }
  setBounds(value) { this.bounds = value; }
}
const ipcMain = new EventEmitter();
const opened = [];
const partitions = [];
const chatCookies = new EventEmitter();
let cookieFlushes=0;
chatCookies.flushStore=async()=>{cookieFlushes++;};
const timers = new Set();
const context = vm.createContext({ WebContentsView: View, ipcMain, session: { fromPartition(name) { partitions.push(name); return { cookies:chatCookies, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }; } }, shell: { async openExternal(url) { opened.push(url); } }, nativeTheme: { shouldUseDarkColors: false }, fileURLToPath: u => u.pathname, URL, setInterval: fn => { const t = { fn, unref() {} }; timers.add(t); return t; }, clearInterval: t => timers.delete(t) });
const source = fs.readFileSync(path.join(__dirname,'../src/chat-mode.js'), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function').replaceAll('import.meta.url', "'file:///app/lib/chat-mode.js'");
vm.runInContext(source, context);
const window = new EventEmitter();
window.webContents = new Contents();
window.webContents.url = 'dsh-app://app/';
window.getContentSize = () => [1280, 820];
window.isDestroyed = () => false;
window.contentView = { addChildView() {} };
let permitted = true;
context.installChatMode(window, () => permitted);
const toolbar = views[0];
toolbar.webContents.emit('did-finish-load');
window.webContents.emit('did-finish-load');
assert(window.webContents.css.includes('-webkit-app-region: no-drag'), 'Switcher excluded from native titlebar dragging');
assert.equal(toolbar.visible, true);
assert.equal(views.length, 1, 'Website is lazy loaded');
const command = action => ipcMain.emit('dsh-local-chat:command', { sender: toolbar.webContents, senderFrame: toolbar.webContents.mainFrame }, action);
ipcMain.emit('dsh-local-chat:command', { sender: window.webContents, senderFrame: window.webContents.mainFrame }, 'chat');
assert.equal(views.length, 1, 'Main/remote renderers cannot use toolbar IPC');
command('chat');
const chat = views[1];
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
assert.equal(timers.size, 0);
console.log('PASS: lazy website loading, IPC ownership, session isolation, state retention, resize, navigation, reload, update gate, shortcuts and cleanup.');
