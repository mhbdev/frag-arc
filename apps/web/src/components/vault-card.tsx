"use client";

import Link from "next/link";
import type { Route } from "next";
import { formatUnits } from "viem";
import { ArrowUpRight, Flame, CheckCircle2, Shield } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@frag-arc/ui/components/card";
import { Badge } from "@frag-arc/ui/components/badge";
import { buttonVariants } from "@frag-arc/ui/components/button";
import { cn } from "@frag-arc/ui/lib/utils";
import { FragArcLogo } from "./fragarc-logo";

export interface VaultData {
  id: string;
  vaultAddress: string;
  tokenAddress: string;
  nftContract: string;
  tokenId: string;
  name: string;
  symbol: string;
  totalSupply: string;
  reservePrice: string;
  curatorAddress: string;
  status: string;
  nftName?: string | null;
  nftImage?: string | null;
  nftDescription?: string | null;
  currentBid?: string | null;
  currentBidder?: string | null;
  auctionEndTime?: Date | string | null;
}

export function VaultCard({ vault }: { vault: VaultData }) {
  const formattedSupply = (() => {
    try {
      const val = BigInt(vault.totalSupply) / 10n ** 18n;
      return Number(val).toLocaleString();
    } catch {
      return vault.totalSupply;
    }
  })();

  const formattedReserveUSDC = (() => {
    try {
      const val = formatUnits(BigInt(vault.reservePrice), 18);
      return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return vault.reservePrice;
    }
  })();

  const currentBidUSDC = (() => {
    if (!vault.currentBid || vault.currentBid === "0") return null;
    try {
      const val = formatUnits(BigInt(vault.currentBid), 18);
      return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return null;
    }
  })();

  const getStatusBadge = () => {
    switch (vault.status) {
      case "AUCTION":
        return (
          <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-500 animate-pulse">
            <Flame className="size-3 text-amber-500" />
            Buyout Live
          </Badge>
        );
      case "REDEEMED":
        return (
          <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-500">
            <CheckCircle2 className="size-3 text-emerald-500" />
            Redeemed 100%
          </Badge>
        );
      case "BOUGHT_OUT":
        return (
          <Badge variant="secondary" className="gap-1">
            <Shield className="size-3" />
            Bought Out
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1 text-primary border-primary/30">
            <span className="size-1.5 rounded-full bg-primary" />
            Active
          </Badge>
        );
    }
  };

  return (
    <Card className="group overflow-hidden rounded-2xl border border-border/60 hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between">
      {/* Top Image Preview */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted/30">
        {vault.nftImage ? (
          <img
            src={vault.nftImage}
            alt={vault.nftName || vault.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-gradient-to-tr from-muted/50 to-muted/20 text-muted-foreground text-xs font-mono">
            <FragArcLogo size="md" />
            <span>Arc NFT #{vault.tokenId}</span>
          </div>
        )}

        <div className="absolute top-3 right-3">{getStatusBadge()}</div>

        <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-white flex items-center gap-1.5">
          <span className="text-sky-400 font-semibold">${vault.symbol}</span>
          <span className="text-white/60">·</span>
          <span>{formattedSupply} Fractions</span>
        </div>
      </div>

      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold truncate group-hover:text-primary transition-colors">
              {vault.nftName || vault.name}
            </CardTitle>
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              ID #{vault.tokenId}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-1 pb-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
          <div>
            <span className="text-[10px] uppercase font-mono text-muted-foreground block">
              Reserve Price
            </span>
            <span className="font-semibold text-foreground">
              {formattedReserveUSDC} <span className="text-[10px] text-primary">USDC</span>
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-mono text-muted-foreground block">
              {vault.status === "AUCTION" ? "Current High Bid" : "Redemption"}
            </span>
            <span className="font-semibold text-foreground">
              {currentBidUSDC ? (
                <>
                  {currentBidUSDC} <span className="text-[10px] text-amber-500">USDC</span>
                </>
              ) : (
                <span className="text-muted-foreground">100% Burn</span>
              )}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Link
          href={`/vault/${vault.vaultAddress}` as Route}
          className={cn(
            buttonVariants({ variant: "default" }),
            "w-full rounded-xl text-xs font-medium gap-1.5 shadow-sm"
          )}
        >
          View Vault & Bid/Redeem
          <ArrowUpRight className="size-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
