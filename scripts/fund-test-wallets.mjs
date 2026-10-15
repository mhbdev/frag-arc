/**
 * Fund test wallets from the Circle DCW probe wallet (0xc9cf...) which has 20 USDC on Arc Testnet.
 * Uses Circle signTransaction API to sign native USDC transfers on Arc Testnet.
 */
import { createPublicClient, http, parseEther, formatEther, defineChain } from "viem";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import fs from "node:fs";

const arcTestnet = defineChain({
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name:"USDC", symbol:"USDC", decimals:18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  testnet: true,
});

const DCW_WALLET_ID = "88476eee-9c66-5abc-bf9f-8598d6839104"; // probe wallet from earlier
const DCW_ADDR      = "0xc9cf7a16a2e4270a801a9d282b1f5990e96d3773";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const publicClient = createPublicClient({ chain: arcTestnet, transport: http("https://rpc.testnet.arc.io") });

// Load test wallet addresses
const KEYS_FILE = "/tmp/fragarc-test-keys.json";
if (!fs.existsSync(KEYS_FILE)) { console.error("Keys file missing"); process.exit(1); }
const { pkA, pkB } = JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"));
const { privateKeyToAccount } = await import("viem/accounts");
const addrA = privateKeyToAccount(pkA).address;
const addrB = privateKeyToAccount(pkB).address;

console.log(`Funding wallet A: ${addrA}`);
console.log(`Funding wallet B: ${addrB}`);
console.log(`From DCW:        ${DCW_ADDR}`);

const balDCW = await publicClient.getBalance({ address: DCW_ADDR });
console.log(`DCW balance: ${formatEther(balDCW)} USDC`);

async function sendNativeUsdc(toAddr, amountWei) {
  // Use createTransaction which handles nonce/gas internally
  const txRes = await client.createTransaction({
    walletId: DCW_WALLET_ID,
    blockchain: "ETH-SEPOLIA", // DCW wallet created on ETH-SEPOLIA; same key works on Arc via raw signing
    destinationAddress: toAddr,
    amounts: [formatEther(amountWei)],
    tokenId: "USDC", // native on Arc
    fee: { type: "EIP1559", maxFee: "25", priorityFee: "2" },
  });
  // createTransaction submits to Circle infra on ETH-SEPOLIA — doesn't work cross-chain
  // Fall back to raw signTransaction
  throw new Error("createTransaction is chain-specific; use raw sign approach");
}

// Send 8 USDC to each test wallet (leaving gas for DCW)
const AMOUNT = parseEther("8");
console.log(`\nSending ${formatEther(AMOUNT)} USDC to wallet A...`);
await sendNativeUsdc(addrA, AMOUNT);

console.log(`Sending ${formatEther(AMOUNT)} USDC to wallet B...`);
await sendNativeUsdc(addrB, AMOUNT);

const balA = await publicClient.getBalance({ address: addrA });
const balB = await publicClient.getBalance({ address: addrB });
console.log(`\nWallet A balance: ${formatEther(balA)} USDC`);
console.log(`Wallet B balance: ${formatEther(balB)} USDC`);
console.log("Done — wallets funded, run the integration test now.");
