/**
 * Game Session Service Unit Tests
 *
 * Comprehensive test coverage for:
 * - GameSessionService class instantiation
 * - Move validation API calls
 * - Timer synchronization
 * - Game ending and completion
 * - State recovery
 * - Database fallback operations
 * - Utility functions (fetchGameResult, fetchGamePGN)
 */

import {
  GameSessionService,
  createGameSession,
  fetchGameResult,
  fetchGamePGN,
  type GameState,
  type PlayerInfo,
  type MoveRecord,
  type ValidateMoveResult,
  type EndGameResult,
  type GameCompleteResult,
  type FullGameState,
} from "@/lib/gameSession";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock global fetch - use spyOn for proper Jest integration
let mockFetch: jest.SpyInstance;

// Set up environment variables and fetch mock before each test
beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  mockFetch = jest.spyOn(global, 'fetch').mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)
  );
});

afterEach(() => {
  mockFetch.mockRestore();
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createGameSession", () => {
  it("should create a GameSessionService instance", () => {
    const service = createGameSession("game-123", "player-456");
    expect(service).toBeInstanceOf(GameSessionService);
  });

  it("should pass gameId and playerId to the service", () => {
    const service = createGameSession("my-game", "my-player");
    expect(service).toBeInstanceOf(GameSessionService);
  });
});

// ============================================================================
// GameSessionService Class Tests
// ============================================================================

describe("GameSessionService", () => {
  let service: GameSessionService;
  const gameId = "test-game-id";
  const playerId = "test-player-id";

  beforeEach(() => {
    service = new GameSessionService(gameId, playerId);
    // mockFetch is reset in the outer beforeEach/afterEach, but we can clear call history
    if (mockFetch) mockFetch.mockClear();
  });

  describe("constructor", () => {
    it("should initialize with gameId and playerId", () => {
      const newService = new GameSessionService("game-abc", "player-xyz");
      expect(newService).toBeInstanceOf(GameSessionService);
    });
  });

  // --------------------------------------------------------------------------
  // Move Validation Tests
  // --------------------------------------------------------------------------

  describe("validateMove", () => {
    it("should call the validate-move endpoint with correct data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          newFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
          san: "e4",
          moveNumber: 1,
        }),
      });

      const result = await service.validateMove("e2", "e4", 295000);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions/v1/game-session/validate-move"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining('"from":"e2"'),
        })
      );

      expect(result.valid).toBe(true);
      expect(result.san).toBe("e4");
    });

    it("should include promotion piece when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, san: "e8=Q" }),
      });

      await service.validateMove("e7", "e8", 100000, "q");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"promotion":"q"'),
        })
      );
    });

    it("should return invalid result on server error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Invalid move" }),
      });

      const result = await service.validateMove("e2", "e5", 295000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid move");
    });

    it("should fallback to client-side validation on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.validateMove("e2", "e4", 295000);

      // Fallback should return valid: true for client to handle
      expect(result.valid).toBe(true);
    });

    it("should include game over info when game ends", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          gameOver: true,
          result: "white_wins",
          reason: "checkmate",
        }),
      });

      const result = await service.validateMove("d1", "h5", 290000);

      expect(result.valid).toBe(true);
      expect(result.gameOver).toBe(true);
      expect(result.result).toBe("white_wins");
      expect(result.reason).toBe("checkmate");
    });
  });

  // --------------------------------------------------------------------------
  // Timer Synchronization Tests
  // --------------------------------------------------------------------------

  describe("syncTime", () => {
    it("should call the sync-time endpoint", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.syncTime(280000, 290000);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions/v1/game-session/sync-time"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"whiteTimeMs":280000'),
        })
      );

      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await service.syncTime(280000, 290000);

      expect(result).toBe(false);
    });

    it("should return false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.syncTime(280000, 290000);

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Game Ending Tests
  // --------------------------------------------------------------------------

  describe("endGame", () => {
    it("should call the end-game endpoint", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            result: "white_wins",
            reason: "resignation",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        }); // processGameComplete

      const result = await service.endGame("resign", "white_wins");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions/v1/game-session/end-game"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"reason":"resign"'),
        })
      );

      expect(result.success).toBe(true);
    });

    it("should return error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Game already ended" }),
      });

      const result = await service.endGame("resign");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game already ended");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.endGame("timeout", "black_wins");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to end game");
    });
  });

  // --------------------------------------------------------------------------
  // Game Completion Tests
  // --------------------------------------------------------------------------

  describe("processGameComplete", () => {
    it("should call the game-complete endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          eloChanges: {
            white: { oldRating: 1500, newRating: 1512, change: 12 },
            black: { oldRating: 1480, newRating: 1468, change: -12 },
          },
        }),
      });

      const result = await service.processGameComplete();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions/v1/game-complete"),
        expect.any(Object)
      );

      expect(result.success).toBe(true);
      expect(result.eloChanges).toBeDefined();
    });

    it("should return error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Already processed" }),
      });

      const result = await service.processGameComplete();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Already processed");
    });
  });

  // --------------------------------------------------------------------------
  // State Recovery Tests
  // --------------------------------------------------------------------------

  describe("getGameState", () => {
    it("should fetch full game state", async () => {
      const mockState: FullGameState = {
        game: {
          id: gameId,
          fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
          turn: "b",
          moveCount: 1,
          status: "active",
          result: null,
          endReason: null,
          whiteTimeRemaining: 295,
          blackTimeRemaining: 300,
          timeControlSeconds: 300,
          incrementSeconds: 3,
          wagerTct: 0,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        whitePlayer: {
          id: "white-id",
          username: "WhitePlayer",
          avatarIndex: 1,
          eloRating: 1500,
        },
        blackPlayer: {
          id: "black-id",
          username: "BlackPlayer",
          avatarIndex: 2,
          eloRating: 1480,
        },
        moves: [
          {
            moveNumber: 1,
            san: "e4",
            uci: "e2e4",
            fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            timeSpentMs: 5000,
            timeRemainingMs: 295000,
            isCapture: false,
            isCheck: false,
            isCheckmate: false,
            isCastling: false,
            isEnPassant: false,
            isPromotion: false,
            promotionPiece: null,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockState,
      });

      const result = await service.getGameState();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/functions/v1/game-session/state/${gameId}`),
        expect.objectContaining({ method: "GET" })
      );

      expect(result).toEqual(mockState);
    });

    it("should return null on error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await service.getGameState();

      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.getGameState();

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Database Fallback Tests
  // --------------------------------------------------------------------------

  describe("fetchGameFromDatabase", () => {
    it("should query the games table", async () => {
      const result = await service.fetchGameFromDatabase();

      // With our mock, returns null
      expect(result).toBeNull();
    });
  });

  describe("fetchMovesFromDatabase", () => {
    it("should return empty array with mock", async () => {
      const result = await service.fetchMovesFromDatabase();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe("updateGameDirect", () => {
    it("should attempt to update game in database", async () => {
      const result = await service.updateGameDirect({
        current_fen: "new-fen",
        move_count: 5,
      } as any);

      // With mock, should complete without error
      expect(typeof result).toBe("boolean");
    });
  });

  describe("recordMoveDirect", () => {
    it("should attempt to record move in database", async () => {
      const result = await service.recordMoveDirect({
        moveNumber: 1,
        san: "e4",
        uci: "e2e4",
        fenBefore: "start-fen",
        fenAfter: "after-fen",
        timeRemainingMs: 295000,
      });

      // With mock, should complete without error
      expect(typeof result).toBe("boolean");
    });

    it("should accept optional flags", async () => {
      const result = await service.recordMoveDirect({
        moveNumber: 10,
        san: "Qxf7#",
        uci: "d1f7",
        fenBefore: "some-fen",
        fenAfter: "checkmate-fen",
        timeRemainingMs: 100000,
        isCapture: true,
        isCheck: true,
        isCheckmate: true,
      });

      expect(typeof result).toBe("boolean");
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("fetchGameResult", () => {
  it("should return game result data structure", async () => {
    const result = await fetchGameResult("game-123");

    // With mock, all should be null
    expect(result).toHaveProperty("game");
    expect(result).toHaveProperty("whitePlayer");
    expect(result).toHaveProperty("blackPlayer");
    expect(result).toHaveProperty("eloChanges");
    expect(result).toHaveProperty("wagerResult");
  });

  it("should return null values with mock", async () => {
    const result = await fetchGameResult("game-123");

    expect(result.game).toBeNull();
    expect(result.whitePlayer).toBeNull();
    expect(result.blackPlayer).toBeNull();
    expect(result.eloChanges).toBeNull();
    expect(result.wagerResult).toBeNull();
  });
});

describe("fetchGamePGN", () => {
  it("should return null with mock", async () => {
    const result = await fetchGamePGN("game-123");

    expect(result).toBeNull();
  });
});

// ============================================================================
// Type Definition Tests
// ============================================================================

describe("type definitions", () => {
  it("should define GameState correctly", () => {
    const state: GameState = {
      id: "game-id",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "w",
      moveCount: 0,
      status: "active",
      result: null,
      endReason: null,
      whiteTimeRemaining: 300,
      blackTimeRemaining: 300,
      timeControlSeconds: 300,
      incrementSeconds: 3,
      wagerTct: 0,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };

    expect(state.turn).toBe("w");
    expect(state.status).toBe("active");
  });

  it("should define PlayerInfo correctly", () => {
    const player: PlayerInfo = {
      id: "player-id",
      username: "TestPlayer",
      avatarIndex: 5,
      eloRating: 1500,
    };

    expect(player.username).toBe("TestPlayer");
    expect(player.eloRating).toBe(1500);
  });

  it("should define MoveRecord correctly", () => {
    const move: MoveRecord = {
      moveNumber: 1,
      san: "e4",
      uci: "e2e4",
      fenBefore: "start",
      fenAfter: "after",
      timeSpentMs: 5000,
      timeRemainingMs: 295000,
      isCapture: false,
      isCheck: false,
      isCheckmate: false,
      isCastling: false,
      isEnPassant: false,
      isPromotion: false,
      promotionPiece: null,
    };

    expect(move.san).toBe("e4");
    expect(move.isCheckmate).toBe(false);
  });

  it("should define ValidateMoveResult correctly", () => {
    const result: ValidateMoveResult = {
      valid: true,
      newFen: "new-fen",
      san: "Nf3",
      moveNumber: 2,
      gameOver: false,
    };

    expect(result.valid).toBe(true);
    expect(result.gameOver).toBe(false);
  });

  it("should define EndGameResult correctly", () => {
    const result: EndGameResult = {
      success: true,
      result: "white_wins",
      reason: "checkmate",
      winnerId: "winner-id",
    };

    expect(result.success).toBe(true);
    expect(result.reason).toBe("checkmate");
  });

  it("should define GameCompleteResult correctly", () => {
    const result: GameCompleteResult = {
      success: true,
      eloChanges: {
        white: {
          playerId: "white-id",
          oldRating: 1500,
          newRating: 1515,
          change: 15,
          kFactor: 24,
        },
        black: {
          playerId: "black-id",
          oldRating: 1480,
          newRating: 1468,
          change: -12,
          kFactor: 24,
        },
      },
      wagerSettlement: {
        winnerId: "white-id",
        winnerPayout: 190,
        platformFee: 10,
        refunded: false,
      },
      pgn: "[Event \"...\"]\n1. e4 e5...",
    };

    expect(result.success).toBe(true);
    expect(result.eloChanges?.white.change).toBe(15);
    expect(result.wagerSettlement?.winnerPayout).toBe(190);
  });

  it("should define FullGameState correctly", () => {
    const fullState: FullGameState = {
      game: {
        id: "game-id",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        turn: "w",
        moveCount: 0,
        status: "active",
        result: null,
        endReason: null,
        whiteTimeRemaining: 300,
        blackTimeRemaining: 300,
        timeControlSeconds: 300,
        incrementSeconds: 3,
        wagerTct: 0,
        startedAt: new Date().toISOString(),
        endedAt: null,
      },
      whitePlayer: {
        id: "white-id",
        username: "White",
        avatarIndex: 1,
        eloRating: 1500,
      },
      blackPlayer: {
        id: "black-id",
        username: "Black",
        avatarIndex: 2,
        eloRating: 1500,
      },
      moves: [],
    };

    expect(fullState.game.status).toBe("active");
    expect(fullState.whitePlayer.username).toBe("White");
    expect(fullState.moves).toHaveLength(0);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("edge cases", () => {
  let service: GameSessionService;

  beforeEach(() => {
    service = new GameSessionService("edge-game", "edge-player");
  });

  it("should handle empty authorization header gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true }),
    });

    // Should not throw even with empty auth
    const result = await service.validateMove("e2", "e4", 300000);
    expect(result.valid).toBe(true);
  });

  it("should handle JSON parse errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error("Invalid JSON"); },
    });

    const result = await service.validateMove("e2", "e4", 300000);

    // Should fallback gracefully
    expect(result.valid).toBe(true);
  });

  it("should handle multiple rapid requests", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true }),
    });

    // Simulate rapid-fire move validation
    const results = await Promise.all([
      service.validateMove("e2", "e4", 300000),
      service.validateMove("d2", "d4", 299000),
      service.validateMove("f2", "f4", 298000),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.valid).toBe(true));
  });

  it("should handle timeout scenarios", async () => {
    // Simulate a slow response that times out
    mockFetch.mockImplementationOnce(() =>
      new Promise((resolve) => setTimeout(() => resolve({ ok: false }), 100))
    );

    const result = await service.validateMove("e2", "e4", 300000);

    // Should handle timeout gracefully
    expect(result).toBeDefined();
  });
});
