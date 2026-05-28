const { ethers } = require("hardhat");

async function main() {
  const escrowAddress = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  
  // Check if escrow trusts forwarder
  const escrowAbi = [
    "function isTrustedForwarder(address forwarder) view returns (bool)",
    "function usdc() view returns (address)"
  ];
  
  const escrow = await ethers.getContractAt(escrowAbi, escrowAddress);
  
  const isTrusted = await escrow.isTrustedForwarder(forwarderAddress);
  console.log("Escrow address:", escrowAddress);
  console.log("Forwarder address:", forwarderAddress);
  console.log("Is forwarder trusted by NEW escrow?", isTrusted);
  
  const usdcAddr = await escrow.usdc();
  console.log("USDC address in escrow:", usdcAddr);
  
  // Get function selectors
  const escrowInterface = new ethers.Interface([
    "function createGameWithPermit(bytes32 gameId, uint256 wagerAmount, uint256 timeoutSeconds, uint256 deadline, uint8 v, bytes32 r, bytes32 s)"
  ]);
  const selector = escrowInterface.getFunction("createGameWithPermit").selector;
  console.log("createGameWithPermit selector:", selector);
}

main().catch(console.error);
