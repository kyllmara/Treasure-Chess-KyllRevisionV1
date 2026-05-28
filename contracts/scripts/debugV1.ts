import { ethers } from "hardhat";

async function main() {
  const ESCROW_V1 = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const USER_WALLET = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";
  const GAME_ID = "0x545be8e4ce11228e56afb2d800943d3b9e56ca9f784206082b4d5ea24a213ca0";

  const [signer] = await ethers.getSigners();
  
  // Get the actual deployed bytecode to check if rescueGameFunds exists
  const provider = ethers.provider;
  const code = await provider.getCode(ESCROW_V1);
  console.log("Contract code length:", code.length / 2 - 1, "bytes");
  
  // Check the function selector for rescueGameFunds(bytes32,address)
  const selector = ethers.id("rescueGameFunds(bytes32,address)").slice(0, 10);
  console.log("rescueGameFunds selector:", selector);
  
  // Try to call via low-level
  const iface = new ethers.Interface([
    "function rescueGameFunds(bytes32 gameId, address recipient)",
    "error InvalidGameStatus()",
    "error InvalidAddress()",
  ]);
  
  const data = iface.encodeFunctionData("rescueGameFunds", [GAME_ID, USER_WALLET]);
  console.log("Calldata:", data);
  
  // Simulate the call
  try {
    const result = await signer.call({
      to: ESCROW_V1,
      data: data,
    });
    console.log("Call result:", result);
  } catch (e: any) {
    console.log("Call failed:", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
      try {
        const decoded = iface.parseError(e.data);
        console.log("Decoded error:", decoded);
      } catch {}
    }
  }
}

main().catch(console.error);
