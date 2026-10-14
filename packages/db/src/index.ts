import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

const { Pool } = pg;

export function createDb(env: DatabaseConfig) {
  const isSsl =
    env.DATABASE_URL.includes("sslmode=require") ||
    env.DATABASE_URL.includes("ssl=true") ||
    env.DATABASE_URL.includes("sslmode=verify-full") ||
    env.DATABASE_URL.includes("sslmode=verify-ca");

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return drizzle({ client: pool, relations });
}

export type Database = ReturnType<typeof createDb>;
