import React, { useEffect, useRef, useState } from 'react';
import {
  Server, LayoutDashboard, StickyNote, TerminalSquare, Cog, Network, Globe, FileText, Clock, ScrollText, ShieldCheck, PackageOpen,
  Flame, HardDrive, ListChecks, BadgeCheck, Power, RotateCcw, Play, Square, Plus, Trash2, Pencil, RefreshCw, Check, Undo2, Cpu,
  MemoryStick, Activity, Layers, Database, Monitor, Box, ExternalLink, Search, Eraser, Save, ArrowUpCircle,
} from 'lucide-react';
import { useApp } from '../context';
import { api, P, useApi } from '../lib/api';
import { ObjectView } from '../components/ObjectView';
import { Button, Card, Table, StatusPill, Meter, SectionTitle, Modal, Field, Input, Select, Checkbox, ErrorBox, Textarea, KV, Loading, MenuButton, MenuItem, Seg, NumberInput } from '../components/ui';
import { RrdCharts } from '../components/charts';
import { TermConsole } from '../components/Console';
import { FirewallPanel, TaskHistory, NotesCard } from './common';
import { fmtBytes, fmtPct, fmtDuration, ratio, sortBy, fmtDate } from '../lib/utils';

export function NodeView({ node }) {
  const app = useApp();
  const r = app.resources.find((x) => x.type === 'node' && x.node === node) || { node, status: 'unknown' };
  const online = r.status === 'online';
  const power = async (command) => {
    const ok = await app.confirm({
      title: `${command === 'reboot' ? 'Reboot' : 'Shut down'} node ${node}?`,
      message: 'All running guests on this node will be stopped (or migrated if HA is configured).',
      danger: true,
      confirmLabel: command === 'reboot' ? 'Reboot' : 'Shut down',
      typeToConfirm: node,
    });
    if (ok) await app.run(() => api.post(P`/nodes/${node}/status`, { command }), { success: `Node ${command} requested` });
  };
  const bulk = async (what) => {
    const ok = await app.confirm({ title: `Bulk ${what}`, message: `${what === 'startall' ? 'Start' : what === 'stopall' ? 'Stop' : 'Suspend'} all guests on ${node}?`, confirmLabel: 'Continue', danger: what !== 'startall' });
    if (ok) await app.run(() => api.post(P`/nodes/${node}/${what}`, what === 'startall' ? { force: 1 } : {}), { label: `Bulk ${what} on ${node}` });
  };
  return (
    <ObjectView
      icon={Server}
      title={`Node ${node}`}
      badge={<StatusPill status={r.status} />}
      sub={online ? <>Uptime {fmtDuration(r.uptime)} · CPU {fmtPct(r.cpu)} · RAM {fmtBytes(r.mem)} / {fmtBytes(r.maxmem)}</> : 'Node is offline'}
      storageKey="node"
      actions={
        <>
          <Button icon={TerminalSquare} onClick={() => window.pve.openConsoleWindow({ type: 'node', node })} disabled={!online}>Shell</Button>
          <MenuButton label="Bulk actions">
            <MenuItem icon={Play} onClick={() => bulk('startall')}>Bulk start</MenuItem>
            <MenuItem icon={Square} onClick={() => bulk('stopall')}>Bulk shutdown</MenuItem>
            <MenuItem icon={Layers} onClick={() => bulk('suspendall')}>Bulk suspend</MenuItem>
          </MenuButton>
          <Button icon={RotateCcw} onClick={() => power('reboot')} disabled={!online}>Reboot</Button>
          <Button icon={Power} variant="danger" onClick={() => power('shutdown')} disabled={!online}>Shutdown</Button>
        </>
      }
      nav={[
        {
          items: [
            { id: 'summary', label: 'Summary', icon: LayoutDashboard, render: () => <NodeSummary node={node} /> },
            { id: 'notes', label: 'Notes', icon: StickyNote, render: () => <NodeNotes node={node} /> },
            { id: 'shell', label: 'Shell', icon: TerminalSquare, flush: true, render: () => <TermConsole target={{ type: 'node', node }} /> },
          ],
        },
        {
          group: 'System',
          items: [
            { id: 'services', label: 'Services', icon: Cog, render: () => <NodeServices node={node} /> },
            { id: 'network', label: 'Network', icon: Network, render: () => <NodeNetwork node={node} /> },
            { id: 'dns', label: 'DNS', icon: Globe, render: () => <NodeDns node={node} /> },
            { id: 'hosts', label: 'Hosts', icon: FileText, render: () => <NodeHosts node={node} /> },
            { id: 'time', label: 'Time', icon: Clock, render: () => <NodeTime node={node} /> },
            { id: 'syslog', label: 'System log', icon: ScrollText, render: () => <NodeSyslog node={node} /> },
            { id: 'certs', label: 'Certificates', icon: ShieldCheck, render: () => <NodeCerts node={node} /> },
          ],
        },
        {
          group: 'Maintenance',
          items: [
            { id: 'updates', label: 'Updates', icon: PackageOpen, render: () => <NodeUpdates node={node} /> },
            { id: 'repos', label: 'Repositories', icon: Database, render: () => <NodeRepos node={node} /> },
            { id: 'disks', label: 'Disks', icon: HardDrive, render: () => <NodeDisks node={node} /> },
            { id: 'firewall', label: 'Firewall', icon: Flame, render: () => <FirewallPanel base={P`/nodes/${node}/firewall`} level="node" /> },
            { id: 'tasks', label: 'Task history', icon: ListChecks, render: () => <TaskHistory node={node} /> },
            { id: 'subscription', label: 'Subscription', icon: BadgeCheck, render: () => <NodeSubscription node={node} /> },
          ],
        },
      ]}
    />
  );
}

function NodeSummary({ node }) {
  const app = useApp();
  const { data: s, loading } = useApi(P`/nodes/${node}/status`, null, { interval: 1000 });
  const guests = sortBy(app.resources.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && r.node === node), (g) => g.vmid);
  const { pushLive } = app;
  useEffect(() => {
    if (s) pushLive(`node/${node}`, { cpu: s.cpu, mem: s.memory?.used, maxmem: s.memory?.total, disk: s.rootfs?.used, uptime: s.uptime });
  }, [s, node, pushLive]);
  if (loading && !s) return <Loading />;
  const st = s || {};
  const cpuinfo = st.cpuinfo || {};
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid cols-4">
        <Card>
          <div className="stat">
            <div className="k"><Cpu size={14} /> CPU usage</div>
            <div className="v">{fmtPct(st.cpu)}<small>of {cpuinfo.cpus} CPUs</small></div>
            <Meter value={st.cpu} />
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><MemoryStick size={14} /> Memory</div>
            <div className="v">{fmtBytes(st.memory?.used)}<small>/ {fmtBytes(st.memory?.total)}</small></div>
            <Meter value={ratio(st.memory?.used, st.memory?.total)} />
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><HardDrive size={14} /> Root disk</div>
            <div className="v">{fmtBytes(st.rootfs?.used)}<small>/ {fmtBytes(st.rootfs?.total)}</small></div>
            <Meter value={ratio(st.rootfs?.used, st.rootfs?.total)} />
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><Activity size={14} /> Load average</div>
            <div className="v">{(st.loadavg || []).map((x) => Number(x).toFixed(2)).join('  ') || '—'}</div>
            <div className="muted small">IO delay {fmtPct(st.wait)} · Swap {fmtBytes(st.swap?.used)} / {fmtBytes(st.swap?.total)}</div>
          </div>
        </Card>
      </div>
      <div className="grid cols-2">
        <Card title="System" icon={Server}>
          <KV
            items={[
              ['CPU model', `${cpuinfo.model || '—'}`],
              ['Topology', `${cpuinfo.cpus} CPUs (${cpuinfo.sockets} socket${cpuinfo.sockets > 1 ? 's' : ''}, ${cpuinfo.cores} cores)`],
              ['Kernel', st['current-kernel'] ? `${st['current-kernel'].sysname} ${st['current-kernel'].release}` : st.kversion],
              ['Boot mode', st['boot-info'] ? `${st['boot-info'].mode}${st['boot-info'].secureboot ? ' (Secure Boot)' : ''}` : '—'],
              ['PVE manager', st.pveversion],
              ['Uptime', fmtDuration(st.uptime)],
              ['KSM sharing', fmtBytes(st.ksm?.shared)],
            ]}
          />
        </Card>
        <Card title={`Guests on ${node}`} icon={Monitor} pad0>
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            <Table
              rows={guests}
              rowKey={(g) => g.vmid}
              onRowClick={(g) => app.select({ type: g.type, node, vmid: g.vmid })}
              empty="No guests"
              columns={[
                { key: 'vmid', label: 'ID', width: 60 },
                { key: 'name', label: 'Name', render: (g) => <span className="row">{g.type === 'qemu' ? <Monitor size={13} /> : <Box size={13} />}{g.name}</span> },
                { key: 'status', label: 'Status', render: (g) => (g.template ? <span className="tag">template</span> : <StatusPill status={g.status} />) },
                { key: 'cpu', label: 'CPU', render: (g) => (g.status === 'running' ? fmtPct(g.cpu) : '') },
                { key: 'mem', label: 'Memory', render: (g) => (g.status === 'running' ? fmtBytes(g.mem) : '') },
              ]}
            />
          </div>
        </Card>
      </div>
      <RrdCharts path={P`/nodes/${node}/rrddata`} kind="node" />
    </div>
  );
}

function NodeNotes({ node }) {
  const app = useApp();
  const { data, reload, loading } = useApi(P`/nodes/${node}/config`);
  if (loading && !data) return <Loading />;
  return (
    <NotesCard
      value={data?.description}
      onSave={async (v) => {
        await app.run(() => api.put(P`/nodes/${node}/config`, v ? { description: v } : { delete: 'description' }), { success: 'Notes saved' });
        reload();
      }}
    />
  );
}

function NodeServices({ node }) {
  const app = useApp();
  const { data, loading, reload } = useApi(P`/nodes/${node}/services`, null, { interval: 5000 });
  const act = (s, a) => app.run(() => api.post(P`/nodes/${node}/services/${s.service}/${a}`), { label: `${a} ${s.service}` });
  return (
    <div>
      <SectionTitle title="System services" />
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.service}
        columns={[
          { key: 'name', label: 'Name', render: (r) => <b>{r.name}</b> },
          { key: 'state', label: 'State', render: (r) => <StatusPill status={r.state === 'running' ? 'running' : r.state === 'dead' ? 'stopped' : r.state}>{r.state}</StatusPill> },
          { key: 'active-state', label: 'Active' },
          { key: 'unit-state', label: 'Unit state' },
          { key: 'desc', label: 'Description', render: (r) => <span className="muted">{r.desc}</span> },
          {
            key: 'a', label: '', sort: false, className: 'actions',
            render: (r) => (
              <>
                <Button size="sm" variant="ghost" icon={Play} disabled={r.state === 'running'} onClick={() => act(r, 'start')}>Start</Button>
                <Button size="sm" variant="ghost" icon={Square} disabled={r.state !== 'running'} onClick={() => act(r, 'stop')}>Stop</Button>
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => act(r, 'restart')}>Restart</Button>
              </>
            ),
          },
        ]}
      />
      <div className="row mt"><Button size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button></div>
    </div>
  );
}

// ---------------- Network ----------------
function NodeNetwork({ node }) {
  const app = useApp();
  const { data, loading, reload } = useApi(P`/nodes/${node}/network`);
  const pending = false;
  const edit = (iface, type) => app.openModal((close) => <IfaceDialog node={node} iface={iface} type={type} onClose={() => { close(); reload(); }} />);
  const del = async (i) => {
    if (!(await app.confirm({ title: `Remove ${i.iface}`, message: 'The change is staged until you click Apply configuration.', danger: true, confirmLabel: 'Remove' }))) return;
    await app.run(() => api.del(P`/nodes/${node}/network/${i.iface}`), { success: `${i.iface} removed (pending)` });
    reload();
  };
  const apply = async () => {
    if (!(await app.confirm({ title: 'Apply network configuration', message: 'Apply pending network changes now? A misconfiguration may make the node unreachable.', confirmLabel: 'Apply' }))) return;
    await app.run(() => api.put(P`/nodes/${node}/network`), { label: 'Apply network config' });
    reload();
  };
  const revert = async () => {
    await app.run(() => api.del(P`/nodes/${node}/network`), { success: 'Pending changes reverted' });
    reload();
  };
  return (
    <div>
      <SectionTitle title="Network interfaces">
        <MenuButton label="Create" icon={Plus} variant="primary" size="sm">
          <MenuItem onClick={() => edit(null, 'bridge')}>Linux Bridge</MenuItem>
          <MenuItem onClick={() => edit(null, 'bond')}>Linux Bond</MenuItem>
          <MenuItem onClick={() => edit(null, 'vlan')}>Linux VLAN</MenuItem>
          <MenuItem onClick={() => edit(null, 'OVSBridge')}>OVS Bridge</MenuItem>
        </MenuButton>
        <Button size="sm" icon={Undo2} onClick={revert}>Revert</Button>
        <Button size="sm" icon={Check} variant={pending ? 'primary' : undefined} onClick={apply}>Apply configuration</Button>
      </SectionTitle>
      <Table
        loading={loading}
        rows={sortBy(data, (i) => i.iface)}
        rowKey={(r) => r.iface}
        onRowDoubleClick={(r) => edit(r, r.type)}
        columns={[
          { key: 'iface', label: 'Name', render: (r) => <b>{r.iface}</b> },
          { key: 'type', label: 'Type', render: (r) => <span className="tag">{r.type}</span> },
          { key: 'active', label: 'Active', render: (r) => (r.active ? <span className="green">Yes</span> : <span className="faint">No</span>) },
          { key: 'autostart', label: 'Autostart', render: (r) => (r.autostart ? 'Yes' : 'No') },
          { key: 'bridge_vlan_aware', label: 'VLAN aware', render: (r) => (r.bridge_vlan_aware ? 'Yes' : '') },
          { key: 'ports', label: 'Ports/Slaves', render: (r) => r.bridge_ports || r.slaves || r['vlan-raw-device'] || '' },
          { key: 'cidr', label: 'CIDR', render: (r) => r.cidr || (r.address ? `${r.address}/${r.netmask}` : '') },
          { key: 'gateway', label: 'Gateway' },
          { key: 'cidr6', label: 'IPv6' },
          { key: 'comments', label: 'Comment' },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <><Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r, r.type)} />{r.type !== 'eth' && <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} />}</> },
        ]}
      />
      <div className="info-box mt">Changes are written to <code>/etc/network/interfaces.new</code> and only take effect after <b>Apply configuration</b>.</div>
    </div>
  );
}

function IfaceDialog({ node, iface, type, onClose }) {
  const app = useApp();
  const [f, setF] = useState(() => ({
    iface: iface?.iface || (type === 'bridge' || type === 'OVSBridge' ? 'vmbr' : type === 'bond' ? 'bond' : ''),
    cidr: iface?.cidr || '',
    gateway: iface?.gateway || '',
    cidr6: iface?.cidr6 || '',
    gateway6: iface?.gateway6 || '',
    autostart: iface ? !!iface.autostart : true,
    bridge_ports: iface?.bridge_ports || '',
    bridge_vlan_aware: !!iface?.bridge_vlan_aware,
    slaves: iface?.slaves || '',
    bond_mode: iface?.bond_mode || 'balance-rr',
    'vlan-raw-device': iface?.['vlan-raw-device'] || '',
    mtu: iface?.mtu || '',
    comments: iface?.comments || '',
  }));
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    const params = { type, autostart: f.autostart ? 1 : 0 };
    const del = [];
    const opt = (k, cond = true) => {
      if (!cond) return;
      if (f[k] !== '' && f[k] !== false) params[k] = f[k] === true ? 1 : f[k];
      else if (iface) del.push(k);
    };
    ['cidr', 'gateway', 'cidr6', 'gateway6', 'mtu', 'comments'].forEach((k) => opt(k));
    opt('bridge_ports', type === 'bridge');
    opt('bridge_vlan_aware', type === 'bridge');
    opt('ovs_ports', false);
    if (type === 'bond') {
      params.slaves = f.slaves;
      params.bond_mode = f.bond_mode;
    }
    if (type === 'vlan' && f['vlan-raw-device']) params['vlan-raw-device'] = f['vlan-raw-device'];
    if (type === 'OVSBridge' && f.bridge_ports) params.ovs_ports = f.bridge_ports;
    if (del.length) params.delete = del.join(',');
    try {
      if (iface) await api.put(P`/nodes/${node}/network/${iface.iface}`, params);
      else await api.post(P`/nodes/${node}/network`, { ...params, iface: f.iface });
      app.toast({ kind: 'success', title: 'Interface saved (pending apply)' });
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  const isEth = type === 'eth';
  return (
    <Modal title={iface ? `Edit ${iface.iface}` : `Create ${type}`} icon={Network} onClose={onClose} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{iface ? 'Save' : 'Create'}</Button></>}>
      <div className="form">
        <div className="form-row">
          <Field label="Name"><Input value={f.iface} onChange={set('iface')} disabled={!!iface} /></Field>
          <Field label="MTU"><Input value={f.mtu} onChange={set('mtu')} placeholder="1500" /></Field>
        </div>
        <div className="form-row">
          <Field label="IPv4/CIDR"><Input value={f.cidr} onChange={set('cidr')} placeholder="192.168.1.10/24" /></Field>
          <Field label="Gateway (IPv4)"><Input value={f.gateway} onChange={set('gateway')} /></Field>
        </div>
        <div className="form-row">
          <Field label="IPv6/CIDR"><Input value={f.cidr6} onChange={set('cidr6')} /></Field>
          <Field label="Gateway (IPv6)"><Input value={f.gateway6} onChange={set('gateway6')} /></Field>
        </div>
        {(type === 'bridge' || type === 'OVSBridge') && (
          <Field label="Bridge ports" hint="Space separated, e.g. enp3s0"><Input value={f.bridge_ports} onChange={set('bridge_ports')} /></Field>
        )}
        {type === 'bridge' && <Checkbox label="VLAN aware" checked={f.bridge_vlan_aware} onChange={set('bridge_vlan_aware')} />}
        {type === 'bond' && (
          <div className="form-row">
            <Field label="Slaves"><Input value={f.slaves} onChange={set('slaves')} placeholder="enp3s0 enp4s0" /></Field>
            <Field label="Mode"><Select value={f.bond_mode} onChange={set('bond_mode')} options={['balance-rr', 'active-backup', 'balance-xor', 'broadcast', '802.3ad', 'balance-tlb', 'balance-alb']} /></Field>
          </div>
        )}
        {type === 'vlan' && <Field label="VLAN raw device" hint="Name the VLAN like eno1.50 or vlan50"><Input value={f['vlan-raw-device']} onChange={set('vlan-raw-device')} /></Field>}
        <Field label="Comment"><Input value={f.comments} onChange={set('comments')} /></Field>
        {!isEth || true ? <Checkbox label="Autostart" checked={f.autostart} onChange={set('autostart')} /> : null}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function NodeDns({ node }) {
  const app = useApp();
  const { data, loading, reload } = useApi(P`/nodes/${node}/dns`);
  const [f, setF] = useState(null);
  useEffect(() => data && setF({ search: data.search || '', dns1: data.dns1 || '', dns2: data.dns2 || '', dns3: data.dns3 || '' }), [data]);
  if (loading || !f) return <Loading />;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    await app.run(() => api.put(P`/nodes/${node}/dns`, Object.fromEntries(Object.entries(f).filter(([, v]) => v))), { success: 'DNS saved' });
    reload();
  };
  return (
    <Card title="DNS" icon={Globe} style={{ maxWidth: 560 }}>
      <div className="form">
        <Field label="Search domain"><Input value={f.search} onChange={set('search')} /></Field>
        <Field label="DNS server 1"><Input value={f.dns1} onChange={set('dns1')} /></Field>
        <Field label="DNS server 2"><Input value={f.dns2} onChange={set('dns2')} /></Field>
        <Field label="DNS server 3"><Input value={f.dns3} onChange={set('dns3')} /></Field>
        <div><Button variant="primary" icon={Save} onClick={save}>Save</Button></div>
      </div>
    </Card>
  );
}

function NodeHosts({ node }) {
  const app = useApp();
  const { data, loading, reload } = useApi(P`/nodes/${node}/hosts`);
  const [v, setV] = useState(null);
  useEffect(() => data && setV(data.data), [data]);
  if (loading || v === null) return <Loading />;
  return (
    <div>
      <SectionTitle title="/etc/hosts">
        <Button size="sm" variant="primary" icon={Save} onClick={async () => { await app.run(() => api.post(P`/nodes/${node}/hosts`, { data: v, digest: data.digest }), { success: 'Hosts file saved' }); reload(); }}>Save</Button>
      </SectionTitle>
      <Textarea value={v} onChange={setV} style={{ minHeight: 420 }} />
    </div>
  );
}

function NodeTime({ node }) {
  const app = useApp();
  const { data, reload } = useApi(P`/nodes/${node}/time`, null, { interval: 1000 });
  const change = async () => {
    const tz = await app.prompt({ title: 'Set time zone', label: 'Time zone (e.g. America/New_York)', value: data?.timezone });
    if (!tz) return;
    await app.run(() => api.put(P`/nodes/${node}/time`, { timezone: tz }), { success: 'Time zone updated' });
    reload();
  };
  return (
    <Card title="Time" icon={Clock} style={{ maxWidth: 560 }} right={<Button size="sm" icon={Pencil} onClick={change}>Edit time zone</Button>}>
      <KV items={[['Time zone', data?.timezone], ['Server time (local)', data?.localtime ? new Date(data.localtime * 1000).toISOString().replace('T', ' ').slice(0, 19) : '—'], ['UTC', data?.time ? fmtDate(data.time) : '—']]} />
    </Card>
  );
}

function NodeSyslog({ node }) {
  const [lines, setLines] = useState([]);
  const [live, setLive] = useState(true);
  const [filter, setFilter] = useState('');
  const ref = useRef();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const l = await api.get(P`/nodes/${node}/journal`, { lastentries: 500 });
        if (alive) setLines(l || []);
      } catch {
        try {
          const l = await api.get(P`/nodes/${node}/syslog`, { limit: 500, start: 0 });
          if (alive) setLines((l || []).map((x) => x.t));
        } catch {}
      }
    };
    load();
    const i = live ? setInterval(load, 3000) : null;
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [node, live]);
  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, live]);
  const shown = filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines;
  return (
    <div className="col" style={{ height: '100%' }}>
      <SectionTitle title="System log">
        <div className="search" style={{ width: 240 }}><Search size={14} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" /></div>
        <Checkbox label="Live" checked={live} onChange={setLive} />
      </SectionTitle>
      <div className="log" ref={ref} style={{ flex: 1, minHeight: 400, maxHeight: 'calc(100vh - 290px)' }}>
        {shown.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

function NodeCerts({ node }) {
  const { data, loading } = useApi(P`/nodes/${node}/certificates/info`);
  return (
    <div>
      <SectionTitle title="Certificates" />
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.filename}
        columns={[
          { key: 'filename', label: 'File' },
          { key: 'issuer', label: 'Issuer', render: (r) => <span className="small">{r.issuer}</span> },
          { key: 'subject', label: 'Subject', render: (r) => <span className="small">{r.subject}</span> },
          { key: 'san', label: 'SAN', render: (r) => <span className="small">{(r.san || []).join(', ')}</span> },
          { key: 'notafter', label: 'Expires', render: (r) => <span className={r.notafter * 1000 < Date.now() ? 'red' : ''}>{fmtDate(r.notafter)}</span> },
          { key: 'fingerprint', label: 'Fingerprint', render: (r) => <code className="small" style={{ wordBreak: 'break-all' }}>{r.fingerprint}</code> },
        ]}
      />
    </div>
  );
}

function NodeUpdates({ node }) {
  const app = useApp();
  const { data, loading, reload } = useApi(P`/nodes/${node}/apt/update`);
  const refresh = async () => {
    await app.run(() => api.post(P`/nodes/${node}/apt/update`), { label: 'Refresh package database' });
    setTimeout(reload, 4000);
  };
  const upgrade = () => window.pve.openConsoleWindow({ type: 'node', node, cmd: 'upgrade' });
  const changelog = async (p) => {
    try {
      const text = await api.get(P`/nodes/${node}/apt/changelog`, { name: p.Package, version: p.Version });
      app.openModal((close) => (
        <Modal title={`Changelog: ${p.Package}`} onClose={close} width={820}>
          <div className="log" style={{ maxHeight: 500 }}>{text}</div>
        </Modal>
      ));
    } catch (e) {
      app.toast({ kind: 'error', title: 'No changelog', message: e.message });
    }
  };
  return (
    <div>
      <SectionTitle title="Updates" desc={data ? `${data.length} package${data.length === 1 ? '' : 's'} can be upgraded` : ''}>
        <Button size="sm" icon={RefreshCw} onClick={refresh}>Refresh</Button>
        <Button size="sm" variant="primary" icon={ArrowUpCircle} onClick={upgrade} disabled={!data?.length}>Upgrade (opens shell)</Button>
      </SectionTitle>
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.Package}
        onRowDoubleClick={changelog}
        empty="Your system is up to date"
        columns={[
          { key: 'Package', label: 'Package', render: (r) => <b>{r.Package}</b> },
          { key: 'OldVersion', label: 'Current' },
          { key: 'Version', label: 'New', render: (r) => <span className="green">{r.Version}</span> },
          { key: 'Origin', label: 'Origin' },
          { key: 'Priority', label: 'Priority' },
          { key: 'Description', label: 'Description', render: (r) => <span className="muted ellipsis" style={{ display: 'inline-block' }}>{r.Title || r.Description}</span> },
        ]}
      />
    </div>
  );
}

function NodeRepos({ node }) {
  const app = useApp();
  const { data, loading, reload } = useApi(P`/nodes/${node}/apt/repositories`);
  const rows = (data?.files || []).flatMap((file) =>
    (file.repositories || []).map((r, index) => ({ ...r, path: file.path, index, key: file.path + index }))
  );
  const toggle = async (r) => {
    await app.run(() => api.post(P`/nodes/${node}/apt/repositories`, { path: r.path, index: r.index, enabled: r.Enabled ? 0 : 1, digest: data.digest }), { success: 'Repository updated' });
    reload();
  };
  const addStd = async (handle) => {
    await app.run(() => api.put(P`/nodes/${node}/apt/repositories`, { handle, digest: data.digest }), { success: 'Repository added' });
    reload();
  };
  return (
    <div>
      <SectionTitle title="APT repositories">
        <MenuButton label="Add" icon={Plus} size="sm" variant="primary">
          {(data?.['standard-repos'] || []).map((s) => (
            <MenuItem key={s.handle} onClick={() => addStd(s.handle)} disabled={s.status === 1}>{s.name}</MenuItem>
          ))}
        </MenuButton>
      </SectionTitle>
      {(data?.infos || []).filter((i) => i.kind === 'warning').map((i, k) => <div key={k} className="warn-box mb">{i.message}</div>)}
      <Table
        loading={loading}
        rows={rows}
        rowKey={(r) => r.key}
        columns={[
          { key: 'Enabled', label: 'Enabled', render: (r) => <Checkbox checked={!!r.Enabled} onChange={() => toggle(r)} /> },
          { key: 'Types', label: 'Types', render: (r) => (r.Types || []).join(' ') },
          { key: 'URIs', label: 'URIs', render: (r) => <code className="small">{(r.URIs || []).join(' ')}</code> },
          { key: 'Suites', label: 'Suites', render: (r) => (r.Suites || []).join(' ') },
          { key: 'Components', label: 'Components', render: (r) => (r.Components || []).join(' ') },
          { key: 'path', label: 'File', render: (r) => <span className="muted small">{r.path}</span> },
        ]}
      />
    </div>
  );
}

function NodeDisks({ node }) {
  const app = useApp();
  const [tab, setTab] = useState('disks');
  const disks = useApi(P`/nodes/${node}/disks/list`, { 'include-partitions': 0 });
  const lvm = useApi(P`/nodes/${node}/disks/lvm`, null, { enabled: tab === 'lvm' });
  const thin = useApi(P`/nodes/${node}/disks/lvmthin`, null, { enabled: tab === 'lvmthin' });
  const dirs = useApi(P`/nodes/${node}/disks/directory`, null, { enabled: tab === 'dir' });
  const zfs = useApi(P`/nodes/${node}/disks/zfs`, null, { enabled: tab === 'zfs' });
  const smart = async (d) => {
    try {
      const s = await api.get(P`/nodes/${node}/disks/smart`, { disk: d.devpath });
      app.openModal((close) => (
        <Modal title={`S.M.A.R.T. — ${d.devpath}`} icon={HardDrive} onClose={close} width={820}>
          <div className="row mb">Health: <StatusPill status={s.health === 'PASSED' || s.health === 'OK' ? 'ok' : 'error'}>{s.health}</StatusPill></div>
          {s.attributes ? (
            <Table rows={s.attributes} rowKey={(r) => r.id + r.name} maxHeight={420} columns={[{ key: 'id', label: 'ID' }, { key: 'name', label: 'Attribute' }, { key: 'value', label: 'Value' }, { key: 'worst', label: 'Worst' }, { key: 'threshold', label: 'Threshold' }, { key: 'raw', label: 'Raw' }, { key: 'fail', label: 'Fail' }]} />
          ) : (
            <div className="log" style={{ maxHeight: 420 }}>{s.text}</div>
          )}
        </Modal>
      ));
    } catch (e) {
      app.toast({ kind: 'error', title: 'SMART failed', message: e.message });
    }
  };
  const initGpt = async (d) => {
    if (!(await app.confirm({ title: `Initialize ${d.devpath} with GPT`, message: 'This writes a new partition table.', danger: true, confirmLabel: 'Initialize' }))) return;
    await app.run(() => api.post(P`/nodes/${node}/disks/initgpt`, { disk: d.devpath }), { label: `Init GPT ${d.devpath}` });
    disks.reload();
  };
  const wipe = async (d) => {
    if (!(await app.confirm({ title: `Wipe ${d.devpath}`, message: 'ALL data on this disk will be destroyed.', danger: true, confirmLabel: 'Wipe disk', typeToConfirm: d.devpath }))) return;
    await app.run(() => api.put(P`/nodes/${node}/disks/wipedisk`, { disk: d.devpath }), { label: `Wipe ${d.devpath}` });
    disks.reload();
  };
  const create = (kind) => app.openModal((close) => <CreateStorageOnDisk node={node} kind={kind} disks={(disks.data || []).filter((d) => d.used === undefined || d.used === 'unused' || !d.used)} onClose={close} />);
  return (
    <div>
      <SectionTitle title="Disks">
        <Seg value={tab} onChange={setTab} options={[['disks', 'Disks'], ['lvm', 'LVM'], ['lvmthin', 'LVM-Thin'], ['dir', 'Directory'], ['zfs', 'ZFS']]} />
        {tab !== 'disks' && <Button size="sm" variant="primary" icon={Plus} onClick={() => create(tab)}>Create</Button>}
      </SectionTitle>
      {tab === 'disks' && (
        <Table
          loading={disks.loading}
          rows={disks.data}
          rowKey={(r) => r.devpath}
          columns={[
            { key: 'devpath', label: 'Device', render: (r) => <b>{r.devpath}</b> },
            { key: 'type', label: 'Type', render: (r) => <span className="tag">{r.type}</span> },
            { key: 'used', label: 'Usage', render: (r) => r.used || <span className="faint">unused</span> },
            { key: 'size', label: 'Size', render: (r) => fmtBytes(r.size), sort: (r) => r.size },
            { key: 'gpt', label: 'GPT', render: (r) => (r.gpt ? 'Yes' : 'No') },
            { key: 'model', label: 'Model' },
            { key: 'serial', label: 'Serial' },
            { key: 'health', label: 'S.M.A.R.T.', render: (r) => <StatusPill status={r.health === 'PASSED' || r.health === 'OK' ? 'ok' : r.health === 'UNKNOWN' ? 'unknown' : 'error'}>{r.health}</StatusPill> },
            { key: 'wearout', label: 'Wearout', render: (r) => (r.wearout !== undefined && r.wearout !== 'N/A' ? `${100 - Number(r.wearout)}%` : 'N/A') },
            {
              key: 'a', label: '', sort: false, className: 'actions',
              render: (r) => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => smart(r)}>SMART</Button>
                  <Button size="sm" variant="ghost" onClick={() => initGpt(r)} disabled={!!r.used && r.used !== 'unused'}>Init GPT</Button>
                  <Button size="sm" variant="ghost" iconOnly icon={Eraser} title="Wipe disk" onClick={() => wipe(r)} />
                </>
              ),
            },
          ]}
        />
      )}
      {tab === 'lvm' && <Table loading={lvm.loading} rows={lvm.data?.children || []} rowKey={(r) => r.name} columns={[{ key: 'name', label: 'Volume group' }, { key: 'size', label: 'Size', render: (r) => fmtBytes(r.size) }, { key: 'free', label: 'Free', render: (r) => fmtBytes(r.free) }, { key: 'u', label: 'Usage', render: (r) => <Meter value={ratio(r.size - r.free, r.size)} /> }]} />}
      {tab === 'lvmthin' && <Table loading={thin.loading} rows={thin.data} rowKey={(r) => r.lv} columns={[{ key: 'lv', label: 'Thin pool' }, { key: 'vg', label: 'Volume group' }, { key: 'lv_size', label: 'Size', render: (r) => fmtBytes(r.lv_size) }, { key: 'used', label: 'Used', render: (r) => fmtBytes(r.used) }, { key: 'metadata_used', label: 'Metadata', render: (r) => `${fmtBytes(r.metadata_used)} / ${fmtBytes(r.metadata_size)}` }]} />}
      {tab === 'dir' && <Table loading={dirs.loading} rows={dirs.data} rowKey={(r) => r.path} columns={[{ key: 'path', label: 'Path' }, { key: 'device', label: 'Device' }, { key: 'type', label: 'Filesystem' }, { key: 'options', label: 'Options' }, { key: 'unitfile', label: 'Unit file' }]} />}
      {tab === 'zfs' && <Table loading={zfs.loading} rows={zfs.data} rowKey={(r) => r.name} columns={[{ key: 'name', label: 'Pool' }, { key: 'health', label: 'Health', render: (r) => <StatusPill status={r.health === 'ONLINE' ? 'ok' : 'error'}>{r.health}</StatusPill> }, { key: 'size', label: 'Size', render: (r) => fmtBytes(r.size) }, { key: 'alloc', label: 'Allocated', render: (r) => fmtBytes(r.alloc) }, { key: 'free', label: 'Free', render: (r) => fmtBytes(r.free) }, { key: 'frag', label: 'Frag', render: (r) => `${r.frag}%` }, { key: 'dedup', label: 'Dedup' }]} />}
    </div>
  );
}

function CreateStorageOnDisk({ node, kind, disks, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ name: '', device: disks[0]?.devpath || '', devices: [], raidlevel: 'single', compression: 'on', ashift: 12, filesystem: 'ext4', add_storage: true });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    try {
      let res;
      if (kind === 'zfs') res = await api.post(P`/nodes/${node}/disks/zfs`, { name: f.name, devices: f.devices.join(','), raidlevel: f.raidlevel, compression: f.compression, ashift: f.ashift, add_storage: f.add_storage ? 1 : 0 });
      else if (kind === 'dir') res = await api.post(P`/nodes/${node}/disks/directory`, { name: f.name, device: f.device, filesystem: f.filesystem, add_storage: f.add_storage ? 1 : 0 });
      else res = await api.post(P`/nodes/${node}/disks/${kind}`, { name: f.name, device: f.device, add_storage: f.add_storage ? 1 : 0 });
      app.trackTask(res, `Create ${kind} ${f.name}`);
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Modal title={`Create ${kind === 'dir' ? 'Directory' : kind.toUpperCase()}`} icon={HardDrive} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!f.name}>Create</Button></>}>
      <div className="form">
        {!disks.length && <div className="warn-box">No unused disks found. Wipe a disk first.</div>}
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        {kind === 'zfs' ? (
          <>
            <Field label="Disks">
              <div className="col">{disks.map((d) => <Checkbox key={d.devpath} label={`${d.devpath} — ${fmtBytes(d.size)} ${d.model || ''}`} checked={f.devices.includes(d.devpath)} onChange={(v) => set('devices')(v ? [...f.devices, d.devpath] : f.devices.filter((x) => x !== d.devpath))} />)}</div>
            </Field>
            <div className="form-row three">
              <Field label="RAID level"><Select value={f.raidlevel} onChange={set('raidlevel')} options={['single', 'mirror', 'raid10', 'raidz', 'raidz2', 'raidz3']} /></Field>
              <Field label="Compression"><Select value={f.compression} onChange={set('compression')} options={['on', 'off', 'lz4', 'zstd', 'gzip']} /></Field>
              <Field label="ashift"><NumberInput value={f.ashift} onChange={set('ashift')} /></Field>
            </div>
          </>
        ) : (
          <Field label="Disk"><Select value={f.device} onChange={set('device')} options={disks.map((d) => [d.devpath, `${d.devpath} — ${fmtBytes(d.size)} ${d.model || ''}`])} /></Field>
        )}
        {kind === 'dir' && <Field label="Filesystem"><Select value={f.filesystem} onChange={set('filesystem')} options={['ext4', 'xfs']} /></Field>}
        <Checkbox label="Add as storage" checked={f.add_storage} onChange={set('add_storage')} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function NodeSubscription({ node }) {
  const { data, loading } = useApi(P`/nodes/${node}/subscription`);
  if (loading) return <Loading />;
  return (
    <Card title="Subscription" icon={BadgeCheck} style={{ maxWidth: 640 }}>
      <KV items={[['Status', <StatusPill key="s" status={data?.status === 'active' ? 'active' : 'inactive'}>{data?.status}</StatusPill>], ['Product', data?.productname], ['Level', data?.level], ['Key', data?.key], ['Server ID', data?.serverid], ['Sockets', data?.sockets], ['Next due', data?.nextduedate], ['Message', data?.message]]} />
      <div className="row mt">
        <Button size="sm" icon={ExternalLink} onClick={() => window.pve.openExternal('https://www.proxmox.com/en/proxmox-virtual-environment/pricing')}>View plans</Button>
      </div>
    </Card>
  );
}
