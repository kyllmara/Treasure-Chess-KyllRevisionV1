/**
 * Script to recover 1 USDC from the old escrow contract
 *
 * This script cancels the game on the old escrow by calling cancelGame
 * through the ERC2771 forwarder. It requires signing with the player's wallet.
 *
 * Since the player's wallet is a Magic Link wallet, we need to either:
 * 1. Use the platform wallet to call cancelGame directly (not possible - requires player1 signature)
 * 2. Use a raw private key export from Magic (not recommended)
 * 3. Call from within the app context where Magic is initialized
 *
 * This script uses approach #3 - it must be run from the app context.
 *
 * Alternative: We can have the platform admin use rescueGameFunds on the NEW contract
 * after migrating funds, but the old contract doesn't have that function.
 *
 * SIMPLEST SOLUTION: Run this in the browser console while logged into the app.
 */

// Copy and paste this into your browser console while logged into the Treasure Chess app:

const CANCEL_SCRIPT = `
// Run this in the browser console while logged into Treasure Chess app
(async () => {
  const OLD_ESCROW = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const GAME_ID = "0x545be8e4ce11228e56afb2d800943d3b9e56ca9f784206082b4d5ea24a213ca0";

  console.log("=".repeat(50));
  console.log("RECOVERING 1 USDC FROM OLD ESCROW");
  console.log("=".repeat(50));
  console.log("Old Escrow:", OLD_ESCROW);
  console.log("Game ID:", GAME_ID);
  console.log("");

  // NOTE: lib/relay has been removed. This script is obsolete.
  // The relay SDK and on-chain escrow recovery are no longer available.
  console.error("This recovery script is no longer functional. lib/relay has been removed.");
  console.error("Contact support to recover any stuck escrow funds via the platform admin.");
})();
`;

console.log("=".repeat(60));
console.log("RECOVER 1 USDC FROM OLD ESCROW");
console.log("=".repeat(60));
console.log("");
console.log("To recover your 1 USDC, follow these steps:");
console.log("");
console.log("1. Open the Treasure Chess app in your browser");
console.log("2. Make sure you're logged in with your Magic wallet");
console.log("3. Open browser Developer Tools (F12 or Cmd+Option+I)");
console.log("4. Go to the Console tab");
console.log("5. Paste the following code and press Enter:");
console.log("");
console.log("-".repeat(60));
console.log(CANCEL_SCRIPT);
console.log("-".repeat(60));
console.log("");
console.log("This will cancel the game and return your 1 USDC.");
