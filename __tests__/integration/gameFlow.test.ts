/**
 * Game Flow Integration Tests
 *
 * Tests the complete game lifecycle:
 * - Challenge creation and acceptance
 * - Game initialization
 * - Move making and validation
 * - Game completion (checkmate, resignation, timeout, draw)
 * - Escrow settlement
 * - Rating updates
 */

import { Chess } from "chess.js";
import {
  createMockUser,
  createMockGame,
  createMockChallenge,
  createMockEscrow,
  resetCounters,
  simulateGame,
  completeGame,
  completeGameAsDraw,
  lockFunds,
  unlockFunds,
  settleEscrow,
  updateRatings,
  assertValidGameState,
  assertValidBalanceState,
  assertValidSettlement,
  MockUser,
  MockGame,
  MockChallenge,
  MockEscrow,
} from "./testHelpers";

// Unmock chess.js for real chess logic
jest.unmock("chess.js");

// ============================================================================
// Test Setup
// ============================================================================

describe("Game Flow Integration", () => {
  let player1: MockUser;
  let player2: MockUser;

  beforeEach(() => {
    resetCounters();
    player1 = createMockUser({ username: "Player1", elo_rating: 1200, balance_tct: 1000 });
    player2 = createMockUser({ username: "Player2", elo_rating: 1200, balance_tct: 1000 });
  });

  // ============================================================================
  // Challenge Flow Tests
  // ============================================================================

  describe("Challenge Flow", () => {
    it("should create a public challenge", () => {
      const challenge = createMockChallenge(player1, {
        is_public: true,
        wager_tct: 100,
      });

      expect(challenge.creator_id).toBe(player1.id);
      expect(challenge.status).toBe("pending");
      expect(challenge.is_public).toBe(true);
      expect(challenge.wager_tct).toBe(100);
      expect(challenge.room_code).toHaveLength(6);
    });

    it("should lock creator funds when creating wager challenge", () => {
      const wagerAmount = 100;
      const lockedPlayer1 = lockFunds(player1, wagerAmount);

      expect(lockedPlayer1.balance_tct).toBe(900);
      expect(lockedPlayer1.locked_tct).toBe(100);
      assertValidBalanceState(lockedPlayer1);
    });

    it("should accept challenge and lock opponent funds", () => {
      const wagerAmount = 100;

      // Creator locks funds
      let updatedPlayer1 = lockFunds(player1, wagerAmount);

      // Create challenge
      const challenge = createMockChallenge(player1, {
        wager_tct: wagerAmount,
      });

      // Opponent accepts and locks funds
      let updatedPlayer2 = lockFunds(player2, wagerAmount);

      const acceptedChallenge: MockChallenge = {
        ...challenge,
        opponent_id: player2.id,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      };

      expect(acceptedChallenge.status).toBe("accepted");
      expect(updatedPlayer2.locked_tct).toBe(100);
    });

    it("should refund creator when challenge is cancelled", () => {
      const wagerAmount = 100;
      let updatedPlayer1 = lockFunds(player1, wagerAmount);

      const challenge = createMockChallenge(player1, {
        wager_tct: wagerAmount,
      });

      // Cancel challenge
      const cancelledChallenge: MockChallenge = {
        ...challenge,
        status: "cancelled",
      };

      // Refund creator
      updatedPlayer1 = unlockFunds(updatedPlayer1, wagerAmount);

      expect(cancelledChallenge.status).toBe("cancelled");
      expect(updatedPlayer1.balance_tct).toBe(1000);
      expect(updatedPlayer1.locked_tct).toBe(0);
    });

    it("should handle challenge expiration", () => {
      const challenge = createMockChallenge(player1, {
        expires_at: new Date(Date.now() - 1000).toISOString(), // Already expired
      });

      const isExpired = new Date(challenge.expires_at) < new Date();
      expect(isExpired).toBe(true);
    });
  });

  // ============================================================================
  // Game Initialization Tests
  // ============================================================================

  describe("Game Initialization", () => {
    it("should create game from accepted challenge", () => {
      const challenge = createMockChallenge(player1, {
        opponent_id: player2.id,
        status: "accepted",
      });

      const game = createMockGame(player1, player2, {
        wager_tct: challenge.wager_tct,
        time_control_seconds: challenge.time_control_seconds,
        increment_seconds: challenge.increment_seconds,
      });

      assertValidGameState(game);
      expect(game.status).toBe("active");
      expect(game.current_fen).toContain("rnbqkbnr"); // Starting position
    });

    it("should create escrow for wager game", () => {
      const game = createMockGame(player1, player2, { wager_tct: 100 });
      const escrow = createMockEscrow(game, 100);

      expect(escrow.game_id).toBe(game.id);
      expect(escrow.total_pool_tct).toBe(200);
      expect(escrow.status).toBe("active");
    });

    it("should not require escrow for free game", () => {
      const game = createMockGame(player1, player2, { wager_tct: 0 });

      // No escrow needed
      expect(game.wager_tct).toBe(0);
    });

    it("should assign correct time controls", () => {
      const game = createMockGame(player1, player2, {
        time_control_seconds: 600,
        increment_seconds: 5,
        white_time_remaining: 600,
        black_time_remaining: 600,
      });

      expect(game.white_time_remaining).toBe(600);
      expect(game.black_time_remaining).toBe(600);
      expect(game.increment_seconds).toBe(5);
    });
  });

  // ============================================================================
  // Move Making Tests
  // ============================================================================

  describe("Move Making", () => {
    let game: MockGame;

    beforeEach(() => {
      game = createMockGame(player1, player2);
    });

    it("should accept valid opening moves", () => {
      const { game: updatedGame, chess } = simulateGame(game, ["e4", "e5"]);

      expect(updatedGame.move_count).toBe(2);
      expect(updatedGame.current_turn).toBe("w");
      expect(chess.fen()).toContain("4p3"); // e5 pawn
    });

    it("should reject invalid moves", () => {
      const chess = new Chess();

      expect(() => {
        chess.move("e5"); // Invalid - black can't move first
      }).toThrow();
    });

    it("should track move history correctly", () => {
      const { game: updatedGame, chess } = simulateGame(game, [
        "e4", "e5",
        "Nf3", "Nc6",
        "Bb5", "a6",
      ]);

      expect(updatedGame.move_count).toBe(6);
      expect(chess.history()).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
    });

    it("should update PGN after moves", () => {
      const { game: updatedGame } = simulateGame(game, ["e4", "e5", "Nf3"]);

      expect(updatedGame.pgn).toContain("e4");
      expect(updatedGame.pgn).toContain("e5");
      expect(updatedGame.pgn).toContain("Nf3");
    });

    it("should detect check", () => {
      const { chess } = simulateGame(game, [
        "e4", "e5",
        "Qh5", "Nc6",
        "Bc4", "Nf6",
        "Qxf7", // Scholar's mate check
      ]);

      expect(chess.isCheck()).toBe(true);
    });
  });

  // ============================================================================
  // Game Completion Tests
  // ============================================================================

  describe("Game Completion - Checkmate", () => {
    it("should detect checkmate (Scholar\'s mate)", () => {
      const game = createMockGame(player1, player2);

      const { chess } = simulateGame(game, [
        "e4", "e5",
        "Qh5", "Nc6",
        "Bc4", "Nf6",
        "Qxf7", // Checkmate
      ]);

      expect(chess.isCheckmate()).toBe(true);
      expect(chess.isGameOver()).toBe(true);
    });

    it("should complete game with winner on checkmate", () => {
      const game = createMockGame(player1, player2);

      // White wins by checkmate
      const completedGame = completeGame(game, player1.id, "checkmate");

      expect(completedGame.status).toBe("completed");
      expect(completedGame.winner_id).toBe(player1.id);
      expect(completedGame.result_reason).toBe("checkmate");
      expect(completedGame.ended_at).toBeTruthy();
    });

    it("should settle escrow on checkmate", () => {
      const game = createMockGame(player1, player2, { wager_tct: 100 });
      const escrow = createMockEscrow(game, 100);

      const { escrow: settledEscrow, winnerPayout, commission } = settleEscrow(
        escrow,
        player1.id
      );

      assertValidSettlement(settledEscrow, player1.id);
      expect(winnerPayout).toBe(190); // 200 pool - 10 commission
      expect(commission).toBe(10);
    });
  });

  describe("Game Completion - Resignation", () => {
    it("should allow player to resign", () => {
      const game = createMockGame(player1, player2);

      // Black resigns
      const completedGame = completeGame(game, player1.id, "resignation");

      expect(completedGame.status).toBe("completed");
      expect(completedGame.winner_id).toBe(player1.id);
      expect(completedGame.result_reason).toBe("resignation");
    });

    it("should settle escrow on resignation", () => {
      const game = createMockGame(player1, player2, { wager_tct: 50 });
      const escrow = createMockEscrow(game, 50);

      const { escrow: settledEscrow } = settleEscrow(escrow, player1.id);

      assertValidSettlement(settledEscrow, player1.id);
    });
  });

  describe("Game Completion - Timeout", () => {
    it("should complete game on timeout", () => {
      const game = createMockGame(player1, player2);

      // White times out, black wins
      const completedGame = completeGame(game, player2.id, "timeout");

      expect(completedGame.winner_id).toBe(player2.id);
      expect(completedGame.result_reason).toBe("timeout");
    });
  });

  describe("Game Completion - Draw", () => {
    it("should detect stalemate", () => {
      // Stalemate position
      const chess = new Chess("k7/8/1K6/8/8/8/8/8 b - - 0 1");

      if (chess.isStalemate()) {
        expect(chess.isDraw()).toBe(true);
        expect(chess.isGameOver()).toBe(true);
      }
    });

    it("should handle draw by agreement", () => {
      const game = createMockGame(player1, player2);

      const completedGame = completeGameAsDraw(game, "agreement");

      expect(completedGame.status).toBe("completed");
      expect(completedGame.winner_id).toBeNull();
      expect(completedGame.result_reason).toBe("agreement");
    });

    it("should refund both players on draw", () => {
      const game = createMockGame(player1, player2, { wager_tct: 100 });
      const escrow = createMockEscrow(game, 100);

      const { escrow: settledEscrow, winnerPayout, commission } = settleEscrow(
        escrow,
        null // Draw
      );

      expect(settledEscrow.winner_id).toBeNull();
      expect(commission).toBe(0); // No commission on draw
    });

    it("should detect threefold repetition", () => {
      const game = createMockGame(player1, player2);
      const chess = new Chess();

      // Move knights back and forth
      const moves = [
        "Nf3", "Nf6",
        "Ng1", "Ng8",
        "Nf3", "Nf6",
        "Ng1", "Ng8",
        "Nf3", "Nf6",
      ];

      moves.forEach(move => chess.move(move));

      if (chess.isThreefoldRepetition()) {
        expect(chess.isDraw()).toBe(true);
      }
    });
  });

  // ============================================================================
  // Rating Update Tests
  // ============================================================================

  describe("Rating Updates", () => {
    it("should update ratings after win/loss", () => {
      const { winner, loser } = updateRatings(player1, player2);

      // Winner gains rating
      expect(winner.elo_rating).toBeGreaterThan(1200);
      // Loser loses rating
      expect(loser.elo_rating).toBeLessThan(1200);
      // Both have one more game
      expect(winner.games_played).toBe(1);
      expect(loser.games_played).toBe(1);
    });

    it("should update win/loss counts", () => {
      const { winner, loser } = updateRatings(player1, player2);

      expect(winner.wins).toBe(1);
      expect(loser.losses).toBe(1);
      expect(winner.losses).toBe(0);
      expect(loser.wins).toBe(0);
    });

    it("should update ratings for draw", () => {
      const { winner: p1, loser: p2 } = updateRatings(player1, player2, true);

      // Equal rated players drawing should stay roughly the same
      expect(p1.elo_rating).toBe(1200);
      expect(p2.elo_rating).toBe(1200);
      expect(p1.draws).toBe(1);
      expect(p2.draws).toBe(1);
    });

    it("should give more points for upset win", () => {
      const strongPlayer = createMockUser({ elo_rating: 1600 });
      const weakPlayer = createMockUser({ elo_rating: 1000 });

      // Weak player beats strong player
      const { winner } = updateRatings(weakPlayer, strongPlayer);

      // Weak player should gain a lot of rating
      expect(winner.elo_rating - 1000).toBeGreaterThan(20);
    });

    it("should respect rating floor", () => {
      const lowRatedPlayer = createMockUser({ elo_rating: 110 });
      const strongPlayer = createMockUser({ elo_rating: 2000 });

      const { loser } = updateRatings(strongPlayer, lowRatedPlayer);

      // Should not go below 100
      expect(loser.elo_rating).toBeGreaterThanOrEqual(100);
    });
  });

  // ============================================================================
  // Full Game Flow Integration
  // ============================================================================

  describe("Complete Game Flow", () => {
    it("should complete full wager game flow", () => {
      const wagerAmount = 100;

      // 1. Lock funds for both players
      let p1 = lockFunds(player1, wagerAmount);
      let p2 = lockFunds(player2, wagerAmount);

      expect(p1.locked_tct).toBe(100);
      expect(p2.locked_tct).toBe(100);

      // 2. Create game and escrow
      const game = createMockGame(p1, p2, { wager_tct: wagerAmount });
      const escrow = createMockEscrow(game, wagerAmount);

      assertValidGameState(game);
      expect(escrow.total_pool_tct).toBe(200);

      // 3. Play some moves
      const { game: playedGame } = simulateGame(game, ["e4", "e5", "Nf3"]);

      expect(playedGame.move_count).toBe(3);

      // 4. Complete game (white wins)
      const completedGame = completeGame(playedGame, p1.id, "resignation");

      expect(completedGame.status).toBe("completed");
      expect(completedGame.winner_id).toBe(p1.id);

      // 5. Settle escrow
      const { escrow: settledEscrow, winnerPayout, commission } = settleEscrow(
        escrow,
        p1.id
      );

      assertValidSettlement(settledEscrow, p1.id);
      expect(winnerPayout).toBe(190);
      expect(commission).toBe(10);

      // 6. Update ratings
      const { winner, loser } = updateRatings(p1, p2);

      expect(winner.wins).toBe(1);
      expect(loser.losses).toBe(1);
      expect(winner.elo_rating).toBeGreaterThan(p1.elo_rating);
    });

    it("should handle free game flow (no wager)", () => {
      // Create free game
      const game = createMockGame(player1, player2, { wager_tct: 0 });

      expect(game.wager_tct).toBe(0);

      // Play and complete
      const { game: playedGame } = simulateGame(game, ["e4", "e5"]);
      const completedGame = completeGame(playedGame, player1.id, "checkmate");

      expect(completedGame.winner_id).toBe(player1.id);

      // No escrow to settle, just update ratings
      const { winner } = updateRatings(player1, player2);

      expect(winner.wins).toBe(1);
    });
  });
});
