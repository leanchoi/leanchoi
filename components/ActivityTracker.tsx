'use client';
import { useEffect, useRef } from 'react';

const TICK_SECONDS = 15;
const IDLE_LIMIT_MS = 30 * 1000;

/**
 * Counts online time: every 15s, if the tab is visible and there was
 * user interaction within the last 30s, credit 15s via the heartbeat API.
 */
export default function ActivityTracker() {
  const lastActivity = useRef<number>(Date.now());

  useEffect(() => {
    const touch = () => { lastActivity.current = Date.now(); };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, touch, { passive: true }));

    const interval = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) return;
      fetch('/api/me/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: TICK_SECONDS }),
      }).catch(() => {});
    }, TICK_SECONDS * 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, touch));
      clearInterval(interval);
    };
  }, []);

  return null;
}
