const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  git: (cwd, args) => ipcRenderer.invoke('git', cwd, args),
  openRepo: () => ipcRenderer.invoke('open-repo'),
  readFile: (repo, rel) => ipcRenderer.invoke('read-file', repo, rel),
});
