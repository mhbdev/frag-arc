import { defineRelationsPart } from "drizzle-orm";
import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const vaults = pgTable(
  "vaults",
  {
    id: text("id").primaryKey(),
    vaultAddress: text("vault_address").notNull().unique(),
    tokenAddress: text("token_address").notNull(),
    nftContract: text("nft_contract").notNull(),
    tokenId: text("token_id").notNull(),
    tokenAmount: text("token_amount").default("1").notNull(),
    tokenType: text("token_type").default("ERC721").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    totalSupply: text("total_supply").notNull(),
    reservePrice: text("reserve_price").notNull(),
    curatorAddress: text("curator_address").notNull(),
    status: text("status").default("ACTIVE").notNull(),
    nftName: text("nft_name"),
    nftImage: text("nft_image"),
    nftDescription: text("nft_description"),
    currentBid: text("current_bid").default("0").notNull(),
    currentBidder: text("current_bidder"),
    auctionEndTime: timestamp("auction_end_time"),
    txHash: text("tx_hash"),
    chainId: integer("chain_id").default(5042002).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("vaults_vaultAddress_idx").on(table.vaultAddress),
    index("vaults_tokenAddress_idx").on(table.tokenAddress),
    index("vaults_curatorAddress_idx").on(table.curatorAddress),
    index("vaults_status_idx").on(table.status),
    index("vaults_nftContract_tokenId_idx").on(table.nftContract, table.tokenId),
  ],
);

export const buyoutBids = pgTable(
  "buyout_bids",
  {
    id: text("id").primaryKey(),
    vaultAddress: text("vault_address")
      .notNull()
      .references(() => vaults.vaultAddress, { onDelete: "cascade" }),
    bidder: text("bidder").notNull(),
    amount: text("amount").notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("buyoutBids_vaultAddress_idx").on(table.vaultAddress),
    index("buyoutBids_bidder_idx").on(table.bidder),
  ],
);

export const vaultsRelations = defineRelationsPart({ vaults, buyoutBids }, (r) => ({
  vaults: {
    bids: r.many.buyoutBids({
      from: r.vaults.vaultAddress,
      to: r.buyoutBids.vaultAddress,
    }),
  },
  buyoutBids: {
    vault: r.one.vaults({
      from: r.buyoutBids.vaultAddress,
      to: r.vaults.vaultAddress,
    }),
  },
}));
