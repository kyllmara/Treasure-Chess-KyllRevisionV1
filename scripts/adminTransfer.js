/**
 * Admin Transfer / Refund Script
 *
 * This script can:
 * 1. Transfer USDC directly from the platform wallet to specified addresses
 * 2. Rescue stuck escrow funds using rescueGameFunds() for WaitingForOpponent games
 * 3. Emergency refund Active/Disputed games using emergencyRefund()
 *
 * Requires BACKEND_SIGNER_PRIVATE_KEY in .env and sufficient MATIC for gas.
 *
 * Usage: node scripts/adminTransfer.js
 */

const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";
const USDC_CONTRACT = process.env.EXPO_PUBLIC_USDC_CONTRACT || "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582";
const ESCROW_CONTRACT = process.env.EXPO_PUBLIC_ESCROW_CONTRACT_ADDRESS || "";
const PLATFORM_PRIVATE_KEY = process.env.BACKEND_SIGNER_PRIVATE_KEY;

// ABIs
const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const ESCROW_ABI = [
  "function owner() view returns (address)",
  "function rescueGameFunds(bytes32 gameId, address recipient)",
  "function emergencyRefund(bytes32 gameId)",
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))"
];

// ========================================
// DIRECT USDC TRANSFERS FROM PLATFORM WALLET
// ========================================
const DIRECT_TRANSFERS = [
  {
    to: "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44",
    amountUSD: 3,
    reason: "Refund for stuck escrow"
  },
  {
    to: "0xD578a74591eb4FdD8e637255403A91c243B8e5Fa",
    amountUSD: 2,
    reason: "Refund for stuck escrow"
  }
];

// ========================================
// ESCROW RESCUE OPERATIONS (for WaitingForOpponent games)
// Use this if funds are stuck in escrow
// ========================================
const ESCROW_RESCUES = [
  // Example:
  // {
  //   gameId: "your-game-uuid-here",  // The off-chain UUID
  //   recipient: "0x...",  // Address to refund
  //   reason: "Player's opponent never joined"
  // }
];

// ========================================

async function main() {
  if (!PLATFORM_PRIVATE_KEY) {
    console.error("ERROR: Missing BACKEND_SIGNER_PRIVATE_KEY in .env");
    console.log("Please set your platform wallet private key in .env file");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("ADMIN USDC TRANSFER / REFUND SCRIPT");
  console.log("=".repeat(60));
  console.log("");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const platformWallet = new ethers.Wallet(PLATFORM_PRIVATE_KEY, provider);
  const usdc = new ethers.Contract(USDC_CONTRACT, USDC_ABI, platformWallet);

  // Get token info
  const decimals = await usdc.decimals();
  const symbol = await usdc.symbol();

  console.log("Network RPC:", RPC_URL);
  console.log("USDC Contract:", USDC_CONTRACT);
  console.log("Escrow Contract:", ESCROW_CONTRACT || "(not set)");
  console.log("Token Symbol:", symbol);
  console.log("");
  console.log("Platform Wallet:", platformWallet.address);

  // Check platform wallet balances
  const usdcBalance = await usdc.balanceOf(platformWallet.address);
  const maticBalance = await provider.getBalance(platformWallet.address);

  console.log("Platform USDC Balance:", ethers.formatUnits(usdcBalance, decimals), symbol);
  console.log("Platform MATIC Balance:", ethers.formatEther(maticBalance), "MATIC");
  console.log("");

  // Check if we're owner of escrow (if escrow operations needed)
  if (ESCROW_CONTRACT && ESCROW_RESCUES.length > 0) {
    const escrow = new ethers.Contract(ESCROW_CONTRACT, ESCROW_ABI, platformWallet);
    const owner = await escrow.owner();
    console.log("Escrow Owner:", owner);
    console.log("Are we owner?", owner.toLowerCase() === platformWallet.address.toLowerCase());
    console.log("");
  }

  // Process direct transfers
  if (DIRECT_TRANSFERS.length > 0) {
    const totalUsdNeeded = DIRECT_TRANSFERS.reduce((sum, t) => sum + t.amountUSD, 0);
    const totalNeeded = ethers.parseUnits(totalUsdNeeded.toString(), decimals);

    console.log("=".repeat(60));
    console.log("DIRECT TRANSFERS");
    console.log("=".repeat(60));
    console.log("Total USDC needed:", totalUsdNeeded, symbol);
    console.log("");

    if (usdcBalance < totalNeeded) {
      console.error("ERROR: Insufficient USDC balance!");
      console.log("Have:", ethers.formatUnits(usdcBalance, decimals), symbol);
      console.log("Need:", totalUsdNeeded, symbol);
    } else {
      DIRECT_TRANSFERS.forEach((t, i) => {
        console.log(`${i + 1}. ${t.to}`);
        console.log(`   Amount: $${t.amountUSD} ${symbol}`);
        console.log(`   Reason: ${t.reason}`);
      });
      console.log("");

      console.log("⚠️  ABOUT TO EXECUTE DIRECT TRANSFERS");
      console.log("Press Ctrl+C to cancel, or wait 5 seconds to proceed...");
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log("\nExecuting direct transfers...\n");

      for (let i = 0; i < DIRECT_TRANSFERS.length; i++) {
        const transfer = DIRECT_TRANSFERS[i];
        const amount = ethers.parseUnits(transfer.amountUSD.toString(), decimals);

        console.log(`[${i + 1}/${DIRECT_TRANSFERS.length}] Transferring $${transfer.amountUSD} to ${transfer.to}...`);

        try {
          const tx = await usdc.transfer(transfer.to, amount);
          console.log(`   Tx Hash: ${tx.hash}`);
          console.log(`   Waiting for confirmation...`);

          const receipt = await tx.wait();
          console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
          console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
          console.log("");
        } catch (error) {
          console.error(`   ❌ FAILED: ${error.message}`);
          console.log("");
        }
      }
    }
  }

  // Process escrow rescues
  if (ESCROW_RESCUES.length > 0 && ESCROW_CONTRACT) {
    console.log("");
    console.log("=".repeat(60));
    console.log("ESCROW RESCUE OPERATIONS");
    console.log("=".repeat(60));

    const escrow = new ethers.Contract(ESCROW_CONTRACT, ESCROW_ABI, platformWallet);

    for (let i = 0; i < ESCROW_RESCUES.length; i++) {
      const rescue = ESCROW_RESCUES[i];
      // Convert game UUID to bytes32
      const gameIdBytes = ethers.id(rescue.gameId);

      console.log(`\n[${i + 1}/${ESCROW_RESCUES.length}] Rescuing game: ${rescue.gameId}`);
      console.log(`   Bytes32: ${gameIdBytes}`);
      console.log(`   Recipient: ${rescue.recipient}`);
      console.log(`   Reason: ${rescue.reason}`);

      try {
        // Check game state first
        const game = await escrow.getGame(gameIdBytes);
        const statusNames = ["None", "WaitingForOpponent", "Active", "Completed", "Cancelled", "Disputed"];
        const status = statusNames[Number(game.status)] || `Unknown(${game.status})`;

        console.log(`   Current Status: ${status}`);
        console.log(`   Wager: ${ethers.formatUnits(game.wagerAmount, decimals)} USDC`);
        console.log(`   Player1: ${game.player1}`);

        if (game.status === 0n) {
          console.log("   ⚠️ Game doesn't exist on-chain");
          continue;
        }

        if (game.status === 1n) {
          // WaitingForOpponent - use rescueGameFunds
          console.log("   Calling rescueGameFunds...");
          const tx = await escrow.rescueGameFunds(gameIdBytes, rescue.recipient);
          console.log(`   Tx Hash: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
        } else if (game.status === 2n || game.status === 5n) {
          // Active or Disputed - use emergencyRefund
          console.log("   Calling emergencyRefund...");
          const tx = await escrow.emergencyRefund(gameIdBytes);
          console.log(`   Tx Hash: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
        } else {
          console.log(`   ⚠️ Cannot rescue - game is already ${status}`);
        }
      } catch (error) {
        console.error(`   ❌ FAILED: ${error.message}`);
      }
    }
  }

  // Final balance check
  const newUsdcBalance = await usdc.balanceOf(platformWallet.address);
  const newMaticBalance = await provider.getBalance(platformWallet.address);

  console.log("");
  console.log("=".repeat(60));
  console.log("COMPLETE");
  console.log("=".repeat(60));
  console.log("Final Platform USDC Balance:", ethers.formatUnits(newUsdcBalance, decimals), symbol);
  console.log("Final Platform MATIC Balance:", ethers.formatEther(newMaticBalance), "MATIC");
}

main().catch(error => {
  console.error("Script failed:", error);
  process.exit(1);
});
