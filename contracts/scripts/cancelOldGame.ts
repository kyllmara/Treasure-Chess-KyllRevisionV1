/**
 * Cancel a game on the OLD escrow contract to recover stuck funds.
 *
 * This script needs to be run as the player1 (0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44).
 * Since that wallet is a Magic Link wallet, we need to either:
 *
 * 1. Export the private key from Magic (not recommended)
 * 2. Use the app's cancel flow (recommended)
 * 3. Call cancelGame via a custom relay call
 *
 * This script demonstrates option 3 - making a direct call via the relay.
 */

import { ethers } from "hardhat";

const OLD_ESCROW = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
const GAME_ID = "0x545be8e4ce11228e56afb2d800943d3b9e56ca9f784206082b4d5ea24a213ca0";
const PLAYER1 = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";
const FORWARDER = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";

async function main() {
  console.log("=".repeat(60));
  console.log("CANCEL GAME ON OLD ESCROW");
  console.log("=".repeat(60));
  console.log("");
  console.log("Old Escrow:", OLD_ESCROW);
  console.log("Game ID:", GAME_ID);
  console.log("Player 1:", PLAYER1);
  console.log("");

  // Check game status
  const escrow = await ethers.getContractAt("TreasureChessEscrow", OLD_ESCROW);
  const game = await escrow.getGame(GAME_ID);
  const status = ["None", "WaitingForOpponent", "Active", "Completed", "Cancelled", "Disputed"][Number(game.status)];

  console.log("Game Status:", status);
  console.log("Wager:", ethers.formatUnits(game.wagerAmount, 6), "USDC");
  console.log("");

  if (Number(game.status) !== 1) {
    console.log("Game is not in WaitingForOpponent status - cannot cancel");
    return;
  }

  // Check if forwarder is trusted
  const isTrusted = await escrow.isTrustedForwarder(FORWARDER);
  console.log("Forwarder is trusted:", isTrusted);

  if (!isTrusted) {
    console.log("ERROR: Forwarder is not trusted by old escrow!");
    console.log("The game can only be cancelled by player1 signing directly.");
    return;
  }

  console.log("");
  console.log("To cancel this game, you have these options:");
  console.log("");
  console.log("OPTION 1: From the App");
  console.log("  1. Open the Treasure Chess app");
  console.log("  2. Make sure you're logged in with the Magic Link wallet");
  console.log("  3. Navigate to your created challenges");
  console.log("  4. Find the challenge with this game and click Cancel");
  console.log("");
  console.log("OPTION 2: Manual Transaction (if you have the private key)");
  console.log("  Send a transaction to", OLD_ESCROW);
  console.log("  Calling: cancelGame(", GAME_ID, ")");
  console.log("");
  console.log("OPTION 3: Use the relay SDK programmatically");
  console.log("  Call relaySDK.cancelGame(gameId) with the old escrow as target");
  console.log("");

  // Encode the cancelGame call for reference
  const iface = new ethers.Interface(["function cancelGame(bytes32 gameId)"]);
  const data = iface.encodeFunctionData("cancelGame", [GAME_ID]);
  console.log("Encoded calldata:", data);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
