"use client";

import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import { loadRelayerSdk } from "@/lib/relayer-sdk";
import type { RelayerInstance } from "@/lib/relayer-sdk";
import { useWalletClient } from "wagmi";
import { SEPOLIA_RPC_URL, SEPOLIA_CHAIN_ID } from "@/lib/wagmi";

type RelayerSdkModule = Awaited<ReturnType<typeof loadRelayerSdk>>;

type RelayerContextValue = {
  sdk: RelayerSdkModule | null;
  loading: boolean;
  error: Error | null;
  instance: RelayerInstance | null;
  instanceLoading: boolean;
  instanceError: Error | null;
};

const RelayerContext = createContext<RelayerContextValue>({ sdk: null, loading: true, error: null, instance: null, instanceLoading: false, instanceError: null });

const createEip1193Provider = (wallet: NonNullable<ReturnType<typeof useWalletClient>["data"]>) => {
  const requestImpl = (args: unknown) => (wallet as unknown as { request: (a: unknown) => Promise<unknown> }).request(args);
  return { request: requestImpl } as { request: (a: unknown) => Promise<unknown> };
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number, step: string): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${step} 超时，请稍后重试`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
};

const isCOOPError = (error: unknown): boolean => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Cross-Origin-Opener-Policy") ||
    message.includes("Cross-Origin-Embedder-Policy") ||
    message.includes("HTTP error! status: 404")
  );
};

const isIgnorableError = (error: unknown): boolean => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Analytics SDK") ||
    message.includes("Failed to fetch") ||
    message.includes("Base Account SDK requires") ||
    message.includes("JsonRpcProvider failed to detect network")
  );
};

export function RelayerProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<RelayerContextValue>({ sdk: null, loading: true, error: null, instance: null, instanceLoading: false, instanceError: null });
  const { data: walletClient } = useWalletClient();
  const sdk = state.sdk;

  useEffect(() => {
    let cancelled = false;

    loadRelayerSdk()
      .then((sdk) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, sdk, loading: false, error: null }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          if (isCOOPError(error)) {
            setState((prev) => ({ ...prev, sdk: null, loading: false, error: null }));
          } else if (isIgnorableError(error)) {
            setState((prev) => ({ ...prev, sdk: null, loading: false, error: null }));
          } else {
            setState((prev) => ({ ...prev, sdk: null, loading: false, error: error instanceof Error ? error : new Error("Failed to load relayer SDK") }));
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!sdk || !walletClient) {
      setState((prev) => ({ ...prev, instance: null, instanceLoading: false, instanceError: null }));
      return;
    }

    const run = async () => {
      try {
        setState((prev) => ({ ...prev, instanceLoading: true, instanceError: null }));
        let chainIdHex: string | null = null;
        try {
          const raw = (await withTimeout(
            (walletClient.request as unknown as (a: unknown) => Promise<unknown>)({ method: "eth_chainId" }),
            5000,
            "Querying network",
          )) as unknown;
          if (typeof raw === "string") chainIdHex = raw;
        } catch {
          // ignore
        }
        const chainId = chainIdHex ? parseInt(chainIdHex, 16) : SEPOLIA_CHAIN_ID;
        const rpcUrl = SEPOLIA_RPC_URL;
        
        const eip1193Provider = createEip1193Provider(walletClient);
        
        const config = {
          ...sdk.SepoliaConfig,
          network: rpcUrl,
          chainId,
          signer: eip1193Provider,
        };
        
        const instance = await sdk.createInstance(config as Record<string, unknown>);
        if (!cancelled) {
          setState((prev) => ({ ...prev, instance, instanceLoading: false, instanceError: null }));
        }
      } catch (err) {
        console.error("[Relayer] Failed to create instance", err);
        if (!cancelled) {
          setState((prev) => ({ ...prev, instance: null, instanceLoading: false, instanceError: err instanceof Error ? err : new Error(String(err)) }));
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [sdk, walletClient]);

  const value = useMemo(() => state, [state]);

  return <RelayerContext.Provider value={value}>{children}</RelayerContext.Provider>;
}

export function useRelayerSdk() {
  return useContext(RelayerContext);
}


