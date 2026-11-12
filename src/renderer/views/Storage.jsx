import React, { useEffect, useState } from 'react';
import { Database, LayoutDashboard, Disc, Archive, HardDrive, Package, Upload, Download, Trash2, RefreshCw, Undo2, ShieldCheck, FileCode, Lock, Search } from 'lucide-react';
import { useApp } from '../context';
import { api, P, useApi } from '../lib/api';
import { ObjectView } from '../components/ObjectView';
import { Button, Card, Table, StatusPill, Meter, SectionTitle, Modal, Field, Input, Select, Checkbox, ErrorBox, KV, Loading, NumberInput } from '../components/ui';
import { AreaChart, Legend } from '../components/charts';
import { PathPermissions } from './common';
import { fmtBytes, fmtPct, ratio, fmtDate, sortBy } from '../lib/utils';
import { useNextId } from '../components/GuestDialogs';

const CONTENT_LABELS = { images: 'VM Disks', rootdir: 'CT Volumes', iso: 'ISO Images', vztmpl: 'CT Templates', backup: 'Backups', snippets: 'Snippets', import: 'Import' };
const CONTENT_ICONS = { images: HardDrive, rootdir: HardDrive, iso: Disc, vztmpl: Package, backup: Archive, snippets: FileCode, import: Download };

export function StorageView({ node, storage }) {
  const app = useApp();
  const r = app.resources.find((x) => x.type === 'storage' && x.node === node && x.storage === storage) || {};
  const { data: status } = useApi(P`/nodes/${node}/storage/${storage}/status`, null, { interval: 10000 });
  const contents = (status?.content || r.content || '').split(',').filter(Boolean);
  return (
    <ObjectView
      icon={Database}
      title={storage}
      badge={<><span className="tag">{status?.type || r.plugintype}</span><StatusPill status={r.status || (status?.active ? 'available' : 'unknown')} /></>}
      sub={<>on node <b style={{ color: 'var(--text-2)' }}>{node}</b> · {fmtBytes(status?.used)} of {fmtBytes(status?.total)} used{status?.shared ? ' · shared' : ''}</>}
      storageKey="storage"
      nav={[
        {
          items: [
            { id: 'summary', label: 'Summary', icon: LayoutDashboard, render: () => <StorageSummary node={node} storage={storage} status={status} /> },
            ...contents.map((c) => ({ id: c, label: CONTENT_LABELS[c] || c, icon: CONTENT_ICONS[c] || Database, render: () => <StorageContent node={node} storage={storage} content={c} /> })),
            { id: 'perm', label: 'Permissions', icon: ShieldCheck, render: () => <PathPermissions path={`/storage/${storage}`} /> },
          ],
        },
      ]}
    />
  );
}

function StorageSummary({ node, storage, status }) {
  const [tf, setTf] = useState('day');
  const { data } = useApi(P`/nodes/${node}/storage/${storage}/rrddata`, { timeframe: tf, cf: 'AVERAGE' });
  const s = status || {};
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid cols-2">
        <Card title="Usage" icon={HardDrive}>
          <div className="stat" style={{ marginBottom: 14 }}>
            <div className="v">{fmtPct(ratio(s.used, s.total))}<small>{fmtBytes(s.used)} of {fmtBytes(s.total)}</small></div>
            <Meter value={ratio(s.used, s.total)} />
          </div>
          <KV items={[['Available', fmtBytes(s.avail)], ['Type', s.type], ['Content', (s.content || '').split(',').map((c) => CONTENT_LABELS[c] || c).join(', ')], ['Shared', s.shared ? 'Yes' : 'No'], ['Enabled', s.enabled ? 'Yes' : 'No'], ['Active', s.active ? 'Yes' : 'No']]} />
        </Card>
        <Card title="Usage history" right={<><Legend series={[{ key: 'used', label: 'Used' }]} /><select className="input" style={{ height: 27, width: 100 }} value={tf} onChange={(e) => setTf(e.target.value)}>{['hour', 'day', 'week', 'month', 'year'].map((t) => <option key={t}>{t}</option>)}</select></>}>
          <AreaChart data={(data || []).filter((d) => d.time)} series={[{ key: 'total', label: 'Total', color: '#545d74' }, { key: 'used', label: 'Used' }]} format={(v) => fmtBytes(v, 0)} />
        </Card>
      </div>
    </div>
  );
}

function StorageContent({ node, storage, content }) {
  const app = useApp();
  const { data, loading, reload } = useApi(P`/nodes/${node}/storage/${storage}/content`, { content }, { interval: 15000 });
  const [upload, setUpload] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => window.pve.onUploadProgress((p) => setUpload(p)), []);

  const doUpload = async () => {
    try {
      const res = await window.pve.upload({ node, storage, content });
      setUpload(null);
      if (res.canceled) return;
      if (res.upid) app.trackTask(res.upid, `Upload ${res.name}`);
      else app.toast({ kind: 'success', title: `Uploaded ${res.name}` });
      setTimeout(reload, 1500);
    } catch (e) {
      setUpload(null);
      app.toast({ kind: 'error', title: 'Upload failed', message: e.message });
    }
  };
  const fromUrl = () => app.openModal((c) => <DownloadUrlDialog node={node} storage={storage} content={content} onClose={() => { c(); setTimeout(reload, 2000); }} />);
  const templates = () => app.openModal((c) => <TemplateDialog node={node} storage={storage} onClose={() => { c(); setTimeout(reload, 2000); }} />);
  const del = async (v) => {
    if (!(await app.confirm({ title: 'Delete volume', message: <>Permanently delete <code>{v.volid}</code>?</>, danger: true, confirmLabel: 'Delete' }))) return;
    await app.run(() => api.del(P`/nodes/${node}/storage/${storage}/content/${v.volid}`), { label: 'Delete volume' });
    setTimeout(reload, 1500);
  };
  const restore = (v) => app.openModal((c) => <RestoreDialog node={node} volume={v} onClose={c} />);
  const protect = async (v) => {
    await app.run(() => api.put(P`/nodes/${node}/storage/${storage}/content/${v.volid}`, { protected: v.protected ? 0 : 1 }), { success: 'Updated' });
    reload();
  };

  const rows = sortBy((data || []).filter((v) => !q || v.volid.toLowerCase().includes(q.toLowerCase()) || String(v.notes || '').toLowerCase().includes(q.toLowerCase())), (v) => (content === 'backup' ? -v.ctime : v.volid));
  const canUpload = ['iso', 'vztmpl', 'import'].includes(content);

  return (
    <div>
      <SectionTitle title={CONTENT_LABELS[content] || content} desc={`${rows.length} item${rows.length === 1 ? '' : 's'}`}>
        <div className="search" style={{ width: 200 }}><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" /></div>
        {canUpload && <Button size="sm" variant="primary" icon={Upload} onClick={doUpload} disabled={!!upload}>Upload</Button>}
        {canUpload && <Button size="sm" icon={Download} onClick={fromUrl}>Download from URL</Button>}
        {content === 'vztmpl' && <Button size="sm" icon={Package} onClick={templates}>Templates</Button>}
        <Button size="sm" iconOnly icon={RefreshCw} onClick={reload} />
      </SectionTitle>
      {upload && (
        <Card className="mb">
          <div className="row mb" style={{ marginBottom: 8 }}>
            <Upload size={15} /> Uploading <b>{upload.name}</b>
            <div className="grow" />
            {fmtBytes(upload.sent)} / {fmtBytes(upload.total)} ({fmtPct(ratio(upload.sent, upload.total), 0)})
          </div>
          <Meter value={ratio(upload.sent, upload.total)} />
        </Card>
      )}
      <Table
        loading={loading}
        rows={rows}
        rowKey={(r) => r.volid}
        empty={canUpload ? 'Nothing here yet — upload a file or download one from a URL.' : 'No volumes'}
        columns={[
          { key: 'volid', label: 'Name', render: (r) => <code className="small">{r.volid.split(':').slice(1).join(':')}</code> },
          content === 'backup' && { key: 'ctime', label: 'Date', render: (r) => fmtDate(r.ctime), sort: (r) => r.ctime },
          content === 'backup' && { key: 'notes', label: 'Notes' },
          (content === 'images' || content === 'rootdir' || content === 'backup') && { key: 'vmid', label: 'VMID' },
          { key: 'format', label: 'Format' },
          { key: 'size', label: 'Size', render: (r) => fmtBytes(r.size), sort: (r) => r.size },
          content === 'backup' && { key: 'protected', label: '', render: (r) => (r.protected ? <Lock size={13} className="amber" /> : '') },
          {
            key: 'a', label: '', sort: false, className: 'actions',
            render: (r) => (
              <>
                {content === 'backup' && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => restore(r)}>Restore</Button>}
                {content === 'backup' && <Button size="sm" variant="ghost" iconOnly icon={Lock} title="Toggle protection" onClick={() => protect(r)} />}
                <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} disabled={!!r.protected} />
              </>
            ),
          },
        ].filter(Boolean)}
      />
    </div>
  );
}

function DownloadUrlDialog({ node, storage, content, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ url: '', filename: '', checksum: '', algo: 'sha256', verify: true });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const query = async () => {
    try {
      const meta = await api.get(P`/nodes/${node}/query-url-metadata`, { url: f.url, 'verify-certificates': f.verify ? 1 : 0 });
      if (meta.filename) set('filename')(meta.filename);
    } catch (e) {
      setError(e);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const res = await api.post(P`/nodes/${node}/storage/${storage}/download-url`, {
        url: f.url,
        filename: f.filename,
        content,
        checksum: f.checksum || undefined,
        'checksum-algorithm': f.checksum ? f.algo : undefined,
        'verify-certificates': f.verify ? 1 : 0,
      });
      app.trackTask(res, `Download ${f.filename}`);
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title="Download from URL" icon={Download} onClose={onClose} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={!f.url || !f.filename}>Download</Button></>}>
      <div className="form">
        <Field label="URL">
          <div className="row">
            <Input value={f.url} onChange={set('url')} placeholder="https://releases.ubuntu.com/…/ubuntu.iso" autoFocus />
            <Button onClick={query} disabled={!f.url}>Query URL</Button>
          </div>
        </Field>
        <Field label="File name"><Input value={f.filename} onChange={set('filename')} /></Field>
        <div className="form-row" style={{ gridTemplateColumns: '140px 1fr' }}>
          <Field label="Hash algorithm"><Select value={f.algo} onChange={set('algo')} options={['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512']} /></Field>
          <Field label="Checksum (optional)"><Input value={f.checksum} onChange={set('checksum')} /></Field>
        </div>
        <Checkbox label="Verify certificates" checked={f.verify} onChange={set('verify')} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

function TemplateDialog({ node, storage, onClose }) {
  const app = useApp();
  const { data, loading } = useApi(P`/nodes/${node}/aplinfo`);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const rows = (data || []).filter((t) => !q || (t.package + t.headline + t.os).toLowerCase().includes(q.toLowerCase()));
  const dl = async () => {
    await app.run(() => api.post(P`/nodes/${node}/aplinfo`, { storage, template: sel.template }), { label: `Download ${sel.template}` });
    onClose();
  };
  return (
    <Modal title="Container templates" icon={Package} onClose={onClose} width={900} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={dl} disabled={!sel} icon={Download}>Download</Button></>}>
      <div className="search mb"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates (debian, ubuntu, alpine…)" autoFocus /></div>
      <Table
        loading={loading}
        rows={rows}
        maxHeight={440}
        rowKey={(r) => r.template}
        selectedKey={sel?.template}
        onRowClick={setSel}
        onRowDoubleClick={(r) => { setSel(r); }}
        columns={[
          { key: 'section', label: 'Type', render: (r) => <span className="tag">{r.section}</span> },
          { key: 'package', label: 'Package', render: (r) => <b>{r.package}</b> },
          { key: 'version', label: 'Version' },
          { key: 'os', label: 'OS' },
          { key: 'headline', label: 'Description', render: (r) => <span className="muted">{r.headline}</span> },
        ]}
      />
    </Modal>
  );
}

export function RestoreDialog({ node, volume, onClose }) {
  const app = useApp();
  const isCT = /vzdump-lxc|\.tar/.test(volume.volid) && !/vzdump-qemu/.test(volume.volid);
  const [newid, setNewid] = useNextId();
  const [f, setF] = useState({ storage: '', unique: false, start: false, useOrig: true });
  const { data: storages } = useApi(P`/nodes/${node}/storage`, { content: isCT ? 'rootdir' : 'images', enabled: 1 });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (volume.vmid) setNewid(Number(volume.vmid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume.vmid]);
  const exists = app.resources.some((r) => r.vmid === Number(newid));
  const save = async () => {
    try {
      const params = isCT
        ? { vmid: newid, ostemplate: volume.volid, restore: 1, storage: f.storage || undefined, unique: f.unique ? 1 : undefined, start: f.start ? 1 : 0, force: exists ? 1 : undefined }
        : { vmid: newid, archive: volume.volid, storage: f.storage || undefined, unique: f.unique ? 1 : undefined, start: f.start ? 1 : 0, force: exists ? 1 : undefined };
      const res = await api.post(P`/nodes/${node}/${isCT ? 'lxc' : 'qemu'}`, params);
      app.trackTask(res, `Restore ${newid}`);
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Modal title="Restore backup" icon={Undo2} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={exists ? 'danger-solid' : 'primary'} onClick={save}>{exists ? 'Overwrite & restore' : 'Restore'}</Button></>}>
      <div className="form">
        <KV items={[['Source', <code key="v">{volume.volid}</code>], ['Type', isCT ? 'Container' : 'Virtual machine']]} />
        <div className="form-row">
          <Field label="Target VMID"><NumberInput value={newid} onChange={setNewid} /></Field>
          <Field label="Storage"><Select value={f.storage} onChange={set('storage')} options={[['', 'From backup configuration'], ...(storages || []).map((s) => s.storage)]} /></Field>
        </div>
        {exists && <div className="warn-box">A guest with ID {newid} already exists and will be overwritten.</div>}
        <Checkbox label="Unique (generate new MAC addresses)" checked={f.unique} onChange={set('unique')} />
        <Checkbox label="Start after restore" checked={f.start} onChange={set('start')} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
