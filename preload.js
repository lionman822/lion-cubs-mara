const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  mini: (on) => ipcRenderer.send('win:mini', on),
  pin: () => ipcRenderer.invoke('win:pin'),
  isPinned: () => ipcRenderer.invoke('win:isPinned'),
  close: () => ipcRenderer.send('win:close'),
  notify: (title, body) => ipcRenderer.send('app:notify', { title, body }),
  status: (st) => ipcRenderer.send('app:status', st),
});
