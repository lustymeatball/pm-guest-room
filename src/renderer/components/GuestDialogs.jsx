import React, { useEffect, useState } from 'react';
import { Copy, MoveRight, Archive } from 'lucide-react';
import { api, P, useApi } from '../lib/api';
import { useApp } from '../context';
import { Modal, Button, Field, Input, NumberInput, Select, Checkbox, ErrorBox, Textarea } from './ui';
import { fmtBytes } from '../lib/utils';

export function useNodes() {
  const { resources } = useApp();
  return resources.filter((r) => r.type === 'node').sort((a, b) => a.node.localeCompare(b.node));
}

export function useStorages(node, content) {
  const { data } = useApi(node ? P`/nodes/${node}/storage` : null, content ? { content, enabled: 1 } : { enabled: 1 }, { enabled: !!node });
  return (data || []).filter((s) => s.active !== 0).sort((a, b) => a.storage.localeCompare(b.storage));
}

export function storageOptions(list, withDefault) {
  const opts = list.map((s) => [s.storage, `${s.storage} (${s.type}) — ${fmtBytes(s.avail)} free`]);
  return withDefault ? [['', withDefault], ...opts] : opts;
}

export function useNextId() {
  const [id, setId] = useState('');
  useEffect(() => {
    api.get('/cluster/nextid').then((v) => setId(Number(v))).catch(() => {});
  }, []);
  return [id, setId];
}

function useSubmit(onClose) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (fn, label) => {
    setBusy(true);
    setError(null);
    try {
      await app.run(fn, { label });
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

export function CloneDialog({ r, onClose }) {
  const nodes = useNodes();
  const [newid, setNewid] = useNextId();
  const [f, setF] = useState({ name: (r.name || '') + '-clone', target: r.node, full: !r.template, storage: '', description: '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const storages = useStorages(f.target, r.type === 'qemu' ? 'images' : 'rootdir');
  const { busy, error, submit } = useSubmit(onClose);
  const go = () => {
    const params = { newid, target: f.target !== r.node ? f.target : undefined, full: f.full ? 1 : 0, storage: f.full && f.storage ? f.storage : undefined, description: f.description || undefined };
    if (r.type === 'qemu') params.name = f.name;
    else params.hostname = f.name;
    submit(() => api.post(P`/nodes/${r.node}/${r.type}/${r.vmid}/clone`, params), `Clone ${r.vmid} → ${newid}`);
  };
  return (
    <Modal
      title={`Clone ${r.type === 'qemu' ? 'VM' : 'CT'} ${r.vmid}`}
      icon={Copy}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={go} disabled={!newid}>
            Clone
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="form-row">
          <Field label="New ID">
            <NumberInput value={newid} onChange={setNewid} />
          </Field>
          <Field label={r.type === 'qemu' ? 'Name' : 'Hostname'}>
            <Input value={f.name} onChange={set('name')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Target node">
            <Select value={f.target} onChange={set('target')} options={nodes.map((n) => n.node)} />
          </Field>
          <Field label="Mode">
            <Select value={f.full ? 'full' : 'linked'} onChange={(v) => set('full')(v === 'full')} options={[['full', 'Full clone'], ['linked', 'Linked clone'].concat(r.template ? [] : [])]} disabled={!r.template} />
          </Field>
        </div>
        {f.full && (
          <Field label="Target storage">
            <Select value={f.storage} onChange={set('storage')} options={storageOptions(storages, 'Same as source')} />
          </Field>
        )}
        <Field label="Description">
          <Textarea value={f.description} onChange={set('description')} style={{ minHeight: 60 }} />
        </Field>
        {!r.template && <div className="info-box">Linked clones are only available for templates.</div>}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

export function MigrateDialog({ r, onClose }) {
  const nodes = useNodes().filter((n) => n.node !== r.node && n.status === 'online');
  const [f, setF] = useState({ target: nodes[0]?.node || '', online: r.status === 'running', local: false, storage: '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const { data: pre } = useApi(r.type === 'qemu' ? P`/nodes/${r.node}/qemu/${r.vmid}/migrate` : null, f.target ? { target: f.target } : undefined, { enabled: r.type === 'qemu' && !!f.target });
  const { busy, error, submit } = useSubmit(onClose);
  const go = () => {
    const params = { target: f.target };
    if (r.type === 'qemu') {
      if (f.online) params.online = 1;
      if (f.local) params['with-local-disks'] = 1;
      if (f.storage) params.targetstorage = f.storage;
    } else if (f.online) params.restart = 1;
    submit(() => api.post(P`/nodes/${r.node}/${r.type}/${r.vmid}/migrate`, params), `Migrate ${r.vmid} → ${f.target}`);
  };
  return (
    <Modal
      title={`Migrate ${r.type === 'qemu' ? 'VM' : 'CT'} ${r.vmid}`}
      icon={MoveRight}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={go} disabled={!f.target}>
            Migrate
          </Button>
        </>
      }
    >
      <div className="form">
        {nodes.length === 0 && <div className="warn-box">No other online nodes are available. Migration requires a cluster.</div>}
        <div className="form-row">
          <Field label="Source node">
            <Input value={r.node} disabled />
          </Field>
          <Field label="Target node">
            <Select value={f.target} onChange={set('target')} options={nodes.map((n) => n.node)} />
          </Field>
        </div>
        <Checkbox checked={f.online} onChange={set('online')} label={r.type === 'qemu' ? 'Online (live) migration' : 'Restart mode (stop, migrate, start)'} />
        {r.type === 'qemu' && <Checkbox checked={f.local} onChange={set('local')} label="Migrate with local disks" />}
        {pre?.local_disks?.length > 0 && (
          <div className="warn-box">Local disks: {pre.local_disks.map((d) => d.volid).join(', ')}</div>
        )}
        {pre?.local_resources?.length > 0 && <div className="warn-box">Local resources prevent migration: {pre.local_resources.join(', ')}</div>}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

export function BackupNowDialog({ r, onClose }) {
  const storages = useStorages(r.node, 'backup');
  const [f, setF] = useState({ storage: '', mode: 'snapshot', compress: 'zstd', notes: '{{guestname}}', protected: false, remove: true });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const { busy, error, submit } = useSubmit(onClose);
  useEffect(() => {
    if (!f.storage && storages[0]) set('storage')(storages[0].storage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storages.length]);
  const go = () =>
    submit(
      () =>
        api.post(P`/nodes/${r.node}/vzdump`, {
          vmid: r.vmid,
          storage: f.storage,
          mode: f.mode,
          compress: f.compress === '0' ? 0 : f.compress,
          'notes-template': f.notes || undefined,
          protected: f.protected ? 1 : undefined,
          remove: f.remove ? 1 : 0,
        }),
      `Backup ${r.vmid}`
    );
  return (
    <Modal
      title={`Backup ${r.type === 'qemu' ? 'VM' : 'CT'} ${r.vmid}`}
      icon={Archive}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={go} disabled={!f.storage}>
            Backup now
          </Button>
        </>
      }
    >
      <div className="form">
        <Field label="Storage">
          <Select value={f.storage} onChange={set('storage')} options={storageOptions(storages)} />
        </Field>
        <div className="form-row">
          <Field label="Mode">
            <Select value={f.mode} onChange={set('mode')} options={[['snapshot', 'Snapshot'], ['suspend', 'Suspend'], ['stop', 'Stop']]} />
          </Field>
          <Field label="Compression">
            <Select value={f.compress} onChange={set('compress')} options={[['zstd', 'ZSTD (fast and good)'], ['lzo', 'LZO (fast)'], ['gzip', 'GZIP (good)'], ['0', 'None']]} />
          </Field>
        </div>
        <Field label="Notes" hint="Supports {{cluster}}, {{guestname}}, {{node}}, {{vmid}}">
          <Input value={f.notes} onChange={set('notes')} />
        </Field>
        <Checkbox checked={f.protected} onChange={set('protected')} label="Protected (prevent pruning)" />
        <Checkbox checked={f.remove} onChange={set('remove')} label="Prune older backups according to storage retention" />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
