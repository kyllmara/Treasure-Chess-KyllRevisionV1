const { ethers } = require("hardhat");

async function main() {
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";

  // The full transaction data from the LATEST error (version 10, 20:13:12)
  const txData = "0xdf905caf000000000000000000000000000000000000000000000000000000000000002000000000000000000000000064d9194326f90c0af744beb2e6e42a8181a8ea440000000000000000000000006e24927efa2b4db5654331fb20312c9f5971250100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055730000000000000000000000000000000000000000000000000000000006973d78200000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e49e3419392e8d6d56ce0c61ed62ae2195e8b64f9bad1c75fc80b91f507d34ff8e591a33750000000000000000000000000000000000000000000000000000000000061a800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006973d781000000000000000000000000000000000000000000000000000000000000001c38a911be8a1e6863cc265cc0cab40f220c0fae35def704498c2d3b3d1e8d77bf6f58af018bda07f08e356f440490896af74e7a19f73791dc2f5989d9707bfd330000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000417a79519def27712e5c4610fe876abae16197e971f4d69502387da04d5123c24b7fc8dc355d9dfa963d59865cfae7868fdfedcf29b4230393536fbebbd4c66d301b00000000000000000000000000000000000000000000000000000000000000";

  // Decode the execute call
  const forwarderInterface = new ethers.Interface([
    "function execute((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) payable returns (bool)"
  ]);

  const decoded = forwarderInterface.parseTransaction({ data: txData });
  console.log("\n=== DECODED EXECUTE CALL ===");
  console.log("Function:", decoded.name);

  const request = decoded.args[0];
  console.log("\n=== FORWARD REQUEST ===");
  console.log("from:", request.from);
  console.log("to:", request.to);
  console.log("value:", request.value.toString());
  console.log("gas:", request.gas.toString());
  console.log("deadline:", request.deadline.toString());
  console.log("deadline (date):", new Date(Number(request.deadline) * 1000).toISOString());
  console.log("data length:", request.data.length);
  console.log("data:", request.data);
  console.log("signature:", request.signature);

  // Decode the inner call data (createGameWithPermit)
  const escrowInterface = new ethers.Interface([
    "function createGameWithPermit(bytes32 gameId, uint256 wagerAmount, uint256 timeoutSeconds, uint256 deadline, uint8 v, bytes32 r, bytes32 s)"
  ]);

  const innerDecoded = escrowInterface.parseTransaction({ data: request.data });
  console.log("\n=== INNER CALL (createGameWithPermit) ===");
  console.log("Function:", innerDecoded.name);
  console.log("gameId:", innerDecoded.args[0]);
  console.log("wagerAmount:", innerDecoded.args[1].toString(), "USDC units (6 decimals) =", ethers.formatUnits(innerDecoded.args[1], 6), "USDC");
  console.log("timeoutSeconds:", innerDecoded.args[2].toString());
  console.log("permit deadline:", innerDecoded.args[3].toString());
  console.log("permit v:", innerDecoded.args[4]);
  console.log("permit r:", innerDecoded.args[5]);
  console.log("permit s:", innerDecoded.args[6]);

  // Now check the signature
  console.log("\n=== SIGNATURE VERIFICATION ===");

  // Get forwarder contract
  const forwarderAbi = [
    "function verify((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) view returns (bool)",
    "function nonces(address owner) view returns (uint256)",
    "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  ];
  const forwarder = await ethers.getContractAt(forwarderAbi, forwarderAddress);

  // Get the nonce for the user
  const userNonce = await forwarder.nonces(request.from);
  console.log("Current nonce for user:", userNonce.toString());

  // Get domain
  const domain = await forwarder.eip712Domain();
  console.log("\nEIP-712 Domain:");
  console.log("  name:", domain[1]);
  console.log("  version:", domain[2]);
  console.log("  chainId:", domain[3].toString());
  console.log("  verifyingContract:", domain[4]);

  // Try to verify - need to convert to a plain object
  const requestObj = {
    from: request.from,
    to: request.to,
    value: request.value,
    gas: request.gas,
    deadline: request.deadline,
    data: request.data,
    signature: request.signature
  };
  const isValid = await forwarder.verify(requestObj);
  console.log("\nForwarder.verify() result:", isValid);

  // Manually recover the signer
  console.log("\n=== MANUAL SIGNATURE RECOVERY ===");

  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)")
  );
  console.log("TypeHash:", typeHash);

  const dataHash = ethers.keccak256(request.data);
  console.log("Data hash:", dataHash);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  // Try with current nonce (0)
  console.log("\n--- Trying with nonce =", userNonce.toString(), "---");
  const structHash0 = ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256", "uint48", "bytes32"],
      [typeHash, request.from, request.to, request.value, request.gas, userNonce, request.deadline, dataHash]
    )
  );
  console.log("Struct hash:", structHash0);

  const domainSeparator = ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        ethers.keccak256(ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
        ethers.keccak256(ethers.toUtf8Bytes(domain[1])),
        ethers.keccak256(ethers.toUtf8Bytes(domain[2])),
        domain[3],
        domain[4],
      ]
    )
  );
  console.log("Domain separator:", domainSeparator);

  const digest0 = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes("\x19\x01"),
      domainSeparator,
      structHash0
    ])
  );
  console.log("Digest:", digest0);

  try {
    const recovered0 = ethers.recoverAddress(digest0, request.signature);
    console.log("Recovered signer:", recovered0);
    console.log("Expected from:", request.from);
    console.log("Match:", recovered0.toLowerCase() === request.from.toLowerCase());
  } catch (e) {
    console.log("Recovery failed:", e.message);
  }

  // Also try with nonce = 1 in case there was a timing issue
  console.log("\n--- Trying with nonce = 1 ---");
  const structHash1 = ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256", "uint48", "bytes32"],
      [typeHash, request.from, request.to, request.value, request.gas, 1, request.deadline, dataHash]
    )
  );
  const digest1 = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes("\x19\x01"),
      domainSeparator,
      structHash1
    ])
  );
  try {
    const recovered1 = ethers.recoverAddress(digest1, request.signature);
    console.log("Recovered signer:", recovered1);
    console.log("Match:", recovered1.toLowerCase() === request.from.toLowerCase());
  } catch (e) {
    console.log("Recovery failed:", e.message);
  }

  // Check if escrow trusts forwarder
  console.log("\n=== ESCROW TRUST CHECK ===");
  const escrowAbi = ["function isTrustedForwarder(address) view returns (bool)"];
  const escrow = await ethers.getContractAt(escrowAbi, request.to);
  const trustsForwarder = await escrow.isTrustedForwarder(forwarderAddress);
  console.log("Escrow trusts forwarder:", trustsForwarder);
}

main().catch(console.error);
