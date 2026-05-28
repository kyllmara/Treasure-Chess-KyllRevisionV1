import { ethers, network } from "hardhat";

// USDC addresses on different networks
const USDC_ADDRESSES: Record<number, string> = {
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon Mainnet (native USDC)
  80002: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Polygon Amoy Testnet
};

// Biconomy Trusted Forwarder addresses (for gasless transactions)
// https://docs.biconomy.io/supportedchains
const BICONOMY_FORWARDER: Record<number, string> = {
  137: "0x84a0856b038eaAd1cC7E297cF34A7e72685A8693", // Polygon Mainnet
  80002: "0x84a0856b038eaAd1cC7E297cF34A7e72685A8693", // Polygon Amoy (same address)
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("Deploying TreasureChessEscrowV2 (with rescueGameFunds)...");
  console.log("Network:", network.name);
  console.log("Chain ID:", chainId);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MATIC");

  // Get USDC address for this network
  const usdcAddress = USDC_ADDRESSES[Number(chainId)];
  if (!usdcAddress) {
    throw new Error(`No USDC address configured for chain ${chainId}`);
  }

  // Get Biconomy forwarder address for gasless transactions
  const biconomyForwarder = BICONOMY_FORWARDER[Number(chainId)];
  if (!biconomyForwarder) {
    throw new Error(`No Biconomy forwarder configured for chain ${chainId}`);
  }

  // Configuration
  const backendSigner = process.env.BACKEND_SIGNER_ADDRESS || deployer.address;
  const platformVault = process.env.PLATFORM_VAULT_ADDRESS || deployer.address;

  console.log("\nConfiguration:");
  console.log("  USDC Address:", usdcAddress);
  console.log("  Backend Signer:", backendSigner);
  console.log("  Platform Vault:", platformVault);
  console.log("  Biconomy Forwarder:", biconomyForwarder);

  // Deploy contract (V2 with rescueGameFunds and lower MIN_WAGER)
  const TreasureChessEscrow = await ethers.getContractFactory("TreasureChessEscrowV2");
  const escrow = await TreasureChessEscrow.deploy(
    usdcAddress,
    backendSigner,
    platformVault,
    biconomyForwarder
  );

  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();

  console.log("\n✅ TreasureChessEscrowV2 deployed to:", escrowAddress);

  // Verify deployment
  console.log("\nVerifying deployment...");
  console.log("  Platform Fee:", (await escrow.PLATFORM_FEE_BPS()).toString(), "bps (10%)");
  console.log("  Min Wager:", ethers.formatUnits(await escrow.MIN_WAGER(), 6), "USDC");
  console.log("  Max Wager:", ethers.formatUnits(await escrow.MAX_WAGER(), 6), "USDC");
  console.log("  Default Timeout:", (await escrow.defaultTimeoutSeconds()).toString(), "seconds");

  // Output for .env
  console.log("\n📋 Add to your .env:");
  console.log(`ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
  console.log(`USDC_CONTRACT_ADDRESS=${usdcAddress}`);

  // Verification command
  console.log("\n📋 To verify on Polygonscan:");
  console.log(`npx hardhat verify --network ${network.name} ${escrowAddress} ${usdcAddress} ${backendSigner} ${platformVault} ${biconomyForwarder}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
