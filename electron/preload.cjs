const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('forge', {
  create: (data, assets) => ipcRenderer.invoke('create', data, assets),
  open: () => ipcRenderer.invoke('open'),
  openPath: dir => ipcRenderer.invoke('open-path', dir),
  recent: () => ipcRenderer.invoke('recent'),
  save: data => ipcRenderer.invoke('save', data),
  assetData: name => ipcRenderer.invoke('asset-data', name),
  writeAsset: file => ipcRenderer.invoke('write-asset', file),
  exportFile: file => ipcRenderer.invoke('export-file', file),
  backups: () => ipcRenderer.invoke('backups'),
  restore: file => ipcRenderer.invoke('restore', file),
  onFlush: callback => ipcRenderer.on('forge-flush', (_event, close) => callback(close)),
  closeReady: () => ipcRenderer.send('close-ready'),
});
