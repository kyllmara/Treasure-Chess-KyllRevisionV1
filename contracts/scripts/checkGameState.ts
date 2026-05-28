import { ethers } from "hardhat";

// Enum values from contract
const GameStatus = ["None", "WaitingForOpponent", "Active", "Completed", "Cancelled", "Disputed"];
const GameResult = ["None", "Player1Wins", "Player2Wins", "Draw"];

async function main() {
  const escrowAddress = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const escrow = await ethers.getContractAt("TreasureChessEscrow", escrowAddress);

  // We need to find the gameId - let's check recent events
  const filter = escrow.filters.GameCreated();
  const events = await escrow.queryFilter(filter);

  console.log(`Found ${events.length} GameCreated events\n`);

  for (const event of events) {
    const args = event.args;
    if (!args) continue;

    const gameId = args.gameId;
    console.log("Game ID:", gameId);
    console.log("Player 1:", args.player1);
    console.log("Wager:", ethers.formatUnits(args.wagerAmount, 6), "USDC");

    // Get full game state
    const game = await escrow.getGame(gameId);
    console.log("\nGame State:");
    console.log("  Status:", GameStatus[Number(game.status)]);
    console.log("  Result:", GameResult[Number(game.result)]);
    console.log("  Player 1:", game.player1);
    console.log("  Player 2:", game.player2);
    console.log("  Wager Amount:", ethers.formatUnits(game.wagerAmount, 6), "USDC");
    console.log("  Total Pot:", ethers.formatUnits(game.totalPot, 6), "USDC");
    console.log("  Created At:", new Date(Number(game.createdAt) * 1000).toISOString());
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
