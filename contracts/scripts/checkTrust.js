const { ethers } = require("hardhat");

async function main() {
  const escrowAddress = "0x5079eCdcB90c949d9488212bE14C5b7833458BAc";
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  
  const abi = ["function isTrustedForwarder(address forwarder) view returns (bool)"];
  const escrow = await ethers.getContractAt(abi, escrowAddress);
  
  const isTrusted = await escrow.isTrustedForwarder(forwarderAddress);
  console.log("Escrow address:", escrowAddress);
  console.log("Forwarder address:", forwarderAddress);
  console.log("Is forwarder trusted by escrow?", isTrusted);
}

main().catch(console.error);
