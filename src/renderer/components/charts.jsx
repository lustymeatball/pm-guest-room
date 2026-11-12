import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Card, Seg } from './ui';
import { useApi } from '../lib/api';
import { fmtBytes, fmtRate, fmtPct } from '../lib/utils';

function useWidth() {
  const ref = useRef();
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const COLORS = ['#7c6cff', '#49b6ff', '#2fd17b', '#ff8a3d', '#ff5d6c'];

// series: [{key, label, color}], data: [{time, [key]: number}]
export function AreaChart({ data = [], series, height = 170, format = (v) => v, max }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const padL = 58;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const W = width;
  const H = height;
  const pts = data.filter((d) => series.some((s) => d[s.key] !== undefined && d[s.key] !== null));
  const { yMax, xs, t0, t1 } = useMemo(() => {
    let m = max || 0;
    if (!max) for (const d of pts) for (const s of series) m = Math.max(m, Number(d[s.key]) || 0);
    if (!m) m = 1;
    const t0 = pts.length ? pts[0].time : 0;
    const t1 = pts.length ? pts[pts.length - 1].time : 1;
    return { yMax: m * (max ? 1 : 1.1), xs: pts.map((d) => d.time), t0, t1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, max]);
  const x = (t) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const y = (v) => padT + (1 - (Number(v) || 0) / yMax) * (H - padT - padB);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const span = t1 - t0;
  const fmtT = (t) => {
    const d = new Date(t * 1000);
    return span > 86400 * 2 ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  const onMove = (e) => {
    if (!pts.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = t0 + ((px - padL) / (W - padL - padR)) * (t1 - t0);
    let best = 0;
    for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - t) < Math.abs(xs[best] - t)) best = i;
    setHover(best);
  };
  const hp = hover !== null ? pts[hover] : null;
  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color || COLORS[i]} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color || COLORS[i]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tk) => (
          <g key={tk}>
            <line className="grid-line" x1={padL} x2={W - padR} y1={y(yMax * tk)} y2={y(yMax * tk)} />
            <text className="axis-label" x={padL - 8} y={y(yMax * tk) + 3.5} textAnchor="end">
              {format(yMax * tk)}
            </text>
          </g>
        ))}
        {pts.length > 1 &&
          [0, 0.33, 0.66, 1].map((f) => (
            <text key={f} className="axis-label" x={padL + f * (W - padL - padR)} y={H - 5} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>
              {fmtT(t0 + f * span)}
            </text>
          ))}
        {series.map((s, i) => {
          const c = s.color || COLORS[i];
          const valid = pts.filter((d) => d[s.key] !== undefined && d[s.key] !== null);
          if (valid.length < 2) return null;
          const line = valid.map((d, j) => `${j ? 'L' : 'M'}${x(d.time).toFixed(1)},${y(d[s.key]).toFixed(1)}`).join('');
          const area = `${line}L${x(valid[valid.length - 1].time).toFixed(1)},${y(0)}L${x(valid[0].time).toFixed(1)},${y(0)}Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={`url(#g-${s.key}-${i})`} />
              <path d={line} fill="none" stroke={c} strokeWidth="1.7" strokeLinejoin="round" />
            </g>
          );
        })}
        {hp && (
          <g>
            <line x1={x(hp.time)} x2={x(hp.time)} y1={padT} y2={H - padB} stroke="rgba(148,163,200,0.3)" strokeDasharray="3 3" />
            {series.map((s, i) => hp[s.key] !== undefined && <circle key={s.key} cx={x(hp.time)} cy={y(hp[s.key])} r="3.5" fill={s.color || COLORS[i]} stroke="#0d111a" strokeWidth="2" />)}
          </g>
        )}
        {!pts.length && (
          <text className="axis-label" x={W / 2} y={H / 2} textAnchor="middle">
            No data
          </text>
        )}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: Math.min(x(hp.time) + 12, W - 190), top: 8 }}>
          <div className="muted small" style={{ marginBottom: 4 }}>
            {new Date(hp.time * 1000).toLocaleString()}
          </div>
          {series.map((s, i) => (
            <div className="row" key={s.key}>
              <span className="sw" style={{ background: s.color || COLORS[i] }} />
              {s.label}: <b>{format(hp[s.key])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }) {
  return (
    <div className="legend">
      {series.map((s, i) => (
        <span key={s.key}>
          <i style={{ background: s.color || COLORS[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function Donut({ value = 0, size = 64, stroke = 7, color = 'var(--accent)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const col = v > 0.9 ? 'var(--red)' : v > 0.75 ? 'var(--amber)' : color;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,200,0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={col}
        strokeWidth={stroke}
        strokeDasharray={`${c * v} ${c}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .5s' }}
      />
    </svg>
  );
}

const TIMEFRAMES = [
  ['hour', 'Hour'],
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
];

// Standard set of RRD charts for node / qemu / lxc.
export function RrdCharts({ path, kind }) {
  const [tf, setTf] = useState('hour');
  const [cf, setCf] = useState('AVERAGE');
  const { data } = useApi(path, { timeframe: tf, cf }, { interval: 10000 });
  const rows = (data || []).filter((d) => d.time);
  const charts =
    kind === 'node'
      ? [
          { title: 'CPU usage', series: [{ key: 'cpu', label: 'CPU' }, { key: 'iowait', label: 'IO delay', color: '#ff8a3d' }], format: (v) => fmtPct(v, 0), max: 1 },
          { title: 'Server load', series: [{ key: 'loadavg', label: 'Load average', color: '#49b6ff' }], format: (v) => (v || 0).toFixed(2) },
          { title: 'Memory usage', series: [{ key: 'memtotal', label: 'Total', color: '#545d74' }, { key: 'memused', label: 'RAM used' }], format: (v) => fmtBytes(v, 0) },
          { title: 'Network traffic', series: [{ key: 'netin', label: 'In', color: '#2fd17b' }, { key: 'netout', label: 'Out', color: '#49b6ff' }], format: (v) => fmtRate(v) },
        ]
      : [
          { title: 'CPU usage', series: [{ key: 'cpu', label: 'CPU' }], format: (v) => fmtPct(v, 0), max: 1 },
          { title: 'Memory usage', series: [{ key: 'maxmem', label: 'Total', color: '#545d74' }, { key: 'mem', label: 'RAM used' }], format: (v) => fmtBytes(v, 0) },
          { title: 'Network traffic', series: [{ key: 'netin', label: 'In', color: '#2fd17b' }, { key: 'netout', label: 'Out', color: '#49b6ff' }], format: (v) => fmtRate(v) },
          { title: 'Disk IO', series: [{ key: 'diskread', label: 'Read', color: '#ff8a3d' }, { key: 'diskwrite', label: 'Write', color: '#7c6cff' }], format: (v) => fmtRate(v) },
        ];
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <h3 style={{ margin: 0, fontSize: 14 }}>Performance</h3>
        <div className="grow" />
        <Seg value={cf} onChange={setCf} options={[['AVERAGE', 'Avg'], ['MAX', 'Max']]} />
        <Seg value={tf} onChange={setTf} options={TIMEFRAMES} />
      </div>
      <div className="grid cols-2">
        {charts.map((c) => (
          <Card key={c.title} title={c.title} right={<Legend series={c.series} />}>
            <AreaChart data={rows} series={c.series} format={c.format} max={c.max} />
          </Card>
        ))}
      </div>
    </div>
  );
}
