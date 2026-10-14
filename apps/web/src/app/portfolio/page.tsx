"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  PieChart,
  Layers,
  Sparkles,
  ArrowUpRight,
  Flame,
  Wallet,
  Clock,
  Shield,
  Coins,
} from "lucide-react";
import { Card } from "@frag-arc/ui/components/card";
import { Button, buttonVariants } from "@frag-arc/ui/components/button";
import { Badge } from "@frag-arc/ui/components/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@frag-arc/ui/components/tabs";
import { cn } from "@frag-arc/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { VaultCard } from "@/components/vault-card";
import { FragArcLogo } from "@/components/fragarc-logo";

export default function PortfolioPage() {
  const { address, isConnected, chain } = useAccount();

  const userAddress = address || "";
  const { data: userVaults, isLoading: vaultsLoading } = useQuery(
    trpc.portfolio.getUserVaults.queryOptions(
      { address: userAddress },
      { enabled: !!userAddress }
    )
  );

  const { data: userBids, isLoading: bidsLoading } = useQuery(
    trpc.portfolio.getUserBids.queryOptions(
      { address: userAddress },
      { enabled: !!userAddress }
    )
  );

  if (!isConnected) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
        <div className="p-4 rounded-2xl bg-muted/40 text-muted-foreground">
          <Wallet className="size-8" />
        </div>
        <div className="flex flex-col gap-1 max-w-sm">
          <h2 className="text-lg font-bold text-foreground">Connect Wallet</h2>
          <p className="text-xs text-muted-foreground">
            Connect your browser wallet to view your created vaults, fractional token holdings, and active buyout bids.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 flex flex-col gap-8">
      {/* Portfolio Header Banner */}
      <div className="p-6 md:p-8 rounded-3xl border border-border/60 bg-gradient-to-r from-card to-card/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <FragArcLogo size="lg" withGlow={true} />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">My Web3 Portfolio</h1>
              <Badge variant="outline" className="font-mono text-[10px]">
                {chain?.name || "Arc"}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground truncate max-w-sm">
              {address}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/fractionalize"
            className={cn(buttonVariants({ size: "sm" }), "rounded-xl text-xs gap-1.5")}
          >
            <Sparkles className="size-3.5" />
            Fractionalize NFT
          </Link>
          <Link
            href="/faucet"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl text-xs gap-1.5")}
          >
            <Coins className="size-3.5" />
            Test Faucet
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="created" className="flex flex-col gap-6">
        <TabsList className="h-10 w-fit">
          <TabsTrigger value="created" className="text-xs gap-1.5">
            <Layers className="size-3.5" />
            Created Vaults ({userVaults?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="bids" className="text-xs gap-1.5">
            <Flame className="size-3.5" />
            Active Bids ({userBids?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Created Vaults */}
        <TabsContent value="created" className="pt-2">
          {vaultsLoading ? (
            <div className="py-12 text-center text-xs font-mono text-muted-foreground">
              Loading your vaults...
            </div>
          ) : userVaults && userVaults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {userVaults.map((vault) => (
                <VaultCard key={vault.id} vault={vault} />
              ))}
            </div>
          ) : (
            <Card className="rounded-3xl border border-dashed border-border/80 p-12 text-center flex flex-col items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-muted/50 text-muted-foreground">
                <Layers className="size-6" />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="font-semibold text-sm text-foreground">No Vaults Created Yet</h3>
                <p className="text-xs text-muted-foreground">
                  You haven't fractionalized any NFTs yet. Deposit your first NFT into an Arc vault!
                </p>
              </div>
              <Link
                href="/fractionalize"
                className={cn(buttonVariants({ size: "sm" }), "rounded-xl text-xs gap-1.5 mt-2")}
              >
                <Sparkles className="size-3.5" />
                Fractionalize Now
              </Link>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: Bids History */}
        <TabsContent value="bids" className="pt-2">
          {bidsLoading ? (
            <div className="py-12 text-center text-xs font-mono text-muted-foreground">
              Loading your bids...
            </div>
          ) : userBids && userBids.length > 0 ? (
            <div className="flex flex-col gap-3">
              {userBids.map((bid) => (
                <Card
                  key={bid.bidId}
                  className="rounded-2xl border border-border/60 p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    {bid.nftImage ? (
                      <img
                        src={bid.nftImage}
                        alt={bid.vaultName}
                        className="size-12 rounded-xl object-cover"
                      />
                    ) : (
                      <FragArcLogo size="md" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">
                        {bid.vaultName} (${bid.vaultSymbol})
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        Vault: {bid.vaultAddress.slice(0, 6)}...{bid.vaultAddress.slice(-4)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                        Your Bid
                      </span>
                      <span className="text-sm font-bold font-mono text-foreground">
                        {formatUnits(BigInt(bid.amount), 18)} USDC
                      </span>
                    </div>

                    <Link
                      href={`/vault/${bid.vaultAddress}` as Route}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl text-xs gap-1")}
                    >
                      View Vault
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-3xl border border-dashed border-border/80 p-12 text-center flex flex-col items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-muted/50 text-muted-foreground">
                <Flame className="size-6" />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="font-semibold text-sm text-foreground">No Buyout Bids Placed</h3>
                <p className="text-xs text-muted-foreground">
                  You haven't participated in any buyout auctions yet. Explore active vaults on the marketplace!
                </p>
              </div>
              <Link
                href="/"
                className={cn(buttonVariants({ size: "sm" }), "rounded-xl text-xs gap-1.5 mt-2")}
              >
                <ArrowUpRight className="size-3.5" />
                Explore Marketplace
              </Link>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
