export const cls = (...a) => a.filter(Boolean).join(' ');

export function fmtBytes(n, digits = 2) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  n = Number(n);
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let i = 0;
  while (Math.abs(n) >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${u[i]}`;
}

export function fmtRate(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return fmtBytes(n) + '/s';
}

export function fmtDuration(sec) {
  if (!sec && sec !== 0) return '—';
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function fmtDate(epoch) {
  if (!epoch) return '—';
  const d = new Date(epoch * 1000);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtPct(v, digits = 2) {
  if (v === undefined || v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function ratio(a, b) {
  if (!b) return 0;
  return Math.max(0, Math.min(1, a / b));
}

// Parse a Proxmox property string like "virtio=AA:BB,bridge=vmbr0,firewall=1".
// The first key without "=" is stored under `defaultKey`.
export function parseProp(str, defaultKey) {
  const out = {};
  if (!str) return out;
  String(str)
    .split(',')
    .forEach((part, i) => {
      const eq = part.indexOf('=');
      if (eq === -1) {
        if (i === 0 && defaultKey) out[defaultKey] = part;
        else out[part] = '1';
      } else out[part.slice(0, eq)] = part.slice(eq + 1);
    });
  return out;
}

export function buildProp(obj, order = []) {
  const keys = [...order.filter((k) => k in obj), ...Object.keys(obj).filter((k) => !order.includes(k))];
  return keys
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .map((k) => `${k}=${obj[k]}`)
    .join(',');
}

// UPID:node:pid:pstart:starttime:type:id:user:
export function parseUpid(upid) {
  if (!upid || typeof upid !== 'string') return null;
  const p = upid.split(':');
  if (p[0] !== 'UPID') return null;
  return { node: p[1], pid: p[2], pstart: p[3], starttime: parseInt(p[4], 16), type: p[5], id: p[6], user: p[7], upid };
}

const TASK_NAMES = {
  qmstart: 'VM Start',
  qmstop: 'VM Stop',
  qmshutdown: 'VM Shutdown',
  qmreboot: 'VM Reboot',
  qmreset: 'VM Reset',
  qmsuspend: 'VM Suspend',
  qmresume: 'VM Resume',
  qmcreate: 'VM Create',
  qmdestroy: 'VM Destroy',
  qmclone: 'VM Clone',
  qmmigrate: 'VM Migrate',
  qmrollback: 'VM Rollback',
  qmsnapshot: 'VM Snapshot',
  qmdelsnapshot: 'Delete Snapshot',
  qmtemplate: 'Convert to Template',
  qmconfig: 'VM Config',
  qmrestore: 'VM Restore',
  qmmove: 'Move Disk',
  qmigrate: 'VM Migrate',
  vzstart: 'CT Start',
  vzstop: 'CT Stop',
  vzshutdown: 'CT Shutdown',
  vzreboot: 'CT Reboot',
  vzsuspend: 'CT Suspend',
  vzresume: 'CT Resume',
  vzcreate: 'CT Create',
  vzdestroy: 'CT Destroy',
  vzclone: 'CT Clone',
  vzmigrate: 'CT Migrate',
  vzrollback: 'CT Rollback',
  vzsnapshot: 'CT Snapshot',
  vzdelsnapshot: 'Delete Snapshot',
  vztemplate: 'Convert to Template',
  vzrestore: 'CT Restore',
  vzdump: 'Backup',
  vncproxy: 'VNC Console',
  vncshell: 'Shell',
  termproxy: 'Console',
  spiceproxy: 'SPICE Console',
  startall: 'Bulk Start',
  stopall: 'Bulk Stop',
  aptupdate: 'Update package database',
  imgcopy: 'Copy data',
  imgdel: 'Erase data',
  download: 'Download',
  srvstart: 'Start service',
  srvstop: 'Stop service',
  srvrestart: 'Restart service',
  srvreload: 'Reload service',
  resize: 'Resize disk',
  qmresize: 'Resize disk',
  vzresize: 'Resize disk',
  move_volume: 'Move volume',
  hamigrate: 'HA Migrate',
  hastart: 'HA Start',
  hastop: 'HA Stop',
  reboot: 'Reboot node',
  shutdown: 'Shutdown node',
};

export function taskName(type, id) {
  const n = TASK_NAMES[type] || type;
  return id ? `${n} ${id}` : n;
}

export function sortBy(arr, fn) {
  return [...(arr || [])].sort((a, b) => {
    const x = fn(a);
    const y = fn(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export const isUpid = (v) => typeof v === 'string' && v.startsWith('UPID:');

export function parseSize(str) {
  // "32G" -> bytes
  const m = /^(\d+(?:\.\d+)?)([KMGT])?$/i.exec(String(str || '').trim());
  if (!m) return 0;
  const mult = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[(m[2] || '').toUpperCase()] || 1;
  return parseFloat(m[1]) * mult;
}

export const OS_TYPES = [
  ['l26', 'Linux 6.x / 5.x / 4.x / 3.x / 2.6 Kernel'],
  ['l24', 'Linux 2.4 Kernel'],
  ['win11', 'Windows 11 / 2022 / 2025'],
  ['win10', 'Windows 10 / 2016 / 2019'],
  ['win8', 'Windows 8.x / 2012 / 2012r2'],
  ['win7', 'Windows 7 / 2008r2'],
  ['wvista', 'Windows Vista / 2008'],
  ['wxp', 'Windows XP / 2003'],
  ['w2k', 'Windows 2000'],
  ['solaris', 'Solaris / OpenSolaris / OpenIndiana'],
  ['other', 'Other'],
];

export const osLabel = (v) => (OS_TYPES.find((o) => o[0] === v) || [v, v])[1];

export const DISK_BUS = ['scsi', 'virtio', 'sata', 'ide'];
export const NIC_MODELS = [
  ['virtio', 'VirtIO (paravirtualized)'],
  ['e1000', 'Intel E1000'],
  ['e1000e', 'Intel E1000E'],
  ['rtl8139', 'Realtek RTL8139'],
  ['vmxnet3', 'VMware vmxnet3'],
];
export const SCSI_HW = [
  ['virtio-scsi-single', 'VirtIO SCSI single'],
  ['virtio-scsi-pci', 'VirtIO SCSI'],
  ['lsi', 'LSI 53C895A'],
  ['lsi53c810', 'LSI 53C810'],
  ['megasas', 'MegaRAID SAS 8708EM2'],
  ['pvscsi', 'VMware PVSCSI'],
];
export const CPU_TYPES = [
  'host',
  'x86-64-v2-AES',
  'x86-64-v2',
  'x86-64-v3',
  'x86-64-v4',
  'kvm64',
  'qemu64',
  'max',
];
export const DISPLAY_TYPES = [
  ['', 'Default'],
  ['std', 'Standard VGA'],
  ['vmware', 'VMware compatible'],
  ['qxl', 'SPICE (qxl)'],
  ['virtio', 'VirtIO-GPU'],
  ['virtio-gl', 'VirGL GPU'],
  ['serial0', 'Serial terminal 0'],
  ['none', 'None'],
];
