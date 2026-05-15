import { useState, useEffect, useCallback, useRef } from 'react';

export function useApi(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);

    let attempts = 3;
    while (attempts > 0) {
      if (signal.aborted) return;
      try {
        const res = await fetch(url, { credentials: 'include', signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!signal.aborted) {
          setData(json);
          setLoading(false);
        }
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        attempts--;
        if (attempts === 0) {
          if (!signal.aborted) {
            setError(err.message);
            setLoading(false);
          }
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
