import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Modal, Button, ErrorBox } from '../components/ui';
import { cls } from '../lib/utils';

// steps: [{ id, label, render: () => node, valid?: bool }]
export function Wizard({ title, icon, steps, onClose, onFinish, finishLabel = 'Finish', width = 760 }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const step = steps[i];
  const last = i === steps.length - 1;
  const canNext = step.valid !== false;
  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await onFinish();
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      icon={icon}
      onClose={onClose}
      width={width}
      closeOnOverlay={false}
      footer={
        <>
          <div className="left">Step {i + 1} of {steps.length}</div>
          <Button onClick={onClose}>Cancel</Button>
          <Button icon={ChevronLeft} disabled={i === 0} onClick={() => setI(i - 1)}>Back</Button>
          {last ? (
            <Button variant="primary" icon={Check} loading={busy} onClick={finish} disabled={steps.some((s) => s.valid === false)}>{finishLabel}</Button>
          ) : (
            <Button variant="primary" disabled={!canNext} onClick={() => setI(i + 1)}>
              Next <ChevronRight size={15} />
            </Button>
          )}
        </>
      }
    >
      <div className="wizard-steps" style={{ padding: 0, marginBottom: 18 }}>
        {steps.map((s, idx) => (
          <button key={s.id} className={cls(idx === i && 'active', idx < i && 'done')} onClick={() => (idx < i || steps.slice(0, idx).every((x) => x.valid !== false)) && setI(idx)}>
            <span className="n">{idx < i ? <Check size={11} strokeWidth={3} /> : idx + 1}</span>
            {s.label}
          </button>
        ))}
      </div>
      <div className="form" style={{ minHeight: 300 }}>
        {step.render()}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
