"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatUnits, parseEther, parseGwei } from "viem";
import {
  Shield,
  ExternalLink,
  Flame,
  CheckCircle2,
  Clock,
  RefreshCw,
  Coins,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@frag-arc/ui/components/card";
import { Button } from "@frag-arc/ui/components/button";
import { Input } from "@frag-arc/ui/components/input";
import { Label } from "@frag-arc/ui/components/label";
import { Badge } from "@frag-arc/ui/components/badge";
import { Progress } from "@frag-arc/ui/components/progress";
import { Alert, AlertTitle, AlertDescription } from "@frag-arc/ui/components/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@frag-arc/ui/components/tabs";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { FragArcLogo } from "@/components/fragarc-logo";
import {
  NFTVaultABI,
  FractionTokenABI,
  ARC_CONTRACTS,
  ARC_DEFAULT_GAS_FLOOR,
} from "@frag-arc/contracts";
import { arcMainnet, arcTestnet } from "@/lib/arc-chains";

export default function VaultDetailPage() {
  const params = useParams();
  const rawAddress = params?.address as string;
  const vaultAddress = (rawAddress || "").toLowerCase();

  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Queries & Mutations
  const { data: vault, isLoading, refetch } = useQuery(
    trpc.vaults.getByAddress.queryOptions({ address: vaultAddress }, { enabled: !!vaultAddress })
  );
  const recordBidMutation = useMutation(trpc.vaults.recordBid.mutationOptions());
  const updateStatusMutation = useMutation(trpc.vaults.updateStatus.mutationOptions());

  // Onchain state
  const [userFractionBalance, setUserFractionBalance] = React.useState<bigint>(0n);
  const [totalFractionSupply, setTotalFractionSupply] = React.useState<bigint>(0n);
  const [onchainState, setOnchainState] = React.useState<number>(1);
  const [onchainCurrentBid, setOnchainCurrentBid] = React.useState<bigint>(0n);
  const [onchainCurrentBidder, setOnchainCurrentBidder] = React.useState<string>("");
  const [onchainAuctionEndTime, setOnchainAuctionEndTime] = React.useState<number>(0);
  const [pendingRefund, setPendingRefund] = React.useState<bigint>(0n);
  const [totalProceeds, setTotalProceeds] = React.useState<bigint>(0n);
  const [fractionTokenAddress, setFractionTokenAddress] = React.useState<string>("");

  // Action input states
  const [buyoutBidAmount, setBuyoutBidAmount] = React.useState("");
  const [transferRecipient, setTransferRecipient] = React.useState("");
  const [transferAmount, setTransferAmount] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Time remaining
  const [timeLeftStr, setTimeLeftStr] = React.useState<string>("");

  const contractsConfig =
    chain?.id === arcMainnet.id ? ARC_CONTRACTS.mainnet : ARC_CONTRACTS.testnet;

  // Sync onchain state
  const syncOnchainData = React.useCallback(async () => {
    if (!publicClient || !vaultAddress) return;
    try {
      const stateNum = (await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "state",
      })) as number;
      setOnchainState(stateNum);

      const fTokenAddr = (await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "fractionToken",
      })) as string;
      setFractionTokenAddress(fTokenAddr);

      const cBid = (await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "currentBid",
      })) as bigint;
      setOnchainCurrentBid(cBid);

      const cBidder = (await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "currentBidder",
      })) as string;
      setOnchainCurrentBidder(cBidder);

      const aEndTime = (await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "auctionEndTime",
      })) as bigint;
      setOnchainAuctionEndTime(Number(aEndTime));

      const tProceeds = (await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "totalBuyoutProceeds",
      })) as bigint;
      setTotalProceeds(tProceeds);

      if (fTokenAddr) {
        const supply = (await publicClient.readContract({
          address: fTokenAddr as `0x${string}`,
          abi: FractionTokenABI,
          functionName: "totalSupply",
        })) as bigint;
        setTotalFractionSupply(supply);

        if (address) {
          const bal = (await publicClient.readContract({
            address: fTokenAddr as `0x${string}`,
            abi: FractionTokenABI,
            functionName: "balanceOf",
            args: [address],
          })) as bigint;
          setUserFractionBalance(bal);

          const refund = (await publicClient.readContract({
            address: vaultAddress as `0x${string}`,
            abi: NFTVaultABI,
            functionName: "pendingWithdrawals",
            args: [address],
          })) as bigint;
          setPendingRefund(refund);
        }
      }
    } catch (err) {
      console.error("Error reading onchain vault data:", err);
    }
  }, [publicClient, vaultAddress, address]);

  React.useEffect(() => {
    syncOnchainData();
    const interval = setInterval(syncOnchainData, 5000);
    return () => clearInterval(interval);
  }, [syncOnchainData]);

  // Countdown timer for buyout auction
  React.useEffect(() => {
    if (onchainState !== 2 || onchainAuctionEndTime === 0) return;

    const updateTimer = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const diff = onchainAuctionEndTime - nowSec;
      if (diff <= 0) {
        setTimeLeftStr("Auction Ended");
      } else {
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        setTimeLeftStr(`${m}m ${s < 10 ? "0" : ""}${s}s`);
      }
    };

    updateTimer();
    const tInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(tInterval);
  }, [onchainState, onchainAuctionEndTime]);

  // Ownership calculation
  const ownershipPercentage =
    totalFractionSupply > 0n
      ? Number((userFractionBalance * 10000n) / totalFractionSupply) / 100
      : 0;
  const is100PercentOwner =
    totalFractionSupply > 0n && userFractionBalance === totalFractionSupply;

  // Action: Direct 100% Redemption
  const handleRedeem = async () => {
    if (!walletClient || !publicClient || !address) {
      toast.error("Connect wallet to redeem");
      return;
    }
    setIsSubmitting(true);
    try {
      toast.info("Submitting 100% redemption on Arc...");
      const hash = await walletClient.writeContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "redeem",
        maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
        maxPriorityFeePerGas: parseGwei("2"),
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await updateStatusMutation.mutateAsync({
        vaultAddress,
        status: "REDEEMED",
      });
      await syncOnchainData();
      await refetch();
      toast.success("Congratulations! 100% fractions burned and NFT reclaimed!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Redemption failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Start or Bid in Buyout
  const handlePlaceBuyoutBid = async () => {
    if (!walletClient || !publicClient || !address) {
      toast.error("Connect wallet to place bid");
      return;
    }
    if (!buyoutBidAmount || parseFloat(buyoutBidAmount) <= 0) {
      toast.error("Enter a valid bid amount");
      return;
    }

    setIsSubmitting(true);
    try {
      const bidWei = parseEther(buyoutBidAmount);

      let hash: `0x${string}`;
      if (onchainState === 2) {
        toast.info("Placing higher bid...");
        hash = await walletClient.writeContract({
          address: vaultAddress as `0x${string}`,
          abi: NFTVaultABI,
          functionName: "bid",
          value: bidWei,
          maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
          maxPriorityFeePerGas: parseGwei("2"),
        });
      } else {
        toast.info("Initiating buyout auction with native USDC...");
        hash = await walletClient.writeContract({
          address: vaultAddress as `0x${string}`,
          abi: NFTVaultABI,
          functionName: "startBuyout",
          value: bidWei,
          maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
          maxPriorityFeePerGas: parseGwei("2"),
        });
      }

      await publicClient.waitForTransactionReceipt({ hash });
      await recordBidMutation.mutateAsync({
        vaultAddress,
        bidder: address,
        amount: bidWei.toString(),
        txHash: hash,
        auctionEndTime: onchainAuctionEndTime,
      });

      setBuyoutBidAmount("");
      await syncOnchainData();
      await refetch();
      toast.success("Buyout bid successfully recorded on Arc!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Bid placement failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Withdraw Pending Refund (Pull pattern)
  const handleWithdrawRefund = async () => {
    if (!walletClient || !publicClient || !address) return;
    setIsSubmitting(true);
    try {
      toast.info("Withdrawing outbid refund...");
      const hash = await walletClient.writeContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "withdrawPendingFunds",
        maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
        maxPriorityFeePerGas: parseGwei("2"),
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await syncOnchainData();
      toast.success("Refunded USDC successfully sent to your wallet!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Withdrawal failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: End Buyout Auction
  const handleEndBuyout = async () => {
    if (!walletClient || !publicClient || !address) return;
    setIsSubmitting(true);
    try {
      toast.info("Concluding buyout auction...");
      const hash = await walletClient.writeContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "endBuyout",
        maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
        maxPriorityFeePerGas: parseGwei("2"),
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await updateStatusMutation.mutateAsync({
        vaultAddress,
        status: "BOUGHT_OUT",
      });
      await syncOnchainData();
      await refetch();
      toast.success("Auction concluded! Winner received the NFT.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Failed to end auction");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Burn Fractions & Claim Pro-Rata USDC
  const handleBurnAndClaim = async () => {
    if (!walletClient || !publicClient || !address || userFractionBalance <= 0n) return;
    setIsSubmitting(true);
    try {
      toast.info("Burning fractions for pro-rata USDC payout...");
      const hash = await walletClient.writeContract({
        address: vaultAddress as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "burnAndClaim",
        args: [userFractionBalance],
        maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
        maxPriorityFeePerGas: parseGwei("2"),
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await syncOnchainData();
      toast.success("Fractions burned! USDC payout credited to your wallet.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Payout claim failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Transfer Fractions
  const handleTransferFractions = async () => {
    if (!walletClient || !publicClient || !fractionTokenAddress) return;
    if (!transferRecipient || !transferAmount) {
      toast.error("Please enter recipient and amount");
      return;
    }
    setIsSubmitting(true);
    try {
      const amountWei = parseEther(transferAmount);
      const hash = await walletClient.writeContract({
        address: fractionTokenAddress as `0x${string}`,
        abi: FractionTokenABI,
        functionName: "transfer",
        args: [transferRecipient as `0x${string}`, amountWei],
        maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
        maxPriorityFeePerGas: parseGwei("2"),
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTransferAmount("");
      setTransferRecipient("");
      await syncOnchainData();
      toast.success("Fractions transferred successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Transfer failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <RefreshCw className="size-6 animate-spin text-primary" />
        <span className="text-xs font-mono">Loading vault details from Arc...</span>
      </div>
    );
  }

  const reservePriceUSDC = vault
    ? formatUnits(BigInt(vault.reservePrice), 18)
    : "0";
  const currentBidFormatted = onchainCurrentBid > 0n
    ? formatUnits(onchainCurrentBid, 18)
    : null;
  const userBalanceFormatted = formatUnits(userFractionBalance, 18);

  const userClaimablePayout =
    totalFractionSupply > 0n && totalProceeds > 0n
      ? formatUnits((userFractionBalance * totalProceeds) / totalFractionSupply, 18)
      : "0";

  return (
    <div className="max-w-6xl mx-auto py-6 flex flex-col gap-8">
      {pendingRefund > 0n && (
        <Alert className="flex items-center justify-between rounded-2xl border-sky-500/30 bg-sky-500/10 text-sky-500">
          <div className="flex items-center gap-3">
            <Coins className="size-5 text-sky-500" />
            <div>
              <AlertTitle className="text-sm font-semibold">Outbid Refund Available</AlertTitle>
              <AlertDescription className="text-xs">
                You were outbid and have{" "}
                <strong>{formatUnits(pendingRefund, 18)} USDC</strong> ready for withdrawal.
              </AlertDescription>
            </div>
          </div>
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={handleWithdrawRefund}
            className="rounded-xl text-xs"
          >
            Withdraw {formatUnits(pendingRefund, 18)} USDC
          </Button>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: NFT Artwork & Details */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <Card className="rounded-3xl border border-border/60 overflow-hidden shadow-lg">
            <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
              {vault?.nftImage ? (
                <img
                  src={vault.nftImage}
                  alt={vault.nftName || vault.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-gradient-to-tr from-muted/50 to-muted/20 font-mono text-muted-foreground p-6">
                  <FragArcLogo size="2xl" withGlow={true} />
                  <span className="text-sm font-semibold text-foreground">Arc NFT #{vault?.tokenId}</span>
                </div>
              )}

              <div className="absolute top-4 right-4">
                {onchainState === 2 ? (
                  <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-500 animate-pulse">
                    <Flame className="size-3 text-amber-500" />
                    Buyout Live: {timeLeftStr}
                  </Badge>
                ) : onchainState === 3 ? (
                  <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-500">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    Redeemed 100%
                  </Badge>
                ) : onchainState === 4 ? (
                  <Badge variant="secondary" className="gap-1">
                    <Shield className="size-3" />
                    Bought Out
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Active Vault
                  </Badge>
                )}
              </div>
            </div>

            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-lg font-bold text-foreground">
                {vault?.nftName || vault?.name}
              </CardTitle>
              <CardDescription className="text-xs">
                {vault?.nftDescription || "A fractionalized digital asset locked in Arc Vault custody."}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 pt-2 flex flex-col gap-3 font-mono text-xs">
              <div className="flex justify-between py-2 border-b border-border/40">
                <span className="text-muted-foreground">NFT Contract</span>
                <a
                  href={`${contractsConfig.blockExplorer}/address/${vault?.nftContract}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  {vault?.nftContract.slice(0, 8)}...{vault?.nftContract.slice(-4)}
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <div className="flex justify-between py-2 border-b border-border/40">
                <span className="text-muted-foreground">Token ID</span>
                <span className="text-foreground">#{vault?.tokenId}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-border/40">
                <span className="text-muted-foreground">Vault Address</span>
                <a
                  href={`${contractsConfig.blockExplorer}/address/${vaultAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  {vaultAddress.slice(0, 8)}...{vaultAddress.slice(-4)}
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <div className="flex justify-between py-2 border-b border-border/40">
                <span className="text-muted-foreground">Fraction Token</span>
                <a
                  href={`${contractsConfig.blockExplorer}/token/${fractionTokenAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  ${vault?.symbol} ({fractionTokenAddress ? `${fractionTokenAddress.slice(0, 6)}...` : ""})
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Curator</span>
                <span className="text-foreground">
                  {vault?.curatorAddress.slice(0, 8)}...{vault?.curatorAddress.slice(-4)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Interaction Hub */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <Card className="rounded-2xl border border-border/60 p-5">
            <CardContent className="p-0 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground block">Your Fraction Holdings</span>
                  <span className="text-xl font-extrabold font-mono text-foreground">
                    {Number(userBalanceFormatted).toLocaleString()} ${vault?.symbol}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground block">Ownership Share</span>
                  <span className="text-xl font-extrabold font-mono text-primary">
                    {ownershipPercentage}%
                  </span>
                </div>
              </div>

              <Progress value={ownershipPercentage} max={100} className="h-2.5" />

              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Reserve Price: {reservePriceUSDC} USDC</span>
                <span>
                  Supply: {formatUnits(totalFractionSupply, 18)} ${vault?.symbol}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 shadow-lg p-6">
            <Tabs defaultValue="redeem" className="flex flex-col gap-6">
              <TabsList className="grid grid-cols-3 h-10 rounded-xl">
                <TabsTrigger value="redeem" className="text-xs">
                  Direct Redemption
                </TabsTrigger>
                <TabsTrigger value="buyout" className="text-xs">
                  Buyout Auction
                </TabsTrigger>
                <TabsTrigger value="transfer" className="text-xs">
                  Transfer Tokens
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: Direct 100% Redemption */}
              <TabsContent value="redeem" className="flex flex-col gap-5 pt-1">
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-base font-bold text-foreground">Reclaim Underlying NFT</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Any collector or investor who holds <strong>100% of the circulating fraction tokens</strong>{" "}
                    can burn them all to immediately unlock and withdraw the original NFT from the vault.
                  </p>
                </div>

                {is100PercentOwner ? (
                  <div className="flex flex-col gap-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                      <CheckCircle2 className="size-4" />
                      You hold 100% of fractional tokens!
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Executing redemption will burn all {formatUnits(totalFractionSupply, 18)} ${vault?.symbol}{" "}
                      tokens and return the NFT directly to your connected wallet.
                    </p>
                    <Button
                      disabled={isSubmitting || onchainState !== 1}
                      onClick={handleRedeem}
                      className="rounded-xl gap-2 font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                      Burn 100% & Reclaim NFT
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 p-4 rounded-2xl bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                      <Clock className="size-4" />
                      You own {ownershipPercentage}% of total fractions.
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      To perform a direct redemption, you must acquire the remaining{" "}
                      <strong>{(100 - ownershipPercentage).toFixed(2)}%</strong> of fractions. Alternatively,
                      you can trigger a <strong>Buyout Auction</strong> below to purchase the NFT with native USDC.
                    </p>
                    <Button disabled variant="outline" className="rounded-xl text-xs opacity-60">
                      Redemption Locked (Need 100%)
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: Buyout Auction */}
              <TabsContent value="buyout" className="flex flex-col gap-5 pt-1">
                {onchainState === 4 ? (
                  <div className="flex flex-col gap-4 p-5 rounded-2xl bg-muted/40 border border-border/50">
                    <div className="flex items-center gap-2 text-emerald-500 font-semibold text-sm">
                      <Shield className="size-4" />
                      Vault Bought Out for {formatUnits(onchainCurrentBid, 18)} USDC!
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The buyout auction has ended. Fraction token holders can burn their tokens to receive their
                      exact pro-rata share of the winning buyout proceeds.
                    </p>

                    <div className="p-3 rounded-xl bg-card border border-border/50 flex justify-between items-center text-xs font-mono">
                      <span>Your Claimable Share:</span>
                      <span className="font-bold text-foreground text-sm">
                        {userClaimablePayout} USDC
                      </span>
                    </div>

                    <Button
                      disabled={isSubmitting || userFractionBalance <= 0n}
                      onClick={handleBurnAndClaim}
                      className="rounded-xl font-medium gap-2"
                    >
                      {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                      Burn My Fractions & Claim {userClaimablePayout} USDC
                    </Button>
                  </div>
                ) : onchainState === 2 ? (
                  <div className="flex flex-col gap-4">
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-mono text-amber-700 dark:text-amber-400 block font-semibold">
                          Auction Live
                        </span>
                        <span className="text-xl font-bold font-mono text-foreground">
                          {currentBidFormatted} USDC
                        </span>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          Bidder: {onchainCurrentBidder}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                          Time Remaining
                        </span>
                        <span className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">
                          {timeLeftStr}
                        </span>
                      </div>
                    </div>

                    {timeLeftStr === "Auction Ended" ? (
                      <Button
                        disabled={isSubmitting}
                        onClick={handleEndBuyout}
                        className="rounded-xl gap-2 font-medium bg-emerald-600 hover:bg-emerald-700"
                      >
                        {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                        Conclude Auction & Send NFT to Winner
                      </Button>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <Label htmlFor="higherBid" className="text-xs">
                          Place Higher Bid (Min 5% increase:{" "}
                          {formatUnits(
                            onchainCurrentBid + (onchainCurrentBid * 500n) / 10000n,
                            18
                          )}{" "}
                          USDC)
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="higherBid"
                            type="number"
                            placeholder="Amount in native USDC"
                            value={buyoutBidAmount}
                            onChange={(e) => setBuyoutBidAmount(e.target.value)}
                            className="font-mono text-xs rounded-xl"
                          />
                          <Button
                            disabled={isSubmitting || !buyoutBidAmount}
                            onClick={handlePlaceBuyoutBid}
                            className="rounded-xl text-xs whitespace-nowrap"
                          >
                            {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                            Outbid
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-foreground">Start Buyout Auction</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Trigger a decentralized auction by offering at least the reserve price in native USDC (
                        <strong>{reservePriceUSDC} USDC</strong>). If you win, you receive the NFT!
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="startBid" className="text-xs">
                        Buyout Offer (USDC)
                      </Label>
                      <Input
                        id="startBid"
                        type="number"
                        placeholder={`Min ${reservePriceUSDC} USDC`}
                        value={buyoutBidAmount}
                        onChange={(e) => setBuyoutBidAmount(e.target.value)}
                        className="font-mono text-xs rounded-xl"
                      />
                    </div>

                    <Button
                      disabled={
                        isSubmitting ||
                        !buyoutBidAmount ||
                        parseFloat(buyoutBidAmount) < parseFloat(reservePriceUSDC)
                      }
                      onClick={handlePlaceBuyoutBid}
                      className="rounded-xl font-medium gap-2 text-xs"
                    >
                      {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                      <Flame className="size-3.5 text-amber-400" />
                      Deposit {buyoutBidAmount || "0"} USDC & Start Buyout
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* TAB 3: Transfer Fractions */}
              <TabsContent value="transfer" className="flex flex-col gap-4 pt-1">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-bold text-foreground">Send Fractional Tokens</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Transfer your ${vault?.symbol} ERC-20 tokens to another address or liquidity pool on Arc.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="recipient" className="text-xs">
                    Recipient Address
                  </Label>
                  <Input
                    id="recipient"
                    placeholder="0x..."
                    value={transferRecipient}
                    onChange={(e) => setTransferRecipient(e.target.value)}
                    className="font-mono text-xs rounded-xl"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="amount" className="text-xs">
                    Amount (${vault?.symbol})
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder={`Max ${userBalanceFormatted}`}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="font-mono text-xs rounded-xl"
                  />
                </div>

                <Button
                  disabled={isSubmitting || !transferRecipient || !transferAmount}
                  onClick={handleTransferFractions}
                  className="rounded-xl font-medium gap-2 text-xs"
                >
                  {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                  <Send className="size-3.5" />
                  Transfer Fractions
                </Button>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
