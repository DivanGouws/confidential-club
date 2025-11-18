"use client";

import { useEffect } from "react";

export function ConsoleFilterProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;

    const ignoredPatterns = [
      "Base Account SDK requires",
      "Analytics SDK",
      "Failed to fetch",
      "Lit is in dev mode",
      "JsonRpcProvider failed to detect network",
    ];

    const shouldIgnore = (message: string): boolean => {
      return ignoredPatterns.some((pattern) => message.includes(pattern));
    };

    console.error = (...args: unknown[]) => {
      const message = args.map((arg) => String(arg)).join(" ");
      if (!shouldIgnore(message)) {
        originalError.apply(console, args);
      }
    };

    console.warn = (...args: unknown[]) => {
      const message = args.map((arg) => String(arg)).join(" ");
      if (!shouldIgnore(message)) {
        originalWarn.apply(console, args);
      }
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return <>{children}</>;
}

