"use client";

import { useEffect, useState } from "react";

import { AppLayout } from "@/components/layout/app-layout";
import { PostList } from "@/components/post/post-list";
import { usePageLoaded } from "@/hooks/use-page-loaded";

export default function Home() {
  usePageLoaded();

  return (
    <AppLayout>
      <div className="px-6 py-8">
        <div className="space-y-8">
          <SearchAndList />
        </div>
      </div>
    </AppLayout>
  );
}

function SearchAndList() {
  const [query, setQuery] = useState("");
  const [filterPostId, setFilterPostId] = useState<number | null>(null);
  const [filterCreatorAddress, setFilterCreatorAddress] = useState<string | null>(null);
  // Remove refreshKey to prevent PostList from remounting

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const v = query.trim();
      if (!v) {
        setFilterPostId(null);
        setFilterCreatorAddress(null);
        return;
      }
      if (/^0x[a-fA-F0-9]{40}$/.test(v)) {
        setFilterCreatorAddress(v);
        setFilterPostId(null);
        return;
      }
      const numericInput = v.startsWith("#") ? v.slice(1).trim() : v;
      const n = Number(numericInput);
      if (Number.isInteger(n) && n > 0) {
        setFilterPostId(n);
        setFilterCreatorAddress(null);
        return;
      }
      setFilterPostId(null);
      setFilterCreatorAddress(null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.19 4.19a.75.75 0 11-1.06 1.06l-4.19-4.19A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" /></svg>
        </span>
        <input
          aria-label="Search posts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder="Search posts: enter post ID or creator address"
          className="w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-10 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M12 1.5a10.5 10.5 0 100 21 10.5 10.5 0 000-21zM9.53 8.47a.75.75 0 00-1.06 1.06L10.94 12l-2.47 2.47a.75.75 0 101.06 1.06L12 13.06l2.47 2.47a.75.75 0 101.06-1.06L13.06 12l2.47-2.47a.75.75 0 10-1.06-1.06L12 10.94 9.53 8.47z" clipRule="evenodd" /></svg>
          </button>
        )}
      </div>
      <div className="border-b border-zinc-300 dark:border-zinc-700 -mx-6" />
      <PostList filterPostId={filterPostId ?? undefined} filterCreatorAddress={filterCreatorAddress ?? undefined} />
    </div>
  );
}
