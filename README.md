<div align="center">
  <img src="apps/web/public/logo.png" width="128" height="128" alt="FragArc Logo" style="border-radius: 28px; box-shadow: 0 0 40px rgba(6,182,212,0.4);" />
  <h1>FragArc</h1>
  <p><strong>Bidirectional Decentralized NFT Fragmentation Platform on Circle's Arc Network</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Network-Arc_Network_L1-blue?style=flat-square" alt="Network" />
    <img src="https://img.shields.io/badge/Gas_Token-Native_USDC_(18_decimals)-green?style=flat-square" alt="Gas Token" />
    <img src="https://img.shields.io/badge/EVM-Osaka_/_Cancun-purple?style=flat-square" alt="EVM" />
    <img src="https://img.shields.io/badge/Theme-shadcn_preset_b2WzGlo5Q-violet?style=flat-square" alt="Preset" />
  </p>
</div>

---

## Overview

**FragArc** is a production-ready, fully decentralized bidirectional NFT fragmentation platform engineered specifically for **Circle's Arc Network** (Osaka EVM Layer 1 with native 18-decimal USDC).

Collectibles (ERC-721 and ERC-1155) can be deposited into autonomous `NFTVault` smart contracts to mint liquid ERC-20 `FractionToken`s. NFTs can be reconstituted and redeemed through two decentralized, bidirectional pathways:

1. **Path 1: 100% Direct Token Redemption**: Any collector holding 100% of a vault's fractional supply can call `redeem()` to permanently burn all fraction tokens via `vaultBurn()` and withdraw the custodial NFT immediately.
2. **Path 2: Native USDC Buyout Auction & Pro-Rata Burn**: Any buyer can initiate a competitive buyout auction with native USDC (`msg.value`) $\ge$ `reservePrice`. Features a 3-day countdown with 15-minute anti-sniping extensions, pull-over-push refund withdrawals (`withdrawPendingFunds()`), and trustless pro-rata payout claiming via `burnAndClaim()`.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Frontend["Web Application (Next.js 16 App Router)"]
        UI["Modern Web3 UI (Tailwind v4 + shadcn preset b2WzGlo5Q)"]
        WC["Wallet Connect & SIWE Auth Modal"]
        WAGMI["Wagmi Viem Hooks (Arc Testnet 5042002 / Mainnet 5042)"]
    end

    subgraph Backend["API & Auth Services (@frag-arc/api, @frag-arc/auth, @frag-arc/db)"]
        TRPC["tRPC v11 Options Proxy"]
        BA["Better-Auth + SIWE Plugin (Viem Signature Verification)"]
        DB[(PostgreSQL + Drizzle ORM)]
    end

    subgraph ArcBlockchain["Arc Network (Osaka EVM L1 • Native USDC Gas)"]
        FACTORY["NFTVaultFactory.sol"]
        VAULT["NFTVault.sol (Escrow & Buyout Auction)"]
        TOKEN["FractionToken.sol (ERC-20 Burnable)"]
        NFT["MockArcNFT / Any ERC-721 / ERC-1155"]
    end

    UI --> WAGMI
    UI --> TRPC
    WC --> BA
    BA --> DB
    TRPC --> DB

    WAGMI -->|Deploy Vault| FACTORY
    FACTORY -->|Deploys| VAULT
    FACTORY -->|Deploys| TOKEN
    WAGMI -->|Deposit NFT| VAULT
    WAGMI -->|Path 1: 100% Direct Redeem| VAULT
    WAGMI -->|Path 2: Native USDC Bid| VAULT
    WAGMI -->|Path 2: Burn & Claim USDC| VAULT
    VAULT -->|vaultBurn| TOKEN
    VAULT -->|Transfer NFT| UI
```

---

## Arc Network Protocol Specifics Handled

| Protocol Nuance | Arc Specification | Implementation in FragArc |
| :--- | :--- | :--- |
| **Native Gas & Value** | Native token is USDC with 18 decimals (`10^18` wei) | Bids, payouts, and gas fees utilize `msg.value` directly without wrapped ERC-20 approvals. |
| **Gas Price Floor** | Protocol mempool rejects any tx with `maxFeePerGas < 20 Gwei` | Default gas floor constant `ARC_DEFAULT_GAS_FLOOR = 25 Gwei` configured across Hardhat, Wagmi, and frontend clients. |
| **Zero Address Guard** | Native transfers to `address(0)` revert | Burn mechanism modifies internal balances without triggering native value transfers to `0x0`. |
| **EVM Target** | Cancun / Osaka EVM compatibility | Hardhat compiler configured with `cancun` EVM target. |

---

## Tech Stack

- **Smart Contracts**: Solidity 0.8.28, Hardhat, OpenZeppelin v5, Viem test harness.
- **Frontend**: Next.js 16 (App Router, Turbopack), Tailwind CSS v4, shadcn/ui (preset `b2WzGlo5Q` with Rhea base, zinc base color, and violet theme).
- **Web3 Connectivity**: Wagmi v2, Viem v2, Sign-In with Ethereum (SIWE).
- **API & Data**: tRPC v11, Drizzle ORM, PostgreSQL.
- **Authentication**: Better-Auth with cryptographic SIWE verification plugin.
- **Monorepo**: Turborepo with Bun workspaces.

---

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Start PostgreSQL Database

```bash
bun run db:start
```

### 3. Run Database Migrations

```bash
bun run --cwd packages/db db:migrate
```

### 4. Run Smart Contract Tests

```bash
bun run --cwd packages/contracts test
```

### Mainnet deployment safety

The contract deployment script deploys the `MockArcNFT` demo asset only on Arc
Testnet. On Arc Mainnet it deploys the `NFTVaultFactory` only; production users
must supply NFTs they own. Configure `NEXT_PUBLIC_ARC_MAINNET_FACTORY` only
after the factory deployment has been tested, verified, and its owner is a
controlled wallet or Safe. Arc Mainnet uses native USDC for gas, with 18
decimals at the native-value layer.

### 5. Launch Development Server

```bash
bun run dev:web
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## Project Structure

```
frag-arc/
├── apps/
│   └── web/                # Next.js 16 App Router frontend
│       ├── public/         # FragArc logo, favicons, manifests
│       └── src/
│           ├── app/        # Marketplace, Fractionalize, Vault Detail, Portfolio, Faucet
│           ├── components/ # Branded FragArcLogo, WalletConnect, VaultCard
│           └── lib/        # Arc chain definitions (5042002 / 5042), Wagmi client
├── packages/
│   ├── contracts/          # NFTVaultFactory, NFTVault, FractionToken, MockArcNFT
│   ├── ui/                 # Shared shadcn/ui components (preset b2WzGlo5Q)
│   ├── api/                # tRPC routers (vaults, portfolio, faucet)
│   ├── auth/               # Better-Auth SIWE plugin with Viem verification
│   └── db/                 # Drizzle ORM schema, relations, and migrations
```

---

## Dokploy & Production Deployment

FragArc is pre-configured for automated, zero-downtime deployment on **Dokploy** using either Docker Compose or a standalone Dockerfile.

### 1. Automated Migrations on Startup

The production Docker container (`apps/web/Dockerfile`) embeds an intelligent entrypoint (`entrypoint.sh`) and standalone transactional migration runner (`migrate.mjs`). On every container start or deployment:
1. It waits for PostgreSQL to become ready (up to 15 retries with backoff).
2. It verifies the `"drizzle"."__drizzle_migrations"` table.
3. It automatically executes any pending migrations in an atomic SQL transaction before starting the Next.js server.
4. Tables (`vaults`, `account`, `user`, etc.) and indexes are guaranteed to exist before incoming traffic is served.

### 2. Dokploy Environment Variables

To generate a ready-to-paste Dokploy environment template with freshly generated secrets:

```bash
bun run generate:dokploy-env
```

Key environment variables to configure in your Dokploy project:

| Variable | Description | Example / Default |
|---|---|---|
| `NODE_ENV` | Runtime environment | `production` |
| `BETTER_AUTH_SECRET` | 32+ char secret for session signatures | Random base64 string |
| `BETTER_AUTH_URL` | Public production URL of the web app | `https://fragarc.upstand.dev` |
| `CORS_ORIGIN` | Allowed cross-origin domain | `https://fragarc.upstand.dev` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@postgres:5432/frag-arc` |
| `NEXT_PUBLIC_ARC_TESTNET_FACTORY` | Deployed Arc Testnet Vault Factory | `0x364860b76927D48Fa5a855b5501B057C95d3F376` |
| `NEXT_PUBLIC_ARC_TESTNET_MOCK_NFT` | Deployed Arc Testnet Demo Collection | `0x789b783f982885994f5756C30e840a12Ec71d79B` |

---

## License

MIT
