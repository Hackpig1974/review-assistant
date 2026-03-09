const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getVersion: () => ipcRenderer.invoke('get-version'),
  browseFolder: () => ipcRenderer.invoke('browse-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Folders
  scanFolders: (rootPath) => ipcRenderer.invoke('scan-folders', rootPath),
  saveFolderData: (data) => ipcRenderer.invoke('save-folder-data', data),

  // Processing
  generateReviews: (data) => ipcRenderer.invoke('generate-reviews', data),
  openReviewTabs: (data) => ipcRenderer.invoke('open-review-tabs', data),
  confirmLogin: () => ipcRenderer.send('confirm-login'),

  // Events from main
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, v) => cb(v)),
  onLoginRequired: (cb) => ipcRenderer.on('login-required', () => cb()),
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_, msg) => cb(msg)),
  onBrowserClosed: (cb) => ipcRenderer.on('browser-closed', () => cb()),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
