import type { Metadata } from "next";

import { Navbar } from "@/components/layout/navbar";
import { ConsoleFilterProvider } from "@/components/providers/console-filter-provider";
import { PageLoadingProvider } from "@/components/providers/page-loading-provider";
import { NotificationProvider } from "@/components/providers/notification-provider";
import { RelayerProvider } from "@/components/providers/relayer-provider";
import { RelayerScriptLoader } from "@/components/providers/relayer-script-loader";
import { WalletProvider } from "@/components/providers/wallet-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Confidential Club",
  description: "Confidential content marketplace powered by Zama FHE",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/apple-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'dark';
                document.documentElement.classList.toggle('dark', theme === 'dark');
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <RelayerScriptLoader />
        <ConsoleFilterProvider>
          <WalletProvider>
            <RelayerProvider>
              <PageLoadingProvider>
                <Navbar />
                <NotificationProvider>
                  {children}
                </NotificationProvider>
              </PageLoadingProvider>
            </RelayerProvider>
          </WalletProvider>
        </ConsoleFilterProvider>
      </body>
    </html>
  );
}
