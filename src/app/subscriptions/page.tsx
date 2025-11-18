"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { useAccount, useReadContract } from "wagmi";
import { useMemo } from "react";
import confidentialClubAbi from "@/lib/confidential-club-abi.json";
import { PostList } from "@/components/post/post-list";
import { usePageLoaded } from "@/hooks/use-page-loaded";
import { SectionHeader } from "@/components/layout/section-header";

const CONFIDENTIAL_CLUB_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_CLUB_ADDRESS || "";

export default function SubscriptionsPage() {
  const { address } = useAccount();
  usePageLoaded();

  const { data: followingPostsRaw, isLoading } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "getFollowingPosts",
    args: [address as `0x${string}`],
    query: {
      enabled: Boolean(address && CONFIDENTIAL_CLUB_ADDRESS),
    },
  });

  const followingPostIds = useMemo(() => {
    if (!followingPostsRaw || !Array.isArray(followingPostsRaw)) return [];
    return (followingPostsRaw as bigint[]).map((id) => Number(id));
  }, [followingPostsRaw]);

  const content = useMemo(() => {
    if (!address) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Please connect your wallet first.</div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</div>
        </div>
      );
    }

    if (followingPostIds.length === 0) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">No posts from creators you follow yet.</div>
        </div>
      );
    }

    return <PostList purchasedPostIds={followingPostIds} />;
  }, [address, isLoading, followingPostIds]);

  return (
    <AppLayout>
      <div className="px-6 py-8">
        <SectionHeader title="Following Feed" className="mb-6" />
        {content}
      </div>
    </AppLayout>
  );
}

