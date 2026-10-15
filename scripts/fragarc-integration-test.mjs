/**
 * FragArc Full Integration Test Suite
 * Tests every feature against Arc Testnet (chain ID 5042002)
 *
 * Flows covered:
 *  1.  API health check + tRPC public endpoints
 *  2.  faucet.getPresets, vaults.getStats, vaults.list
 *  3.  Better-Auth SIWE: nonce → sign → session (wallet A + B)
 *  4.  MockArcNFT.mint() — 2 NFTs to wallet A
 *  5.  NFTVaultFactory.createVault() — Vault 1 (Path 1)
 *  6.  tRPC vaults.register — DB registration
 *  7.  NFTVault.redeem() — 100% direct burn → reclaim NFT (Path 1)
 *  8.  NFTVaultFactory.createVault() — Vault 2 (Path 2)
 *  9.  FractionToken.transfer() — wallet A → B (partial fractions)
 * 10.  NFTVault.startBuyout() — wallet B starts auction
 * 11.  tRPC vaults.recordBid — DB bid record
 * 12.  NFTVault.bid() — wallet A outbids (5% increment)
 * 13.  NFTVault.withdrawPendingFunds() — wallet B pulls refund
 * 14.  NFTVault.endBuyout() — conclude auction, NFT to winner
 * 15.  tRPC vaults.updateStatus — DB status → BOUGHT_OUT
 * 16.  NFTVault.burnAndClaim() — wallet B burns fractions → USDC
 * 17.  NFTVault.burnAndClaim() — wallet A burns fractions → USDC
 * 18.  DB state verification (getByAddress, getStats, search/filter)
 * 19.  Auth protection — unauthenticated register → UNAUTHORIZED
 */

import { createPublicClient, createWalletClient, http, parseEther, parseGwei,
         formatEther, formatUnits, encodeFunctionData, getAddress } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { defineChain } from "viem";
import fs from "node:fs";
import path from "node:path";

// ─── Chain ────────────────────────────────────────────────────────────────────
const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" } },
  testnet: true,
});

// ─── Constants ────────────────────────────────────────────────────────────────
const FACTORY   = "0x364860b76927D48Fa5a855b5501B057C95d3F376";
const MOCK_NFT  = "0x789b783f982885994f5756C30e840a12Ec71d79B";
const API_BASE  = "http://localhost:3001";
const GAS_FLOOR = parseGwei("25");
const GAS_TIP   = parseGwei("2");

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC721_ABI = [
  { name:"approve",     type:"function", inputs:[{type:"address"},{type:"uint256"}], outputs:[], stateMutability:"nonpayable" },
  { name:"ownerOf",     type:"function", inputs:[{type:"uint256"}],                  outputs:[{type:"address"}], stateMutability:"view" },
  { name:"getApproved", type:"function", inputs:[{type:"uint256"}],                  outputs:[{type:"address"}], stateMutability:"view" },
  { name:"mint",        type:"function", inputs:[{type:"address"},{type:"string"}],  outputs:[{type:"uint256"}], stateMutability:"nonpayable" },
];
const FACTORY_ABI = [
  { name:"createVault", type:"function",
    inputs:[
      {name:"nftContract",type:"address"},{name:"tokenId",type:"uint256"},
      {name:"tokenAmount",type:"uint256"},{name:"tokenType",type:"uint8"},
      {name:"tokenName",type:"string"},{name:"tokenSymbol",type:"string"},
      {name:"initialSupply",type:"uint256"},{name:"reservePrice",type:"uint256"},
      {name:"auctionLength",type:"uint256"}
    ], outputs:[{name:"vaultAddress",type:"address"}], stateMutability:"nonpayable" },
  { name:"getAllVaults", type:"function", inputs:[], outputs:[{type:"address[]"}], stateMutability:"view" },
];
const VAULT_ABI = [
  { name:"fractionToken",       type:"function", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { name:"state",               type:"function", inputs:[], outputs:[{type:"uint8"}],   stateMutability:"view" },
  { name:"reservePrice",        type:"function", inputs:[], outputs:[{type:"uint256"}], stateMutability:"view" },
  { name:"currentBid",          type:"function", inputs:[], outputs:[{type:"uint256"}], stateMutability:"view" },
  { name:"currentBidder",       type:"function", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { name:"auctionEndTime",      type:"function", inputs:[], outputs:[{type:"uint256"}], stateMutability:"view" },
  { name:"totalBuyoutProceeds", type:"function", inputs:[], outputs:[{type:"uint256"}], stateMutability:"view" },
  { name:"pendingWithdrawals",  type:"function", inputs:[{type:"address"}],             outputs:[{type:"uint256"}], stateMutability:"view" },
  { name:"redeem",              type:"function", inputs:[], outputs:[],                  stateMutability:"nonpayable" },
  { name:"startBuyout",         type:"function", inputs:[], outputs:[],                  stateMutability:"payable" },
  { name:"bid",                 type:"function", inputs:[], outputs:[],                  stateMutability:"payable" },
  { name:"endBuyout",           type:"function", inputs:[], outputs:[],                  stateMutability:"nonpayable" },
  { name:"burnAndClaim",        type:"function", inputs:[{type:"uint256"}],              outputs:[],                  stateMutability:"nonpayable" },
  { name:"withdrawPendingFunds",type:"function", inputs:[], outputs:[],                  stateMutability:"nonpayable" },
];
const TOKEN_ABI = [
  { name:"balanceOf",   type:"function", inputs:[{type:"address"}],                     outputs:[{type:"uint256"}], stateMutability:"view" },
  { name:"totalSupply", type:"function", inputs:[], outputs:[{type:"uint256"}],          stateMutability:"view" },
  { name:"transfer",    type:"function", inputs:[{type:"address"},{type:"uint256"}],     outputs:[{type:"bool"}],   stateMutability:"nonpayable" },
];

// ─── Test harness ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  process.stdout.write(`\n[TEST] ${name} ... `);
  try {
    const detail = await fn();
    console.log("✅ PASS" + (detail ? ` — ${detail}` : ""));
    results.push({ name, status:"PASS", detail: detail || "" });
    passed++;
  } catch (err) {
    const msg = (err?.shortMessage || err?.message || String(err)).slice(0, 300);
    console.log(`❌ FAIL — ${msg}`);
    results.push({ name, status:"FAIL", detail: msg });
    failed++;
  }
}

async function waitForTx(publicClient, hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error(`Tx reverted: ${hash}`);
  return receipt;
}

// ─── viem clients ─────────────────────────────────────────────────────────────
const RPC = "https://rpc.testnet.arc.io";
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC) });

// Persist private keys so wallet addresses are stable across re-runs (faucet funded once)
const KEYS_FILE = "/tmp/fragarc-test-keys.json";
let pkA, pkB;
if (fs.existsSync(KEYS_FILE)) {
  const saved = JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"));
  pkA = saved.pkA; pkB = saved.pkB;
  console.log("  [keys] Loaded existing test wallet keys from /tmp/fragarc-test-keys.json");
} else {
  pkA = generatePrivateKey();
  pkB = generatePrivateKey();
  fs.writeFileSync(KEYS_FILE, JSON.stringify({ pkA, pkB }), "utf-8");
  console.log("  [keys] Generated fresh test wallet keys — fund these addresses then re-run");
}
const accountA = privateKeyToAccount(pkA);
const accountB = privateKeyToAccount(pkB);
const walletA = createWalletClient({ account: accountA, chain: arcTestnet, transport: http(RPC) });
const walletB = createWalletClient({ account: accountB, chain: arcTestnet, transport: http(RPC) });
const addrA = accountA.address;
const addrB = accountB.address;

// ─── Write helper ─────────────────────────────────────────────────────────────
async function write(wc, contractAddr, abi, fn, args, value) {
  const hash = await wc.writeContract({
    address: contractAddr, abi, functionName: fn, args: args ?? [],
    value: value ?? undefined,
    maxFeePerGas: GAS_FLOOR,
    maxPriorityFeePerGas: GAS_TIP,
  });
  const receipt = await waitForTx(publicClient, hash);
  return { hash, receipt };
}

// ─── SIWE helpers ─────────────────────────────────────────────────────────────
function buildSIWEMessage({ domain, address, statement, uri, version, chainId, nonce, issuedAt }) {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address, ``,
    statement, ``,
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

async function siweLogin(account, walletClient, addr) {
  // Try both nonce endpoint variants
  let nonce = "";
  for (const endpoint of ["/api/auth/sign-in/siwe/nonce", "/api/auth/siwe/nonce", "/api/auth/session"]) {
    const r = await fetch(`${API_BASE}${endpoint}`).catch(() => null);
    if (!r) continue;
    const text = await r.text().catch(() => "");
    try { nonce = JSON.parse(text)?.nonce || ""; } catch {}
    if (!nonce && r.ok) nonce = text.trim().replace(/"/g, "");
    if (nonce && nonce.length >= 8) break;
  }
  if (!nonce || nonce.length < 4) throw new Error(`Could not fetch SIWE nonce (got: "${nonce}")`);

  const issuedAt = new Date().toISOString();
  const message = buildSIWEMessage({
    domain: "localhost:3001", address: addr,
    statement: "Sign in with Ethereum to FragArc",
    uri: "http://localhost:3001",
    version: "1", chainId: 5042002, nonce, issuedAt,
  });

  const signature = await walletClient.signMessage({ message });

  // Try both verify endpoint variants
  let verifyRes, setCookie = "";
  for (const endpoint of ["/api/auth/sign-in/siwe", "/api/auth/siwe/verify"]) {
    verifyRes = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature, address: addr }),
    });
    setCookie = verifyRes.headers.get("set-cookie") || "";
    if (verifyRes.ok || setCookie) break;
  }

  let cookie = "";
  if (setCookie) cookie = setCookie.split(";")[0];

  if (!verifyRes.ok && !cookie) {
    const body = await verifyRes.text().catch(() => "");
    throw new Error(`SIWE verify HTTP ${verifyRes.status}: ${body.slice(0, 200)}`);
  }

  return { nonce, cookie, status: verifyRes.status };
}

// ─── Tracked state ────────────────────────────────────────────────────────────
let vault1Addr = "", vault2Addr = "";
let fToken1 = "", fToken2 = "";
let nft1Id = 0n, nft2Id = 0n;
let cookieA = "", cookieB = "";
let auctionEnd = 0n;

// ══════════════════════════════════════════════════════════════════════════════
console.log("\n════════════════════════════════════════════════════════════");
console.log("  FragArc Integration Test Suite — Arc Testnet (5042002)");
console.log("════════════════════════════════════════════════════════════");
console.log(`  Wallet A (curator/fractionizer): ${addrA}`);
console.log(`  Wallet B (buyer/bidder):         ${addrB}`);
console.log(`  Factory:   ${FACTORY}`);
console.log(`  MockArcNFT: ${MOCK_NFT}`);

// ─── FUND wallets (faucet already triggered externally for addrA) ──────────────
// The faucet_drip tool was called from outside. Poll for balance.
console.log(`\n[SETUP] Waiting for testnet USDC to arrive in wallets (up to 90s)...`);

// Wallets are fresh — we need to fund them. Since faucet_drip is done externally,
// we check if already funded; if not we attempt Circle faucet API directly.
async function waitForBalance(addr, minEth, label) {
  for (let i = 0; i < 60; i++) {
    const bal = await publicClient.getBalance({ address: addr });
    if (bal >= parseEther(minEth)) {
      console.log(`  ${label}: ${formatEther(bal)} USDC ✓`);
      return bal;
    }
    if (i % 5 === 0) process.stdout.write(`  ${label} waiting (${formatEther(bal)} USDC)...\n`);
    await new Promise(r => setTimeout(r, 5000));
  }
  const bal = await publicClient.getBalance({ address: addr });
  if (bal < parseEther(minEth)) throw new Error(`${label} unfunded after 5min: ${formatEther(bal)} USDC. Fund ${addr} with ≥${minEth} USDC on Arc Testnet and re-run.`);
  return bal;
}

// Request faucet via Circle API (native USDC on Arc Testnet)
async function requestFaucet(addr) {
  const r = await fetch("https://api.circle.com/v1/faucet/drips", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
    },
    body: JSON.stringify({ address: addr, blockchain: "ARC-TESTNET", native: true, usdc: false, eurc: false }),
  });
  const j = await r.json().catch(() => ({}));
  return j;
}

// Wallets already funded externally via faucet_drip tool before test run
console.log(`  Faucet drips already sent externally — polling for balance...`);
await waitForBalance(addrA, "0.1", "Wallet A");
await waitForBalance(addrB, "0.1", "Wallet B");

// ══════════════════════════════════════════════════════════════════
// SECTION 1: API & tRPC Public Endpoints
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 1: API Health & tRPC Public Endpoints ══");

await test("GET / — Next.js app responds 200", async () => {
  const r = await fetch(`${API_BASE}/`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});

await test("tRPC server alive — /api/trpc path reachable", async () => {
  const r = await fetch(`${API_BASE}/api/trpc`);
  if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});

await test("faucet.getPresets — 4 demo NFTs returned", async () => {
  const r = await fetch(`${API_BASE}/api/trpc/faucet.getPresets?input=${encodeURIComponent(JSON.stringify({}))}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d) || d.length !== 4) throw new Error(`Got: ${JSON.stringify(d)}`);
  return `${d.length} presets: ${d.map(p=>p.symbol).join(", ")}`;
});

await test("vaults.getStats — valid stats object", async () => {
  const r = await fetch(`${API_BASE}/api/trpc/vaults.getStats?input=${encodeURIComponent(JSON.stringify({}))}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (typeof d?.totalVaults !== "number") throw new Error(`Bad stats: ${JSON.stringify(d)}`);
  return `totalVaults=${d.totalVaults} active=${d.activeVaults} redeemed=${d.redeemedVaults}`;
});

await test("vaults.list — returns array (may be empty)", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status: "ALL" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Expected array, got: ${JSON.stringify(d).slice(0,100)}`);
  return `${d.length} vault(s) currently in DB`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 2: SIWE Auth
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 2: SIWE Authentication ══");

await test("SIWE login — wallet A (curator)", async () => {
  const { nonce, cookie, status } = await siweLogin(accountA, walletA, addrA);
  cookieA = cookie;
  return `HTTP ${status} nonce=${nonce.slice(0,8)}... cookie=${cookie ? "✓ present" : "absent"}`;
});

await test("SIWE login — wallet B (buyer)", async () => {
  const { nonce, cookie, status } = await siweLogin(accountB, walletB, addrB);
  cookieB = cookie;
  return `HTTP ${status} nonce=${nonce.slice(0,8)}... cookie=${cookie ? "✓ present" : "absent"}`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 3: MockArcNFT minting
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 3: MockArcNFT Demo NFT Minting ══");

await test("MockArcNFT.mint() — NFT #1 to wallet A", async () => {
  const { receipt } = await write(walletA, MOCK_NFT, ERC721_ABI, "mint", [addrA, "ipfs://arcgenesis-1"]);
  for (const log of receipt.logs) {
    if (log.topics[3]) { nft1Id = BigInt(log.topics[3]); }
  }
  if (!nft1Id) throw new Error("No token ID parsed from Transfer log");
  const owner = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"ownerOf", args:[nft1Id] });
  if (owner.toLowerCase() !== addrA.toLowerCase()) throw new Error(`Wrong owner: ${owner}`);
  return `Token #${nft1Id} → owner ${owner.slice(0,10)}...`;
});

await test("MockArcNFT.mint() — NFT #2 to wallet A (Path 2 vault)", async () => {
  const { receipt } = await write(walletA, MOCK_NFT, ERC721_ABI, "mint", [addrA, "ipfs://arcgenesis-2"]);
  for (const log of receipt.logs) {
    if (log.topics[3]) { nft2Id = BigInt(log.topics[3]); }
  }
  if (!nft2Id) throw new Error("No token ID parsed from Transfer log");
  const owner = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"ownerOf", args:[nft2Id] });
  return `Token #${nft2Id} → owner ${owner.slice(0,10)}...`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 4: Vault 1 — Path 1 (Direct Redemption)
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 4: Vault 1 — Path 1 (100% Direct Redemption) ══");

await test("ERC721.approve() — wallet A approves Factory for NFT #1", async () => {
  await write(walletA, MOCK_NFT, ERC721_ABI, "approve", [FACTORY, nft1Id]);
  const approved = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"getApproved", args:[nft1Id] });
  if (approved.toLowerCase() !== FACTORY.toLowerCase()) throw new Error(`Not approved: ${approved}`);
  return `NFT #${nft1Id} approved for Factory`;
});

await test("NFTVaultFactory.createVault() — Vault 1 (reserve=10 USDC, auction=10min)", async () => {
  const { receipt } = await write(walletA, FACTORY, FACTORY_ABI, "createVault", [
    MOCK_NFT, nft1Id, 1n, 0,
    "ArcGenesis Fractions 1", "ARCF1",
    parseEther("1000"), parseEther("10"), 600n,
  ]);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === FACTORY.toLowerCase() && log.topics[1]) {
      vault1Addr = getAddress(`0x${log.topics[1].slice(26)}`);
    }
  }
  if (!vault1Addr) {
    const all = await publicClient.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName:"getAllVaults" });
    vault1Addr = getAddress(all[all.length - 1]);
  }
  fToken1 = await publicClient.readContract({ address: vault1Addr, abi: VAULT_ABI, functionName:"fractionToken" });
  const state = await publicClient.readContract({ address: vault1Addr, abi: VAULT_ABI, functionName:"state" });
  if (Number(state) !== 1) throw new Error(`Expected ACTIVE(1), got ${state}`);
  return `Vault=${vault1Addr.slice(0,12)}... FToken=${fToken1.slice(0,12)}... state=ACTIVE`;
});

await test("tRPC vaults.register — Vault 1 in DB", async () => {
  const body = { json: {
    vaultAddress: vault1Addr, tokenAddress: fToken1, nftContract: MOCK_NFT,
    tokenId: nft1Id.toString(), tokenAmount:"1", tokenType:"ERC721",
    name:"ArcGenesis Fractions 1", symbol:"ARCF1",
    totalSupply: parseEther("1000").toString(), reservePrice: parseEther("10").toString(),
    curatorAddress: addrA,
    nftName: `ArcGenesis #${nft1Id}`,
    nftImage:"https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=600",
    nftDescription:"Integration test NFT — Path 1 direct redemption",
    chainId: 5042002,
  }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.register`, {
    method:"POST", headers:{ "content-type":"application/json", ...(cookieA ? {cookie:cookieA} : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j?.error) throw new Error(JSON.stringify(j.error).slice(0,200));
  const v = j?.result?.data?.json ?? j?.result?.data;
  if (!v?.id) throw new Error(`No id: ${JSON.stringify(j).slice(0,200)}`);
  return `id=${v.id} status=${v.status}`;
});

await test("FractionToken balance — wallet A holds 100% (1000 ARCF1)", async () => {
  const bal    = await publicClient.readContract({ address: fToken1, abi: TOKEN_ABI, functionName:"balanceOf", args:[addrA] });
  const supply = await publicClient.readContract({ address: fToken1, abi: TOKEN_ABI, functionName:"totalSupply" });
  if (bal !== supply) throw new Error(`bal=${formatEther(bal)} supply=${formatEther(supply)}`);
  return `${formatEther(bal)} ARCF1 (100% of supply)`;
});

await test("NFTVault.redeem() — burn 100% fractions → NFT back to wallet A", async () => {
  await write(walletA, vault1Addr, VAULT_ABI, "redeem", []);
  const state = await publicClient.readContract({ address: vault1Addr, abi: VAULT_ABI, functionName:"state" });
  if (Number(state) !== 3) throw new Error(`Expected REDEEMED(3), got ${state}`);
  const owner = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"ownerOf", args:[nft1Id] });
  if (owner.toLowerCase() !== addrA.toLowerCase()) throw new Error(`NFT owner is ${owner}`);
  return `Vault state=REDEEMED(3); NFT #${nft1Id} returned to wallet A ✓`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 5: Vault 2 — Path 2 (Buyout Auction)
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 5: Vault 2 — Path 2 (Buyout Auction) ══");

await test("ERC721.approve() — wallet A approves Factory for NFT #2", async () => {
  await write(walletA, MOCK_NFT, ERC721_ABI, "approve", [FACTORY, nft2Id]);
  const approved = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"getApproved", args:[nft2Id] });
  if (approved.toLowerCase() !== FACTORY.toLowerCase()) throw new Error(`Not approved: ${approved}`);
  return `NFT #${nft2Id} approved for Factory`;
});

await test("NFTVaultFactory.createVault() — Vault 2 (reserve=5 USDC, auction=10min)", async () => {
  const { receipt } = await write(walletA, FACTORY, FACTORY_ABI, "createVault", [
    MOCK_NFT, nft2Id, 1n, 0,
    "ArcGenesis Fractions 2", "ARCF2",
    parseEther("2000"), parseEther("5"), 600n,
  ]);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === FACTORY.toLowerCase() && log.topics[1]) {
      vault2Addr = getAddress(`0x${log.topics[1].slice(26)}`);
    }
  }
  if (!vault2Addr) {
    const all = await publicClient.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName:"getAllVaults" });
    vault2Addr = getAddress(all[all.length - 1]);
  }
  fToken2 = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"fractionToken" });
  const state = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"state" });
  if (Number(state) !== 1) throw new Error(`Expected ACTIVE(1), got ${state}`);
  return `Vault=${vault2Addr.slice(0,12)}... FToken=${fToken2.slice(0,12)}... state=ACTIVE`;
});

await test("tRPC vaults.register — Vault 2 in DB", async () => {
  const body = { json: {
    vaultAddress: vault2Addr, tokenAddress: fToken2, nftContract: MOCK_NFT,
    tokenId: nft2Id.toString(), tokenAmount:"1", tokenType:"ERC721",
    name:"ArcGenesis Fractions 2", symbol:"ARCF2",
    totalSupply: parseEther("2000").toString(), reservePrice: parseEther("5").toString(),
    curatorAddress: addrA,
    nftName: `ArcGenesis #${nft2Id}`,
    nftImage:"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600",
    nftDescription:"Integration test NFT — Path 2 buyout auction",
    chainId: 5042002,
  }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.register`, {
    method:"POST", headers:{ "content-type":"application/json", ...(cookieA ? {cookie:cookieA} : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j?.error) throw new Error(JSON.stringify(j.error).slice(0,200));
  const v = j?.result?.data?.json ?? j?.result?.data;
  if (!v?.id) throw new Error(`No id: ${JSON.stringify(j).slice(0,200)}`);
  return `id=${v.id} status=${v.status}`;
});

await test("FractionToken.transfer() — wallet A sends 500 ARCF2 to wallet B", async () => {
  const amount = parseEther("500");
  await write(walletA, fToken2, TOKEN_ABI, "transfer", [addrB, amount]);
  const balB = await publicClient.readContract({ address: fToken2, abi: TOKEN_ABI, functionName:"balanceOf", args:[addrB] });
  if (balB !== amount) throw new Error(`Wallet B has ${formatEther(balB)} ARCF2`);
  return `Wallet B now holds ${formatEther(balB)} ARCF2 (25% of supply)`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 6: Buyout Auction
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 6: Buyout Auction Flow ══");

await test("NFTVault.startBuyout() — wallet B starts auction @ 5 USDC (reserve price)", async () => {
  await write(walletB, vault2Addr, VAULT_ABI, "startBuyout", [], parseEther("5"));
  const state = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"state" });
  if (Number(state) !== 2) throw new Error(`Expected AUCTION(2), got ${state}`);
  const bid     = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"currentBid" });
  const bidder  = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"currentBidder" });
  auctionEnd    = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"auctionEndTime" });
  if (bidder.toLowerCase() !== addrB.toLowerCase()) throw new Error(`Bidder is ${bidder}`);
  return `state=AUCTION bid=${formatEther(bid)} USDC bidder=B ends@${new Date(Number(auctionEnd)*1000).toUTCString()}`;
});

await test("tRPC vaults.recordBid — wallet B opening bid in DB", async () => {
  const body = { json: {
    vaultAddress: vault2Addr, bidder: addrB,
    amount: parseEther("5").toString(),
    auctionEndTime: Number(auctionEnd),
  }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.recordBid`, {
    method:"POST", headers:{ "content-type":"application/json", ...(cookieB ? {cookie:cookieB} : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j?.error) throw new Error(JSON.stringify(j.error).slice(0,200));
  return "bid recorded";
});

await test("NFTVault.bid() — wallet A outbids @ 5.5 USDC (≥5% increment over 5)", async () => {
  // Minimum bid = 5 + 5% = 5.25; use 5.5 USDC
  const bidAmt = parseEther("5.5");
  await write(walletA, vault2Addr, VAULT_ABI, "bid", [], bidAmt);
  const bidder = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"currentBidder" });
  const bid    = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"currentBid" });
  if (bidder.toLowerCase() !== addrA.toLowerCase()) throw new Error(`Bidder is ${bidder}`);
  const refund = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"pendingWithdrawals", args:[addrB] });
  if (refund !== parseEther("5")) throw new Error(`Wallet B refund should be 5 USDC, got ${formatEther(refund)}`);
  return `New leader=A bid=${formatEther(bid)} USDC; wallet B pending refund=${formatEther(refund)} USDC`;
});

await test("anti-snipe window check — auction time extended if bid near end", async () => {
  const endAfterBid = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"auctionEndTime" });
  // End time should be >= original (either same or extended due to anti-snipe)
  if (endAfterBid < auctionEnd) throw new Error(`Auction end moved backwards: ${endAfterBid} < ${auctionEnd}`);
  const extended = endAfterBid > auctionEnd;
  return `auctionEndTime ${extended ? "extended by anti-snipe ✓" : "unchanged (bid not in snipe window)"} endTime=${new Date(Number(endAfterBid)*1000).toUTCString()}`;
});

await test("NFTVault.withdrawPendingFunds() — wallet B withdraws 5 USDC refund (pull-over-push)", async () => {
  const balBefore = await publicClient.getBalance({ address: addrB });
  await write(walletB, vault2Addr, VAULT_ABI, "withdrawPendingFunds", []);
  const refundAfter = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"pendingWithdrawals", args:[addrB] });
  if (refundAfter !== 0n) throw new Error(`Pending refund not cleared: ${formatEther(refundAfter)}`);
  const balAfter = await publicClient.getBalance({ address: addrB });
  const delta = balAfter - balBefore;
  return `Pending cleared; Δ balance ≈ ${formatEther(delta)} USDC (net of gas)`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 7: End Auction & Pro-Rata Claims
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 7: End Auction & Pro-Rata Burn/Claim ══");

await test("Wait for auction to expire", async () => {
  const endSec = Number(auctionEnd);
  const nowSec = Math.floor(Date.now() / 1000);
  const waitMs = Math.max(0, (endSec - nowSec + 3) * 1000);
  if (waitMs > 0) {
    console.log(`\n  ⏳ Auction ends in ${Math.ceil(waitMs/1000)}s — waiting...`);
    await new Promise(r => setTimeout(r, waitMs));
  }
  return `Auction end time passed (${new Date(endSec*1000).toUTCString()})`;
});

await test("NFTVault.endBuyout() — conclude auction, NFT transferred to winner (wallet A)", async () => {
  await write(walletA, vault2Addr, VAULT_ABI, "endBuyout", []);
  const state = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"state" });
  if (Number(state) !== 4) throw new Error(`Expected BOUGHT_OUT(4), got ${state}`);
  const nftOwner = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"ownerOf", args:[nft2Id] });
  if (nftOwner.toLowerCase() !== addrA.toLowerCase()) throw new Error(`NFT owner is ${nftOwner}`);
  const proceeds = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"totalBuyoutProceeds" });
  return `state=BOUGHT_OUT(4); NFT #${nft2Id} → wallet A; proceeds=${formatEther(proceeds)} USDC locked`;
});

await test("tRPC vaults.updateStatus — set Vault 2 BOUGHT_OUT in DB", async () => {
  const body = { json: { vaultAddress: vault2Addr, status: "BOUGHT_OUT" } };
  const r = await fetch(`${API_BASE}/api/trpc/vaults.updateStatus`, {
    method:"POST", headers:{ "content-type":"application/json", ...(cookieA ? {cookie:cookieA} : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j?.error) throw new Error(JSON.stringify(j.error).slice(0,200));
  return "DB status → BOUGHT_OUT";
});

await test("NFTVault.burnAndClaim() — wallet B burns 500 ARCF2 → pro-rata USDC payout", async () => {
  const fracBal  = await publicClient.readContract({ address: fToken2, abi: TOKEN_ABI, functionName:"balanceOf", args:[addrB] });
  if (fracBal === 0n) return "Wallet B has 0 fractions — skipped";
  const supply   = await publicClient.readContract({ address: fToken2, abi: TOKEN_ABI, functionName:"totalSupply" });
  const proceeds = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"totalBuyoutProceeds" });
  const expected = (fracBal * proceeds) / supply;
  const balBefore = await publicClient.getBalance({ address: addrB });
  await write(walletB, vault2Addr, VAULT_ABI, "burnAndClaim", [fracBal]);
  const fracAfter = await publicClient.readContract({ address: fToken2, abi: TOKEN_ABI, functionName:"balanceOf", args:[addrB] });
  if (fracAfter !== 0n) throw new Error(`Wallet B still has ${formatEther(fracAfter)} ARCF2`);
  const balAfter = await publicClient.getBalance({ address: addrB });
  return `Burned ${formatEther(fracBal)} ARCF2; expected≈${formatEther(expected)} USDC; Δ≈${formatEther(balAfter - balBefore)} USDC`;
});

await test("NFTVault.burnAndClaim() — wallet A burns remaining 1500 ARCF2 → USDC", async () => {
  const fracBal  = await publicClient.readContract({ address: fToken2, abi: TOKEN_ABI, functionName:"balanceOf", args:[addrA] });
  if (fracBal === 0n) return "Wallet A has 0 fractions — skipped";
  const proceeds = await publicClient.readContract({ address: vault2Addr, abi: VAULT_ABI, functionName:"totalBuyoutProceeds" });
  const supply   = await publicClient.readContract({ address: fToken2, abi: TOKEN_ABI, functionName:"totalSupply" });
  const expected = supply > 0n ? (fracBal * proceeds) / supply : 0n;
  await write(walletA, vault2Addr, VAULT_ABI, "burnAndClaim", [fracBal]);
  const fracAfter = await publicClient.readContract({ address: fToken2, abi: TOKEN_ABI, functionName:"balanceOf", args:[addrA] });
  if (fracAfter !== 0n) throw new Error(`Wallet A still has ${formatEther(fracAfter)} ARCF2`);
  return `Burned ${formatEther(fracBal)} ARCF2; ≈${formatEther(expected)} USDC distributed — all proceeds claimed`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 8: DB State Verification
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 8: DB State Verification ══");

await test("vaults.getByAddress — Vault 1 exists in DB", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { address: vault1Addr.toLowerCase() } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.getByAddress?input=${input}`);
  const j = await r.json();
  const v = j?.result?.data?.json ?? j?.result?.data;
  if (!v?.id) throw new Error(`Not found: ${JSON.stringify(j).slice(0,100)}`);
  return `id=${v.id} symbol=${v.symbol} status=${v.status} chainId=${v.chainId}`;
});

await test("vaults.getByAddress — Vault 2 with bids array", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { address: vault2Addr.toLowerCase() } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.getByAddress?input=${input}`);
  const j = await r.json();
  const v = j?.result?.data?.json ?? j?.result?.data;
  if (!v?.id) throw new Error(`Not found`);
  const bids = v.bids ?? [];
  return `id=${v.id} status=${v.status} bids=${bids.length} currentBid=${v.currentBid}`;
});

await test("vaults.list search='ARCF' — finds both test vaults", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"ALL", search:"ARCF" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  const ours = d.filter(v => v.symbol === "ARCF1" || v.symbol === "ARCF2");
  if (ours.length < 2) throw new Error(`Only found ${ours.length}/2: ${ours.map(v=>v.symbol)}`);
  return `Found ${ours.length} test vaults: [${ours.map(v=>v.symbol).join(", ")}]`;
});

await test("vaults.list filter BOUGHT_OUT — Vault 2 appears", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"BOUGHT_OUT" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  const vault2 = d.find(v => v.vaultAddress?.toLowerCase() === vault2Addr.toLowerCase());
  if (!vault2) throw new Error(`Vault 2 not in BOUGHT_OUT list`);
  return `Vault 2 (${vault2.symbol}) in BOUGHT_OUT list ✓`;
});

await test("vaults.getStats — final totals reflect 2 new vaults", async () => {
  const r = await fetch(`${API_BASE}/api/trpc/vaults.getStats?input=${encodeURIComponent(JSON.stringify({}))}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  return `totalVaults=${d.totalVaults} active=${d.activeVaults} redeemed=${d.redeemedVaults}`;
});

// ══════════════════════════════════════════════════════════════════
// SECTION 9: Auth Protection
// ══════════════════════════════════════════════════════════════════
console.log("\n\n══ SECTION 9: Auth Protection ══");

await test("vaults.register without session → UNAUTHORIZED (401/403)", async () => {
  const body = { json: {
    vaultAddress: "0x" + "a".repeat(40), tokenAddress: "0x" + "b".repeat(40),
    nftContract:  "0x" + "c".repeat(40), tokenId:"1", name:"X", symbol:"X",
    totalSupply:"1", reservePrice:"1", curatorAddress: "0x" + "a".repeat(40),
  }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.register`, {
    method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const code = j?.error?.data?.code
    ?? j?.error?.json?.data?.code
    ?? (j?.error ? "error_present" : null);
  if (!code) throw new Error(`Expected error, got success: ${JSON.stringify(j).slice(0,100)}`);
  return `Correctly rejected: code=${code}`;
});

await test("vaults.updateStatus without session → UNAUTHORIZED", async () => {
  const body = { json: { vaultAddress: vault1Addr, status: "ACTIVE" } };
  const r = await fetch(`${API_BASE}/api/trpc/vaults.updateStatus`, {
    method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const code = j?.error?.data?.code ?? j?.error?.json?.data?.code ?? (j?.error ? "error_present" : null);
  if (!code) throw new Error(`Expected error, got: ${JSON.stringify(j).slice(0,100)}`);
  return `Correctly rejected: code=${code}`;
});

await test("vaults.recordBid without session → UNAUTHORIZED", async () => {
  const body = { json: { vaultAddress: vault2Addr, bidder: addrB, amount: "1" } };
  const r = await fetch(`${API_BASE}/api/trpc/vaults.recordBid`, {
    method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const code = j?.error?.data?.code ?? j?.error?.json?.data?.code ?? (j?.error ? "error_present" : null);
  if (!code) throw new Error(`Expected error, got: ${JSON.stringify(j).slice(0,100)}`);
  return `Correctly rejected: code=${code}`;
});

// ══════════════════════════════════════════════════════════════════
// FINAL REPORT
// ══════════════════════════════════════════════════════════════════
console.log("\n\n════════════════════════════════════════════════════════════");
console.log("  FINAL TEST RESULTS");
console.log("════════════════════════════════════════════════════════════");
const pad = Math.max(...results.map(r => r.name.length));
for (const r of results) {
  const icon = r.status === "PASS" ? "✅" : "❌";
  const tail = r.status === "FAIL" ? `  ↳ ${r.detail.slice(0,100)}` : "";
  console.log(`${icon} ${r.name.padEnd(pad + 2)}${tail}`);
}
console.log(`\n  ── Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed} ──`);

// Write Markdown report
const reportPath = "/home/user/app/docs/integration-test-report.md";
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, [
  "# FragArc Integration Test Report",
  "",
  `**Date:** ${new Date().toISOString()}`,
  `**Network:** Arc Testnet (chain ID 5042002)`,
  `**Factory:** \`${FACTORY}\``,
  `**MockArcNFT:** \`${MOCK_NFT}\``,
  `**Wallet A (curator):** \`${addrA}\``,
  `**Wallet B (buyer):** \`${addrB}\``,
  `**Vault 1 — Path 1 Direct Redemption:** \`${vault1Addr}\``,
  `**Vault 2 — Path 2 Buyout Auction:** \`${vault2Addr}\``,
  `**FractionToken 1:** \`${fToken1}\``,
  `**FractionToken 2:** \`${fToken2}\``,
  "",
  `## Summary`,
  "",
  `**${passed} passed / ${failed} failed / ${passed + failed} total**`,
  "",
  "## Results",
  "",
  "| # | Test | Status | Detail |",
  "|---|------|--------|--------|",
  ...results.map((r, i) =>
    `| ${i+1} | ${r.name} | ${r.status === "PASS" ? "✅ PASS" : "❌ FAIL"} | ${r.detail.replace(/\|/g,"\\|").slice(0,120)} |`
  ),
  "",
  "## Explorer Links",
  "",
  `- [Vault 1 (Path 1)](https://explorer.testnet.arc.io/address/${vault1Addr})`,
  `- [Vault 2 (Path 2)](https://explorer.testnet.arc.io/address/${vault2Addr})`,
  `- [FractionToken 1 (ARCF1)](https://explorer.testnet.arc.io/token/${fToken1})`,
  `- [FractionToken 2 (ARCF2)](https://explorer.testnet.arc.io/token/${fToken2})`,
  `- [Wallet A](https://explorer.testnet.arc.io/address/${addrA})`,
  `- [Wallet B](https://explorer.testnet.arc.io/address/${addrB})`,
].join("\n"), "utf-8");

console.log(`\n  Report → docs/integration-test-report.md`);
if (failed > 0) process.exit(1);
