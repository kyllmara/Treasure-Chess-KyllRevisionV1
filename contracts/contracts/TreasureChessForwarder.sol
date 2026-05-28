// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/**
 * @title TreasureChessForwarder
 * @notice ERC-2771 Forwarder for gasless transactions in Treasure Chess
 *
 * How it works:
 * 1. User signs a ForwardRequest (off-chain)
 * 2. Platform wallet calls execute() with the signed request
 * 3. Forwarder verifies signature and calls target contract
 * 4. Target contract uses _msgSender() to see original user (not platform wallet)
 *
 * Security:
 * - Signatures include nonce to prevent replay
 * - Signatures include deadline to prevent stale requests
 * - Target contracts must be ERC2771Context compatible
 */
contract TreasureChessForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("TreasureChessForwarder") {}
}
