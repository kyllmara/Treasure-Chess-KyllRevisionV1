const { ethers } = require("hardhat");

async function main() {
  const usdcAddress = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  
  // Check for permit function (EIP-2612)
  const permitAbi = [
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function nonces(address owner) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function name() view returns (string)",
    "function version() view returns (string)"
  ];
  
  const usdc = await ethers.getContractAt(permitAbi, usdcAddress);
  
  try {
    const name = await usdc.name();
    console.log("USDC name:", name);
    
    const domainSeparator = await usdc.DOMAIN_SEPARATOR();
    console.log("USDC DOMAIN_SEPARATOR:", domainSeparator);
    console.log("USDC SUPPORTS PERMIT (EIP-2612)!");
    
    try {
      const version = await usdc.version();
      console.log("USDC version:", version);
    } catch (e) {
      console.log("USDC version: not available");
    }
  } catch (e) {
    console.log("USDC does NOT support permit - Error:", e.message.substring(0, 100));
  }
}

main().catch(console.error);
