"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { usePageLoaded } from "@/hooks/use-page-loaded";

export default function CollectionsPage() {
  usePageLoaded();
  return (
    <AppLayout>
      <div className="px-6 py-8">
        <h1 className="text-3xl font-semibold">Collections</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">This feature is under development.</p>
      </div>
    </AppLayout>
  );
}

