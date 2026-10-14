CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_address" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyout_bids" (
	"id" text PRIMARY KEY,
	"vault_address" text NOT NULL,
	"bidder" text NOT NULL,
	"amount" text NOT NULL,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" text PRIMARY KEY,
	"vault_address" text NOT NULL UNIQUE,
	"token_address" text NOT NULL,
	"nft_contract" text NOT NULL,
	"token_id" text NOT NULL,
	"token_amount" text DEFAULT '1' NOT NULL,
	"token_type" text DEFAULT 'ERC721' NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"total_supply" text NOT NULL,
	"reserve_price" text NOT NULL,
	"curator_address" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"nft_name" text,
	"nft_image" text,
	"nft_description" text,
	"current_bid" text DEFAULT '0' NOT NULL,
	"current_bidder" text,
	"auction_end_time" timestamp,
	"tx_hash" text,
	"chain_id" integer DEFAULT 5042002 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "walletAddress_userId_idx" ON "wallet_address" ("user_id");--> statement-breakpoint
CREATE INDEX "walletAddress_address_idx" ON "wallet_address" ("address");--> statement-breakpoint
CREATE INDEX "buyoutBids_vaultAddress_idx" ON "buyout_bids" ("vault_address");--> statement-breakpoint
CREATE INDEX "buyoutBids_bidder_idx" ON "buyout_bids" ("bidder");--> statement-breakpoint
CREATE INDEX "vaults_vaultAddress_idx" ON "vaults" ("vault_address");--> statement-breakpoint
CREATE INDEX "vaults_tokenAddress_idx" ON "vaults" ("token_address");--> statement-breakpoint
CREATE INDEX "vaults_curatorAddress_idx" ON "vaults" ("curator_address");--> statement-breakpoint
CREATE INDEX "vaults_status_idx" ON "vaults" ("status");--> statement-breakpoint
CREATE INDEX "vaults_nftContract_tokenId_idx" ON "vaults" ("nft_contract","token_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallet_address" ADD CONSTRAINT "wallet_address_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buyout_bids" ADD CONSTRAINT "buyout_bids_vault_address_vaults_vault_address_fkey" FOREIGN KEY ("vault_address") REFERENCES "vaults"("vault_address") ON DELETE CASCADE;