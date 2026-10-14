const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
test('bundle registers the client and activation follows the plugin lifecycle',async()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  assert.equal(manifest.dsh.bundle.patch,'./cordis.patch.yml');
  assert.equal(manifest.dsh.client.platform,'web');
  const patch=fs.readFileSync(path.join(root,'cordis.patch.yml'),'utf8');
  assert(patch.includes('name: '+manifest.name));
  assert(patch.startsWith('- insert:'),'Bundle contributes a new Loader entry, rather than overriding a missing one');
  let module;
  const actions=[];
  const context=vm.createContext({window:{__ModuleLoader__:{load(value){module=value;}}},dshChatModes:{protocolVersion:1,async activate(){actions.push('activate');},async deactivate(){actions.push('deactivate');}}});
  vm.runInContext(fs.readFileSync(path.join(root,'lib/client.js'),'utf8'),context);
  assert.equal(module.id,manifest.name);
  let disposed;
  module.factory().apply({effect(fn){disposed=fn();}});
  assert.deepEqual(actions,['activate']);
  await disposed();
  assert.deepEqual(actions,['activate','deactivate']);
  delete context.dshChatModes;
  assert.throws(()=>module.factory().apply({}),/桌面桥接层/);
});
test('desktop preload exposes only lifecycle calls to the trusted main workspace',async()=>{
  const source=fs.readFileSync(path.join(root,'src/preload-chat-plugin.cjs'),'utf8');
  for(const [protocol,hostname,isMainFrame,allowed] of [['dsh-app:','app',true,true],['https:','chat.deepseek.com',true,false],['dsh-app:','app',false,false],['dsh-app:','welcome',true,false]]){
    let bridge;
    const calls=[];
    const electron={contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'dshChatModes');bridge=value;}},ipcRenderer:{async invoke(...args){calls.push(args);}}};
    vm.runInNewContext(source,{require(name){assert.equal(name,'electron');return electron;},location:{protocol,hostname},process:{isMainFrame}});
    assert.equal(!!bridge,allowed);
    if(bridge){assert.deepEqual(Object.keys(bridge),['protocolVersion','activate','deactivate']);await bridge.activate();await bridge.deactivate();assert.deepEqual(calls,[['dsh-local-chat:plugin','activate'],['dsh-local-chat:plugin','deactivate']]);}
  }
});
