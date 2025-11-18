"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { useRelayerSdk } from "@/components/providers/relayer-provider";
import { usePageLoaded } from "@/hooks/use-page-loaded";

export default function InitStatusPage() {
  const { sdk, loading, error, instance, instanceLoading, instanceError } = useRelayerSdk();
  usePageLoaded();

  return (
    <AppLayout>
      <div className="px-6 py-8">
        <h1 className="text-3xl font-semibold">Initialization Status</h1>
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              {loading && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              )}
              {error && (
                <div className="h-5 w-5 rounded-full bg-rose-500" />
              )}
              {sdk && !loading && !error && (
                <div className="h-5 w-5 rounded-full bg-emerald-500" />
              )}
              <div>
                <p className="font-medium">
                  {loading
                    ? "SDK loading..."
                    : error
                      ? "SDK failed to load"
                      : sdk
                        ? "SDK loaded"
                        : "SDK not loaded"}
                </p>
                {error && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {error.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              {instanceLoading && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              )}
              {instanceError && (
                <div className="h-5 w-5 rounded-full bg-rose-500" />
              )}
              {instance && !instanceLoading && !instanceError && (
                <div className="h-5 w-5 rounded-full bg-emerald-500" />
              )}
              <div>
                <p className="font-medium">
                  {instanceLoading
                    ? "Relayer instance is being created..."
                    : instanceError
                      ? "Failed to create Relayer instance"
                      : instance
                        ? "Relayer instance is ready"
                        : "Relayer instance is not created"}
                </p>
                {instanceError && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {instanceError.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

