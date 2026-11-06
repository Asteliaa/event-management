import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/client.js';

// Универсальный хук загрузки данных (аналог useFetch из Composition API Vue):
// состояния loading / error / data, повторная загрузка и отмена устаревшего запроса через AbortController
export function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    fetcherRef.current(controller.signal)
      .then((data) => setState({ data, loading: false, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: getErrorMessage(err) }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater) =>
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);

  return { ...state, reload, setData };
}
