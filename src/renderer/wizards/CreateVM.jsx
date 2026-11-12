import React, { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { useApp } from '../context';
import { api, P, useApi } from '../lib/api';
import { Field, Input, NumberInput, Select, Checkbox, KV } from '../components/ui';
import { Wizard } from './Wizard';
import { useNodes, useStorages, storageOptions, useNextId } from '../components/GuestDialogs';
import { OS_TYPES, NIC_MODELS, SCSI_HW, CPU_TYPES, DISPLAY_TYPES, fmtBytes, sortBy } from '../lib/utils';

export function CreateVMWizard({ onClose, defaultNode }) {
  const app = useApp();
  const nodes = useNodes().filter((n) => n.status === 'online');
  const [vmid, setVmid] = useNextId();
  const [f, setF] = useState({
    node: defaultNode || '',
    name: '',
    pool: '',
    onboot: false,
    tags: '',
    media: 'iso',
    isoStorage: '',
    iso: '',
    ostype: 'l26',
    bios: 'seabios',
    machine: '',
    scsihw: 'virtio-scsi-single',
    agent: true,
    efiStorage: '',
    tpm: false,
    vga: '',
    bus: 'scsi',
    diskStorage: '',
    size: 32,
    cache: '',
    discard: true,
    ssd: true,
    iothread: true,
    sockets: 1,
    cores: 2,
    cpu: 'x86-64-v2-AES',
    memory: 4096,
    balloon: true,
    minmem: 2048,
    nonet: false,
    bridge: 'vmbr0',
    model: 'virtio',
    tag: '',
    firewall: true,
    start: false,
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!f.node && nodes[0]) set('node')(nodes[0].node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  const isoStorages = useStorages(f.node, 'iso');
  const diskStorages = useStorages(f.node, 'images');
  const { data: isos } = useApi(f.node && f.isoStorage ? P`/nodes/${f.node}/storage/${f.isoStorage}/content` : null, { content: 'iso' }, { enabled: !!(f.node && f.isoStorage) });
  const { data: bridges } = useApi(f.node ? P`/nodes/${f.node}/network` : null, { type: 'any_bridge' }, { enabled: !!f.node });
  const pools = app.resources.filter((r) => r.type === 'pool');

  useEffect(() => {
    if (!f.isoStorage && isoStorages[0]) set('isoStorage')(isoStorages[0].storage);
    if (!f.diskStorage && diskStorages[0]) {
      set('diskStorage')(diskStorages[0].storage);
      set('efiStorage')(diskStorages[0].storage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isoStorages.length, diskStorages.length]);

  // Windows defaults
  useEffect(() => {
    if (f.ostype.startsWith('win')) setF((s) => ({ ...s, bios: f.ostype === 'win11' ? 'ovmf' : s.bios, tpm: f.ostype === 'win11' ? true : s.tpm, machine: f.ostype === 'win11' ? 'q35' : s.machine, cpu: 'x86-64-v2-AES' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.ostype]);

  const exists = app.resources.some((r) => r.vmid === Number(vmid));

  const build = () => {
    const p = {
      vmid,
      name: f.name || undefined,
      pool: f.pool || undefined,
      onboot: f.onboot ? 1 : 0,
      tags: f.tags || undefined,
      ostype: f.ostype,
      bios: f.bios,
      machine: f.machine || undefined,
      scsihw: f.scsihw,
      agent: f.agent ? 1 : 0,
      sockets: f.sockets,
      cores: f.cores,
      cpu: f.cpu,
      memory: f.memory,
      balloon: f.balloon ? (f.minmem < f.memory ? f.minmem : undefined) : 0,
      vga: f.vga || undefined,
      start: f.start ? 1 : 0,
    };
    if (f.media === 'iso' && f.iso) p.ide2 = `${f.iso},media=cdrom`;
    else if (f.media === 'cdrom') p.ide2 = 'cdrom,media=cdrom';
    const st = diskStorages.find((s) => s.storage === f.diskStorage);
    const fileBased = st && ['dir', 'nfs', 'cifs', 'glusterfs', 'btrfs'].includes(st.type);
    const disk = [`${f.diskStorage}:${f.size}`];
    if (fileBased) disk.push('format=qcow2');
    if (f.cache) disk.push(`cache=${f.cache}`);
    if (f.discard) disk.push('discard=on');
    if (f.ssd && f.bus !== 'virtio') disk.push('ssd=1');
    if (f.iothread && (f.bus === 'scsi' || f.bus === 'virtio')) disk.push('iothread=1');
    p[`${f.bus}0`] = disk.join(',');
    p.boot = `order=${f.bus}0${p.ide2 ? ';ide2' : ''}${f.nonet ? '' : ';net0'}`;
    if (f.bios === 'ovmf' && f.efiStorage) p.efidisk0 = `${f.efiStorage}:1,efitype=4m,pre-enrolled-keys=1`;
    if (f.tpm && f.efiStorage) p.tpmstate0 = `${f.efiStorage}:1,version=v2.0`;
    if (!f.nonet) p.net0 = `${f.model},bridge=${f.bridge}${f.tag ? `,tag=${f.tag}` : ''},firewall=${f.firewall ? 1 : 0}`;
    return p;
  };

  const finish = async () => {
    const res = await api.post(P`/nodes/${f.node}/qemu`, build());
    app.trackTask(res, `Create VM ${vmid}`);
    setTimeout(() => app.select({ type: 'qemu', node: f.node, vmid: Number(vmid) }), 2500);
  };

  const steps = [
    {
      id: 'general',
      label: 'General',
      valid: !!f.node && !!vmid && !exists,
      render: () => (
        <>
          <div className="form-row three">
            <Field label="Node"><Select value={f.node} onChange={set('node')} options={nodes.map((n) => n.node)} /></Field>
            <Field label="VM ID" hint={exists ? <span className="red">ID already in use</span> : null}><NumberInput value={vmid} onChange={setVmid} /></Field>
            <Field label="Name"><Input value={f.name} onChange={set('name')} placeholder="my-vm" autoFocus /></Field>
          </div>
          <div className="form-row">
            <Field label="Resource pool"><Select value={f.pool} onChange={set('pool')} options={[['', 'None'], ...pools.map((p) => p.pool)]} /></Field>
            <Field label="Tags" hint="Separated by ; or ,"><Input value={f.tags} onChange={set('tags')} /></Field>
          </div>
          <Checkbox label="Start at boot" checked={f.onboot} onChange={set('onboot')} />
        </>
      ),
    },
    {
      id: 'os',
      label: 'OS',
      valid: f.media !== 'iso' || !!f.iso,
      render: () => (
        <>
          <Field label="Installation media">
            <Select value={f.media} onChange={set('media')} options={[['iso', 'Use CD/DVD disc image (ISO)'], ['cdrom', 'Use physical CD/DVD drive'], ['none', 'Do not use any media']]} />
          </Field>
          {f.media === 'iso' && (
            <div className="form-row">
              <Field label="ISO storage"><Select value={f.isoStorage} onChange={(v) => setF((s) => ({ ...s, isoStorage: v, iso: '' }))} options={isoStorages.map((s) => s.storage)} /></Field>
              <Field label="ISO image" hint={!isos?.length ? 'No ISOs on this storage — upload one first' : null}>
                <Select value={f.iso} onChange={set('iso')} placeholder="Select…" options={sortBy(isos || [], (i) => i.volid).map((i) => [i.volid, `${i.volid.split('/').pop()} (${fmtBytes(i.size)})`])} />
              </Field>
            </div>
          )}
          <Field label="Guest OS type"><Select value={f.ostype} onChange={set('ostype')} options={OS_TYPES} /></Field>
          {f.ostype.startsWith('win') && <div className="info-box">For best performance on Windows, also attach the VirtIO drivers ISO as a second CD drive after creation (Hardware → Add → CD/DVD).</div>}
        </>
      ),
    },
    {
      id: 'system',
      label: 'System',
      render: () => (
        <>
          <div className="form-row">
            <Field label="Graphic card"><Select value={f.vga} onChange={set('vga')} options={DISPLAY_TYPES} /></Field>
            <Field label="Machine"><Select value={f.machine} onChange={set('machine')} options={[['', 'Default (i440fx)'], ['q35', 'q35']]} /></Field>
          </div>
          <div className="form-row">
            <Field label="BIOS"><Select value={f.bios} onChange={set('bios')} options={[['seabios', 'SeaBIOS'], ['ovmf', 'OVMF (UEFI)']]} /></Field>
            <Field label="SCSI controller"><Select value={f.scsihw} onChange={set('scsihw')} options={SCSI_HW} /></Field>
          </div>
          {(f.bios === 'ovmf' || f.tpm) && <Field label="EFI / TPM storage"><Select value={f.efiStorage} onChange={set('efiStorage')} options={storageOptions(diskStorages)} /></Field>}
          <div className="row" style={{ gap: 20 }}>
            <Checkbox label="QEMU guest agent" checked={f.agent} onChange={set('agent')} />
            <Checkbox label="Add TPM v2.0" checked={f.tpm} onChange={set('tpm')} />
          </div>
        </>
      ),
    },
    {
      id: 'disks',
      label: 'Disks',
      valid: !!f.diskStorage && f.size > 0,
      render: () => (
        <>
          <div className="form-row three">
            <Field label="Bus/Device"><Select value={f.bus} onChange={set('bus')} options={[['scsi', 'SCSI'], ['virtio', 'VirtIO Block'], ['sata', 'SATA'], ['ide', 'IDE']]} /></Field>
            <Field label="Storage"><Select value={f.diskStorage} onChange={set('diskStorage')} options={storageOptions(diskStorages)} /></Field>
            <Field label="Disk size (GiB)"><NumberInput value={f.size} onChange={set('size')} min={1} /></Field>
          </div>
          <Field label="Cache"><Select value={f.cache} onChange={set('cache')} options={[['', 'Default (no cache)'], ['writethrough', 'Write through'], ['writeback', 'Write back'], ['unsafe', 'Write back (unsafe)'], ['none', 'No cache']]} /></Field>
          <div className="row wrap" style={{ gap: 20 }}>
            <Checkbox label="Discard" checked={f.discard} onChange={set('discard')} />
            {f.bus !== 'virtio' && <Checkbox label="SSD emulation" checked={f.ssd} onChange={set('ssd')} />}
            {(f.bus === 'scsi' || f.bus === 'virtio') && <Checkbox label="IO thread" checked={f.iothread} onChange={set('iothread')} />}
          </div>
        </>
      ),
    },
    {
      id: 'cpu',
      label: 'CPU',
      render: () => (
        <>
          <div className="form-row three">
            <Field label="Sockets"><NumberInput value={f.sockets} onChange={set('sockets')} min={1} /></Field>
            <Field label="Cores"><NumberInput value={f.cores} onChange={set('cores')} min={1} /></Field>
            <Field label="Total cores"><Input value={f.sockets * f.cores} disabled /></Field>
          </div>
          <Field label="CPU type" hint="'host' = best performance, x86-64-v2-AES = safe default for migration"><Select value={f.cpu} onChange={set('cpu')} options={CPU_TYPES} /></Field>
        </>
      ),
    },
    {
      id: 'memory',
      label: 'Memory',
      render: () => (
        <>
          <Field label="Memory (MiB)" hint={fmtBytes(f.memory * 1024 * 1024)}><NumberInput value={f.memory} onChange={set('memory')} step={512} min={64} /></Field>
          <div className="row wrap">
            {[1024, 2048, 4096, 8192, 16384].map((m) => <button key={m} className="btn sm" onClick={() => setF((s) => ({ ...s, memory: m, minmem: Math.min(s.minmem, m) }))}>{m / 1024} GiB</button>)}
          </div>
          <Checkbox label="Ballooning device" checked={f.balloon} onChange={set('balloon')} />
          {f.balloon && <Field label="Minimum memory (MiB)"><NumberInput value={f.minmem} onChange={set('minmem')} step={512} /></Field>}
        </>
      ),
    },
    {
      id: 'network',
      label: 'Network',
      render: () => (
        <>
          <Checkbox label="No network device" checked={f.nonet} onChange={set('nonet')} />
          {!f.nonet && (
            <>
              <div className="form-row">
                <Field label="Bridge"><Select value={f.bridge} onChange={set('bridge')} options={[...new Set([...(bridges || []).map((b) => b.iface), f.bridge])].sort()} /></Field>
                <Field label="Model"><Select value={f.model} onChange={set('model')} options={NIC_MODELS} /></Field>
              </div>
              <Field label="VLAN tag"><Input value={f.tag} onChange={set('tag')} placeholder="no VLAN" /></Field>
              <Checkbox label="Firewall" checked={f.firewall} onChange={set('firewall')} />
            </>
          )}
        </>
      ),
    },
    {
      id: 'confirm',
      label: 'Confirm',
      render: () => (
        <>
          <KV items={Object.entries(build()).filter(([, v]) => v !== undefined).map(([k, v]) => [k, <code key={k}>{String(v)}</code>])} />
          <Checkbox label="Start after created" checked={f.start} onChange={set('start')} />
        </>
      ),
    },
  ];

  return <Wizard title="Create virtual machine" icon={Monitor} steps={steps} onClose={onClose} onFinish={finish} finishLabel="Create VM" />;
}
