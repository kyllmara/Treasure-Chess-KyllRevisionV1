const { ethers } = require("hardhat");

async function main() {
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  const escrowAddress = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";

  // Get the forwarder contract
  const forwarderAbi = [
    "function verify((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) view returns (bool)",
    "function nonces(address owner) view returns (uint256)",
    "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  ];

  const forwarder = await ethers.getContractAt(forwarderAbi, forwarderAddress);

  // Get the EIP-712 domain from the forwarder
  const domainResult = await forwarder.eip712Domain();
  console.log("\n=== FORWARDER EIP-712 DOMAIN ===");
  console.log("Name:", domainResult[1]);
  console.log("Version:", domainResult[2]);
  console.log("ChainId:", domainResult[3].toString());
  console.log("VerifyingContract:", domainResult[4]);

  // Test signer (use a local key for testing)
  const testPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Default hardhat key #0
  const testSigner = new ethers.Wallet(testPrivateKey);
  console.log("\n=== TEST SIGNER ===");
  console.log("Address:", testSigner.address);

  // Get the nonce for this signer
  const nonce = await forwarder.nonces(testSigner.address);
  console.log("Forwarder nonce:", nonce.toString());

  // Build a test forward request
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

  // Encode a simple createGame call
  const escrowInterface = new ethers.Interface([
    "function createGameWithPermit(bytes32 gameId, uint256 wagerAmount, uint256 timeoutSeconds, uint256 deadline, uint8 v, bytes32 r, bytes32 s)"
  ]);

  const gameId = ethers.keccak256(ethers.toUtf8Bytes("test-game-id"));
  const wagerAmount = ethers.parseUnits("1", 6); // 1 USDC
  const timeoutSeconds = 0;
  const permitDeadline = deadline;
  const permitV = 27;
  const permitR = ethers.ZeroHash;
  const permitS = ethers.ZeroHash;

  const callData = escrowInterface.encodeFunctionData("createGameWithPermit", [
    gameId, wagerAmount, timeoutSeconds, permitDeadline, permitV, permitR, permitS
  ]);

  console.log("\n=== FORWARD REQUEST ===");
  console.log("From:", testSigner.address);
  console.log("To:", escrowAddress);
  console.log("Value:", "0");
  console.log("Gas:", "350000");
  console.log("Nonce:", nonce.toString());
  console.log("Deadline:", deadline);
  console.log("Data length:", callData.length);
  console.log("Data prefix:", callData.substring(0, 66));

  // Build the EIP-712 typed data
  const domain = {
    name: domainResult[1],
    version: domainResult[2],
    chainId: Number(domainResult[3]),
    verifyingContract: domainResult[4],
  };

  const types = {
    ForwardRequest: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "gas", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint48" },
      { name: "data", type: "bytes" },
    ],
  };

  const message = {
    from: testSigner.address,
    to: escrowAddress,
    value: 0n,
    gas: 350000n,
    nonce: nonce,
    deadline: deadline,
    data: callData,
  };

  console.log("\n=== SIGNING EIP-712 TYPED DATA ===");
  console.log("Domain:", JSON.stringify(domain, null, 2));
  console.log("Message:", {
    ...message,
    value: message.value.toString(),
    gas: message.gas.toString(),
    nonce: message.nonce.toString(),
    dataLength: message.data.length,
  });

  // Sign the typed data
  const signature = await testSigner.signTypedData(domain, types, message);
  console.log("\nSignature:", signature);

  // Now verify with the forwarder contract
  console.log("\n=== VERIFICATION ===");

  const requestStruct = {
    from: testSigner.address,
    to: escrowAddress,
    value: 0n,
    gas: 350000n,
    deadline: deadline,
    data: callData,
    signature: signature,
  };

  try {
    const isValid = await forwarder.verify(requestStruct);
    console.log("Forwarder.verify() result:", isValid);

    if (isValid) {
      console.log("\n✅ SIGNATURE VERIFICATION PASSED!");
      console.log("The EIP-712 signature verification is working correctly.");
    } else {
      console.log("\n❌ SIGNATURE VERIFICATION FAILED");
      console.log("The forwarder rejected the signature.");

      // Try to debug manually
      console.log("\n=== MANUAL RECOVERY DEBUG ===");

      // Compute the type hash
      const typeHash = ethers.keccak256(
        ethers.toUtf8Bytes("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)")
      );
      console.log("TypeHash:", typeHash);

      // Compute the struct hash
      const dataHash = ethers.keccak256(callData);
      console.log("Data hash:", dataHash);

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const structHash = ethers.keccak256(
        abiCoder.encode(
          ["bytes32", "address", "address", "uint256", "uint256", "uint256", "uint48", "bytes32"],
          [typeHash, testSigner.address, escrowAddress, 0, 350000, nonce, deadline, dataHash]
        )
      );
      console.log("Struct hash:", structHash);

      // Compute domain separator
      const domainSeparator = ethers.keccak256(
        abiCoder.encode(
          ["bytes32", "bytes32", "bytes32", "uint256", "address"],
          [
            ethers.keccak256(ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
            ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
            ethers.keccak256(ethers.toUtf8Bytes(domain.version)),
            domain.chainId,
            domain.verifyingContract,
          ]
        )
      );
      console.log("Domain separator:", domainSeparator);

      // Compute the full digest
      const digest = ethers.keccak256(
        ethers.concat([
          ethers.toUtf8Bytes("\x19\x01"),
          domainSeparator,
          structHash
        ])
      );
      console.log("Digest:", digest);

      // Recover signer
      const recoveredSigner = ethers.recoverAddress(digest, signature);
      console.log("Expected signer:", testSigner.address);
      console.log("Recovered signer:", recoveredSigner);
      console.log("Match:", recoveredSigner.toLowerCase() === testSigner.address.toLowerCase());
    }
  } catch (error) {
    console.error("Verification call failed:", error.message);
  }
}

main().catch(console.error);
