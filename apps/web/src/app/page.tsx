"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  Sparkles,
  Layers,
  Search,
  Coins,
  ShieldCheck,
  Flame,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { buttonVariants } from "@frag-arc/ui/components/button";
import { Badge } from "@frag-arc/ui/components/badge";
import { Input } from "@frag-arc/ui/components/input";
import { Card, CardContent } from "@frag-arc/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@frag-arc/ui/components/tabs";
import { cn } from "@frag-arc/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { VaultCard } from "@/components/vault-card";
import { FragArcLogo } from "@/components/fragarc-logo";

export default function HomePage() {
  const [statusFilter, setStatusFilter] = React.useState<
    "ALL" | "ACTIVE" | "AUCTION" | "REDEEMED" | "BOUGHT_OUT"
  >("ALL");
  const [search, setSearch] = React.useState("");

  const { data: stats, isLoading: statsLoading } = useQuery(
    trpc.vaults.getStats.queryOptions()
  );

  const { data: vaultsList, isLoading: vaultsLoading } = useQuery(
    trpc.vaults.list.queryOptions({
      status: statusFilter,
      search: search.length > 0 ? search : undefined,
    })
  );

  const formattedTotalUSDC = (() => {
    if (!stats?.totalReserveUSDC) return "0.00";
    try {
      const val = formatUnits(BigInt(stats.totalReserveUSDC), 18);
      return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return "0.00";
    }
  })();

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-10 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-b from-primary/5 via-background to-background p-6 sm:p-10 md:p-14 text-center flex flex-col items-center gap-6">
        <FragArcLogo size="2xl" withGlow={true} className="mb-1" />

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs font-mono border-primary/30 text-primary">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
            Arc Network Layer 1 • Native USDC Gas • Osaka EVM
          </Badge>
        </div>

        <div className="flex flex-col gap-3 max-w-3xl">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Bidirectional Decentralized{" "}
            <span className="bg-gradient-to-r from-primary via-sky-500 to-indigo-500 bg-clip-text text-transparent">
              NFT Fragmentation
            </span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Fractionalize high-value NFTs into liquid ERC-20 tokens on Circle's Arc network.
            Reconstitute and redeem original NFTs via <strong>100% direct token burn</strong> or{" "}
            <strong>decentralized USDC buyout auctions</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/fractionalize"
            className={cn(buttonVariants({ size: "lg" }), "rounded-xl shadow-md gap-2 font-medium")}
          >
            <Sparkles className="size-4" />
            Fractionalize an NFT
          </Link>

          <Link
            href="/faucet"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-xl gap-2 font-medium")}
          >
            <Coins className="size-4" />
            Mint Demo NFT & Faucet
          </Link>
        </div>

        {/* Feature Highlights Pill Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl pt-6 border-t border-border/40 text-left">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4" />
            </div>
            <div>
              <span className="text-xs font-semibold block text-foreground">ERC-721 & 1155</span>
              <span className="text-[11px] text-muted-foreground">Any digital asset</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <span className="text-xs font-semibold block text-foreground">100% Direct Burn</span>
              <span className="text-[11px] text-muted-foreground">Instant reclamation</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <Flame className="size-4" />
            </div>
            <div>
              <span className="text-xs font-semibold block text-foreground">USDC Buyout</span>
              <span className="text-[11px] text-muted-foreground">Competitive auction</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <span className="text-xs font-semibold block text-foreground">SIWE Security</span>
              <span className="text-[11px] text-muted-foreground">Wallet-bound auth</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Counter */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl border border-border/50 p-5">
          <CardContent className="p-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Total Fragmented Vaults</span>
            <span className="text-2xl font-bold font-mono text-foreground">
              {statsLoading ? "..." : stats?.totalVaults || 0}
            </span>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/50 p-5">
          <CardContent className="p-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Active Market Vaults</span>
            <span className="text-2xl font-bold font-mono text-primary">
              {statsLoading ? "..." : stats?.activeVaults || 0}
            </span>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/50 p-5">
          <CardContent className="p-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Total Reserve Value</span>
            <span className="text-2xl font-bold font-mono text-emerald-500">
              {statsLoading ? "..." : `${formattedTotalUSDC} USDC`}
            </span>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/50 p-5">
          <CardContent className="p-0 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Redeemed / Bought Out</span>
            <span className="text-2xl font-bold font-mono text-foreground">
              {statsLoading ? "..." : stats?.redeemedVaults || 0}
            </span>
          </CardContent>
        </Card>
      </section>

      {/* Vaults Marketplace */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Fragmented Vaults</h2>
            <p className="text-xs text-muted-foreground">
              Browse fractionalized NFTs, participate in buyout auctions, or redeem original assets.
            </p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search vaults, symbols..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>

            <Tabs
              value={statusFilter}
              onValueChange={(val: any) => setStatusFilter(val)}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-9">
                <TabsTrigger value="ALL" className="text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="ACTIVE" className="text-xs">
                  Active
                </TabsTrigger>
                <TabsTrigger value="AUCTION" className="text-xs">
                  Auction Live
                </TabsTrigger>
                <TabsTrigger value="REDEEMED" className="text-xs">
                  Redeemed
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Gallery Grid */}
        {vaultsLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <span className="text-xs font-mono">Loading Arc Vaults...</span>
          </div>
        ) : vaultsList && vaultsList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {vaultsList.map((vault) => (
              <VaultCard key={vault.id} vault={vault} />
            ))}
          </div>
        ) : (
          <Card className="rounded-3xl border border-dashed border-border/80 p-12 text-center flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-muted/50 text-muted-foreground">
              <Layers className="size-8" />
            </div>
            <div className="flex flex-col gap-1 max-w-md">
              <h3 className="font-semibold text-base text-foreground">No Vaults Found</h3>
              <p className="text-xs text-muted-foreground">
                {search
                  ? `No vaults matched your query "${search}". Try clearing your search.`
                  : "Be the first pioneer to fragment an NFT on Arc, or mint a demo NFT on Arc Testnet."}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Link
                href="/fractionalize"
                className={cn(buttonVariants({ size: "sm" }), "rounded-xl font-medium gap-1.5")}
              >
                <Sparkles className="size-3.5" />
                Fractionalize Now
              </Link>
              <Link
                href="/faucet"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl font-medium gap-1.5")}
              >
                <Coins className="size-3.5" />
                Mint Demo NFT
              </Link>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
