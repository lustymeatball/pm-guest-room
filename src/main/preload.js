const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (res && res.__error) {
    const err = new Error(res.message);
    err.status = res.status;
    throw err;
  }
  return res;
}

contextBridge.exposeInMainWorld('pve', {
  settings: () => call('settings:get'),
  setPrefs: (prefs) => call('settings:prefs', prefs),
  removeConnection: (id) => call('settings:removeConnection', id),
  login: (opts) => call('auth:login', opts),
  loginSaved: (id) => call('auth:loginSaved', id),
  tfa: (code, type) => call('auth:tfa', code, type),
  logout: () => call('auth:logout'),
  session: () => call('auth:session'),
  api: (method, path, params) => call('api:request', method, path, params),
  consoleUrl: (target) => call('console:register', target),
  upload: (opts) => call('upload:file', opts),
  openConsoleWindow: (params) =>
    call('window:console', Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''))),
  openExternal: (url) => call('app:openExternal', url),
  onUploadProgress: (fn) => {
    const h = (_e, data) => fn(data);
    ipcRenderer.on('upload:progress', h);
    return () => ipcRenderer.removeListener('upload:progress', h);
  },
  onSessionExpired: (fn) => {
    const h = () => fn();
    ipcRenderer.on('auth:expired', h);
    return () => ipcRenderer.removeListener('auth:expired', h);
  },
  platform: process.platform,
});
