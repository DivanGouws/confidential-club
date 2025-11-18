"use client";

import { type PropsWithChildren, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { Sidebar } from "./sidebar";
import { SignInForm } from "@/components/auth/sign-in-form";
import { useWalletSession } from "@/hooks/use-wallet-session";

export function AppLayout({ children }: PropsWithChildren) {
  const { isConnected } = useAccount();
  const { data: session } = useWalletSession(isConnected);
  
  const words = ["AD", "SPACE", "FOR", "RENT"];
  const charsRef = useRef<(HTMLSpanElement | null)[][]>(
    words.map(word => word.split("").map(() => null))
  );

  const isAuthenticated = Boolean(
    session?.authenticated && session.address
  );

  useEffect(() => {
    const colors = ["#fbbf24", "#22d3ee", "#3b82f6", "#f59e0b", "#a855f7", "#ec4899"];

    const interval = setInterval(() => {
      charsRef.current.forEach((word) => {
        word.forEach((char) => {
          if (char) {
            char.classList.remove("active");
            char.style.color = "";
          }
        });
      });

      charsRef.current.forEach((word) => {
        if (word && word.length > 0) {
          const letterIndex = Math.floor(Math.random() * word.length);
          const char = word[letterIndex];
          const randomColor = colors[Math.floor(Math.random() * colors.length)];
          if (char) {
            char.classList.add("active");
            char.style.color = randomColor;
          }
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
        <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <SignInForm />
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 top-16 text-zinc-900 dark:text-zinc-50 overflow-hidden" style={{ background: "var(--background)" }}>
      <div className="mx-auto flex h-full app-container justify-center">
        <Sidebar />
        <main className="flex-1 app-main border-r border-zinc-300 dark:border-zinc-700 overflow-y-auto">
          {children}
        </main>
        <aside className="app-aside bg-transparent">
          <div className="p-6">
            <div className="sticky top-6 relative rounded-lg border-2 border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700" style={{ background: "var(--background)" }}>
              <div className="flex h-[50vh] min-h-96 flex-col items-center justify-center gap-8">
                <div className="flex flex-col gap-2">
                  {words.map((word, wordIndex) => (
                    <div key={wordIndex} className="flex gap-0 items-center justify-center">
                      {word.split("").map((letter, letterIndex) => {
                        const isFirstLetter = letterIndex === 0;
                        const isLastLetter = letterIndex === word.length - 1;
                        const tiltClass = isFirstLetter ? 'tilt-left' : isLastLetter ? 'tilt-right' : 'tilt-normal';
                        
                        return (
                          <span
                            key={letterIndex}
                            ref={(el) => { 
                              if (charsRef.current[wordIndex] && el) {
                                charsRef.current[wordIndex][letterIndex] = el;
                              }
                            }}
                            className={`neon-char ${tiltClass}`}
                          >
                            {letter}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="h-px w-20 bg-zinc-300 dark:bg-zinc-700"></div>
              </div>
            </div>
          </div>
          <div className="px-6 pt-0">
            <div className="rounded-lg border border-zinc-300 p-4 text-left text-[12px] leading-relaxed text-zinc-500/70 dark:border-zinc-700 dark:text-zinc-400/60">
              <p>Write down the secrets you know.</p>
              <p>Share your trading levels and strategy.</p>
              <p className="whitespace-nowrap">Tell the insider stories you&#39;ve experienced.</p>
              <p>Teach how you earned airdrops.</p>
              <p>…You can be anyone and share anything — your secrets remain confidential.</p>
            </div>
          </div>
          <style jsx>{`
            .neon-char {
              font-size: 2.5rem;
              font-weight: bold;
              color: rgba(100, 100, 100, 0.3);
              text-shadow: 0 0 2px rgba(100, 100, 100, 0.2);
              transition: all 0.3s ease;
              display: inline-block;
            }
            
            .tilt-left {
              transform: skewY(-25deg) rotate(-5deg);
            }
            
            .tilt-normal {
              transform: skewY(0deg);
            }
            
            .tilt-right {
              transform: skewY(25deg) rotate(5deg);
            }
            
            .neon-char.active {
              opacity: 1;
            }
          `}</style>
        </aside>
      </div>
    </div>
  );
}

