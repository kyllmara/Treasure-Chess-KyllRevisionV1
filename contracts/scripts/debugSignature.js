const { ethers } = require("hardhat");

/**
 * Deep debug of signature verification issue
 */
async function main() {
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";
  const userAddress = "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44";

  // Get forwarder contract
  const forwarderAbi = [
    "function nonces(address owner) view returns (uint256)",
    "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  ];
  const forwarder = await ethers.getContractAt(forwarderAbi, forwarderAddress);

  // Get current nonce
  const nonce = await forwarder.nonces(userAddress);
  console.log("On-chain nonce:", nonce.toString());

  // Get domain
  const domain = await forwarder.eip712Domain();
  console.log("\nEIP-712 Domain from contract:");
  console.log("  name:", domain[1]);
  console.log("  version:", domain[2]);
  console.log("  chainId:", domain[3].toString());
  console.log("  verifyingContract:", domain[4]);

  // The client uses these values - let's compare
  console.log("\nClient-side EIP-712 Domain (from relay.ts):");
  console.log("  name: TreasureChessForwarder");
  console.log("  version: 1");
  console.log("  chainId: 80002");
  console.log("  verifyingContract:", process.env.FORWARDER_ADDRESS || forwarderAddress);

  // Check if they match
  const nameMatch = domain[1] === "TreasureChessForwarder";
  const versionMatch = domain[2] === "1";
  const chainIdMatch = domain[3].toString() === "80002";
  const contractMatch = domain[4].toLowerCase() === forwarderAddress.toLowerCase();

  console.log("\nMatches:");
  console.log("  name:", nameMatch, nameMatch ? "✓" : "✗ MISMATCH!");
  console.log("  version:", versionMatch, versionMatch ? "✓" : "✗ MISMATCH!");
  console.log("  chainId:", chainIdMatch, chainIdMatch ? "✓" : "✗ MISMATCH!");
  console.log("  verifyingContract:", contractMatch, contractMatch ? "✓" : "✗ MISMATCH!");

  // Now let's manually sign a request using ethers (which works)
  // and compare to what Magic Link produces
  console.log("\n=== SIGNATURE COMPARISON ===");

  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min from now
  const testData = "0x1234"; // Simple test data

  // The types used by OpenZeppelin ERC2771Forwarder
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

  const domainData = {
    name: domain[1],
    version: domain[2],
    chainId: domain[3],
    verifyingContract: domain[4],
  };

  const message = {
    from: userAddress,
    to: "0x6e24927EFa2B4DB5654331Fb20312C9f59712501",
    value: 0n,
    gas: 350000n,
    nonce: nonce,
    deadline: deadline,
    data: testData,
  };

  console.log("\nTest message:");
  console.log("  from:", message.from);
  console.log("  to:", message.to);
  console.log("  value:", message.value.toString());
  console.log("  gas:", message.gas.toString());
  console.log("  nonce:", message.nonce.toString());
  console.log("  deadline:", message.deadline);

  // Compute the hash that should be signed
  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)")
  );
  console.log("\nTypeHash:", typeHash);

  const dataHash = ethers.keccak256(testData);
  console.log("DataHash:", dataHash);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const structHash = ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256", "uint48", "bytes32"],
      [typeHash, message.from, message.to, message.value, message.gas, message.nonce, message.deadline, dataHash]
    )
  );
  console.log("StructHash:", structHash);

  // Domain separator
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
  console.log("DomainSeparator:", domainSeparator);

  const digest = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes("\x19\x01"),
      domainSeparator,
      structHash
    ])
  );
  console.log("Final digest:", digest);

  // Now compare what Magic Link sends
  console.log("\n=== WHAT MAGIC LINK SENDS (eth_signTypedData_v4) ===");
  console.log("The client builds typedData like this:");

  const magicTypedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    },
    primaryType: "ForwardRequest",
    domain: {
      name: "TreasureChessForwarder",
      version: "1",
      chainId: 80002,
      verifyingContract: forwarderAddress,
    },
    message: {
      from: userAddress,
      to: "0x6e24927EFa2B4DB5654331Fb20312C9f59712501",
      value: "0",
      gas: "350000",
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      data: testData,
    },
  };

  console.log("Magic typedData.message:", JSON.stringify(magicTypedData.message, null, 2));

  // Key observation: Magic uses STRING values for numbers in the message
  // ethers.signTypedData uses actual BigInt values
  console.log("\n=== KEY DIFFERENCE ===");
  console.log("ethers uses: nonce =", message.nonce.toString(), "(type: BigInt)");
  console.log("Magic sends: nonce =", magicTypedData.message.nonce, "(type: string)");
  console.log("");
  console.log("ethers uses: deadline =", message.deadline, "(type: number)");
  console.log("Magic sends: deadline =", magicTypedData.message.deadline, "(type: string)");
  console.log("");
  console.log("The question is: does eth_signTypedData_v4 handle string encoding correctly?");
  console.log("According to EIP-712, values should be properly typed...");
}

main().catch(console.error);
