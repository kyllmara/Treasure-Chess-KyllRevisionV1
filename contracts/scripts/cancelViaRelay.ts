/**
 * Script to cancel a game via the relay system
 *
 * Since the user (player1) owns the game in WaitingForOpponent status,
 * they can cancel it. We use the relay endpoint to execute this gaslessly.
 *
 * Usage: Call this from the app or via cURL with proper auth
 */

import { ethers } from "hardhat";

// Game details
const GAME_ID = "0x545be8e4ce11228e56afb2d800943d3b9e56ca9f784206082b4d5ea24a213ca0";
const ESCROW_ADDRESS = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
const FORWARDER_ADDRESS = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
const USER_WALLET = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";

async function main() {
  console.log("=".repeat(60));
  console.log("CANCEL GAME VIA RELAY");
  console.log("=".repeat(60));
  console.log("Game ID:", GAME_ID);
  console.log("User wallet:", USER_WALLET);
  console.log("Escrow:", ESCROW_ADDRESS);
  console.log("Forwarder:", FORWARDER_ADDRESS);
  console.log("=".repeat(60));
  console.log("");

  // The cancel must be initiated by the player from the app
  // Because the signature must come from the player's Magic Link wallet

  console.log("To cancel this game, the player needs to:");
  console.log("");
  console.log("1. Open the app and log in with their Magic Link wallet");
  console.log("2. Navigate to the challenge they created");
  console.log("3. Click 'Cancel Challenge' button");
  console.log("");
  console.log("The app will then:");
  console.log("a) Create a ForwardRequest for cancelGame(gameId)");
  console.log("b) Sign it with the player's Magic Link wallet");
  console.log("c) Send it to the relay endpoint");
  console.log("d) Platform wallet executes the cancel");
  console.log("e) Player receives their 1 USDC back");
  console.log("");

  // Alternative: If we have the player's private key, we could sign directly
  // But that's not safe to put in scripts

  console.log("=".repeat(60));
  console.log("ALTERNATIVE: Direct contract call (requires player's signature)");
  console.log("=".repeat(60));
  console.log("");
  console.log("If you want to call cancelGame directly without the relay,");
  console.log("you would need the player's wallet to sign the transaction.");
  console.log("");
  console.log("The encoded calldata for cancelGame is:");

  const escrowInterface = new ethers.Interface([
    "function cancelGame(bytes32 gameId)"
  ]);
  const cancelData = escrowInterface.encodeFunctionData("cancelGame", [GAME_ID]);
  console.log(cancelData);
  console.log("");
  console.log("The player can send this transaction to:", ESCROW_ADDRESS);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
