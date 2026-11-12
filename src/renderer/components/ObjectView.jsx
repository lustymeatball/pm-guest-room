import React, { useState } from 'react';
import { cls } from '../lib/utils';
import { ErrorBoundary } from './ui';

// Generic layout: header + vertical sub-navigation + content panel.
// nav: [{ group?: string, items: [{ id, label, icon, render: () => node, flush?: bool, hidden?: bool }] }]
export function ObjectView({ icon: Icon, title, badge, sub, actions, nav, initial, storageKey }) {
  const all = nav.flatMap((g) => g.items.filter((i) => !i.hidden));
  const [active, setActive] = useState(() => {
    const saved = storageKey && sessionStorage.getItem('tab:' + storageKey);
    return (initial && all.find((i) => i.id === initial)?.id) || (saved && all.find((i) => i.id === saved)?.id) || all[0]?.id;
  });
  const current = all.find((i) => i.id === active) || all[0];
  const choose = (id) => {
    setActive(id);
    if (storageKey) sessionStorage.setItem('tab:' + storageKey, id);
  };
  return (
    <>
      <div className="obj-header">
        <div className="obj-icon">{Icon && <Icon size={21} />}</div>
        <div className="obj-title">
          <h1>
            {title}
            {badge}
          </h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="obj-actions">{actions}</div>
      </div>
      <div className="obj-body">
        <nav className="subnav">
          {nav.map((g, gi) => {
            const items = g.items.filter((i) => !i.hidden);
            if (!items.length) return null;
            return (
              <React.Fragment key={gi}>
                {g.group && <div className="group">{g.group}</div>}
                {items.map((i) => (
                  <button key={i.id} className={cls(current?.id === i.id && 'active')} onClick={() => choose(i.id)}>
                    {i.icon && <i.icon size={15} />}
                    {i.label}
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </nav>
        <div className={cls('content', current?.flush && 'flush')} key={current?.id}>
          <ErrorBoundary>{current?.render()}</ErrorBoundary>
        </div>
      </div>
    </>
  );
}
