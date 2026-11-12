import React, { useMemo, useState } from 'react';
import {
  Building2, LayoutDashboard, Search, Settings2, Database, Archive, Copy, ShieldCheck, Users, UsersRound, KeyRound, FolderTree, BadgeCheck,
  HeartPulse, Flame, ListChecks, Plus, Trash2, Pencil, Play, Server, Monitor, Box, Cpu, MemoryStick, HardDrive, Lock, RefreshCw, Globe,
} from 'lucide-react';
import { useApp } from '../context';
import { api, P, useApi } from '../lib/api';
import { ObjectView } from '../components/ObjectView';
import { Button, Card, Table, StatusPill, Meter, SectionTitle, Modal, Field, Input, Select, Checkbox, ErrorBox, Textarea, KV, Loading, NumberInput, Seg } from '../components/ui';
import { Donut } from '../components/charts';
import { FirewallPanel, TaskHistory, AclTable, AclDialog } from './common';
import { fmtBytes, fmtPct, fmtDuration, ratio, sortBy } from '../lib/utils';

export function DatacenterView() {
  const { data: cstatus } = useApi('/cluster/status', null, { interval: 10000 });
  const cluster = (cstatus || []).find((x) => x.type === 'cluster');
  return (
    <ObjectView
      icon={Building2}
      title="Datacenter"
      badge={cluster ? <span className="tag">{cluster.name}</span> : <span className="tag">standalone</span>}
      sub={cluster ? `${cluster.nodes} nodes · ${cluster.quorate ? 'quorate' : 'NO QUORUM'}` : 'Single node / no cluster configured'}
      storageKey="dc"
      nav={[
        {
          items: [
            { id: 'summary', label: 'Summary', icon: LayoutDashboard, render: () => <DcSummary cstatus={cstatus} /> },
            { id: 'search', label: 'Search', icon: Search, render: () => <DcSearch /> },
            { id: 'options', label: 'Options', icon: Settings2, render: () => <DcOptions /> },
            { id: 'storage', label: 'Storage', icon: Database, render: () => <DcStorage /> },
            { id: 'backup', label: 'Backup', icon: Archive, render: () => <DcBackup /> },
            { id: 'replication', label: 'Replication', icon: Copy, render: () => <DcReplication /> },
          ],
        },
        {
          group: 'Permissions',
          items: [
            { id: 'acl', label: 'Permissions', icon: ShieldCheck, render: () => <DcAcl /> },
            { id: 'users', label: 'Users', icon: Users, render: () => <DcUsers /> },
            { id: 'tokens', label: 'API Tokens', icon: KeyRound, render: () => <DcTokens /> },
            { id: 'groups', label: 'Groups', icon: UsersRound, render: () => <DcGroups /> },
            { id: 'pools', label: 'Pools', icon: FolderTree, render: () => <DcPools /> },
            { id: 'roles', label: 'Roles', icon: BadgeCheck, render: () => <DcRoles /> },
            { id: 'realms', label: 'Realms', icon: Globe, render: () => <DcRealms /> },
          ],
        },
        {
          group: 'Cluster',
          items: [
            { id: 'ha', label: 'HA', icon: HeartPulse, render: () => <DcHA /> },
            { id: 'firewall', label: 'Firewall', icon: Flame, render: () => <FirewallPanel base="/cluster/firewall" level="cluster" /> },
            { id: 'tasks', label: 'Tasks', icon: ListChecks, render: () => <TaskHistory /> },
          ],
        },
      ]}
    />
  );
}

// ---------------- Summary ----------------
function DcSummary({ cstatus }) {
  const { resources, select } = useApp();
  const nodes = resources.filter((r) => r.type === 'node');
  const guests = resources.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && !r.template);
  const storages = resources.filter((r) => r.type === 'storage' && r.status === 'available');
  const online = nodes.filter((n) => n.status === 'online');
  const cpu = online.reduce((a, n) => a + n.cpu * n.maxcpu, 0);
  const maxcpu = online.reduce((a, n) => a + n.maxcpu, 0);
  const mem = online.reduce((a, n) => a + n.mem, 0);
  const maxmem = online.reduce((a, n) => a + n.maxmem, 0);
  // Avoid double-counting shared storages
  const seen = new Set();
  let disk = 0;
  let maxdisk = 0;
  for (const s of storages) {
    const k = s.shared ? s.storage : s.id;
    if (seen.has(k)) continue;
    seen.add(k);
    disk += s.disk || 0;
    maxdisk += s.maxdisk || 0;
  }
  const cluster = (cstatus || []).find((x) => x.type === 'cluster');
  const count = (t, st) => guests.filter((g) => g.type === t && (st ? g.status === st : true)).length;
  const healthy = !cluster || cluster.quorate;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid cols-4">
        <Card>
          <div className="stat">
            <div className="k"><HeartPulse size={14} /> Health</div>
            <div className="v" style={{ color: healthy ? 'var(--green)' : 'var(--red)' }}>{healthy ? 'Healthy' : 'No quorum'}</div>
            <div className="muted small">{cluster ? `Cluster "${cluster.name}" · version ${cluster.version}` : 'Standalone node'}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><Server size={14} /> Nodes</div>
            <div className="v">{online.length}<small>/ {nodes.length} online</small></div>
            <div className="chip-list">{nodes.map((n) => <StatusPill key={n.node} status={n.status}>{n.node}</StatusPill>)}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><Monitor size={14} /> Virtual machines</div>
            <div className="v">{count('qemu', 'running')}<small>/ {count('qemu')} running</small></div>
            <div className="muted small">{count('qemu') - count('qemu', 'running')} stopped</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><Box size={14} /> Containers</div>
            <div className="v">{count('lxc', 'running')}<small>/ {count('lxc')} running</small></div>
            <div className="muted small">{count('lxc') - count('lxc', 'running')} stopped</div>
          </div>
        </Card>
      </div>
      <div className="grid cols-3">
        {[
          ['CPU', Cpu, ratio(cpu, maxcpu), `${cpu.toFixed(2)} of ${maxcpu} cores`],
          ['Memory', MemoryStick, ratio(mem, maxmem), `${fmtBytes(mem)} of ${fmtBytes(maxmem)}`],
          ['Storage', HardDrive, ratio(disk, maxdisk), `${fmtBytes(disk)} of ${fmtBytes(maxdisk)}`],
        ].map(([l, I, v, d]) => (
          <Card key={l}>
            <div className="donut-wrap">
              <Donut value={v} size={72} stroke={8} />
              <div className="lbl">
                <span className="row" style={{ gap: 6 }}><I size={13} /> {l}</span>
                <b>{fmtPct(v)}</b>
                <span>{d}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card title="Nodes" icon={Server} pad0>
        <Table
          rows={sortBy(nodes, (n) => n.node)}
          rowKey={(r) => r.node}
          onRowClick={(n) => select({ type: 'node', node: n.node })}
          columns={[
            { key: 'node', label: 'Name', render: (n) => <b>{n.node}</b> },
            { key: 'status', label: 'Status', render: (n) => <StatusPill status={n.status} /> },
            { key: 'cpu', label: 'CPU', width: 180, render: (n) => <div className="col" style={{ gap: 4 }}><span className="small">{fmtPct(n.cpu)} of {n.maxcpu} CPUs</span><Meter value={n.cpu} /></div> },
            { key: 'mem', label: 'Memory', width: 200, render: (n) => <div className="col" style={{ gap: 4 }}><span className="small">{fmtBytes(n.mem)} / {fmtBytes(n.maxmem)}</span><Meter value={ratio(n.mem, n.maxmem)} /></div> },
            { key: 'uptime', label: 'Uptime', render: (n) => fmtDuration(n.uptime) },
            { key: 'level', label: 'Support', render: (n) => n.level || <span className="faint">none</span> },
          ]}
        />
      </Card>
      {cstatus && cstatus.some((x) => x.type === 'node') && (
        <Card title="Cluster membership" icon={Building2} pad0>
          <Table
            rows={cstatus.filter((x) => x.type === 'node')}
            rowKey={(r) => r.name}
            columns={[
              { key: 'name', label: 'Node' },
              { key: 'nodeid', label: 'ID' },
              { key: 'ip', label: 'IP address' },
              { key: 'online', label: 'Online', render: (r) => <StatusPill status={r.online ? 'online' : 'offline'} /> },
              { key: 'local', label: 'Local', render: (r) => (r.local ? 'Yes' : '') },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

// ---------------- Search ----------------
function DcSearch() {
  const { resources, select } = useApp();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const rows = resources.filter((r) => (type === 'all' || r.type === type) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
  const go = (r) =>
    select(r.type === 'node' ? { type: 'node', node: r.node } : r.type === 'storage' ? { type: 'storage', node: r.node, storage: r.storage } : r.type === 'pool' ? { type: 'pool', pool: r.pool } : { type: r.type, node: r.node, vmid: r.vmid });
  return (
    <div>
      <SectionTitle title="All resources">
        <Seg value={type} onChange={setType} options={[['all', 'All'], ['node', 'Nodes'], ['qemu', 'VMs'], ['lxc', 'CTs'], ['storage', 'Storage'], ['pool', 'Pools']]} />
        <div className="search" style={{ width: 240 }}>
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" />
        </div>
      </SectionTitle>
      <Table
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={go}
        columns={[
          { key: 'type', label: 'Type', render: (r) => <span className="tag">{r.type}</span> },
          { key: 'id', label: 'Description', render: (r) => r.name || r.storage || r.node || r.pool || r.id, sort: (r) => r.name || r.storage || r.node || r.id },
          { key: 'vmid', label: 'ID' },
          { key: 'node', label: 'Node' },
          { key: 'status', label: 'Status', render: (r) => r.status && <StatusPill status={r.status} /> },
          { key: 'cpu', label: 'CPU', render: (r) => (r.maxcpu ? fmtPct(r.cpu) : '') },
          { key: 'mem', label: 'Memory', render: (r) => (r.maxmem ? `${fmtBytes(r.mem)} / ${fmtBytes(r.maxmem)}` : ''), sort: (r) => r.mem || 0 },
          { key: 'disk', label: 'Disk', render: (r) => (r.maxdisk ? `${fmtBytes(r.disk)} / ${fmtBytes(r.maxdisk)}` : ''), sort: (r) => r.disk || 0 },
          { key: 'uptime', label: 'Uptime', render: (r) => (r.uptime ? fmtDuration(r.uptime) : '') },
          { key: 'tags', label: 'Tags', render: (r) => r.tags && <div className="chip-list">{r.tags.split(/[;, ]/).filter(Boolean).map((t) => <span key={t} className="tag">{t}</span>)}</div> },
        ]}
      />
    </div>
  );
}

// ---------------- Options ----------------
const DC_OPTIONS = [
  ['keyboard', 'Keyboard layout', 'select', ['', 'de', 'de-ch', 'da', 'en-gb', 'en-us', 'es', 'fi', 'fr', 'fr-be', 'fr-ca', 'fr-ch', 'hu', 'is', 'it', 'ja', 'lt', 'mk', 'nl', 'no', 'pl', 'pt', 'pt-br', 'sv', 'sl', 'tr']],
  ['language', 'Language', 'text'],
  ['console', 'Console viewer', 'select', ['', 'applet', 'vv', 'html5', 'xtermjs']],
  ['http_proxy', 'HTTP proxy', 'text'],
  ['email_from', 'Email from address', 'text'],
  ['mac_prefix', 'MAC address prefix', 'text'],
  ['migration', 'Migration settings', 'text'],
  ['ha', 'HA settings', 'text'],
  ['bwlimit', 'Bandwidth limits', 'text'],
  ['max_workers', 'Maximal workers/bulk-action', 'text'],
  ['next-id', 'Next free VMID range', 'text'],
  ['tag-style', 'Tag style override', 'text'],
  ['user-tag-access', 'User tag access', 'text'],
  ['registered-tags', 'Registered tags', 'text'],
  ['crs', 'Cluster resource scheduling', 'text'],
  ['description', 'Notes', 'textarea'],
];

function DcOptions() {
  const app = useApp();
  const { data, loading, reload } = useApi('/cluster/options');
  const edit = (opt) => app.openModal((close) => <OptionEditDialog path="/cluster/options" opt={opt} value={data?.[opt[0]]} onClose={() => { close(); reload(); }} />);
  return (
    <div>
      <SectionTitle title="Datacenter options" desc="Double-click a row to edit" />
      <Table
        loading={loading}
        rows={DC_OPTIONS.map((o) => ({ key: o[0], label: o[1], opt: o, value: data?.[o[0]] }))}
        rowKey={(r) => r.key}
        onRowDoubleClick={(r) => edit(r.opt)}
        columns={[
          { key: 'label', label: 'Option', width: 260 },
          { key: 'value', label: 'Value', render: (r) => (r.value === undefined ? <span className="faint">Default</span> : <code>{typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value)}</code>) },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r.opt)} /> },
        ]}
      />
    </div>
  );
}

// Generic single-option editor, also used for node/guest options.
export function OptionEditDialog({ path, opt, value, onClose, method = 'put', extra = {} }) {
  const app = useApp();
  const [key, label, type, choices] = opt;
  const [v, setV] = useState(value === undefined || value === null ? '' : typeof value === 'object' ? Object.entries(value).map(([a, b]) => `${a}=${b}`).join(',') : String(value));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const params = { ...extra };
      if (v === '' || (type === 'bool' && v === 'default')) params.delete = key;
      else params[key] = type === 'bool' ? (v === '1' ? 1 : 0) : v;
      const res = method === 'post' ? await api.post(path, params) : await api.put(path, params);
      if (typeof res === 'string' && res.startsWith('UPID:')) app.trackTask(res, `Update ${label}`);
      else app.toast({ kind: 'success', title: `${label} updated` });
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Edit: ${label}`}
      icon={Pencil}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="form">
        <Field label={label} hint={type === 'text' || type === 'textarea' ? 'Leave empty to reset to default.' : null}>
          {type === 'select' ? (
            <Select value={v} onChange={setV} options={choices.map((c) => (Array.isArray(c) ? c : [c, c === '' ? 'Default' : c]))} />
          ) : type === 'bool' ? (
            <Select value={v} onChange={setV} options={[['1', 'Yes'], ['0', 'No']]} />
          ) : type === 'textarea' ? (
            <Textarea value={v} onChange={setV} />
          ) : (
            <Input value={v} onChange={setV} autoFocus />
          )}
        </Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

// ---------------- Storage (datacenter config) ----------------
const STORAGE_TYPES = [
  ['dir', 'Directory'],
  ['nfs', 'NFS'],
  ['cifs', 'SMB/CIFS'],
  ['lvm', 'LVM'],
  ['lvmthin', 'LVM-Thin'],
  ['zfspool', 'ZFS'],
  ['pbs', 'Proxmox Backup Server'],
  ['btrfs', 'BTRFS'],
  ['iscsi', 'iSCSI'],
  ['cephfs', 'CephFS'],
  ['rbd', 'RBD'],
];
const CONTENT_TYPES = [
  ['images', 'Disk image'],
  ['rootdir', 'Container'],
  ['iso', 'ISO image'],
  ['vztmpl', 'Container template'],
  ['backup', 'VZDump backup file'],
  ['snippets', 'Snippets'],
  ['import', 'Import'],
];

function DcStorage() {
  const app = useApp();
  const { data, loading, reload } = useApi('/storage');
  const edit = (s) => app.openModal((close) => <StorageDialog storage={s} onClose={() => { close(); reload(); }} />);
  const del = async (s) => {
    if (!(await app.confirm({ title: `Remove storage ${s.storage}`, message: 'This removes the storage definition only. Data on the underlying device is not deleted.', danger: true, confirmLabel: 'Remove' }))) return;
    await app.run(() => api.del(P`/storage/${s.storage}`), { success: 'Storage removed' });
    reload();
  };
  return (
    <div>
      <SectionTitle title="Storage" desc="Storage definitions available across the datacenter">
        <Button variant="primary" size="sm" icon={Plus} onClick={() => edit(null)}>Add storage</Button>
      </SectionTitle>
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.storage}
        onRowDoubleClick={edit}
        columns={[
          { key: 'storage', label: 'ID', render: (r) => <b>{r.storage}</b> },
          { key: 'type', label: 'Type', render: (r) => <span className="tag">{r.type}</span> },
          { key: 'content', label: 'Content', render: (r) => (r.content || '').split(',').map((c) => CONTENT_TYPES.find((x) => x[0] === c)?.[1] || c).join(', ') },
          { key: 'path', label: 'Path / Target', render: (r) => r.path || (r.server ? `${r.server}:${r.export || r.share || r.datastore || ''}` : r.pool || r.vgname || r.thinpool || '') },
          { key: 'shared', label: 'Shared', render: (r) => (r.shared ? 'Yes' : 'No') },
          { key: 'disable', label: 'Enabled', render: (r) => (r.disable ? <span className="red">No</span> : <span className="green">Yes</span>) },
          { key: 'nodes', label: 'Nodes', render: (r) => r.nodes || <span className="faint">All</span> },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <><Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r)} /><Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /></> },
        ]}
      />
    </div>
  );
}

function StorageDialog({ storage, onClose }) {
  const app = useApp();
  const isEdit = !!storage;
  const [f, setF] = useState(() => ({
    type: 'dir',
    storage: '',
    content: ['images', 'rootdir'],
    path: '',
    server: '',
    export: '',
    share: '',
    username: '',
    password: '',
    domain: '',
    vgname: '',
    thinpool: '',
    pool: '',
    datastore: '',
    fingerprint: '',
    nodes: '',
    shared: false,
    disable: false,
    'prune-backups': '',
    ...(storage ? { ...storage, content: (storage.content || '').split(',').filter(Boolean), shared: !!storage.shared, disable: !!storage.disable, password: '' } : {}),
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const fields = {
    dir: ['path', 'shared'],
    nfs: ['server', 'export'],
    cifs: ['server', 'share', 'username', 'password', 'domain'],
    lvm: ['vgname', 'shared'],
    lvmthin: ['vgname', 'thinpool'],
    zfspool: ['pool'],
    pbs: ['server', 'datastore', 'username', 'password', 'fingerprint'],
    btrfs: ['path'],
    iscsi: ['portal', 'target'],
    cephfs: ['monhost', 'username'],
    rbd: ['pool', 'monhost', 'username'],
  }[f.type] || [];
  const toggleContent = (c) => set('content')(f.content.includes(c) ? f.content.filter((x) => x !== c) : [...f.content, c]);
  const save = async () => {
    setBusy(true);
    setError(null);
    const params = { content: f.content.join(',') || undefined, nodes: f.nodes || undefined, disable: f.disable ? 1 : 0 };
    for (const k of fields) {
      if (k === 'shared') params.shared = f.shared ? 1 : 0;
      else if (k === 'password' && !f.password) continue;
      else if (f[k] !== '' && f[k] !== undefined) params[k] = f[k];
    }
    if (f['prune-backups']) params['prune-backups'] = f['prune-backups'];
    try {
      if (isEdit) {
        for (const k of ['path', 'server', 'export', 'share', 'vgname', 'thinpool', 'pool', 'datastore', 'portal', 'target']) delete params[k];
        await api.put(P`/storage/${f.storage}`, params);
      } else {
        await api.post('/storage', { ...params, storage: f.storage, type: f.type });
      }
      app.toast({ kind: 'success', title: isEdit ? 'Storage updated' : 'Storage added' });
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  const LABELS = { path: 'Directory', server: 'Server', export: 'Export', share: 'Share', username: 'Username', password: 'Password', domain: 'Domain', vgname: 'Volume group', thinpool: 'Thin pool', pool: 'Pool', datastore: 'Datastore', fingerprint: 'Fingerprint', portal: 'Portal', target: 'Target', monhost: 'Monitor(s)' };
  return (
    <Modal
      title={isEdit ? `Edit storage: ${storage.storage}` : 'Add storage'}
      icon={Database}
      onClose={onClose}
      width={620}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{isEdit ? 'Save' : 'Add'}</Button></>}
    >
      <div className="form">
        <div className="form-row">
          <Field label="ID">
            <Input value={f.storage} onChange={set('storage')} disabled={isEdit} placeholder="my-storage" />
          </Field>
          <Field label="Type">
            <Select value={f.type} onChange={set('type')} options={STORAGE_TYPES} disabled={isEdit} />
          </Field>
        </div>
        <div className="form-row">
          {fields.filter((k) => k !== 'shared').map((k) => (
            <Field key={k} label={LABELS[k] || k}>
              <Input value={f[k]} onChange={set(k)} type={k === 'password' ? 'password' : 'text'} disabled={isEdit && ['path', 'server', 'export', 'share', 'vgname', 'thinpool', 'pool', 'datastore', 'portal', 'target'].includes(k)} placeholder={k === 'password' && isEdit ? '(unchanged)' : ''} />
            </Field>
          ))}
        </div>
        {f.type !== 'pbs' && (
          <Field label="Content">
            <div className="row wrap" style={{ gap: 14 }}>
              {CONTENT_TYPES.map(([c, l]) => <Checkbox key={c} label={l} checked={f.content.includes(c)} onChange={() => toggleContent(c)} />)}
            </div>
          </Field>
        )}
        <div className="form-row">
          <Field label="Nodes" hint="Comma separated, empty = all nodes">
            <Input value={f.nodes} onChange={set('nodes')} />
          </Field>
          <Field label="Backup retention" hint="e.g. keep-last=3,keep-weekly=2">
            <Input value={f['prune-backups']} onChange={set('prune-backups')} />
          </Field>
        </div>
        <div className="row" style={{ gap: 20 }}>
          {fields.includes('shared') && <Checkbox label="Shared" checked={f.shared} onChange={set('shared')} />}
          <Checkbox label="Disabled" checked={f.disable} onChange={set('disable')} />
        </div>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

// ---------------- Backup jobs ----------------
function DcBackup() {
  const app = useApp();
  const { data, loading, reload } = useApi('/cluster/backup');
  const edit = (job) => app.openModal((close) => <BackupJobDialog job={job} onClose={() => { close(); reload(); }} />);
  const del = async (j) => {
    if (!(await app.confirm({ title: 'Remove backup job', message: `Remove backup job "${j.comment || j.id}"?`, danger: true, confirmLabel: 'Remove' }))) return;
    await app.run(() => api.del(P`/cluster/backup/${j.id}`), { success: 'Backup job removed' });
    reload();
  };
  const runNow = async (j) => {
    if (!(await app.confirm({ title: 'Run backup job now', message: `Start backup job "${j.comment || j.id}" now on all applicable nodes?`, confirmLabel: 'Run now' }))) return;
    const { id, schedule, enabled, type, 'next-run': _n, comment, digest, node, 'repeat-missed': _r, ...params } = j;
    const nodes = app.resources.filter((r) => r.type === 'node' && r.status === 'online' && (!node || r.node === node));
    for (const n of nodes) {
      try {
        const upid = await api.post(P`/nodes/${n.node}/vzdump`, params);
        app.trackTask(upid, `Backup job on ${n.node}`);
      } catch (e) {
        if (!/no guests/i.test(e.message)) app.toast({ kind: 'error', title: `Backup on ${n.node} failed`, message: e.message });
      }
    }
  };
  return (
    <div>
      <SectionTitle title="Backup jobs" desc="Scheduled vzdump jobs">
        <Button variant="primary" size="sm" icon={Plus} onClick={() => edit(null)}>Add job</Button>
      </SectionTitle>
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.id}
        onRowDoubleClick={edit}
        columns={[
          { key: 'enabled', label: 'Enabled', render: (r) => (r.enabled === 0 ? <StatusPill status="disabled">No</StatusPill> : <StatusPill status="ok">Yes</StatusPill>) },
          { key: 'node', label: 'Node', render: (r) => r.node || <span className="faint">All</span> },
          { key: 'schedule', label: 'Schedule', render: (r) => <code>{r.schedule}</code> },
          { key: 'next-run', label: 'Next run', render: (r) => (r['next-run'] ? new Date(r['next-run'] * 1000).toLocaleString() : '—') },
          { key: 'storage', label: 'Storage' },
          { key: 'mode', label: 'Mode' },
          { key: 'vmid', label: 'Selection', render: (r) => (r.all ? (r.exclude ? `All except ${r.exclude}` : 'All') : r.pool ? `Pool ${r.pool}` : r.vmid) },
          { key: 'comment', label: 'Comment' },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <><Button size="sm" variant="ghost" icon={Play} onClick={() => runNow(r)}>Run now</Button><Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r)} /><Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /></> },
        ]}
      />
    </div>
  );
}

function BackupJobDialog({ job, onClose }) {
  const app = useApp();
  const guests = app.resources.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && !r.template);
  const nodes = app.resources.filter((r) => r.type === 'node');
  const allStorages = useApi('/storage');
  const backupStorages = (allStorages.data || []).filter((s) => (s.content || '').includes('backup') || s.type === 'pbs');
  const [f, setF] = useState(() => ({
    node: '',
    storage: '',
    schedule: '21:00',
    selmode: job ? (job.all ? 'all' : job.pool ? 'pool' : 'include') : 'include',
    vmids: job?.vmid ? String(job.vmid).split(',') : [],
    exclude: job?.exclude ? String(job.exclude).split(',') : [],
    pool: '',
    mode: 'snapshot',
    compress: 'zstd',
    enabled: true,
    comment: '',
    mailto: '',
    mailnotification: 'always',
    'prune-backups': '',
    'notes-template': '{{guestname}}',
    ...(job ? { ...job, enabled: job.enabled !== 0 } : {}),
  }));
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const toggleVm = (key, id) => set(key)(f[key].includes(String(id)) ? f[key].filter((x) => x !== String(id)) : [...f[key], String(id)]);
  const save = async () => {
    const params = {
      schedule: f.schedule,
      storage: f.storage,
      mode: f.mode,
      compress: f.compress === '0' ? 0 : f.compress,
      enabled: f.enabled ? 1 : 0,
      comment: f.comment || undefined,
      mailto: f.mailto || undefined,
      'notes-template': f['notes-template'] || undefined,
      'prune-backups': f['prune-backups'] || undefined,
      node: f.node || undefined,
    };
    const del = [];
    if (f.selmode === 'all') {
      params.all = 1;
      if (f.exclude.length) params.exclude = f.exclude.join(',');
      else if (job) del.push('exclude');
      if (job) del.push('vmid', 'pool');
    } else if (f.selmode === 'pool') {
      params.pool = f.pool;
      if (job) del.push('vmid', 'exclude'), (params.all = 0);
    } else {
      params.vmid = f.vmids.join(',');
      if (job) del.push('pool', 'exclude'), (params.all = 0);
    }
    if (job && !f.node) del.push('node');
    if (del.length) params.delete = del.join(',');
    try {
      if (job) await api.put(P`/cluster/backup/${job.id}`, params);
      else await api.post('/cluster/backup', params);
      app.toast({ kind: 'success', title: job ? 'Backup job updated' : 'Backup job created' });
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  const pools = app.resources.filter((r) => r.type === 'pool');
  const list = f.selmode === 'all' ? 'exclude' : 'vmids';
  return (
    <Modal title={job ? 'Edit backup job' : 'Create backup job'} icon={Archive} onClose={onClose} width={720} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!f.storage}>{job ? 'Save' : 'Create'}</Button></>}>
      <div className="form">
        <div className="form-row three">
          <Field label="Node"><Select value={f.node} onChange={set('node')} options={[['', 'All nodes'], ...nodes.map((n) => n.node)]} /></Field>
          <Field label="Storage"><Select value={f.storage} onChange={set('storage')} options={backupStorages.map((s) => s.storage)} placeholder="Select…" /></Field>
          <Field label="Schedule" hint="e.g. 21:00, sat 02:00, */6:00"><Input value={f.schedule} onChange={set('schedule')} /></Field>
        </div>
        <div className="form-row three">
          <Field label="Selection mode"><Select value={f.selmode} onChange={set('selmode')} options={[['include', 'Include selected VMs'], ['all', 'All'], ['pool', 'Pool based']]} /></Field>
          <Field label="Mode"><Select value={f.mode} onChange={set('mode')} options={[['snapshot', 'Snapshot'], ['suspend', 'Suspend'], ['stop', 'Stop']]} /></Field>
          <Field label="Compression"><Select value={f.compress} onChange={set('compress')} options={[['zstd', 'ZSTD'], ['lzo', 'LZO'], ['gzip', 'GZIP'], ['0', 'None']]} /></Field>
        </div>
        {f.selmode === 'pool' ? (
          <Field label="Pool"><Select value={f.pool} onChange={set('pool')} options={pools.map((p) => p.pool)} placeholder="Select…" /></Field>
        ) : (
          <Field label={f.selmode === 'all' ? 'Exclude these guests' : 'Guests to back up'}>
            <div className="table-wrap" style={{ maxHeight: 200 }}>
              <table className="tbl">
                <tbody>
                  {sortBy(guests, (g) => g.vmid).map((g) => (
                    <tr key={g.vmid} className="clickable" onClick={() => toggleVm(list, g.vmid)}>
                      <td style={{ width: 30 }}><Checkbox checked={f[list].includes(String(g.vmid))} /></td>
                      <td>{g.vmid}</td>
                      <td>{g.name}</td>
                      <td className="muted">{g.type === 'qemu' ? 'VM' : 'CT'} · {g.node}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Field>
        )}
        <div className="form-row">
          <Field label="Retention" hint="e.g. keep-last=7,keep-weekly=4 (empty = storage default)"><Input value={f['prune-backups']} onChange={set('prune-backups')} /></Field>
          <Field label="Notes template"><Input value={f['notes-template']} onChange={set('notes-template')} /></Field>
        </div>
        <div className="form-row">
          <Field label="Send email to"><Input value={f.mailto} onChange={set('mailto')} /></Field>
          <Field label="Comment"><Input value={f.comment} onChange={set('comment')} /></Field>
        </div>
        <Checkbox label="Enabled" checked={f.enabled} onChange={set('enabled')} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

// ---------------- Replication ----------------
function DcReplication() {
  const app = useApp();
  const { data, loading, reload } = useApi('/cluster/replication');
  const del = async (j) => {
    if (!(await app.confirm({ title: 'Remove replication job', message: `Remove job ${j.id}?`, danger: true, confirmLabel: 'Remove' }))) return;
    await app.run(() => api.del(P`/cluster/replication/${j.id}`), { success: 'Replication job removed' });
    reload();
  };
  return (
    <div>
      <SectionTitle title="Replication" desc="Storage replication jobs (ZFS)" />
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.id}
        empty="No replication jobs configured"
        columns={[
          { key: 'id', label: 'ID' },
          { key: 'guest', label: 'Guest' },
          { key: 'target', label: 'Target' },
          { key: 'schedule', label: 'Schedule', render: (r) => <code>{r.schedule || '*/15'}</code> },
          { key: 'rate', label: 'Rate limit', render: (r) => (r.rate ? `${r.rate} MB/s` : 'unlimited') },
          { key: 'disable', label: 'Enabled', render: (r) => (r.disable ? 'No' : 'Yes') },
          { key: 'comment', label: 'Comment' },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /> },
        ]}
      />
    </div>
  );
}

// ---------------- Permissions ----------------
function DcAcl() {
  const app = useApp();
  const { data, loading, reload } = useApi('/access/acl');
  const add = () => app.openModal((close) => <AclDialog path="/" onClose={() => { close(); reload(); }} />);
  const remove = async (a) => {
    if (!(await app.confirm({ title: 'Remove permission', message: `Remove ${a.roleid} for ${a.ugid} on ${a.path}?`, danger: true, confirmLabel: 'Remove' }))) return;
    const params = { path: a.path, roles: a.roleid, delete: 1 };
    params[a.type === 'group' ? 'groups' : a.type === 'token' ? 'tokens' : 'users'] = a.ugid;
    await app.run(() => api.put('/access/acl', params), { success: 'Permission removed' });
    reload();
  };
  return (
    <div>
      <SectionTitle title="Permissions" desc="Access control list">
        <Button size="sm" variant="primary" icon={Plus} onClick={add}>Add permission</Button>
      </SectionTitle>
      <AclTable rows={data} loading={loading} onRemove={remove} />
    </div>
  );
}

function DcUsers() {
  const app = useApp();
  const { data, loading, reload } = useApi('/access/users', { full: 1 });
  const edit = (u) => app.openModal((close) => <UserDialog user={u} onClose={() => { close(); reload(); }} />);
  const del = async (u) => {
    if (!(await app.confirm({ title: `Delete user ${u.userid}`, message: 'This removes the user and all of their permissions and tokens.', danger: true, confirmLabel: 'Delete' }))) return;
    await app.run(() => api.del(P`/access/users/${u.userid}`), { success: 'User deleted' });
    reload();
  };
  const pw = async (u) => {
    const p = await app.prompt({ title: `Change password: ${u.userid}`, label: 'New password', type: 'password', confirmLabel: 'Change' });
    if (!p) return;
    await app.run(() => api.put('/access/password', { userid: u.userid, password: p }), { success: 'Password changed' });
  };
  return (
    <div>
      <SectionTitle title="Users">
        <Button size="sm" variant="primary" icon={Plus} onClick={() => edit(null)}>Add user</Button>
      </SectionTitle>
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.userid}
        onRowDoubleClick={edit}
        columns={[
          { key: 'userid', label: 'User', render: (r) => <b>{r.userid}</b> },
          { key: 'realm-type', label: 'Realm', render: (r) => r['realm-type'] || r.userid.split('@')[1] },
          { key: 'enable', label: 'Enabled', render: (r) => (r.enable === 0 ? <span className="red">No</span> : <span className="green">Yes</span>) },
          { key: 'expire', label: 'Expires', render: (r) => (r.expire ? new Date(r.expire * 1000).toLocaleDateString() : 'never') },
          { key: 'name', label: 'Name', render: (r) => [r.firstname, r.lastname].filter(Boolean).join(' ') },
          { key: 'email', label: 'Email' },
          { key: 'groups', label: 'Groups', render: (r) => (Array.isArray(r.groups) ? r.groups.join(', ') : r.groups) },
          { key: 'tfa', label: '2FA', render: (r) => (r['tfa-locked-until'] ? 'locked' : r.keys ? 'yes' : '') },
          { key: 'comment', label: 'Comment' },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <><Button size="sm" variant="ghost" iconOnly icon={Lock} title="Change password" onClick={() => pw(r)} /><Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r)} /><Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /></> },
        ]}
      />
    </div>
  );
}

function UserDialog({ user, onClose }) {
  const app = useApp();
  const groups = useApi('/access/groups');
  const realms = useApi('/access/domains');
  const [f, setF] = useState(() => ({
    username: user ? user.userid.split('@')[0] : '',
    realm: user ? user.userid.split('@')[1] : 'pve',
    password: '',
    groups: user ? (Array.isArray(user.groups) ? user.groups : String(user.groups || '').split(',').filter(Boolean)) : [],
    enable: user ? user.enable !== 0 : true,
    firstname: user?.firstname || '',
    lastname: user?.lastname || '',
    email: user?.email || '',
    comment: user?.comment || '',
    expire: user?.expire ? new Date(user.expire * 1000).toISOString().slice(0, 10) : '',
  }));
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    const params = {
      groups: f.groups.join(','),
      enable: f.enable ? 1 : 0,
      firstname: f.firstname,
      lastname: f.lastname,
      email: f.email,
      comment: f.comment,
      expire: f.expire ? Math.floor(new Date(f.expire).getTime() / 1000) : 0,
    };
    try {
      if (user) await api.put(P`/access/users/${user.userid}`, params);
      else await api.post('/access/users', { ...params, userid: `${f.username}@${f.realm}`, password: f.realm === 'pve' && f.password ? f.password : undefined });
      app.toast({ kind: 'success', title: user ? 'User updated' : 'User created' });
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Modal title={user ? `Edit user ${user.userid}` : 'Add user'} icon={Users} onClose={onClose} width={600} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{user ? 'Save' : 'Add'}</Button></>}>
      <div className="form">
        <div className="form-row">
          <Field label="Username"><Input value={f.username} onChange={set('username')} disabled={!!user} /></Field>
          <Field label="Realm"><Select value={f.realm} onChange={set('realm')} disabled={!!user} options={(realms.data || []).map((r) => [r.realm, `${r.realm} — ${r.comment || r.type}`])} /></Field>
        </div>
        {!user && f.realm === 'pve' && <Field label="Password"><Input type="password" value={f.password} onChange={set('password')} /></Field>}
        {!user && f.realm === 'pam' && <div className="info-box">PAM users must already exist as Linux users on the node(s).</div>}
        <div className="form-row">
          <Field label="First name"><Input value={f.firstname} onChange={set('firstname')} /></Field>
          <Field label="Last name"><Input value={f.lastname} onChange={set('lastname')} /></Field>
        </div>
        <div className="form-row">
          <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
          <Field label="Expires"><Input type="date" value={f.expire} onChange={set('expire')} /></Field>
        </div>
        <Field label="Groups">
          <div className="row wrap" style={{ gap: 14 }}>
            {(groups.data || []).map((g) => <Checkbox key={g.groupid} label={g.groupid} checked={f.groups.includes(g.groupid)} onChange={(v) => set('groups')(v ? [...f.groups, g.groupid] : f.groups.filter((x) => x !== g.groupid))} />)}
            {!(groups.data || []).length && <span className="faint">No groups defined</span>}
          </div>
        </Field>
        <Field label="Comment"><Input value={f.comment} onChange={set('comment')} /></Field>
        <Checkbox label="Enabled" checked={f.enable} onChange={set('enable')} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function DcTokens() {
  const app = useApp();
  const users = useApi('/access/users', { full: 1 });
  const rows = (users.data || []).flatMap((u) => (u.tokens || []).map((t) => ({ ...t, userid: u.userid, full: `${u.userid}!${t.tokenid}` })));
  const add = () => app.openModal((close) => <TokenDialog users={users.data || []} onClose={() => { close(); users.reload(); }} />);
  const del = async (t) => {
    if (!(await app.confirm({ title: 'Remove API token', message: `Remove token ${t.full}?`, danger: true, confirmLabel: 'Remove' }))) return;
    await app.run(() => api.del(P`/access/users/${t.userid}/token/${t.tokenid}`), { success: 'Token removed' });
    users.reload();
  };
  return (
    <div>
      <SectionTitle title="API tokens">
        <Button size="sm" variant="primary" icon={Plus} onClick={add}>Add token</Button>
      </SectionTitle>
      <Table
        loading={users.loading}
        rows={rows}
        rowKey={(r) => r.full}
        empty="No API tokens"
        columns={[
          { key: 'full', label: 'Token ID', render: (r) => <code>{r.full}</code> },
          { key: 'privsep', label: 'Privilege separation', render: (r) => (r.privsep ? 'Yes' : 'No') },
          { key: 'expire', label: 'Expires', render: (r) => (r.expire ? new Date(r.expire * 1000).toLocaleDateString() : 'never') },
          { key: 'comment', label: 'Comment' },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /> },
        ]}
      />
    </div>
  );
}

function TokenDialog({ users, onClose }) {
  const [f, setF] = useState({ userid: users[0]?.userid || '', tokenid: '', privsep: true, comment: '' });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    try {
      const res = await api.post(P`/access/users/${f.userid}/token/${f.tokenid}`, { privsep: f.privsep ? 1 : 0, comment: f.comment || undefined });
      setResult(res);
    } catch (e) {
      setError(e);
    }
  };
  if (result)
    return (
      <Modal title="Token created" icon={KeyRound} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="form">
          <div className="warn-box">Copy the secret now — it will not be shown again.</div>
          <KV items={[['Token ID', <code key="i">{result['full-tokenid']}</code>], ['Secret', <code key="s">{result.value}</code>]]} />
          <Button icon={Copy} onClick={() => navigator.clipboard.writeText(result.value)}>Copy secret</Button>
        </div>
      </Modal>
    );
  return (
    <Modal title="Add API token" icon={KeyRound} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!f.tokenid}>Add</Button></>}>
      <div className="form">
        <Field label="User"><Select value={f.userid} onChange={set('userid')} options={users.map((u) => u.userid)} /></Field>
        <Field label="Token ID"><Input value={f.tokenid} onChange={set('tokenid')} placeholder="automation" /></Field>
        <Field label="Comment"><Input value={f.comment} onChange={set('comment')} /></Field>
        <Checkbox label="Privilege separation (token needs its own permissions)" checked={f.privsep} onChange={set('privsep')} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function SimpleCrud({ title, desc, path, idKey, columns, fields, createPath, updatePath, deletePath }) {
  const app = useApp();
  const { data, loading, reload } = useApi(path);
  const open = (row) =>
    app.openModal((close) => (
      <SimpleDialog
        title={row ? `Edit ${row[idKey]}` : `Add ${title.replace(/s$/, '').toLowerCase()}`}
        row={row}
        idKey={idKey}
        fields={fields}
        onSave={async (vals) => {
          if (row) {
            const { [idKey]: _id, ...rest } = vals;
            await api.put(updatePath(row), rest);
          } else await api.post(createPath || path, vals);
        }}
        onClose={() => { close(); reload(); }}
      />
    ));
  const del = async (row) => {
    if (!(await app.confirm({ title: `Delete ${row[idKey]}`, message: `Delete ${row[idKey]}?`, danger: true, confirmLabel: 'Delete' }))) return;
    await app.run(() => api.del(deletePath(row)), { success: 'Deleted' });
    reload();
  };
  return (
    <div>
      <SectionTitle title={title} desc={desc}>
        <Button size="sm" variant="primary" icon={Plus} onClick={() => open(null)}>Add</Button>
      </SectionTitle>
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r[idKey]}
        onRowDoubleClick={(r) => !r.special && open(r)}
        columns={[...columns, { key: 'a', label: '', sort: false, className: 'actions', render: (r) => !r.special && <><Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => open(r)} /><Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /></> }]}
      />
    </div>
  );
}

function SimpleDialog({ title, row, idKey, fields, onSave, onClose }) {
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map((f) => [f.key, row?.[f.key] ?? ''])));
  const [error, setError] = useState(null);
  const save = async () => {
    try {
      const clean = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== ''));
      await onSave(clean);
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="form">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {f.type === 'textarea' ? <Textarea value={vals[f.key]} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} /> : <Input value={vals[f.key]} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} disabled={row && f.key === idKey} />}
          </Field>
        ))}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function DcGroups() {
  return (
    <SimpleCrud
      title="Groups"
      path="/access/groups"
      idKey="groupid"
      columns={[{ key: 'groupid', label: 'Group', render: (r) => <b>{r.groupid}</b> }, { key: 'users', label: 'Members' }, { key: 'comment', label: 'Comment' }]}
      fields={[{ key: 'groupid', label: 'Name' }, { key: 'comment', label: 'Comment' }]}
      updatePath={(r) => P`/access/groups/${r.groupid}`}
      deletePath={(r) => P`/access/groups/${r.groupid}`}
    />
  );
}

function DcPools() {
  return (
    <SimpleCrud
      title="Pools"
      desc="Resource pools group guests and storage for permissions"
      path="/pools"
      idKey="poolid"
      columns={[{ key: 'poolid', label: 'Pool', render: (r) => <b>{r.poolid}</b> }, { key: 'comment', label: 'Comment' }]}
      fields={[{ key: 'poolid', label: 'Name' }, { key: 'comment', label: 'Comment' }]}
      updatePath={(r) => P`/pools/${r.poolid}`}
      deletePath={(r) => P`/pools/${r.poolid}`}
    />
  );
}

function DcRoles() {
  return (
    <SimpleCrud
      title="Roles"
      desc="Built-in roles are read-only"
      path="/access/roles"
      idKey="roleid"
      columns={[
        { key: 'roleid', label: 'Role', render: (r) => <b>{r.roleid}</b> },
        { key: 'special', label: 'Built-in', render: (r) => (r.special ? 'Yes' : 'No') },
        { key: 'privs', label: 'Privileges', render: (r) => <span className="small muted" style={{ whiteSpace: 'normal' }}>{(r.privs || '').split(',').join(', ')}</span> },
      ]}
      fields={[{ key: 'roleid', label: 'Name' }, { key: 'privs', label: 'Privileges', hint: 'Comma separated, e.g. VM.PowerMgmt,VM.Console,VM.Audit', type: 'textarea' }]}
      updatePath={(r) => P`/access/roles/${r.roleid}`}
      deletePath={(r) => P`/access/roles/${r.roleid}`}
    />
  );
}

function DcRealms() {
  const { data, loading } = useApi('/access/domains');
  return (
    <div>
      <SectionTitle title="Authentication realms" />
      <Table
        loading={loading}
        rows={data}
        rowKey={(r) => r.realm}
        columns={[
          { key: 'realm', label: 'Realm', render: (r) => <b>{r.realm}</b> },
          { key: 'type', label: 'Type', render: (r) => <span className="tag">{r.type}</span> },
          { key: 'tfa', label: 'TFA' },
          { key: 'default', label: 'Default', render: (r) => (r.default ? 'Yes' : '') },
          { key: 'comment', label: 'Comment' },
        ]}
      />
    </div>
  );
}

// ---------------- HA ----------------
function DcHA() {
  const app = useApp();
  const status = useApi('/cluster/ha/status/current', null, { interval: 5000 });
  const res = useApi('/cluster/ha/resources');
  const groups = useApi('/cluster/ha/groups');
  const add = () => app.openModal((close) => <HaDialog onClose={() => { close(); res.reload(); }} />);
  const del = async (r) => {
    if (!(await app.confirm({ title: 'Remove HA resource', message: `Remove ${r.sid} from HA management?`, danger: true, confirmLabel: 'Remove' }))) return;
    await app.run(() => api.del(P`/cluster/ha/resources/${r.sid}`), { success: 'HA resource removed' });
    res.reload();
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <SectionTitle title="HA status">
          <Button size="sm" icon={RefreshCw} onClick={status.reload}>Refresh</Button>
        </SectionTitle>
        <Table loading={status.loading} rows={status.data} rowKey={(r) => r.id} empty="HA is not configured" columns={[{ key: 'type', label: 'Type', render: (r) => <span className="tag">{r.type}</span> }, { key: 'status', label: 'Status' }, { key: 'node', label: 'Node' }]} />
      </div>
      <div>
        <SectionTitle title="Resources">
          <Button size="sm" variant="primary" icon={Plus} onClick={add}>Add</Button>
        </SectionTitle>
        <Table
          loading={res.loading}
          rows={res.data}
          rowKey={(r) => r.sid}
          empty="No HA resources"
          columns={[
            { key: 'sid', label: 'ID' },
            { key: 'state', label: 'Requested state' },
            { key: 'group', label: 'Group' },
            { key: 'max_restart', label: 'Max restart' },
            { key: 'max_relocate', label: 'Max relocate' },
            { key: 'comment', label: 'Comment' },
            { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /> },
          ]}
        />
      </div>
      <div>
        <SectionTitle title="Groups" />
        <Table loading={groups.loading} rows={groups.data} rowKey={(r) => r.group} empty="No HA groups" columns={[{ key: 'group', label: 'Group' }, { key: 'nodes', label: 'Nodes' }, { key: 'restricted', label: 'Restricted', render: (r) => (r.restricted ? 'Yes' : 'No') }, { key: 'nofailback', label: 'No failback', render: (r) => (r.nofailback ? 'Yes' : 'No') }, { key: 'comment', label: 'Comment' }]} />
      </div>
    </div>
  );
}

function HaDialog({ onClose }) {
  const app = useApp();
  const guests = app.resources.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && !r.template);
  const [f, setF] = useState({ sid: '', state: 'started', max_restart: 1, max_relocate: 1, comment: '' });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    try {
      await api.post('/cluster/ha/resources', { ...f, comment: f.comment || undefined });
      app.toast({ kind: 'success', title: 'HA resource added' });
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Modal title="Add HA resource" icon={HeartPulse} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!f.sid}>Add</Button></>}>
      <div className="form">
        <Field label="Guest"><Select value={f.sid} onChange={set('sid')} placeholder="Select…" options={guests.map((g) => [`${g.type === 'qemu' ? 'vm' : 'ct'}:${g.vmid}`, `${g.vmid} — ${g.name || ''}`])} /></Field>
        <div className="form-row three">
          <Field label="Request state"><Select value={f.state} onChange={set('state')} options={['started', 'stopped', 'ignored', 'disabled']} /></Field>
          <Field label="Max restart"><NumberInput value={f.max_restart} onChange={set('max_restart')} /></Field>
          <Field label="Max relocate"><NumberInput value={f.max_relocate} onChange={set('max_relocate')} /></Field>
        </div>
        <Field label="Comment"><Input value={f.comment} onChange={set('comment')} /></Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

export { Loading, KV };
