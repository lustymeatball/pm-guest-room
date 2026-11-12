import React from 'react';
import { FolderTree, LayoutDashboard, Users, ShieldCheck, Plus, Trash2, Monitor, Box, Database } from 'lucide-react';
import { useApp } from '../context';
import { api, P, useApi } from '../lib/api';
import { ObjectView } from '../components/ObjectView';
import { Button, Table, StatusPill, SectionTitle, Modal, Field, Select, Card, KV } from '../components/ui';
import { PathPermissions } from './common';
import { fmtBytes, fmtPct, sortBy } from '../lib/utils';
import { useState } from 'react';

export function PoolView({ pool }) {
  const { data, reload } = useApi(P`/pools/${pool}`, null, { interval: 10000 });
  return (
    <ObjectView
      icon={FolderTree}
      title={`Pool ${pool}`}
      sub={data?.comment}
      storageKey="pool"
      nav={[
        {
          items: [
            { id: 'summary', label: 'Summary', icon: LayoutDashboard, render: () => <PoolSummary data={data} /> },
            { id: 'members', label: 'Members', icon: Users, render: () => <PoolMembers pool={pool} data={data} reload={reload} /> },
            { id: 'perm', label: 'Permissions', icon: ShieldCheck, render: () => <PathPermissions path={`/pool/${pool}`} /> },
          ],
        },
      ]}
    />
  );
}

function PoolSummary({ data }) {
  const m = data?.members || [];
  return (
    <Card title="Overview" icon={FolderTree} style={{ maxWidth: 600 }}>
      <KV items={[['Comment', data?.comment], ['Virtual machines', m.filter((x) => x.type === 'qemu').length], ['Containers', m.filter((x) => x.type === 'lxc').length], ['Storages', m.filter((x) => x.type === 'storage').length], ['Running guests', m.filter((x) => x.status === 'running').length]]} />
    </Card>
  );
}

function PoolMembers({ pool, data, reload }) {
  const app = useApp();
  const members = data?.members || [];
  const remove = async (m) => {
    const params = { delete: 1 };
    if (m.type === 'storage') params.storage = m.storage;
    else params.vms = m.vmid;
    await app.run(() => api.put(P`/pools/${pool}`, params), { success: 'Member removed' });
    reload();
  };
  const add = (kind) => app.openModal((close) => <AddMember pool={pool} kind={kind} onClose={() => { close(); reload(); }} />);
  return (
    <div>
      <SectionTitle title="Members">
        <Button size="sm" variant="primary" icon={Plus} onClick={() => add('vm')}>Add guest</Button>
        <Button size="sm" icon={Plus} onClick={() => add('storage')}>Add storage</Button>
      </SectionTitle>
      <Table
        rows={sortBy(members, (m) => m.type + (m.vmid || m.storage))}
        rowKey={(r) => r.id}
        onRowClick={(m) => app.select(m.type === 'storage' ? { type: 'storage', node: m.node, storage: m.storage } : { type: m.type, node: m.node, vmid: m.vmid })}
        empty="Pool has no members"
        columns={[
          { key: 'type', label: 'Type', render: (m) => <span className="row">{m.type === 'qemu' ? <Monitor size={13} /> : m.type === 'lxc' ? <Box size={13} /> : <Database size={13} />}{m.type}</span> },
          { key: 'id', label: 'ID', render: (m) => m.vmid || m.storage },
          { key: 'name', label: 'Name' },
          { key: 'node', label: 'Node' },
          { key: 'status', label: 'Status', render: (m) => <StatusPill status={m.status} /> },
          { key: 'cpu', label: 'CPU', render: (m) => (m.maxcpu && m.status === 'running' ? fmtPct(m.cpu) : '') },
          { key: 'mem', label: 'Memory', render: (m) => (m.maxmem ? fmtBytes(m.mem) : '') },
          { key: 'a', label: '', sort: false, className: 'actions', render: (m) => <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={(e) => { e.stopPropagation(); remove(m); }} /> },
        ]}
      />
    </div>
  );
}

function AddMember({ pool, kind, onClose }) {
  const app = useApp();
  const [v, setV] = useState('');
  const opts =
    kind === 'vm'
      ? app.resources.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && r.pool !== pool).map((r) => [String(r.vmid), `${r.vmid} — ${r.name || ''}`])
      : [...new Set(app.resources.filter((r) => r.type === 'storage').map((r) => r.storage))].map((s) => [s, s]);
  const save = async () => {
    await app.run(() => api.put(P`/pools/${pool}`, kind === 'vm' ? { vms: v } : { storage: v }), { success: 'Member added' });
    onClose();
  };
  return (
    <Modal title={kind === 'vm' ? 'Add guest to pool' : 'Add storage to pool'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!v}>Add</Button></>}>
      <Field label={kind === 'vm' ? 'Guest' : 'Storage'}>
        <Select value={v} onChange={setV} placeholder="Select…" options={opts} />
      </Field>
    </Modal>
  );
}
