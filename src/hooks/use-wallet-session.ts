"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

type SessionResponse = {
  authenticated: boolean;
  address?: string;
  issuedAt?: string;
  expiresAt?: string;
};

export function useWalletSession(enabled: boolean) {
  const { address } = useAccount();
  
  return useQuery<SessionResponse>({
    queryKey: ["wallet-session", address],
    queryFn: async () => {
      const url = address 
        ? `/api/auth/session?address=${encodeURIComponent(address)}`
        : "/api/auth/session";
      
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("session_fetch_failed");
      }

      return (await response.json()) as SessionResponse;
    },
    staleTime: 60_000,
    enabled,
  });
}


