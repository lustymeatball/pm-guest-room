import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Loader2, AlertTriangle, Inbox, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cls } from '../lib/utils';

export function Button({ variant, size, icon: Icon, loading, children, className, iconOnly, ...rest }) {
  return (
    <button
      className={cls('btn', variant, size, iconOnly && 'icon', className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 15} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="spin" style={{ color: 'var(--accent)' }} />;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="empty">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, children = 'Nothing here yet' }) {
  return (
    <div className="empty">
      <Icon size={30} strokeWidth={1.5} />
      <div>{children}</div>
    </div>
  );
}

export function ErrorBox({ error, children }) {
  if (!error && !children) return null;
  return (
    <div className="error-box">
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children || error?.message || String(error)}</div>
    </div>
  );
}

export function Modal({ title, icon: Icon, onClose, children, footer, width = 560, closeOnOverlay = true }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => closeOnOverlay && e.target === e.currentTarget && onClose && onClose()}>
      <div className="modal" style={{ width: `min(${width}px, 100%)` }}>
        <div className="modal-head">
          <h2>
            {Icon && <Icon size={17} style={{ color: 'var(--accent)' }} />}
            {title}
          </h2>
          {onClose && <Button className="x" variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} />}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, style }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Input({ value, onChange, ...rest }) {
  return <input className="input" value={value ?? ''} onChange={(e) => onChange && onChange(e.target.value)} spellCheck={false} {...rest} />;
}

export function NumberInput({ value, onChange, ...rest }) {
  return (
    <input
      className="input"
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange && onChange(e.target.value === '' ? '' : Number(e.target.value))}
      {...rest}
    />
  );
}

export function Textarea({ value, onChange, ...rest }) {
  return <textarea className="input" value={value ?? ''} onChange={(e) => onChange && onChange(e.target.value)} spellCheck={false} {...rest} />;
}

// options: array of strings | [value,label] | {value,label}
export function Select({ value, onChange, options = [], placeholder, ...rest }) {
  const norm = options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : typeof o === 'object' ? o : { value: o, label: o }));
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange && onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {norm.map((o) => (
        <option key={String(o.value)} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label, disabled }) {
  return (
    <label className="check" style={disabled ? { opacity: 0.5 } : null}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="box">
        <Check size={12} strokeWidth={3} />
      </span>
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="switch" style={disabled ? { opacity: 0.5 } : null}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="track" />
      {label}
    </label>
  );
}

export function Meter({ value = 0 }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={cls('meter', v > 0.9 ? 'crit' : v > 0.75 && 'warn')}>
      <div style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function StatusPill({ status, children }) {
  const s = String(status || 'unknown').toLowerCase();
  const color =
    { running: 'green', online: 'green', active: 'green', available: 'green', ok: 'green', started: 'green', up: 'green' }[s] ||
    { paused: 'amber', suspended: 'amber', prelaunch: 'amber', pending: 'amber', warning: 'amber' }[s] ||
    { error: 'red', failed: 'red', offline: 'red', down: 'red' }[s] ||
    (s === 'stopped' || s === 'inactive' || s === 'unknown' || s === 'disabled' ? 'gray' : 'blue');
  return <span className={cls('pill', color)}>{children || status}</span>;
}

export function Card({ title, icon: Icon, right, children, className, style, pad0 }) {
  return (
    <div className={cls('card', pad0 && 'pad0', className)} style={style}>
      {(title || right) && (
        <div className="card-head">
          {title && (
            <h3>
              {Icon && <Icon size={15} />}
              {title}
            </h3>
          )}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function SectionTitle({ title, desc, children }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div className="right">{children}</div>
    </div>
  );
}

export function KV({ items }) {
  return (
    <div className="kv">
      {items
        .filter(Boolean)
        .map(([k, v]) => (
          <React.Fragment key={k}>
            <div className="k">{k}</div>
            <div className="v">{v ?? '—'}</div>
          </React.Fragment>
        ))}
    </div>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <button key={v} className={cls(value === v && 'active')} onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

// columns: [{key, label, render?(row), sort?(row)|true, className, width}]
export function Table({ columns, rows, rowKey = (r, i) => r.id ?? i, onRowClick, onRowDoubleClick, selectedKey, empty, loading, maxHeight, defaultSort }) {
  const [sort, setSort] = useState(defaultSort || null);
  let data = Array.isArray(rows) ? rows : [];
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    if (col) {
      const fn = typeof col.sort === 'function' ? col.sort : (r) => r[col.key];
      data = [...data].sort((a, b) => {
        const x = fn(a);
        const y = fn(b);
        const r = x === y ? 0 : x === undefined || x === null ? 1 : y === undefined || y === null ? -1 : x < y ? -1 : 1;
        return sort.dir === 'desc' ? -r : r;
      });
    }
  }
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : null}>
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={cls(c.sort !== false && 'sortable')}
                onClick={() =>
                  c.sort !== false &&
                  setSort((s) => (s && s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))
                }
              >
                <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
                  {c.label}
                  {sort && sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const k = rowKey(r, i);
            return (
              <tr
                key={k}
                className={cls((onRowClick || onRowDoubleClick) && 'clickable', selectedKey !== undefined && selectedKey === k && 'selected')}
                onClick={() => onRowClick && onRowClick(r)}
                onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(r)}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render ? c.render(r) : r[c.key] ?? <span className="faint">—</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && !data.length && <Loading />}
      {!loading && !data.length && <Empty>{empty || 'No entries'}</Empty>}
    </div>
  );
}

export function Menu({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cls('menu', align === 'left' && 'left')} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuButton({ label = 'More', icon, variant, children, size }) {
  return (
    <Menu
      trigger={({ toggle }) => (
        <Button variant={variant} size={size} icon={icon} onClick={toggle}>
          {label}
          <ChevronDown size={13} style={{ marginRight: -3 }} />
        </Button>
      )}
    >
      {children}
    </Menu>
  );
}

export function MenuItem({ icon: Icon, children, onClick, danger, disabled }) {
  return (
    <button className={cls(danger && 'danger')} onClick={onClick} disabled={disabled}>
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div style={{ padding: 20 }}>
          <ErrorBox>
            This panel failed to render: {String(this.state.error.message || this.state.error)}
          </ErrorBox>
          <div className="mt">
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          </div>
        </div>
      );
    return this.props.children;
  }
}

// Simple form-state hook
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = (k) => (v) => setValues((s) => ({ ...s, [k]: v }));
  return [values, set, setValues];
}
