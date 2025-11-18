"use client";

import Image from "next/image";
import { WalletConnectButton } from "@/components/wallet/connect-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Navbar() {
  return (
    <nav id="app-navbar" className="sticky top-0 z-50 w-full border-b border-zinc-200/60 dark:border-zinc-800/60" style={{ backgroundColor: "var(--background)" }}>
      <div className="mx-auto flex h-16 app-container items-center justify-between px-0">
        <div className="flex items-center gap-2 ml-sidebar-nav">
          <Image src="/triangle-silver.svg" alt="" width={20} height={20} priority />
          <h1 className="shimmer-text text-xl font-semibold italic">Confidential Club</h1>
        </div>
        <div className="flex items-center gap-4 mr-aside-pad">
          <ThemeToggle />
          <WalletConnectButton />
        </div>
      </div>
    </nav>
  );
}

