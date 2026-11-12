import React, { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { useApp } from '../context';
import { api, P, useApi } from '../lib/api';
import { Field, Input, NumberInput, Select, Checkbox, KV, Textarea } from '../components/ui';
import { Wizard } from './Wizard';
import { useNodes, useStorages, storageOptions, useNextId } from '../components/GuestDialogs';
import { fmtBytes, sortBy, buildProp } from '../lib/utils';

export function CreateCTWizard({ onClose, defaultNode }) {
  const app = useApp();
  const nodes = useNodes().filter((n) => n.status === 'online');
  const [vmid, setVmid] = useNextId();
  const [f, setF] = useState({
    node: defaultNode || '',
    hostname: '',
    unprivileged: true,
    nesting: true,
    password: '',
    password2: '',
    sshkeys: '',
    pool: '',
    tags: '',
    tmplStorage: '',
    template: '',
    rootStorage: '',
    size: 8,
    cores: 1,
    memory: 512,
    swap: 512,
    netname: 'eth0',
    bridge: 'vmbr0',
    tag: '',
    ipmode: 'dhcp',
    ip: '',
    gw: '',
    ip6mode: 'none',
    ip6: '',
    gw6: '',
    firewall: true,
    searchdomain: '',
    nameserver: '',
    onboot: false,
    start: false,
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!f.node && nodes[0]) set('node')(nodes[0].node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);
  const tmplStorages = useStorages(f.node, 'vztmpl');
  const rootStorages = useStorages(f.node, 'rootdir');
  const { data: templates } = useApi(f.node && f.tmplStorage ? P`/nodes/${f.node}/storage/${f.tmplStorage}/content` : null, { content: 'vztmpl' }, { enabled: !!(f.node && f.tmplStorage) });
  const { data: bridges } = useApi(f.node ? P`/nodes/${f.node}/network` : null, { type: 'any_bridge' }, { enabled: !!f.node });
  const pools = app.resources.filter((r) => r.type === 'pool');
  useEffect(() => {
    if (!f.tmplStorage && tmplStorages[0]) set('tmplStorage')(tmplStorages[0].storage);
    if (!f.rootStorage && rootStorages[0]) set('rootStorage')(rootStorages[0].storage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmplStorages.length, rootStorages.length]);

  const exists = app.resources.some((r) => r.vmid === Number(vmid));
  const pwOk = (f.password.length >= 5 && f.password === f.password2) || (!f.password && f.sshkeys.trim());

  const build = (mask) => {
    const net0 = buildProp({
      name: f.netname,
      bridge: f.bridge,
      ip: f.ipmode === 'dhcp' ? 'dhcp' : f.ipmode === 'static' ? f.ip : undefined,
      gw: f.ipmode === 'static' ? f.gw : undefined,
      ip6: f.ip6mode === 'static' ? f.ip6 : f.ip6mode === 'none' ? undefined : f.ip6mode,
      gw6: f.ip6mode === 'static' ? f.gw6 : undefined,
      tag: f.tag,
      firewall: f.firewall ? 1 : 0,
    }, ['name', 'bridge', 'ip', 'gw']);
    return {
      vmid,
      hostname: f.hostname || undefined,
      ostemplate: f.template,
      unprivileged: f.unprivileged ? 1 : 0,
      features: f.nesting ? 'nesting=1' : undefined,
      password: f.password ? (mask ? '••••••' : f.password) : undefined,
      'ssh-public-keys': f.sshkeys.trim() || undefined,
      pool: f.pool || undefined,
      tags: f.tags || undefined,
      rootfs: `${f.rootStorage}:${f.size}`,
      cores: f.cores,
      memory: f.memory,
      swap: f.swap,
      net0,
      searchdomain: f.searchdomain || undefined,
      nameserver: f.nameserver || undefined,
      onboot: f.onboot ? 1 : 0,
      start: f.start ? 1 : 0,
    };
  };

  const finish = async () => {
    const res = await api.post(P`/nodes/${f.node}/lxc`, build(false));
    app.trackTask(res, `Create CT ${vmid}`);
    setTimeout(() => app.select({ type: 'lxc', node: f.node, vmid: Number(vmid) }), 2500);
  };

  const steps = [
    {
      id: 'general',
      label: 'General',
      valid: !!f.node && !!vmid && !exists && !!pwOk,
      render: () => (
        <>
          <div className="form-row three">
            <Field label="Node"><Select value={f.node} onChange={set('node')} options={nodes.map((n) => n.node)} /></Field>
            <Field label="CT ID" hint={exists ? <span className="red">ID already in use</span> : null}><NumberInput value={vmid} onChange={setVmid} /></Field>
            <Field label="Hostname"><Input value={f.hostname} onChange={set('hostname')} placeholder="my-container" autoFocus /></Field>
          </div>
          <div className="form-row">
            <Field label="Root password" hint="At least 5 characters"><Input type="password" value={f.password} onChange={set('password')} /></Field>
            <Field label="Confirm password" hint={f.password2 && f.password !== f.password2 ? <span className="red">Passwords do not match</span> : null}><Input type="password" value={f.password2} onChange={set('password2')} /></Field>
          </div>
          <Field label="SSH public key(s)"><Textarea value={f.sshkeys} onChange={set('sshkeys')} style={{ minHeight: 60 }} placeholder="ssh-ed25519 AAAA…" /></Field>
          <div className="form-row">
            <Field label="Resource pool"><Select value={f.pool} onChange={set('pool')} options={[['', 'None'], ...pools.map((p) => p.pool)]} /></Field>
            <Field label="Tags"><Input value={f.tags} onChange={set('tags')} /></Field>
          </div>
          <div className="row" style={{ gap: 20 }}>
            <Checkbox label="Unprivileged container" checked={f.unprivileged} onChange={set('unprivileged')} />
            <Checkbox label="Nesting" checked={f.nesting} onChange={set('nesting')} />
          </div>
        </>
      ),
    },
    {
      id: 'template',
      label: 'Template',
      valid: !!f.template,
      render: () => (
        <>
          <div className="form-row">
            <Field label="Storage"><Select value={f.tmplStorage} onChange={(v) => setF((s) => ({ ...s, tmplStorage: v, template: '' }))} options={tmplStorages.map((s) => s.storage)} /></Field>
            <Field label="Template"><Select value={f.template} onChange={set('template')} placeholder="Select…" options={sortBy(templates || [], (t) => t.volid).map((t) => [t.volid, `${t.volid.split('/').pop()} (${fmtBytes(t.size)})`])} /></Field>
          </div>
          {templates && !templates.length && <div className="info-box">No templates downloaded yet. Open a storage → CT Templates → Templates to download one (e.g. Debian or Ubuntu).</div>}
        </>
      ),
    },
    {
      id: 'disks',
      label: 'Disks',
      valid: !!f.rootStorage,
      render: () => (
        <div className="form-row">
          <Field label="Storage"><Select value={f.rootStorage} onChange={set('rootStorage')} options={storageOptions(rootStorages)} /></Field>
          <Field label="Disk size (GiB)"><NumberInput value={f.size} onChange={set('size')} min={1} /></Field>
        </div>
      ),
    },
    {
      id: 'resources',
      label: 'CPU & Memory',
      render: () => (
        <div className="form-row three">
          <Field label="Cores"><NumberInput value={f.cores} onChange={set('cores')} min={1} /></Field>
          <Field label="Memory (MiB)"><NumberInput value={f.memory} onChange={set('memory')} step={256} /></Field>
          <Field label="Swap (MiB)"><NumberInput value={f.swap} onChange={set('swap')} step={256} /></Field>
        </div>
      ),
    },
    {
      id: 'network',
      label: 'Network',
      render: () => (
        <>
          <div className="form-row three">
            <Field label="Name"><Input value={f.netname} onChange={set('netname')} /></Field>
            <Field label="Bridge"><Select value={f.bridge} onChange={set('bridge')} options={[...new Set([...(bridges || []).map((b) => b.iface), f.bridge])].sort()} /></Field>
            <Field label="VLAN tag"><Input value={f.tag} onChange={set('tag')} /></Field>
          </div>
          <div className="form-row three">
            <Field label="IPv4"><Select value={f.ipmode} onChange={set('ipmode')} options={[['dhcp', 'DHCP'], ['static', 'Static'], ['none', 'None']]} /></Field>
            <Field label="IPv4/CIDR"><Input value={f.ip} onChange={set('ip')} disabled={f.ipmode !== 'static'} placeholder="192.168.1.60/24" /></Field>
            <Field label="Gateway"><Input value={f.gw} onChange={set('gw')} disabled={f.ipmode !== 'static'} /></Field>
          </div>
          <div className="form-row three">
            <Field label="IPv6"><Select value={f.ip6mode} onChange={set('ip6mode')} options={[['none', 'None'], ['dhcp', 'DHCP'], ['auto', 'SLAAC'], ['static', 'Static']]} /></Field>
            <Field label="IPv6/CIDR"><Input value={f.ip6} onChange={set('ip6')} disabled={f.ip6mode !== 'static'} /></Field>
            <Field label="Gateway (IPv6)"><Input value={f.gw6} onChange={set('gw6')} disabled={f.ip6mode !== 'static'} /></Field>
          </div>
          <Checkbox label="Firewall" checked={f.firewall} onChange={set('firewall')} />
        </>
      ),
    },
    {
      id: 'dns',
      label: 'DNS',
      render: () => (
        <div className="form-row">
          <Field label="DNS domain" hint="Empty = use host settings"><Input value={f.searchdomain} onChange={set('searchdomain')} /></Field>
          <Field label="DNS servers" hint="Empty = use host settings"><Input value={f.nameserver} onChange={set('nameserver')} /></Field>
        </div>
      ),
    },
    {
      id: 'confirm',
      label: 'Confirm',
      render: () => (
        <>
          <KV items={Object.entries(build(true)).filter(([, v]) => v !== undefined).map(([k, v]) => [k, <code key={k} style={{ wordBreak: 'break-all' }}>{String(v)}</code>])} />
          <div className="row" style={{ gap: 20 }}>
            <Checkbox label="Start at boot" checked={f.onboot} onChange={set('onboot')} />
            <Checkbox label="Start after created" checked={f.start} onChange={set('start')} />
          </div>
        </>
      ),
    },
  ];

  return <Wizard title="Create LXC container" icon={Box} steps={steps} onClose={onClose} onFinish={finish} finishLabel="Create CT" />;
}
