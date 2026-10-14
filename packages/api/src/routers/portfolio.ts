import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { buyoutBids, vaults } from "@frag-arc/db/schema/vaults";
import { publicProcedure, router } from "../index";

export const portfolioRouter = router({
  getUserVaults: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ ctx, input }) => {
      const normalized = input.address.toLowerCase();
      return await ctx.db
        .select()
        .from(vaults)
        .where(eq(vaults.curatorAddress, normalized))
        .orderBy(desc(vaults.createdAt));
    }),

  getUserBids: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ ctx, input }) => {
      const normalized = input.address.toLowerCase();
      return await ctx.db
        .select({
          bidId: buyoutBids.id,
          amount: buyoutBids.amount,
          txHash: buyoutBids.txHash,
          createdAt: buyoutBids.createdAt,
          vaultAddress: vaults.vaultAddress,
          vaultName: vaults.name,
          vaultSymbol: vaults.symbol,
          vaultStatus: vaults.status,
          nftImage: vaults.nftImage,
          currentBid: vaults.currentBid,
          currentBidder: vaults.currentBidder,
        })
        .from(buyoutBids)
        .innerJoin(vaults, eq(buyoutBids.vaultAddress, vaults.vaultAddress))
        .where(eq(buyoutBids.bidder, normalized))
        .orderBy(desc(buyoutBids.createdAt));
    }),
});
