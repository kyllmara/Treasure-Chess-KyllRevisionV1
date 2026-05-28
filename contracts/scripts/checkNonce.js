const { ethers } = require("hardhat");

async function main() {
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  const userAddress = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";

  const forwarderAbi = [
    "function nonces(address owner) view returns (uint256)",
  ];

  const forwarder = await ethers.getContractAt(forwarderAbi, forwarderAddress);

  const nonce = await forwarder.nonces(userAddress);
  console.log(`Current nonce for ${userAddress}: ${nonce.toString()}`);
}

main().catch(console.error);
