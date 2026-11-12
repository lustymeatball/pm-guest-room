import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Server, Monitor, Box, Database, FolderTree, ChevronRight, ChevronDown, Search, FileStack, Play, Power, Square, RotateCcw, TerminalSquare, Copy, Pause } from 'lucide-react';
import { useApp } from '../context';
import { useApi } from '../lib/api';
import { cls, sortBy } from '../lib/utils';
import { guestPower, openConsole, guestClone } from '../lib/actions';

const typeIcon = (r) => (r.type === 'node' ? Server : r.type === 'qemu' ? (r.template ? FileStack : Monitor) : r.type === 'lxc' ? (r.template ? FileStack : Box) : r.type === 'storage' ? Database : r.type === 'pool' ? FolderTree : Building2);

function selKey(s) {
  return [s.type, s.node, s.vmid, s.storage, s.pool].filter((x) => x !== undefined).join('/');
}

export function Sidebar() {
  const app = useApp();
  const { resources, selection, select } = app;
  const [q, setQ] = useState('');
  const [mode, setMode] = useState(() => localStorage.getItem('treeMode') || 'server');
  const [collapsed, setCollapsed] = useState({});
  const [ctx, setCtx] = useState(null);
  const { data: cstatus } = useApi('/cluster/status', null, { interval: 30000 });
  const clusterName = (cstatus || []).find((x) => x.type === 'cluster')?.name;

  useEffect(() => localStorage.setItem('treeMode', mode), [mode]);
  useEffect(() => {
    if (!ctx) return;
    const h = () => setCtx(null);
    window.addEventListener('mousedown', h);
    window.addEventListener('blur', h);
    return () => {
      window.removeEventListener('mousedown', h);
      window.removeEventListener('blur', h);
    };
  }, [ctx]);

  const match = (r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return [r.name, r.vmid, r.node, r.storage, r.pool, r.tags, r.status].some((v) => v !== undefined && String(v).toLowerCase().includes(s));
  };

  const tree = useMemo(() => {
    const nodes = sortBy(resources.filter((r) => r.type === 'node'), (n) => n.node);
    const guests = sortBy(resources.filter((r) => r.type === 'qemu' || r.type === 'lxc'), (g) => g.vmid);
    const storages = sortBy(resources.filter((r) => r.type === 'storage'), (s) => s.storage);
    const pools = sortBy(resources.filter((r) => r.type === 'pool'), (p) => p.pool);
    const toItem = (r) => ({
      r,
      sel:
        r.type === 'node'
          ? { type: 'node', node: r.node }
          : r.type === 'storage'
            ? { type: 'storage', node: r.node, storage: r.storage }
            : r.type === 'pool'
              ? { type: 'pool', pool: r.pool }
              : { type: r.type, node: r.node, vmid: r.vmid },
    });
    if (mode === 'server') {
      return nodes.map((n) => ({
        ...toItem(n),
        children: [...guests.filter((g) => g.node === n.node && match(g)), ...storages.filter((s) => s.node === n.node && match(s))].map(toItem),
      }));
    }
    if (mode === 'type') {
      const groups = [
        ['Nodes', nodes],
        ['Virtual machines', guests.filter((g) => g.type === 'qemu' && !g.template)],
        ['Containers', guests.filter((g) => g.type === 'lxc' && !g.template)],
        ['Templates', guests.filter((g) => g.template)],
        ['Storage', storages],
      ];
      return groups
        .map(([label, items]) => ({ group: label, children: items.filter(match).map(toItem) }))
        .filter((g) => g.children.length);
    }
    // pool view
    return pools.map((p) => ({
      ...toItem(p),
      children: [...guests, ...storages].filter((r) => r.pool === p.pool && match(r)).map(toItem),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, mode, q]);

  const current = selKey(selection);

  const onContext = (e, item) => {
    if (item.r.type !== 'qemu' && item.r.type !== 'lxc') return;
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, r: item.r });
  };

  const renderItem = (item, depth) => {
    const { r, sel, children } = item;
    const k = selKey(sel);
    const isCollapsed = collapsed[k];
    const Icon = typeIcon(r);
    const status = r.type === 'storage' ? r.status : r.hastate === 'error' ? 'error' : r.status;
    const label = r.type === 'node' ? r.node : r.type === 'storage' ? r.storage : r.type === 'pool' ? r.pool : r.name || `${r.type === 'qemu' ? 'VM' : 'CT'} ${r.vmid}`;
    return (
      <React.Fragment key={k}>
        <div
          className={cls('tree-row', current === k && 'selected')}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => select(sel)}
          onDoubleClick={() => (r.type === 'qemu' || r.type === 'lxc') && r.status === 'running' && openConsole(app, r)}
          onContextMenu={(e) => onContext(e, item)}
          title={r.tags ? `Tags: ${r.tags}` : undefined}
        >
          <span
            className="chev"
            onClick={(e) => {
              if (!children) return;
              e.stopPropagation();
              setCollapsed((c) => ({ ...c, [k]: !c[k] }));
            }}
          >
            {children && children.length > 0 ? isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} /> : null}
          </span>
          <span className="tree-ico">
            <Icon size={15} />
            {r.type !== 'pool' && !r.template && <span className={cls('st', status)} />}
          </span>
          {(r.type === 'qemu' || r.type === 'lxc') && <span className="vmid">{r.vmid}</span>}
          <span className="label">{label}</span>
          {r.type === 'node' && r.status === 'online' && (
            <span className="mini-meter" title={`CPU ${(r.cpu * 100).toFixed(2)}%`}>
              <div style={{ width: `${Math.min(100, r.cpu * 100)}%` }} />
            </span>
          )}
          {r.type === 'storage' && r.maxdisk > 0 && (
            <span className="mini-meter" title={`${((r.disk / r.maxdisk) * 100).toFixed(2)}% used`}>
              <div style={{ width: `${(r.disk / r.maxdisk) * 100}%`, background: r.disk / r.maxdisk > 0.9 ? 'var(--red)' : undefined }} />
            </span>
          )}
        </div>
        {children && !isCollapsed && children.map((c) => renderItem(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="search">
          <Search size={15} />
          <input placeholder="Search name, ID, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="view-switch">
          {[
            ['server', 'Server'],
            ['type', 'Type'],
            ['pool', 'Pools'],
          ].map(([v, l]) => (
            <button key={v} className={cls(mode === v && 'active')} onClick={() => setMode(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="tree">
        <div className={cls('tree-row', current === 'datacenter' && 'selected')} onClick={() => select({ type: 'datacenter' })}>
          <span className="chev" />
          <span className="tree-ico">
            <Building2 size={15} />
          </span>
          <span className="label">Datacenter{clusterName ? ` (${clusterName})` : ''}</span>
        </div>
        {tree.map((item) =>
          item.group ? (
            <React.Fragment key={item.group}>
              <div className="subnav" style={{ padding: 0, border: 0, width: 'auto' }}>
                <div className="group" style={{ paddingLeft: 14 }}>{item.group}</div>
              </div>
              {item.children.map((c) => renderItem(c, 1))}
            </React.Fragment>
          ) : (
            renderItem(item, 1)
          )
        )}
      </div>
      {ctx && <GuestContextMenu ctx={ctx} onClose={() => setCtx(null)} />}
    </aside>
  );
}

function GuestContextMenu({ ctx, onClose }) {
  const app = useApp();
  const { r } = ctx;
  const running = r.status === 'running';
  const ref = useRef();
  const act = (fn) => (e) => {
    e.stopPropagation();
    onClose();
    fn();
  };
  const top = Math.min(ctx.y, window.innerHeight - 300);
  return (
    <div className="menu" ref={ref} style={{ position: 'fixed', left: ctx.x, top, right: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
      {!running && !r.template && (
        <button onClick={act(() => guestPower(app, r, 'start'))}>
          <Play size={15} /> Start
        </button>
      )}
      {running && (
        <>
          <button onClick={act(() => guestPower(app, r, 'shutdown'))}>
            <Power size={15} /> Shutdown
          </button>
          <button onClick={act(() => guestPower(app, r, 'reboot'))}>
            <RotateCcw size={15} /> Reboot
          </button>
          {r.type === 'qemu' && (
            <button onClick={act(() => guestPower(app, r, 'suspend'))}>
              <Pause size={15} /> Pause
            </button>
          )}
          <button className="danger" onClick={act(() => guestPower(app, r, 'stop'))}>
            <Square size={15} /> Stop
          </button>
          <hr />
          <button onClick={act(() => openConsole(app, r))}>
            <TerminalSquare size={15} /> Console (new window)
          </button>
        </>
      )}
      {r.status === 'paused' && (
        <button onClick={act(() => guestPower(app, r, 'resume'))}>
          <Play size={15} /> Resume
        </button>
      )}
      <hr />
      <button onClick={act(() => guestClone(app, r))}>
        <Copy size={15} /> Clone…
      </button>
      <button onClick={act(() => app.select({ type: r.type, node: r.node, vmid: r.vmid }))}>
        <Monitor size={15} /> Open {r.type === 'qemu' ? 'VM' : 'CT'} {r.vmid}
      </button>
    </div>
  );
}
