import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { getDemoResponse } from '../data/demoData';

export function useApi(url) {
  const { isDemo } = useContext(AppContext);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError]     = useState(null);
  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!url) return;
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
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return () => {};
    }
    if (isDemo) {
      setData(getDemoResponse(url));
      setLoading(false);
      setError(null);
      return;
    }
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, url, isDemo]);

  const refetch = useCallback(() => {
    if (isDemo) {
      setData(getDemoResponse(url));
      return;
    }
    fetchData();
  }, [isDemo, url, fetchData]);

  return { data, loading, error, refetch };
}
