// Local WebSocket relay for VM/CT/node consoles.
// The renderer (noVNC / xterm.js) connects to ws://127.0.0.1:<port>/<token>;
// we open the authenticated wss:// connection to Proxmox (accepting the
// self-signed certificate and adding the auth cookie) and pipe frames both ways.
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

class ConsoleProxy {
  constructor() {
    this.pending = new Map();
    this.server = http.createServer((req, res) => {
      res.writeHead(404);
      res.end();
    });
    this.wss = new WebSocketServer({
      server: this.server,
      handleProtocols: (protocols) => (protocols.has('binary') ? 'binary' : false),
    });
    this.wss.on('connection', (client, req) => this.onConnection(client, req));
    this.ready = new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  async register(target) {
    await this.ready;
    const token = crypto.randomBytes(24).toString('hex');
    this.pending.set(token, { ...target, created: Date.now() });
    // Tokens are single use and expire after 60s if not used.
    setTimeout(() => this.pending.delete(token), 60000);
    return `ws://127.0.0.1:${this.port}/${token}`;
  }

  onConnection(client, req) {
    const token = (req.url || '').replace(/^\//, '');
    const target = this.pending.get(token);
    this.pending.delete(token);
    if (!target) {
      client.close(4001, 'Invalid console token');
      return;
    }
    const { client: pve, path, port, ticket } = target;
    const url =
      `wss://${pve.host.includes(':') && !pve.host.startsWith('[') ? `[${pve.host}]` : pve.host}:${pve.port}` +
      `/api2/json${path}/vncwebsocket?port=${encodeURIComponent(port)}&vncticket=${encodeURIComponent(ticket)}`;
    const upstream = new WebSocket(url, ['binary'], {
      rejectUnauthorized: false,
      headers: pve.wsHeaders(),
      perMessageDeflate: false,
    });
    const queue = [];
    client.on('message', (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else queue.push([data, isBinary]);
    });
    upstream.on('open', () => {
      for (const [d, b] of queue) upstream.send(d, { binary: b });
      queue.length = 0;
    });
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    const closeBoth = (code, reason) => {
      const c = typeof code === 'number' && code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000;
      try {
        client.close(c, String(reason || '').slice(0, 120));
      } catch {}
      try {
        upstream.close();
      } catch {}
    };
    upstream.on('close', (code, reason) => closeBoth(code, reason));
    upstream.on('error', (e) => closeBoth(4002, e.message));
    upstream.on('unexpected-response', (_req, res) => closeBoth(4003, `Proxmox refused console: ${res.statusCode} ${res.statusMessage}`));
    client.on('close', () => {
      try {
        upstream.close();
      } catch {}
    });
  }
}

module.exports = { ConsoleProxy };
