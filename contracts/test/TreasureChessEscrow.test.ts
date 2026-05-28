import { expect } from "chai";
import { ethers } from "hardhat";
import { TreasureChessEscrow } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { parseUnits, keccak256, solidityPacked, toBeHex } from "ethers";

describe("TreasureChessEscrow", function () {
  let escrow: TreasureChessEscrow;
  let mockUsdc: any;
  let owner: SignerWithAddress;
  let backendSigner: SignerWithAddress;
  let platformVault: SignerWithAddress;
  let player1: SignerWithAddress;
  let player2: SignerWithAddress;

  const WAGER_AMOUNT = parseUnits("100", 6); // 100 USDC
  const INITIAL_BALANCE = parseUnits("1000", 6); // 1000 USDC each

  beforeEach(async function () {
    [owner, backendSigner, platformVault, player1, player2] = await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Mint USDC to players
    await mockUsdc.mint(player1.address, INITIAL_BALANCE);
    await mockUsdc.mint(player2.address, INITIAL_BALANCE);

    // Deploy escrow
    const TreasureChessEscrow = await ethers.getContractFactory("TreasureChessEscrow");
    escrow = await TreasureChessEscrow.deploy(
      await mockUsdc.getAddress(),
      backendSigner.address,
      platformVault.address
    );

    // Players approve escrow to spend USDC
    await mockUsdc.connect(player1).approve(await escrow.getAddress(), ethers.MaxUint256);
    await mockUsdc.connect(player2).approve(await escrow.getAddress(), ethers.MaxUint256);
  });

  describe("Game Creation", function () {
    it("should create a game and lock player1 funds", async function () {
      const gameId = ethers.id("game-1");

      await expect(escrow.connect(player1).createGame(gameId, WAGER_AMOUNT, 0))
        .to.emit(escrow, "GameCreated")
        .withArgs(gameId, player1.address, WAGER_AMOUNT, 86400); // default timeout

      const game = await escrow.getGame(gameId);
      expect(game.player1).to.equal(player1.address);
      expect(game.wagerAmount).to.equal(WAGER_AMOUNT);
      expect(game.status).to.equal(1); // WaitingForOpponent

      // Check USDC was transferred
      expect(await mockUsdc.balanceOf(player1.address)).to.equal(INITIAL_BALANCE - WAGER_AMOUNT);
      expect(await mockUsdc.balanceOf(await escrow.getAddress())).to.equal(WAGER_AMOUNT);
    });

    it("should reject wager below minimum", async function () {
      const gameId = ethers.id("game-1");
      await expect(
        escrow.connect(player1).createGame(gameId, parseUnits("0.5", 6), 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidWagerAmount");
    });

    it("should reject wager above maximum", async function () {
      const gameId = ethers.id("game-1");
      await expect(
        escrow.connect(player1).createGame(gameId, parseUnits("20000", 6), 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidWagerAmount");
    });
  });

  describe("Game Joining", function () {
    let gameId: string;

    beforeEach(async function () {
      gameId = ethers.id("game-1");
      await escrow.connect(player1).createGame(gameId, WAGER_AMOUNT, 0);
    });

    it("should allow player2 to join and lock their funds", async function () {
      await expect(escrow.connect(player2).joinGame(gameId))
        .to.emit(escrow, "GameJoined")
        .withArgs(gameId, player2.address, WAGER_AMOUNT * 2n);

      const game = await escrow.getGame(gameId);
      expect(game.player2).to.equal(player2.address);
      expect(game.totalPot).to.equal(WAGER_AMOUNT * 2n);
      expect(game.status).to.equal(2); // Active

      // Check USDC balance
      expect(await mockUsdc.balanceOf(await escrow.getAddress())).to.equal(WAGER_AMOUNT * 2n);
    });

    it("should reject player1 joining own game", async function () {
      await expect(
        escrow.connect(player1).joinGame(gameId)
      ).to.be.revertedWithCustomError(escrow, "CannotJoinOwnGame");
    });
  });

  describe("Game Settlement", function () {
    let gameId: string;

    beforeEach(async function () {
      gameId = ethers.id("game-1");
      await escrow.connect(player1).createGame(gameId, WAGER_AMOUNT, 0);
      await escrow.connect(player2).joinGame(gameId);
    });

    it("should pay winner 90% and platform 10%", async function () {
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const escrowAddress = await escrow.getAddress();

      // Create signature for player1 winning
      const messageHash = keccak256(
        solidityPacked(
          ["bytes32", "uint8", "uint256", "address"],
          [gameId, 1, chainId, escrowAddress] // 1 = Player1Wins
        )
      );

      const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));

      const player1BalanceBefore = await mockUsdc.balanceOf(player1.address);
      const vaultBalanceBefore = await mockUsdc.balanceOf(platformVault.address);

      await expect(escrow.submitResult(gameId, 1, signature))
        .to.emit(escrow, "GameCompleted");

      const totalPot = WAGER_AMOUNT * 2n;
      const platformFee = totalPot / 10n; // 10%
      const winnerPayout = totalPot - platformFee; // 90%

      expect(await mockUsdc.balanceOf(player1.address)).to.equal(player1BalanceBefore + winnerPayout);
      expect(await mockUsdc.balanceOf(platformVault.address)).to.equal(vaultBalanceBefore + platformFee);
    });

    it("should refund both players on draw (no fees)", async function () {
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const escrowAddress = await escrow.getAddress();

      const messageHash = keccak256(
        solidityPacked(
          ["bytes32", "uint8", "uint256", "address"],
          [gameId, 3, chainId, escrowAddress] // 3 = Draw
        )
      );

      const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));

      await escrow.submitResult(gameId, 3, signature);

      // Both players get full refund
      expect(await mockUsdc.balanceOf(player1.address)).to.equal(INITIAL_BALANCE);
      expect(await mockUsdc.balanceOf(player2.address)).to.equal(INITIAL_BALANCE);

      // Platform gets nothing
      expect(await mockUsdc.balanceOf(platformVault.address)).to.equal(0);
    });

    it("should reject invalid signature", async function () {
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const escrowAddress = await escrow.getAddress();

      const messageHash = keccak256(
        solidityPacked(
          ["bytes32", "uint8", "uint256", "address"],
          [gameId, 1, chainId, escrowAddress]
        )
      );

      // Sign with wrong signer
      const signature = await player1.signMessage(ethers.getBytes(messageHash));

      await expect(
        escrow.submitResult(gameId, 1, signature)
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
    });
  });

  describe("Game Cancellation", function () {
    it("should refund player1 if cancelled before opponent joins", async function () {
      const gameId = ethers.id("game-1");
      await escrow.connect(player1).createGame(gameId, WAGER_AMOUNT, 0);

      await escrow.connect(player1).cancelGame(gameId);

      expect(await mockUsdc.balanceOf(player1.address)).to.equal(INITIAL_BALANCE);

      const game = await escrow.getGame(gameId);
      expect(game.status).to.equal(4); // Cancelled
    });
  });

  describe("Timeout", function () {
    it("should allow timeout claim after period expires", async function () {
      const gameId = ethers.id("game-1");
      const shortTimeout = 60; // 60 seconds

      await escrow.connect(player1).createGame(gameId, WAGER_AMOUNT, shortTimeout);
      await escrow.connect(player2).joinGame(gameId);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [shortTimeout + 1]);
      await ethers.provider.send("evm_mine", []);

      // Player1 claims timeout
      await expect(escrow.connect(player1).claimTimeoutWin(gameId))
        .to.emit(escrow, "TimeoutClaimed")
        .withArgs(gameId, player1.address, player2.address);

      const totalPot = WAGER_AMOUNT * 2n;
      const platformFee = totalPot / 10n;
      const winnerPayout = totalPot - platformFee;

      // Player1 gets 90%
      expect(await mockUsdc.balanceOf(player1.address)).to.equal(
        INITIAL_BALANCE - WAGER_AMOUNT + winnerPayout
      );
    });
  });

  describe("Dispute Resolution", function () {
    let gameId: string;

    beforeEach(async function () {
      gameId = ethers.id("game-1");
      await escrow.connect(player1).createGame(gameId, WAGER_AMOUNT, 0);
      await escrow.connect(player2).joinGame(gameId);
    });

    it("should allow admin to mark game as disputed", async function () {
      await expect(escrow.connect(owner).markDisputed(gameId))
        .to.emit(escrow, "GameDisputed")
        .withArgs(gameId, owner.address);

      const game = await escrow.getGame(gameId);
      expect(game.status).to.equal(5); // Disputed
    });

    it("should allow admin to resolve dispute in favor of player2", async function () {
      await escrow.connect(owner).markDisputed(gameId);

      await expect(escrow.connect(owner).resolveDispute(gameId, 2)) // Player2Wins
        .to.emit(escrow, "DisputeResolved")
        .withArgs(gameId, 2, player2.address);

      const totalPot = WAGER_AMOUNT * 2n;
      const platformFee = totalPot / 10n;
      const winnerPayout = totalPot - platformFee;

      expect(await mockUsdc.balanceOf(player2.address)).to.equal(
        INITIAL_BALANCE - WAGER_AMOUNT + winnerPayout
      );
    });

    it("should allow emergency refund", async function () {
      await escrow.connect(owner).emergencyRefund(gameId);

      // Both players get full refund
      expect(await mockUsdc.balanceOf(player1.address)).to.equal(INITIAL_BALANCE);
      expect(await mockUsdc.balanceOf(player2.address)).to.equal(INITIAL_BALANCE);
    });
  });
});
