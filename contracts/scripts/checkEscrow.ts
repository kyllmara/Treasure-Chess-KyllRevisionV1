import { ethers } from "hardhat";

async function main() {
  const escrowAddress = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const usdcAddress = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

  // Check USDC balance of escrow
  const usdc = await ethers.getContractAt("IERC20", usdcAddress);
  const escrowBalance = await usdc.balanceOf(escrowAddress);
  console.log("Escrow USDC balance:", ethers.formatUnits(escrowBalance, 6), "USDC");

  // Check who owns the escrow
  const escrow = await ethers.getContractAt("TreasureChessEscrow", escrowAddress);
  const owner = await escrow.owner();
  console.log("Escrow owner:", owner);

  // Check backend signer
  const signer = await escrow.backendSigner();
  console.log("Backend signer:", signer);

  // Check total games created
  const totalGames = await escrow.totalGamesCreated();
  console.log("Total games created:", totalGames.toString());

  // Check the deployer/signer
  const [deployer] = await ethers.getSigners();
  console.log("\nYour wallet:", deployer.address);
  console.log("Is owner?", deployer.address.toLowerCase() === owner.toLowerCase());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
