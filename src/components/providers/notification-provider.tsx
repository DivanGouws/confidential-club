"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type NoticeType = "notice" | "success" | "error";

type NotificationContextValue = {
  show: (type: NoticeType, message: string, opts?: { durationMs?: number }) => void;
  notice: (message: string, opts?: { durationMs?: number }) => void;
  success: (message: string, opts?: { durationMs?: number }) => void;
  error: (message: string, opts?: { durationMs?: number }) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return ctx;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const timerRef = useRef<number | null>(null);
  const [offsetTop, setOffsetTop] = useState<number>(88);
  useNavbarOffset(setOffsetTop);
  const [mounted, setMounted] = useState(false);
  const unmountTimerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearUnmountTimer = () => {
    if (unmountTimerRef.current) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  };

  const show = useCallback((t: NoticeType, msg: string, opts?: { durationMs?: number }) => {
    clearTimer();
    clearUnmountTimer();
    setMessage(msg);
    setMounted(true);
    setOpen(true);
    const duration = opts?.durationMs ?? 5000;
    timerRef.current = window.setTimeout(() => setOpen(false), duration) as unknown as number;
  }, []);

  const notice = useCallback((msg: string, opts?: { durationMs?: number }) => show("notice", msg, opts), [show]);
  const success = useCallback((msg: string, opts?: { durationMs?: number }) => show("success", msg, opts), [show]);
  const error = useCallback((msg: string, opts?: { durationMs?: number }) => show("error", msg, opts), [show]);

  const close = useCallback(() => {
    setOpen(false);
    clearTimer();
    clearUnmountTimer();
    // Wait for transition to finish before unmounting
    unmountTimerRef.current = window.setTimeout(() => setMounted(false), 300) as unknown as number;
  }, []);

  useEffect(() => () => {
    clearTimer();
    clearUnmountTimer();
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({ show, notice, success, error }), [show, notice, success, error]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {mounted ? (
        <div
          className={`fixed left-1/2 z-[1000] -translate-x-1/2 min-w-[220px] max-w-[90vw] rounded-2xl px-4 py-2.5 text-sm font-medium shadow-xl backdrop-blur flex items-center gap-3 transition-all duration-300 ease-out ${
            open ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-95"
          } overlay-silver overlay-silver-text border overlay-silver-border`}
          role="status"
          aria-live="polite"
          style={{ top: offsetTop }}
        >
          <span className="truncate">{message}</span>
          <button
            onClick={close}
            className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full border overlay-silver-border bg-white/10 hover:bg-white/20 text-inherit"
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}

// Compute navbar height to position notification correctly
function useNavbarOffset(setOffsetTop: (n: number) => void) {
  useEffect(() => {
    const compute = () => {
      const nav = document.getElementById("app-navbar");
      const h = nav ? nav.getBoundingClientRect().height : 64;
      setOffsetTop(h + 12);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [setOffsetTop]);
}



