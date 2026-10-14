import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("[migrate] No DATABASE_URL provided, skipping migrations.");
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
let migrationsRoot = join(scriptDir, "migrations");

if (!existsSync(migrationsRoot)) {
  const candidates = [
    join(scriptDir, "../packages/db/src/migrations"),
    join(process.cwd(), "packages/db/src/migrations"),
    join(process.cwd(), "apps/web/migrations"),
    join(process.cwd(), "migrations"),
    join(scriptDir, "../../packages/db/src/migrations"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      migrationsRoot = candidate;
      break;
    }
  }
}

if (!existsSync(migrationsRoot)) {
  console.error(`[migrate] ERROR: Migrations directory not found. Searched in: ${migrationsRoot}`);
  process.exit(1);
}

console.log(`[migrate] Using migrations root: ${migrationsRoot}`);

const isSsl =
  databaseUrl.includes("sslmode=require") ||
  databaseUrl.includes("ssl=true") ||
  databaseUrl.includes("sslmode=verify-full") ||
  databaseUrl.includes("sslmode=verify-ca");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isSsl ? { rejectUnauthorized: false } : undefined,
});

async function waitForDatabase(maxAttempts = 15, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log(`[migrate] Database connection established (attempt ${attempt}/${maxAttempts}).`);
      return;
    } catch (err) {
      console.log(`[migrate] Waiting for database to be ready (attempt ${attempt}/${maxAttempts}): ${err.message}`);
      if (attempt === maxAttempts) {
        throw new Error(`Database connection failed after ${maxAttempts} attempts: ${err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

try {
  await waitForDatabase();

  await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" serial PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `);

  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const initialRequiredTables = [
    "account",
    "buyout_bids",
    "session",
    "user",
    "vaults",
    "verification",
    "wallet_address",
  ];

  for (const [index, entry] of entries.entries()) {
    const migrationFilePath = join(migrationsRoot, entry.name, "migration.sql");
    if (!existsSync(migrationFilePath)) {
      continue;
    }

    const migrationUrl = pathToFileURL(migrationFilePath);
    const migration = await readFile(migrationUrl, "utf8");
    const hash = createHash("sha256").update(migration).digest("hex");

    const applied = await pool.query(
      'SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "hash" = $1 LIMIT 1',
      [hash],
    );

    if (applied.rowCount && applied.rowCount > 0) {
      console.log(`[migrate] Migration already applied: ${entry.name}`);
      continue;
    }

    // Check if tables already exist in public schema (e.g. from earlier manual run)
    if (index === 0) {
      const existingTablesResult = await pool.query(
        `SELECT count(*)::int AS count
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [initialRequiredTables],
      );

      if (existingTablesResult.rows[0]?.count === initialRequiredTables.length) {
        await pool.query(
          'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
          [hash, Date.now()],
        );
        console.log(`[migrate] Recorded existing schema for: ${entry.name}`);
        continue;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const statements = migration.split(/^--> statement-breakpoint\s*$/m);
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          await client.query(trimmed);
        }
      }

      await client.query(
        'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
        [hash, Date.now()],
      );
      await client.query("COMMIT");
      console.log(`[migrate] Successfully applied migration: ${entry.name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`[migrate] Failed applying migration ${entry.name}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log("[migrate] All migrations applied successfully.");
} finally {
  await pool.end();
}
