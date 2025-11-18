"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className="shimmer-button inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              Connect Wallet
            </button>
          );
        }

        if (chain?.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="shimmer-button inline-flex items-center rounded-full px-5 py-3 text-sm font-medium text-white shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              Switch to a supported network
            </button>
          );
        }

        return (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={openChainModal}
              className="shimmer-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-900 shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              {chain?.hasIcon && chain.iconUrl ? (
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-400/50 bg-white/20 shadow-sm">
                  <img
                    src={chain.iconUrl}
                    alt={chain.name ?? ""}
                    className="h-full w-full object-cover"
                    width={20}
                    height={20}
                  />
                </span>
              ) : null}
              {chain?.name ?? "Unknown"}
            </button>
            <button
              onClick={openAccountModal}
              className="shimmer-button inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-900 shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              {account?.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}


