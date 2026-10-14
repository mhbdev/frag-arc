import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { account } from "@frag-arc/db/schema/auth";
import { buyoutBids, vaults } from "@frag-arc/db/schema/vaults";
import type { Context } from "../context";
import { protectedProcedure, publicProcedure, router } from "../index";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash");

async function assertSessionOwnsWallet(
  ctx: Context & { session: NonNullable<Context["session"]> },
  address: string,
) {
  const linkedAccounts = await ctx.db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eq(account.userId, ctx.session.user.id));

  if (
    !linkedAccounts.some(
      (linked) => linked.accountId.toLowerCase() === address.toLowerCase(),
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sign in with the wallet that owns this on-chain action.",
    });
  }
}

export const vaultsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        status: z.enum(["ALL", "ACTIVE", "AUCTION", "REDEEMED", "BOUGHT_OUT"]).default("ALL"),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.db.select().from(vaults);

      const conditions = [];

      if (input.status !== "ALL") {
        conditions.push(eq(vaults.status, input.status));
      }

      if (input.search && input.search.trim().length > 0) {
        const searchPattern = `%${input.search.trim()}%`;
        conditions.push(
          or(
            ilike(vaults.name, searchPattern),
            ilike(vaults.symbol, searchPattern),
            ilike(vaults.nftName, searchPattern),
            ilike(vaults.vaultAddress, searchPattern)
          )
        );
      }

      if (conditions.length === 1) {
        // @ts-ignore
        query = query.where(conditions[0]);
      } else if (conditions.length > 1) {
        // @ts-ignore
        query = query.where(and(...conditions));
      }

      const results = await query.orderBy(desc(vaults.createdAt)).limit(input.limit);
      return results;
    }),

  getByAddress: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ ctx, input }) => {
      const normalized = input.address.toLowerCase();
      const vaultList = await ctx.db
        .select()
        .from(vaults)
        .where(eq(vaults.vaultAddress, normalized))
        .limit(1);

      if (vaultList.length === 0) {
        return null;
      }

      const vault = vaultList[0];
      const bids = await ctx.db
        .select()
        .from(buyoutBids)
        .where(eq(buyoutBids.vaultAddress, normalized))
        .orderBy(desc(buyoutBids.createdAt))
        .limit(20);

      return {
        ...vault,
        bids,
      };
    }),

  register: protectedProcedure
    .input(
      z.object({
        vaultAddress: addressSchema,
        tokenAddress: addressSchema,
        nftContract: addressSchema,
        tokenId: z.string(),
        tokenAmount: z.string().default("1"),
        tokenType: z.enum(["ERC721", "ERC1155"]).default("ERC721"),
        name: z.string(),
        symbol: z.string(),
        totalSupply: z.string(),
        reservePrice: z.string(),
        curatorAddress: addressSchema,
        nftName: z.string().optional(),
        nftImage: z.string().optional(),
        nftDescription: z.string().optional(),
        txHash: txHashSchema.optional(),
        chainId: z.union([z.literal(5042002), z.literal(5042)]).default(5042002),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertSessionOwnsWallet(ctx, input.curatorAddress);

      const normalizedVault = input.vaultAddress.toLowerCase();
      const normalizedToken = input.tokenAddress.toLowerCase();
      const normalizedNft = input.nftContract.toLowerCase();
      const normalizedCurator = input.curatorAddress.toLowerCase();

      const existing = await ctx.db
        .select()
        .from(vaults)
        .where(eq(vaults.vaultAddress, normalizedVault))
        .limit(1);

      if (existing.length > 0) {
        return existing[0];
      }

      const [newVault] = await ctx.db
        .insert(vaults)
        .values({
          id: `vault_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          vaultAddress: normalizedVault,
          tokenAddress: normalizedToken,
          nftContract: normalizedNft,
          tokenId: input.tokenId,
          tokenAmount: input.tokenAmount,
          tokenType: input.tokenType,
          name: input.name,
          symbol: input.symbol,
          totalSupply: input.totalSupply,
          reservePrice: input.reservePrice,
          curatorAddress: normalizedCurator,
          status: "ACTIVE",
          nftName: input.nftName || `${input.name} NFT #${input.tokenId}`,
          nftImage: input.nftImage || "",
          nftDescription: input.nftDescription || "",
          txHash: input.txHash || "",
          chainId: input.chainId,
        })
        .returning();

      return newVault;
    }),

  recordBid: protectedProcedure
    .input(
      z.object({
        vaultAddress: addressSchema,
        bidder: addressSchema,
        amount: z.string(),
        txHash: txHashSchema.optional(),
        auctionEndTime: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertSessionOwnsWallet(ctx, input.bidder);

      const normalizedVault = input.vaultAddress.toLowerCase();
      const normalizedBidder = input.bidder.toLowerCase();

      await ctx.db.insert(buyoutBids).values({
        id: `bid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        vaultAddress: normalizedVault,
        bidder: normalizedBidder,
        amount: input.amount,
        txHash: input.txHash || "",
      });

      const updateData: Record<string, any> = {
        status: "AUCTION",
        currentBid: input.amount,
        currentBidder: normalizedBidder,
      };

      if (input.auctionEndTime) {
        updateData.auctionEndTime = new Date(input.auctionEndTime * 1000);
      }

      await ctx.db
        .update(vaults)
        .set(updateData)
        .where(eq(vaults.vaultAddress, normalizedVault));

      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        vaultAddress: addressSchema,
        status: z.enum(["ACTIVE", "AUCTION", "REDEEMED", "BOUGHT_OUT"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const normalizedVault = input.vaultAddress.toLowerCase();
      const [vault] = await ctx.db
        .select({ curatorAddress: vaults.curatorAddress })
        .from(vaults)
        .where(eq(vaults.vaultAddress, normalizedVault))
        .limit(1);

      if (!vault) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vault not found." });
      }
      await assertSessionOwnsWallet(ctx, vault.curatorAddress);

      await ctx.db
        .update(vaults)
        .set({ status: input.status })
        .where(eq(vaults.vaultAddress, normalizedVault));

      return { success: true };
    }),

  getStats: publicProcedure.query(async ({ ctx }) => {
    const all = await ctx.db.select().from(vaults);
    const totalVaults = all.length;
    const activeVaults = all.filter((v) => v.status === "ACTIVE" || v.status === "AUCTION").length;
    const redeemedVaults = all.filter((v) => v.status === "REDEEMED" || v.status === "BOUGHT_OUT").length;

    let totalReserveUSDC = BigInt(0);
    for (const v of all) {
      try {
        totalReserveUSDC += BigInt(v.reservePrice);
      } catch {}
    }

    return {
      totalVaults,
      activeVaults,
      redeemedVaults,
      totalReserveUSDC: totalReserveUSDC.toString(),
    };
  }),
});
