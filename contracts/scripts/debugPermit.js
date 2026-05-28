const { ethers } = require("hardhat");

async function main() {
  // From the decoded request
  const userAddress = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";
  const escrowAddress = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
  const usdcAddress = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

  // Permit details from the createGameWithPermit call
  const wagerAmount = 400000n; // 0.4 USDC
  const permitDeadline = 1769198674n;
  const permitV = 28;
  const permitR = "0x48dbb5d5fc66928d782ff6660e45fe4d4004aec91cba574b4b32485aee50302a";
  const permitS = "0x559fbcf4beb79825c1a28c7e23018301c7ef9a5757c76c7414b8614686e35062";

  console.log("=== PERMIT DEBUG ===");
  console.log("User:", userAddress);
  console.log("Escrow (spender):", escrowAddress);
  console.log("USDC:", usdcAddress);
  console.log("Amount:", wagerAmount.toString());
  console.log("Permit deadline:", permitDeadline.toString());
  console.log("Current timestamp:", Math.floor(Date.now() / 1000));
  console.log("Deadline passed?", Math.floor(Date.now() / 1000) > Number(permitDeadline));

  // Get USDC contract
  const usdcAbi = [
    "function name() view returns (string)",
    "function version() view returns (string)",
    "function nonces(address owner) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)"
  ];

  const usdc = await ethers.getContractAt(usdcAbi, usdcAddress);

  // Get user's USDC balance and current allowance
  const balance = await usdc.balanceOf(userAddress);
  console.log("\nUser USDC balance:", ethers.formatUnits(balance, 6), "USDC");
  console.log("Has enough?", balance >= wagerAmount);

  const currentAllowance = await usdc.allowance(userAddress, escrowAddress);
  console.log("Current allowance to escrow:", ethers.formatUnits(currentAllowance, 6), "USDC");

  // Get USDC domain info
  const name = await usdc.name();
  let version;
  try {
    version = await usdc.version();
  } catch (e) {
    version = "2"; // Default
  }
  console.log("\nUSCD name:", name);
  console.log("USDC version:", version);

  // Get nonce
  const nonce = await usdc.nonces(userAddress);
  console.log("User nonce in USDC:", nonce.toString());

  // Verify the permit signature manually
  console.log("\n=== PERMIT SIGNATURE VERIFICATION ===");

  const CHAIN_ID = 80002; // Amoy

  const domain = {
    name: name,
    version: version,
    chainId: CHAIN_ID,
    verifyingContract: usdcAddress,
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  // Compute EIP-712 digest for the permit
  const permitTypeHash = ethers.keccak256(
    ethers.toUtf8Bytes("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
  );
  console.log("Permit typehash:", permitTypeHash);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  const structHash = ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
      [permitTypeHash, userAddress, escrowAddress, wagerAmount, nonce, permitDeadline]
    )
  );
  console.log("Permit struct hash:", structHash);

  // Get domain separator from contract
  let domainSeparator;
  try {
    domainSeparator = await usdc.DOMAIN_SEPARATOR();
    console.log("Domain separator from contract:", domainSeparator);
  } catch (e) {
    // Compute it ourselves
    const domainTypeHash = ethers.keccak256(
      ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    );
    domainSeparator = ethers.keccak256(
      abiCoder.encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [
          domainTypeHash,
          ethers.keccak256(ethers.toUtf8Bytes(name)),
          ethers.keccak256(ethers.toUtf8Bytes(version)),
          CHAIN_ID,
          usdcAddress,
        ]
      )
    );
    console.log("Computed domain separator:", domainSeparator);
  }

  const permitDigest = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes("\x19\x01"),
      domainSeparator,
      structHash
    ])
  );
  console.log("Permit digest:", permitDigest);

  // Reconstruct signature
  const signature = ethers.Signature.from({
    v: permitV,
    r: permitR,
    s: permitS
  });
  const serializedSig = signature.serialized;
  console.log("Signature (serialized):", serializedSig);

  // Recover signer
  const recoveredSigner = ethers.recoverAddress(permitDigest, serializedSig);
  console.log("\nExpected signer:", userAddress);
  console.log("Recovered signer:", recoveredSigner);
  console.log("Match:", recoveredSigner.toLowerCase() === userAddress.toLowerCase());

  // Try calling permit directly to see the error
  console.log("\n=== SIMULATING PERMIT CALL ===");
  try {
    // Estimate gas for permit
    const gasEstimate = await usdc.permit.estimateGas(
      userAddress,
      escrowAddress,
      wagerAmount,
      permitDeadline,
      permitV,
      permitR,
      permitS
    );
    console.log("Permit gas estimate:", gasEstimate.toString());
    console.log("Permit should succeed!");
  } catch (e) {
    console.log("Permit would FAIL:", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }
}

main().catch(console.error);
