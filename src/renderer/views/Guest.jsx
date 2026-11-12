import React, { useEffect, useState } from 'react';
import {
  Monitor, Box, LayoutDashboard, TerminalSquare, Cpu, MemoryStick, HardDrive, Disc, Network, Settings2, ListChecks, Archive, Camera,
  Flame, ShieldCheck, Play, Power, Square, RotateCcw, Pause, Moon, Copy, MoveRight, FileStack, Trash2, ExternalLink, Plus, Pencil,
  Maximize2, Undo2, Usb, Cable, CircuitBoard, MonitorSmartphone, Gauge, ArrowUp, ArrowDown, Cloud, Globe, Terminal, RefreshCw,
  HardDriveDownload, Layers, Send, Lock, Tag, ChevronDown, Clock, Activity,
} from 'lucide-react';
import { useApp } from '../context';
import { api, P, useApi } from '../lib/api';
import { ObjectView } from '../components/ObjectView';
import { Button, Card, Table, StatusPill, Meter, SectionTitle, Modal, Field, Input, Select, Checkbox, ErrorBox, Textarea, KV, Loading, MenuButton, MenuItem, NumberInput, Menu } from '../components/ui';
import { RrdCharts } from '../components/charts';
import { ConsolePanel } from '../components/Console';
import { FirewallPanel, TaskHistory, PathPermissions, NotesCard } from './common';
import { OptionEditDialog } from './Datacenter';
import { useStorages, storageOptions, useNodes } from '../components/GuestDialogs';
import { guestPower, guestClone, guestMigrate, guestBackup, guestTemplate, guestDelete, openConsole } from '../lib/actions';
import { fmtBytes, fmtPct, fmtDuration, ratio, parseProp, buildProp, fmtDate, osLabel, OS_TYPES, NIC_MODELS, SCSI_HW, CPU_TYPES, DISPLAY_TYPES, sortBy, parseSize } from '../lib/utils';

export function GuestView({ type, node, vmid }) {
  const app = useApp();
  const res = app.resources.find((r) => r.type === type && r.vmid === vmid);
  const realNode = res?.node || node;
  const r = res || { type, node, vmid, status: 'unknown' };
  const base = P`/nodes/${realNode}/${type}/${vmid}`;
  const cfg = useApi(base + '/config', null, { interval: 10000 });
  const config = cfg.data || {};
  const isVM = type === 'qemu';
  const running = r.status === 'running';
  const paused = r.status === 'paused' || r.lock === 'suspended';
  const tpl = !!r.template;
  const guest = { ...r, node: realNode };
  const hasSerial = Object.keys(config).some((k) => /^serial\d/.test(k));
  const hasCloudInit = isVM && Object.values(config).some((v) => typeof v === 'string' && v.includes('cloudinit'));
  const tags = (r.tags || config.tags || '').split(/[;, ]/).filter(Boolean);

  const ctx = { guest, base, config, reloadConfig: cfg.reload, isVM };

  return (
    <ObjectView
      icon={tpl ? FileStack : isVM ? Monitor : Box}
      title={`${r.name || config.name || config.hostname || (isVM ? 'VM' : 'CT')}`}
      badge={
        <>
          <span className="tag">{vmid}</span>
          {tpl ? <span className="tag template-badge">template</span> : <StatusPill status={paused ? 'paused' : r.status} />}
          {r.lock && <span className="tag" title="Locked"><Lock size={10} style={{ marginRight: 4 }} />{r.lock}</span>}
        </>
      }
      sub={
        <>
          <span>{isVM ? 'Virtual machine' : 'LXC container'} on <b style={{ color: 'var(--text-2)' }}>{realNode}</b></span>
          {running && <span>Uptime {fmtDuration(r.uptime)}</span>}
          {tags.map((t) => <span key={t} className="tag"><Tag size={10} style={{ marginRight: 4 }} />{t}</span>)}
        </>
      }
      storageKey={type}
      actions={<GuestActions guest={guest} running={running} paused={paused} tpl={tpl} isVM={isVM} />}
      nav={[
        {
          items: [
            { id: 'summary', label: 'Summary', icon: LayoutDashboard, render: () => <GuestSummary {...ctx} /> },
            {
              id: 'console',
              label: 'Console',
              icon: TerminalSquare,
              flush: true,
              hidden: tpl,
              render: () => <ConsolePanel target={{ type, node: realNode, vmid }} status={paused ? 'running' : r.status} hasSerial={hasSerial} onStart={() => guestPower(app, guest, 'start')} />,
            },
            isVM
              ? { id: 'hardware', label: 'Hardware', icon: CircuitBoard, render: () => <VmHardware {...ctx} /> }
              : { id: 'resources', label: 'Resources', icon: Cpu, render: () => <CtResources {...ctx} /> },
            { id: 'cloudinit', label: 'Cloud-Init', icon: Cloud, hidden: !hasCloudInit, render: () => <VmCloudInit {...ctx} /> },
            { id: 'network', label: 'Network', icon: Network, hidden: isVM, render: () => <CtNetwork {...ctx} /> },
            { id: 'dns', label: 'DNS', icon: Globe, hidden: isVM, render: () => <CtDns {...ctx} /> },
            { id: 'options', label: 'Options', icon: Settings2, render: () => <GuestOptions {...ctx} /> },
            { id: 'tasks', label: 'Task history', icon: ListChecks, render: () => <TaskHistory node={realNode} vmid={vmid} /> },
            { id: 'monitor', label: 'Monitor', icon: Terminal, hidden: !isVM, render: () => <VmMonitor {...ctx} /> },
          ],
        },
        {
          group: 'Data protection',
          items: [
            { id: 'backup', label: 'Backup', icon: Archive, render: () => <GuestBackups {...ctx} /> },
            { id: 'snapshots', label: 'Snapshots', icon: Camera, render: () => <GuestSnapshots {...ctx} /> },
          ],
        },
        {
          group: 'Security',
          items: [
            { id: 'firewall', label: 'Firewall', icon: Flame, render: () => <FirewallPanel base={base + '/firewall'} level="guest" /> },
            { id: 'permissions', label: 'Permissions', icon: ShieldCheck, render: () => <PathPermissions path={`/vms/${vmid}`} /> },
          ],
        },
      ]}
    />
  );
}

function GuestActions({ guest, running, paused, tpl, isVM }) {
  const app = useApp();
  const p = (a) => guestPower(app, guest, a);
  if (tpl)
    return (
      <>
        <Button icon={Copy} variant="primary" onClick={() => guestClone(app, guest)}>Clone</Button>
        <MenuButton label="More">
          <MenuItem icon={MoveRight} onClick={() => guestMigrate(app, guest)}>Migrate</MenuItem>
          <MenuItem icon={Archive} onClick={() => guestBackup(app, guest)}>Backup now</MenuItem>
          <hr />
          <MenuItem icon={Trash2} danger onClick={() => guestDelete(app, guest)}>Remove</MenuItem>
        </MenuButton>
      </>
    );
  return (
    <>
      {paused ? (
        <Button icon={Play} variant="primary" onClick={() => p('resume')}>Resume</Button>
      ) : !running ? (
        <Button icon={Play} variant="primary" onClick={() => p('start')}>Start</Button>
      ) : (
        <div className="btn-group">
          <Button icon={Power} onClick={() => p('shutdown')}>Shutdown</Button>
          <Menu
            trigger={({ toggle }) => <Button iconOnly icon={ChevronDown} onClick={toggle} />}
          >
            <MenuItem icon={RotateCcw} onClick={() => p('reboot')}>Reboot</MenuItem>
            {isVM && <MenuItem icon={Pause} onClick={() => p('suspend')}>Pause</MenuItem>}
            {isVM && <MenuItem icon={Moon} onClick={() => p('hibernate')}>Hibernate</MenuItem>}
            {!isVM && <MenuItem icon={Pause} onClick={() => p('suspend')}>Suspend (freeze)</MenuItem>}
            <hr />
            <MenuItem icon={Square} danger onClick={() => p('stop')}>Stop (force)</MenuItem>
            {isVM && <MenuItem icon={RotateCcw} danger onClick={() => p('reset')}>Reset (hard)</MenuItem>}
          </Menu>
        </div>
      )}
      {(running || paused) && !running && <Button icon={Square} variant="danger" onClick={() => p('stop')}>Stop</Button>}
      <Button icon={ExternalLink} onClick={() => openConsole(app, guest)} disabled={!running}>Console</Button>
      <MenuButton label="More">
        <MenuItem icon={Copy} onClick={() => guestClone(app, guest)}>Clone</MenuItem>
        <MenuItem icon={MoveRight} onClick={() => guestMigrate(app, guest)}>Migrate</MenuItem>
        <MenuItem icon={Archive} onClick={() => guestBackup(app, guest)}>Backup now</MenuItem>
        <MenuItem icon={FileStack} onClick={() => guestTemplate(app, guest)} disabled={running}>Convert to template</MenuItem>
        <hr />
        <MenuItem icon={Trash2} danger onClick={() => guestDelete(app, guest)} disabled={running}>Remove</MenuItem>
      </MenuButton>
    </>
  );
}

// ---------------- Summary ----------------
function GuestSummary({ guest, base, config, reloadConfig, isVM }) {
  const app = useApp();
  const { data: st } = useApi(base + '/status/current', null, { interval: 1000 });
  const s = st || {};
  const running = s.status === 'running';
  const { pushLive } = app;
  useEffect(() => {
    if (st && running) pushLive(`${guest.type}/${guest.vmid}`, { cpu: st.cpu, mem: st.mem, maxmem: st.maxmem, uptime: st.uptime });
  }, [st, running, pushLive, guest.type, guest.vmid]);
  const agentOn = isVM && running && parseProp(config.agent, 'enabled').enabled === '1';
  const { data: ifaces } = useApi(base + '/agent/network-get-interfaces', null, { enabled: agentOn, interval: 30000 });
  const { data: ctIfaces } = useApi(base + '/interfaces', null, { enabled: !isVM && running, interval: 30000 });
  const ips = isVM
    ? (ifaces?.result || []).filter((i) => i.name !== 'lo' && !i.name.startsWith('lo')).flatMap((i) => (i['ip-addresses'] || []).filter((a) => !a['ip-address'].startsWith('fe80')).map((a) => `${a['ip-address']} (${i.name})`))
    : (ctIfaces || []).filter((i) => i.name !== 'lo').flatMap((i) => [i.inet, i.inet6].filter(Boolean).filter((a) => !a.startsWith('fe80')).map((a) => `${a} (${i.name})`));
  const bootdisk = isVM ? null : { used: s.disk, total: s.maxdisk };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid cols-4">
        <Card>
          <div className="stat">
            <div className="k"><Cpu size={14} /> CPU</div>
            <div className="v">{running ? fmtPct(s.cpu) : '—'}<small>of {s.cpus} vCPU</small></div>
            <Meter value={s.cpu} />
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><MemoryStick size={14} /> Memory</div>
            <div className="v">{running ? fmtBytes(s.mem) : '—'}<small>/ {fmtBytes(s.maxmem)}</small></div>
            <Meter value={running ? ratio(s.mem, s.maxmem) : 0} />
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><HardDrive size={14} /> {isVM ? 'Boot disk size' : 'Root disk'}</div>
            <div className="v">{isVM ? fmtBytes(s.maxdisk) : <>{fmtBytes(bootdisk.used)}<small>/ {fmtBytes(bootdisk.total)}</small></>}</div>
            {!isVM && <Meter value={ratio(bootdisk.used, bootdisk.total)} />}
            {isVM && <div className="muted small">Disk read {fmtBytes(s.diskread)} · write {fmtBytes(s.diskwrite)}</div>}
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="k"><Clock size={14} /> Uptime</div>
            <div className="v">{running ? fmtDuration(s.uptime) : '—'}</div>
            <div className="muted small">Net in {fmtBytes(s.netin)} · out {fmtBytes(s.netout)}</div>
          </div>
        </Card>
      </div>
      <div className="grid cols-2">
        <Card title="Status" icon={Activity}>
          <KV
            items={[
              ['Status', <StatusPill key="s" status={s.qmpstatus === 'paused' ? 'paused' : s.status}>{s.qmpstatus || s.status}</StatusPill>],
              ['Node', guest.node],
              ['HA state', s.ha?.managed ? `${s.ha.state} (${s.ha.group || 'no group'})` : 'none'],
              isVM ? ['OS type', osLabel(config.ostype)] : ['OS type', config.ostype],
              isVM ? ['QEMU guest agent', parseProp(config.agent, 'enabled').enabled === '1' ? (ifaces ? 'running' : running ? 'enabled (not responding?)' : 'enabled') : 'disabled'] : ['Unprivileged', config.unprivileged ? 'Yes' : 'No'],
              ['IP addresses', ips.length ? <div key="ip" className="col" style={{ gap: 2 }}>{ips.map((i) => <code key={i}>{i}</code>)}</div> : running ? <span className="faint">{isVM ? 'Install the guest agent to see IPs' : 'none'}</span> : '—'],
              isVM && ['Running machine', s['running-machine']],
              isVM && ['QEMU version', s['running-qemu']],
            ]}
          />
        </Card>
        <NotesCard
          value={config.description}
          onSave={async (v) => {
            await app.run(() => api.put(base + '/config', v ? { description: v } : { delete: 'description' }), { success: 'Notes saved' });
            reloadConfig();
          }}
        />
      </div>
      <RrdCharts path={base + '/rrddata'} kind={guest.type} />
    </div>
  );
}

// ---------------- Config helper ----------------
async function setConfig(app, ctx, params, label) {
  const { base, isVM, reloadConfig } = ctx;
  await app.run(() => (isVM ? api.post(base + '/config', params) : api.put(base + '/config', params)), { label: label || 'Update configuration', success: label ? `${label} saved` : 'Configuration saved' });
  setTimeout(reloadConfig, 400);
}

// ---------------- VM Hardware ----------------
const HW_ORDER = ['memory', 'balloon', 'sockets', 'cores', 'cpu', 'bios', 'vga', 'machine', 'scsihw', 'efidisk0', 'tpmstate0'];

function hwInfo(key) {
  if (key === 'memory') return [MemoryStick, 'Memory'];
  if (key === 'cores' || key === 'sockets' || key === 'cpu') return [Cpu, 'Processors'];
  if (key === 'bios') return [CircuitBoard, 'BIOS'];
  if (key === 'vga') return [MonitorSmartphone, 'Display'];
  if (key === 'machine') return [CircuitBoard, 'Machine'];
  if (key === 'scsihw') return [HardDrive, 'SCSI controller'];
  if (/^net\d/.test(key)) return [Network, `Network device (${key})`];
  if (/^(ide|sata|scsi|virtio)\d/.test(key)) return [HardDrive, `Hard disk (${key})`];
  if (/^unused\d/.test(key)) return [HardDrive, `Unused disk ${key.slice(6)}`];
  if (/^efidisk/.test(key)) return [HardDrive, 'EFI disk'];
  if (/^tpmstate/.test(key)) return [Lock, 'TPM state'];
  if (/^usb\d/.test(key)) return [Usb, `USB device (${key})`];
  if (/^hostpci\d/.test(key)) return [CircuitBoard, `PCI device (${key})`];
  if (/^serial\d/.test(key)) return [Cable, `Serial port (${key})`];
  if (/^parallel\d/.test(key)) return [Cable, `Parallel port (${key})`];
  if (key === 'audio0') return [Gauge, 'Audio device'];
  if (key === 'rng0') return [Gauge, 'VirtIO RNG'];
  return [Settings2, key];
}

const isDiskKey = (k) => /^(ide|sata|scsi|virtio)\d+$/.test(k);
const isHwKey = (k) => HW_ORDER.includes(k) || /^(net|ide|sata|scsi|virtio|unused|usb|hostpci|serial|parallel)\d+$/.test(k) || ['audio0', 'rng0'].includes(k);

function VmHardware(ctx) {
  const app = useApp();
  const { base, guest } = ctx;
  const { data, loading, reload } = useApi(base + '/pending', null, { interval: 8000 });
  const items = (data || []).filter((i) => isHwKey(i.key));
  const map = Object.fromEntries((data || []).map((i) => [i.key, i]));
  const val = (k) => map[k]?.pending ?? map[k]?.value;
  const reloadAll = () => {
    reload();
    ctx.reloadConfig();
  };
  const ctx2 = { ...ctx, reloadConfig: reloadAll };

  // Collapse cpu-related keys into one row
  const rows = [];
  rows.push({ key: 'memory', label: 'Memory', icon: MemoryStick, value: `${fmtBytes(Number(val('memory') || 512) * 1024 * 1024, 0)}${val('balloon') !== undefined ? (Number(val('balloon')) === 0 ? ' [ballooning off]' : ` [min ${fmtBytes(Number(val('balloon')) * 1024 * 1024, 0)}]`) : ''}`, pending: map.memory?.pending !== undefined || map.balloon?.pending !== undefined, edit: 'memory' });
  rows.push({ key: 'cpu', label: 'Processors', icon: Cpu, value: `${Number(val('sockets') || 1) * Number(val('cores') || 1)} (${val('sockets') || 1} sockets, ${val('cores') || 1} cores) [${val('cpu') || 'kvm64'}]${val('numa') == 1 ? ' [numa]' : ''}`, pending: ['sockets', 'cores', 'cpu'].some((k) => map[k]?.pending !== undefined), edit: 'cpu' });
  rows.push({ key: 'bios', label: 'BIOS', icon: CircuitBoard, value: val('bios') === 'ovmf' ? 'OVMF (UEFI)' : 'SeaBIOS', edit: 'bios' });
  rows.push({ key: 'vga', label: 'Display', icon: MonitorSmartphone, value: val('vga') || 'Default', edit: 'vga' });
  rows.push({ key: 'machine', label: 'Machine', icon: CircuitBoard, value: val('machine') || 'Default (i440fx)', edit: 'machine' });
  rows.push({ key: 'scsihw', label: 'SCSI controller', icon: HardDrive, value: (SCSI_HW.find((s) => s[0] === val('scsihw')) || [0, val('scsihw') || 'LSI 53C895A'])[1], edit: 'scsihw' });
  const rest = sortBy(items.filter((i) => !['memory', 'balloon', 'sockets', 'cores', 'cpu', 'bios', 'vga', 'machine', 'scsihw', 'numa'].includes(i.key)), (i) => {
    const order = ['efidisk', 'tpmstate', 'ide', 'sata', 'scsi', 'virtio', 'unused', 'net', 'usb', 'hostpci', 'serial', 'parallel', 'audio', 'rng'];
    const pre = i.key.replace(/\d+$/, '');
    return String(order.indexOf(pre)).padStart(2, '0') + i.key.padStart(12, '0');
  });
  for (const i of rest) {
    const [icon, label] = hwInfo(i.key);
    const v = i.pending ?? i.value;
    const isCd = typeof v === 'string' && v.includes('media=cdrom');
    rows.push({ key: i.key, label: isCd ? `CD/DVD drive (${i.key})` : label, icon: isCd ? Disc : icon, value: v, pending: i.pending !== undefined, deleted: i.delete, edit: i.key, isCd });
  }

  const openEdit = (row) => {
    const k = row.edit;
    if (k === 'memory') return app.openModal((c) => <MemoryDialog ctx={ctx2} val={val} onClose={c} />);
    if (k === 'cpu') return app.openModal((c) => <CpuDialog ctx={ctx2} val={val} onClose={c} />);
    if (k === 'bios') return app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={['bios', 'BIOS', 'select', [['seabios', 'SeaBIOS'], ['ovmf', 'OVMF (UEFI)']]]} value={val('bios') || 'seabios'} onClose={() => { c(); reloadAll(); }} />);
    if (k === 'vga') return app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={['vga', 'Display', 'select', DISPLAY_TYPES]} value={(val('vga') || '').split(',')[0]} onClose={() => { c(); reloadAll(); }} />);
    if (k === 'machine') return app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={['machine', 'Machine', 'select', [['', 'Default (i440fx)'], ['q35', 'q35'], ['pc', 'i440fx (pc)']]]} value={val('machine') || ''} onClose={() => { c(); reloadAll(); }} />);
    if (k === 'scsihw') return app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={['scsihw', 'SCSI controller', 'select', SCSI_HW]} value={val('scsihw') || 'lsi'} onClose={() => { c(); reloadAll(); }} />);
    if (/^net\d/.test(k)) return app.openModal((c) => <VmNetDialog ctx={ctx2} netKey={k} value={row.value} onClose={c} />);
    if (row.isCd) return app.openModal((c) => <CdDialog ctx={ctx2} diskKey={k} value={row.value} onClose={c} />);
    if (/^unused\d/.test(k)) return app.openModal((c) => <AttachUnusedDialog ctx={ctx2} unusedKey={k} value={row.value} onClose={c} />);
    return app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={[k, row.label, 'text']} value={row.value} onClose={() => { c(); reloadAll(); }} />);
  };

  const remove = async (row) => {
    const unused = /^unused\d/.test(row.key);
    const disk = isDiskKey(row.key) && !row.isCd;
    const ok = await app.confirm({
      title: `${disk ? 'Detach' : 'Remove'} ${row.label}`,
      message: unused ? 'This permanently destroys the disk image.' : disk ? 'The disk will be detached and appear as an "Unused disk". You can then remove it to delete the data.' : `Remove ${row.key} from the VM configuration?`,
      danger: true,
      confirmLabel: disk ? 'Detach' : 'Remove',
    });
    if (!ok) return;
    await setConfig(app, ctx2, { delete: row.key }, `Remove ${row.key}`);
  };

  const resize = (row) => app.openModal((c) => <ResizeDialog ctx={ctx2} diskKey={row.key} value={row.value} onClose={c} />);
  const move = (row) => app.openModal((c) => <MoveDiskDialog ctx={ctx2} diskKey={row.key} onClose={c} />);
  const revert = async (row) => {
    const keys = row.key === 'cpu' ? 'sockets,cores,cpu' : row.key === 'memory' ? 'memory,balloon' : row.key;
    await app.run(() => api.put(base + '/config', { revert: keys }), { success: 'Pending change reverted' });
    reloadAll();
  };

  const add = (what) => app.openModal((c) => {
    if (what === 'disk') return <AddDiskDialog ctx={ctx2} keys={Object.keys(map)} onClose={c} />;
    if (what === 'cd') return <CdDialog ctx={ctx2} keys={Object.keys(map)} onClose={c} />;
    if (what === 'net') return <VmNetDialog ctx={ctx2} keys={Object.keys(map)} onClose={c} />;
    return <RawAddDialog ctx={ctx2} kind={what} keys={Object.keys(map)} onClose={c} />;
  });

  return (
    <div>
      <SectionTitle title="Hardware" desc={rows.some((r) => r.pending) ? 'Orange values are pending and apply after the next VM restart.' : null}>
        <MenuButton label="Add" icon={Plus} variant="primary" size="sm">
          <MenuItem icon={HardDrive} onClick={() => add('disk')}>Hard disk</MenuItem>
          <MenuItem icon={Disc} onClick={() => add('cd')}>CD/DVD drive</MenuItem>
          <MenuItem icon={Network} onClick={() => add('net')}>Network device</MenuItem>
          <hr />
          <MenuItem icon={Usb} onClick={() => add('usb')}>USB device</MenuItem>
          <MenuItem icon={CircuitBoard} onClick={() => add('hostpci')}>PCI device</MenuItem>
          <MenuItem icon={Cable} onClick={() => add('serial')}>Serial port</MenuItem>
          <MenuItem icon={Cloud} onClick={() => add('cloudinit')}>Cloud-Init drive</MenuItem>
          <MenuItem icon={HardDrive} onClick={() => add('efidisk')}>EFI disk</MenuItem>
          <MenuItem icon={Lock} onClick={() => add('tpmstate')}>TPM state</MenuItem>
          <MenuItem icon={Gauge} onClick={() => add('audio0')}>Audio device</MenuItem>
          <MenuItem icon={Gauge} onClick={() => add('rng0')}>VirtIO RNG</MenuItem>
        </MenuButton>
        <Button size="sm" icon={RefreshCw} onClick={reloadAll}>Refresh</Button>
      </SectionTitle>
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <tbody>
              {rows.map((row) => {
                const disk = isDiskKey(row.key) && !row.isCd;
                const I = row.icon;
                return (
                  <tr key={row.key} className="clickable" onDoubleClick={() => openEdit(row)}>
                    <td style={{ width: 290 }}>
                      <div className="row" style={{ gap: 11 }}>
                        <span className="hw-icon"><I size={15} /></span>
                        <b style={{ fontWeight: 550 }}>{row.label}</b>
                      </div>
                    </td>
                    <td>
                      <code className={row.deleted ? 'strike' : row.pending ? 'pending-val' : ''} style={{ wordBreak: 'break-all' }}>{row.value}</code>
                    </td>
                    <td className="actions">
                      {row.pending && <Button size="sm" variant="ghost" iconOnly icon={Undo2} title="Revert pending change" onClick={() => revert(row)} />}
                      {disk && <Button size="sm" variant="ghost" icon={Maximize2} onClick={() => resize(row)}>Resize</Button>}
                      {(disk || /^unused/.test(row.key)) && <Button size="sm" variant="ghost" icon={HardDriveDownload} onClick={() => move(row)}>Move</Button>}
                      <Button size="sm" variant="ghost" iconOnly icon={Pencil} title="Edit" onClick={() => openEdit(row)} />
                      {!['memory', 'cpu', 'bios', 'vga', 'machine', 'scsihw'].includes(row.key) && <Button size="sm" variant="ghost" iconOnly icon={Trash2} title="Remove" onClick={() => remove(row)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DialogShell({ title, icon, onClose, onSave, children, saveLabel = 'Save', width, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave();
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={title} icon={icon} onClose={onClose} width={width} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={disabled}>{saveLabel}</Button></>}>
      <div className="form">
        {children}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

// Submits config changes without the app.run toast-on-error (dialog shows it instead)
async function submitConfig(app, ctx, params, label) {
  const res = ctx.isVM ? await api.post(ctx.base + '/config', params) : await api.put(ctx.base + '/config', params);
  if (typeof res === 'string' && res.startsWith('UPID:')) app.trackTask(res, label);
  else app.toast({ kind: 'success', title: `${label} saved` });
  setTimeout(ctx.reloadConfig, 500);
  app.refresh();
}

function MemoryDialog({ ctx, val, onClose }) {
  const app = useApp();
  const [mem, setMem] = useState(Number(val('memory') || 2048));
  const [balloonOn, setBalloonOn] = useState(Number(val('balloon')) !== 0);
  const [min, setMin] = useState(val('balloon') ? Number(val('balloon')) : Number(val('memory') || 2048));
  return (
    <DialogShell title="Memory" icon={MemoryStick} onClose={onClose} onSave={() => submitConfig(app, ctx, { memory: mem, balloon: balloonOn ? (min === mem ? undefined : min) : 0, delete: balloonOn && min === mem ? 'balloon' : undefined }, 'Memory')}>
      <Field label="Memory (MiB)" hint={fmtBytes(mem * 1024 * 1024)}>
        <NumberInput value={mem} onChange={setMem} step={512} min={16} />
      </Field>
      <div className="row wrap">
        {[1024, 2048, 4096, 8192, 16384, 32768].map((m) => <Button key={m} size="sm" onClick={() => setMem(m)}>{m / 1024} GiB</Button>)}
      </div>
      <Checkbox label="Ballooning device" checked={balloonOn} onChange={setBalloonOn} />
      {balloonOn && <Field label="Minimum memory (MiB)"><NumberInput value={min} onChange={setMin} step={512} /></Field>}
    </DialogShell>
  );
}

function CpuDialog({ ctx, val, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ sockets: Number(val('sockets') || 1), cores: Number(val('cores') || 1), cpu: (val('cpu') || 'kvm64').split(',')[0], numa: val('numa') == 1, cpulimit: val('cpulimit') || '', cpuunits: val('cpuunits') || '', vcpus: val('vcpus') || '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = () => {
    const del = [];
    const p = { sockets: f.sockets, cores: f.cores, cpu: f.cpu, numa: f.numa ? 1 : 0 };
    for (const k of ['cpulimit', 'cpuunits', 'vcpus']) {
      if (f[k] !== '' && f[k] !== 0) p[k] = f[k];
      else if (val(k) !== undefined) del.push(k);
    }
    if (del.length) p.delete = del.join(',');
    return submitConfig(app, ctx, p, 'Processors');
  };
  return (
    <DialogShell title="Processors" icon={Cpu} onClose={onClose} onSave={save}>
      <div className="form-row three">
        <Field label="Sockets"><NumberInput value={f.sockets} onChange={set('sockets')} min={1} /></Field>
        <Field label="Cores"><NumberInput value={f.cores} onChange={set('cores')} min={1} /></Field>
        <Field label="Total"><Input value={f.sockets * f.cores} disabled /></Field>
      </div>
      <Field label="CPU type" hint="'host' gives best performance but prevents live migration between different CPUs">
        <Select value={f.cpu} onChange={set('cpu')} options={[...new Set([...CPU_TYPES, f.cpu])]} />
      </Field>
      <div className="form-row three">
        <Field label="vCPUs (hotplug)"><Input value={f.vcpus} onChange={set('vcpus')} placeholder={String(f.sockets * f.cores)} /></Field>
        <Field label="CPU limit"><Input value={f.cpulimit} onChange={set('cpulimit')} placeholder="unlimited" /></Field>
        <Field label="CPU units"><Input value={f.cpuunits} onChange={set('cpuunits')} placeholder="100" /></Field>
      </div>
      <Checkbox label="Enable NUMA" checked={f.numa} onChange={set('numa')} />
    </DialogShell>
  );
}

function nextFree(keys, prefix, max) {
  for (let i = 0; i <= max; i++) if (!keys.includes(prefix + i)) return prefix + i;
  return prefix + '0';
}

function AddDiskDialog({ ctx, keys, onClose }) {
  const app = useApp();
  const storages = useStorages(ctx.guest.node, 'images');
  const [f, setF] = useState({ bus: 'scsi', storage: '', size: 32, format: 'raw', cache: '', discard: true, ssd: true, iothread: true, backup: true });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!f.storage && storages[0]) set('storage')(storages[0].storage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storages.length]);
  const max = { scsi: 30, virtio: 15, sata: 5, ide: 3 }[f.bus];
  const key = nextFree(keys, f.bus, max);
  const st = storages.find((s) => s.storage === f.storage);
  const fileBased = st && ['dir', 'nfs', 'cifs', 'glusterfs', 'btrfs'].includes(st.type);
  const save = () => {
    const opts = { [`${f.storage}:${f.size}`]: undefined };
    const parts = [`${f.storage}:${f.size}`];
    if (fileBased) parts.push(`format=${f.format}`);
    if (f.cache) parts.push(`cache=${f.cache}`);
    if (f.discard) parts.push('discard=on');
    if (f.ssd && f.bus !== 'virtio') parts.push('ssd=1');
    if (f.iothread && (f.bus === 'virtio' || f.bus === 'scsi')) parts.push('iothread=1');
    if (!f.backup) parts.push('backup=0');
    void opts;
    return submitConfig(app, ctx, { [key]: parts.join(',') }, `Add disk ${key}`);
  };
  return (
    <DialogShell title="Add hard disk" icon={HardDrive} onClose={onClose} onSave={save} saveLabel="Add" disabled={!f.storage}>
      <div className="form-row three">
        <Field label="Bus / device"><Select value={f.bus} onChange={set('bus')} options={[['scsi', 'SCSI'], ['virtio', 'VirtIO Block'], ['sata', 'SATA'], ['ide', 'IDE']]} /></Field>
        <Field label="Slot"><Input value={key} disabled /></Field>
        <Field label="Size (GiB)"><NumberInput value={f.size} onChange={set('size')} min={1} /></Field>
      </div>
      <Field label="Storage"><Select value={f.storage} onChange={set('storage')} options={storageOptions(storages)} /></Field>
      <div className="form-row">
        {fileBased && <Field label="Format"><Select value={f.format} onChange={set('format')} options={[['raw', 'Raw'], ['qcow2', 'QEMU image (qcow2)'], ['vmdk', 'VMware (vmdk)']]} /></Field>}
        <Field label="Cache"><Select value={f.cache} onChange={set('cache')} options={[['', 'Default (no cache)'], ['directsync', 'Direct sync'], ['writethrough', 'Write through'], ['writeback', 'Write back'], ['unsafe', 'Write back (unsafe)'], ['none', 'No cache']]} /></Field>
      </div>
      <div className="row wrap" style={{ gap: 18 }}>
        <Checkbox label="Discard" checked={f.discard} onChange={set('discard')} />
        {f.bus !== 'virtio' && <Checkbox label="SSD emulation" checked={f.ssd} onChange={set('ssd')} />}
        {(f.bus === 'scsi' || f.bus === 'virtio') && <Checkbox label="IO thread" checked={f.iothread} onChange={set('iothread')} />}
        <Checkbox label="Include in backups" checked={f.backup} onChange={set('backup')} />
      </div>
    </DialogShell>
  );
}

function useIsoList(node) {
  const storages = useStorages(node, 'iso');
  const [isos, setIsos] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all(storages.map((s) => api.get(P`/nodes/${node}/storage/${s.storage}/content`, { content: 'iso' }).catch(() => [])))
      .then((lists) => alive && setIsos(lists.flat()))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, storages.map((s) => s.storage).join()]);
  return isos;
}

function CdDialog({ ctx, diskKey, value, keys, onClose }) {
  const app = useApp();
  const isos = useIsoList(ctx.guest.node);
  const current = value ? value.split(',')[0] : '';
  const [bus, setBus] = useState('ide');
  const [mode, setMode] = useState(current === 'none' ? 'none' : current === 'cdrom' ? 'physical' : 'iso');
  const [iso, setIso] = useState(current && current !== 'none' && current !== 'cdrom' ? current : '');
  const key = diskKey || nextFree(keys || [], bus, bus === 'ide' ? 3 : bus === 'sata' ? 5 : 30);
  const save = () => submitConfig(app, ctx, { [key]: `${mode === 'none' ? 'none' : mode === 'physical' ? 'cdrom' : iso},media=cdrom` }, `CD/DVD ${key}`);
  return (
    <DialogShell title={diskKey ? `CD/DVD drive (${diskKey})` : 'Add CD/DVD drive'} icon={Disc} onClose={onClose} onSave={save} disabled={mode === 'iso' && !iso}>
      {!diskKey && (
        <div className="form-row">
          <Field label="Bus"><Select value={bus} onChange={setBus} options={[['ide', 'IDE'], ['sata', 'SATA'], ['scsi', 'SCSI']]} /></Field>
          <Field label="Slot"><Input value={key} disabled /></Field>
        </div>
      )}
      <Field label="Media">
        <Select value={mode} onChange={setMode} options={[['iso', 'Use ISO image'], ['physical', 'Use physical drive'], ['none', 'No media (eject)']]} />
      </Field>
      {mode === 'iso' && (
        <Field label="ISO image">
          <Select value={iso} onChange={setIso} placeholder="Select an ISO…" options={sortBy(isos, (i) => i.volid).map((i) => [i.volid, `${i.volid} (${fmtBytes(i.size)})`])} />
        </Field>
      )}
      {mode === 'iso' && !isos.length && <div className="info-box">No ISO images found. Upload one from a storage's "ISO Images" tab.</div>}
    </DialogShell>
  );
}

function VmNetDialog({ ctx, netKey, value, keys, onClose }) {
  const app = useApp();
  const p = parseProp(value || '');
  const model = NIC_MODELS.map((m) => m[0]).find((m) => p[m] !== undefined) || 'virtio';
  const [f, setF] = useState({ model, mac: p[model] || '', bridge: p.bridge || 'vmbr0', tag: p.tag || '', firewall: value ? p.firewall === '1' : true, rate: p.rate || '', mtu: p.mtu || '', queues: p.queues || '', link_down: p.link_down === '1' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const { data: nets } = useApi(P`/nodes/${ctx.guest.node}/network`, { type: 'any_bridge' });
  const key = netKey || nextFree(keys || [], 'net', 31);
  const save = () => {
    const spec = buildProp({ [f.model]: f.mac || undefined, bridge: f.bridge, tag: f.tag, firewall: f.firewall ? 1 : 0, rate: f.rate, mtu: f.mtu, queues: f.queues, link_down: f.link_down ? 1 : undefined });
    const final = f.mac ? spec : `${f.model},${spec}`;
    return submitConfig(app, ctx, { [key]: final }, `Network ${key}`);
  };
  return (
    <DialogShell title={netKey ? `Network device (${netKey})` : 'Add network device'} icon={Network} onClose={onClose} onSave={save} width={600}>
      <div className="form-row">
        <Field label="Bridge"><Select value={f.bridge} onChange={set('bridge')} options={[...new Set([...(nets || []).map((n) => n.iface), f.bridge])].sort()} /></Field>
        <Field label="Model"><Select value={f.model} onChange={set('model')} options={NIC_MODELS} /></Field>
      </div>
      <div className="form-row">
        <Field label="VLAN tag"><Input value={f.tag} onChange={set('tag')} placeholder="no VLAN" /></Field>
        <Field label="MAC address"><Input value={f.mac} onChange={set('mac')} placeholder="auto" /></Field>
      </div>
      <div className="form-row three">
        <Field label="Rate limit (MB/s)"><Input value={f.rate} onChange={set('rate')} placeholder="unlimited" /></Field>
        <Field label="MTU"><Input value={f.mtu} onChange={set('mtu')} placeholder="bridge" /></Field>
        <Field label="Multiqueue"><Input value={f.queues} onChange={set('queues')} /></Field>
      </div>
      <div className="row" style={{ gap: 20 }}>
        <Checkbox label="Firewall" checked={f.firewall} onChange={set('firewall')} />
        <Checkbox label="Disconnect" checked={f.link_down} onChange={set('link_down')} />
      </div>
    </DialogShell>
  );
}

function ResizeDialog({ ctx, diskKey, value, onClose }) {
  const app = useApp();
  const [inc, setInc] = useState(8);
  const cur = parseProp(value).size;
  const save = async () => {
    const res = await api.put(ctx.base + '/resize', { disk: diskKey, size: `+${inc}G` });
    if (typeof res === 'string' && res.startsWith('UPID:')) app.trackTask(res, `Resize ${diskKey}`);
    else app.toast({ kind: 'success', title: `${diskKey} resized` });
    setTimeout(ctx.reloadConfig, 800);
  };
  return (
    <DialogShell title={`Resize ${diskKey}`} icon={Maximize2} onClose={onClose} onSave={save} saveLabel="Resize">
      <KV items={[['Current size', cur || '—'], ['New size', cur ? fmtBytes(parseSize(cur) + inc * 1024 ** 3) : `+${inc}G`]]} />
      <Field label="Size increment (GiB)" hint="Disks can only grow. Extend the partition/filesystem inside the guest afterwards.">
        <NumberInput value={inc} onChange={setInc} min={1} />
      </Field>
    </DialogShell>
  );
}

function MoveDiskDialog({ ctx, diskKey, onClose }) {
  const app = useApp();
  const storages = useStorages(ctx.guest.node, ctx.isVM ? 'images' : 'rootdir');
  const [storage, setStorage] = useState('');
  const [del, setDel] = useState(true);
  const [format, setFormat] = useState('');
  const save = async () => {
    const res = ctx.isVM
      ? await api.post(ctx.base + '/move_disk', { disk: diskKey, storage, delete: del ? 1 : 0, format: format || undefined })
      : await api.post(ctx.base + '/move_volume', { volume: diskKey, storage, delete: del ? 1 : 0 });
    app.trackTask(res, `Move ${diskKey} → ${storage}`);
  };
  return (
    <DialogShell title={`Move ${diskKey}`} icon={HardDriveDownload} onClose={onClose} onSave={save} saveLabel="Move" disabled={!storage}>
      <Field label="Target storage"><Select value={storage} onChange={setStorage} placeholder="Select…" options={storageOptions(storages)} /></Field>
      {ctx.isVM && <Field label="Format"><Select value={format} onChange={setFormat} options={[['', 'Keep / default'], ['raw', 'raw'], ['qcow2', 'qcow2'], ['vmdk', 'vmdk']]} /></Field>}
      <Checkbox label="Delete source after move" checked={del} onChange={setDel} />
    </DialogShell>
  );
}

function AttachUnusedDialog({ ctx, unusedKey, value, keys, onClose }) {
  const app = useApp();
  const [bus, setBus] = useState('scsi');
  const all = Object.keys(ctx.config);
  const key = nextFree(all, bus, bus === 'scsi' ? 30 : bus === 'virtio' ? 15 : bus === 'sata' ? 5 : 3);
  void keys;
  return (
    <DialogShell title={`Attach ${unusedKey}`} icon={HardDrive} onClose={onClose} saveLabel="Attach" onSave={() => submitConfig(app, ctx, { [key]: value }, `Attach ${key}`)}>
      <Field label="Disk image"><Input value={value} disabled /></Field>
      <div className="form-row">
        <Field label="Bus"><Select value={bus} onChange={setBus} options={[['scsi', 'SCSI'], ['virtio', 'VirtIO Block'], ['sata', 'SATA'], ['ide', 'IDE']]} /></Field>
        <Field label="Slot"><Input value={key} disabled /></Field>
      </div>
    </DialogShell>
  );
}

function RawAddDialog({ ctx, kind, keys, onClose }) {
  const app = useApp();
  const storages = useStorages(ctx.guest.node, 'images');
  const defs = {
    usb: { key: nextFree(keys, 'usb', 13), label: 'USB device', hint: 'host=1234:5678 (vendor:product), host=1-2 (port), or spice', value: 'host=' },
    hostpci: { key: nextFree(keys, 'hostpci', 15), label: 'PCI device', hint: 'e.g. 0000:01:00,pcie=1,x-vga=1 (requires q35 for pcie)', value: '' },
    serial: { key: nextFree(keys, 'serial', 3), label: 'Serial port', hint: '"socket" enables an xterm.js serial console', value: 'socket' },
    cloudinit: { key: nextFree(keys, 'ide', 3), label: 'Cloud-Init drive', hint: 'Storage for the cloud-init image', value: '', storage: true, build: (s) => `${s}:cloudinit` },
    efidisk: { key: 'efidisk0', label: 'EFI disk', hint: 'Requires OVMF BIOS', value: '', storage: true, build: (s) => `${s}:1,efitype=4m,pre-enrolled-keys=1` },
    tpmstate: { key: 'tpmstate0', label: 'TPM state', hint: 'TPM v2.0 (needed for Windows 11)', value: '', storage: true, build: (s) => `${s}:1,version=v2.0` },
    audio0: { key: 'audio0', label: 'Audio device', hint: 'device=ich9-intel-hda|intel-hda|AC97,driver=spice|none', value: 'device=ich9-intel-hda,driver=spice' },
    rng0: { key: 'rng0', label: 'VirtIO RNG', hint: 'source=/dev/urandom|/dev/random|/dev/hwrng', value: 'source=/dev/urandom' },
  }[kind];
  const [v, setV] = useState(defs.value);
  const [st, setSt] = useState('');
  const save = () => submitConfig(app, ctx, { [defs.key]: defs.storage ? defs.build(st) : v }, `Add ${defs.label}`);
  return (
    <DialogShell title={`Add ${defs.label}`} icon={Plus} onClose={onClose} onSave={save} saveLabel="Add" disabled={defs.storage ? !st : !v}>
      <Field label="Slot"><Input value={defs.key} disabled /></Field>
      {defs.storage ? (
        <Field label="Storage" hint={defs.hint}><Select value={st} onChange={setSt} placeholder="Select…" options={storageOptions(storages)} /></Field>
      ) : (
        <Field label="Value" hint={defs.hint}><Input value={v} onChange={setV} /></Field>
      )}
    </DialogShell>
  );
}

// ---------------- Cloud-Init ----------------
function VmCloudInit(ctx) {
  const app = useApp();
  const { config, base } = ctx;
  const fields = [
    ['ciuser', 'User', 'text'],
    ['cipassword', 'Password', 'text'],
    ['sshkeys', 'SSH public keys', 'textarea'],
    ['citype', 'Type', 'select', [['', 'Default'], 'nocloud', 'configdrive2', 'opennebula']],
    ['ciupgrade', 'Upgrade packages', 'bool'],
    ['searchdomain', 'DNS domain', 'text'],
    ['nameserver', 'DNS servers', 'text'],
    ...[0, 1, 2, 3].filter((i) => config[`net${i}`]).map((i) => [`ipconfig${i}`, `IP config (net${i})`, 'text']),
  ];
  const edit = (opt) =>
    app.openModal((c) => (
      <OptionEditDialog
        path={base + '/config'}
        opt={opt}
        value={opt[0] === 'sshkeys' ? decodeURIComponent(config.sshkeys || '') : opt[0] === 'cipassword' ? '' : config[opt[0]]}
        onClose={() => {
          c();
          ctx.reloadConfig();
        }}
      />
    ));
  const regen = async () => {
    await app.run(() => api.put(base + '/cloudinit'), { success: 'Cloud-init image regenerated' });
  };
  return (
    <div>
      <SectionTitle title="Cloud-Init" desc="Applied on next boot">
        <Button size="sm" icon={RefreshCw} onClick={regen}>Regenerate image</Button>
      </SectionTitle>
      <div className="info-box mb">To set SSH keys, paste them one per line; they will be URL-encoded automatically.</div>
      <Table
        rows={fields.map((f) => ({ key: f[0], f, value: f[0] === 'cipassword' ? (config.cipassword ? '••••••••' : '') : f[0] === 'sshkeys' ? decodeURIComponent(config.sshkeys || '') : config[f[0]] }))}
        rowKey={(r) => r.key}
        onRowDoubleClick={(r) => edit(r.f)}
        columns={[
          { key: 'label', label: 'Option', render: (r) => r.f[1], width: 220 },
          { key: 'value', label: 'Value', render: (r) => (r.value === undefined || r.value === '' ? <span className="faint">Default</span> : <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{String(r.value)}</code>) },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r.f)} /> },
        ]}
      />
    </div>
  );
}

// ---------------- LXC Resources / Network / DNS ----------------
function CtResources(ctx) {
  const app = useApp();
  const { config, base } = ctx;
  const mps = Object.keys(config).filter((k) => /^mp\d+$/.test(k) || /^unused\d+$/.test(k)).sort();
  const edit = (opt) => app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={opt} value={config[opt[0]]} onClose={() => { c(); ctx.reloadConfig(); }} />);
  const rows = [
    { key: 'memory', label: 'Memory', icon: MemoryStick, value: fmtBytes((config.memory || 512) * 1024 * 1024, 0), opt: ['memory', 'Memory (MiB)', 'text'] },
    { key: 'swap', label: 'Swap', icon: Layers, value: fmtBytes((config.swap ?? 512) * 1024 * 1024, 0), opt: ['swap', 'Swap (MiB)', 'text'] },
    { key: 'cores', label: 'Cores', icon: Cpu, value: config.cores || 'unlimited', opt: ['cores', 'Cores', 'text'] },
    { key: 'cpulimit', label: 'CPU limit', icon: Cpu, value: config.cpulimit || 'unlimited', opt: ['cpulimit', 'CPU limit', 'text'] },
    { key: 'cpuunits', label: 'CPU units', icon: Cpu, value: config.cpuunits || '100', opt: ['cpuunits', 'CPU units', 'text'] },
    { key: 'rootfs', label: 'Root disk', icon: HardDrive, value: config.rootfs, disk: true },
    ...mps.map((k) => ({ key: k, label: k.startsWith('unused') ? `Unused disk ${k.slice(6)}` : `Mount point (${k})`, icon: HardDrive, value: config[k], disk: k.startsWith('mp'), opt: [k, k, 'text'] })),
  ];
  const remove = async (row) => {
    if (!(await app.confirm({ title: `Remove ${row.key}`, message: row.key.startsWith('unused') ? 'This permanently deletes the volume.' : 'The mount point will be detached as an unused disk.', danger: true, confirmLabel: 'Remove' }))) return;
    await setConfig(app, ctx, { delete: row.key }, `Remove ${row.key}`);
  };
  return (
    <div>
      <SectionTitle title="Resources">
        <Button size="sm" variant="primary" icon={Plus} onClick={() => app.openModal((c) => <CtMountDialog ctx={ctx} onClose={c} />)}>Add mount point</Button>
      </SectionTitle>
      <div className="table-wrap">
        <table className="tbl">
          <tbody>
            {rows.map((row) => {
              const I = row.icon;
              return (
                <tr key={row.key} className="clickable" onDoubleClick={() => row.opt && edit(row.opt)}>
                  <td style={{ width: 260 }}><div className="row" style={{ gap: 11 }}><span className="hw-icon"><I size={15} /></span><b style={{ fontWeight: 550 }}>{row.label}</b></div></td>
                  <td><code style={{ wordBreak: 'break-all' }}>{row.value}</code></td>
                  <td className="actions">
                    {row.disk && <Button size="sm" variant="ghost" icon={Maximize2} onClick={() => app.openModal((c) => <ResizeDialog ctx={ctx} diskKey={row.key} value={row.value} onClose={c} />)}>Resize</Button>}
                    {(row.disk || row.key.startsWith('unused')) && <Button size="sm" variant="ghost" icon={HardDriveDownload} onClick={() => app.openModal((c) => <MoveDiskDialog ctx={ctx} diskKey={row.key} onClose={c} />)}>Move</Button>}
                    {row.opt && <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(row.opt)} />}
                    {/^(mp|unused)\d/.test(row.key) && <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => remove(row)} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CtMountDialog({ ctx, onClose }) {
  const app = useApp();
  const storages = useStorages(ctx.guest.node, 'rootdir');
  const key = nextFree(Object.keys(ctx.config), 'mp', 255);
  const [f, setF] = useState({ storage: '', size: 8, mp: '/mnt/data', backup: false });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <DialogShell title="Add mount point" icon={HardDrive} onClose={onClose} saveLabel="Add" disabled={!f.storage || !f.mp} onSave={() => submitConfig(app, ctx, { [key]: `${f.storage}:${f.size},mp=${f.mp}${f.backup ? ',backup=1' : ''}` }, `Add ${key}`)}>
      <div className="form-row">
        <Field label="Slot"><Input value={key} disabled /></Field>
        <Field label="Size (GiB)"><NumberInput value={f.size} onChange={set('size')} /></Field>
      </div>
      <Field label="Storage"><Select value={f.storage} onChange={set('storage')} placeholder="Select…" options={storageOptions(storages)} /></Field>
      <Field label="Path in container"><Input value={f.mp} onChange={set('mp')} /></Field>
      <Checkbox label="Include in backups" checked={f.backup} onChange={set('backup')} />
    </DialogShell>
  );
}

function CtNetwork(ctx) {
  const app = useApp();
  const { config } = ctx;
  const nets = Object.keys(config).filter((k) => /^net\d+$/.test(k)).sort().map((k) => ({ key: k, ...parseProp(config[k]) }));
  const edit = (n) => app.openModal((c) => <CtNetDialog ctx={ctx} net={n} onClose={c} />);
  const del = async (n) => {
    if (!(await app.confirm({ title: `Remove ${n.key}`, message: `Remove network interface ${n.name}?`, danger: true, confirmLabel: 'Remove' }))) return;
    await setConfig(app, ctx, { delete: n.key }, `Remove ${n.key}`);
  };
  return (
    <div>
      <SectionTitle title="Network">
        <Button size="sm" variant="primary" icon={Plus} onClick={() => edit(null)}>Add</Button>
      </SectionTitle>
      <Table
        rows={nets}
        rowKey={(r) => r.key}
        onRowDoubleClick={edit}
        empty="No network interfaces"
        columns={[
          { key: 'key', label: 'ID' },
          { key: 'name', label: 'Name' },
          { key: 'bridge', label: 'Bridge' },
          { key: 'hwaddr', label: 'MAC', render: (r) => <code>{r.hwaddr}</code> },
          { key: 'ip', label: 'IPv4' },
          { key: 'gw', label: 'Gateway' },
          { key: 'ip6', label: 'IPv6' },
          { key: 'tag', label: 'VLAN' },
          { key: 'firewall', label: 'Firewall', render: (r) => (r.firewall === '1' ? 'Yes' : 'No') },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <><Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r)} /><Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} /></> },
        ]}
      />
    </div>
  );
}

function CtNetDialog({ ctx, net, onClose }) {
  const app = useApp();
  const key = net?.key || nextFree(Object.keys(ctx.config), 'net', 31);
  const [f, setF] = useState({ name: net?.name || `eth${key.slice(3)}`, bridge: net?.bridge || 'vmbr0', hwaddr: net?.hwaddr || '', ipmode: !net?.ip ? 'none' : net.ip === 'dhcp' ? 'dhcp' : 'static', ip: net?.ip && net.ip !== 'dhcp' ? net.ip : '', gw: net?.gw || '', ip6mode: !net?.ip6 ? 'none' : ['dhcp', 'auto'].includes(net.ip6) ? net.ip6 : 'static', ip6: net?.ip6 && !['dhcp', 'auto'].includes(net.ip6) ? net.ip6 : '', gw6: net?.gw6 || '', tag: net?.tag || '', firewall: net ? net.firewall === '1' : true, rate: net?.rate || '', mtu: net?.mtu || '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const { data: bridges } = useApi(P`/nodes/${ctx.guest.node}/network`, { type: 'any_bridge' });
  const save = () => {
    const spec = buildProp({
      name: f.name,
      bridge: f.bridge,
      hwaddr: f.hwaddr,
      ip: f.ipmode === 'dhcp' ? 'dhcp' : f.ipmode === 'static' ? f.ip : undefined,
      gw: f.ipmode === 'static' ? f.gw : undefined,
      ip6: f.ip6mode === 'static' ? f.ip6 : f.ip6mode === 'none' ? undefined : f.ip6mode,
      gw6: f.ip6mode === 'static' ? f.gw6 : undefined,
      tag: f.tag,
      firewall: f.firewall ? 1 : 0,
      rate: f.rate,
      mtu: f.mtu,
      type: 'veth',
    }, ['name', 'bridge', 'hwaddr', 'ip', 'gw', 'ip6', 'gw6']);
    return submitConfig(app, ctx, { [key]: spec }, `Network ${key}`);
  };
  return (
    <DialogShell title={net ? `Edit ${key}` : 'Add network interface'} icon={Network} onClose={onClose} onSave={save} width={620}>
      <div className="form-row three">
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Bridge"><Select value={f.bridge} onChange={set('bridge')} options={[...new Set([...(bridges || []).map((b) => b.iface), f.bridge])].sort()} /></Field>
        <Field label="VLAN tag"><Input value={f.tag} onChange={set('tag')} /></Field>
      </div>
      <div className="form-row three">
        <Field label="IPv4"><Select value={f.ipmode} onChange={set('ipmode')} options={[['none', 'None'], ['dhcp', 'DHCP'], ['static', 'Static']]} /></Field>
        <Field label="IPv4/CIDR"><Input value={f.ip} onChange={set('ip')} disabled={f.ipmode !== 'static'} placeholder="192.168.1.50/24" /></Field>
        <Field label="Gateway"><Input value={f.gw} onChange={set('gw')} disabled={f.ipmode !== 'static'} /></Field>
      </div>
      <div className="form-row three">
        <Field label="IPv6"><Select value={f.ip6mode} onChange={set('ip6mode')} options={[['none', 'None'], ['dhcp', 'DHCP'], ['auto', 'SLAAC'], ['static', 'Static']]} /></Field>
        <Field label="IPv6/CIDR"><Input value={f.ip6} onChange={set('ip6')} disabled={f.ip6mode !== 'static'} /></Field>
        <Field label="Gateway (IPv6)"><Input value={f.gw6} onChange={set('gw6')} disabled={f.ip6mode !== 'static'} /></Field>
      </div>
      <div className="form-row three">
        <Field label="MAC address"><Input value={f.hwaddr} onChange={set('hwaddr')} placeholder="auto" /></Field>
        <Field label="Rate limit (MB/s)"><Input value={f.rate} onChange={set('rate')} /></Field>
        <Field label="MTU"><Input value={f.mtu} onChange={set('mtu')} /></Field>
      </div>
      <Checkbox label="Firewall" checked={f.firewall} onChange={set('firewall')} />
    </DialogShell>
  );
}

function CtDns(ctx) {
  const app = useApp();
  const { config, base } = ctx;
  const opts = [
    ['hostname', 'Hostname', 'text'],
    ['searchdomain', 'DNS domain', 'text'],
    ['nameserver', 'DNS servers', 'text'],
  ];
  const edit = (opt) => app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={opt} value={config[opt[0]]} onClose={() => { c(); ctx.reloadConfig(); }} />);
  return (
    <div>
      <SectionTitle title="DNS" />
      <Table
        rows={opts.map((o) => ({ key: o[0], o, value: config[o[0]] }))}
        rowKey={(r) => r.key}
        onRowDoubleClick={(r) => edit(r.o)}
        columns={[
          { key: 'label', label: 'Option', render: (r) => r.o[1], width: 220 },
          { key: 'value', label: 'Value', render: (r) => r.value || <span className="faint">use host settings</span> },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r.o)} /> },
        ]}
      />
    </div>
  );
}

// ---------------- Options ----------------
const VM_OPTIONS = [
  ['name', 'Name', 'text'],
  ['onboot', 'Start at boot', 'bool'],
  ['startup', 'Start/Shutdown order', 'text'],
  ['ostype', 'OS type', 'select', OS_TYPES],
  ['boot', 'Boot order', 'boot'],
  ['tablet', 'Use tablet for pointer', 'bool'],
  ['hotplug', 'Hotplug', 'text'],
  ['acpi', 'ACPI support', 'bool'],
  ['kvm', 'KVM hardware virtualization', 'bool'],
  ['freeze', 'Freeze CPU at startup', 'bool'],
  ['localtime', 'Use local time for RTC', 'bool'],
  ['rtc', 'RTC start date', 'text'],
  ['smbios1', 'SMBIOS settings (type1)', 'text'],
  ['agent', 'QEMU Guest Agent', 'select', [['', 'Disabled (default)'], ['1', 'Enabled'], ['enabled=1,fstrim_cloned_disks=1', 'Enabled + fstrim on clone/move']]],
  ['protection', 'Protection', 'bool'],
  ['spice_enhancements', 'Spice enhancements', 'text'],
  ['vmstatestorage', 'VM state storage', 'text'],
  ['hookscript', 'Hookscript', 'text'],
  ['tags', 'Tags', 'text'],
];
const CT_OPTIONS = [
  ['onboot', 'Start at boot', 'bool'],
  ['startup', 'Start/Shutdown order', 'text'],
  ['ostype', 'OS type', 'select', ['debian', 'ubuntu', 'centos', 'fedora', 'opensuse', 'archlinux', 'alpine', 'gentoo', 'nixos', 'devuan', 'unmanaged']],
  ['arch', 'Architecture', 'select', ['amd64', 'i386', 'arm64', 'armhf', 'riscv32', 'riscv64']],
  ['console', '/dev/console', 'bool'],
  ['tty', 'TTY count', 'text'],
  ['cmode', 'Console mode', 'select', [['tty', 'tty'], ['console', 'console'], ['shell', 'shell']]],
  ['protection', 'Protection', 'bool'],
  ['unprivileged', 'Unprivileged container', 'readonly'],
  ['features', 'Features', 'text'],
  ['hookscript', 'Hookscript', 'text'],
  ['tags', 'Tags', 'text'],
];

function GuestOptions(ctx) {
  const app = useApp();
  const { config, base, isVM } = ctx;
  const opts = isVM ? VM_OPTIONS : CT_OPTIONS;
  const edit = (opt) => {
    if (opt[2] === 'readonly') return;
    if (opt[2] === 'boot') return app.openModal((c) => <BootOrderDialog ctx={ctx} onClose={c} />);
    app.openModal((c) => <OptionEditDialog path={base + '/config'} opt={opt} value={config[opt[0]]} onClose={() => { c(); ctx.reloadConfig(); }} />);
  };
  const display = (o) => {
    const v = config[o[0]];
    if (v === undefined || v === '') return <span className="faint">Default</span>;
    if (o[2] === 'bool' || o[2] === 'readonly') return v == 1 ? 'Yes' : 'No';
    if (o[0] === 'ostype' && isVM) return osLabel(v);
    if (o[0] === 'tags') return <div className="chip-list">{String(v).split(/[;, ]/).filter(Boolean).map((t) => <span key={t} className="tag">{t}</span>)}</div>;
    return <code>{String(v)}</code>;
  };
  return (
    <div>
      <SectionTitle title="Options" desc="Double-click to edit" />
      <Table
        rows={opts.map((o) => ({ key: o[0], o }))}
        rowKey={(r) => r.key}
        onRowDoubleClick={(r) => edit(r.o)}
        columns={[
          { key: 'label', label: 'Option', render: (r) => r.o[1], width: 260 },
          { key: 'value', label: 'Value', render: (r) => display(r.o) },
          { key: 'a', label: '', sort: false, className: 'actions', render: (r) => r.o[2] !== 'readonly' && <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => edit(r.o)} /> },
        ]}
      />
    </div>
  );
}

function BootOrderDialog({ ctx, onClose }) {
  const app = useApp();
  const { config } = ctx;
  const devices = Object.keys(config).filter((k) => /^(ide|sata|scsi|virtio|net|usb|hostpci)\d+$/.test(k) && !/^(usb|hostpci)/.test(k) || /^(usb|hostpci)\d+$/.test(k));
  const cur = (parseProp(config.boot || '', 'legacy').order || '').split(';').filter(Boolean);
  const [list, setList] = useState(() => [...cur.filter((d) => devices.includes(d)).map((d) => ({ d, on: true })), ...devices.filter((d) => !cur.includes(d)).sort().map((d) => ({ d, on: false }))]);
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    setList(n);
  };
  const save = () => submitConfig(app, ctx, { boot: `order=${list.filter((x) => x.on).map((x) => x.d).join(';')}` }, 'Boot order');
  return (
    <DialogShell title="Boot order" icon={Layers} onClose={onClose} onSave={save}>
      <div className="table-wrap">
        <table className="tbl">
          <tbody>
            {list.map((x, i) => (
              <tr key={x.d}>
                <td style={{ width: 30 }}>{i + 1}</td>
                <td style={{ width: 40 }}><Checkbox checked={x.on} onChange={(v) => setList(list.map((y) => (y.d === x.d ? { ...y, on: v } : y)))} /></td>
                <td><b>{x.d}</b> <span className="muted small">{String(config[x.d]).slice(0, 60)}</span></td>
                <td className="actions">
                  <Button size="sm" variant="ghost" iconOnly icon={ArrowUp} onClick={() => move(i, -1)} />
                  <Button size="sm" variant="ghost" iconOnly icon={ArrowDown} onClick={() => move(i, 1)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DialogShell>
  );
}

// ---------------- Monitor ----------------
function VmMonitor({ base, guest }) {
  const [cmd, setCmd] = useState('');
  const [out, setOut] = useState([]);
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const run = async (e) => {
    e.preventDefault();
    if (!cmd.trim()) return;
    const c = cmd.trim();
    setHist((h) => [c, ...h]);
    setHi(-1);
    setCmd('');
    try {
      const res = await api.post(base + '/monitor', { command: c });
      setOut((o) => [...o, { c, r: res }]);
    } catch (err) {
      setOut((o) => [...o, { c, r: 'ERROR: ' + err.message }]);
    }
  };
  const key = (e) => {
    if (e.key === 'ArrowUp') {
      const n = Math.min(hi + 1, hist.length - 1);
      if (hist[n] !== undefined) {
        setHi(n);
        setCmd(hist[n]);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      const n = hi - 1;
      setHi(Math.max(n, -1));
      setCmd(n >= 0 ? hist[n] : '');
      e.preventDefault();
    }
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <SectionTitle title="QEMU monitor" desc={`Type "help" for a list of commands. VM must be running (${guest.status}).`} />
      <div className="log" style={{ height: 'calc(100vh - 330px)', minHeight: 300 }}>
        {out.map((o, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ color: 'var(--accent)' }}>qm&gt; {o.c}</div>
            <div>{o.r}</div>
          </div>
        ))}
      </div>
      <form onSubmit={run} className="row">
        <Input value={cmd} onChange={setCmd} onKeyDown={key} placeholder="info status" autoFocus style={{ fontFamily: 'var(--mono)' }} />
        <Button variant="primary" icon={Send} type="submit">Run</Button>
      </form>
    </div>
  );
}

// ---------------- Backups ----------------
function GuestBackups({ guest }) {
  const app = useApp();
  const storages = useStorages(guest.node, 'backup');
  const [rows, setRows] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all(storages.map((s) => api.get(P`/nodes/${guest.node}/storage/${s.storage}/content`, { content: 'backup', vmid: guest.vmid }).catch(() => [])))
      .then((l) => alive && setRows(l.flat()))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storages.map((s) => s.storage).join(), tick, app.taskTick]);
  const restore = async (b) => {
    const ok = await app.confirm({ title: 'Restore backup', message: <>Restore <code>{b.volid}</code> over {guest.type === 'qemu' ? 'VM' : 'CT'} {guest.vmid}? <b>All current data of this guest will be replaced.</b></>, danger: true, confirmLabel: 'Restore', checkbox: [{ key: 'start', label: 'Start after restore' }] });
    if (!ok) return;
    const params = guest.type === 'qemu' ? { vmid: guest.vmid, archive: b.volid, force: 1, start: ok.start ? 1 : 0 } : { vmid: guest.vmid, ostemplate: b.volid, restore: 1, force: 1, start: ok.start ? 1 : 0 };
    await app.run(() => api.post(P`/nodes/${guest.node}/${guest.type}`, params), { label: `Restore ${guest.vmid}` });
  };
  const del = async (b) => {
    if (!(await app.confirm({ title: 'Delete backup', message: <>Permanently delete <code>{b.volid}</code>?</>, danger: true, confirmLabel: 'Delete' }))) return;
    await app.run(() => api.del(P`/nodes/${guest.node}/storage/${b.volid.split(':')[0]}/content/${b.volid}`), { label: 'Delete backup' });
    setTick((t) => t + 1);
  };
  const protect = async (b) => {
    await app.run(() => api.put(P`/nodes/${guest.node}/storage/${b.volid.split(':')[0]}/content/${b.volid}`, { protected: b.protected ? 0 : 1 }), { success: b.protected ? 'Protection removed' : 'Backup protected' });
    setTick((t) => t + 1);
  };
  return (
    <div>
      <SectionTitle title="Backups">
        <Button size="sm" icon={RefreshCw} onClick={() => setTick((t) => t + 1)}>Refresh</Button>
        <Button size="sm" variant="primary" icon={Archive} onClick={() => guestBackup(app, guest)}>Backup now</Button>
      </SectionTitle>
      <Table
        loading={rows === null}
        rows={sortBy(rows || [], (b) => -b.ctime)}
        rowKey={(r) => r.volid}
        empty="No backups for this guest"
        columns={[
          { key: 'ctime', label: 'Date', render: (r) => fmtDate(r.ctime), sort: (r) => r.ctime },
          { key: 'notes', label: 'Notes' },
          { key: 'volid', label: 'Volume', render: (r) => <code className="small">{r.volid}</code> },
          { key: 'size', label: 'Size', render: (r) => fmtBytes(r.size), sort: (r) => r.size },
          { key: 'format', label: 'Format' },
          { key: 'protected', label: 'Protected', render: (r) => (r.protected ? <Lock size={13} className="amber" /> : '') },
          { key: 'verification', label: 'Verify', render: (r) => r.verification?.state || '' },
          {
            key: 'a', label: '', sort: false, className: 'actions',
            render: (r) => (
              <>
                <Button size="sm" variant="ghost" icon={Undo2} onClick={() => restore(r)}>Restore</Button>
                <Button size="sm" variant="ghost" iconOnly icon={Lock} title="Toggle protection" onClick={() => protect(r)} />
                <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} disabled={!!r.protected} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

// ---------------- Snapshots ----------------
function GuestSnapshots({ guest, base, isVM }) {
  const app = useApp();
  const { data, loading, reload } = useApi(base + '/snapshot', null, { interval: 8000 });
  const list = data || [];
  // Build tree order
  const byParent = {};
  list.forEach((s) => {
    (byParent[s.parent || ''] = byParent[s.parent || ''] || []).push(s);
  });
  const ordered = [];
  const walk = (p, depth) => (byParent[p] || []).sort((a, b) => (a.snaptime || 0) - (b.snaptime || 0)).forEach((s) => {
    ordered.push({ ...s, depth });
    walk(s.name, depth + 1);
  });
  walk('', 0);
  const take = () => app.openModal((c) => <SnapshotDialog base={base} isVM={isVM} running={guest.status === 'running'} onClose={() => { c(); setTimeout(reload, 1000); }} />);
  const rollback = async (s) => {
    const ok = await app.confirm({ title: `Rollback to "${s.name}"`, message: 'The current state will be lost. Any changes since this snapshot will be discarded.', danger: true, confirmLabel: 'Rollback', checkbox: [{ key: 'start', label: 'Start after rollback' }] });
    if (!ok) return;
    await app.run(() => api.post(`${base}/snapshot/${encodeURIComponent(s.name)}/rollback`, ok.start ? { start: 1 } : {}), { label: `Rollback to ${s.name}` });
    setTimeout(reload, 1500);
  };
  const del = async (s) => {
    if (!(await app.confirm({ title: `Delete snapshot "${s.name}"`, message: 'This merges the snapshot into its parent and cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
    await app.run(() => api.del(`${base}/snapshot/${encodeURIComponent(s.name)}`), { label: `Delete snapshot ${s.name}` });
    setTimeout(reload, 1500);
  };
  const editDesc = async (s) => {
    const d = await app.prompt({ title: `Edit snapshot "${s.name}"`, label: 'Description', value: s.description || '' });
    if (d === null) return;
    await app.run(() => api.put(`${base}/snapshot/${encodeURIComponent(s.name)}/config`, { description: d }), { success: 'Description saved' });
    reload();
  };
  return (
    <div>
      <SectionTitle title="Snapshots">
        <Button size="sm" variant="primary" icon={Camera} onClick={take}>Take snapshot</Button>
      </SectionTitle>
      <Table
        loading={loading}
        rows={ordered}
        rowKey={(r) => r.name}
        empty="No snapshots"
        columns={[
          { key: 'name', label: 'Name', sort: false, render: (r) => <span style={{ paddingLeft: r.depth * 18 }} className="row">{r.name === 'current' ? <><Play size={13} className="green" /> <b>NOW</b> <span className="muted small">You are here</span></> : <><Camera size={13} className="muted" /> <b>{r.name}</b></>}</span> },
          { key: 'snaptime', label: 'Date', sort: false, render: (r) => (r.snaptime ? fmtDate(r.snaptime) : '') },
          { key: 'vmstate', label: 'RAM', sort: false, render: (r) => (r.vmstate ? 'Yes' : '') },
          { key: 'description', label: 'Description', sort: false, render: (r) => <span className="muted">{r.description}</span> },
          {
            key: 'a', label: '', sort: false, className: 'actions',
            render: (r) =>
              r.name !== 'current' && (
                <>
                  <Button size="sm" variant="ghost" icon={Undo2} onClick={() => rollback(r)}>Rollback</Button>
                  <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => editDesc(r)} />
                  <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => del(r)} />
                </>
              ),
          },
        ]}
      />
    </div>
  );
}

function SnapshotDialog({ base, isVM, running, onClose }) {
  const app = useApp();
  const [f, setF] = useState({ snapname: `snap-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`, description: '', vmstate: false });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    const res = await api.post(base + '/snapshot', { snapname: f.snapname, description: f.description || undefined, vmstate: isVM && running && f.vmstate ? 1 : undefined });
    app.trackTask(res, `Snapshot ${f.snapname}`);
  };
  return (
    <DialogShell title="Take snapshot" icon={Camera} onClose={onClose} onSave={save} saveLabel="Take snapshot" disabled={!/^[A-Za-z][A-Za-z0-9_-]*$/.test(f.snapname)}>
      <Field label="Name" hint="Must start with a letter; letters, digits, - and _ only"><Input value={f.snapname} onChange={set('snapname')} autoFocus /></Field>
      {isVM && running && <Checkbox label="Include RAM (live state)" checked={f.vmstate} onChange={set('vmstate')} />}
      <Field label="Description"><Textarea value={f.description} onChange={set('description')} style={{ minHeight: 70 }} /></Field>
    </DialogShell>
  );
}

export { useNodes };
