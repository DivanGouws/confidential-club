"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { usePageLoaded } from "@/hooks/use-page-loaded";

export default function MessagesPage() {
  usePageLoaded();
  return (
    <AppLayout>
      <div className="px-6 py-8">
        <h1 className="text-3xl font-semibold">Messages</h1>
        <div className="mt-12 text-center">
          <p className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">This feature is not available yet.</p>
          <p className="mt-4 text-lg text-zinc-500 dark:text-zinc-400">The direct messaging experience is under design. Please stay tuned.</p>
        </div>
      </div>
    </AppLayout>
  );
}

