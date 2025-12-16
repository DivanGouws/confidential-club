"use client";

import Script from "next/script";

export function RelayerScriptLoader() {
  // Load Relayer SDK 0.3.0-5 (can be overridden by NEXT_PUBLIC_RELAYER_SDK_URL)
  const src = process.env.NEXT_PUBLIC_RELAYER_SDK_URL ?? "https://cdn.zama.org/relayer-sdk-js/0.3.0-6/relayer-sdk-js.umd.cjs";
  return (
    <Script
      src={src}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}

