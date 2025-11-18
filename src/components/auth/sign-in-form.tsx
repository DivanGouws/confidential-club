"use client";

import { useState, useEffect } from "react";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";
import { useAccount, useWalletClient } from "wagmi";

import { useWalletSession } from "@/hooks/use-wallet-session";

export function SignInForm() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { data: session, refetch, isFetching: sessionLoading } = useWalletSession(isConnected);
  const [signing, setSigning] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const isAuthenticated = Boolean(
    session?.authenticated && session.address && address &&
      session.address.toLowerCase() === address.toLowerCase()
  );

  if (isAuthenticated) {
    return null;
  }

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openConnectModal,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Please connect your wallet
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Connect your wallet to continue using Confidential Club
                </p>
              </div>
              <button
                onClick={openConnectModal}
                className="shimmer-button inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-medium text-white shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Connect wallet
              </button>
            </div>
          );
        }

        if (chain?.unsupported) {
          return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Unsupported network
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Please switch to the Sepolia test network
                </p>
              </div>
            </div>
          );
        }

        const handleSignIn = async () => {
          if (!walletClient || !address) {
            return;
          }

          try {
            setSigning(true);
            const nonceResponse = await fetch("/api/auth/nonce", {
              method: "GET",
              cache: "no-store",
            });

            if (!nonceResponse.ok) {
              throw new Error("nonce_request_failed");
            }

            const { nonce } = (await nonceResponse.json()) as { nonce: string };
            const chainId = chain?.id ?? 11155111;
            const message = new SiweMessage({
              domain: window.location.hostname,
              address,
              statement: "Sign to continue on Confidential Club",
              uri: window.location.origin,
              version: "1",
              chainId,
              nonce,
            });

            const preparedMessage = message.prepareMessage();
            const signature = await walletClient.signMessage({ message: preparedMessage });

            const verifyResponse = await fetch("/api/auth/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ message: preparedMessage, signature }),
            });

            if (!verifyResponse.ok) {
              throw new Error("verify_failed");
            }

            await refetch();
            setToast({ type: "success", message: "Signed in successfully" });
          } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Sign-in failed, please try again later" });
          } finally {
            setSigning(false);
          }
        };

        return (
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
            <div className="space-y-4 text-center">
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                Sign a message to verify your identity
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Please sign to verify wallet ownership and continue
              </p>
            </div>
            <button
              onClick={handleSignIn}
              disabled={signing || sessionLoading}
              className="shimmer-button inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-medium text-white shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:filter-none"
            >
              {signing ? "Signing..." : "Sign in"}
            </button>
            {toast ? (
              <div
                className={`pointer-events-none fixed top-6 right-6 z-50 min-w-[200px] rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-2xl backdrop-blur ${toast.type === "success" ? "bg-emerald-500/90" : "bg-rose-500/90"}`}
              >
                {toast.message}
              </div>
            ) : null}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

