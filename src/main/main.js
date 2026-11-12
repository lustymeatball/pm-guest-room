const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const store = require('./store');
const { PveClient } = require('./pve');
const { ConsoleProxy } = require('./consoleProxy');

let client = null;
let proxy = null;
let mainWindow = null;

const INDEX = path.join(__dirname, '..', '..', 'dist', 'index.html');
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');

// Carry saved servers over from the app's previous name ("Proxmox Commander").
try {
  const fs = require('fs');
  const now = path.join(app.getPath('userData'), 'settings.json');
  const old = path.join(app.getPath('appData'), 'Proxmox Commander', 'settings.json');
  if (!fs.existsSync(now) && fs.existsSync(old)) {
    fs.mkdirSync(path.dirname(now), { recursive: true });
    fs.copyFileSync(old, now);
  }
} catch {}

function windowOptions(extra = {}) {
  return {
    backgroundColor: '#0a0d14',
    titleBarStyle: 'hidden',
    // Linux window controls need an opaque color; Windows draws them over the transparent title bar.
    titleBarOverlay: { color: process.platform === 'linux' ? '#0b0e17' : '#00000000', symbolColor: '#c9d1e3', height: 40 },
    ...(require('fs').existsSync(ICON) ? { icon: ICON } : {}),
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
    ...extra,
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow(windowOptions({ width: 1480, height: 920, minWidth: 1100, minHeight: 680 }));
  mainWindow.loadFile(INDEX);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    BrowserWindow.getAllWindows().forEach((w) => w.close());
  });
}

function wrap(fn) {
  return async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (e) {
      if (e.status === 401 && event.sender && !event.sender.isDestroyed()) {
        event.sender.send('auth:expired');
      }
      return { __error: true, message: e.message || String(e), status: e.status };
    }
  };
}

function requireClient() {
  if (!client) {
    const e = new Error('Not connected');
    e.status = 401;
    throw e;
  }
  return client;
}

function sessionInfo() {
  if (!client || (!client.ticket && !client.tokenSecret)) return null;
  return { host: client.host, port: client.port, userid: client.userid, authMode: client.authMode };
}

ipcMain.handle('settings:get', wrap(() => store.publicSettings()));
ipcMain.handle('settings:prefs', wrap((_e, prefs) => store.setPrefs(prefs)));
ipcMain.handle('settings:removeConnection', wrap((_e, id) => store.removeConnection(id)));

async function doLogin(opts, secret) {
  if (client) client.logout();
  const conn = {
    host: String(opts.host || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, ''),
    port: Number(opts.port) || 8006,
    username: (opts.username || 'root').trim(),
    realm: opts.realm || 'pam',
    authMode: opts.authMode || 'password',
    tokenId: (opts.tokenId || '').trim(),
    label: opts.label || '',
  };
  if (!conn.host) throw new Error('Enter the server IP address or hostname.');
  client = new PveClient(conn);
  const res = await client.login(secret);
  // Save the server for next launch (secret only if "remember" was checked).
  store.upsertConnection(conn, secret, !!opts.remember);
  return { ...res, session: sessionInfo() };
}

ipcMain.handle('auth:login', wrap((_e, opts) => doLogin(opts, opts.secret)));
ipcMain.handle(
  'auth:loginSaved',
  wrap((_e, id) => {
    const c = store.getConnection(id);
    if (!c || !c.secret) throw new Error('No saved credentials for this server.');
    return doLogin({ ...c, remember: true }, c.secret);
  })
);
ipcMain.handle(
  'auth:tfa',
  wrap(async (_e, code, type) => {
    const res = await requireClient().completeTfa(code, type);
    return { ...res, session: sessionInfo() };
  })
);
ipcMain.handle(
  'auth:logout',
  wrap(() => {
    if (client) client.logout();
    client = null;
    return true;
  })
);
ipcMain.handle('auth:session', wrap(() => sessionInfo()));

ipcMain.handle('api:request', wrap((_e, method, apiPath, params) => requireClient().raw(method, apiPath, params)));

ipcMain.handle(
  'console:register',
  wrap((_e, target) => proxy.register({ client: requireClient(), path: target.path, port: target.port, ticket: target.ticket }))
);

ipcMain.handle(
  'upload:file',
  wrap(async (event, { node, storage, content }) => {
    const filters =
      content === 'iso'
        ? [{ name: 'Disk images', extensions: ['iso', 'img'] }, { name: 'All files', extensions: ['*'] }]
        : content === 'vztmpl'
          ? [{ name: 'Container templates', extensions: ['tar.gz', 'tar.xz', 'tar.zst', 'gz', 'xz', 'zst'] }]
          : [{ name: 'All files', extensions: ['*'] }];
    const win = BrowserWindow.fromWebContents(event.sender);
    const pick = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
    if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
    const filePath = pick.filePaths[0];
    const name = path.basename(filePath);
    let last = 0;
    const upid = await requireClient().upload({
      node,
      storage,
      content,
      filePath,
      onProgress: (sent, total) => {
        const now = Date.now();
        if (now - last > 200 || sent === total) {
          last = now;
          if (!event.sender.isDestroyed()) event.sender.send('upload:progress', { name, sent, total });
        }
      },
    });
    return { upid, name };
  })
);

ipcMain.handle(
  'window:console',
  wrap((_e, params) => {
    const w = new BrowserWindow(windowOptions({ width: 1100, height: 760, minWidth: 640, minHeight: 420 }));
    w.loadFile(INDEX, { hash: 'console?' + new URLSearchParams(params).toString() });
    w.once('ready-to-show', () => w.show());
    return true;
  })
);

ipcMain.handle(
  'app:openExternal',
  wrap((_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return true;
  })
);

app.setAppUserModelId('app.pmguestroom.desktop');
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  proxy = new ConsoleProxy();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (client) client.logout();
  app.quit();
});
