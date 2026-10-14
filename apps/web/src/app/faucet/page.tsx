"use client";

import * as React from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseGwei } from "viem";
import {
  Coins,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@frag-arc/ui/components/card";
import { Button, buttonVariants } from "@frag-arc/ui/components/button";
import { Badge } from "@frag-arc/ui/components/badge";
import { Alert, AlertTitle, AlertDescription } from "@frag-arc/ui/components/alert";
import { cn } from "@frag-arc/ui/lib/utils";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { MockArcNFTABI, ARC_CONTRACTS, ARC_DEFAULT_GAS_FLOOR } from "@frag-arc/contracts";
import { arcTestnet } from "@/lib/arc-chains";
import { FragArcLogo } from "@/components/fragarc-logo";

export default function FaucetPage() {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const { data: presets } = useQuery(trpc.faucet.getPresets.queryOptions());

  const [isMinting, setIsMinting] = React.useState<number | null>(null);
  const [mintedTokenId, setMintedTokenId] = React.useState<string | null>(null);

  const mockNftAddress = ARC_CONTRACTS.testnet.mockNftAddress;

  // Add Arc Testnet to Wallet
  const handleAddArcTestnet = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      toast.error("No browser wallet detected");
      return;
    }
    try {
      await (window as any).ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x4CEE02", // 5042002 in hex
            chainName: "Arc Testnet",
            nativeCurrency: {
              name: "USDC",
              symbol: "USDC",
              decimals: 18,
            },
            rpcUrls: ["https://rpc.testnet.arc.io"],
            blockExplorerUrls: ["https://explorer.testnet.arc.io"],
          },
        ],
      });
      toast.success("Arc Testnet added to your wallet!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to add network");
    }
  };

  // Mint demo NFT
  const handleMintDemoNFT = async (presetId: number, metadataUri: string) => {
    if (!walletClient || !publicClient || !address) {
      toast.error("Please connect your wallet first");
      return;
    }
    setIsMinting(presetId);
    try {
      toast.info("Minting ArcGenesis demo NFT on Arc Testnet...");
      const hash = await walletClient.writeContract({
        address: mockNftAddress,
        abi: MockArcNFTABI,
        functionName: "mint",
        args: [address, metadataUri],
        maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
        maxPriorityFeePerGas: parseGwei("2"),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Find token ID from transfer event
      let tokenId = "1";
      for (const log of receipt.logs) {
        if (log.topics[3]) {
          tokenId = BigInt(log.topics[3]).toString();
        }
      }

      setMintedTokenId(tokenId);
      toast.success(`ArcGenesis NFT #${tokenId} minted to your wallet!`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Minting failed");
    } finally {
      setIsMinting(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      {/* Header */}
      <div className="text-center flex flex-col gap-2">
        <FragArcLogo size="xl" withGlow={true} className="mx-auto mb-2" />
        <Badge variant="outline" className="mx-auto text-primary border-primary/30">
          Arc Developer Sandbox
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Arc Testnet Faucet & Demo NFTs
        </h1>
        <p className="text-xs text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Mint free ArcGenesis NFTs and get testnet USDC to test the entire bidirectional fragmentation
          and buyout auction lifecycle in under 2 minutes.
        </p>
      </div>

      {/* Network Setup & Official Faucet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Circle USDC Faucet */}
        <Card className="rounded-2xl border border-border/60 p-6 flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Coins className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-bold text-sm text-foreground">Circle Official Faucet</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Arc uses native USDC for gas and value transfers. Claim free testnet USDC directly from
                Circle's official faucet to fund gas fees and buyout bids.
              </p>
            </div>
          </div>

          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants(), "w-full rounded-xl gap-2 text-xs font-medium")}
          >
            Get Testnet USDC on faucet.circle.com
            <ExternalLink className="size-3.5" />
          </a>
        </Card>

        {/* Card 2: 1-Click Wallet Setup */}
        <Card className="rounded-2xl border border-border/60 p-6 flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-500">
              <PlusCircle className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-bold text-sm text-foreground">Configure Arc in Wallet</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Add the Arc Testnet RPC (Chain ID 5042002) and native USDC gas token configuration to MetaMask,
                Rabby, or Coinbase Wallet with 1 click.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleAddArcTestnet}
            className="w-full rounded-xl gap-2 text-xs font-medium"
          >
            Add Arc Testnet to Wallet
          </Button>
        </Card>
      </div>

      {/* Mint Success Notice */}
      {mintedTokenId && (
        <Alert className="rounded-2xl border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="size-4" />
          <AlertTitle className="text-sm font-semibold">NFT Minted Successfully!</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 text-xs font-mono pt-1">
            <span>You own ArcGenesis Token #{mintedTokenId}</span>
            <Link
              href="/fractionalize"
              className={cn(buttonVariants({ size: "sm" }), "rounded-xl gap-1 text-xs")}
            >
              Fractionalize This NFT Now
              <ArrowRight className="size-3.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Demo NFTs Gallery */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Mint Demo ArcGenesis NFTs
          </h2>
          <p className="text-xs text-muted-foreground">
            Click any collection piece below to mint it directly to your connected wallet.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {presets?.map((preset) => (
            <Card
              key={preset.id}
              className="group overflow-hidden rounded-2xl border border-border/60 hover:border-primary/40 hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
                <img
                  src={preset.image}
                  alt={preset.name}
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-2.5 right-2.5">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    #{preset.id}
                  </Badge>
                </div>
              </div>

              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-bold truncate text-foreground">
                  {preset.name}
                </CardTitle>
                <CardDescription className="text-xs line-clamp-2">
                  {preset.description}
                </CardDescription>
              </CardHeader>

              <CardFooter className="p-4 pt-1">
                <Button
                  size="sm"
                  disabled={isMinting === preset.id || !isConnected}
                  onClick={() => handleMintDemoNFT(preset.id, `ipfs://arcgenesis-${preset.id}`)}
                  className="w-full rounded-xl text-xs gap-1.5 font-medium"
                >
                  {isMinting === preset.id ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {isMinting === preset.id ? "Minting..." : "Mint Free Test NFT"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
