import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, Loader2, X, AlertTriangle } from 'lucide-react';
import { api, P } from './lib/api';
import { isUpid, parseUpid, taskName } from './lib/utils';
import { Button, Modal, Field, Input, Checkbox } from './components/ui';
import { TaskLogModal } from './components/TaskLog';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

let toastId = 0;

export function AppProvider({ session, onLogout, children }) {
  const [rawResources, setResources] = useState([]);
  // Fresh per-object stats pushed by open summary pages (polled every second) override the
  // cluster-wide list, which Proxmox itself only refreshes about every 10 seconds.
  const [live, setLive] = useState({});
  const pushLive = useCallback((id, fields) => setLive((l) => ({ ...l, [id]: { ...fields, at: Date.now() } })), []);
  const resources = useMemo(() => {
    const now = Date.now();
    return rawResources.map((r) => {
      const o = live[r.id];
      if (!o || now - o.at > 5000) return r;
      const { at, ...f } = o;
      return { ...r, ...f };
    });
  }, [rawResources, live]);
  const [resError, setResError] = useState(null);
  const [selection, setSelection] = useState({ type: 'datacenter' });
  const [toasts, setToasts] = useState([]);
  const [modals, setModals] = useState([]);
  const [taskTick, setTaskTick] = useState(0);
  const resTimer = useRef();

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/cluster/resources');
      setResources(data || []);
      setResError(null);
    } catch (e) {
      setResError(e);
    }
  }, []);

  useEffect(() => {
    refresh();
    resTimer.current = setInterval(() => !document.hidden && refresh(), 2000);
    return () => clearInterval(resTimer.current);
  }, [refresh]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t) => {
      const id = ++toastId;
      const item = { id, kind: 'info', ...t };
      setToasts((list) => [...list.slice(-4), item]);
      if (item.kind !== 'task' && !item.sticky) setTimeout(() => dismiss(id), item.kind === 'error' ? 8000 : 4000);
      return id;
    },
    [dismiss]
  );
  const updateToast = useCallback((id, patch) => setToasts((l) => l.map((t) => (t.id === id ? { ...t, ...patch } : t))), []);

  const openModal = useCallback((render) => {
    const id = ++toastId;
    const close = () => setModals((m) => m.filter((x) => x.id !== id));
    setModals((m) => [...m, { id, render: () => render(close) }]);
    return close;
  }, []);

  const showTask = useCallback(
    (upid) => {
      const u = parseUpid(upid);
      if (!u) return;
      openModal((close) => <TaskLogModal node={u.node} upid={upid} onClose={close} />);
    },
    [openModal]
  );

  // Follow a task: toast shows progress and final result.
  const trackTask = useCallback(
    (upid, label) => {
      if (!isUpid(upid)) return;
      const u = parseUpid(upid);
      const title = label || taskName(u.type, u.id);
      const id = toast({ kind: 'task', title, message: 'Running…', upid });
      setTaskTick((x) => x + 1);
      const poll = async () => {
        try {
          const st = await api.get(P`/nodes/${u.node}/tasks/${upid}/status`);
          if (st.status === 'stopped') {
            const ok = st.exitstatus === 'OK' || (st.exitstatus || '').startsWith('WARNINGS');
            updateToast(id, { kind: ok ? 'success' : 'error', message: ok ? (st.exitstatus === 'OK' ? 'Completed successfully' : st.exitstatus) : st.exitstatus || 'Failed' });
            setTimeout(() => dismiss(id), ok ? 5000 : 12000);
            setTaskTick((x) => x + 1);
            refresh();
            return;
          }
        } catch {
          /* keep polling */
        }
        setTimeout(poll, 1500);
      };
      setTimeout(poll, 800);
    },
    [toast, updateToast, dismiss, refresh]
  );

  // Run an API call; reports errors and tracks UPIDs.
  const run = useCallback(
    async (fn, { label, success } = {}) => {
      try {
        const res = await fn();
        if (isUpid(res)) trackTask(res, label);
        else if (success) toast({ kind: 'success', title: success });
        refresh();
        return res;
      } catch (e) {
        toast({ kind: 'error', title: label ? `${label} failed` : 'Request failed', message: e.message });
        throw e;
      }
    },
    [trackTask, toast, refresh]
  );

  const confirm = useCallback(
    ({ title, message, confirmLabel = 'Confirm', danger, typeToConfirm, checkbox }) =>
      new Promise((resolve) => {
        openModal((close) => <ConfirmModal {...{ title, message, confirmLabel, danger, typeToConfirm, checkbox }} onDone={(v) => { close(); resolve(v); }} />);
      }),
    [openModal]
  );

  const prompt = useCallback(
    ({ title, label, value = '', placeholder, confirmLabel = 'OK', type = 'text' }) =>
      new Promise((resolve) => {
        openModal((close) => <PromptModal {...{ title, label, value, placeholder, confirmLabel, type }} onDone={(v) => { close(); resolve(v); }} />);
      }),
    [openModal]
  );

  const value = {
    session,
    onLogout,
    resources,
    pushLive,
    resError,
    refresh,
    selection,
    select: setSelection,
    toast,
    run,
    confirm,
    prompt,
    openModal,
    showTask,
    trackTask,
    taskTick,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {modals.map((m) => (
        <React.Fragment key={m.id}>{m.render()}</React.Fragment>
      ))}
      <div className="toasts">
        {toasts.map((t) => (
          <Toast key={t.id} t={t} onClose={() => dismiss(t.id)} onView={t.upid ? () => showTask(t.upid) : null} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function Toast({ t, onClose, onView }) {
  const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : t.kind === 'task' ? Loader2 : Info;
  return (
    <div className={`toast ${t.kind}`}>
      <Icon size={18} className={`lead ${t.kind === 'task' ? 'spin' : ''}`} style={{ flexShrink: 0, marginTop: 1 }} />
      <div className="t-body">
        <div className="t-title">{t.title}</div>
        {t.message && <div className="t-msg">{t.message}</div>}
        {onView && (
          <div className="t-actions">
            <Button size="sm" onClick={onView}>
              View log
            </Button>
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} />
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger, typeToConfirm, checkbox, onDone }) {
  const [typed, setTyped] = useState('');
  const [checks, setChecks] = useState(() => Object.fromEntries((checkbox || []).map((c) => [c.key, !!c.default])));
  const ok = !typeToConfirm || typed === String(typeToConfirm);
  return (
    <Modal
      title={title}
      icon={danger ? AlertTriangle : Info}
      onClose={() => onDone(false)}
      width={460}
      footer={
        <>
          <Button onClick={() => onDone(false)}>Cancel</Button>
          <Button variant={danger ? 'danger-solid' : 'primary'} disabled={!ok} onClick={() => onDone(checkbox ? checks : true)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="form">
        <div style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>{message}</div>
        {(checkbox || []).map((c) => (
          <Checkbox key={c.key} label={c.label} checked={checks[c.key]} onChange={(v) => setChecks((s) => ({ ...s, [c.key]: v }))} />
        ))}
        {typeToConfirm !== undefined && (
          <Field label={<>Type <code>{typeToConfirm}</code> to confirm</>}>
            <Input value={typed} onChange={setTyped} autoFocus />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function PromptModal({ title, label, value, placeholder, confirmLabel, type, onDone }) {
  const [v, setV] = useState(value);
  return (
    <Modal
      title={title}
      onClose={() => onDone(null)}
      width={440}
      footer={
        <>
          <Button onClick={() => onDone(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => onDone(v)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); onDone(v); }}>
        <Field label={label}>
          <Input value={v} onChange={setV} placeholder={placeholder} autoFocus type={type} />
        </Field>
      </form>
    </Modal>
  );
}
