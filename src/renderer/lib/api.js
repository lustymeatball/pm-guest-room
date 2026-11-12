import { useCallback, useEffect, useRef, useState } from 'react';

// Path builder that URL-encodes interpolated segments: P`/nodes/${node}/qemu/${id}`
export function P(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? encodeURIComponent(vals[i]) : ''), '');
}

export const api = {
  get: (path, params) => window.pve.api('GET', path, params),
  post: (path, params) => window.pve.api('POST', path, params),
  put: (path, params) => window.pve.api('PUT', path, params),
  del: (path, params) => window.pve.api('DELETE', path, params),
};

// Fetch an API path; optional polling interval. Keeps previous data while reloading.
export function useApi(path, params, { interval = 0, enabled = true, transform } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const key = path + JSON.stringify(params || {});
  const alive = useRef(true);
  const tRef = useRef(transform);
  tRef.current = transform;

  const gen = useRef(0);
  const busy = useRef(false);
  const load = useCallback(async (tick) => {
    if (!enabled || !path) return;
    if (tick === true && (busy.current || document.hidden)) return; // don't stack polls
    const g = gen.current;
    busy.current = true;
    try {
      let data = await api.get(path, params);
      if (tRef.current) data = tRef.current(data);
      if (alive.current && g === gen.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (alive.current && g === gen.current) setState((s) => ({ data: s.data, error, loading: false }));
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    alive.current = true;
    gen.current++;
    setState({ data: undefined, error: null, loading: true });
    load();
    let t;
    if (interval && enabled) t = setInterval(() => load(true), interval);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, interval, enabled]);

  return { ...state, reload: load };
}
