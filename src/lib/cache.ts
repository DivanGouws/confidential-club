"use client";

import { createStore, del, get, set } from "idb-keyval";

const store = typeof window !== "undefined" ? createStore("confidential-club-cache", "kv") : null;

function k(...parts: Array<string | number>): string {
  return parts.join(":");
}

export async function getPostJson(ipfsHash: string): Promise<unknown | null> {
  if (!store) return null;
  try {
    return (await get(k("post", "json", ipfsHash), store)) ?? null;
  } catch {
    return null;
  }
}

export async function setPostJson(ipfsHash: string, data: unknown): Promise<void> {
  if (!store) return;
  try {
    await set(k("post", "json", ipfsHash), data, store);
  } catch {}
}

export async function getPublicImageBlob(ipfsHash: string, path: string): Promise<Blob | null> {
  if (!store) return null;
  try {
    return (await get(k("img", "public", ipfsHash, path), store)) ?? null;
  } catch {
    return null;
  }
}

export async function setPublicImageBlob(ipfsHash: string, path: string, blob: Blob): Promise<void> {
  if (!store) return;
  try {
    await set(k("img", "public", ipfsHash, path), blob, store);
  } catch {}
}

// Do not cache decrypted sensitive data

export async function clearPostCaches(ipfsHash: string): Promise<void> {
  if (!store) return;
  try {
    await del(k("post", "json", ipfsHash), store);
  } catch {}
}

export async function clearUserProfileCache(address: string): Promise<void> {
  if (!store) return;
  try {
    await del(k("user", "profile", address.toLowerCase()), store);
  } catch {}
}

export interface CachedUserProfile {
  cid?: string;
  nickname?: string | null;
  avatar?: string | null;
  twitter?: string | null;
  bio?: string | null;
  timestamp: number;
  updatedAt?: string | number;
}

export async function getUserProfileCache(address: string): Promise<CachedUserProfile | null> {
  if (!store) return null;
  try {
    const key = k("user", "profile", address.toLowerCase());
    return ((await get(key, store)) as CachedUserProfile | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function setUserProfileCache(address: string, profile: CachedUserProfile): Promise<void> {
  if (!store) return;
  try {
    const key = k("user", "profile", address.toLowerCase());
    await set(key, profile, store);
  } catch {}
}

