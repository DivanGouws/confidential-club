"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { useAccount, useReadContract } from "wagmi";
import { useMemo } from "react";
import { formatEther } from "viem";
import confidentialClubAbi from "@/lib/confidential-club-abi.json";
import { usePageLoaded } from "@/hooks/use-page-loaded";

const CONFIDENTIAL_CLUB_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_CLUB_ADDRESS || "";

interface PostStatInfo {
  postId: bigint;
  price: bigint;
  purchaseCount: bigint;
  earnings: bigint;
  likeCount: bigint;
  dislikeCount: bigint;
}

export default function StatsPage() {
  const { address } = useAccount();
  usePageLoaded();

  const { data: fullStatsRaw, isLoading } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "getUserFullStats",
    args: [address as `0x${string}`],
    query: {
      enabled: Boolean(address && CONFIDENTIAL_CLUB_ADDRESS),
    },
  });

  const stats = useMemo(() => {
    if (!fullStatsRaw || !Array.isArray(fullStatsRaw) || fullStatsRaw.length < 4) {
      return {
        totalEarnings: BigInt(0),
        totalSpent: BigInt(0),
        followers: BigInt(0),
        postCount: 0,
        postStats: [] as PostStatInfo[],
      };
    }

    let totalEarnings: bigint = BigInt(0);
    let totalSpent: bigint = BigInt(0);
    let followers: bigint = BigInt(0);
    let postCount: bigint = BigInt(0);
    let postStats: PostStatInfo[] = [];

    if (fullStatsRaw.length >= 5) {
      const [te, ts, fw, pc, ps] = fullStatsRaw as [bigint, bigint, bigint, bigint, PostStatInfo[]];
      totalEarnings = te;
      totalSpent = ts;
      followers = fw;
      postCount = pc;
      postStats = ps || [];
    } else {
      const [te, fw, pc, ps] = fullStatsRaw as [bigint, bigint, bigint, PostStatInfo[]];
      totalEarnings = te;
      totalSpent = BigInt(0);
      followers = fw;
      postCount = pc;
      postStats = ps || [];
    }

    return {
      totalEarnings,
      totalSpent,
      followers,
      postCount: Number(postCount),
      postStats: postStats || [],
    };
  }, [fullStatsRaw]);

  const totalPurchases = useMemo(() => {
    return stats.postStats.reduce((sum, stat) => sum + stat.purchaseCount, BigInt(0));
  }, [stats.postStats]);

  const totalLikes = useMemo(() => {
    return stats.postStats.reduce((sum, stat) => sum + stat.likeCount, BigInt(0));
  }, [stats.postStats]);

  const totalDislikes = useMemo(() => {
    return stats.postStats.reduce((sum, stat) => sum + stat.dislikeCount, BigInt(0));
  }, [stats.postStats]);

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

    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-4">
              <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">Total earnings</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {formatEther(stats.totalEarnings)} ETH
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-4">
              <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">Total spent</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {formatEther(stats.totalSpent)} ETH
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-4">
              <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">Followers</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {Number(stats.followers).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-4">
              <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">Total purchases</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {Number(totalPurchases).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-4">
              <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">Published posts</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {stats.postCount}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
                <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">Total likes</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {Number(totalLikes).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-rose-600 dark:text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                </svg>
                <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">Total dislikes</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {Number(totalDislikes).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {stats.postStats.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">Post Statistics</h2>
            <div className="space-y-2">
              {stats.postStats.map((stat) => (
                <div key={Number(stat.postId)} className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Post #{Number(stat.postId)}</span>
                      <span>·</span>
                      <span>Price: {formatEther(stat.price)} ETH</span>
                      <span>·</span>
                      <span>{Number(stat.purchaseCount)} purchases</span>
                    </div>
                    <div className="text-right leading-tight">
                      <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatEther(stat.earnings)} ETH
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Earnings</div>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px]">
                    <div className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                      </svg>
                      <span className="font-medium">{Number(stat.likeCount)}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">Likes</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 00 11.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                      </svg>
                      <span className="font-medium">{Number(stat.dislikeCount)}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">Dislikes</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }, [address, isLoading, stats, totalPurchases, totalLikes, totalDislikes]);

  return (
    <AppLayout>
      <div className="px-6 py-8">
        <h1 className="text-3xl font-semibold mb-6">Statistics</h1>
        {content}
      </div>
    </AppLayout>
  );
}

