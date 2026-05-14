"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WARN_BEFORE_MS = 60 * 1000;        // show warning 1 minute before logout

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

interface UseIdleLogoutOptions {
  onLogout: () => void;
  enabled?: boolean;
}

export function useIdleLogout({ onLogout, enabled = true }: UseIdleLogoutOptions) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const resetTimers = useCallback(() => {
    clearAllTimers();
    setSecondsLeft(null);

    warnTimerRef.current = setTimeout(() => {
      let secs = Math.floor(WARN_BEFORE_MS / 1000);
      setSecondsLeft(secs);
      countdownRef.current = setInterval(() => {
        secs -= 1;
        setSecondsLeft(secs);
        if (secs <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
        }
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);

    logoutTimerRef.current = setTimeout(() => {
      onLogout();
    }, IDLE_TIMEOUT_MS);
  }, [clearAllTimers, onLogout]);

  const stayLoggedIn = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!enabled) return;

    resetTimers();

    const handleActivity = () => resetTimers();
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimers, clearAllTimers]);

  return { secondsLeft, stayLoggedIn };
}
