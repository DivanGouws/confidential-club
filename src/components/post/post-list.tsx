"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useWalletClient } from "wagmi";
import { formatEther } from "viem";
import React, { ReactElement, useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import confidentialClubAbi from "@/lib/confidential-club-abi.json";
import { getPinataUrl, fetchFromPinata } from "@/lib/pinata";
import { getPostJson, setPostJson, getPublicImageBlob, setPublicImageBlob, getUserProfileCache, setUserProfileCache, type CachedUserProfile } from "@/lib/cache";
import { decryptAESKey, decryptEncryptedContent } from "@/lib/post-utils";
import { decryptBytesAESGCM, hexToBytes } from "@/lib/encryption";
import { useRelayerSdk } from "@/components/providers/relayer-provider";
import { useNotification } from "@/components/providers/notification-provider";
import { CheckCircleIcon } from "@/components/icons/check-circle";
import { HeartIcon } from "@/components/icons/heart";
import { CopyIcon } from "@/components/icons/copy";
import { XCircleIcon } from "@/components/icons/x-circle";
import { SealedStrip } from "./sealed-strip";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const MOSAIC_CHARS = ["█", "▓", "▒", "░", "▄", "▀", "▌", "▐"];

function DynamicMosaic({ length }: { length: number }) {
  const [chars, setChars] = useState<string[]>(() => 
    Array.from({ length }, () => MOSAIC_CHARS[Math.floor(Math.random() * MOSAIC_CHARS.length)])
  );
  const [opacities, setOpacities] = useState<number[]>(() =>
    Array.from({ length }, () => 0.7 + Math.random() * 0.3)
  );
  const [durations] = useState<number[]>(() =>
    Array.from({ length }, () => 1.5 + Math.random() * 1.0)
  );

  useEffect(() => {
    const intervalDelay = 1500 + Math.random() * 1000;
    const interval = setInterval(() => {
      setChars((prev) => 
        prev.map(() => MOSAIC_CHARS[Math.floor(Math.random() * MOSAIC_CHARS.length)])
      );
      setOpacities((prev) => 
        prev.map(() => 0.7 + Math.random() * 0.3)
      );
    }, intervalDelay);

    return () => clearInterval(interval);
  }, [length]);

  return (
    <span className="inline-block font-mono" style={{ letterSpacing: "0.05em" }}>
      {chars.map((char, idx) => (
        <span
          key={idx}
          className="inline-block transition-opacity duration-300"
          style={{
            opacity: opacities[idx],
            animation: `mosaic-flicker ${durations[idx]}s ease-in-out infinite`,
            animationDelay: `${idx * 0.1}s`,
            width: "1ch",
            textAlign: "center",
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

// SealedStrip reusable component; default label is "Encrypted image"

const CONFIDENTIAL_CLUB_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_CLUB_ADDRESS || "";

interface Segment {
  type: "text" | "encrypted";
  content?: string;
  plainTextIndex?: number;
  encryptedIndex?: number;
  length?: number;
  start?: number;
}

interface PostData {
  segments?: Segment[];
  plainTextSegments?: Array<{ index: number; content: string; start: number }>;
  encryptedSegments?: string[];
  images?: Array<{ path: string; iv: string | null; mime: string; name: string; size: number; encrypted: boolean }>;
  version?: string;
}

function getAvatarStyle(address: string | null): CSSProperties {
  if (!address) {
    return {
      backgroundColor: "#27272a",
    };
  }
  const hash = Array.from(address)
    .map((char) => char.charCodeAt(0))
    .reduce((acc, code) => acc + code, 0);
  const hue = hash % 360;
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${hue}, 70%, 60%), hsl(${(hue + 45) % 360}, 70%, 55%))`,
  };
}

function formatAddress(address: string | null): string {
  if (!address || address.length < 10) return address ?? "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function PostContent({ postId, purchased, shouldDecrypt, onDecryptEnd, onDecryptStart, onProgress, onContentLoaded }: { postId: number; purchased: boolean; shouldDecrypt: boolean; onDecryptEnd?: (success: boolean) => void; onDecryptStart?: () => void; onProgress?: (text: string, hasText?: boolean, hasImages?: boolean) => void; onContentLoaded?: (stats: { encryptedTextCount: number; encryptedImageCount: number }) => void }) {
  const { instance: relayerInstance } = useRelayerSdk();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { notice, error: notifyError } = useNotification();
  const [content, setContent] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [decryptedSegments, setDecryptedSegments] = useState<Map<number, string>>(new Map());
  const [images, setImages] = useState<Array<{ path: string; iv: string | null; mime: string; name: string; size: number; encrypted: boolean }>>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [decryptedImages, setDecryptedImages] = useState<Map<string, string>>(new Map());
  const [imageErrors, setImageErrors] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDecryptedRef = useRef(false);
  const ipfsHashRef = useRef<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const COLLAPSE_MAX_LINES = images.length > 0 ? 8 : 10;  // Show 8 lines when images exist, otherwise 10 lines
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Use a sensible default so initial render is already clamped
  const [lineHeightPx, setLineHeightPx] = useState<number>(24);
  const [measuredLines, setMeasuredLines] = useState<number | null>(null);
  const isCollapsible = measuredLines !== null
    ? measuredLines > COLLAPSE_MAX_LINES
    : (!!content && (content.trim().length >= 100 || segments.length >= 5));
  const [mounted, setMounted] = useState(false);

  const globalStateKey = address ? `${postId}:${address.toLowerCase()}` : null;

  // Automatically expand after decryption completes
  useEffect(() => {
    if (decryptedSegments.size > 0) {
      setCollapsed(false);
    }
  }, [decryptedSegments.size]);

  useEffect(() => {
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      const cs = window.getComputedStyle(el);
      let lh = parseFloat(cs.lineHeight);
      if (Number.isNaN(lh)) {
        const fs = parseFloat(cs.fontSize);
        lh = Number.isNaN(fs) ? 20 : fs * 1.5;
      }
      setLineHeightPx(lh);
      const lines = Math.max(1, Math.round(el.scrollHeight / lh));
      setMeasuredLines(lines);
    };

    // Measure initially and when dependencies change
    measure();
    // Re-measure on window resize
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [content, segments, decryptedSegments]);

  const { data: ipfsHash, isLoading: isLoadingHash } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "postIdToIpfsHash",
    args: [BigInt(postId)],
    query: {
      enabled: Boolean(CONFIDENTIAL_CLUB_ADDRESS),
    },
  });

  const { refetch: refetchHandle } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "getCiphertextHandle",
    args: [BigInt(postId)],
    account: address,
    query: {
      enabled: false,
    },
  });

  useEffect(() => {
    const loadContent = async () => {
      if (isLoadingHash) {
        setLoading(true);
        return;
      }

      hasDecryptedRef.current = false;
      setDecryptedSegments(new Map());
      setDecryptedImages((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return new Map();
      });
      setImageErrors(new Map());
      setContent(null);
      setError(null);

      let hashString: string | null = null;
      if (ipfsHash) {
        if (typeof ipfsHash === "string") {
          hashString = ipfsHash;
        } else {
          hashString = String(ipfsHash);
        }
      }

      if (!hashString || hashString.length === 0) {
        setLoading(false);
        setError("Unable to read IPFS hash from contract");
        return;
      }

      ipfsHashRef.current = hashString;

      setLoading(true);
      setError(null);
      try {
        // Prefer cached JSON when available
        const cached = await getPostJson(hashString);
        let postData: PostData | null = (cached && typeof cached === 'object') ? (cached as PostData) : null;
        if (!postData) {
          const contentUrl = getPinataUrl(`${hashString}/post/content.json`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          let contentData: string;
          try {
            const response = await fetch(contentUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
              throw new Error(`Failed to fetch post content from IPFS: ${response.status} ${response.statusText}`);
            }
            contentData = await response.text();
          } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
              throw new Error('Fetching post content from IPFS timed out (30 seconds)');
            }
            throw error;
          }
          if (!contentData) {
            setError("Unable to fetch post content: it may not have been uploaded to IPFS yet, or an upload error occurred");
            setLoading(false);
            return;
          }
          try {
            postData = JSON.parse(contentData);
          } catch {
            setError("Post content format is invalid");
            setLoading(false);
            return;
          }
          try { await setPostJson(hashString, postData); } catch {}
        }

        if (!postData) {
          setError("Unable to fetch post content: it may not have been uploaded to IPFS yet, or an upload error occurred");
          setLoading(false);
          return;
        }

        const pd = postData as PostData;
        const loadedSegments = pd.segments || [];
        const plainTextSegments = pd.plainTextSegments || [];
        const encryptedSegments = pd.encryptedSegments || [];
        
        if (loadedSegments.length === 0) {
          setError("Post data format is invalid: missing segments information");
          setLoading(false);
          return;
        }

        const processedSegments: Segment[] = loadedSegments.map((seg) => {
          if (seg.content) {
            return {
              ...seg,
              content: seg.type === "text" ? seg.content.replace(/×/g, "") : seg.content,
            };
          }
          if (seg.type === "text" && seg.plainTextIndex !== undefined) {
            const plainText = plainTextSegments[seg.plainTextIndex];
            const content = (plainText?.content || "").replace(/×/g, "");
            return {
              ...seg,
              content,
            };
          } else if (seg.type === "encrypted" && seg.encryptedIndex !== undefined) {
            const encryptedText = encryptedSegments[seg.encryptedIndex];
            return {
              ...seg,
              content: encryptedText || "",
            };
          }
          return seg;
        });

        const finalSegments = processedSegments;
        setSegments(finalSegments);
        setImages(pd.images || []);
        
        // Calculate and report encrypted content stats
        const encryptedTextCount = finalSegments.filter(seg => seg.type === 'encrypted').length;
        const encryptedImageCount = (pd.images || []).filter(img => img.encrypted).length;
        onContentLoaded?.({ encryptedTextCount, encryptedImageCount });

        const loadedImageUrls = new Map<string, string>();
        const imageList = pd.images || [];
        
        for (const img of imageList) {
          if (!img) continue;
          const imagePathRaw = img.path || "";
          const imagePath = imagePathRaw.startsWith("/") ? imagePathRaw.slice(1) : imagePathRaw;
          if (!img.encrypted && imagePath) {
            try {
              const cached = await getPublicImageBlob(hashString, imagePath);
              if (cached) {
                const url = URL.createObjectURL(cached);
                loadedImageUrls.set(img.path, url);
              } else {
                const imageUrlWithPost = getPinataUrl(`${hashString}/post/${imagePath}`);
                loadedImageUrls.set(img.path, imageUrlWithPost);
                fetch(imageUrlWithPost)
                  .then(r => r.ok ? r.blob() : Promise.reject(new Error(`${r.status}`)))
                  .then(async b => { await setPublicImageBlob(hashString, imagePath, b); })
                  .catch(() => {});
              }
            } catch {
              const imageUrlWithPost = getPinataUrl(`${hashString}/post/${imagePath}`);
              loadedImageUrls.set(img.path, imageUrlWithPost);
            }
          }
        }
        setImageUrls(loadedImageUrls);

        const fullContentParts: string[] = [];
        processedSegments.forEach((seg) => {
          if (seg.type === "text") {
            fullContentParts.push(seg.content || "");
          } else if (seg.type === "encrypted") {
            const placeholderLength = seg.length || 4;
            fullContentParts.push("█".repeat(Math.max(placeholderLength, 1)));
          }
        });

        const fullContent = fullContentParts.join("");
        setContent(fullContent);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load post content");
      } finally {
        setLoading(false);
      }
    };

          loadContent();
        }, [postId, ipfsHash, isLoadingHash, onContentLoaded]);

  // Restore in-memory global state after navigation within the SPA
  useEffect(() => {
    const restoreDecryptedState = () => {
      if (!globalStateKey || hasDecryptedRef.current || segments.length === 0) return;
      if (typeof window === "undefined") return;

      const w = window as unknown as {
        __confidentialPostState?: Record<string, {
          decryptedSegments: Array<[number, string]>;
          decryptedImages: Array<[string, string]>;
          fullContent: string;
          collapsed: boolean;
        }>;
      };

      const map = w.__confidentialPostState;
      if (!map) return;

      const entry = map[globalStateKey];
      if (!entry) return;

      const restoredSegments = new Map<number, string>(entry.decryptedSegments);
      const restoredImages = new Map<string, string>(entry.decryptedImages);

      setDecryptedSegments(restoredSegments);
      setDecryptedImages(restoredImages);
      hasDecryptedRef.current = restoredSegments.size > 0;
      setContent(entry.fullContent);
      setCollapsed(entry.collapsed);

      if (restoredSegments.size > 0) {
        onDecryptEnd?.(true);
      }
    };

    restoreDecryptedState();
  }, [globalStateKey, segments.length, onDecryptEnd]);

  const decryptedImagesRef = useRef<Map<string, string>>(new Map());
  const imageUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    decryptedImagesRef.current = decryptedImages;
  }, [decryptedImages]);

  useEffect(() => {
    imageUrlsRef.current = imageUrls;
  }, [imageUrls]);

  useEffect(() => {
    return () => {
      decryptedImagesRef.current.forEach((url) => URL.revokeObjectURL(url));
      imageUrlsRef.current.forEach((u) => { if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u); });
    };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  useEffect(() => {
    if (!shouldDecrypt) {
      return;
    }

    if (!purchased) {
      onDecryptEnd?.(false);
      return;
    }

    if (segments.length === 0) {
      onDecryptEnd?.(false);
      return;
    }

    if (hasDecryptedRef.current) {
      onDecryptEnd?.(true);
      return;
    }

    if (decryptedSegments.size > 0) {
      hasDecryptedRef.current = true;
      onDecryptEnd?.(true);
      return;
    }

    if (!relayerInstance) {
      notice("Relayer instance is not ready yet. Please try again later.");
      onDecryptEnd?.(false);
      return;
    }

    if (!address) {
      notice("Please connect your wallet first.");
      onDecryptEnd?.(false);
      return;
    }

    if (!walletClient) {
      notice("Wallet client is not ready yet. Please try again later.");
      onDecryptEnd?.(false);
      return;
    }

    let cancelled = false;

    const decryptContent = async () => {
      try {
        setError(null);
        onDecryptStart?.();
        
        // Compute which types of content need to be decrypted
        const totalEncryptedText = segments.filter((s) => s.type === "encrypted").length;
        const totalEncryptedImages = images.filter((img) => img.encrypted && img.iv).length;
        const hasText = totalEncryptedText > 0;
        const hasImages = totalEncryptedImages > 0;
        
        onProgress?.("Preparing to decrypt...", hasText, hasImages);

        console.log("[PostContent] Starting to retrieve ciphertext handle...");
        onProgress?.("Retrieving ciphertext handle...", hasText, hasImages);
        let handleResult;
        try {
          handleResult = await refetchHandle();
          console.log("[PostContent] handleResult:", handleResult);
        } catch (err) {
          console.error("[PostContent] Failed to fetch handle:", err);
          if (err instanceof Error && (err.name === "UserRejectedRequestError" || err.message.includes("User rejected") || err.message.includes("denied request") || err.message.includes("User denied"))) {
            notice("Signature was cancelled; decryption did not complete.");
            onDecryptEnd?.(false);
            return;
          }
          throw err;
        }

        const currentHandle = handleResult?.data;
        console.log("[PostContent] currentHandle:", currentHandle);

        if (!currentHandle) {
          const errorObj = handleResult?.error || new Error("Unknown error");
          console.error("[PostContent] Handle is empty, full error:", errorObj);
          throw errorObj instanceof Error ? errorObj : new Error(String(errorObj));
        }

        let handleString: string;
        if (typeof currentHandle === "string") {
          handleString = currentHandle;
        } else {
          const bytes = Array.isArray(currentHandle) ? currentHandle : Array.from(new Uint8Array(currentHandle as unknown as ArrayBuffer));
          handleString = `0x${bytes.map((b: number) => b.toString(16).padStart(2, "0")).join("")}`;
        }

        if (!handleString.startsWith("0x")) {
          handleString = `0x${handleString}`;
        }

        console.log("[PostContent] Ciphertext handle retrieved; starting decryption...");
        onProgress?.("Ciphertext handle retrieved");

        const encryptedSegments = segments.filter((seg) => seg.type === "encrypted" && seg.content);
        if (encryptedSegments.length === 0) {
          throw new Error("There is no encrypted content to decrypt");
        }

        console.log("[PostContent] Starting to decrypt AES key...");
        onProgress?.("Waiting for wallet signature...");
        const aesKeyHex = await decryptAESKey(
          handleString,
          relayerInstance,
          CONFIDENTIAL_CLUB_ADDRESS,
          walletClient,
          address
        );
        console.log("[PostContent] AES key decrypted successfully");
        onProgress?.("AES key decrypted successfully");

        const newDecryptedMap = new Map<number, string>();
        if (totalEncryptedText > 0) {
          onProgress?.(`Decrypting text (${totalEncryptedText} segments total)...`);
        }
        for (let i = 0; i < segments.length; i++) {
          if (cancelled) return;
          const seg = segments[i];
          if (seg.type === "encrypted" && seg.content) {
            try {
              const decrypted = decryptEncryptedContent(seg.content, aesKeyHex);
              newDecryptedMap.set(i, decrypted);
              onProgress?.(`Text decryption progress: ${Array.from(newDecryptedMap.keys()).length}/${totalEncryptedText}`);
            } catch (err) {
              console.error(`[PostContent] Failed to decrypt paragraph ${i + 1}:`, err);
              throw err;
            }
          }
        }

        console.log("[PostContent] All text segments decrypted");
        if (totalEncryptedText > 0) {
          onProgress?.("Text decryption completed");
        }

        const newDecryptedImageMap = new Map<string, string>();
        const hashString = typeof ipfsHash === "string" ? ipfsHash : String(ipfsHash);
        
        if (totalEncryptedImages > 0) {
          onProgress?.(`Decrypting images (${totalEncryptedImages} total)...`);
        }
        let imageIndex = 0;
        for (const img of images) {
          if (cancelled) return;
          if (img.encrypted && img.iv) {
            imageIndex++;
            try {
              console.log(`[PostContent] Starting to decrypt image: ${img.path}`);
              onProgress?.(`Decrypting image ${imageIndex}/${totalEncryptedImages}...`);
              const imagePath = img.path.startsWith("/") ? img.path.slice(1) : img.path;
              // First try with "post/" prefix; if that fails, try without it
              const withPost = getPinataUrl(`${hashString}/post/${imagePath}`);
              const withoutPost = getPinataUrl(`${hashString}/${imagePath}`);
              console.log(`[PostContent] Encrypted image path: ${imagePath}`);
              console.log(`[PostContent] Trying URL 1 (with post/): ${withPost}`);
              let response = await fetch(withPost);
              if (!response.ok) {
                console.warn(`[PostContent] Encrypted image URL1 failed, trying URL2: ${withoutPost}`);
                response = await fetch(withoutPost);
              }
              if (!response.ok) {
                console.error(`[PostContent] Failed to load encrypted image: ${img.path}, status: ${response.status} ${response.statusText}`);
                continue;
              }
              const encryptedData = await response.arrayBuffer();
              const ivBytes = hexToBytes(img.iv);
              const decryptedBytes = await decryptBytesAESGCM(encryptedData, aesKeyHex, ivBytes);
              const blob = new Blob([decryptedBytes.buffer.slice(decryptedBytes.byteOffset, decryptedBytes.byteOffset + decryptedBytes.byteLength) as ArrayBuffer], { type: img.mime });
              const decryptedUrl = URL.createObjectURL(blob);
              newDecryptedImageMap.set(img.path, decryptedUrl);
              console.log(`[PostContent] Image decrypted successfully: ${img.path}`);
            } catch (err) {
              console.error(`[PostContent] Failed to decrypt image ${img.path}:`, err);
            }
          }
        }

        console.log("[PostContent] All images decrypted");
        if (totalEncryptedImages > 0) {
          onProgress?.("Image decryption completed");
        }

        if (cancelled) {
          return;
        }

        const fullContentParts: string[] = [];
        segments.forEach((seg, idx) => {
          if (seg.type === "text") {
            fullContentParts.push(seg.content || "");
          } else if (seg.type === "encrypted") {
            const decrypted = newDecryptedMap.get(idx) || "";
            fullContentParts.push(decrypted);
          }
        });

        const fullContent = fullContentParts.join("");
        hasDecryptedRef.current = true;
        setDecryptedSegments(newDecryptedMap);
        setDecryptedImages(newDecryptedImageMap);
        setContent(fullContent);

        // 在单页应用内部导航时保留当前帖子的解密状态（内存级，全局刷新会丢失）
        if (globalStateKey && typeof window !== "undefined") {
          const w = window as unknown as {
            __confidentialPostState?: Record<string, {
              decryptedSegments: Array<[number, string]>;
              decryptedImages: Array<[string, string]>;
              fullContent: string;
              collapsed: boolean;
            }>;
          };
          if (!w.__confidentialPostState) {
            w.__confidentialPostState = {};
          }
          w.__confidentialPostState[globalStateKey] = {
            decryptedSegments: Array.from(newDecryptedMap.entries()),
            decryptedImages: Array.from(newDecryptedImageMap.entries()),
            fullContent,
            collapsed: false,
          };
        }

        console.log("[PostContent] Decryption finished");
        onProgress?.("Decryption finished");
        onDecryptEnd?.(true);
      } catch (err) {
        console.error("[PostContent] Decryption error:", err);
        if (err instanceof Error && (err.name === "UserRejectedRequestError" || err.message.includes("User rejected") || err.message.includes("denied request") || err.message.includes("User denied"))) {
          notice("Signature was cancelled; decryption did not complete.");
          setError(null);
          onProgress?.("Signature cancelled");
        } else if (err instanceof Error && (err.message.includes("relayer respond with HTTP code 500") || err.message.includes("User decrypt failed"))) {
          notifyError("Decryption failed: Relayer decryption service is temporarily unavailable. Please try again later.");
          setError(null);
        } else {
          const errorMessage = err instanceof Error 
            ? `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ''}`
            : String(err);
          setError(errorMessage);
        }
        onProgress?.("Decryption failed");
        onDecryptEnd?.(false);
      }
    };

    decryptContent();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldDecrypt, purchased, segments.length, images.length, relayerInstance, address, walletClient, postId, ipfsHash, refetchHandle]);

  if (loading) {
    return (
      <div className="mt-1 mb-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">Loading content...</div>
    );
  }

  if (error) {
    return (
      <div className="mt-1 mb-3 py-3 text-sm text-rose-500 dark:text-rose-400">Error: {error}</div>
    );
  }

  if (!content) {
    return null;
  }

  if (segments.length === 0) {
    return (
      <div className="mt-1 mb-3">
        <div className="relative">
          <div
            ref={contentRef}
            style={isCollapsible && collapsed ? { maxHeight: `${lineHeightPx * COLLAPSE_MAX_LINES}px` } : undefined}
            className={`whitespace-pre-wrap break-words text-sm text-zinc-900 dark:text-zinc-50 ${isCollapsible && collapsed ? "overflow-hidden" : ""}`}
          >
            {content}
            {isCollapsible && collapsed && (
              <>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent dark:from-zinc-900 dark:via-zinc-900/40" />
                <div 
                  className="absolute inset-x-0 bottom-0 h-16 cursor-pointer"
                  onClick={() => setCollapsed(false)}
                />
              </>
            )}
          </div>
          {isCollapsible && collapsed && (
            <div className="pointer-events-none absolute inset-x-0 -bottom-2 flex justify-center">
              <div className="p-0 text-zinc-700/80 dark:text-zinc-200/80">
                <div
                  className="inline-flex items-center justify-center animate-bounce"
                  style={{ animationDuration: "2.5s", animationTimingFunction: "ease-in-out" }}
                >
                  <ChevronDownIcon className="h-6 w-6" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const parts: ReactElement[] = [];

    segments.forEach((segment, idx) => {
      if (segment.type === "text") {
        parts.push(
          <span key={`text-${idx}`} className="text-zinc-900 dark:text-zinc-50">
            {segment.content || ""}
          </span>
        );
      } else if (segment.type === "encrypted") {
        const decrypted = decryptedSegments.get(idx);
        const placeholderLength = segment.length || 4;

        parts.push(
          <span
            key={`encrypted-${idx}`}
            className={`relative inline-block rounded ${
              decrypted
                ? "bg-yellow-200 text-zinc-900 dark:bg-yellow-900/60 dark:text-yellow-100"
                : "px-1.5 py-0.5 text-xs bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 border border-white/60 dark:border-white/40"
            }`}
          >
            {decrypted ? (
              <span>{decrypted}</span>
            ) : (
              <DynamicMosaic length={Math.max(placeholderLength, 1)} />
            )}
          </span>
        );
      }
    });

    return parts;
  };

  return (
    <div className="mt-1 mb-3">
      <div className="relative">
        <div
          ref={contentRef}
          style={isCollapsible && collapsed && lineHeightPx ? { maxHeight: `${lineHeightPx * COLLAPSE_MAX_LINES}px` } : undefined}
          className={`relative whitespace-pre-wrap break-words text-base sm:text-lg leading-relaxed ${isCollapsible && collapsed ? "overflow-hidden" : ""}`}
        >
          {renderContent()}
          {isCollapsible && collapsed && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent dark:from-zinc-900 dark:via-zinc-900/40" />
              <div 
                className="absolute inset-x-0 bottom-0 h-20 cursor-pointer"
                onClick={() => setCollapsed(false)}
              />
            </>
          )}
        </div>
        {isCollapsible && collapsed && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-2 flex justify-center">
            <div className="p-0 text-zinc-700/80 dark:text-zinc-200/80">
              <div
                className="inline-flex items-center justify-center animate-bounce"
                style={{ animationDuration: "2.5s", animationTimingFunction: "ease-in-out" }}
              >
                <ChevronDownIcon className="h-6 w-6" />
              </div>
            </div>
          </div>
        )}
      </div>
      {images.length > 0 && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1">
          {images.map((img) => {
            const publicUrl = imageUrls.get(img.path);
            const decryptedUrl = decryptedImages.get(img.path);
            const displayUrl = decryptedUrl || publicUrl;
            const hasError = imageErrors.get(img.path);
            
            return (
              <div key={img.path} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                {displayUrl && !hasError ? (
                  <img
                    src={displayUrl}
                    alt={img.name}
                    className="w-full h-full object-contain cursor-zoom-in"
                    onClick={() => {
                      setLightboxUrl(displayUrl);
                      setLightboxName(img.name);
                    }}
                    onError={() => {
                      setImageErrors((prev) => {
                        const newMap = new Map(prev);
                        newMap.set(img.path, true);
                        return newMap;
                      });
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 relative">
                    {img.encrypted && !hasError && <SealedStrip text="Encrypted image" durationSec={40} />}
                    {!img.encrypted && (
                      <div className="text-center relative z-10">
                        {hasError ? (
                          <>
                            <div className="text-xs text-rose-500 dark:text-rose-400 mb-2">
                              Failed to load image
                            </div>
                            {publicUrl && (
                              <div className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 break-all px-2">
                                {publicUrl}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              Loading...
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {img.encrypted && !decryptedUrl && !hasError && displayUrl && (
                  <SealedStrip text="Encrypted image" durationSec={40} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {mounted && lightboxUrl && createPortal(
        (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70" onClick={() => setLightboxUrl(null)}>
            <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setLightboxUrl(null)}
                className="absolute -top-3 -right-3 rounded-full bg-zinc-200 text-zinc-700 shadow hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
              >
                <XCircleIcon className="h-7 w-7" />
              </button>
              <img
                src={lightboxUrl}
                alt={lightboxName || "image"}
                className="block max-w-[95vw] max-h-[90vh] object-contain rounded-md shadow-lg"
              />
            </div>
          </div>
        ),
        document.body
      )}
    </div>
  );
}

interface PostItemProps {
  postId: number;
  creatorAddress: string | null;
}

function PostItem({ postId, creatorAddress: _creatorAddress }: PostItemProps) {
  const { address } = useAccount();
  const { notice, success: notifySuccess, error: notifyError } = useNotification();
  const [shouldDecrypt, setShouldDecrypt] = useState(false);
  const [decryptSuccess, setDecryptSuccess] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [decryptSteps, setDecryptSteps] = useState<string[]>([
    "Preparing to decrypt",
    "Retrieving ciphertext handle",
    "Waiting for wallet signature",
    "AES key decrypted successfully",
    "Decrypting text content",
    "Decrypting image content",
    "Decryption completed"
  ]);
  const [creatorProfile, setCreatorProfile] = useState<CachedUserProfile | null>(null);
  const [encryptedTextCount, setEncryptedTextCount] = useState(0);
  const [encryptedImageCount, setEncryptedImageCount] = useState(0);
  
  const handleContentLoaded = useCallback((stats: { encryptedTextCount: number; encryptedImageCount: number }) => {
    setEncryptedTextCount(stats.encryptedTextCount);
    setEncryptedImageCount(stats.encryptedImageCount);
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      notifySuccess("Copied successfully");
    } catch (err) {
      notifyError(`Failed to copy: ${String(err)}`);
    }
  };

  const updateProgressStep = (text: string, hasText?: boolean, hasImages?: boolean) => {
    // Dynamically update step list
    if (hasText !== undefined && hasImages !== undefined) {
      const baseSteps = [
        "Preparing to decrypt",
        "Retrieving ciphertext handle",
        "Waiting for wallet signature",
        "AES key decrypted successfully"
      ];
      const contentSteps = [];
      if (hasText) contentSteps.push("Decrypting text content");
      if (hasImages) contentSteps.push("Decrypting image content");
      const finalSteps = [...baseSteps, ...contentSteps, "Decryption completed"];
      setDecryptSteps(finalSteps);
    }

    // Update current step index
    const steps = hasText !== undefined && hasImages !== undefined 
      ? (() => {
          const baseSteps = ["Preparing to decrypt", "Retrieving ciphertext handle", "Waiting for wallet signature", "AES key decrypted successfully"];
          const contentSteps = [];
          if (hasText) contentSteps.push("Decrypting text content");
          if (hasImages) contentSteps.push("Decrypting image content");
          return [...baseSteps, ...contentSteps, "Decryption completed"];
        })()
      : decryptSteps;

    if (text.includes("Preparing")) setCurrentStepIndex(0);
    else if (text.includes("Retrieving") || text.includes("ciphertext handle")) setCurrentStepIndex(1);
    else if (text.includes("Waiting") || text.includes("signature")) setCurrentStepIndex(2);
    else if (text.includes("AES key") || text.includes("key decrypted")) setCurrentStepIndex(3);
    else if (text.includes("text") || text.includes("Text") || text.includes("paragraph")) {
      const textIndex = steps.indexOf("Decrypting text content");
      if (textIndex >= 0) setCurrentStepIndex(textIndex);
    }
    else if (text.includes("image") || text.includes("Image")) {
      const imageIndex = steps.indexOf("Decrypting image content");
      if (imageIndex >= 0) setCurrentStepIndex(imageIndex);
    }
    else if (text.includes("completed") || text.includes("finished")) {
      setCurrentStepIndex(steps.length - 1);
    }
  };

  const { data: fullInfoRaw, isLoading, refetch } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "getPostFullInfo",
    args: [BigInt(postId)],
    account: address,
    query: {
      enabled: Boolean(CONFIDENTIAL_CLUB_ADDRESS),
    },
  });

  const { instance: relayerInstance } = useRelayerSdk();
  const { writeContract, data: hash, isPending: isConfirming, error: writeError } = useWriteContract();
  const { isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({ hash });

  const purchased = fullInfoRaw && Array.isArray(fullInfoRaw) && fullInfoRaw.length >= 11
    ? (fullInfoRaw as [bigint, boolean, boolean, bigint, bigint, string, bigint, boolean, bigint, bigint, number])[2]
    : false;

  const [price, exists, purchasedValue, timestamp, purchaseCount, postCreator, creatorFollowerCount, isFollowingCreator, likeCount, dislikeCount, userReaction] = fullInfoRaw && Array.isArray(fullInfoRaw) && fullInfoRaw.length >= 11
    ? (fullInfoRaw as [bigint, boolean, boolean, bigint, bigint, string, bigint, boolean, bigint, bigint, number])
    : [BigInt(0), false, false, BigInt(0), BigInt(0), "", BigInt(0), false, BigInt(0), BigInt(0), 0];

  const fullInfoArray: unknown[] = Array.isArray(fullInfoRaw) ? (fullInfoRaw as unknown[]) : [];
  const creatorProfileCid =
    fullInfoArray.length >= 12 && typeof fullInfoArray[11] === "string"
      ? (fullInfoArray[11] as string)
      : null;

  const { data: creatorProfileCidFromMapping } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "userProfileCid",
    args: [postCreator as `0x${string}`],
    query: {
      enabled: Boolean(postCreator && CONFIDENTIAL_CLUB_ADDRESS && !creatorProfileCid),
    },
  });

  const effectiveCreatorProfileCid =
    creatorProfileCid ||
    (typeof creatorProfileCidFromMapping === "string" && creatorProfileCidFromMapping.length > 0
      ? creatorProfileCidFromMapping
      : null);

  const isCreator = Boolean(address && postCreator && address.toLowerCase() === postCreator.toLowerCase());
  const hasAccess = Boolean(purchasedValue || isCreator);

  useEffect(() => {
    const loadCreatorProfile = async () => {
      if (!postCreator || !effectiveCreatorProfileCid || effectiveCreatorProfileCid.length === 0) {
        setCreatorProfile(null);
        return;
      }

      try {
        const cached = await getUserProfileCache(postCreator);
        if (cached && cached.cid === effectiveCreatorProfileCid) {
          setCreatorProfile(cached);
          return;
        }

        const jsonText = await fetchFromPinata(effectiveCreatorProfileCid);
        const data = JSON.parse(jsonText) as { nickname?: string; avatar?: string; twitter?: string; updatedAt?: string };

        const profile: CachedUserProfile = {
          nickname: data.nickname || null,
          avatar: data.avatar || null,
          twitter: data.twitter || null,
          cid: effectiveCreatorProfileCid,
          updatedAt: data.updatedAt || new Date().toISOString(),
        };

        setCreatorProfile(profile);
        await setUserProfileCache(postCreator, profile);
      } catch (e) {
        console.error("Failed to load post creator profile:", e);
        setCreatorProfile(null);
      }
    };

    loadCreatorProfile();
  }, [postCreator, effectiveCreatorProfileCid]);

  useEffect(() => {
    if (isSuccess) {
      refetch();
    }
  }, [isSuccess, refetch]);

  useEffect(() => {
    if (!writeError) return;
    console.error("Operation failed:", writeError);
    const msg = writeError instanceof Error ? (writeError.message || writeError.name) : String(writeError);
    const lowered = msg.toLowerCase();
    if (lowered.includes("user rejected") || lowered.includes("denied request") || lowered.includes("user denied")) {
      notice("Transaction cancelled, operation not completed.");
    } else {
      notifyError(`Operation failed: ${msg}`);
    }
  }, [writeError, notice, notifyError]);


  useEffect(() => {
    setDecryptSuccess(false);
    setShouldDecrypt(false);
    setCurrentStepIndex(0);
  }, [postId]);

  useEffect(() => {
    if (purchased) {
      setDecryptSuccess(false);
      setShouldDecrypt(false);
      setCurrentStepIndex(0);
    }
  }, [purchased]);

  if (isLoading) {
    return null;
  }

  if (!fullInfoRaw || !Array.isArray(fullInfoRaw) || fullInfoRaw.length < 11) {
    return null;
  }

  if (!exists) {
    return null;
  }

  const handleBuy = () => {
    if (!address) {
      notice("Please connect your wallet first.");
      return;
    }

    writeContract({
      address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
      abi: confidentialClubAbi,
      functionName: "buyPost",
      args: [BigInt(postId)],
      value: price as bigint,
    });
  };

  const handleFollow = () => {
    if (!address) {
      notice("Please connect your wallet first.");
      return;
    }
    if (!postCreator) return;

    writeContract({
      address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
      abi: confidentialClubAbi,
      functionName: isFollowingCreator ? "unfollow" : "follow",
      args: [postCreator as `0x${string}`],
    });
  };

  const handleLike = () => {
    if (!address) {
      notice("Please connect your wallet first.");
      return;
    }
    if (!hasAccess) {
      notice("Purchase required to like/dislike posts.");
      return;
    }

    writeContract({
      address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
      abi: confidentialClubAbi,
      functionName: "likePost",
      args: [BigInt(postId)],
    });
  };

  const handleDislike = () => {
    if (!address) {
      notice("Please connect your wallet first.");
      return;
    }
    if (!hasAccess) {
      notice("Purchase required to like/dislike posts.");
      return;
    }

    writeContract({
      address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
      abi: confidentialClubAbi,
      functionName: "dislikePost",
      args: [BigInt(postId)],
    });
  };

  const handleRemoveReaction = () => {
    if (!address) {
      notice("Please connect your wallet first.");
      return;
    }
    if (!hasAccess) {
      notice("Purchase required to like/dislike posts.");
      return;
    }

    writeContract({
      address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
      abi: confidentialClubAbi,
      functionName: "removeReaction",
      args: [BigInt(postId)],
    });
  };

  const displayAddress = formatAddress(postCreator);
  const displayName = creatorProfile?.nickname || displayAddress;

  const formatPostTime = (ts: bigint): string => {
    if (!ts || ts === BigInt(0)) return "No record";
    try {
      const ms = Number(ts) * 1000;
      const date = new Date(ms);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return "No record";
    }
  };

  return (
    <div className="relative pl-0 pr-2 py-3">
      {showOverlay && (
        <div
          className={`absolute inset-0 z-[60] flex items-center justify-center overlay-silver backdrop-blur-sm transition-opacity duration-500 ${
            isDecrypting ? "opacity-100" : "opacity-0"
          }`}
          onTransitionEnd={() => {
            if (!isDecrypting) {
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
                  ✓ {decryptSteps[currentStepIndex - 1]}
                </div>
              )}
              <div className="text-center text-base font-semibold overlay-silver-text transition-all duration-300">
                {decryptSteps[currentStepIndex]}
              </div>
              {currentStepIndex < decryptSteps.length - 1 && (
                <div className="text-center text-sm overlay-silver-text-dim transition-all duration-300">
                  {decryptSteps[currentStepIndex + 1]}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!postCreator) return;
              await copyToClipboard(postCreator);
            }}
            className="relative h-10 w-10 flex items-center justify-center"
            aria-label="Copy address"
            title={postCreator || ""}
          >
            {creatorProfile?.avatar ? (
              <img src={creatorProfile.avatar} alt="Creator avatar" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                style={getAvatarStyle(postCreator)}
              >
                {postCreator ? postCreator.slice(2, 4).toUpperCase() : ""}
              </div>
            )}
          </button>
          <div className="flex flex-col">
            <div className="relative group flex items-center gap-2">
              {creatorProfile?.nickname ? (
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {creatorProfile.nickname}
                </span>
              ) : postCreator ? (
                <button
                  type="button"
                  onClick={async () => {
                    await copyToClipboard(postCreator);
                  }}
                  className="text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
                  aria-label="Copy address"
                  title={postCreator || ""}
                >
                  {displayAddress || "Unknown address"}
                </button>
              ) : (
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{displayName || "Unknown address"}</span>
              )}
              
              {!isCreator && address && (
                <button
                  onClick={handleFollow}
                  disabled={isConfirming || isWaiting}
                  className={
                    isFollowingCreator
                      ? "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-zinc-900 bg-zinc-300 hover:bg-zinc-400 border border-white/60 shadow-sm dark:text-zinc-100 dark:bg-zinc-500 dark:hover:bg-zinc-600 dark:border-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      : "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-zinc-900 bg-zinc-300 hover:bg-zinc-400 border border-white/60 shadow-sm dark:text-zinc-100 dark:bg-zinc-500 dark:hover:bg-zinc-600 dark:border-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  <HeartIcon className="h-3 w-3" />
                  {isFollowingCreator ? "Following" : "Follow"}
                </button>
              )}
              {creatorProfile?.twitter && (
                <a
                  href={`https://twitter.com/${creatorProfile.twitter}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-5 w-5 items-center justify-center text-zinc-400 hover:text-sky-500"
                  aria-label="Open Twitter profile"
                  title={`twitter.com/${creatorProfile.twitter}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M19.633 7.997c.013.18.013.36.013.54 0 5.508-4.19 11.863-11.863 11.863-2.36 0-4.555-.69-6.402-1.874.338.04.663.053 1.014.053a8.37 8.37 0 0 0 5.19-1.788 4.183 4.183 0 0 1-3.904-2.9c.26.04.52.067.793.067.38 0 .76-.053 1.114-.147a4.174 4.174 0 0 1-3.35-4.096v-.053c.546.3 1.175.48 1.84.506A4.17 4.17 0 0 1 2.8 5.146a11.862 11.862 0 0 0 8.61 4.37 4.713 4.713 0 0 1-.107-.956A4.17 4.17 0 0 1 15.48 4.4a4.14 4.14 0 0 1 3.046 1.318 8.18 8.18 0 0 0 2.654-1.014 4.17 4.17 0 0 1-1.834 2.3 8.35 8.35 0 0 0 2.4-.65 8.96 8.96 0 0 1-2.113 2.043z" />
                  </svg>
                </a>
              )}
              {postCreator && (
                <button
                  type="button"
                  onClick={async () => {
                    await copyToClipboard(postCreator);
                  }}
                  className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  aria-label="Copy address"
                  title="Copy address"
                >
                  <span className="text-xs">{displayAddress}</span>
                  <CopyIcon className="h-4 w-4" />
                </button>
              )}
              {!isCreator && hasAccess ? (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Purchased</span>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard(String(postId));
                }}
                className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                aria-label="Copy post ID"
                title="Copy post ID"
              >
                <span>ID #{postId}</span>
              </button>
              <span>· {Number(creatorFollowerCount)} followers</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                · Encrypted: {encryptedTextCount} text{encryptedTextCount !== 1 ? 's' : ''}, {encryptedImageCount} image{encryptedImageCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="ml-[52px]">
      <PostContent
        postId={postId}
        purchased={hasAccess}
        shouldDecrypt={shouldDecrypt}
        onContentLoaded={handleContentLoaded}
        onDecryptEnd={(success) => {
          setShouldDecrypt(false);
          setDecryptSuccess(Boolean(success));
          setIsDecrypting(false);
        }}
        onDecryptStart={() => {
          setIsDecrypting(true);
          setShowOverlay(true);
          setCurrentStepIndex(0);
        }}
        onProgress={(text) => updateProgressStep(text)}
      />
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Price: {formatEther(price as bigint)} ETH</span>
          <span className="text-zinc-400 dark:text-zinc-500">·</span>
          <span>{Number(purchaseCount)} purchases</span>
          <span className="text-zinc-400 dark:text-zinc-500">·</span>
          
          <span>{formatPostTime(timestamp)}</span>
      </div>
        <div className="flex items-center gap-2">
        {hasAccess ? (
          <button
            onClick={() => {
              console.log("[PostItem] Decrypt button clicked");
              setDecryptSuccess(false);
              setShouldDecrypt(true);
            }}
            disabled={shouldDecrypt || decryptSuccess}
            className={
              decryptSuccess
                ? "rounded-md px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-70"
              : "rounded-md px-3 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-300 hover:bg-zinc-400 border border-white/60 shadow-sm dark:text-zinc-100 dark:bg-zinc-500 dark:hover:bg-zinc-600 dark:border-white/10 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {decryptSuccess ? (
              <CheckCircleIcon className="h-4 w-4" />
            ) : shouldDecrypt ? (
              "Decrypting..."
            ) : (
              "Decrypt content"
            )}
          </button>
        ) : (
          <button
            onClick={handleBuy}
            disabled={isConfirming || isWaiting || !address}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-300 hover:bg-zinc-400 border border-white/60 shadow-sm dark:text-zinc-100 dark:bg-zinc-500 dark:hover:bg-zinc-600 dark:border-white/10 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWaiting ? "Confirming..." : isConfirming ? "Submitting..." : `Buy - ${formatEther(price as bigint)} ETH`}
          </button>
        )}
        </div>
      </div>
      {
        <div className="mt-3">
          <div className="flex">
            <button
              onClick={() => {
                if (userReaction === 1) {
                  handleRemoveReaction();
                } else {
                  handleLike();
                }
              }}
              disabled={isConfirming || isWaiting || !address}
              className={`flex-1 h-3 md:h-4 inline-flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
                userReaction === 1
                  ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 bg-transparent"
                  : "text-zinc-700 bg-transparent hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-700/40"
              } disabled:cursor-not-allowed disabled:opacity-50 rounded-sm`}
              title="Like"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
              <span>Like ({Number(likeCount)})</span>
            </button>
            <button
              onClick={() => {
                if (userReaction === -1) {
                  handleRemoveReaction();
                } else {
                  handleDislike();
                }
              }}
              disabled={isConfirming || isWaiting || !address}
              className={`flex-1 h-3 md:h-4 inline-flex items-center justify-center gap-1 text-xs font-medium transition-colors border-l border-zinc-200 dark:border-zinc-800 ${
                userReaction === -1
                  ? "text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 bg-transparent"
                  : "text-zinc-700 bg-transparent hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-700/40"
              } disabled:cursor-not-allowed disabled:opacity-50 rounded-sm`}
              title="Dislike"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
              </svg>
              <span>Dislike ({Number(dislikeCount)})</span>
            </button>
          </div>
        </div>
      }
      </div>
    </div>
  );
}

export function PostList({ filterPostId, filterCreatorAddress, purchasedPostIds }: { filterPostId?: number; filterCreatorAddress?: string; purchasedPostIds?: number[] }) {
  const { address } = useAccount();
  const [displayedPostIds, setDisplayedPostIds] = useState<number[]>([]);
  const [lastKnownCount, setLastKnownCount] = useState<number>(0);
  
  const { data: postCount, isLoading, refetch: refetchPostCount } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "postCount",
    query: {
      enabled: Boolean(CONFIDENTIAL_CLUB_ADDRESS),
    },
  });

  const { data: filterPostResult, isLoading: isLoadingFilterPost } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "getPost",
    args: [BigInt(filterPostId || 0)],
    account: address,
    query: {
      enabled: Boolean(CONFIDENTIAL_CLUB_ADDRESS) && Boolean(filterPostId && filterPostId > 0),
    },
  });

  useEffect(() => {
    const handleRefreshPosts = async () => {
      try {
        const result = await refetchPostCount();
        const newCount = result.data ? Number(result.data) : 0;
        let added = 0;

        if (newCount > lastKnownCount && lastKnownCount > 0) {
          const newPostIds: number[] = [];
          for (let i = newCount; i > lastKnownCount; i--) {
            newPostIds.push(i);
          }
          added = newPostIds.length;
          setDisplayedPostIds(prev => [...newPostIds, ...prev]);
          setLastKnownCount(newCount);
        }

        window.dispatchEvent(new CustomEvent("refreshPostsCompleted", { detail: { success: true, added } }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent("refreshPostsCompleted", { detail: { success: false, error: String(err) } }));
      }
    };

    window.addEventListener("refreshPosts", handleRefreshPosts);
    return () => window.removeEventListener("refreshPosts", handleRefreshPosts);
  }, [lastKnownCount, refetchPostCount]);

  useEffect(() => {
    if (purchasedPostIds && purchasedPostIds.length > 0) {
      setDisplayedPostIds(purchasedPostIds);
      return;
    }
    if (filterPostId && filterPostId > 0) {
      setDisplayedPostIds([filterPostId]);
      return;
    }
    if (!postCount || Number(postCount) === 0) {
      setDisplayedPostIds([]);
      setLastKnownCount(0);
      return;
    }
    const count = Number(postCount);
    if (count !== lastKnownCount) {
      const allIds = Array.from({ length: count }, (_, i) => count - i);
      setDisplayedPostIds(allIds.slice(0, 10));
      setLastKnownCount(count);
    }
  }, [postCount, filterPostId, purchasedPostIds, lastKnownCount]);

  const postIds = displayedPostIds;

  const { data: creatorAddress } = useReadContract({
    address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
    abi: confidentialClubAbi,
    functionName: "creator",
    query: {
      enabled: Boolean(CONFIDENTIAL_CLUB_ADDRESS),
    },
  });

  if (isLoading || isLoadingFilterPost) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (filterPostId && filterPostId > 0) {
    const exists = Array.isArray(filterPostResult) ? Boolean((filterPostResult as unknown as [bigint, boolean, boolean])[1]) : false;
    if (!exists) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">No matching posts found</div>
        </div>
      );
    }
  }

  if (postIds.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">No posts yet</div>
      </div>
    );
  }

  const creatorAddr = typeof creatorAddress === "string" ? creatorAddress : null;
  if (filterCreatorAddress && creatorAddr) {
    const eq = creatorAddr.toLowerCase() === filterCreatorAddress.toLowerCase();
    if (!eq) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">No matching posts found</div>
        </div>
      );
    }
  }

  return (
    <div>
      {postIds.map((postId) => (
        <div key={postId}>
          <PostItem
            postId={postId}
            creatorAddress={creatorAddr}
          />
          <div className="border-b border-zinc-300 dark:border-zinc-700 -mx-6 mt-5" />
        </div>
      ))}
    </div>
  );
}

