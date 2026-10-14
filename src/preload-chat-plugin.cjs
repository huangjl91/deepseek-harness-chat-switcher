const chatPluginElectron = require('electron');
if (location.protocol === 'dsh-app:' && location.hostname === 'app' && process.isMainFrame) {
  chatPluginElectron.contextBridge.exposeInMainWorld('dshChatModes', {
    protocolVersion: 1,
    activate: () => chatPluginElectron.ipcRenderer.invoke('dsh-local-chat:plugin', 'activate'),
    deactivate: () => chatPluginElectron.ipcRenderer.invoke('dsh-local-chat:plugin', 'deactivate')
  });
}
