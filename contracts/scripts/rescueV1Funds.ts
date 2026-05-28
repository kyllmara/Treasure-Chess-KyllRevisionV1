import { ethers } from "hardhat";

async function main() {
  const ESCROW_V1 = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const USER_WALLET = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";
  const GAME_ID = "0x545be8e4ce11228e56afb2d800943d3b9e56ca9f784206082b4d5ea24a213ca0";

  console.log("Rescuing funds from V1 Escrow...\n");
  
  // Use V1 ABI (without moveNonce in Game struct)
  const V1_ABI = [
    "function owner() view returns (address)",
    "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds))",
    "function rescueGameFunds(bytes32 gameId, address recipient) external",
  ];
  
  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);
  
  const escrow = new ethers.Contract(ESCROW_V1, V1_ABI, signer);
  
  const owner = await escrow.owner();
  console.log("V1 Escrow owner:", owner);
  console.log("Owner matches signer:", owner.toLowerCase() === signer.address.toLowerCase());
  
  // Check game status first
  const game = await escrow.getGame(GAME_ID);
  console.log("\nGame ID:", GAME_ID.slice(0, 30) + "...");
  console.log("  Status:", game.status, "(1 = WaitingForOpponent)");
  console.log("  Player1:", game.player1);
  console.log("  Wager:", ethers.formatUnits(game.wagerAmount, 6), "USDC");
  
  if (game.status === 1n) { // WaitingForOpponent = 1
    console.log("\n  Calling rescueGameFunds...");
    const tx = await escrow.rescueGameFunds(GAME_ID, USER_WALLET);
    console.log("  Tx sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("  SUCCESS! Block:", receipt.blockNumber);
  } else {
    console.log("  SKIPPED - Not in WaitingForOpponent status");
  }
  
  console.log("\nDone!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
