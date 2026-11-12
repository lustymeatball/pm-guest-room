// Minimal Proxmox VE API client that runs in the Electron main process.
// Running here (not in the renderer) lets us talk to servers with self-signed
// certificates and keeps the auth ticket out of the web page.
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function encodeParams(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    const vals = Array.isArray(v) ? v : [v];
    for (const item of vals) {
      const val = typeof item === 'boolean' ? (item ? 1 : 0) : item;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(val)));
    }
  }
  return parts.join('&');
}

class PveError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

class PveClient {
  constructor({ host, port, username, realm, authMode, tokenId }) {
    this.host = host;
    this.port = Number(port) || 8006;
    this.username = username;
    this.realm = realm || 'pam';
    this.authMode = authMode || 'password';
    this.tokenId = tokenId; // user@realm!tokenname
    this.ticket = null;
    this.csrf = null;
    this.tokenSecret = null;
    this.userid = null;
    this.agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 16 });
    this.renewTimer = null;
  }

  authHeaders() {
    if (this.authMode === 'token') {
      return { Authorization: `PVEAPIToken=${this.tokenId}=${this.tokenSecret}` };
    }
    const h = {};
    if (this.ticket) h.Cookie = `PVEAuthCookie=${encodeURIComponent(this.ticket)}`;
    if (this.csrf) h.CSRFPreventionToken = this.csrf;
    return h;
  }

  raw(method, apiPath, params, { auth = true, timeout = 60000 } = {}) {
    method = method.toUpperCase();
    let urlPath = '/api2/json' + apiPath;
    let body = null;
    const qs = encodeParams(params);
    if (method === 'GET' || method === 'DELETE') {
      if (qs) urlPath += (urlPath.includes('?') ? '&' : '?') + qs;
    } else {
      body = qs;
    }
    const headers = { Accept: 'application/json', ...(auth ? this.authHeaders() : {}) };
    if (body !== null) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    return new Promise((resolve, reject) => {
      const req = https.request(
        { host: this.host, port: this.port, path: urlPath, method, headers, agent: this.agent, timeout },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {
              /* non-JSON body */
            }
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json ? json.data : text);
            } else {
              let msg = res.statusMessage || `HTTP ${res.statusCode}`;
              if (json && json.errors) {
                const details = Object.entries(json.errors)
                  .map(([k, v]) => `${k}: ${String(v).trim()}`)
                  .join('; ');
                if (details) msg += ` — ${details}`;
              } else if (json && json.message) {
                msg = json.message;
              }
              reject(new PveError(msg.trim(), res.statusCode));
            }
          });
        }
      );
      req.on('timeout', () => req.destroy(new PveError('Request timed out', 0)));
      req.on('error', (e) => reject(new PveError(friendlyNetError(e), 0)));
      if (body !== null) req.write(body);
      req.end();
    });
  }

  async login(secret) {
    if (this.authMode === 'token') {
      this.tokenSecret = secret;
      this.userid = this.tokenId.split('!')[0];
      // Validate token
      const version = await this.raw('GET', '/version');
      return { ok: true, version, userid: this.userid };
    }
    const userid = `${this.username}@${this.realm}`;
    const data = await this.raw('POST', '/access/ticket', { username: userid, password: secret, 'new-format': 1 }, { auth: false });
    if (data.NeedTFA) {
      this.pendingTfa = { ticket: data.ticket, userid, data };
      return { ok: false, needTfa: true, tfa: parseTfaChallenge(data.ticket) };
    }
    this.applyTicket(data);
    const version = await this.raw('GET', '/version');
    return { ok: true, version, userid: this.userid, cap: data.cap };
  }

  async completeTfa(code, type = 'totp') {
    if (!this.pendingTfa) throw new PveError('No pending two-factor challenge', 0);
    const { ticket, userid } = this.pendingTfa;
    const data = await this.raw(
      'POST',
      '/access/ticket',
      { username: userid, 'tfa-challenge': ticket, password: `${type}:${code}`, 'new-format': 1 },
      { auth: false }
    );
    this.pendingTfa = null;
    this.applyTicket(data);
    const version = await this.raw('GET', '/version');
    return { ok: true, version, userid: this.userid, cap: data.cap };
  }

  applyTicket(data) {
    this.ticket = data.ticket;
    this.csrf = data.CSRFPreventionToken;
    this.userid = data.username;
    clearInterval(this.renewTimer);
    // PVE tickets are valid for 2h; renew every 15 minutes.
    this.renewTimer = setInterval(() => this.renew().catch(() => {}), 15 * 60 * 1000);
  }

  async renew() {
    if (this.authMode === 'token' || !this.ticket) return;
    const data = await this.raw('POST', '/access/ticket', { username: this.userid, password: this.ticket }, { auth: false });
    this.applyTicket(data);
  }

  logout() {
    clearInterval(this.renewTimer);
    this.ticket = null;
    this.csrf = null;
    this.tokenSecret = null;
    this.agent.destroy();
  }

  wsHeaders() {
    return this.authHeaders();
  }

  // Streams a local file to /nodes/{node}/storage/{storage}/upload as multipart/form-data.
  upload({ node, storage, content, filePath, onProgress }) {
    const size = fs.statSync(filePath).size;
    const filename = path.basename(filePath);
    const boundary = '----PVECommander' + crypto.randomBytes(12).toString('hex');
    const pre = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="content"\r\n\r\n${content}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${filename.replace(/"/g, '')}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
    );
    const post = Buffer.from(`\r\n--${boundary}--\r\n`);
    const total = pre.length + size + post.length;
    const headers = {
      ...this.authHeaders(),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': total,
    };
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: this.host,
          port: this.port,
          method: 'POST',
          path: `/api2/json/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/upload`,
          headers,
          agent: this.agent,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(text).data);
              } catch {
                resolve(text);
              }
            } else reject(new PveError(res.statusMessage || `HTTP ${res.statusCode}`, res.statusCode));
          });
        }
      );
      req.on('error', (e) => reject(new PveError(friendlyNetError(e), 0)));
      let sent = 0;
      req.write(pre);
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
      stream.on('data', (chunk) => {
        sent += chunk.length;
        if (!req.write(chunk)) {
          stream.pause();
          req.once('drain', () => stream.resume());
        }
        onProgress && onProgress(sent, size);
      });
      stream.on('end', () => {
        req.write(post);
        req.end();
      });
      stream.on('error', (e) => req.destroy(e));
    });
  }
}

function parseTfaChallenge(ticket) {
  // Ticket format: PVE:user@realm:HEX::<base64-or-json challenge>
  try {
    const idx = ticket.indexOf('!tfa!');
    if (idx >= 0) {
      const json = decodeURIComponent(ticket.slice(idx + 5).split(':')[0]);
      return JSON.parse(json);
    }
  } catch {
    /* ignore */
  }
  return { totp: true };
}

function friendlyNetError(e) {
  switch (e.code) {
    case 'ECONNREFUSED':
      return 'Connection refused — is the server reachable on that port?';
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
      return 'Connection timed out — check the IP address and your network.';
    case 'ENOTFOUND':
      return 'Host not found — check the address.';
    case 'EHOSTUNREACH':
      return 'Host unreachable.';
    case 'ECONNRESET':
      return 'Connection reset by server.';
    default:
      return e.message || String(e);
  }
}

module.exports = { PveClient, PveError };
