const { ethers } = require("hardhat");

async function main() {
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  const abi = ["function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)"];
  const forwarder = await ethers.getContractAt(abi, forwarderAddress);
  const domain = await forwarder.eip712Domain();
  console.log("EIP-712 Domain from contract:");
  console.log("  name:", domain.name);
  console.log("  version:", domain.version);
  console.log("  chainId:", domain.chainId.toString());
  console.log("  verifyingContract:", domain.verifyingContract);
}

main().catch(console.error);
