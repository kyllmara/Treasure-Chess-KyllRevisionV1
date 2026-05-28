const { ethers } = require("hardhat");

/**
 * Test native ethers signTypedData - this works perfectly.
 * Compare to what Magic Link produces.
 */
async function main() {
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  const escrowAddress = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";

  // Get a test signer (from hardhat network)
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  console.log("Test signer:", signerAddress);

  // Get forwarder
  const forwarderAbi = [
    "function verify((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) view returns (bool)",
    "function execute((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) payable returns (bool)",
    "function nonces(address owner) view returns (uint256)",
    "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  ];
  const forwarder = await ethers.getContractAt(forwarderAbi, forwarderAddress);

  // Get domain from contract
  const domainData = await forwarder.eip712Domain();
  const nonce = await forwarder.nonces(signerAddress);

  console.log("Current nonce:", nonce.toString());

  const deadline = Math.floor(Date.now() / 1000) + 300;

  // Domain object for signTypedData
  const domain = {
    name: domainData[1],
    version: domainData[2],
    chainId: domainData[3],
    verifyingContract: domainData[4],
  };

  // Type definition - exact match to contract
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

  // Message - using proper types (BigInt for numbers)
  const message = {
    from: signerAddress,
    to: escrowAddress,
    value: 0n,
    gas: 350000n,
    nonce: nonce,
    deadline: deadline,
    data: "0x1234",
  };

  console.log("\n=== SIGNING WITH NATIVE signTypedData ===");
  console.log("Domain:", domain);
  console.log("Message:", {
    ...message,
    value: message.value.toString(),
    gas: message.gas.toString(),
    nonce: message.nonce.toString(),
  });

  // Sign with native signTypedData
  const signature = await signer.signTypedData(domain, types, message);
  console.log("Signature:", signature);

  // Build request struct
  const requestStruct = {
    from: signerAddress,
    to: escrowAddress,
    value: 0n,
    gas: 350000n,
    deadline: deadline,
    data: "0x1234",
    signature: signature,
  };

  // Verify
  console.log("\n=== VERIFICATION ===");
  const isValid = await forwarder.verify(requestStruct);
  console.log("verify() result:", isValid);

  if (isValid) {
    console.log("✓ Native signTypedData works!");
  } else {
    console.log("✗ Something is wrong even with native signTypedData");

    // Debug recovery
    const typeHash = ethers.keccak256(
      ethers.toUtf8Bytes("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)")
    );
    const dataHash = ethers.keccak256("0x1234");
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const structHash = ethers.keccak256(
      abiCoder.encode(
        ["bytes32", "address", "address", "uint256", "uint256", "uint256", "uint48", "bytes32"],
        [typeHash, signerAddress, escrowAddress, 0n, 350000n, nonce, deadline, dataHash]
      )
    );

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

    const digest = ethers.keccak256(
      ethers.concat([
        ethers.toUtf8Bytes("\x19\x01"),
        domainSeparator,
        structHash
      ])
    );

    const recovered = ethers.recoverAddress(digest, signature);
    console.log("Expected signer:", signerAddress);
    console.log("Recovered signer:", recovered);
    console.log("Match:", recovered.toLowerCase() === signerAddress.toLowerCase());
  }
}

main().catch(console.error);
