import { randomBytes } from "node:crypto";

const outputPath = "apps/web/.env.dokploy";
const authSecret = randomBytes(32).toString("base64url");
const postgresPassword = randomBytes(24).toString("base64url");

const env = `# ==============================================================================
# FragArc Dokploy Production Environment Variables
# Copy and paste these into your Dokploy Application or Compose Environment tab.
# ==============================================================================

NODE_ENV=production
PORT=3001
HOSTNAME=0.0.0.0

# Security and Authentication
BETTER_AUTH_SECRET=${authSecret}
BETTER_AUTH_URL=https://fragarc.upstand.dev
CORS_ORIGIN=https://fragarc.upstand.dev

# Database Configuration
# If using Dokploy Compose, the internal hostname is 'postgres'.
# If using Dokploy Managed Postgres, replace with your Dokploy internal database connection string.
POSTGRES_PASSWORD=${postgresPassword}
DATABASE_URL=postgresql://postgres:${postgresPassword}@postgres:5432/frag-arc

# Public Arc Network Contract Configuration
NEXT_PUBLIC_ARC_TESTNET_FACTORY=0x364860b76927D48Fa5a855b5501B057C95d3F376
NEXT_PUBLIC_ARC_TESTNET_MOCK_NFT=0x789b783f982885994f5756C30e840a12Ec71d79B
NEXT_PUBLIC_ARC_MAINNET_FACTORY=0x0000000000000000000000000000000000000000
`;

await Bun.write(outputPath, env);
console.log(`[dokploy-env] Successfully generated Dokploy production environment template at: ${outputPath}`);
