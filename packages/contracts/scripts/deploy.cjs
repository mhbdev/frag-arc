const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  console.log("----------------------------------------------------");
  console.log("Deploying Arc Contracts with account:", deployer.account.address);
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account USDC balance:", balance.toString());
  console.log("----------------------------------------------------");

  // 1. Deploy MockArcNFT
  console.log("Deploying MockArcNFT (ArcGenesis)...");
  const mockNFT = await hre.viem.deployContract("MockArcNFT");
  console.log("MockArcNFT deployed to:", mockNFT.address);

  // 2. Deploy NFTVaultFactory
  console.log("Deploying NFTVaultFactory...");
  const factory = await hre.viem.deployContract("NFTVaultFactory");
  console.log("NFTVaultFactory deployed to:", factory.address);

  console.log("----------------------------------------------------");
  console.log("Deployment complete! Update your environment variables:");
  console.log(`NEXT_PUBLIC_ARC_TESTNET_FACTORY=${factory.address}`);
  console.log(`NEXT_PUBLIC_ARC_TESTNET_MOCK_NFT=${mockNFT.address}`);
  console.log("----------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
