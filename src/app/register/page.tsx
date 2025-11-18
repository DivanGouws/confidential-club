"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { useAccount } from "wagmi";
import { useWalletSession } from "@/hooks/use-wallet-session";
import { usePageLoaded } from "@/hooks/use-page-loaded";
import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import confidentialClubAbi from "@/lib/confidential-club-abi.json";
import { useNotification } from "@/components/providers/notification-provider";
import { fetchFromPinata } from "@/lib/pinata";
import { getUserProfileCache, setUserProfileCache } from "@/lib/cache";

const CONFIDENTIAL_CLUB_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_CLUB_ADDRESS;

export default function RegisterPage() {
  const { address } = useAccount();
  usePageLoaded();
  const { data: sessionData } = useWalletSession(Boolean(address));
  const { success, error: notifyError } = useNotification();
  
  const [avatar, setAvatar] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [twitter, setTwitter] = useState<string>("");
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const { writeContract, data: hash, isPending: isConfirming } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const registerSteps = [
    "Preparing registration",
    "Uploading profile to IPFS",
    "Waiting for wallet confirmation",
    "Registration completed",
  ];

  const isRegistering = isUploading || isConfirming || isSaving;

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
    const loadProfile = async () => {
      if (!address || !profileCid || typeof profileCid !== "string" || profileCid.length === 0) {
        return;
      }

      try {
        const cached = await getUserProfileCache(address);
        if (cached && cached.cid === profileCid) {
          setNickname(cached.nickname || "");
          setTwitter(cached.twitter || "");
          if (cached.avatar) {
            setAvatar(cached.avatar);
            setAvatarPreview(cached.avatar);
          }
          return;
        }

        const jsonText = await fetchFromPinata(profileCid);
        const data = JSON.parse(jsonText) as { nickname?: string; avatar?: string; twitter?: string; updatedAt?: string };

        const nextNickname = data.nickname || "";
        const nextTwitter = data.twitter || "";
        const nextAvatar = data.avatar || "";

        setNickname(nextNickname);
        setTwitter(nextTwitter);
        if (nextAvatar) {
          setAvatar(nextAvatar);
          setAvatarPreview(nextAvatar);
        }

        await setUserProfileCache(address, {
          nickname: nextNickname || null,
          avatar: nextAvatar || null,
          twitter: nextTwitter || null,
          cid: profileCid,
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to load existing profile:", error);
      }
    };

    loadProfile();
  }, [address, profileCid]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        notifyError("Image size must not exceed 2 MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setAvatar(result);
        setAvatarPreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    
    if (!nickname.trim()) {
      notifyError("Please enter a nickname");
      return;
    }

    setIsSaving(true);
    setIsUploading(true);
    setShowOverlay(true);
    setCurrentStepIndex(0);

    try {
      console.log("Uploading profile to IPFS...");
      setCurrentStepIndex(1);

      const doUpload = async () => {
        const res = await fetch("/api/profile/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            avatar: avatar || "",
            nickname: nickname.trim(),
            twitter: twitter.trim(),
            address,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Upload failed");
        }

        return res;
      };

      let response: Response;
      try {
        response = await doUpload();
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("fetch failed")) {
          console.error("[Register] First upload failed, retrying once:", err);
          response = await doUpload();
        } else {
          throw err;
        }
      }

      const data = await response.json();
      const ipfsCid = data.ipfsHash;
      console.log("IPFS upload succeeded, CID:", ipfsCid);

      setIsUploading(false);

      // Register on-chain
      console.log("Registering profile on-chain...");
      setCurrentStepIndex(2);
      writeContract({
        address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
        abi: confidentialClubAbi,
        functionName: "registerProfile",
        args: [ipfsCid],
      });
    } catch (error) {
      console.error("Failed to save profile:", error);
      const errorMessage = error instanceof Error ? error.message : "Save failed";
      notifyError(errorMessage);
      setIsSaving(false);
      setIsUploading(false);
      setShowOverlay(false);
    }
  };

  // 监听交易成功
  useEffect(() => {
    if (isSuccess && isSaving) {
      setCurrentStepIndex(registerSteps.length - 1);
      success("Profile registered successfully!");
      setIsSaving(false);
      setTimeout(() => {
        setShowOverlay(false);
      }, 800);
    }
  }, [isSuccess, isSaving, success, registerSteps.length]);

  return (
    <AppLayout>
      <div className="px-6 py-8">
        <h1 className="text-3xl font-semibold mb-6">Profile Registration</h1>
        
        {!address ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Please connect your wallet first.</div>
          </div>
        ) : (
          <div className="relative">
            {showOverlay && (
              <div
                className={`absolute inset-0 z-[60] flex items-start justify-center pt-16 md:pt-16 overlay-silver backdrop-blur-sm transition-opacity duration-500 ${
                  isRegistering ? "opacity-100" : "opacity-0"
                }`}
                onTransitionEnd={() => {
                  if (!isRegistering) {
                    setShowOverlay(false);
                  }
                }}
              >
                <div className="w-full max-w-sm px-6">
                  <div className="relative mx-auto h-16 w-16">
                    <div className="absolute inset-0 animate-ping rounded-full overlay-silver-ping opacity-75"></div>
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 overlay-silver-border bg-white/10 backdrop-blur-md">
                      <svg
                        className="h-8 w-8 animate-spin overlay-silver-text"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                  </div>
                  <div className="mt-6 w-full max-w-sm px-4 flex flex-col gap-2">
                    {currentStepIndex > 0 && (
                      <div className="text-center text-sm overlay-silver-text-dim transition-all duration-300">
                        ✓ {registerSteps[currentStepIndex - 1]}
                      </div>
                    )}
                    <div className="text-center text-base font-semibold overlay-silver-text transition-all duration-300">
                      {registerSteps[currentStepIndex]}
                    </div>
                    {currentStepIndex < registerSteps.length - 1 && (
                      <div className="text-center text-sm overlay-silver-text-dim transition-all duration-300">
                        {registerSteps[currentStepIndex + 1]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Profile form */}
            <div className="rounded-lg border border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold mb-4">Profile information</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Avatar upload */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Avatar
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 flex items-center justify-center">
                      <div className="h-20 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden flex items-center justify-center">
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-zinc-400 text-sm">No avatar</span>
                        )}
                      </div>
                      {avatarPreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setAvatar("");
                            setAvatarPreview("");
                          }}
                          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-medium text-white shadow hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                          aria-label="Clear avatar"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                        id="avatar-upload"
                      />
                      <label
                        htmlFor="avatar-upload"
                        className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-zinc-900 bg-zinc-200 hover:bg-zinc-300 dark:text-zinc-100 dark:bg-zinc-700 dark:hover:bg-zinc-600 inline-block"
                      >
                        Choose image
                      </label>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Supports JPG and PNG, maximum size 2 MB
                      </p>
                    </div>
                  </div>
                </div>

                {/* Nickname */}
                <div>
                  <label htmlFor="nickname" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Nickname
                  </label>
                  <input
                    type="text"
                    id="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Enter a nickname"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                    maxLength={20}
                  />
                </div>

                {/* Twitter link */}
                <div>
                  <label htmlFor="twitter" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Twitter (X)
                  </label>
                  <div className="flex items-center">
                    <span className="rounded-l-md border border-r-0 border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                      twitter.com/
                    </span>
                    <input
                      type="text"
                      id="twitter"
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value)}
                      placeholder="username"
                      className="flex-1 rounded-r-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                    />
                  </div>
                </div>

                {/* Submit button */}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving || !sessionData?.authenticated}
                    className="rounded-md bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {isUploading ? "Uploading to IPFS..." : isConfirming ? "Confirming transaction..." : isSaving ? "Registering..." : "Register"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

