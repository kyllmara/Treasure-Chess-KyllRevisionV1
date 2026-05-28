import { ethers } from "hardhat";

async function main() {
  const escrowAddress = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const gameId = "0x545be8e4ce11228e56afb2d800943d3b9e56ca9f784206082b4d5ea24a213ca0";
  const userWallet = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("User wallet:", userWallet);
  console.log("Game ID:", gameId);

  const escrow = await ethers.getContractAt("TreasureChessEscrow", escrowAddress);

  // Check game state first
  const game = await escrow.getGame(gameId);
  const status = ["None", "WaitingForOpponent", "Active", "Completed", "Cancelled", "Disputed"][Number(game.status)];
  console.log("\nGame status:", status);
  console.log("Player 1:", game.player1);
  console.log("Wager:", ethers.formatUnits(game.wagerAmount, 6), "USDC");

  if (Number(game.status) !== 1) { // WaitingForOpponent = 1
    console.log("\nERROR: Game is not in WaitingForOpponent status!");
    return;
  }

  // The problem: cancelGame requires msg.sender == player1
  // But the deployer is 0xf0f60aaa... and player1 is 0x64D91943...
  // We need to either:
  // 1. Call from player1's wallet (need their private key)
  // 2. Use the relay system to call on their behalf
  // 3. Add a rescueTokens function to the contract (requires new deploy)

  console.log("\n⚠️  ISSUE: Cannot cancel directly because:");
  console.log("   - cancelGame requires msg.sender == player1");
  console.log("   - Deployer (", deployer.address, ") != Player1 (", game.player1, ")");
  console.log("\nOptions:");
  console.log("1. Player can cancel via the app (through relay)")
  console.log("2. Deploy new contract with rescueTokens function (admin can rescue stuck tokens)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
