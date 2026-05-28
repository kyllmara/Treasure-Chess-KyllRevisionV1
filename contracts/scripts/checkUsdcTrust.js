const { ethers } = require("hardhat");

async function main() {
  const usdcAddress = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  
  // Try to check if USDC implements isTrustedForwarder
  const abi = ["function isTrustedForwarder(address forwarder) view returns (bool)"];
  
  try {
    const usdc = await ethers.getContractAt(abi, usdcAddress);
    const isTrusted = await usdc.isTrustedForwarder(forwarderAddress);
    console.log("USDC address:", usdcAddress);
    console.log("Forwarder address:", forwarderAddress);
    console.log("Is forwarder trusted by USDC?", isTrusted);
  } catch (e) {
    console.log("USDC address:", usdcAddress);
    console.log("USDC does NOT implement isTrustedForwarder - it's likely a standard ERC20");
    console.log("Error:", e.message.substring(0, 100));
  }
}

main().catch(console.error);
