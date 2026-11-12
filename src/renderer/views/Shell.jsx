import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Plus, Monitor, Box, ExternalLink, ChevronRight, AlertTriangle } from 'lucide-react';
import { useApp } from '../context';
import { Sidebar } from './Sidebar';
import { TaskBar } from './TaskBar';
import { Button, MenuButton, MenuItem, ErrorBoundary } from '../components/ui';
import { DatacenterView } from './Datacenter';
import { NodeView } from './Node';
import { GuestView } from './Guest';
import { StorageView } from './Storage';
import { PoolView } from './Pool';
import { CreateVMWizard } from '../wizards/CreateVM';
import { CreateCTWizard } from '../wizards/CreateCT';

export function Shell() {
  const app = useApp();
  const { selection, resources, session, resError } = app;
  const [sbw, setSbw] = useState(() => Number(localStorage.getItem('sidebarW')) || 290);
  const drag = useRef(null);

  useEffect(() => {
    const move = (e) => {
      if (!drag.current) return;
      const w = Math.max(220, Math.min(520, e.clientX));
      setSbw(w);
    };
    const up = () => {
      if (drag.current) localStorage.setItem('sidebarW', String(sbw));
      drag.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [sbw]);

  const nodes = resources.filter((r) => r.type === 'node');
  const defaultNode = selection.node || nodes.find((n) => n.status === 'online')?.node;

  const createVM = () => app.openModal((close) => <CreateVMWizard onClose={close} defaultNode={defaultNode} />);
  const createCT = () => app.openModal((close) => <CreateCTWizard onClose={close} defaultNode={defaultNode} />);

  let view;
  const key = JSON.stringify(selection);
  switch (selection.type) {
    case 'node':
      view = <NodeView key={key} node={selection.node} />;
      break;
    case 'qemu':
    case 'lxc':
      view = <GuestView key={key} type={selection.type} node={selection.node} vmid={selection.vmid} />;
      break;
    case 'storage':
      view = <StorageView key={key} node={selection.node} storage={selection.storage} />;
      break;
    case 'pool':
      view = <PoolView key={key} pool={selection.pool} />;
      break;
    default:
      view = <DatacenterView key="dc" />;
  }

  return (
    <div className="app" style={{ '--sidebar-w': sbw + 'px' }}>
      <div className="titlebar">
        <div className="brand">
          <img className="brand-logo" src="logo.png" alt="" />
          PM - Guest Room
        </div>
        <div className="crumbs">
          <ChevronRight size={13} />
          <Crumb selection={selection} />
        </div>
        <div className="spacer" />
        <div className="no-drag row">
          <MenuButton label="Create" icon={Plus} variant="primary" size="sm">
            <MenuItem icon={Monitor} onClick={createVM}>Create virtual machine</MenuItem>
            <MenuItem icon={Box} onClick={createCT}>Create container</MenuItem>
          </MenuButton>
          <Button size="sm" variant="ghost" icon={ExternalLink} title="Open the Proxmox web UI in your browser" onClick={() => window.pve.openExternal(`https://${session.host}:${session.port}`)}>
            Web UI
          </Button>
          <div className="conn-chip" title={`${session.userid} @ ${session.host}`}>
            <span className="dot" style={resError ? { background: 'var(--red)', boxShadow: '0 0 8px var(--red)' } : null} />
            {session.userid} · {session.host}
          </div>
          <Button size="sm" variant="ghost" iconOnly icon={LogOut} title="Disconnect" onClick={app.onLogout} />
        </div>
      </div>
      {resError && (
        <div className="warn-box" style={{ borderRadius: 0, border: 0, borderBottom: '1px solid rgba(245,177,61,0.3)' }}>
          <AlertTriangle size={15} /> Lost contact with the server: {resError.message}. Retrying…
        </div>
      )}
      <div className="workspace">
        <Sidebar onCreateVM={createVM} onCreateCT={createCT} />
        <div className="sidebar-resize" onMouseDown={() => (drag.current = true)} />
        <div className="main">
          <ErrorBoundary key={key}>{view}</ErrorBoundary>
        </div>
      </div>
      <TaskBar />
    </div>
  );
}

function Crumb({ selection }) {
  const s = selection;
  const parts = ['Datacenter'];
  if (s.node) parts.push(s.node);
  if (s.vmid) parts.push(`${s.type === 'qemu' ? 'VM' : 'CT'} ${s.vmid}`);
  if (s.storage) parts.push(s.storage);
  if (s.pool) parts.push(`Pool ${s.pool}`);
  return parts.map((p, i) => (
    <React.Fragment key={i}>
      {i > 0 && <ChevronRight size={12} />}
      <span style={i === parts.length - 1 ? { color: 'var(--text-2)' } : null}>{p}</span>
    </React.Fragment>
  ));
}
