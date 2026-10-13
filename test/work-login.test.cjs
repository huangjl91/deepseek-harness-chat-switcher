const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { EventEmitter } = require('events');
const windows = [];
const partitions = [];
const cancelled = [];
let focused = 0;
const cookies = new EventEmitter();
cookies.flushStore = async()=>{};
const browserSession = { cookies };
class Window extends EventEmitter {
  constructor(options) {
    super();this.options=options;this.destroyed=false;
    this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=handler=>this.popup=handler;
    windows.push(this);
  }
  isDestroyed(){return this.destroyed;}
  close(){this.destroyed=true;this.emit('closed');}
  show(){this.shown=true;}
  focus(){this.focused=true;}
  async loadURL(url){this.url=url;}
}
const context=vm.createContext({BrowserWindow:Window,session:{fromPartition(name){partitions.push(name);return browserSession}},shell:{async openExternal(){}},URL});
const source=fs.readFileSync(path.join(__dirname,'../src/work-login.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export function','function');
vm.runInContext(source,context);
const controller=context.createWorkLoginBrowser({getParent:()=>undefined,cancel:id=>cancelled.push(id),focusOwner:()=>focused++});
const url='https://platform.deepseek.com/dsh/authorize?test=example';
const callback='http://127.0.0.1:43210/';
assert.throws(()=>controller.open('https://platform.deepseek.com/not-authorize','bad',callback));
assert.throws(()=>controller.open(url,'bad','http://remote.invalid:1234/'));
controller.open(url,'attempt-a',callback);
assert.deepEqual(partitions,['persist:dsh-work-login']);
assert.notEqual(partitions[0],'persist:dsh-web-chat');
assert.equal(windows[0].options.webPreferences.preload,undefined,'Authorization has no Harness renderer bridge');
assert.equal(windows[0].options.webPreferences.nodeIntegration,false);
let blocked=false;
windows[0].webContents.emit('will-navigate',{preventDefault(){blocked=true}},'http://127.0.0.1:43210/api/account/signOut');
assert(blocked,'Only the PKCE callback is allowed on the local host');
blocked=false;
windows[0].webContents.emit('will-redirect',{preventDefault(){blocked=true}},callback+'oauth/callback?state=opaque&code=opaque');
assert.equal(blocked,false,'Official callback reaches the original backend');
controller.sync({attempt:{id:'attempt-a',phase:'succeeded'}});
assert.equal(windows[0].destroyed,true);
assert.deepEqual(cancelled,[],'Successful login is not cancelled or signed out');
assert.equal(focused,1);
controller.open(url,'attempt-b',callback);
windows[1].close();
assert.deepEqual(cancelled,['attempt-b'],'Manual close only cancels its own pending authorization');
controller.open(url,'attempt-c',callback);
controller.open(url,'attempt-c',callback);
assert.equal(windows.length,3,'Joining one attempt reuses its browser');
controller.dispose();
assert.deepEqual(cancelled,['attempt-b']);
assert.equal(cookies.listenerCount('changed'),0);
console.log('PASS: work/chat session separation, PKCE callback scope, successful authorization lifecycle, cancellation and disposal.');
