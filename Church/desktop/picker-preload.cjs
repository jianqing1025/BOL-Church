const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('capturePicker', {
  list: () => ipcRenderer.invoke('capture:list'),
  choose: selection => ipcRenderer.send('capture:choose', selection),
});
