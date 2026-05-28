const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Amoy testnet addresses
  const USDC_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  const BACKEND_SIGNER = deployer.address; // Same as deployer for now
  const PLATFORM_VAULT = "0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b";
  const TRUSTED_FORWARDER = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";

  console.log("Deploying TreasureChessEscrowV2 (with permit support)...");
  console.log("  USDC:", USDC_ADDRESS);
  console.log("  Backend Signer:", BACKEND_SIGNER);
  console.log("  Platform Vault:", PLATFORM_VAULT);
  console.log("  Trusted Forwarder:", TRUSTED_FORWARDER);

  const EscrowFactory = await ethers.getContractFactory("TreasureChessEscrowV2");
  const escrow = await EscrowFactory.deploy(
    USDC_ADDRESS,
    BACKEND_SIGNER,
    PLATFORM_VAULT,
    TRUSTED_FORWARDER
  );

  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("TreasureChessEscrowV2 (with permit):", escrowAddress);
  console.log("\nUpdate your .env with:");
  console.log(`EXPO_PUBLIC_ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
}

main().catch(console.error);
