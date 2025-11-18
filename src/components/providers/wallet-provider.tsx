"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { RainbowKitProvider, lightTheme, type Theme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type PropsWithChildren } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/wagmi";

export function WalletProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  const baseTheme = lightTheme({
    accentColor: "#2563eb",
    accentColorForeground: "#f8fafc",
    borderRadius: "large",
    overlayBlur: "large",
  });

  const customTheme: Theme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      modalBackground: "rgba(255,255,255,0.92)",
      modalText: "#0f172a",
      modalTextSecondary: "#475569",
      modalBackdrop: "rgba(15, 23, 42, 0.25)",
      modalBorder: "rgba(226, 232, 240, 0.9)",
      generalBorder: "rgba(226, 232, 240, 0.9)",
      actionButtonBorder: "rgba(59, 130, 246, 0.45)",
      actionButtonSecondaryBackground: "rgba(37, 99, 235, 0.08)",
      closeButton: "#1f2937",
      closeButtonBackground: "rgba(255,255,255,0.8)",
      connectButtonBackground: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
      connectButtonInnerBackground: "rgba(255,255,255,0.85)",
      connectButtonText: "#0f172a",
      profileForeground: "rgba(249, 250, 251, 0.9)",
      standby: "rgba(148, 163, 184, 0.2)",
    },
    fonts: {
      body: "var(--font-geist-sans)",
    },
    radii: {
      ...baseTheme.radii,
      modal: "22px",
      modalMobile: "22px",
      actionButton: "18px",
      connectButton: "18px",
      menuButton: "16px",
    },
    shadows: {
      ...baseTheme.shadows,
      connectButton: "0px 16px 40px rgba(37, 99, 235, 0.35)",
      dialog: "0px 28px 70px rgba(148, 163, 184, 0.35)",
    },
  };

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact" theme={customTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}


