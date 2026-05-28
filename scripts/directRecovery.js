/**
 * Direct Recovery Script
 *
 * This script recovers funds from the old escrow by calling cancelGame
 * through the ERC2771 forwarder. It uses the platform wallet directly
 * since we have access to both the platform private key and the user's
 * Magic Link wallet needs to sign.
 *
 * Since we can't get the user's signature without the app, we'll use
 * a different approach: upgrade the old contract or use a workaround.
 *
 * ACTUAL SOLUTION: Use the forwarder to execute with a pre-signed message.
 * But we need the user's private key from Magic Link, which we don't have.
 *
 * ALTERNATIVE: The owner can mark the game as "Disputed" then call emergencyRefund.
 */

const { ethers } = require('ethers');
require('dotenv').config();

const OLD_ESCROW = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
const GAME_ID = "0x545be8e4ce11228e56afb2d800943d3b9e56ca9f784206082b4d5ea24a213ca0";
const PLAYER1 = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";

// Platform wallet private key (owner of the contract)
const PLATFORM_PRIVATE_KEY = process.env.BACKEND_SIGNER_PRIVATE_KEY;

const OLD_ESCROW_ABI = [
  "function owner() view returns (address)",
  "function markDisputed(bytes32 gameId)",
  "function emergencyRefund(bytes32 gameId)",
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds))",
  "event GameCancelled(bytes32 indexed gameId, address indexed player1)",
];

async function main() {
  if (!PLATFORM_PRIVATE_KEY) {
    console.error("Missing BACKEND_SIGNER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("DIRECT FUND RECOVERY");
  console.log("=".repeat(60));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const platformWallet = new ethers.Wallet(PLATFORM_PRIVATE_KEY, provider);
  const escrow = new ethers.Contract(OLD_ESCROW, OLD_ESCROW_ABI, platformWallet);

  console.log("Platform wallet:", platformWallet.address);
  console.log("Old escrow:", OLD_ESCROW);
  console.log("Game ID:", GAME_ID);
  console.log("Player to refund:", PLAYER1);

  // Check ownership
  const owner = await escrow.owner();
  console.log("\nContract owner:", owner);
  console.log("Are we owner?", owner.toLowerCase() === platformWallet.address.toLowerCase());

  if (owner.toLowerCase() !== platformWallet.address.toLowerCase()) {
    console.error("ERROR: We are not the owner!");
    process.exit(1);
  }

  // Check game state
  const game = await escrow.getGame(GAME_ID);
  const statusNames = ["None", "WaitingForOpponent", "Active", "Completed", "Cancelled", "Disputed"];
  const status = statusNames[Number(game.status)];

  console.log("\nGame state:");
  console.log("  Status:", status);
  console.log("  Player1:", game.player1);
  console.log("  Wager:", ethers.formatUnits(game.wagerAmount, 6), "USDC");

  if (status === "Cancelled" || status === "Completed") {
    console.log("\nGame already resolved, nothing to do.");
    process.exit(0);
  }

  if (status === "WaitingForOpponent") {
    console.log("\n⚠️  Game is WaitingForOpponent - emergencyRefund won't work directly.");
    console.log("   We need to use a workaround...");
    console.log("");
    console.log("WORKAROUND: The old contract doesn't have a direct refund for WaitingForOpponent.");
    console.log("Options:");
    console.log("1. Mark as Disputed first (only works for Active games - WON'T WORK)");
    console.log("2. Have the player call cancelGame (requires their signature - BLOCKED by invalid JWT)");
    console.log("3. Upgrade the contract to add rescueGameFunds (can't upgrade deployed contract)");
    console.log("4. Manual refund: Send USDC directly from another source");
    console.log("");
    console.log("The simplest solution is option 4: Send 1 USDC to the player directly.");
    console.log(`Player address: ${PLAYER1}`);

    // Let's actually try to mark as disputed anyway to see the error
    console.log("\n--- Attempting markDisputed (will likely fail) ---");
    try {
      const tx = await escrow.markDisputed(GAME_ID);
      console.log("Tx sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Success! Game marked as disputed.");

      // Now try emergencyRefund
      console.log("\n--- Attempting emergencyRefund ---");
      const tx2 = await escrow.emergencyRefund(GAME_ID);
      console.log("Tx sent:", tx2.hash);
      const receipt2 = await tx2.wait();
      console.log("Success! Funds refunded.");
    } catch (error) {
      console.log("Failed:", error.message);
      if (error.message.includes("InvalidGameStatus")) {
        console.log("As expected - markDisputed only works for Active games.");
      }
    }

    return;
  }

  // For Active or Disputed games, emergencyRefund would work
  console.log("\nCalling emergencyRefund...");
  try {
    const tx = await escrow.emergencyRefund(GAME_ID);
    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    console.log("\n✅ SUCCESS! Funds have been refunded.");
  } catch (error) {
    console.error("Failed:", error.message);
  }
}

main().catch(console.error);
