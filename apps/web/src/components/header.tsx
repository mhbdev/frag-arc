"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Sparkles, PieChart, Coins } from "lucide-react";
import { cn } from "@frag-arc/ui/lib/utils";
import type { Route } from "next";
import { FragArcLogo } from "./fragarc-logo";
import { ModeToggle } from "./mode-toggle";
import { WalletConnect } from "./wallet-connect";

export default function Header() {
  const pathname = usePathname();

  const links: { to: Route; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { to: "/", label: "Marketplace", icon: Layers },
    { to: "/fractionalize", label: "Fractionalize NFT", icon: Sparkles },
    { to: "/portfolio", label: "Portfolio", icon: PieChart },
    { to: "/faucet", label: "Faucet & Demo", icon: Coins },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight group">
            <FragArcLogo size="md" showText={true} withGlow={true} />
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            {links.map(({ to, label, icon: Icon }) => {
              const isActive = pathname === to;
              return (
                <Link
                  key={to}
                  href={to}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right action bar */}
        <div className="flex items-center gap-3">
          <WalletConnect />
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
