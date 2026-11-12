import React, { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, ListChecks, Loader2, ScrollText } from 'lucide-react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { Table, StatusPill, Seg } from '../components/ui';
import { fmtDate, fmtDuration, taskName } from '../lib/utils';

export function TaskBar() {
  const app = useApp();
  const [open, setOpen] = useState(() => localStorage.getItem('taskbarOpen') === '1');
  const [tab, setTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [log, setLog] = useState([]);

  useEffect(() => localStorage.setItem('taskbarOpen', open ? '1' : '0'), [open]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const t = await api.get('/cluster/tasks');
        if (alive) setTasks(t || []);
        if (open && tab === 'log') {
          const l = await api.get('/cluster/log', { max: 100 });
          if (alive) setLog(l || []);
        }
      } catch {}
    };
    load();
    const i = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [open, tab, app.taskTick]);

  const running = tasks.filter((t) => !t.endtime);

  return (
    <div className="taskbar">
      <div className="taskbar-head" onClick={() => setOpen((o) => !o)}>
        <ListChecks size={15} />
        <b>Tasks</b>
        {running.length > 0 ? (
          <span className="running">
            <Loader2 size={13} className="spin" /> {running.length} running — {taskName(running[0].type, running[0].id)}
          </span>
        ) : (
          tasks[0] && (
            <span className="muted">
              Last: {taskName(tasks[0].type, tasks[0].id)} on {tasks[0].node} · {tasks[0].status || 'running'}
            </span>
          )
        )}
        <div className="grow" />
        {open && (
          <div onClick={(e) => e.stopPropagation()}>
            <Seg value={tab} onChange={setTab} options={[['tasks', 'Tasks'], ['log', 'Cluster log']]} />
          </div>
        )}
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </div>
      {open && (
        <div className="taskbar-body">
          {tab === 'tasks' ? <TaskTable tasks={tasks} onOpen={(t) => app.showTask(t.upid)} compact /> : (
            <Table
              rows={log}
              rowKey={(r) => r.uid + r.time}
              columns={[
                { key: 'time', label: 'Time', render: (r) => fmtDate(r.time), width: 190 },
                { key: 'node', label: 'Node', width: 110 },
                { key: 'user', label: 'User', width: 150 },
                { key: 'tag', label: 'Service', width: 120 },
                { key: 'msg', label: 'Message', render: (r) => <span className="selectable">{r.msg}</span> },
              ]}
              empty={<><ScrollText size={14} /> No log entries</>}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function TaskTable({ tasks, onOpen, loading, maxHeight }) {
  return (
    <Table
      rows={tasks}
      loading={loading}
      maxHeight={maxHeight}
      rowKey={(r) => r.upid}
      onRowDoubleClick={onOpen}
      onRowClick={onOpen}
      columns={[
        { key: 'starttime', label: 'Start time', render: (r) => fmtDate(r.starttime), width: 190 },
        { key: 'endtime', label: 'Duration', render: (r) => (r.endtime ? fmtDuration(r.endtime - r.starttime) : <Loader2 size={13} className="spin" />), width: 100 },
        { key: 'node', label: 'Node', width: 110 },
        { key: 'user', label: 'User', width: 140 },
        { key: 'type', label: 'Description', render: (r) => taskName(r.type, r.id) },
        {
          key: 'status',
          label: 'Status',
          width: 160,
          render: (r) =>
            !r.endtime && !r.status ? (
              <StatusPill status="running" />
            ) : r.status === 'OK' ? (
              <StatusPill status="ok">OK</StatusPill>
            ) : (r.status || '').startsWith('WARNINGS') ? (
              <StatusPill status="warning">{r.status}</StatusPill>
            ) : (
              <span className="red ellipsis" title={r.status} style={{ display: 'inline-block', maxWidth: 260 }}>
                {r.status}
              </span>
            ),
        },
      ]}
    />
  );
}
