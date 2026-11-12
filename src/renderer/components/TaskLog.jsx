import React, { useEffect, useRef, useState } from 'react';
import { ListChecks, Square } from 'lucide-react';
import { api, P } from '../lib/api';
import { Modal, Button, StatusPill, KV, Seg } from './ui';
import { fmtDate, fmtDuration, parseUpid, taskName } from '../lib/utils';

export function TaskLogModal({ node, upid, onClose }) {
  const [log, setLog] = useState([]);
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState('output');
  const ref = useRef();
  const u = parseUpid(upid);

  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const [st, lines] = await Promise.all([
          api.get(P`/nodes/${node}/tasks/${upid}/status`),
          api.get(P`/nodes/${node}/tasks/${upid}/log`, { start: 0, limit: 5000 }),
        ]);
        if (!alive) return;
        setStatus(st);
        setLog(lines || []);
        if (st.status === 'running') timer = setTimeout(load, 1200);
      } catch (e) {
        if (alive) setLog([{ n: 0, t: 'Error: ' + e.message }]);
      }
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [node, upid]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  const running = status?.status === 'running';
  const stop = async () => {
    try {
      await api.del(P`/nodes/${node}/tasks/${upid}`);
    } catch {}
  };

  return (
    <Modal
      title={`Task: ${u ? taskName(u.type, u.id) : upid}`}
      icon={ListChecks}
      onClose={onClose}
      width={860}
      footer={
        <>
          <div className="left">{running ? 'Live — updating…' : status ? `Finished: ${status.exitstatus}` : ''}</div>
          {running && (
            <Button variant="danger" icon={Square} onClick={stop}>
              Stop task
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="row mb">
        <Seg value={tab} onChange={setTab} options={[['output', 'Output'], ['status', 'Status']]} />
        <div className="grow" />
        {status && <StatusPill status={running ? 'running' : status.exitstatus === 'OK' ? 'ok' : 'error'}>{running ? 'running' : status.exitstatus}</StatusPill>}
      </div>
      {tab === 'output' ? (
        <div className="log" ref={ref} style={{ height: 420 }}>
          {log.map((l) => (
            <div key={l.n}>
              <span className="ln">{l.n}</span>
              {l.t}
            </div>
          ))}
        </div>
      ) : (
        <KV
          items={[
            ['Status', status?.status],
            ['Exit status', status?.exitstatus],
            ['Type', status?.type],
            ['ID', status?.id],
            ['User', status?.user],
            ['Node', status?.node],
            ['Process ID', status?.pid],
            ['Start time', fmtDate(status?.starttime)],
            ['Duration', status ? fmtDuration(((status.endtime || Date.now() / 1000) - status.starttime)) : null],
            ['Unique task ID', <code key="u">{upid}</code>],
          ]}
        />
      )}
    </Modal>
  );
}
