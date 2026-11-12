// Persistent settings: saved servers, last connection, UI prefs.
// Passwords / token secrets are only stored if the user opts in, and are encrypted
// with the OS keychain (Electron safeStorage -> Windows DPAPI, or the Linux Secret Service / KWallet).
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'settings.json');

const defaults = { connections: [], lastConnectionId: null, prefs: { refreshInterval: 3000, sidebarWidth: 290 } };

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return { ...defaults, ...raw, prefs: { ...defaults.prefs, ...(raw.prefs || {}) } };
  } catch {
    return JSON.parse(JSON.stringify(defaults));
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data, null, 2));
}

function encrypt(text) {
  if (!text) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  // On Linux without GNOME Keyring / KWallet, Electron falls back to a fixed key; don't save secrets that way.
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return null;
  return safeStorage.encryptString(text).toString('base64');
}

function decrypt(b64) {
  if (!b64) return null;
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  } catch {
    return null;
  }
}

function connId(c) {
  return `${c.authMode === 'token' ? c.tokenId : c.username + '@' + c.realm}@${c.host}:${c.port}`;
}

// Public view sent to the renderer: never includes secrets.
function publicSettings() {
  const s = load();
  return {
    lastConnectionId: s.lastConnectionId,
    prefs: s.prefs,
    connections: s.connections.map(({ secret, ...rest }) => ({ ...rest, hasSecret: !!secret })),
  };
}

function upsertConnection(conn, secret, remember) {
  const s = load();
  const id = connId(conn);
  const existing = s.connections.find((c) => c.id === id);
  const entry = { ...conn, id, lastUsed: Date.now() };
  if (remember && secret) entry.secret = encrypt(secret);
  else if (remember && existing && existing.secret) entry.secret = existing.secret;
  else entry.secret = null;
  s.connections = [entry, ...s.connections.filter((c) => c.id !== id)];
  s.lastConnectionId = id;
  save(s);
  return id;
}

function getConnection(id) {
  const s = load();
  const c = s.connections.find((x) => x.id === id);
  if (!c) return null;
  return { ...c, secret: decrypt(c.secret) };
}

function removeConnection(id) {
  const s = load();
  s.connections = s.connections.filter((c) => c.id !== id);
  if (s.lastConnectionId === id) s.lastConnectionId = s.connections[0]?.id || null;
  save(s);
}

function setPrefs(prefs) {
  const s = load();
  s.prefs = { ...s.prefs, ...prefs };
  save(s);
  return s.prefs;
}

module.exports = { load, publicSettings, upsertConnection, getConnection, removeConnection, setPrefs };
