const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const chainId = await publicClient.getChainId();
  const isArcMainnet = hre.network.name === "arcMainnet" || chainId === 5042;

  if (!deployer) {
    throw new Error("PRIVATE_KEY is required for contract deployment");
  }

  console.log("----------------------------------------------------");
  console.log("Deploying Arc Contracts with account:", deployer.account.address);
  console.log("Network:", hre.network.name, "Chain ID:", chainId);
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account native USDC balance (18 decimals):", balance.toString());
  console.log("----------------------------------------------------");

  // Demo NFT contracts are testnet-only. Never deploy a mock asset to mainnet.
  let mockNFT;
  if (!isArcMainnet) {
    console.log("Deploying MockArcNFT (testnet demo asset)...");
    mockNFT = await hre.viem.deployContract("MockArcNFT");
    console.log("MockArcNFT deployed to:", mockNFT.address);
  }

  // 2. Deploy NFTVaultFactory
  console.log("Deploying NFTVaultFactory...");
  const factory = await hre.viem.deployContract("NFTVaultFactory");
  console.log("NFTVaultFactory deployed to:", factory.address);

  console.log("----------------------------------------------------");
  console.log("Deployment complete! Update your environment variables:");
  if (mockNFT) {
    console.log(`NEXT_PUBLIC_ARC_TESTNET_FACTORY=${factory.address}`);
    console.log(`NEXT_PUBLIC_ARC_TESTNET_MOCK_NFT=${mockNFT.address}`);
  } else {
    console.log(`NEXT_PUBLIC_ARC_MAINNET_FACTORY=${factory.address}`);
    console.log("Do not configure a mainnet mock NFT address; use real, user-owned NFTs.");
  }
  console.log("----------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
