const { contextBridge, ipcRenderer } = require('electron');
if (process.isMainFrame) {
  const subscribe = (channel, callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
  let closeHandlers = 0;
  // A page without a leave flow of its own (an older Dev build) still closes.
  ipcRenderer.on('meeting:close-request', () => { if (!closeHandlers) ipcRenderer.send('meeting:quit'); });
  contextBridge.exposeInMainWorld('meetingDesktop', {
    setStage: stage => ipcRenderer.send('meeting:stage', stage),
    setSharing: active => ipcRenderer.send('meeting:sharing', active),
    expand: () => ipcRenderer.send('meeting:expand'),
    compact: () => ipcRenderer.send('meeting:compact'),
    minimize: () => ipcRenderer.send('meeting:minimize'),
    toggleMaximize: () => ipcRenderer.send('meeting:toggle-maximize'),
    setCompactHeight: height => ipcRenderer.send('meeting:compact-height', height),
    close: () => ipcRenderer.send('meeting:close'),
    quit: () => ipcRenderer.send('meeting:quit'),
    onCompact: callback => subscribe('meeting:compact-state', callback),
    onWindowState: callback => subscribe('meeting:window-state', callback),
    // 聚會內容 kept in the BOLCCOP folder beside the exe.
    agenda: {
      describe: () => ipcRenderer.invoke('agenda:describe'),
      list: () => ipcRenderer.invoke('agenda:list'),
      save: agenda => ipcRenderer.invoke('agenda:save', agenda),
      remove: id => ipcRenderer.invoke('agenda:remove', id),
      prune: () => ipcRenderer.invoke('agenda:prune'),
      putFile: (bytes, type) => ipcRenderer.invoke('agenda:putFile', bytes, type),
      getFile: id => ipcRenderer.invoke('agenda:getFile', id),
      deleteFile: id => ipcRenderer.invoke('agenda:deleteFile', id),
      pickVideo: () => ipcRenderer.invoke('agenda:pickVideo'),
      videoExists: file => ipcRenderer.invoke('agenda:videoExists', file),
      videoUrl: file => `meeting-file://video/?p=${encodeURIComponent(file)}`,
    },
    onCloseRequest: callback => {
      closeHandlers++;
      const off = subscribe('meeting:close-request', () => callback());
      return () => { closeHandlers--; off(); };
    },
  });
}
