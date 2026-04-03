import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'chinwag-theme';
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

function getSystemTheme() {
  return darkMQ.matches ? 'dark' : 'light';
}

function apply(resolved) {
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0e0f11' : '#ffffff';
}

export function useTheme() {
  const [preference, setPreference] = useState(() => localStorage.getItem(STORAGE_KEY) || 'system');
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  const resolved = preference === 'system' ? systemTheme : preference;

  const setTheme = useCallback((value) => {
    localStorage.setItem(STORAGE_KEY, value);
    setPreference(value);
  }, []);

  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  useEffect(() => {
    const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light');
    darkMQ.addEventListener('change', handler);
    return () => darkMQ.removeEventListener('change', handler);
  }, []);

  return { theme: preference, resolved, setTheme };
}
