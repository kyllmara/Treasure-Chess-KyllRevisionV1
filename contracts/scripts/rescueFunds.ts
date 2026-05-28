import { ethers } from "hardhat";

async function main() {
  const ESCROW_V2 = "0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc";
  const USER_WALLET = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";
  
  // Games to rescue (status: Created/WaitingForOpponent)
  const GAMES_TO_RESCUE = [
    "0xbb602ffcdf50a67807b803842521d1773325599375d24a0adad8ba1ca85ca5d2",
    "0x745ed69a5fb33809fdf42b876ae3098f0196355821b143bdb07a47c8a0171190",
  ];

  console.log("Rescuing funds from V2 Escrow...\n");
  
  const escrow = await ethers.getContractAt("TreasureChessEscrowV2", ESCROW_V2);
  
  for (const gameId of GAMES_TO_RESCUE) {
    console.log("Rescuing game:", gameId.slice(0, 30) + "...");
    
    // Check game status first
    const game = await escrow.getGame(gameId);
    console.log("  Status:", game.status);
    console.log("  Player1:", game.player1);
    console.log("  Wager:", ethers.formatUnits(game.wagerAmount, 6), "USDC");
    
    if (game.status === 1n) { // WaitingForOpponent = 1
      console.log("  Calling rescueGameFunds...");
      const tx = await escrow.rescueGameFunds(gameId, USER_WALLET);
      await tx.wait();
      console.log("  SUCCESS! Tx:", tx.hash);
    } else {
      console.log("  SKIPPED - Not in WaitingForOpponent status");
    }
    console.log();
  }
  
  console.log("Done!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
