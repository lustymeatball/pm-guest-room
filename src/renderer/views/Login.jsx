import React, { useEffect, useState } from 'react';
import { Server, Monitor, ShieldCheck, Gauge, HardDrive, Trash2, LogIn, KeyRound, Zap } from 'lucide-react';
import { Button, Field, Input, Select, Checkbox, ErrorBox, Seg } from '../components/ui';
import { cls } from '../lib/utils';

export function Login({ onLogin }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ host: '', port: 8006, username: 'root', realm: 'pam', authMode: 'password', tokenId: '', secret: '', remember: false });
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tfa, setTfa] = useState(false);
  const [tfaCode, setTfaCode] = useState('');
  const [tfaType, setTfaType] = useState('totp');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const load = async () => {
    const s = await window.pve.settings();
    setSettings(s);
    const last = s.connections.find((c) => c.id === s.lastConnectionId) || s.connections[0];
    if (last) pick(last);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (c) => {
    setSelectedId(c.id);
    setForm((f) => ({ ...f, host: c.host, port: c.port, username: c.username || 'root', realm: c.realm || 'pam', authMode: c.authMode || 'password', tokenId: c.tokenId || '', secret: '', remember: !!c.hasSecret }));
  };

  const finish = (res) => {
    if (res.needTfa) {
      setTfa(true);
      setBusy(false);
      return;
    }
    onLogin(res.session);
  };

  const submit = async (e) => {
    e && e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const saved = settings?.connections.find((c) => c.id === selectedId);
      const sameAsSaved = saved && saved.hasSecret && !form.secret && saved.host === form.host.trim() && Number(saved.port) === Number(form.port);
      const res = sameAsSaved ? await window.pve.loginSaved(saved.id) : await window.pve.login(form);
      finish(res);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const submitTfa = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      finish(await window.pve.tfa(tfaCode.trim(), tfaType));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const remove = async (c, e) => {
    e.stopPropagation();
    await window.pve.removeConnection(c.id);
    if (selectedId === c.id) setSelectedId(null);
    load();
  };

  const saved = settings?.connections || [];
  const selected = saved.find((c) => c.id === selectedId);

  return (
    <div className="app">
      <div className="titlebar">
        <div className="brand">
          <img className="brand-logo" src="logo.png" alt="" />
          PM - Guest Room
        </div>
      </div>
      <div className="login-screen">
        <div className="login-art">
          <div>
            <h1>
              Your homelab,
              <br />
              <span>beautifully managed.</span>
            </h1>
            <p>A fast, modern desktop client for Proxmox VE. Manage virtual machines, containers, storage and your cluster — with full graphical and terminal consoles built in.</p>
            <div className="feature-list">
              <div><Monitor size={18} /> Live VM desktop (noVNC) and terminal consoles</div>
              <div><Gauge size={18} /> Real-time performance graphs for every resource</div>
              <div><HardDrive size={18} /> Storage, ISO uploads, backups and snapshots</div>
              <div><ShieldCheck size={18} /> Users, permissions, firewall and HA</div>
            </div>
          </div>
          <div className="faint small">Connects directly to your server's API on port 8006 — nothing leaves your network.</div>
        </div>
        <div className="login-panel">
          <div className="login-card">
            {tfa ? (
              <form className="form" onSubmit={submitTfa}>
                <div>
                  <h2>Two-factor authentication</h2>
                  <p className="lead">Enter the code from your authenticator app.</p>
                </div>
                <Field label="Method">
                  <Select value={tfaType} onChange={setTfaType} options={[['totp', 'TOTP (authenticator app)'], ['recovery', 'Recovery key'], ['yubico', 'Yubico OTP']]} />
                </Field>
                <Field label="Code">
                  <Input value={tfaCode} onChange={setTfaCode} autoFocus placeholder="123456" />
                </Field>
                <ErrorBox error={error} />
                <div className="row">
                  <Button type="button" onClick={() => { setTfa(false); setError(null); }}>Back</Button>
                  <Button type="submit" variant="primary" loading={busy} className="grow">Verify</Button>
                </div>
              </form>
            ) : (
              <>
                <h2>Connect to server</h2>
                <p className="lead">Enter the IP address of your Proxmox VE host. It will be remembered for next time.</p>
                {saved.length > 0 && (
                  <>
                    <div className="saved-list">
                      {saved.map((c) => (
                        <div key={c.id} className={cls('saved-item', c.id === selectedId && 'active')} onClick={() => pick(c)} onDoubleClick={() => c.hasSecret && submit()}>
                          <div className="ic"><Server size={17} /></div>
                          <div className="meta">
                            <b>{c.host}{Number(c.port) !== 8006 ? `:${c.port}` : ''}</b>
                            <span>{c.authMode === 'token' ? c.tokenId : `${c.username}@${c.realm}`}{c.hasSecret ? ' · saved login' : ''}</span>
                          </div>
                          <Button type="button" size="sm" variant="ghost" iconOnly icon={Trash2} title="Forget server" onClick={(e) => remove(c, e)} />
                        </div>
                      ))}
                    </div>
                    <div className="divider">or connect to a new server</div>
                  </>
                )}
                <form className="form" onSubmit={submit}>
                  <div className="form-row" style={{ gridTemplateColumns: '1fr 110px' }}>
                    <Field label="Server IP / hostname">
                      <Input value={form.host} onChange={(v) => { set('host')(v); setSelectedId(null); }} placeholder="192.168.1.10" autoFocus={!saved.length} />
                    </Field>
                    <Field label="Port">
                      <Input value={form.port} onChange={set('port')} />
                    </Field>
                  </div>
                  <Seg value={form.authMode} onChange={set('authMode')} options={[['password', 'Username & password'], ['token', 'API token']]} />
                  {form.authMode === 'password' ? (
                    <>
                      <div className="form-row" style={{ gridTemplateColumns: '1fr 170px' }}>
                        <Field label="Username">
                          <Input value={form.username} onChange={set('username')} />
                        </Field>
                        <Field label="Realm">
                          <Select value={form.realm} onChange={set('realm')} options={[['pam', 'Linux PAM'], ['pve', 'Proxmox VE'], ['ldap', 'LDAP'], ['ad', 'Active Directory'], ['openid', 'OpenID']]} />
                        </Field>
                      </div>
                      <Field label="Password">
                        <Input type="password" value={form.secret} onChange={set('secret')} placeholder={selected?.hasSecret ? '•••••••• (saved)' : ''} autoFocus={!!saved.length} />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Token ID" hint="Format: user@realm!tokenname">
                        <Input value={form.tokenId} onChange={set('tokenId')} placeholder="root@pam!commander" />
                      </Field>
                      <Field label="Token secret">
                        <Input type="password" value={form.secret} onChange={set('secret')} placeholder={selected?.hasSecret ? '•••••••• (saved)' : 'xxxxxxxx-xxxx-…'} />
                      </Field>
                    </>
                  )}
                  <Checkbox checked={form.remember} onChange={set('remember')} label="Remember credentials (encrypted with Windows)" />
                  <ErrorBox error={error} />
                  <Button type="submit" variant="primary" loading={busy} icon={form.authMode === 'token' ? KeyRound : LogIn} style={{ height: 40 }}>
                    Connect
                  </Button>
                  <div className="faint small row" style={{ gap: 6 }}>
                    <Zap size={13} /> Self-signed certificates are accepted automatically for local servers.
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
