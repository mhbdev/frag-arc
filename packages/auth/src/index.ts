import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@frag-arc/db";
import * as schema from "@frag-arc/db/schema/auth";
import { betterAuth } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { siwe } from "better-auth/plugins";
import { verifyMessage } from "viem";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  let domain = "localhost:3001";
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    domain = url.host;
  } catch {
    // fallback
  }

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      disableCSRFCheck: false,
    },
    plugins: [
      nextCookies(),
      siwe({
        domain,
        emailDomainName: "frag-arc.io",
        anonymous: true,
        getNonce: async () => {
          return generateRandomString(32, "a-z", "A-Z", "0-9");
        },
        verifyMessage: async ({ message, signature, address }) => {
          try {
            return await verifyMessage({
              address: address as `0x${string}`,
              message,
              signature: signature as `0x${string}`,
            });
          } catch (error) {
            console.error("SIWE signature verification failed:", error);
            return false;
          }
        },
      }),
    ],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
