import { useEffect, useRef, useState } from 'react';

// Polls /api/version and flips `updateAvailable` when the deployed build
// changes since the user loaded the page. Check runs on mount, on an interval,
// and whenever the tab becomes visible again (covers the common "came back
// after an hour" case without wasting requests in a background tab).
export const useVersionCheck = ({ pollIntervalMs = 120000 } = {}) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialVersionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const fetchVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.version || null;
      } catch {
        return null;
      }
    };

    const check = async () => {
      const current = await fetchVersion();
      if (cancelled || !current) return;
      if (initialVersionRef.current === null) {
        initialVersionRef.current = current;
      } else if (current !== initialVersionRef.current) {
        setUpdateAvailable(true);
      }
    };

    check();
    const timer = setInterval(check, pollIntervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollIntervalMs]);

  return { updateAvailable };
};
