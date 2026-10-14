"use client";

import { Toaster } from "@frag-arc/ui/components/sonner";
import { TooltipProvider } from "@frag-arc/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/wagmi";
import { queryClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delay={200}>
            {children}
          </TooltipProvider>
          <ReactQueryDevtools />
        </QueryClientProvider>
      </WagmiProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
