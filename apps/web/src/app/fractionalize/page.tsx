"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isAddress, parseEther, parseGwei } from "viem";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Coins,
} from "lucide-react";
import { Button, buttonVariants } from "@frag-arc/ui/components/button";
import { Input } from "@frag-arc/ui/components/input";
import { Label } from "@frag-arc/ui/components/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@frag-arc/ui/components/card";
import { Badge } from "@frag-arc/ui/components/badge";
import { Alert, AlertTitle, AlertDescription } from "@frag-arc/ui/components/alert";
import { cn } from "@frag-arc/ui/lib/utils";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import {
  NFTVaultFactoryABI,
  NFTVaultABI,
  MockArcNFTABI,
  ARC_CONTRACTS,
  ARC_DEFAULT_GAS_FLOOR,
} from "@frag-arc/contracts";
import { arcTestnet, arcMainnet } from "@/lib/arc-chains";
import { FragArcLogo } from "@/components/fragarc-logo";

export default function FractionalizePage() {
  const router = useRouter();
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const registerVaultMutation = useMutation(trpc.vaults.register.mutationOptions());
  const { data: demoNFTs } = useQuery(trpc.faucet.getPresets.queryOptions());

  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  // Form State
  const [nftContract, setNftContract] = React.useState("");
  const [tokenId, setTokenId] = React.useState("");
  const [tokenType, setTokenType] = React.useState<"ERC721" | "ERC1155">("ERC721");
  const [tokenAmount, setTokenAmount] = React.useState("1");
  const [tokenName, setTokenName] = React.useState("");
  const [tokenSymbol, setTokenSymbol] = React.useState("");
  const [totalSupply, setTotalSupply] = React.useState("1000000");
  const [reservePriceUSDC, setReservePriceUSDC] = React.useState("100");
  const [auctionMinutes, setAuctionMinutes] = React.useState("10");

  // Metadata preview
  const [nftImage, setNftImage] = React.useState("");
  const [nftName, setNftName] = React.useState("");
  const [nftDescription, setNftDescription] = React.useState("");

  // Transaction states
  const [isApproving, setIsApproving] = React.useState(false);
  const [isApproved, setIsApproved] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [createdVaultAddress, setCreatedVaultAddress] = React.useState<string | null>(null);

  const contractsConfig =
    chain?.id === arcMainnet.id ? ARC_CONTRACTS.mainnet : ARC_CONTRACTS.testnet;
  const factoryAddress = contractsConfig.factoryAddress;

  const handleSelectDemoPreset = (preset: NonNullable<typeof demoNFTs>[number]) => {
    if (!preset || chain?.id !== arcTestnet.id || !contractsConfig.mockNftAddress) return;
    setNftContract(contractsConfig.mockNftAddress);
    setTokenId(preset.id.toString());
    setTokenName(preset.name);
    setTokenSymbol(preset.symbol);
    setNftName(preset.name);
    setNftImage(preset.image);
    setNftDescription(preset.description);
  };

  const checkApproval = React.useCallback(async () => {
    if (!publicClient || !address || !nftContract || !tokenId) return;
    try {
      if (tokenType === "ERC1155") {
        const approvedForAll = await publicClient.readContract({
          address: nftContract as `0x${string}`,
          abi: MockArcNFTABI,
          functionName: "isApprovedForAll",
          args: [address, factoryAddress],
        });
        setIsApproved(approvedForAll);
      } else {
        const approvedAddress = (await publicClient.readContract({
          address: nftContract as `0x${string}`,
          abi: MockArcNFTABI,
          functionName: "getApproved",
          args: [BigInt(tokenId)],
        })) as string;
        setIsApproved(approvedAddress.toLowerCase() === factoryAddress.toLowerCase());
      }
    } catch {
      setIsApproved(false);
    }
  }, [publicClient, address, nftContract, tokenId, tokenType, factoryAddress]);

  React.useEffect(() => {
    if (step === 3) {
      checkApproval();
    }
  }, [step, checkApproval]);

  const handleApproveNFT = async () => {
    if (!walletClient || !publicClient || !address) {
      toast.error("Please connect your wallet first");
      return;
    }
    setIsApproving(true);
    try {
      toast.info("Approving NFT transfer to Vault Factory...");
      const hash =
        tokenType === "ERC1155"
          ? await walletClient.writeContract({
              address: nftContract as `0x${string}`,
              abi: MockArcNFTABI,
              functionName: "setApprovalForAll",
              args: [factoryAddress, true],
              maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
              maxPriorityFeePerGas: parseGwei("2"),
            })
          : await walletClient.writeContract({
              address: nftContract as `0x${string}`,
              abi: MockArcNFTABI,
              functionName: "approve",
              args: [factoryAddress, BigInt(tokenId)],
              maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
              maxPriorityFeePerGas: parseGwei("2"),
            });

      await publicClient.waitForTransactionReceipt({ hash });
      setIsApproved(true);
      toast.success("NFT approved for vault creation!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Approval failed");
    } finally {
      setIsApproving(false);
    }
  };

  const handleCreateVault = async () => {
    if (!walletClient || !publicClient || !address) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!chain || (chain.id !== arcTestnet.id && chain.id !== arcMainnet.id)) {
      toast.error("Switch your wallet to Arc Testnet or Arc Mainnet first.");
      return;
    }
    if (factoryAddress === "0x0000000000000000000000000000000000000000") {
      toast.error("Vault creation is not enabled on this Arc network yet.");
      return;
    }
    if (!isAddress(nftContract)) {
      toast.error("Enter a valid NFT contract address.");
      return;
    }
    if (tokenType === "ERC1155" && BigInt(tokenAmount || "0") <= 0n) {
      toast.error("Enter a valid ERC-1155 token amount.");
      return;
    }
    setIsCreating(true);
    try {
      toast.info("Creating Vault on Arc Network...");

      const initialSupplyWei = parseEther(totalSupply);
      const reservePriceWei = parseEther(reservePriceUSDC);
      const auctionDurationSec = BigInt(parseInt(auctionMinutes, 10) * 60);

      const hash = await walletClient.writeContract({
        address: factoryAddress,
        abi: NFTVaultFactoryABI,
        functionName: "createVault",
        args: [
          nftContract as `0x${string}`,
          BigInt(tokenId),
          tokenType === "ERC1155" ? BigInt(tokenAmount) : 1n,
          tokenType === "ERC1155" ? 1 : 0,
          tokenName,
          tokenSymbol,
          initialSupplyWei,
          reservePriceWei,
          auctionDurationSec,
        ],
        maxFeePerGas: ARC_DEFAULT_GAS_FLOOR,
        maxPriorityFeePerGas: parseGwei("2"),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let deployedVault = "";
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === factoryAddress.toLowerCase() && log.topics[1]) {
          deployedVault = `0x${log.topics[1].slice(26)}`;
        }
      }

      if (!deployedVault) {
        const allVaults = (await publicClient.readContract({
          address: factoryAddress,
          abi: NFTVaultFactoryABI,
          functionName: "getAllVaults",
        })) as string[];
        deployedVault = allVaults[allVaults.length - 1] || "";
      }

      if (!deployedVault) {
        throw new Error("Vault deployment succeeded but no vault address was emitted.");
      }

      const deployedFractionToken = (await publicClient.readContract({
        address: deployedVault as `0x${string}`,
        abi: NFTVaultABI,
        functionName: "fractionToken",
      })) as `0x${string}`;

      setCreatedVaultAddress(deployedVault);

      await registerVaultMutation.mutateAsync({
        vaultAddress: deployedVault,
        tokenAddress: deployedFractionToken,
        nftContract,
        tokenId,
        tokenAmount: tokenType === "ERC1155" ? tokenAmount : "1",
        tokenType,
        name: tokenName,
        symbol: tokenSymbol,
        totalSupply: initialSupplyWei.toString(),
        reservePrice: reservePriceWei.toString(),
        curatorAddress: address,
        nftName: nftName || `${tokenName} #${tokenId}`,
        nftImage: nftImage || "",
        nftDescription: nftDescription || "",
        txHash: hash,
        chainId: chain?.id || 5042002,
      });

      toast.success("Vault successfully created on Arc!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Failed to create vault");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 flex flex-col gap-8">
      <div className="flex flex-col gap-2 text-center">
        <FragArcLogo size="xl" withGlow={true} className="mx-auto mb-1" />
        <Badge variant="outline" className="mx-auto text-primary border-primary/30">
          Step {step} of 3
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Fractionalize Your NFT
        </h1>
        <p className="text-xs text-muted-foreground">
          Transform your NFT into liquid ERC-20 tokens with bidirectional 100% redemption rights.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
        <div
          className={`py-2 rounded-xl border ${
            step === 1
              ? "border-primary bg-primary/10 text-primary font-semibold"
              : step > 1
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
              : "border-border text-muted-foreground"
          }`}
        >
          1. Select NFT
        </div>
        <div
          className={`py-2 rounded-xl border ${
            step === 2
              ? "border-primary bg-primary/10 text-primary font-semibold"
              : step > 2
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
              : "border-border text-muted-foreground"
          }`}
        >
          2. Configure Fractions
        </div>
        <div
          className={`py-2 rounded-xl border ${
            step === 3
              ? "border-primary bg-primary/10 text-primary font-semibold"
              : "border-border text-muted-foreground"
          }`}
        >
          3. Approve & Deploy
        </div>
      </div>

      {step === 1 && (
        <Card className="rounded-2xl border border-border/60 shadow-md">
          <CardHeader>
            <CardTitle>Step 1: Identify Your NFT</CardTitle>
            <CardDescription>
              Enter the smart contract address and Token ID of the NFT you wish to fragment.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {chain?.id === arcTestnet.id && demoNFTs && demoNFTs.length > 0 && (
              <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Coins className="size-3.5 text-primary" />
                  Quick Testnet Demo Presets
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Select a test ArcGenesis NFT to auto-fill contract and metadata details:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {demoNFTs.map((demo) => (
                    <button
                      key={demo.id}
                      type="button"
                      onClick={() => handleSelectDemoPreset(demo)}
                      className={`p-2 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                        tokenId === demo.id.toString() &&
                        nftContract.toLowerCase() === contractsConfig.mockNftAddress.toLowerCase()
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border/60 hover:bg-muted"
                      }`}
                    >
                      <img
                        src={demo.image}
                        alt={demo.name}
                        className="w-full aspect-square object-cover rounded-lg"
                      />
                      <span className="text-[11px] font-medium truncate text-foreground">
                        {demo.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="nftContract" className="text-xs">
                NFT Contract Address
              </Label>
              <Input
                id="nftContract"
                placeholder="0x..."
                value={nftContract}
                onChange={(e) => setNftContract(e.target.value)}
                className="font-mono text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tokenId" className="text-xs">
                  Token ID
                </Label>
                <Input
                  id="tokenId"
                  placeholder="e.g. 1"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  className="font-mono text-xs rounded-xl"
                />
              </div>

              {tokenType === "ERC1155" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tokenAmount" className="text-xs">
                    Token Amount
                  </Label>
                  <Input
                    id="tokenAmount"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 1"
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    className="font-mono text-xs rounded-xl"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="tokenType" className="text-xs">
                  NFT Standard
                </Label>
                <select
                  id="tokenType"
                  value={tokenType}
                  onChange={(e: any) => setTokenType(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="ERC721">ERC-721 (Non-Fungible)</option>
                  <option value="ERC1155">ERC-1155 (Semi-Fungible)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="nftImage" className="text-xs">
                Image Preview URL (Optional)
              </Label>
              <Input
                id="nftImage"
                placeholder="https://..."
                value={nftImage}
                onChange={(e) => setNftImage(e.target.value)}
                className="text-xs rounded-xl"
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t border-border/40 p-4">
            <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Cancel
            </Link>
            <Button
              disabled={!nftContract || !tokenId}
              onClick={() => setStep(2)}
              className="rounded-xl gap-2 text-xs"
            >
              Continue to Fractions
              <ArrowRight className="size-3.5" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card className="rounded-2xl border border-border/60 shadow-md">
          <CardHeader>
            <CardTitle>Step 2: Fractional Token Parameters</CardTitle>
            <CardDescription>
              Configure the ERC-20 token that will be minted to represent ownership of your NFT.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tokenName" className="text-xs">
                  Fraction Token Name
                </Label>
                <Input
                  id="tokenName"
                  placeholder="e.g. Cyberpunk Ape Fractions"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tokenSymbol" className="text-xs">
                  Token Symbol / Ticker
                </Label>
                <Input
                  id="tokenSymbol"
                  placeholder="e.g. F-APE"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                  className="font-mono text-xs rounded-xl uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="totalSupply" className="text-xs">
                  Total Fractional Supply
                </Label>
                <Input
                  id="totalSupply"
                  type="number"
                  placeholder="1000000"
                  value={totalSupply}
                  onChange={(e) => setTotalSupply(e.target.value)}
                  className="font-mono text-xs rounded-xl"
                />
                <span className="text-[10px] text-muted-foreground">
                  100% of these tokens will be minted to your wallet on creation.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="reservePrice" className="text-xs">
                  Reserve Buyout Price (USDC)
                </Label>
                <Input
                  id="reservePrice"
                  type="number"
                  placeholder="100"
                  value={reservePriceUSDC}
                  onChange={(e) => setReservePriceUSDC(e.target.value)}
                  className="font-mono text-xs rounded-xl"
                />
                <span className="text-[10px] text-muted-foreground">
                  Minimum bid required for someone to initiate a buyout auction.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="auctionMinutes" className="text-xs">
                Buyout Auction Duration (Minutes)
              </Label>
              <Input
                id="auctionMinutes"
                type="number"
                min="10"
                placeholder="10"
                value={auctionMinutes}
                onChange={(e) => setAuctionMinutes(e.target.value)}
                className="font-mono text-xs rounded-xl"
              />
              <span className="text-[10px] text-muted-foreground">
                Minimum 10 minutes. Includes 15-minute anti-sniping protection.
              </span>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t border-border/40 p-4">
            <Button variant="ghost" onClick={() => setStep(1)} size="sm" className="gap-1.5">
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button
              disabled={!tokenName || !tokenSymbol || !totalSupply || !reservePriceUSDC}
              onClick={() => setStep(3)}
              className="rounded-xl gap-2 text-xs"
            >
              Review & Deploy
              <ArrowRight className="size-3.5" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card className="rounded-2xl border border-border/60 shadow-md">
          <CardHeader>
            <CardTitle>Step 3: Approve NFT & Deploy Vault</CardTitle>
            <CardDescription>
              Review your parameters and execute transactions on the Arc Network.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <div className="p-4 rounded-xl bg-muted/30 border border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">NFT</span>
                <span className="font-semibold text-foreground">Token #{tokenId}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Token</span>
                <span className="font-semibold text-primary">${tokenSymbol}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Supply</span>
                <span className="font-semibold text-foreground">
                  {parseInt(totalSupply, 10).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Reserve</span>
                <span className="font-semibold text-emerald-500">{reservePriceUSDC} USDC</span>
              </div>
            </div>

            {createdVaultAddress ? (
              <Alert className="rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="size-4" />
                <AlertTitle>Vault Successfully Deployed!</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 pt-1 font-mono text-xs">
                  <span>Vault Contract: {createdVaultAddress}</span>
                  <div className="flex gap-2 pt-2">
                    <Link
                      href={`/vault/${createdVaultAddress}` as Route}
                      className={cn(buttonVariants({ size: "sm" }), "rounded-lg gap-1.5")}
                    >
                      Go to Vault Page
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">
                      1. Approve NFT Transfer
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Authorizes the Vault Factory to custody your NFT.
                    </span>
                  </div>

                  {isApproved ? (
                    <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-500">
                      <CheckCircle2 className="size-3" />
                      Approved
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      disabled={isApproving}
                      onClick={handleApproveNFT}
                      className="rounded-xl gap-2 text-xs"
                    >
                      {isApproving ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                      Approve NFT
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">
                      2. Create Vault & Mint Fractions
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Deposits NFT, deploys ERC-20 token, and mints 100% of fractions to you.
                    </span>
                  </div>

                  <Button
                    size="sm"
                    disabled={!isApproved || isCreating}
                    onClick={handleCreateVault}
                    className="rounded-xl gap-2 text-xs"
                  >
                    {isCreating ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                    Deploy Vault
                  </Button>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between border-t border-border/40 p-4">
            <Button
              variant="ghost"
              onClick={() => setStep(2)}
              size="sm"
              disabled={isCreating || !!createdVaultAddress}
              className="gap-1.5"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
