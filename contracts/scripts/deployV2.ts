import { ethers, network } from "hardhat";

// USDC addresses on different networks
const USDC_ADDRESSES: Record<number, string> = {
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon Mainnet (native USDC)
  80002: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Polygon Amoy Testnet
};

// ERC-2771 Trusted Forwarder addresses (our custom forwarder)
// Deploy using: npx hardhat run scripts/deployForwarder.ts --network <network>
const TRUSTED_FORWARDER: Record<number, string> = {
  137: "", // Polygon Mainnet - deploy and add address
  80002: "0x566124d8E8fC86CE44856D8D88dE71Ab86847230", // Polygon Amoy Testnet (TreasureChessForwarder)
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        TreasureChessEscrowV2 Deployment (Security Fix)       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Security improvements in V2:");
  console.log("  ✓ MAX_TIMEOUT (7 days) to prevent permanent fund lockup");
  console.log("  ✓ MIN_TIMEOUT (5 minutes) to prevent instant timeout abuse");
  console.log("  ✓ Nonce-based recordMove to prevent replay attacks");
  console.log("  ✓ Access control on submitResult (backend/players only)");
  console.log("  ✓ MoveRecorded event for better tracking");
  console.log("");
  console.log("Network:", network.name);
  console.log("Chain ID:", chainId);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MATIC");

  // Get USDC address for this network
  const usdcAddress = USDC_ADDRESSES[Number(chainId)];
  if (!usdcAddress) {
    throw new Error(`No USDC address configured for chain ${chainId}`);
  }

  // Get trusted forwarder address for gasless transactions
  const trustedForwarder = TRUSTED_FORWARDER[Number(chainId)];
  if (!trustedForwarder) {
    throw new Error(`No trusted forwarder configured for chain ${chainId}. Deploy one first with deployForwarder.ts`);
  }

  // Configuration
  const backendSigner = process.env.BACKEND_SIGNER_ADDRESS || deployer.address;
  const platformVault = process.env.PLATFORM_VAULT_ADDRESS || deployer.address;

  console.log("\nConfiguration:");
  console.log("  USDC Address:", usdcAddress);
  console.log("  Backend Signer:", backendSigner);
  console.log("  Platform Vault:", platformVault);
  console.log("  Trusted Forwarder:", trustedForwarder);

  // Deploy contract
  console.log("\nDeploying TreasureChessEscrowV2...");
  const TreasureChessEscrowV2 = await ethers.getContractFactory("TreasureChessEscrowV2");
  const escrow = await TreasureChessEscrowV2.deploy(
    usdcAddress,
    backendSigner,
    platformVault,
    trustedForwarder
  );

  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();

  console.log("\n✅ TreasureChessEscrowV2 deployed to:", escrowAddress);

  // Verify deployment
  console.log("\nVerifying deployment...");
  console.log("  Platform Fee:", (await escrow.PLATFORM_FEE_BPS()).toString(), "bps (10%)");
  console.log("  Min Wager:", ethers.formatUnits(await escrow.MIN_WAGER(), 6), "USDC");
  console.log("  Max Wager:", ethers.formatUnits(await escrow.MAX_WAGER(), 6), "USDC");
  console.log("  Min Timeout:", (await escrow.MIN_TIMEOUT()).toString(), "seconds (5 min)");
  console.log("  Max Timeout:", (await escrow.MAX_TIMEOUT()).toString(), "seconds (7 days)");
  console.log("  Default Timeout:", (await escrow.defaultTimeoutSeconds()).toString(), "seconds (24 hours)");

  // Output for .env
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    Environment Variables                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Add to your .env / Supabase secrets:");
  console.log("");
  console.log(`ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
  console.log(`USDC_CONTRACT_ADDRESS=${usdcAddress}`);
  console.log(`CHAIN_ID=${chainId}`);
  console.log("");

  // Verification command
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    Verification Command                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`npx hardhat verify --network ${network.name} ${escrowAddress} \\`);
  console.log(`  ${usdcAddress} \\`);
  console.log(`  ${backendSigner} \\`);
  console.log(`  ${platformVault} \\`);
  console.log(`  ${trustedForwarder}`);
  console.log("");

  // Migration notes
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                     Migration Notes                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("1. Update ESCROW_CONTRACT_ADDRESS in Supabase secrets");
  console.log("2. Update lib/biconomy.ts with new contract address");
  console.log("3. The recordMove function now requires a nonce parameter");
  console.log("4. submitResult can only be called by backend or game players");
  console.log("5. Timeouts are now clamped between 5 min and 7 days");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
