import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerEntitySecretCiphertext, initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) { console.error("CIRCLE_API_KEY not set"); process.exit(1); }

// Generate 32-byte secret without printing it
const entitySecret = crypto.randomBytes(32).toString("hex");

const recoveryDir = "/home/user/app/.circle";
fs.mkdirSync(recoveryDir, { recursive: true });

console.log("[entity-secret] Registering ciphertext with Circle...");
const response = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryDir,
});

const recoveryPath = path.join(recoveryDir, "recovery_file.dat");
if (response.data?.recoveryFile) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile);
}

// Persist secret to .env (no echo to stdout)
const envPath = "/home/user/app/.env";
fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, "utf-8");

// Verify registration works
console.log("[entity-secret] Verifying registration...");
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const verify = await client.listWalletSets({ pageSize: 1 });
if (!verify.data) throw new Error("Verification call returned no data");

console.log("[entity-secret] SUCCESS — entity secret registered and verified");
console.log("[entity-secret] Recovery file written to:", recoveryPath);
// Length check only, never print value
console.log("[entity-secret] Secret length:", entitySecret.length, "chars (expected 64)");
