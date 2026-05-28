const { ethers } = require("hardhat");

async function main() {
  const errorSelector = "0xd6bda275";
  
  // Common error selectors from ERC2771Forwarder
  const errors = {
    "0xd6bda275": "ERC2771ForwarderInvalidSigner(address signer, address from)",
    "0x4c86f0f3": "ERC2771ForwarderMismatchedValue(uint256 requestedValue, uint256 msgValue)",
    "0x5fb51c56": "ERC2771ForwarderExpiredRequest(uint48 deadline)",
    "0xf5c5fca0": "ERC2771UntrustfulTarget(address target, address forwarder)",
  };

  if (errors[errorSelector]) {
    console.log("Error:", errors[errorSelector]);
  } else {
    console.log("Unknown error selector:", errorSelector);
  }
}

main().catch(console.error);
