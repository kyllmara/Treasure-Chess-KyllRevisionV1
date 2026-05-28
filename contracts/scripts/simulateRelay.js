const { ethers } = require("hardhat");

/**
 * This script simulates exactly what the relay-transaction edge function does.
 * It builds the request struct from string values (as if from JSON) and tests verify().
 */
async function main() {
  const forwarderAddress = "0x566124d8E8fC86CE44856D8D88dE71Ab86847230";

  // Simulated data from a relay request (values as strings, like from JSON)
  // Using the LATEST values from decodeRequest.js output
  const jsonRequest = {
    from: "0x64D9194326f90C0aF744BeB2E6E42A8181a8Ea44",
    to: "0x6e24927EFa2B4DB5654331Fb20312C9f59712501",
    value: "0",
    gas: "350000",
    deadline: "1769198466", // From the latest error
    data: "0x9e3419392e8d6d56ce0c61ed62ae2195e8b64f9bad1c75fc80b91f507d34ff8e591a33750000000000000000000000000000000000000000000000000000000000061a800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006973d781000000000000000000000000000000000000000000000000000000000000001c38a911be8a1e6863cc265cc0cab40f220c0fae35def704498c2d3b3d1e8d77bf6f58af018bda07f08e356f440490896af74e7a19f73791dc2f5989d9707bfd33",
    signature: "0x7a79519def27712e5c4610fe876abae16197e971f4d69502387da04d5123c24b7fc8dc355d9dfa963d59865cfae7868fdfedcf29b4230393536fbebbd4c66d301b",
  };

  console.log("=== SIMULATING RELAY FUNCTION ===\n");
  console.log("Input (as from JSON):");
  console.log("  from:", jsonRequest.from);
  console.log("  to:", jsonRequest.to);
  console.log("  value:", jsonRequest.value, "(string)");
  console.log("  gas:", jsonRequest.gas, "(string)");
  console.log("  deadline:", jsonRequest.deadline, "(string)");
  console.log("  data length:", jsonRequest.data.length);
  console.log("  signature length:", jsonRequest.signature.length);

  // Parse values exactly like the relay function does
  const parsedValue = BigInt(jsonRequest.value || "0");
  const parsedGas = BigInt(jsonRequest.gas || "350000");
  const parsedDeadline = Number(jsonRequest.deadline);

  console.log("\nParsed values:");
  console.log("  value:", parsedValue.toString(), "(BigInt)");
  console.log("  gas:", parsedGas.toString(), "(BigInt)");
  console.log("  deadline:", parsedDeadline, "(Number)");

  // Build the request struct
  const requestStruct = {
    from: jsonRequest.from,
    to: jsonRequest.to,
    value: parsedValue,
    gas: parsedGas,
    deadline: parsedDeadline,
    data: jsonRequest.data,
    signature: jsonRequest.signature,
  };

  console.log("\nRequest struct for contract call:");
  console.log("  from:", requestStruct.from);
  console.log("  to:", requestStruct.to);
  console.log("  value:", requestStruct.value.toString(), "(type:", typeof requestStruct.value, ")");
  console.log("  gas:", requestStruct.gas.toString(), "(type:", typeof requestStruct.gas, ")");
  console.log("  deadline:", requestStruct.deadline, "(type:", typeof requestStruct.deadline, ")");

  // Get forwarder contract
  const forwarderAbi = [
    "function verify((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) view returns (bool)",
    "function execute((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) payable returns (bool)",
    "function nonces(address owner) view returns (uint256)",
  ];
  const forwarder = await ethers.getContractAt(forwarderAbi, forwarderAddress);

  // Check nonce
  const nonce = await forwarder.nonces(jsonRequest.from);
  console.log("\nOn-chain nonce for user:", nonce.toString());

  // Test verify
  console.log("\n=== TESTING VERIFY ===");
  try {
    const isValid = await forwarder.verify(requestStruct);
    console.log("verify() result:", isValid);
  } catch (e) {
    console.log("verify() threw:", e.message);
  }

  // Test execute (estimate gas first)
  console.log("\n=== TESTING EXECUTE (estimateGas) ===");
  try {
    const gasEstimate = await forwarder.execute.estimateGas(requestStruct);
    console.log("estimateGas succeeded! Gas:", gasEstimate.toString());
  } catch (e) {
    console.log("estimateGas FAILED:", e.message);

    // Try to decode the error
    if (e.data) {
      console.log("Error data:", e.data);
      if (e.data === "0xd6bda275" || e.data.startsWith("0xd6bda275")) {
        console.log("-> This is ERC2771ForwarderInvalidSigner");
      }
    }
  }

  // Now test with the EXACT same approach as decodeRequest.js
  // This decodes the full tx data and tests
  console.log("\n=== TESTING WITH DECODED TX DATA (like decodeRequest.js) ===");

  // Full transaction data from the error
  const txData = "0xdf905caf000000000000000000000000000000000000000000000000000000000000002000000000000000000000000064d9194326f90c0af744beb2e6e42a8181a8ea440000000000000000000000006e24927efa2b4db5654331fb20312c9f59712501000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000557300000000000000000000000000000000000000000000000000000000069" + "73d78200000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e49e3419392e8d6d56ce0c61ed62ae2195e8b64f9bad1c75fc80b91f507d34ff8e591a33750000000000000000000000000000000000000000000000000000000000061a800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006973d781000000000000000000000000000000000000000000000000000000000000001c38a911be8a1e6863cc265cc0cab40f220c0fae35def704498c2d3b3d1e8d77bf6f58af018bda07f08e356f440490896af74e7a19f73791dc2f5989d9707bfd330000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000417a79519def27712e5c4610fe876abae16197e971f4d69502387da04d5123c24b7fc8dc355d9dfa963d59865cfae7868fdfedcf29b4230393536fbebbd4c66d301b00000000000000000000000000000000000000000000000000000000000000";

  const forwarderInterface = new ethers.Interface([
    "function execute((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) payable returns (bool)"
  ]);

  const decoded = forwarderInterface.parseTransaction({ data: txData });
  const decodedRequest = decoded.args[0];

  console.log("Decoded from tx data:");
  console.log("  from:", decodedRequest.from);
  console.log("  deadline:", decodedRequest.deadline.toString());
  console.log("  deadline type:", typeof decodedRequest.deadline);

  // Convert to plain object
  const decodedObj = {
    from: decodedRequest.from,
    to: decodedRequest.to,
    value: decodedRequest.value,
    gas: decodedRequest.gas,
    deadline: decodedRequest.deadline,
    data: decodedRequest.data,
    signature: decodedRequest.signature
  };

  try {
    const isValid2 = await forwarder.verify(decodedObj);
    console.log("verify() with decoded data:", isValid2);
  } catch (e) {
    console.log("verify() with decoded data threw:", e.message);
  }

  // Compare the two
  console.log("\n=== COMPARING ===");
  console.log("Deadline from JSON parse:", parsedDeadline, "type:", typeof parsedDeadline);
  console.log("Deadline from tx decode:", decodedRequest.deadline.toString(), "type:", typeof decodedRequest.deadline);
  console.log("Are they equal (==)?", parsedDeadline == decodedRequest.deadline);
  console.log("Are they equal (===)?", BigInt(parsedDeadline) === decodedRequest.deadline);
}

main().catch(console.error);
