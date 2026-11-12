import React, { useCallback, useEffect, useRef, useState } from 'react';
import RFB from '@novnc/novnc/core/rfb.js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Maximize, Minimize, RefreshCw, Keyboard, ClipboardPaste, ExternalLink, Play, Loader2, MonitorOff, ScanLine, Expand, Monitor, Terminal as TermIcon, Power } from 'lucide-react';
import { api, P } from '../lib/api';
import { Button, Menu, MenuItem, Modal, Textarea, Seg } from './ui';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const KS = {
  Control_L: 0xffe3,
  Alt_L: 0xffe9,
  Shift_L: 0xffe1,
  Super_L: 0xffeb,
  Delete: 0xffff,
  BackSpace: 0xff08,
  Tab: 0xff09,
  Return: 0xff0d,
  Escape: 0xff1b,
  Print: 0xff61,
  F: (n) => 0xffbe + n - 1,
};
const CODES = { Control_L: 'ControlLeft', Alt_L: 'AltLeft', Shift_L: 'ShiftLeft', Super_L: 'MetaLeft', Delete: 'Delete', BackSpace: 'Backspace', Tab: 'Tab', Return: 'Enter', Escape: 'Escape', Print: 'PrintScreen' };

// US keyboard: char -> [code, shift]
const US = (() => {
  const m = {};
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(97 + i);
    m[l] = ['Key' + l.toUpperCase(), false];
    m[l.toUpperCase()] = ['Key' + l.toUpperCase(), true];
  }
  ')!@#$%^&*('.split('').forEach((c, i) => {
    m[String(i)] = ['Digit' + i, false];
    m[c] = ['Digit' + i, true];
  });
  const pairs = [
    ['-', '_', 'Minus'],
    ['=', '+', 'Equal'],
    ['[', '{', 'BracketLeft'],
    [']', '}', 'BracketRight'],
    ['\\', '|', 'Backslash'],
    [';', ':', 'Semicolon'],
    ["'", '"', 'Quote'],
    [',', '<', 'Comma'],
    ['.', '>', 'Period'],
    ['/', '?', 'Slash'],
    ['`', '~', 'Backquote'],
  ];
  for (const [a, b, code] of pairs) {
    m[a] = [code, false];
    m[b] = [code, true];
  }
  m[' '] = ['Space', false];
  return m;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function typeText(rfb, text) {
  for (const ch of text.replace(/\r\n/g, '\n')) {
    if (ch === '\n') {
      rfb.sendKey(KS.Return, 'Enter');
    } else if (ch === '\t') {
      rfb.sendKey(KS.Tab, 'Tab');
    } else if (US[ch]) {
      const [code, shift] = US[ch];
      if (shift) rfb.sendKey(KS.Shift_L, 'ShiftLeft', true);
      rfb.sendKey(ch.charCodeAt(0), code, true);
      rfb.sendKey(ch.charCodeAt(0), code, false);
      if (shift) rfb.sendKey(KS.Shift_L, 'ShiftLeft', false);
    } else {
      // Non-US character: send raw keysym (works for unicode keysyms on many servers)
      const cp = ch.codePointAt(0);
      const ks = cp < 0x100 ? cp : 0x01000000 | cp;
      rfb.sendKey(ks, null);
    }
    await sleep(8);
  }
}

function sendCombo(rfb, keys) {
  keys.forEach((k) => rfb.sendKey(typeof k === 'number' ? k : KS[k], typeof k === 'number' ? null : CODES[k] || null, true));
  [...keys].reverse().forEach((k) => rfb.sendKey(typeof k === 'number' ? k : KS[k], typeof k === 'number' ? null : CODES[k] || null, false));
}

function fnKey(n) {
  return { ks: KS.F(n), code: 'F' + n };
}

function sendCtrlAltF(rfb, n) {
  const f = fnKey(n);
  rfb.sendKey(KS.Control_L, 'ControlLeft', true);
  rfb.sendKey(KS.Alt_L, 'AltLeft', true);
  rfb.sendKey(f.ks, f.code, true);
  rfb.sendKey(f.ks, f.code, false);
  rfb.sendKey(KS.Alt_L, 'AltLeft', false);
  rfb.sendKey(KS.Control_L, 'ControlLeft', false);
}

function apiBase({ type, node, vmid }) {
  if (type === 'node') return P`/nodes/${node}`;
  return P`/nodes/${node}/${type}/${vmid}`;
}

// ---------------------------------------------------------------------------
// noVNC graphical console
// ---------------------------------------------------------------------------
export function VncConsole({ target, standalone, toolbarExtra }) {
  const screenRef = useRef();
  const wrapRef = useRef();
  const rfbRef = useRef(null);
  const [state, setState] = useState({ phase: 'connecting', msg: '' });
  const [scale, setScale] = useState(() => localStorage.getItem('vncScale') || 'fit');
  const [fullscreen, setFullscreen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    let rfb = null;
    setState({ phase: 'connecting', msg: '' });
    (async () => {
      try {
        const base = apiBase(target);
        const res =
          target.type === 'node'
            ? await api.post(base + '/vncshell', { websocket: 1 })
            : await api.post(base + '/vncproxy', { websocket: 1 });
        const url = await window.pve.consoleUrl({ path: base, port: res.port, ticket: res.ticket });
        if (disposed) return;
        rfb = new RFB(screenRef.current, url, { credentials: { password: res.ticket }, wsProtocols: ['binary'] });
        rfbRef.current = rfb;
        rfb.scaleViewport = scale === 'fit';
        rfb.resizeSession = scale === 'remote';
        rfb.clipViewport = false;
        rfb.focusOnClick = true;
        rfb.background = '#000';
        rfb.addEventListener('connect', () => {
          if (!disposed) setState({ phase: 'connected', msg: '' });
          rfb.focus();
        });
        rfb.addEventListener('disconnect', (e) => {
          if (!disposed) setState({ phase: 'disconnected', msg: e.detail.clean ? 'Console session ended.' : 'Connection to the console was lost.' });
        });
        rfb.addEventListener('credentialsrequired', () => rfb.sendCredentials({ password: res.ticket }));
        rfb.addEventListener('securityfailure', (e) => !disposed && setState({ phase: 'disconnected', msg: 'Authentication failed: ' + (e.detail.reason || '') }));
        rfb.addEventListener('desktopname', (e) => {
          if (standalone) document.title = e.detail.name;
        });
      } catch (e) {
        if (!disposed) setState({ phase: 'error', msg: e.message });
      }
    })();
    return () => {
      disposed = true;
      try {
        rfb && rfb.disconnect();
      } catch {}
      rfbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.type, target.node, target.vmid, attempt]);

  useEffect(() => {
    localStorage.setItem('vncScale', scale);
    const r = rfbRef.current;
    if (!r) return;
    r.scaleViewport = scale === 'fit';
    r.resizeSession = scale === 'remote';
    r.clipViewport = scale === 'native';
  }, [scale]);

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current.requestFullscreen();
  };
  const rfb = () => rfbRef.current;
  const connected = state.phase === 'connected';

  return (
    <div className="console-wrap" ref={wrapRef}>
      <div className="console-toolbar">
        <span className="status">
          {connected ? (
            <>
              <span className="st running" style={{ width: 8, height: 8, borderRadius: 4, display: 'inline-block' }} /> Connected
            </>
          ) : state.phase === 'connecting' ? (
            <>
              <Loader2 size={13} className="spin" /> Connecting…
            </>
          ) : (
            <>
              <span className="st stopped" style={{ width: 8, height: 8, borderRadius: 4, display: 'inline-block' }} /> Disconnected
            </>
          )}
        </span>
        <Button size="sm" icon={Keyboard} disabled={!connected} onClick={() => rfb()?.sendCtrlAltDel()}>
          Ctrl+Alt+Del
        </Button>
        <Menu
          align="left"
          trigger={({ toggle }) => (
            <Button size="sm" disabled={!connected} onClick={toggle}>
              Send keys…
            </Button>
          )}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <MenuItem key={n} onClick={() => sendCtrlAltF(rfb(), n)}>
              Ctrl+Alt+F{n}
            </MenuItem>
          ))}
          <hr />
          <MenuItem onClick={() => sendCombo(rfb(), ['Control_L', 'Alt_L', 'BackSpace'])}>Ctrl+Alt+Backspace</MenuItem>
          <MenuItem onClick={() => sendCombo(rfb(), ['Alt_L', 'Tab'])}>Alt+Tab</MenuItem>
          <MenuItem onClick={() => sendCombo(rfb(), ['Super_L'])}>Windows key</MenuItem>
          <MenuItem onClick={() => sendCombo(rfb(), ['Super_L', 0x6c])}>Win+L (lock)</MenuItem>
          <MenuItem onClick={() => sendCombo(rfb(), ['Escape'])}>Escape</MenuItem>
          <MenuItem onClick={() => sendCombo(rfb(), ['Print'])}>Print Screen</MenuItem>
          <MenuItem onClick={() => sendCombo(rfb(), ['Control_L', 'Escape'])}>Ctrl+Esc</MenuItem>
        </Menu>
        <Button size="sm" icon={ClipboardPaste} disabled={!connected} onClick={() => setPasteOpen(true)} title="Type text into the VM as keystrokes">
          Type text
        </Button>
        <div className="grow" />
        {toolbarExtra}
        <Seg value={scale} onChange={setScale} options={[['fit', 'Fit'], ['native', '1:1'], ['remote', 'Resize guest']]} />
        <Button size="sm" iconOnly icon={RefreshCw} title="Reconnect" onClick={() => setAttempt((a) => a + 1)} />
        {!standalone && (
          <Button size="sm" iconOnly icon={ExternalLink} title="Open in new window" onClick={() => window.pve.openConsoleWindow({ ...target, mode: 'vnc' })} />
        )}
        <Button size="sm" iconOnly icon={fullscreen ? Minimize : Maximize} title="Fullscreen" onClick={toggleFs} />
      </div>
      <div className="console-screen">
        <div className="vnc" ref={screenRef} />
        {!connected && (
          <div className="console-overlay">
            <div className="box">
              {state.phase === 'connecting' ? (
                <>
                  <Loader2 size={28} className="spin" style={{ color: 'var(--accent)' }} />
                  Connecting to console…
                </>
              ) : (
                <>
                  <MonitorOff size={30} />
                  <div>{state.msg || 'Disconnected'}</div>
                  <Button icon={RefreshCw} onClick={() => setAttempt((a) => a + 1)}>
                    Reconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {pasteOpen && <PasteModal onClose={() => setPasteOpen(false)} onSend={(t) => rfb() && typeText(rfb(), t)} />}
    </div>
  );
}

function PasteModal({ onClose, onSend }) {
  const [t, setT] = useState('');
  useEffect(() => {
    navigator.clipboard
      ?.readText()
      .then((x) => x && setT(x))
      .catch(() => {});
  }, []);
  return (
    <Modal
      title="Type text into console"
      icon={ClipboardPaste}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onSend(t);
              onClose();
            }}
          >
            Send keystrokes
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="muted small">The text is typed into the guest key-by-key using a US keyboard layout. Your clipboard is pre-filled.</div>
        <Textarea value={t} onChange={setT} autoFocus style={{ minHeight: 160 }} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// xterm.js terminal console (node shell, LXC console, VM serial)
// ---------------------------------------------------------------------------
export function TermConsole({ target, standalone, cmd, toolbarExtra }) {
  const elRef = useRef();
  const wrapRef = useRef();
  const [state, setState] = useState({ phase: 'connecting', msg: '' });
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let disposed = false;
    let ws = null;
    let ping = null;
    const term = new Terminal({
      fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 14,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: {
        background: '#000000',
        foreground: '#d8deeb',
        cursor: '#a99dff',
        selectionBackground: 'rgba(124,108,255,0.4)',
        black: '#1c2030',
        red: '#ff5d6c',
        green: '#2fd17b',
        yellow: '#f5b13d',
        blue: '#5b8cff',
        magenta: '#b48cff',
        cyan: '#49d3e6',
        white: '#d8deeb',
        brightBlack: '#545d74',
        brightRed: '#ff8591',
        brightGreen: '#5be39a',
        brightYellow: '#ffcb6b',
        brightBlue: '#82a8ff',
        brightMagenta: '#cbb0ff',
        brightCyan: '#7fe4f0',
        brightWhite: '#ffffff',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(elRef.current);
    try {
      fit.fit();
    } catch {}
    setState({ phase: 'connecting', msg: '' });

    const enc = new TextEncoder();
    const send = (s) => ws && ws.readyState === 1 && ws.send(s);
    const sendResize = () => send(`1:${term.cols}:${term.rows}:`);

    (async () => {
      try {
        const base = apiBase(target);
        const params = {};
        if (target.type === 'qemu') params.serial = 'serial0';
        if (cmd) params.cmd = cmd;
        const res = await api.post(base + '/termproxy', params);
        const url = await window.pve.consoleUrl({ path: base, port: res.port, ticket: res.ticket });
        if (disposed) return;
        ws = new WebSocket(url, 'binary');
        ws.binaryType = 'arraybuffer';
        let authed = false;
        const dec = new TextDecoder();
        ws.onopen = () => {
          ws.send(`${res.user}:${res.ticket}\n`);
        };
        ws.onmessage = (ev) => {
          const data = typeof ev.data === 'string' ? ev.data : dec.decode(ev.data, { stream: true });
          if (!authed) {
            if (data.startsWith('OK')) {
              authed = true;
              setState({ phase: 'connected', msg: '' });
              term.write(data.slice(2));
              sendResize();
              term.focus();
              ping = setInterval(() => send('2'), 30000);
            } else {
              setState({ phase: 'error', msg: 'Authentication failed' });
              ws.close();
            }
            return;
          }
          term.write(data);
        };
        ws.onclose = (e) => {
          clearInterval(ping);
          if (!disposed) setState({ phase: 'disconnected', msg: e.reason || 'Terminal session ended.' });
        };
        ws.onerror = () => {};
      } catch (e) {
        if (!disposed) setState({ phase: 'error', msg: e.message });
      }
    })();

    const d1 = term.onData((d) => send(`0:${enc.encode(d).length}:${d}`));
    const d2 = term.onResize(() => sendResize());
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
    });
    ro.observe(elRef.current);

    return () => {
      disposed = true;
      clearInterval(ping);
      ro.disconnect();
      d1.dispose();
      d2.dispose();
      try {
        ws && ws.close();
      } catch {}
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.type, target.node, target.vmid, attempt, cmd]);

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const connected = state.phase === 'connected';
  return (
    <div className="console-wrap" ref={wrapRef}>
      <div className="console-toolbar">
        <span className="status">
          {connected ? (
            <>
              <span className="st running" style={{ width: 8, height: 8, borderRadius: 4, display: 'inline-block' }} /> Connected
            </>
          ) : state.phase === 'connecting' ? (
            <>
              <Loader2 size={13} className="spin" /> Connecting…
            </>
          ) : (
            <>
              <span className="st stopped" style={{ width: 8, height: 8, borderRadius: 4, display: 'inline-block' }} /> {state.msg}
            </>
          )}
        </span>
        <div className="grow" />
        {toolbarExtra}
        <Button size="sm" iconOnly icon={RefreshCw} title="Reconnect" onClick={() => setAttempt((a) => a + 1)} />
        {!standalone && (
          <Button size="sm" iconOnly icon={ExternalLink} title="Open in new window" onClick={() => window.pve.openConsoleWindow({ ...target, mode: 'term', ...(cmd ? { cmd } : {}) })} />
        )}
        <Button
          size="sm"
          iconOnly
          icon={fullscreen ? Minimize : Maximize}
          title="Fullscreen"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrapRef.current.requestFullscreen())}
        />
      </div>
      <div className="console-screen">
        <div className="term" ref={elRef} />
        {!connected && state.phase !== 'connecting' && (
          <div className="console-overlay">
            <div className="box">
              <MonitorOff size={30} />
              <div>{state.msg || 'Disconnected'}</div>
              <Button icon={RefreshCw} onClick={() => setAttempt((a) => a + 1)}>
                Reconnect
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Console panel used inside VM/CT/node views (handles stopped guests + mode)
// ---------------------------------------------------------------------------
export function ConsolePanel({ target, status, hasSerial, onStart, standalone, initialMode }) {
  const defaultMode = initialMode || (target.type === 'qemu' ? 'vnc' : 'term');
  const [mode, setMode] = useState(defaultMode);
  const running = target.type === 'node' || status === 'running';
  const modes =
    target.type === 'qemu'
      ? [['vnc', 'Display'], ...(hasSerial ? [['term', 'Serial']] : [])]
      : [['term', 'Terminal'], ['vnc', 'noVNC']];
  const switcher =
    modes.length > 1 ? (
      <Seg value={mode} onChange={setMode} options={modes.map(([v, l]) => [v, <span key={v} className="row" style={{ gap: 5 }}>{v === 'vnc' ? <Monitor size={12} /> : <TermIcon size={12} />}{l}</span>])} />
    ) : null;

  if (!running) {
    return (
      <div className="console-wrap">
        <div className="console-screen">
          <div className="console-overlay">
            <div className="box">
              <Power size={34} style={{ color: 'var(--faint)' }} />
              <div style={{ fontSize: 15, color: 'var(--text)' }}>{target.type === 'qemu' ? 'VM' : 'Container'} is not running</div>
              <div className="muted small">Start it to open the console. The console connects automatically once it's up.</div>
              {onStart && (
                <Button variant="primary" icon={Play} onClick={onStart}>
                  Start now
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return mode === 'vnc' ? (
    <VncConsole target={target} standalone={standalone} toolbarExtra={switcher} />
  ) : (
    <TermConsole target={target} standalone={standalone} toolbarExtra={switcher} />
  );
}

// ---------------------------------------------------------------------------
// Pop-out console window
// ---------------------------------------------------------------------------
export function StandaloneConsole({ type, node, vmid, name, mode, cmd }) {
  const [status, setStatus] = useState(type === 'node' ? 'running' : null);
  const [hasSerial, setHasSerial] = useState(false);
  const target = { type, node, vmid: vmid ? Number(vmid) : undefined };

  const poll = useCallback(async () => {
    if (type === 'node') return;
    try {
      const s = await api.get(P`/nodes/${node}/${type}/${vmid}/status/current`);
      setStatus(s.status);
      if (type === 'qemu') {
        const cfg = await api.get(P`/nodes/${node}/qemu/${vmid}/config`);
        setHasSerial(!!cfg.serial0);
      }
    } catch {
      setStatus('unknown');
    }
  }, [type, node, vmid]);

  useEffect(() => {
    document.title = type === 'node' ? `Shell — ${node}` : `${type === 'qemu' ? 'VM' : 'CT'} ${vmid}${name ? ' — ' + name : ''}`;
    poll();
    const i = setInterval(poll, 4000);
    return () => clearInterval(i);
  }, [poll, type, node, vmid, name]);

  const start = async () => {
    try {
      await api.post(P`/nodes/${node}/${type}/${vmid}/status/start`);
      setTimeout(poll, 2500);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="console-standalone">
      <div className="titlebar">
        <div className="brand">
          <img className="brand-logo" src="logo.png" alt="" />
          {document.title}
        </div>
        {type !== 'node' && status && <span className="muted small">{status}</span>}
      </div>
      {status === null ? (
        <div className="center-fill">
          <Loader2 className="spin" />
        </div>
      ) : cmd ? (
        <TermConsole target={target} standalone cmd={cmd} />
      ) : (
        <ConsolePanel target={target} status={status} hasSerial={hasSerial} onStart={start} standalone initialMode={mode} />
      )}
    </div>
  );
}

export { ScanLine, Expand };
