"use client";

import * as React from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { Wallet, LogOut, AlertTriangle, ShieldCheck, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@frag-arc/ui/components/button";
import { Badge } from "@frag-arc/ui/components/badge";
import { cn } from "@frag-arc/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@frag-arc/ui/components/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@frag-arc/ui/components/dialog";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { FragArcLogo } from "./fragarc-logo";
import { arcTestnet, arcMainnet } from "@/lib/arc-chains";

export function WalletConnect() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { data: session, refetch: refetchSession } = authClient.useSession();

  const [walletModalOpen, setWalletModalOpen] = React.useState(false);
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const isArcChain = chain?.id === arcTestnet.id || chain?.id === arcMainnet.id;

  const handleSiweSignIn = async () => {
    if (!address || !chain) return;
    setIsSigningIn(true);
    try {
      const nonceRes = await authClient.siwe.nonce();
      if (nonceRes.error || !nonceRes.data?.nonce) {
        throw new Error(nonceRes.error?.message || "Failed to generate nonce");
      }
      const nonce = nonceRes.data.nonce;
      const domain = window.location.host;
      const uri = window.location.origin;

      const issuedAt = new Date().toISOString();
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        "",
        "Sign in with Ethereum to FragArc Decentralized NFT Fragmentation Platform.",
        "",
        `URI: ${uri}`,
        `Version: 1`,
        `Chain ID: ${chain.id}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
      ].join("\n");

      const signature = await signMessageAsync({ message });

      const verifyRes = await authClient.siwe.verify({
        message,
        signature,
      });

      if (verifyRes.error) {
        throw new Error(verifyRes.error.message || "SIWE verification failed");
      }

      await refetchSession();
      toast.success("Signed in with Ethereum successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to sign in with wallet");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    disconnect();
    toast.info("Wallet disconnected and signed out");
  };

  const truncate = (str?: string) => {
    if (!str) return "";
    return `${str.slice(0, 6)}...${str.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <>
        <Button
          onClick={() => setWalletModalOpen(true)}
          className="rounded-lg shadow-sm font-medium gap-2"
        >
          <Wallet className="size-4" />
          Connect Wallet
        </Button>

        <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="flex flex-col items-center text-center gap-2">
              <FragArcLogo size="lg" withGlow={true} />
              <DialogTitle>Connect Wallet to FragArc</DialogTitle>
              <DialogDescription>
                Select your preferred browser wallet to interact with the Arc Network.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 pt-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  disabled={isConnecting}
                  onClick={() => {
                    connect({ connector });
                    setWalletModalOpen(false);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="font-medium text-sm text-foreground">{connector.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    EVM
                  </Badge>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!isArcChain) {
    return (
      <Button
        variant="destructive"
        onClick={() => switchChain?.({ chainId: arcTestnet.id })}
        className="gap-2 rounded-lg"
      >
        <AlertTriangle className="size-4" />
        Switch to Arc Testnet
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={chain?.id === arcMainnet.id ? "default" : "secondary"}
        className="hidden sm:inline-flex gap-1.5 py-1 px-2.5 text-xs font-mono"
      >
        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
        {chain?.name}
      </Badge>

      {!session?.user ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isSigningIn}
          onClick={handleSiweSignIn}
          className="gap-1.5 border-primary/40 hover:bg-primary/10 text-primary font-medium"
        >
          {isSigningIn ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          SIWE Sign In
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-2 font-mono text-xs cursor-pointer"
          )}
        >
          <span className="size-2 rounded-full bg-emerald-500" />
          {truncate(address)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
            Connected Wallet
          </DropdownMenuLabel>
          <div className="px-2 py-1 text-xs font-mono font-medium truncate">
            {address}
          </div>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => switchChain?.({ chainId: arcTestnet.id })}
            className="text-xs"
          >
            {chain?.id === arcTestnet.id ? "✓ Arc Testnet (Active)" : "Switch to Arc Testnet"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => switchChain?.({ chainId: arcMainnet.id })}
            className="text-xs"
          >
            {chain?.id === arcMainnet.id ? "✓ Arc Mainnet (Active)" : "Switch to Arc Mainnet"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-destructive focus:text-destructive text-xs gap-2 cursor-pointer"
          >
            <LogOut className="size-3.5" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
