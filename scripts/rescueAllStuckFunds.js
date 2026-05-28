/**
 * Rescue All Stuck Escrow Funds Script
 *
 * This script scans the escrow contracts for stuck games and rescues funds.
 * It handles both V1 (old) and V2 (current) escrow contracts.
 *
 * Requires BACKEND_SIGNER_PRIVATE_KEY in .env
 *
 * Usage: node scripts/rescueAllStuckFunds.js
 */

const { ethers } = require('ethers');
const path = require('path');

// Try loading from multiple .env locations
require('dotenv').config(); // Root .env
require('dotenv').config({ path: path.join(__dirname, '../contracts/.env') }); // contracts/.env

// Configuration
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";
// Try multiple env var names for the private key
const PLATFORM_PRIVATE_KEY = process.env.BACKEND_SIGNER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

// Contract Addresses
const ESCROW_V1 = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501"; // Old escrow
const ESCROW_V2 = "0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc"; // Current escrow
const USDC_CONTRACT = "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582";

// Refund Recipients
const REFUND_TARGETS = {
  "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44": 3, // Expected $3 refund
  "0xD578a74591eb4FdD8e637255403A91c243B8e5Fa": 2, // Expected $2 refund
};

// ABIs
const ESCROW_ABI = [
  "function owner() view returns (address)",
  "function rescueGameFunds(bytes32 gameId, address recipient)",
  "function emergencyRefund(bytes32 gameId)",
  "function cancelGame(bytes32 gameId)",
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))",
  "event GameCreated(bytes32 indexed gameId, address indexed player1, uint256 wagerAmount, uint256 timeoutSeconds)"
];

const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function scanEscrowForStuckGames(provider, escrowAddress, escrow, decimals) {
  console.log(`\nScanning ${escrowAddress} for stuck games...`);

  const GAME_CREATED_TOPIC = ethers.id("GameCreated(bytes32,address,uint256,uint256)");
  const currentBlock = await provider.getBlockNumber();

  // Scan last 100k blocks
  const fromBlock = Math.max(0, currentBlock - 100000);

  console.log(`  Scanning blocks ${fromBlock} to ${currentBlock}...`);

  const logs = await provider.getLogs({
    address: escrowAddress,
    topics: [GAME_CREATED_TOPIC],
    fromBlock,
    toBlock: currentBlock
  });

  console.log(`  Found ${logs.length} GameCreated events`);

  const iface = new ethers.Interface([
    "event GameCreated(bytes32 indexed gameId, address indexed player1, uint256 wagerAmount, uint256 timeoutSeconds)"
  ]);

  const stuckGames = [];

  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log);
      const gameId = parsed.args.gameId;
      const player1 = parsed.args.player1;

      const game = await escrow.getGame(gameId);
      const statusNames = ["None", "WaitingForOpponent", "Active", "Completed", "Cancelled", "Disputed"];
      const status = Number(game.status);

      // Only interested in non-completed games
      if (status === 1 || status === 2 || status === 5) { // WaitingForOpponent, Active, Disputed
        stuckGames.push({
          gameId,
          player1: game.player1,
          player2: game.player2,
          wager: ethers.formatUnits(game.wagerAmount, decimals),
          wagerRaw: game.wagerAmount,
          status: statusNames[status],
          statusCode: status
        });
      }
    } catch (e) {
      // Skip errors for individual games
    }
  }

  return stuckGames;
}

async function main() {
  if (!PLATFORM_PRIVATE_KEY) {
    console.error("ERROR: Missing BACKEND_SIGNER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("RESCUE ALL STUCK ESCROW FUNDS");
  console.log("=".repeat(60));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const platformWallet = new ethers.Wallet(PLATFORM_PRIVATE_KEY, provider);
  const usdc = new ethers.Contract(USDC_CONTRACT, USDC_ABI, provider);
  const decimals = await usdc.decimals();

  console.log("\nPlatform Wallet:", platformWallet.address);
  console.log("USDC Decimals:", decimals);

  // Check both escrow contracts
  const escrows = [
    { name: "V1 (Old)", address: ESCROW_V1 },
    { name: "V2 (Current)", address: ESCROW_V2 },
  ];

  const allStuckGames = [];

  for (const escrowInfo of escrows) {
    console.log("\n" + "=".repeat(60));
    console.log(`ESCROW ${escrowInfo.name}: ${escrowInfo.address}`);
    console.log("=".repeat(60));

    const escrow = new ethers.Contract(escrowInfo.address, ESCROW_ABI, platformWallet);

    // Check if we're the owner
    try {
      const owner = await escrow.owner();
      const isOwner = owner.toLowerCase() === platformWallet.address.toLowerCase();
      console.log("Owner:", owner);
      console.log("Are we owner?", isOwner);

      if (!isOwner) {
        console.log("⚠️  We are not the owner - cannot rescue funds from this contract");
        continue;
      }
    } catch (e) {
      console.log("Error checking owner:", e.message);
      continue;
    }

    // Check escrow USDC balance
    const escrowBalance = await usdc.balanceOf(escrowInfo.address);
    console.log("Escrow USDC Balance:", ethers.formatUnits(escrowBalance, decimals), "USDC");

    if (escrowBalance === 0n) {
      console.log("No USDC in this escrow - skipping scan");
      continue;
    }

    // Scan for stuck games
    const stuckGames = await scanEscrowForStuckGames(provider, escrowInfo.address, escrow, decimals);

    if (stuckGames.length === 0) {
      console.log("No stuck games found");
      continue;
    }

    console.log(`\nFound ${stuckGames.length} stuck game(s):`);
    console.log("-".repeat(60));

    for (const game of stuckGames) {
      console.log(`Game: ${game.gameId.slice(0, 20)}...`);
      console.log(`  Status: ${game.status}`);
      console.log(`  Player1: ${game.player1}`);
      console.log(`  Player2: ${game.player2 || "None"}`);
      console.log(`  Wager: ${game.wager} USDC`);

      allStuckGames.push({
        ...game,
        escrowAddress: escrowInfo.address,
        escrowName: escrowInfo.name,
        escrow
      });
    }
  }

  if (allStuckGames.length === 0) {
    console.log("\n✅ No stuck games found in any escrow!");
    return;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("RESCUE SUMMARY");
  console.log("=".repeat(60));

  let totalToRescue = 0n;
  for (const game of allStuckGames) {
    totalToRescue += game.wagerRaw;
    if (game.statusCode === 2) { // Active games have 2 wagers
      totalToRescue += game.wagerRaw;
    }
  }
  console.log(`Total games to rescue: ${allStuckGames.length}`);
  console.log(`Total USDC to rescue: ~${ethers.formatUnits(totalToRescue, decimals)} USDC`);

  // Confirmation
  console.log("\n⚠️  ABOUT TO RESCUE FUNDS");
  console.log("Press Ctrl+C to cancel, or wait 5 seconds to proceed...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Execute rescues
  console.log("\nExecuting rescues...\n");

  for (let i = 0; i < allStuckGames.length; i++) {
    const game = allStuckGames[i];
    console.log(`[${i + 1}/${allStuckGames.length}] Rescuing game from ${game.escrowName}...`);
    console.log(`  Game ID: ${game.gameId.slice(0, 30)}...`);
    console.log(`  Status: ${game.status}`);
    console.log(`  Player1: ${game.player1}`);
    console.log(`  Wager: ${game.wager} USDC`);

    try {
      if (game.statusCode === 1) {
        // WaitingForOpponent - use rescueGameFunds to send to player1
        console.log(`  Calling rescueGameFunds -> ${game.player1}`);
        const tx = await game.escrow.rescueGameFunds(game.gameId, game.player1);
        console.log(`  Tx Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
      } else if (game.statusCode === 2 || game.statusCode === 5) {
        // Active or Disputed - use emergencyRefund (refunds both players)
        console.log(`  Calling emergencyRefund (refunds both players)`);
        const tx = await game.escrow.emergencyRefund(game.gameId);
        console.log(`  Tx Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
      }
    } catch (error) {
      console.log(`  ❌ FAILED: ${error.message}`);
    }
    console.log();
  }

  // Final summary
  console.log("=".repeat(60));
  console.log("RESCUE COMPLETE");
  console.log("=".repeat(60));

  // Check final balances
  for (const escrowInfo of escrows) {
    const balance = await usdc.balanceOf(escrowInfo.address);
    console.log(`${escrowInfo.name} remaining balance: ${ethers.formatUnits(balance, decimals)} USDC`);
  }
}

main().catch(error => {
  console.error("Script failed:", error);
  process.exit(1);
});
