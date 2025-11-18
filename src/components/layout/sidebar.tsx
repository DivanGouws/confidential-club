"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { HomeIcon } from "@/components/icons/home";
import { ShoppingIcon } from "@/components/icons/shopping";
import { MessageIcon } from "@/components/icons/message";
import { HeartIcon } from "@/components/icons/heart";
import { UserIcon } from "@/components/icons/user";
import { RegisterIcon } from "@/components/icons/register";
import { StatsIcon } from "@/components/icons/stats";
import { WhitepaperIcon } from "@/components/icons/whitepaper";
import { CheckCircleIcon } from "@/components/icons/check-circle";
import { XCircleIcon } from "@/components/icons/x-circle";
import { LoaderIcon } from "@/components/icons/loader";
import { useRelayerSdk } from "@/components/providers/relayer-provider";
import { usePageLoading } from "@/components/providers/page-loading-provider";
import { useNotification } from "@/components/providers/notification-provider";
import { CreatePostModal } from "@/components/post/create-post-modal";
import confidentialClubAbi from "@/lib/confidential-club-abi.json";
import { fetchFromPinata } from "@/lib/pinata";
import { getUserProfileCache, setUserProfileCache, type CachedUserProfile } from "@/lib/cache";

const CONFIDENTIAL_CLUB_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_CLUB_ADDRESS || "";

export function Sidebar() {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const { sdk, loading, error, instance, instanceLoading, instanceError } = useRelayerSdk();
  const { startLoading } = usePageLoading();
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isDaytime, setIsDaytime] = useState(true);
  const [timePeriod, setTimePeriod] = useState<"morning" | "noon" | "afternoon" | "evening" | "night">("morning");
  const [profileNickname, setProfileNickname] = useState<string | null>(null);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [showRefreshTooltip, setShowRefreshTooltip] = useState(false);
  const { success: showSuccess, error: showError } = useNotification();

  const { data: profileCid } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "userProfileCid",
    args: [address as `0x${string}`],
    query: {
      enabled: Boolean(address && CONFIDENTIAL_CLUB_ADDRESS),
    },
  });

  useEffect(() => {
    const handlePostPublished = () => {
      setIsRefreshing(true);
      window.dispatchEvent(new CustomEvent("refreshPosts"));
    };

    window.addEventListener("postPublished", handlePostPublished);
    return () => window.removeEventListener("postPublished", handlePostPublished);
  }, []);

  useEffect(() => {
    if (lastRefreshTime === 0) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - lastRefreshTime;
      const left = Math.max(10000 - elapsed, 0);
      setRemainingMs(left);
      if (left === 0) {
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [lastRefreshTime]);

  const canRefresh = lastRefreshTime === 0 || remainingMs <= 0;

  const refreshTooltipText = useMemo(() => {
    if (remainingMs > 0) return String(Math.ceil(remainingMs / 1000));
    if (isRefreshing) return "Refreshing...";
    return "Refresh post list";
  }, [remainingMs, isRefreshing]);

  const handleRefresh = () => {
    if (!canRefresh || isRefreshing) return;
    
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent("refreshPosts"));
  };

  useEffect(() => {
    const onCompleted = (evt: Event) => {
      setIsRefreshing(false);
      const ce = evt as CustomEvent<{ success?: boolean; added?: number; error?: string }>;
      if (ce.detail && typeof ce.detail.success === "boolean") {
        if (ce.detail.success) {
          const suffix = ce.detail.added && ce.detail.added > 0 ? ` (+${ce.detail.added})` : "";
          showSuccess(`Refresh succeeded${suffix}`);
        } else {
          const errorSuffix = ce.detail.error ? `: ${ce.detail.error}` : "";
          showError(`Refresh failed${errorSuffix}`);
        }
      }
      const now = Date.now();
      setLastRefreshTime(now);
      setRemainingMs(10000);
    };
    window.addEventListener("refreshPostsCompleted", onCompleted as EventListener);
    return () => window.removeEventListener("refreshPostsCompleted", onCompleted as EventListener);
  }, [showSuccess, showError]);

  useEffect(() => {
    const updateTimeOfDay = () => {
      const now = new Date();
      const hour = now.getHours();
      setIsDaytime(hour >= 6 && hour < 18);
      
      if (hour >= 5 && hour < 9) {
        setTimePeriod("morning");
      } else if (hour >= 9 && hour < 12) {
        setTimePeriod("noon");
      } else if (hour >= 12 && hour < 18) {
        setTimePeriod("afternoon");
      } else if (hour >= 18 && hour < 22) {
        setTimePeriod("evening");
      } else {
        setTimePeriod("night");
      }
    };

    updateTimeOfDay();
    const interval = setInterval(updateTimeOfDay, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (!address || !profileCid || typeof profileCid !== "string" || profileCid.length === 0) {
        setProfileNickname(null);
        setProfileAvatar(null);
        return;
      }

      try {
        const cached = await getUserProfileCache(address);
        if (cached && cached.cid === profileCid) {
          setProfileNickname(cached.nickname);
          setProfileAvatar(cached.avatar);
          return;
        }

        const jsonText = await fetchFromPinata(profileCid);
        const data = JSON.parse(jsonText) as { nickname?: string; avatar?: string; twitter?: string; updatedAt?: string };

        const profile: CachedUserProfile = {
          nickname: data.nickname || null,
          avatar: data.avatar || null,
          twitter: data.twitter || null,
          cid: profileCid,
          updatedAt: data.updatedAt || new Date().toISOString(),
        };

        setProfileNickname(profile.nickname);
        setProfileAvatar(profile.avatar);
        await setUserProfileCache(address, profile);
      } catch (e) {
        console.error("Failed to load user profile:", e);
        setProfileNickname(null);
        setProfileAvatar(null);
      }
    };

    loadProfile();
  }, [address, profileCid]);

  const getInitStatusIcon = () => {
    if (loading || instanceLoading) return LoaderIcon;
    if (error || instanceError) return XCircleIcon;
    if (sdk && instance) return CheckCircleIcon;
    return XCircleIcon;
  };

  const getInitStatusLabel = () => {
    if (loading || instanceLoading) return "Relayer initializing...";
    if (error) return "SDK failed to load";
    if (instanceError) return "Relayer instance creation failed";
    if (!sdk) return "SDK not loaded";
    if (sdk && !instance) return "Waiting for wallet";
    return "Relayer ready";
  };

  const getStatusText = () => {
    if (error || instanceError) return "Something went wrong";
    if (sdk && instance && !loading && !instanceLoading && !error && !instanceError) return "Everything looks good";
    if (loading || instanceLoading) return "Initializing...";
    if (!sdk) return "Waiting for initialization";
    if (sdk && !instance) return "Waiting for wallet";
    return "Initializing...";
  };

  const warmTip = useMemo(() => {
    const tips = {
      morning: [
        { emoji: "🌅", text: "Good morning! New day begins." },
        { emoji: "🌄", text: "Dawn breaks. Have a great day!" },
        { emoji: "☀️", text: "Morning sun brings hope." },
        { emoji: "🌻", text: "Good morning 😊" },
      ],
      noon: [
        { emoji: "☀️", text: "Good noon! Take a break." },
        { emoji: "🌞", text: "Midday time. Relax and unwind." },
        { emoji: "☀️", text: "Noon time. Take care." },
        { emoji: "🌞", text: "Good noon! Stay positive." },
      ],
      afternoon: [
        { emoji: "☀️", text: "Good afternoon! Keep going." },
        { emoji: "🌤️", text: "Afternoon time. Stay focused." },
        { emoji: "☀️", text: "Good afternoon! Stay warm." },
        { emoji: "🌤️", text: "Afternoon time. Stay joyful." },
      ],
      evening: [
        { emoji: "🌇", text: "Good evening! You worked hard." },
        { emoji: "🌆", text: "Sunset. Thanks for efforts." },
        { emoji: "🌇", text: "Evening time. Relax a bit." },
        { emoji: "🌆", text: "Good evening! Rest well." },
      ],
      night: [
        { emoji: "🌙", text: "Late night. Remember to rest." },
        { emoji: "💤", text: "Deep night. Sweet dreams!" },
        { emoji: "💤", text: "Late night. Rest early." },
      ],
    };

    const periodTips = tips[timePeriod];
    const index = new Date().getDate() % periodTips.length;
    return periodTips[index];
  }, [timePeriod]);

  const navItems = [
    { label: "Home", icon: HomeIcon, path: "/" },
    { label: "My Purchases", icon: ShoppingIcon, path: "/purchases" },
    { label: "Following Feed", icon: HeartIcon, path: "/subscriptions" },
    { label: "My Posts", icon: UserIcon, path: "/profile" },
    { label: "Statistics", icon: StatsIcon, path: "/stats" },
    { label: "Profile Registration", icon: RegisterIcon, path: "/register" },
    { label: "Whitepaper", icon: WhitepaperIcon, path: "/whitepaper" },
    { label: "Messages", icon: MessageIcon, path: "/messages", disabled: true },
    { label: getInitStatusLabel(), icon: getInitStatusIcon(), path: "/init-status" },
  ];

  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "Not connected";

  const displayName = profileNickname || displayAddress;

  return (
    <aside className="h-full w-72 border-r border-zinc-300 bg-transparent dark:border-zinc-700 overflow-y-auto overflow-x-hidden">
      <div className="flex h-full flex-col px-6 py-6">
        {isConnected && address && (
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="relative h-10 w-10 shrink-0">
              {profileAvatar ? (
                <img src={profileAvatar} alt="Avatar" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600" />
              )}
              <div className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-zinc-100 dark:border-zinc-900 dark:bg-zinc-800">
                {isDaytime ? (
                  <svg className="h-2.5 w-2.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-2.5 w-2.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {displayName}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {getStatusText()}
              </p>
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            const isDisabled = item.disabled;
            const isHomePage = item.path === "/";
            
            return (
              <button
                key={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  if (isDisabled) return;
                  if (!isActive) {
                    startLoading();
                    router.push(item.path);
                  }
                }}
                disabled={isDisabled}
                className={`w-full group relative flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition ${
                  isDisabled
                    ? "text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-50"
                    : isActive
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                }`}
              >
                <item.icon
                  className={`h-6 w-6 shrink-0 ${
                    (loading || instanceLoading) && item.path === "/init-status" ? "animate-spin" : ""
                  } ${
                    (error || instanceError) && item.path === "/init-status"
                      ? "text-rose-500"
                      : sdk && instance && !loading && !instanceLoading && !error && !instanceError && item.path === "/init-status"
                        ? "text-emerald-500"
                        : ""
                  }`}
                />
                <span className="flex-1 text-left">{item.label}</span>
                {isHomePage && (
                  <div
                    className="relative"
                    onMouseEnter={() => setShowRefreshTooltip(true)}
                    onMouseLeave={() => setShowRefreshTooltip(false)}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canRefresh || isRefreshing) return;
                        handleRefresh();
                      }}
                      aria-disabled={!canRefresh || isRefreshing}
                      className={`flex items-center justify-center shrink-0 ${
                        !canRefresh || isRefreshing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                      }`}
                      aria-label="Refresh post list"
                    >
                      <LoaderIcon className={`h-5 w-5 ${
                        isRefreshing ? "animate-spin" : ""
                      }`} />
                    </div>
                    {showRefreshTooltip && refreshTooltipText && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2.5 py-1.5 text-xs whitespace-nowrap rounded-md border border-zinc-200 bg-white/90 text-zinc-900 backdrop-blur-md shadow-md z-50 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-100">
                        {refreshTooltipText}
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white dark:border-t-zinc-800" />
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
          
          <div className="pt-4">
            <button
              onClick={() => setIsCreatePostOpen(true)}
              className="shimmer-button w-full rounded-lg px-4 py-3 text-lg font-bold text-zinc-900 dark:text-zinc-900"
            >
              <span className="mr-2">+</span>
              New post
            </button>
          </div>

          <div className="pt-4">
            <div className="relative rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50 w-full">
              <div className="absolute -left-1 -top-1.5 rotate-[-12deg] text-sm font-medium text-slate-400 dark:text-slate-500 z-10">
                tip
              </div>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 flex items-start">
                <span className="mr-1.5 inline-block shrink-0">{warmTip.emoji}</span>
                <span className="inline-flex flex-wrap">
                  {warmTip.text.split("").map((char, index) => (
                    <span
                      key={index}
                      className="inline-block"
                    style={{
                      animationName: "bounce-char",
                      animationDuration: "2.5s",
                      animationTimingFunction: "ease-in-out",
                      animationIterationCount: "infinite",
                      animationDelay: `${index * 0.15}s`,
                    }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  ))}
                </span>
              </p>
            </div>
          </div>
        </nav>
      </div>

      <CreatePostModal
        isOpen={isCreatePostOpen}
        onClose={() => setIsCreatePostOpen(false)}
      />
    </aside>
  );
}

