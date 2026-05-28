// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title TreasureChessEscrow
 * @notice Trustless USDC escrow for chess wagers with 10% platform fee
 * @dev Supports gasless transactions via ERC-2771 (Biconomy)
 *
 * Users NEVER need MATIC:
 * - All transactions can be relayed via Biconomy
 * - Platform sponsors gas for approvals and game actions
 * - Users only need USDC in their wallet
 *
 * Flow:
 * 1. Player A creates game with wager amount (gasless)
 * 2. Player B joins game (gasless)
 * 3. Game plays out off-chain
 * 4. Backend signer submits result (platform pays gas)
 * 5. Winner receives 90% of pot, platform gets 10%
 */
contract TreasureChessEscrow is ERC2771Context, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Constants ============

    uint256 public constant PLATFORM_FEE_BPS = 1000; // 10% = 1000 basis points
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_WAGER = 3000; // 0.003 USDC (6 decimals) = $0.003
    uint256 public constant MAX_WAGER = 10000e6; // 10,000 USDC

    // ============ State Variables ============

    IERC20 public immutable usdc;
    address public backendSigner;
    address public platformVault;
    uint256 public defaultTimeoutSeconds = 24 hours;

    uint256 public totalGamesCreated;
    uint256 public totalPlatformFees;

    // ============ Enums ============

    enum GameStatus {
        None,           // Game doesn't exist
        WaitingForOpponent,  // Created, waiting for player 2
        Active,         // Both players joined, game in progress
        Completed,      // Game finished, funds distributed
        Cancelled,      // Game cancelled before starting
        Disputed        // Under admin review
    }

    enum GameResult {
        None,
        Player1Wins,
        Player2Wins,
        Draw
    }

    // ============ Structs ============

    struct Game {
        bytes32 gameId;          // Unique identifier (matches off-chain game)
        address player1;         // Creator
        address player2;         // Joiner (address(0) until joined)
        uint256 wagerAmount;     // Amount each player wagers
        uint256 totalPot;        // Total USDC in escrow (2x wager)
        GameStatus status;
        GameResult result;
        uint256 createdAt;
        uint256 lastMoveAt;      // For timeout tracking
        uint256 timeoutSeconds;  // Custom timeout per game
    }

    // ============ Mappings ============

    mapping(bytes32 => Game) public games;
    mapping(bytes32 => bool) public usedSignatures; // Prevent replay

    // ============ Events ============

    event GameCreated(
        bytes32 indexed gameId,
        address indexed player1,
        uint256 wagerAmount,
        uint256 timeoutSeconds
    );

    event GameJoined(
        bytes32 indexed gameId,
        address indexed player2,
        uint256 totalPot
    );

    event GameCompleted(
        bytes32 indexed gameId,
        address indexed winner,
        uint256 winnerPayout,
        uint256 platformFee,
        GameResult result
    );

    event GameCancelled(bytes32 indexed gameId, address indexed player1);

    event GameDisputed(bytes32 indexed gameId, address indexed disputedBy);

    event DisputeResolved(
        bytes32 indexed gameId,
        GameResult result,
        address indexed winner
    );

    event TimeoutClaimed(
        bytes32 indexed gameId,
        address indexed winner,
        address indexed loser
    );

    event BackendSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PlatformVaultUpdated(address indexed oldVault, address indexed newVault);
    event DefaultTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);

    // ============ Errors ============

    error InvalidGameId();
    error GameNotFound();
    error GameAlreadyExists();
    error InvalidWagerAmount();
    error NotPlayer1();
    error NotGamePlayer();
    error InvalidGameStatus();
    error CannotJoinOwnGame();
    error InsufficientAllowance();
    error InvalidSignature();
    error SignatureAlreadyUsed();
    error TimeoutNotReached();
    error InvalidAddress();
    error TransferFailed();

    // ============ Constructor ============

    constructor(
        address _usdc,
        address _backendSigner,
        address _platformVault,
        address _trustedForwarder
    ) ERC2771Context(_trustedForwarder) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidAddress();
        if (_backendSigner == address(0)) revert InvalidAddress();
        if (_platformVault == address(0)) revert InvalidAddress();

        usdc = IERC20(_usdc);
        backendSigner = _backendSigner;
        platformVault = _platformVault;
    }

    // ============ ERC2771 Overrides ============

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    // ============ Player Functions ============

    /**
     * @notice Create a new game with a wager (supports gasless via Biconomy)
     * @param gameId Unique game identifier (generated off-chain)
     * @param wagerAmount Amount of USDC to wager (6 decimals)
     * @param timeoutSeconds Custom timeout (0 = use default)
     */
    function createGame(
        bytes32 gameId,
        uint256 wagerAmount,
        uint256 timeoutSeconds
    ) external nonReentrant {
        address sender = _msgSender();

        if (gameId == bytes32(0)) revert InvalidGameId();
        if (games[gameId].status != GameStatus.None) revert GameAlreadyExists();
        if (wagerAmount < MIN_WAGER || wagerAmount > MAX_WAGER) revert InvalidWagerAmount();

        // Pull USDC from player (user must have approved)
        usdc.safeTransferFrom(sender, address(this), wagerAmount);

        uint256 timeout = timeoutSeconds > 0 ? timeoutSeconds : defaultTimeoutSeconds;

        games[gameId] = Game({
            gameId: gameId,
            player1: sender,
            player2: address(0),
            wagerAmount: wagerAmount,
            totalPot: wagerAmount,
            status: GameStatus.WaitingForOpponent,
            result: GameResult.None,
            createdAt: block.timestamp,
            lastMoveAt: block.timestamp,
            timeoutSeconds: timeout
        });

        totalGamesCreated++;

        emit GameCreated(gameId, sender, wagerAmount, timeout);
    }

    /**
     * @notice Join an existing game (supports gasless via Biconomy)
     * @param gameId Game to join
     */
    function joinGame(bytes32 gameId) external nonReentrant {
        address sender = _msgSender();
        Game storage game = games[gameId];

        if (game.status != GameStatus.WaitingForOpponent) revert InvalidGameStatus();
        if (sender == game.player1) revert CannotJoinOwnGame();

        // Pull USDC from joiner (same amount as creator wagered)
        usdc.safeTransferFrom(sender, address(this), game.wagerAmount);

        game.player2 = sender;
        game.totalPot = game.wagerAmount * 2;
        game.status = GameStatus.Active;
        game.lastMoveAt = block.timestamp;

        emit GameJoined(gameId, sender, game.totalPot);
    }

    /**
     * @notice Cancel a game before opponent joins (supports gasless)
     * @param gameId Game to cancel
     */
    function cancelGame(bytes32 gameId) external nonReentrant {
        address sender = _msgSender();
        Game storage game = games[gameId];

        if (game.status != GameStatus.WaitingForOpponent) revert InvalidGameStatus();
        if (sender != game.player1) revert NotPlayer1();

        game.status = GameStatus.Cancelled;

        // Refund player 1
        usdc.safeTransfer(game.player1, game.wagerAmount);

        emit GameCancelled(gameId, game.player1);
    }

    /**
     * @notice Claim win by timeout (supports gasless)
     * @param gameId Active game where opponent timed out
     */
    function claimTimeoutWin(bytes32 gameId) external nonReentrant {
        address sender = _msgSender();
        Game storage game = games[gameId];

        if (game.status != GameStatus.Active) revert InvalidGameStatus();
        if (sender != game.player1 && sender != game.player2) revert NotGamePlayer();

        if (block.timestamp < game.lastMoveAt + game.timeoutSeconds) {
            revert TimeoutNotReached();
        }

        // The player who calls this wins (opponent timed out)
        address winner = sender;
        address loser = sender == game.player1 ? game.player2 : game.player1;

        GameResult result = winner == game.player1 ? GameResult.Player1Wins : GameResult.Player2Wins;

        _settleGame(game, result, winner);

        emit TimeoutClaimed(gameId, winner, loser);
    }

    // ============ Backend Signer Functions ============

    /**
     * @notice Submit game result (called by backend after game ends)
     * @dev Platform pays gas for this - users never need MATIC
     * @param gameId Game that finished
     * @param result The game outcome
     * @param signature Backend signature proving result authenticity
     */
    function submitResult(
        bytes32 gameId,
        GameResult result,
        bytes calldata signature
    ) external nonReentrant {
        Game storage game = games[gameId];

        if (game.status != GameStatus.Active) revert InvalidGameStatus();
        if (result == GameResult.None) revert InvalidGameStatus();

        // Verify signature from backend
        bytes32 messageHash = keccak256(abi.encodePacked(gameId, result, block.chainid, address(this)));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        if (usedSignatures[ethSignedHash]) revert SignatureAlreadyUsed();

        address signer = ethSignedHash.recover(signature);
        if (signer != backendSigner) revert InvalidSignature();

        usedSignatures[ethSignedHash] = true;

        // Determine winner
        address winner;
        if (result == GameResult.Player1Wins) {
            winner = game.player1;
        } else if (result == GameResult.Player2Wins) {
            winner = game.player2;
        }
        // winner stays address(0) for draw

        _settleGame(game, result, winner);
    }

    /**
     * @notice Update last move timestamp (for timeout tracking)
     * @param gameId Active game
     * @param signature Backend signature
     */
    function recordMove(
        bytes32 gameId,
        bytes calldata signature
    ) external {
        Game storage game = games[gameId];

        if (game.status != GameStatus.Active) revert InvalidGameStatus();

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(gameId, "move", block.timestamp, block.chainid, address(this)));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        address signer = ethSignedHash.recover(signature);
        if (signer != backendSigner) revert InvalidSignature();

        game.lastMoveAt = block.timestamp;
    }

    // ============ Admin Functions ============

    /**
     * @notice Mark a game as disputed (admin only)
     * @param gameId Game to dispute
     */
    function markDisputed(bytes32 gameId) external onlyOwner {
        Game storage game = games[gameId];

        if (game.status != GameStatus.Active) revert InvalidGameStatus();

        game.status = GameStatus.Disputed;

        emit GameDisputed(gameId, _msgSender());
    }

    /**
     * @notice Resolve a disputed game (admin only)
     * @param gameId Disputed game
     * @param result Admin's decision on outcome
     */
    function resolveDispute(
        bytes32 gameId,
        GameResult result
    ) external onlyOwner nonReentrant {
        Game storage game = games[gameId];

        if (game.status != GameStatus.Disputed) revert InvalidGameStatus();

        address winner;
        if (result == GameResult.Player1Wins) {
            winner = game.player1;
        } else if (result == GameResult.Player2Wins) {
            winner = game.player2;
        }

        _settleGame(game, result, winner);

        emit DisputeResolved(gameId, result, winner);
    }

    /**
     * @notice Emergency cancel active game and refund (admin only)
     * @param gameId Game to cancel
     */
    function emergencyRefund(bytes32 gameId) external onlyOwner nonReentrant {
        Game storage game = games[gameId];

        if (game.status != GameStatus.Active && game.status != GameStatus.Disputed) {
            revert InvalidGameStatus();
        }

        game.status = GameStatus.Cancelled;
        game.result = GameResult.Draw;

        // Refund both players equally
        usdc.safeTransfer(game.player1, game.wagerAmount);
        usdc.safeTransfer(game.player2, game.wagerAmount);

        emit GameCancelled(gameId, address(0));
    }

    // ============ Owner Config Functions ============

    function setBackendSigner(address _newSigner) external onlyOwner {
        if (_newSigner == address(0)) revert InvalidAddress();
        emit BackendSignerUpdated(backendSigner, _newSigner);
        backendSigner = _newSigner;
    }

    function setPlatformVault(address _newVault) external onlyOwner {
        if (_newVault == address(0)) revert InvalidAddress();
        emit PlatformVaultUpdated(platformVault, _newVault);
        platformVault = _newVault;
    }

    function setDefaultTimeout(uint256 _seconds) external onlyOwner {
        emit DefaultTimeoutUpdated(defaultTimeoutSeconds, _seconds);
        defaultTimeoutSeconds = _seconds;
    }

    /**
     * @notice Rescue stuck tokens that aren't part of active games (admin only)
     * @dev Use with caution - verify the game doesn't need the funds
     * @param gameId The game to refund
     * @param recipient Address to send the refund to
     */
    function rescueGameFunds(bytes32 gameId, address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();

        Game storage game = games[gameId];

        // Only allow rescue for WaitingForOpponent games (player 2 never joined)
        if (game.status != GameStatus.WaitingForOpponent) revert InvalidGameStatus();

        uint256 amount = game.wagerAmount;

        // Mark game as cancelled
        game.status = GameStatus.Cancelled;

        // Send funds to specified recipient
        usdc.safeTransfer(recipient, amount);

        emit GameCancelled(gameId, recipient);
    }

    // ============ View Functions ============

    function getGame(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function calculatePayout(uint256 totalPot) public pure returns (
        uint256 winnerPayout,
        uint256 platformFee
    ) {
        platformFee = (totalPot * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        winnerPayout = totalPot - platformFee;
    }

    function isTrustedForwarder(address forwarder) public view override returns (bool) {
        return ERC2771Context.isTrustedForwarder(forwarder);
    }

    // ============ Internal Functions ============

    function _settleGame(
        Game storage game,
        GameResult result,
        address winner
    ) internal {
        game.status = GameStatus.Completed;
        game.result = result;

        uint256 totalPot = game.totalPot;

        if (result == GameResult.Draw) {
            // Draw: refund both players (no fees)
            usdc.safeTransfer(game.player1, game.wagerAmount);
            usdc.safeTransfer(game.player2, game.wagerAmount);

            emit GameCompleted(game.gameId, address(0), 0, 0, result);
        } else {
            // Winner takes 90%, platform takes 10%
            (uint256 winnerPayout, uint256 platformFee) = calculatePayout(totalPot);

            totalPlatformFees += platformFee;

            usdc.safeTransfer(winner, winnerPayout);
            usdc.safeTransfer(platformVault, platformFee);

            emit GameCompleted(game.gameId, winner, winnerPayout, platformFee, result);
        }
    }
}
