const assert = require("node:assert");
const hre = require("hardhat");
const { parseEther } = require("viem");

describe("Bidirectional NFT Fragmentation & Buyout on Arc", function () {
  let publicClient;
  let walletClients;
  let deployer, curator, alice, bob, charlie;
  let mockNFT;
  let factory;

  before(async function () {
    publicClient = await hre.viem.getPublicClient();
    walletClients = await hre.viem.getWalletClients();
    [deployer, curator, alice, bob, charlie] = walletClients;
  });

  beforeEach(async function () {
    // 1. Deploy Mock NFT
    mockNFT = await hre.viem.deployContract("MockArcNFT");

    // 2. Deploy Vault Factory
    factory = await hre.viem.deployContract("NFTVaultFactory");
  });

  it("should fractionalize an ERC-721 NFT into ERC-20 tokens via Factory", async function () {
    // Mint NFT #1 to Curator
    await mockNFT.write.mint([curator.account.address, "ipfs://sample-metadata-1"]);
    assert.equal(
      (await mockNFT.read.ownerOf([1n])).toLowerCase(),
      curator.account.address.toLowerCase()
    );

    // Curator approves factory
    const mockNFTAsCurator = await hre.viem.getContractAt(
      "MockArcNFT",
      mockNFT.address,
      { client: { wallet: curator } }
    );
    await mockNFTAsCurator.write.approve([factory.address, 1n]);

    // Curator creates vault with 1,000,000 fraction tokens, 100 USDC reserve price, 10 min auction
    const factoryAsCurator = await hre.viem.getContractAt(
      "NFTVaultFactory",
      factory.address,
      { client: { wallet: curator } }
    );

    const initialSupply = parseEther("1000000"); // 1M tokens
    const reservePrice = parseEther("100"); // 100 USDC (18 decimals native)
    const auctionLength = 600n; // 10 minutes

    await factoryAsCurator.write.createVault([
      mockNFT.address,
      1n,
      1n,
      0, // ERC721
      "ArcGenesis Fraction #1",
      "FRAG-ARC1",
      initialSupply,
      reservePrice,
      auctionLength,
    ]);

    const vaultCount = await factory.read.getVaultCount();
    assert.equal(vaultCount, 1n);

    const vaults = await factory.read.getAllVaults();
    const vaultAddress = vaults[0];

    // Verify NFT is now locked in Vault
    assert.equal(
      (await mockNFT.read.ownerOf([1n])).toLowerCase(),
      vaultAddress.toLowerCase()
    );

    // Verify FractionToken details
    const vault = await hre.viem.getContractAt("NFTVault", vaultAddress);
    const fractionTokenAddress = await vault.read.fractionToken();
    const fractionToken = await hre.viem.getContractAt("FractionToken", fractionTokenAddress);

    assert.equal(await fractionToken.read.name(), "ArcGenesis Fraction #1");
    assert.equal(await fractionToken.read.symbol(), "FRAG-ARC1");
    assert.equal(await fractionToken.read.decimals(), 18);
    assert.equal(await fractionToken.read.totalSupply(), initialSupply);
    assert.equal(
      await fractionToken.read.balanceOf([curator.account.address]),
      initialSupply
    );

    // Verify Vault state is ACTIVE
    assert.equal(await vault.read.state(), 1); // ACTIVE
  });

  it("Path 1: Direct 100% Redemption - Burns 100% fractions and reclaims NFT", async function () {
    // Mint NFT to Curator (TokenId = 1)
    await mockNFT.write.mint([curator.account.address, "ipfs://sample-metadata-2"]);
    const mockNFTAsCurator = await hre.viem.getContractAt(
      "MockArcNFT",
      mockNFT.address,
      { client: { wallet: curator } }
    );
    await mockNFTAsCurator.write.approve([factory.address, 1n]);

    const factoryAsCurator = await hre.viem.getContractAt(
      "NFTVaultFactory",
      factory.address,
      { client: { wallet: curator } }
    );

    const initialSupply = parseEther("500000");
    const reservePrice = parseEther("50");
    const auctionLength = 600n;

    await factoryAsCurator.write.createVault([
      mockNFT.address,
      1n,
      1n,
      0,
      "Redeem Test",
      "RDM",
      initialSupply,
      reservePrice,
      auctionLength,
    ]);

    const vaultAddress = (await factory.read.getAllVaults())[0];
    const vault = await hre.viem.getContractAt("NFTVault", vaultAddress);
    const fractionTokenAddress = await vault.read.fractionToken();
    const fractionToken = await hre.viem.getContractAt("FractionToken", fractionTokenAddress);

    assert.equal(
      (await mockNFT.read.ownerOf([1n])).toLowerCase(),
      vaultAddress.toLowerCase()
    );
    assert.equal(
      await fractionToken.read.balanceOf([curator.account.address]),
      initialSupply
    );

    // Curator calls redeem()
    const vaultAsCurator = await hre.viem.getContractAt(
      "NFTVault",
      vaultAddress,
      { client: { wallet: curator } }
    );
    await vaultAsCurator.write.redeem();

    // Verify fraction tokens burned
    assert.equal(await fractionToken.read.totalSupply(), 0n);
    assert.equal(
      await fractionToken.read.balanceOf([curator.account.address]),
      0n
    );

    // Verify NFT is returned to Curator
    assert.equal(
      (await mockNFT.read.ownerOf([1n])).toLowerCase(),
      curator.account.address.toLowerCase()
    );

    // Verify Vault state is REDEEMED
    assert.equal(await vault.read.state(), 3); // REDEEMED
  });

  it("Path 2: Buyout Auction - Bidding, Pull Refunds, Conclude Auction, Pro-Rata Payout", async function () {
    // Mint NFT to Curator (TokenId = 1)
    await mockNFT.write.mint([curator.account.address, "ipfs://sample-metadata-3"]);
    const mockNFTAsCurator = await hre.viem.getContractAt(
      "MockArcNFT",
      mockNFT.address,
      { client: { wallet: curator } }
    );
    await mockNFTAsCurator.write.approve([factory.address, 1n]);

    const factoryAsCurator = await hre.viem.getContractAt(
      "NFTVaultFactory",
      factory.address,
      { client: { wallet: curator } }
    );

    const initialSupply = parseEther("1000000");
    const reservePrice = parseEther("100"); // 100 USDC
    const auctionLength = 600n; // 10 min

    await factoryAsCurator.write.createVault([
      mockNFT.address,
      1n,
      1n,
      0,
      "Buyout Test",
      "BUYOUT",
      initialSupply,
      reservePrice,
      auctionLength,
    ]);

    const vaultAddress = (await factory.read.getAllVaults())[0];
    const vault = await hre.viem.getContractAt("NFTVault", vaultAddress);
    const fractionTokenAddress = await vault.read.fractionToken();
    const fractionToken = await hre.viem.getContractAt("FractionToken", fractionTokenAddress);

    // Curator transfers 30% of fractions to Alice (Curator keeps 70%, Alice gets 30%)
    const fractionTokenAsCurator = await hre.viem.getContractAt(
      "FractionToken",
      fractionTokenAddress,
      { client: { wallet: curator } }
    );
    const aliceShare = parseEther("300000");
    await fractionTokenAsCurator.write.transfer([alice.account.address, aliceShare]);

    assert.equal(
      await fractionToken.read.balanceOf([curator.account.address]),
      parseEther("700000")
    );
    assert.equal(
      await fractionToken.read.balanceOf([alice.account.address]),
      aliceShare
    );

    // Bob starts buyout with 100 USDC (meets reserve price)
    const vaultAsBob = await hre.viem.getContractAt("NFTVault", vaultAddress, {
      client: { wallet: bob },
    });
    await vaultAsBob.write.startBuyout({ value: parseEther("100") });

    assert.equal(await vault.read.state(), 2); // AUCTION
    assert.equal(await vault.read.currentBid(), parseEther("100"));
    assert.equal(
      (await vault.read.currentBidder()).toLowerCase(),
      bob.account.address.toLowerCase()
    );

    // Charlie outbids Bob with 110 USDC (10% higher, exceeds 5% minimum)
    const vaultAsCharlie = await hre.viem.getContractAt("NFTVault", vaultAddress, {
      client: { wallet: charlie },
    });
    await vaultAsCharlie.write.bid({ value: parseEther("110") });

    assert.equal(await vault.read.currentBid(), parseEther("110"));
    assert.equal(
      (await vault.read.currentBidder()).toLowerCase(),
      charlie.account.address.toLowerCase()
    );

    // Bob checks pending withdrawals (Pull-over-Push refund)
    assert.equal(
      await vault.read.pendingWithdrawals([bob.account.address]),
      parseEther("100")
    );

    // Bob withdraws refunded funds
    const bobBalBefore = await publicClient.getBalance({ address: bob.account.address });
    const hash = await vaultAsBob.write.withdrawPendingFunds();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
    const bobBalAfter = await publicClient.getBalance({ address: bob.account.address });
    assert.equal(bobBalAfter + gasUsed - bobBalBefore, parseEther("100"));
    assert.equal(await vault.read.pendingWithdrawals([bob.account.address]), 0n);

    // Fast-forward time past auction duration + anti-sniping extension (1200 seconds)
    const testClient = await hre.viem.getTestClient();
    await testClient.increaseTime({ seconds: 1200 });
    await testClient.mine({ blocks: 1 });

    // End the buyout auction
    await vaultAsCharlie.write.endBuyout();

    assert.equal(await vault.read.state(), 4); // BOUGHT_OUT
    // Charlie receives the NFT
    assert.equal(
      (await mockNFT.read.ownerOf([1n])).toLowerCase(),
      charlie.account.address.toLowerCase()
    );
    assert.equal(await vault.read.totalBuyoutProceeds(), parseEther("110"));

    // Curator burns 70% fractions to claim 70% of 110 USDC = 77 USDC
    const vaultAsCurator = await hre.viem.getContractAt("NFTVault", vaultAddress, {
      client: { wallet: curator },
    });
    const curatorBalBefore = await publicClient.getBalance({ address: curator.account.address });
    const curatorClaimTx = await vaultAsCurator.write.burnAndClaim([parseEther("700000")]);
    const curatorReceipt = await publicClient.waitForTransactionReceipt({ hash: curatorClaimTx });
    const curatorGas = curatorReceipt.gasUsed * curatorReceipt.effectiveGasPrice;
    const curatorBalAfter = await publicClient.getBalance({ address: curator.account.address });

    // 70% of 110 USDC = 77 USDC
    assert.equal(curatorBalAfter + curatorGas - curatorBalBefore, parseEther("77"));
    assert.equal(await fractionToken.read.balanceOf([curator.account.address]), 0n);

    // Alice burns 30% fractions to claim 30% of 110 USDC = 33 USDC
    const vaultAsAlice = await hre.viem.getContractAt("NFTVault", vaultAddress, {
      client: { wallet: alice },
    });
    const aliceBalBefore = await publicClient.getBalance({ address: alice.account.address });
    const aliceClaimTx = await vaultAsAlice.write.burnAndClaim([parseEther("300000")]);
    const aliceReceipt = await publicClient.waitForTransactionReceipt({ hash: aliceClaimTx });
    const aliceGas = aliceReceipt.gasUsed * aliceReceipt.effectiveGasPrice;
    const aliceBalAfter = await publicClient.getBalance({ address: alice.account.address });

    // 30% of 110 USDC = 33 USDC
    assert.equal(aliceBalAfter + aliceGas - aliceBalBefore, parseEther("33"));
    assert.equal(await fractionToken.read.balanceOf([alice.account.address]), 0n);

    // All fractions burned, all proceeds claimed
    assert.equal(await fractionToken.read.totalSupply(), 0n);
    assert.equal(await vault.read.totalBuyoutProceeds(), 0n);
  });
});
