type RelayerSdkModule = {
  initSDK: () => Promise<void>;
  createInstance: <TConfig>(config: TConfig) => Promise<RelayerInstance>;
  SepoliaConfig: Record<string, unknown>;
};

type EncryptedInputBuilder = {
  add256: (value: number | bigint | string) => EncryptedInputBuilder;
  encrypt: () => Promise<{
    handles: string[];
    inputProof: string;
  }>;
};

type RelayerInstance = {
  createEncryptedInput: (contractAddress: string, signerAddress: string) => EncryptedInputBuilder;
  userDecrypt: (encryptedValue: string, contractAddress: string) => Promise<number | bigint> | ((handleContractPairs: Array<{ handle: unknown; contractAddress: string }>, privateKey: string, publicKey: string, signature: string, contractAddresses: string[], userAddress: string, startTimeStamp: string, durationDays: string) => Promise<Record<string, bigint | string>>);
  publicDecrypt: (encryptedValue: string) => Promise<number | bigint>;
  generateKeypair: () => { publicKey: string; privateKey: string };
  createEIP712: (publicKey: string, contractAddresses: string[], startTimeStamp: string, durationDays: string) => { domain: Record<string, unknown>; types: { UserDecryptRequestVerification: Array<{ name: string; type: string }> }; message: Record<string, unknown> };
};

let sdkPromise: Promise<RelayerSdkModule> | null = null;

const tryGetGlobal = (): (() => Promise<void>) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const candidates = [
    (w.RelayerSDK as { initSDK?: () => Promise<void> } | undefined)?.initSDK,
    (w.relayerSDK as { initSDK?: () => Promise<void> } | undefined)?.initSDK,
    (w.zamaRelayerSDK as { initSDK?: () => Promise<void> } | undefined)?.initSDK,
  ];
  return candidates.find((fn): fn is () => Promise<void> => typeof fn === "function") ?? null;
};

export async function loadRelayerSdk(): Promise<RelayerSdkModule> {
  if (typeof window === "undefined") {
    throw new Error("Relayer SDK can only be loaded in the browser environment.");
  }

  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = (async () => {
    let initFn: (() => Promise<void>) | null = null;
    let sdkModule: RelayerSdkModule | null = null;

    initFn = tryGetGlobal();

    if (!initFn) {
      for (let i = 0; i < 50; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        initFn = tryGetGlobal();
        if (initFn) break;
      }
    }

    if (!initFn) {
      console.warn("[Relayer] CDN script is not loaded. Please verify that the Relayer SDK script is included and loaded correctly.");
    }

    if (!initFn) {
      throw new Error("Relayer SDK not loaded from CDN. Please ensure the script is loaded correctly.");
    }

    await initFn();

    if (!sdkModule) {
      const w = window as unknown as Record<string, unknown>;
      const candidates = [
        w.RelayerSDK as RelayerSdkModule | undefined,
        w.relayerSDK as RelayerSdkModule | undefined,
        w.zamaRelayerSDK as RelayerSdkModule | undefined,
      ];
      sdkModule = candidates.find((mod): mod is RelayerSdkModule => Boolean(mod && typeof mod.createInstance === "function")) ?? null;
    }

    if (!sdkModule) {
      throw new Error("Relayer SDK module not found after initialization. Please check CDN script loading.");
    }

    return sdkModule;
  })();

  return sdkPromise;
}

export type { RelayerInstance };
