import { useState, useEffect, useCallback } from 'react';

// Text-size accessibility setting. Four steps; class on <html>
// scales every rem-based utility (Tailwind defaults are rem) so the
// whole UI grows/shrinks together. Persisted to localStorage so the
// preference sticks across sessions and devices on the same browser.
//
// Step values match the CSS classes in index.css. Don't reorder.

export const TEXT_SIZE_STEPS = [
  { id: 'sm',      label: 'A',   description: 'Small'  },
  { id: 'default', label: 'A',   description: 'Default' },
  { id: 'lg',      label: 'A',   description: 'Large'  },
  { id: 'xl',      label: 'A',   description: 'X-Large' },
];

const STORAGE_KEY = 'avayble.textSize';
const VALID_IDS = TEXT_SIZE_STEPS.map(s => s.id);

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID_IDS.includes(v) ? v : 'default';
  } catch {
    return 'default';
  }
};

const applyClass = (id) => {
  const html = document.documentElement;
  VALID_IDS.forEach(stepId => {
    html.classList.remove(`text-size-${stepId}`);
  });
  html.classList.add(`text-size-${id}`);
};

// Apply on first import so even pages that don't mount the hook
// (rare, but defensive) get the saved preference. Idempotent.
if (typeof document !== 'undefined') {
  applyClass(readStored());
}

export function useTextSize() {
  const [size, setSizeState] = useState(readStored);

  // Apply the class whenever the size changes — covers the case where
  // the user toggles in one tab while another tab is open (storage
  // event listener below).
  useEffect(() => {
    applyClass(size);
    try { localStorage.setItem(STORAGE_KEY, size); } catch { /* private mode */ }
  }, [size]);

  // Cross-tab sync: if the user changes size in another tab, this
  // tab follows.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && VALID_IDS.includes(e.newValue)) {
        setSizeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSize = useCallback((id) => {
    if (VALID_IDS.includes(id)) setSizeState(id);
  }, []);

  return { size, setSize, steps: TEXT_SIZE_STEPS };
}

export default useTextSize;
