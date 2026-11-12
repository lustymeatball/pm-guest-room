import React from 'react';
import { api, P } from './api';
import { CloneDialog, MigrateDialog, BackupNowDialog } from '../components/GuestDialogs';

const kind = (r) => (r.type === 'qemu' ? 'VM' : 'CT');

const CONFIRM = {
  stop: { title: 'Stop', msg: 'This immediately stops the guest — like pulling the power plug. Unsaved data may be lost.', danger: true },
  reset: { title: 'Reset', msg: 'This performs a hard reset, like pressing the reset button. Unsaved data may be lost.', danger: true },
  shutdown: { title: 'Shutdown', msg: 'Send an ACPI shutdown request to the guest OS?' },
  reboot: { title: 'Reboot', msg: 'Reboot the guest OS?' },
  hibernate: { title: 'Hibernate', msg: 'Save the VM state to disk and stop it?' },
};

export async function guestPower(app, r, action, { skipConfirm } = {}) {
  const c = CONFIRM[action];
  if (c && !skipConfirm) {
    const ok = await app.confirm({ title: `${c.title} ${kind(r)} ${r.vmid}${r.name ? ` (${r.name})` : ''}`, message: c.msg, confirmLabel: c.title, danger: c.danger });
    if (!ok) return;
  }
  const base = P`/nodes/${r.node}/${r.type}/${r.vmid}/status`;
  const label = `${c?.title || action[0].toUpperCase() + action.slice(1)} ${kind(r)} ${r.vmid}`;
  if (action === 'hibernate') return app.run(() => api.post(base + '/suspend', { todisk: 1 }), { label });
  return app.run(() => api.post(`${base}/${action}`), { label });
}

export function openConsole(app, r, extra = {}) {
  window.pve.openConsoleWindow({ type: r.type, node: r.node, vmid: r.vmid, name: r.name || '', ...extra });
}

export function guestClone(app, r) {
  app.openModal((close) => <CloneDialog r={r} onClose={close} />);
}

export function guestMigrate(app, r) {
  app.openModal((close) => <MigrateDialog r={r} onClose={close} />);
}

export function guestBackup(app, r) {
  app.openModal((close) => <BackupNowDialog r={r} onClose={close} />);
}

export async function guestTemplate(app, r) {
  const ok = await app.confirm({
    title: `Convert ${kind(r)} ${r.vmid} to template`,
    message: 'Templates cannot be started. This cannot be undone, but you can create clones from the template.',
    confirmLabel: 'Convert',
    danger: true,
  });
  if (!ok) return;
  await app.run(() => api.post(P`/nodes/${r.node}/${r.type}/${r.vmid}/template`), { label: `Convert ${r.vmid} to template` });
}

export async function guestDelete(app, r) {
  const res = await app.confirm({
    title: `Destroy ${kind(r)} ${r.vmid}`,
    message: (
      <>
        This permanently deletes <b>{r.name || r.vmid}</b> and all of its disks. This cannot be undone.
      </>
    ),
    confirmLabel: 'Destroy',
    danger: true,
    typeToConfirm: r.vmid,
    checkbox: [
      { key: 'purge', label: 'Purge from job configurations (backup, replication, HA)', default: true },
      { key: 'unref', label: 'Destroy unreferenced disks owned by guest', default: true },
    ],
  });
  if (!res) return;
  const params = { purge: res.purge ? 1 : 0, 'destroy-unreferenced-disks': res.unref ? 1 : 0 };
  if (r.type === 'lxc') params.force = 1;
  await app.run(() => api.del(P`/nodes/${r.node}/${r.type}/${r.vmid}`, params), { label: `Destroy ${kind(r)} ${r.vmid}` });
  app.select({ type: 'node', node: r.node });
}
