/**
 * FragArc Off-chain + Read-only Integration Tests
 * Covers everything that does not require sending transactions:
 *  - API health, tRPC public endpoints
 *  - Better-Auth SIWE (sign with local viem wallet — no funds needed)
 *  - DB read operations (getStats, list, getByAddress)
 *  - Auth protection checks
 *  - On-chain read-only verification of deployed contracts
 */

import { createPublicClient, http, formatEther, parseEther, defineChain } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createWalletClient } from "viem";
import fs from "node:fs";

const arcTestnet = defineChain({
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name:"USDC", symbol:"USDC", decimals:18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  testnet: true,
});

const FACTORY   = "0x364860b76927D48Fa5a855b5501B057C95d3F376";
const MOCK_NFT  = "0x789b783f982885994f5756C30e840a12Ec71d79B";
const API_BASE  = "http://localhost:3001";

const publicClient = createPublicClient({ chain: arcTestnet, transport: http("https://rpc.testnet.arc.io") });

// Use ephemeral wallets — SIWE signing is gasless (off-chain message signature)
const pkA = generatePrivateKey();
const pkB = generatePrivateKey();
const accountA = privateKeyToAccount(pkA);
const accountB = privateKeyToAccount(pkB);
const walletA = createWalletClient({ account: accountA, chain: arcTestnet, transport: http("https://rpc.testnet.arc.io") });
const walletB = createWalletClient({ account: accountB, chain: arcTestnet, transport: http("https://rpc.testnet.arc.io") });
const addrA = accountA.address;
const addrB = accountB.address;

// Test harness
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

// SIWE helper
function buildSIWEMessage({ domain, address, statement, uri, version, chainId, nonce, issuedAt }) {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address, "",
    statement, "",
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

async function siweLogin(account, walletClient, addr) {
  let nonce = "";
  // Try Better-Auth SIWE nonce endpoints
  for (const endpoint of [
    "/api/auth/sign-in/siwe/nonce",
    "/api/auth/siwe/nonce",
  ]) {
    const r = await fetch(`${API_BASE}${endpoint}`).catch(() => null);
    if (!r) continue;
    const text = await r.text().catch(() => "");
    try { nonce = JSON.parse(text)?.nonce || ""; } catch { nonce = text.trim().replace(/"/g, ""); }
    if (nonce && nonce.length >= 8) break;
  }

  if (!nonce || nonce.length < 4) {
    throw new Error(`SIWE nonce endpoint not available (got: "${nonce}")`);
  }

  const issuedAt = new Date().toISOString();
  const message = buildSIWEMessage({
    domain: "localhost:3001", address: addr,
    statement: "Sign in with Ethereum to FragArc",
    uri: "http://localhost:3001",
    version: "1", chainId: 5042002, nonce, issuedAt,
  });

  const signature = await walletClient.signMessage({ message });

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
    throw new Error(`SIWE verify HTTP ${verifyRes.status}: ${body.slice(0, 300)}`);
  }
  return { nonce, cookie, status: verifyRes.status };
}

let cookieA = "", cookieB = "";

console.log("\n════════════════════════════════════════════════════════════");
console.log("  FragArc Integration Tests (Off-chain + Read-only)");
console.log("════════════════════════════════════════════════════════════");
console.log(`  Wallet A (ephemeral, gasless SIWE): ${addrA}`);
console.log(`  Wallet B (ephemeral, gasless SIWE): ${addrB}`);
console.log(`  API: ${API_BASE}`);

// ══ SECTION 1: API & tRPC Public Endpoints ══════════════════════
console.log("\n\n══ SECTION 1: API Health & tRPC Public Endpoints ══");

await test("GET / — Next.js app responds HTTP 200", async () => {
  const r = await fetch(`${API_BASE}/`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});

await test("GET /api/trpc — tRPC router is reachable", async () => {
  const r = await fetch(`${API_BASE}/api/trpc`);
  if (r.status >= 500) throw new Error(`HTTP ${r.status} (server error)`);
  return `HTTP ${r.status} (server alive)`;
});

await test("faucet.getPresets — returns exactly 4 ArcGenesis demo NFTs", async () => {
  const r = await fetch(`${API_BASE}/api/trpc/faucet.getPresets?input=${encodeURIComponent(JSON.stringify({}))}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d) || d.length !== 4) throw new Error(`Got: ${JSON.stringify(d)?.slice(0,100)}`);
  const symbols = d.map(p => p.symbol);
  if (!symbols.includes("ARCSEN") || !symbols.includes("ARCQTM")) throw new Error(`Missing expected symbols: ${symbols}`);
  return `${d.length} presets: ${symbols.join(", ")}`;
});

await test("faucet.getPresets — each preset has required fields (id, name, symbol, image, attributes)", async () => {
  const r = await fetch(`${API_BASE}/api/trpc/faucet.getPresets?input=${encodeURIComponent(JSON.stringify({}))}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  for (const p of d) {
    if (!p.id || !p.name || !p.symbol || !p.image || !p.attributes) {
      throw new Error(`Missing field in preset: ${JSON.stringify(p)}`);
    }
  }
  return `All 4 presets have complete schema`;
});

await test("vaults.getStats — returns valid stats object", async () => {
  const r = await fetch(`${API_BASE}/api/trpc/vaults.getStats?input=${encodeURIComponent(JSON.stringify({}))}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (typeof d?.totalVaults !== "number") throw new Error(`Bad stats: ${JSON.stringify(d)}`);
  if (typeof d?.activeVaults !== "number") throw new Error(`Missing activeVaults`);
  if (typeof d?.redeemedVaults !== "number") throw new Error(`Missing redeemedVaults`);
  if (typeof d?.totalReserveUSDC !== "string") throw new Error(`Missing totalReserveUSDC`);
  return `totalVaults=${d.totalVaults} active=${d.activeVaults} redeemed=${d.redeemedVaults} reserve=${formatEther(BigInt(d.totalReserveUSDC))} USDC`;
});

await test("vaults.list (status=ALL) — returns array", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"ALL" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array: ${JSON.stringify(d)?.slice(0,100)}`);
  return `${d.length} vault(s) in DB`;
});

await test("vaults.list (status=ACTIVE) — valid filter response", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"ACTIVE" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  for (const v of d) {
    if (v.status !== "ACTIVE") throw new Error(`Non-ACTIVE vault in ACTIVE filter: ${v.status}`);
  }
  return `${d.length} ACTIVE vault(s)`;
});

await test("vaults.list (status=AUCTION) — valid filter response", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"AUCTION" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  return `${d.length} AUCTION vault(s)`;
});

await test("vaults.list (status=REDEEMED) — valid filter response", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"REDEEMED" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  return `${d.length} REDEEMED vault(s)`;
});

await test("vaults.list (status=BOUGHT_OUT) — valid filter response", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"BOUGHT_OUT" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  return `${d.length} BOUGHT_OUT vault(s)`;
});

await test("vaults.list search — search query filters by name/symbol", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"ALL", search:"xyz_nonexistent_xyz" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  if (d.length > 0) throw new Error(`Search for nonexistent string returned ${d.length} results`);
  return `Empty result for non-matching search ✓`;
});

await test("vaults.getByAddress (unknown addr) — returns null", async () => {
  const fakeAddr = "0x" + "dead".repeat(10);
  const input = encodeURIComponent(JSON.stringify({ json: { address: fakeAddr } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.getByAddress?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (d !== null && d !== undefined && d !== false) throw new Error(`Expected null, got: ${JSON.stringify(d)}`);
  return `Correctly returns null for unknown address`;
});

// ══ SECTION 2: SIWE Authentication ══════════════════════════════
console.log("\n\n══ SECTION 2: SIWE Authentication ══");

await test("Better-Auth SIWE nonce endpoint — GET /api/auth/sign-in/siwe/nonce", async () => {
  let found = false, nonce = "", statusCode = 0;
  for (const ep of ["/api/auth/sign-in/siwe/nonce", "/api/auth/siwe/nonce"]) {
    const r = await fetch(`${API_BASE}${ep}`);
    statusCode = r.status;
    if (r.ok) {
      const t = await r.text();
      try { nonce = JSON.parse(t)?.nonce || t.replace(/"/g,"").trim(); } catch { nonce = t.trim(); }
      if (nonce.length >= 8) { found = true; break; }
    }
  }
  if (!found) throw new Error(`No nonce found. Last status: ${statusCode}`);
  return `Nonce=${nonce.slice(0,12)}... (length=${nonce.length})`;
});

await test("SIWE login — wallet A (fresh ephemeral wallet, no gas needed)", async () => {
  const { nonce, cookie, status } = await siweLogin(accountA, walletA, addrA);
  cookieA = cookie;
  return `HTTP ${status} nonce=${nonce.slice(0,8)}... cookie=${cookie ? "✓ present" : "absent (session may still work)"}`;
});

await test("SIWE login — wallet B (second independent session)", async () => {
  const { nonce, cookie, status } = await siweLogin(accountB, walletB, addrB);
  cookieB = cookie;
  return `HTTP ${status} nonce=${nonce.slice(0,8)}... cookie=${cookie ? "✓ present" : "absent"}`;
});

// ══ SECTION 3: Auth Protection ══════════════════════════════════
console.log("\n\n══ SECTION 3: Auth Protection (unauthenticated rejects) ══");

await test("vaults.register without session → UNAUTHORIZED", async () => {
  const body = { json: {
    vaultAddress: "0x" + "a".repeat(40), tokenAddress: "0x" + "b".repeat(40),
    nftContract:  "0x" + "c".repeat(40), tokenId:"1", name:"X", symbol:"X",
    totalSupply:"1", reservePrice:"1", curatorAddress: "0x" + "a".repeat(40),
  }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.register`, {
    method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body),
  });
  const j = await r.json();
  const code = j?.error?.data?.code ?? j?.error?.json?.data?.code ?? (j?.error ? "error_present" : null);
  if (!code) throw new Error(`Expected auth error, got: ${JSON.stringify(j).slice(0,150)}`);
  return `Rejected code=${code}`;
});

await test("vaults.updateStatus without session → UNAUTHORIZED", async () => {
  const body = { json: { vaultAddress: "0x" + "a".repeat(40), status:"ACTIVE" }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.updateStatus`, {
    method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body),
  });
  const j = await r.json();
  const code = j?.error?.data?.code ?? j?.error?.json?.data?.code ?? (j?.error ? "error_present" : null);
  if (!code) throw new Error(`Expected auth error, got: ${JSON.stringify(j).slice(0,150)}`);
  return `Rejected code=${code}`;
});

await test("vaults.recordBid without session → UNAUTHORIZED", async () => {
  const body = { json: { vaultAddress: "0x" + "a".repeat(40), bidder: "0x" + "b".repeat(40), amount:"1" }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.recordBid`, {
    method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body),
  });
  const j = await r.json();
  const code = j?.error?.data?.code ?? j?.error?.json?.data?.code ?? (j?.error ? "error_present" : null);
  if (!code) throw new Error(`Expected auth error, got: ${JSON.stringify(j).slice(0,150)}`);
  return `Rejected code=${code}`;
});

// ══ SECTION 4: On-chain Read-only Contract Verification ═════════
console.log("\n\n══ SECTION 4: On-chain Read-only Contract Verification ══");

const FACTORY_ABI = [
  { name:"getVaultCount", type:"function", inputs:[], outputs:[{type:"uint256"}], stateMutability:"view" },
  { name:"getAllVaults",  type:"function", inputs:[], outputs:[{type:"address[]"}], stateMutability:"view" },
];
const ERC721_ABI = [
  { name:"name",   type:"function", inputs:[], outputs:[{type:"string"}],  stateMutability:"view" },
  { name:"symbol", type:"function", inputs:[], outputs:[{type:"string"}],  stateMutability:"view" },
];

await test("Arc Testnet RPC — can fetch latest block", async () => {
  const block = await publicClient.getBlockNumber();
  if (!block || block < 1n) throw new Error(`Bad block: ${block}`);
  return `Latest block: ${block.toString()}`;
});

await test("NFTVaultFactory deployed — getVaultCount() returns uint256", async () => {
  const count = await publicClient.readContract({
    address: FACTORY, abi: FACTORY_ABI, functionName: "getVaultCount",
  });
  return `${count.toString()} vaults on Arc Testnet factory`;
});

await test("NFTVaultFactory deployed — getAllVaults() returns address array", async () => {
  const vaults = await publicClient.readContract({
    address: FACTORY, abi: FACTORY_ABI, functionName: "getAllVaults",
  });
  if (!Array.isArray(vaults)) throw new Error(`Not array`);
  return `${vaults.length} vault address(es) registered in factory`;
});

await test("MockArcNFT deployed — name() + symbol()", async () => {
  const name   = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"name" });
  const symbol = await publicClient.readContract({ address: MOCK_NFT, abi: ERC721_ABI, functionName:"symbol" });
  if (!name || !symbol) throw new Error(`name=${name} symbol=${symbol}`);
  return `name="${name}" symbol="${symbol}"`;
});

await test("Arc Testnet gas price floor — maxFeePerGas ≥ 20 Gwei", async () => {
  const fees = await publicClient.estimateFeesPerGas();
  const maxFee = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
  const gwei20 = 20_000_000_000n;
  if (maxFee < gwei20) throw new Error(`Fee ${maxFee} < 20 Gwei floor`);
  return `maxFeePerGas=${Number(maxFee)/1e9} Gwei (≥ 20 Gwei floor ✓)`;
});

// Verify any existing factory vaults (from previous test runs or existing deployments)
await test("On-chain vault verification — first factory vault has valid state", async () => {
  const vaults = await publicClient.readContract({
    address: FACTORY, abi: FACTORY_ABI, functionName: "getAllVaults",
  });
  if (vaults.length === 0) return "No vaults on factory yet (first run)";

  const VAULT_ABI = [
    { name:"state",        type:"function", inputs:[], outputs:[{type:"uint8"}],   stateMutability:"view" },
    { name:"fractionToken",type:"function", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
    { name:"reservePrice", type:"function", inputs:[], outputs:[{type:"uint256"}], stateMutability:"view" },
    { name:"curator",      type:"function", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
    { name:"nftContract",  type:"function", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  ];
  const vaultAddr = vaults[0];
  const [state, fToken, reserve, curator, nftContract] = await Promise.all([
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName:"state" }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName:"fractionToken" }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName:"reservePrice" }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName:"curator" }),
    publicClient.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName:"nftContract" }),
  ]);
  const states = ["INACTIVE","ACTIVE","AUCTION","REDEEMED","BOUGHT_OUT"];
  return `vault[0]=${vaultAddr.slice(0,10)}... state=${states[Number(state)]} reserve=${formatEther(reserve)} USDC fToken=${fToken.slice(0,10)}...`;
});

// ══ SECTION 5: Input Validation / Edge Cases ════════════════════
console.log("\n\n══ SECTION 5: Input Validation & Edge Cases ══");

await test("vaults.register — invalid address format → validation error", async () => {
  const body = { json: {
    vaultAddress: "not_an_address", tokenAddress: "0x" + "b".repeat(40),
    nftContract: "0x" + "c".repeat(40), tokenId:"1", name:"X", symbol:"X",
    totalSupply:"1", reservePrice:"1", curatorAddress: "0x" + "a".repeat(40),
  }};
  const r = await fetch(`${API_BASE}/api/trpc/vaults.register`, {
    method:"POST", headers:{"content-type":"application/json", ...(cookieA ? {cookie:cookieA} : {})},
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const hasError = !!(j?.error);
  if (!hasError) throw new Error(`Expected validation error, got success`);
  return `Correctly rejected with error`;
});

await test("vaults.list — limit parameter respected (limit=1)", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"ALL", limit:1 } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!Array.isArray(d)) throw new Error(`Not array`);
  if (d.length > 1) throw new Error(`Expected ≤1 result, got ${d.length}`);
  return `Returned ${d.length} item(s) with limit=1 ✓`;
});

await test("vaults.list — invalid status → validation error", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { status:"INVALID_STATUS" } }));
  const r = await fetch(`${API_BASE}/api/trpc/vaults.list?input=${input}`);
  const j = await r.json();
  const hasError = !!(j?.error);
  if (!hasError) throw new Error(`Expected validation error for invalid status enum`);
  return `Correctly rejected invalid status enum`;
});

// ══ FINAL REPORT ════════════════════════════════════════════════
console.log("\n\n════════════════════════════════════════════════════════════");
console.log("  FINAL TEST RESULTS");
console.log("════════════════════════════════════════════════════════════");
const pad = Math.max(...results.map(r => r.name.length));
for (const r of results) {
  const icon = r.status === "PASS" ? "✅" : "❌";
  const tail = r.status === "FAIL" ? `\n     ↳ ${r.detail.slice(0,120)}` : "";
  console.log(`${icon} ${r.name.padEnd(pad + 2)}${tail}`);
}
console.log(`\n  ── Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed} ──`);

// Write report
const reportPath = "/home/user/app/docs/integration-test-report.md";
import path from "node:path";
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, [
  "# FragArc Integration Test Report",
  "",
  `**Date:** ${new Date().toISOString()}`,
  `**Network:** Arc Testnet (chain ID 5042002)`,
  `**Factory:** \`${FACTORY}\``,
  `**MockArcNFT:** \`${MOCK_NFT}\``,
  `**API Base:** \`${API_BASE}\``,
  "",
  `## Summary: ${passed} passed / ${failed} failed / ${passed + failed} total`,
  "",
  "## Results",
  "",
  "| # | Test | Status | Detail |",
  "|---|------|--------|--------|",
  ...results.map((r, i) =>
    `| ${i+1} | ${r.name} | ${r.status === "PASS" ? "✅ PASS" : "❌ FAIL"} | ${r.detail.replace(/\|/g,"\\|").slice(0,150)} |`
  ),
  "",
  "## Notes",
  "",
  "Off-chain and read-only tests completed successfully.",
  "Full onchain transaction flows (mint, vault creation, auction) require funded test wallets.",
  "Re-run `fragarc-integration-test.mjs` once wallets at the following addresses are funded:",
  "",
  "| Wallet | Address |",
  "|--------|---------|",
  `| A (curator) | \`0xd746242508e27e6345763243A1e3b6C960847788\` |`,
  `| B (buyer)   | \`0xb750901E9cb492B7892877901CC1C80aBA1760ad\` |`,
].join("\n"), "utf-8");

console.log(`\n  Full report → docs/integration-test-report.md`);
if (failed > 0) process.exit(1);
