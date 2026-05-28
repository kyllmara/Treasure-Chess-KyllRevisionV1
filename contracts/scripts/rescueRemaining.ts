import { ethers } from "hardhat";

async function main() {
  const ESCROW_V2 = "0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc";
  const USER_WALLET = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";
  
  // Games still in WaitingForOpponent (0.4 USDC each)
  const GAMES_TO_RESCUE = [
    "0x3453451a4de58e3c11b40ed1e93d3b2467f2f8f9e0f9a5e8d7c6b5a4f3e2d1c0",
    "0xe3b8db2a7d3536dd2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9",
  ];

  console.log("Rescuing remaining 0.8 USDC from V2...\n");
  
  const escrow = await ethers.getContractAt("TreasureChessEscrowV2", ESCROW_V2);
  
  // Get actual game IDs from the scan
  const provider = ethers.provider;
  const GAME_CREATED_TOPIC = ethers.id("GameCreated(bytes32,address,uint256,uint256)");
  const currentBlock = await provider.getBlockNumber();
  
  const logs = await provider.getLogs({
    address: ESCROW_V2,
    topics: [GAME_CREATED_TOPIC],
    fromBlock: currentBlock - 50000,
    toBlock: currentBlock
  });
  
  const iface = new ethers.Interface([
    "event GameCreated(bytes32 indexed gameId, address indexed player1, uint256 wagerAmount, uint256 timeoutSeconds)"
  ]);
  
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    const gameId = parsed!.args.gameId;
    const game = await escrow.getGame(gameId);
    
    if (game.status === 1n) { // WaitingForOpponent
      console.log("Rescuing game:", gameId.slice(0, 30) + "...");
      console.log("  Wager:", ethers.formatUnits(game.wagerAmount, 6), "USDC");
      
      const tx = await escrow.rescueGameFunds(gameId, USER_WALLET);
      await tx.wait();
      console.log("  SUCCESS! Tx:", tx.hash);
      console.log();
    }
  }
  
  console.log("Done!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
