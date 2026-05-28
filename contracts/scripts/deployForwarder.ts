/**
 * Deploy TreasureChessForwarder
 *
 * The forwarder enables gasless transactions via ERC-2771.
 * Users sign transactions off-chain, and the platform wallet
 * submits them via the forwarder.
 *
 * Run: npx hardhat run scripts/deployForwarder.ts --network amoy
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("=".repeat(60));
  console.log("Deploying TreasureChessForwarder");
  console.log("=".repeat(60));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "MATIC");

  // Deploy forwarder
  console.log("\nDeploying TreasureChessForwarder...");
  const Forwarder = await ethers.getContractFactory("TreasureChessForwarder");
  const forwarder = await Forwarder.deploy();

  await forwarder.waitForDeployment();
  const forwarderAddress = await forwarder.getAddress();

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("\nForwarder address:", forwarderAddress);

  // Verify the forwarder name
  const name = await forwarder.eip712Domain();
  console.log("EIP-712 Domain:", {
    name: name[1],
    version: name[2],
    chainId: name[3].toString(),
    verifyingContract: name[4],
  });

  console.log("\n" + "=".repeat(60));
  console.log("NEXT STEPS:");
  console.log("=".repeat(60));
  console.log("\n1. Update .env with:");
  console.log(`   EXPO_PUBLIC_FORWARDER_ADDRESS=${forwarderAddress}`);
  console.log("\n2. Add Supabase secret:");
  console.log(`   supabase secrets set FORWARDER_ADDRESS=${forwarderAddress}`);
  console.log("\n3. If escrow was deployed with different forwarder, redeploy escrow");
  console.log("   with this forwarder address as _trustedForwarder parameter");

  return {
    forwarderAddress,
  };
}

main()
  .then((result) => {
    console.log("\nDeployment complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDeployment failed:", error);
    process.exit(1);
  });
