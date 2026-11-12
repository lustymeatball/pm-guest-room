// Panels shared by Datacenter / Node / Guest views: firewall, task history, permissions, notes.
import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Shield, RefreshCw, Save } from 'lucide-react';
import { api, P, useApi } from '../lib/api';
import { useApp } from '../context';
import { Button, Table, Modal, Field, Input, Select, Checkbox, Switch, ErrorBox, SectionTitle, Textarea, Card, StatusPill, Loading, Seg } from '../components/ui';
import { TaskTable } from './TaskBar';
import { fmtDate } from '../lib/utils';

// ---------------- Firewall ----------------
const MACROS = ['', 'SSH', 'HTTP', 'HTTPS', 'DNS', 'Ping', 'SMB', 'NFS', 'RDP', 'VNC', 'MySQL', 'PostgreSQL', 'SMTP', 'IMAP', 'IMAPS', 'POP3', 'FTP', 'NTP', 'SNMP', 'Ceph', 'BitTorrent', 'Web', 'DHCPfwd', 'DHCPv6', 'Telnet', 'Syslog', 'OpenVPN'];

export function FirewallPanel({ base, level }) {
  const app = useApp();
  const [tab, setTab] = useState('rules');
  const rules = useApi(base + '/rules');
  const opts = useApi(base + '/options');
  const edit = (rule) =>
    app.openModal((close) => (
      <RuleDialog
        base={base}
        rule={rule}
        onClose={() => {
          close();
          rules.reload();
        }}
      />
    ));
  const del = async (r) => {
    if (!(await app.confirm({ title: 'Delete firewall rule', message: `Delete rule #${r.pos}?`, danger: true, confirmLabel: 'Delete' }))) return;
    await app.run(() => api.del(`${base}/rules/${r.pos}`), { success: 'Rule deleted' });
    rules.reload();
  };
  const toggle = async (r) => {
    await app.run(() => api.put(`${base}/rules/${r.pos}`, { enable: r.enable ? 0 : 1, digest: r.digest }));
    rules.reload();
  };
  const setOpt = async (k, v) => {
    await app.run(() => api.put(`${base}/options`, { [k]: v }), { success: 'Firewall option updated' });
    opts.reload();
  };
  const o = opts.data || {};
  return (
    <div>
      <SectionTitle title="Firewall" desc={level === 'cluster' ? 'Datacenter-wide rules' : level === 'node' ? 'Host rules' : 'Guest rules'}>
        <Seg value={tab} onChange={setTab} options={[['rules', 'Rules'], ['options', 'Options']]} />
      </SectionTitle>
      {tab === 'rules' ? (
        <>
          <div className="row mb">
            <Button icon={Plus} variant="primary" size="sm" onClick={() => edit(null)}>
              Add rule
            </Button>
            <Button icon={RefreshCw} size="sm" onClick={rules.reload}>
              Refresh
            </Button>
            <div className="grow" />
            <span className="muted small">Firewall is {o.enable ? <b className="green">enabled</b> : <b>disabled</b>} at this level</span>
          </div>
          <ErrorBox error={rules.error} />
          <Table
            loading={rules.loading}
            rows={rules.data}
            rowKey={(r) => r.pos}
            onRowDoubleClick={edit}
            empty="No firewall rules"
            columns={[
              { key: 'pos', label: '#', width: 40 },
              { key: 'enable', label: 'On', width: 50, render: (r) => <Switch checked={!!r.enable} onChange={() => toggle(r)} /> },
              { key: 'type', label: 'Direction', render: (r) => <span className="tag">{r.type}</span> },
              { key: 'action', label: 'Action', render: (r) => <span className={r.action === 'ACCEPT' ? 'green' : 'red'}>{r.action}</span> },
              { key: 'macro', label: 'Macro' },
              { key: 'iface', label: 'Iface' },
              { key: 'source', label: 'Source' },
              { key: 'dest', label: 'Destination' },
              { key: 'proto', label: 'Proto' },
              { key: 'dport', label: 'D.Port' },
              { key: 'sport', label: 'S.Port' },
              { key: 'comment', label: 'Comment' },
              {
                key: 'a',
                label: '',
                sort: false,
                className: 'actions',
                render: (r) => (
                  <>
                    <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r)} />
                    <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} />
                  </>
                ),
              },
            ]}
          />
        </>
      ) : (
        <Card>
          {opts.loading ? (
            <Loading />
          ) : (
            <div className="col" style={{ gap: 14 }}>
              <Switch label="Firewall enabled" checked={!!o.enable} onChange={(v) => setOpt('enable', v ? 1 : 0)} />
              {level !== 'cluster' && level !== 'node' && (
                <>
                  <Switch label="DHCP" checked={o.dhcp !== 0} onChange={(v) => setOpt('dhcp', v ? 1 : 0)} />
                  <Switch label="NDP" checked={o.ndp !== 0} onChange={(v) => setOpt('ndp', v ? 1 : 0)} />
                  <Switch label="MAC filter" checked={o.macfilter !== 0} onChange={(v) => setOpt('macfilter', v ? 1 : 0)} />
                  <Switch label="IP filter" checked={!!o.ipfilter} onChange={(v) => setOpt('ipfilter', v ? 1 : 0)} />
                </>
              )}
              {level === 'node' && <Switch label="SMURFS filter" checked={o.nosmurfs !== 0} onChange={(v) => setOpt('nosmurfs', v ? 1 : 0)} />}
              <div className="form-row" style={{ maxWidth: 520 }}>
                {level !== 'node' && (
                  <>
                    <Field label="Input policy">
                      <Select value={o.policy_in || (level === 'cluster' ? 'DROP' : 'DROP')} onChange={(v) => setOpt('policy_in', v)} options={['ACCEPT', 'DROP', 'REJECT']} />
                    </Field>
                    <Field label="Output policy">
                      <Select value={o.policy_out || 'ACCEPT'} onChange={(v) => setOpt('policy_out', v)} options={['ACCEPT', 'DROP', 'REJECT']} />
                    </Field>
                  </>
                )}
                {level !== 'cluster' && (
                  <Field label="Log level (in)">
                    <Select value={o.log_level_in || 'nolog'} onChange={(v) => setOpt('log_level_in', v)} options={['nolog', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']} />
                  </Field>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function RuleDialog({ base, rule, onClose }) {
  const app = useApp();
  const [f, setF] = useState(() => ({
    type: 'in',
    action: 'ACCEPT',
    enable: 1,
    macro: '',
    iface: '',
    source: '',
    dest: '',
    proto: '',
    dport: '',
    sport: '',
    comment: '',
    log: 'nolog',
    ...(rule || {}),
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    setError(null);
    const params = { type: f.type, action: f.action, enable: f.enable ? 1 : 0, log: f.log };
    const del = [];
    for (const k of ['macro', 'iface', 'source', 'dest', 'proto', 'dport', 'sport', 'comment']) {
      if (f[k]) params[k] = f[k];
      else if (rule && rule[k]) del.push(k);
    }
    if (del.length) params.delete = del.join(',');
    try {
      if (rule) await api.put(`${base}/rules/${rule.pos}`, { ...params, digest: rule.digest });
      else await api.post(`${base}/rules`, params);
      app.toast({ kind: 'success', title: rule ? 'Rule updated' : 'Rule added' });
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={rule ? `Edit rule #${rule.pos}` : 'Add firewall rule'}
      icon={Shield}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {rule ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="form-row three">
          <Field label="Direction">
            <Select value={f.type} onChange={set('type')} options={[['in', 'in'], ['out', 'out'], ['group', 'group (security group)']]} />
          </Field>
          <Field label="Action">
            <Select value={f.action} onChange={set('action')} options={['ACCEPT', 'DROP', 'REJECT']} />
          </Field>
          <Field label="Interface">
            <Input value={f.iface} onChange={set('iface')} placeholder="net0" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Source">
            <Input value={f.source} onChange={set('source')} placeholder="any / 10.0.0.0/24" />
          </Field>
          <Field label="Destination">
            <Input value={f.dest} onChange={set('dest')} placeholder="any" />
          </Field>
        </div>
        <div className="form-row three">
          <Field label="Macro">
            <Select value={f.macro} onChange={set('macro')} options={MACROS.map((m) => [m, m || '(none)'])} />
          </Field>
          <Field label="Protocol">
            <Select value={f.proto} onChange={set('proto')} options={[['', 'any'], 'tcp', 'udp', 'icmp', 'icmpv6', 'esp', 'ah', 'gre']} disabled={!!f.macro} />
          </Field>
          <Field label="Log level">
            <Select value={f.log} onChange={set('log')} options={['nolog', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Destination port">
            <Input value={f.dport} onChange={set('dport')} disabled={!!f.macro} placeholder="22, 8000:8100" />
          </Field>
          <Field label="Source port">
            <Input value={f.sport} onChange={set('sport')} disabled={!!f.macro} />
          </Field>
        </div>
        <Field label="Comment">
          <Input value={f.comment} onChange={set('comment')} />
        </Field>
        <Checkbox checked={!!f.enable} onChange={(v) => set('enable')(v ? 1 : 0)} label="Enable rule" />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

// ---------------- Task history ----------------
export function TaskHistory({ node, vmid, typefilter }) {
  const app = useApp();
  const [errors, setErrors] = useState(false);
  const { data, loading, reload } = useApi(node ? P`/nodes/${node}/tasks` : '/cluster/tasks', node ? { limit: 500, vmid, errors: errors ? 1 : undefined, typefilter, source: 'all' } : undefined, { interval: 5000 });
  return (
    <div>
      <SectionTitle title="Task history">
        <Checkbox label="Errors only" checked={errors} onChange={setErrors} />
        <Button size="sm" icon={RefreshCw} onClick={reload}>
          Refresh
        </Button>
      </SectionTitle>
      <TaskTable tasks={data || []} loading={loading} onOpen={(t) => app.showTask(t.upid)} />
    </div>
  );
}

// ---------------- Permissions for a path ----------------
export function PathPermissions({ path }) {
  const app = useApp();
  const { data, loading, reload } = useApi('/access/acl');
  const rows = (data || []).filter((a) => a.path === path);
  const add = () =>
    app.openModal((close) => (
      <AclDialog
        path={path}
        onClose={() => {
          close();
          reload();
        }}
      />
    ));
  const remove = async (a) => {
    if (!(await app.confirm({ title: 'Remove permission', message: `Remove ${a.roleid} for ${a.ugid} on ${a.path}?`, danger: true, confirmLabel: 'Remove' }))) return;
    const params = { path: a.path, roles: a.roleid, delete: 1 };
    if (a.type === 'group') params.groups = a.ugid;
    else if (a.type === 'token') params.tokens = a.ugid;
    else params.users = a.ugid;
    await app.run(() => api.put('/access/acl', params), { success: 'Permission removed' });
    reload();
  };
  return (
    <div>
      <SectionTitle title="Permissions" desc={<code>{path}</code>}>
        <Button size="sm" variant="primary" icon={Plus} onClick={add}>
          Add permission
        </Button>
      </SectionTitle>
      <AclTable rows={rows} loading={loading} onRemove={remove} />
    </div>
  );
}

export function AclTable({ rows, loading, onRemove }) {
  return (
    <Table
      rows={rows}
      loading={loading}
      rowKey={(r) => r.path + r.ugid + r.roleid}
      empty="No permissions"
      columns={[
        { key: 'path', label: 'Path', render: (r) => <code>{r.path}</code> },
        { key: 'type', label: 'Type', render: (r) => <span className="tag">{r.type}</span> },
        { key: 'ugid', label: 'User / Group / Token' },
        { key: 'roleid', label: 'Role' },
        { key: 'propagate', label: 'Propagate', render: (r) => (r.propagate ? 'Yes' : 'No') },
        { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => onRemove(r)} /> },
      ]}
    />
  );
}

export function AclDialog({ path: initialPath, onClose }) {
  const app = useApp();
  const roles = useApi('/access/roles');
  const users = useApi('/access/users');
  const groups = useApi('/access/groups');
  const [f, setF] = useState({ path: initialPath || '/', kind: 'user', who: '', role: 'PVEVMUser', propagate: true });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    try {
      const params = { path: f.path, roles: f.role, propagate: f.propagate ? 1 : 0 };
      params[f.kind === 'user' ? 'users' : f.kind === 'group' ? 'groups' : 'tokens'] = f.who;
      await api.put('/access/acl', params);
      app.toast({ kind: 'success', title: 'Permission added' });
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  const whoOptions = f.kind === 'user' ? (users.data || []).map((u) => u.userid) : f.kind === 'group' ? (groups.data || []).map((g) => g.groupid) : [];
  return (
    <Modal
      title="Add permission"
      icon={Shield}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!f.who}>
            Add
          </Button>
        </>
      }
    >
      <div className="form">
        <Field label="Path" hint="e.g. /, /vms/100, /storage/local, /pool/name, /nodes/pve">
          <Input value={f.path} onChange={set('path')} />
        </Field>
        <div className="form-row">
          <Field label="Type">
            <Select value={f.kind} onChange={(v) => setF((s) => ({ ...s, kind: v, who: '' }))} options={[['user', 'User'], ['group', 'Group'], ['token', 'API token']]} />
          </Field>
          <Field label={f.kind === 'token' ? 'Token ID' : f.kind === 'group' ? 'Group' : 'User'}>
            {f.kind === 'token' ? <Input value={f.who} onChange={set('who')} placeholder="user@pam!token" /> : <Select value={f.who} onChange={set('who')} options={whoOptions} placeholder="Select…" />}
          </Field>
        </div>
        <Field label="Role">
          <Select value={f.role} onChange={set('role')} options={(roles.data || []).map((r) => r.roleid).sort()} />
        </Field>
        <Checkbox label="Propagate to child paths" checked={f.propagate} onChange={set('propagate')} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

// ---------------- Notes (description) editor ----------------
export function NotesCard({ value, onSave, title = 'Notes' }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value || '');
  return (
    <Card
      title={title}
      right={
        editing ? (
          <>
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={Save}
              onClick={async () => {
                await onSave(v);
                setEditing(false);
              }}
            >
              Save
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setV(value || ''); setEditing(true); }}>
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <Textarea value={v} onChange={setV} style={{ minHeight: 140 }} autoFocus />
      ) : value ? (
        <div className="selectable" style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)', lineHeight: 1.55 }}>
          {value}
        </div>
      ) : (
        <div className="faint">No notes. Click edit to add some.</div>
      )}
    </Card>
  );
}

export { fmtDate, StatusPill };
