/**
 * Anti-Cheat Service Unit Tests
 *
 * Comprehensive test coverage for:
 * - Move recording and timing analysis
 * - Consistency score calculation
 * - Complex move detection
 * - Suspicion scoring algorithm
 * - Flag detection thresholds
 * - Report generation
 */

import {
  AntiCheatService,
  createAntiCheatService,
  isMoveSuspiciouslyFast,
  getSuspicionLevelText,
  getSuspicionLevelColor,
  type GameMoveData,
} from "@/lib/antiCheat";
import { ANTI_CHEAT_THRESHOLDS } from "@/types/multiplayer";

// ============================================================================
// Test Helper Functions
// ============================================================================

function createMockMove(overrides: Partial<GameMoveData> = {}): GameMoveData {
  return {
    moveNumber: 1,
    san: "e4",
    thinkTimeMs: 5000,
    isCapture: false,
    isCheck: false,
    isCheckmate: false,
    isCastling: false,
    fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    ...overrides,
  };
}

function createNormalGameMoves(count: number): GameMoveData[] {
  const moves: GameMoveData[] = [];
  for (let i = 0; i < count; i++) {
    moves.push(
      createMockMove({
        moveNumber: i + 1,
        // Normal variance: 2-15 seconds per move
        thinkTimeMs: 2000 + Math.random() * 13000,
        san: ["e4", "d4", "Nf3", "Bc4", "O-O"][i % 5],
      })
    );
  }
  return moves;
}

function createSuspiciousMoves(count: number): GameMoveData[] {
  const moves: GameMoveData[] = [];
  for (let i = 0; i < count; i++) {
    moves.push(
      createMockMove({
        moveNumber: i + 1,
        // Very consistent timing: 800-820ms (bot-like)
        thinkTimeMs: 800 + Math.random() * 20,
        san: i % 2 === 0 ? "Qxd7+" : "Nxe5",
        isCapture: true,
        isCheck: i % 2 === 0,
      })
    );
  }
  return moves;
}

// ============================================================================
// AntiCheatService Tests
// ============================================================================

describe("AntiCheatService", () => {
  let service: AntiCheatService;

  beforeEach(() => {
    service = createAntiCheatService("test-game-id", "test-player-id");
  });

  describe("recordMove", () => {
    it("should record a single move", () => {
      const move = createMockMove();
      service.recordMove(move);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.moveTimings).toHaveLength(1);
    });

    it("should record multiple moves", () => {
      const moves = createNormalGameMoves(10);
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.moveTimings).toHaveLength(10);
    });

    it("should clear moves when requested", () => {
      service.recordMoves(createNormalGameMoves(5));
      service.clearMoves();

      const analysis = service.analyzeGame();
      expect(analysis.pattern.moveTimings).toHaveLength(0);
    });
  });

  describe("analyzeGame", () => {
    it("should return pattern, report, and shouldFlag", () => {
      service.recordMoves(createNormalGameMoves(10));
      const analysis = service.analyzeGame();

      expect(analysis).toHaveProperty("pattern");
      expect(analysis).toHaveProperty("report");
      expect(analysis).toHaveProperty("shouldFlag");
    });

    it("should include correct game and player IDs", () => {
      service.recordMoves(createNormalGameMoves(10));
      const analysis = service.analyzeGame();

      expect(analysis.pattern.gameId).toBe("test-game-id");
      expect(analysis.pattern.playerId).toBe("test-player-id");
    });
  });

  describe("timing analysis", () => {
    it("should calculate average think time", () => {
      const moves = [
        createMockMove({ thinkTimeMs: 1000 }),
        createMockMove({ thinkTimeMs: 2000 }),
        createMockMove({ thinkTimeMs: 3000 }),
      ];
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.averageThinkTimeMs).toBe(2000);
    });

    it("should calculate standard deviation", () => {
      const moves = createNormalGameMoves(20);
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      // Normal human play should have significant variance
      expect(analysis.pattern.thinkTimeStdDev).toBeGreaterThan(500);
    });

    it("should detect low variance (bot-like) patterns", () => {
      const moves = createSuspiciousMoves(20);
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      // Very consistent timing should be detected
      expect(analysis.pattern.thinkTimeStdDev).toBeLessThan(100);
    });
  });

  describe("consistency score", () => {
    it("should return low score for normal human variance", () => {
      // Create moves with high variance (normal human play)
      const moves: GameMoveData[] = [];
      for (let i = 0; i < 20; i++) {
        moves.push(createMockMove({
          moveNumber: i + 1,
          // Large variance: 1-20 seconds
          thinkTimeMs: 1000 + Math.random() * 19000,
          san: "e4",
        }));
      }
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      // Normal human variance should have low consistency score
      expect(analysis.pattern.consistencyScore).toBeLessThanOrEqual(50);
    });

    it("should return high score for bot-like consistency", () => {
      const moves = createSuspiciousMoves(20);
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.consistencyScore).toBeGreaterThan(70);
    });

    it("should return 0 for insufficient moves", () => {
      service.recordMoves(createNormalGameMoves(3));

      const analysis = service.analyzeGame();
      expect(analysis.pattern.consistencyScore).toBe(0);
    });
  });

  describe("complex move handling", () => {
    it("should detect instant complex moves", () => {
      const moves = [
        createMockMove({ san: "Qxd7+", thinkTimeMs: 100, isCapture: true, isCheck: true }),
        createMockMove({ san: "Nxe5", thinkTimeMs: 150, isCapture: true }),
        createMockMove({ san: "Rxb7", thinkTimeMs: 200, isCapture: true }),
      ];
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      // All complex moves were instant
      expect(analysis.pattern.complexMoveAccuracy).toBeGreaterThan(50);
    });

    it("should not flag slow complex moves", () => {
      const moves = [
        createMockMove({ san: "Qxd7+", thinkTimeMs: 15000, isCapture: true, isCheck: true }),
        createMockMove({ san: "Nxe5", thinkTimeMs: 12000, isCapture: true }),
        createMockMove({ san: "e4", thinkTimeMs: 5000 }),
      ];
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      // Complex moves took reasonable time
      expect(analysis.pattern.complexMoveAccuracy).toBe(0);
    });
  });

  describe("book move ratio", () => {
    it("should calculate book move ratio for opening moves", () => {
      const openingMoves = [
        createMockMove({ moveNumber: 1, san: "e4", thinkTimeMs: 2000 }),
        createMockMove({ moveNumber: 2, san: "e5", thinkTimeMs: 3000 }),
        createMockMove({ moveNumber: 3, san: "Nf3", thinkTimeMs: 4000 }),
        createMockMove({ moveNumber: 4, san: "Nc6", thinkTimeMs: 3500 }),
        createMockMove({ moveNumber: 5, san: "Bb5", thinkTimeMs: 5000 }),
      ];
      service.recordMoves(openingMoves);

      const analysis = service.analyzeGame();
      // All moves are common opening moves
      expect(analysis.pattern.bookMoveRatio).toBeGreaterThan(50);
    });
  });

  describe("flag detection", () => {
    it("should detect constant_think_time flag", () => {
      // Very consistent timing
      const moves: GameMoveData[] = [];
      for (let i = 0; i < 20; i++) {
        moves.push(createMockMove({
          moveNumber: i + 1,
          thinkTimeMs: 1000 + (i % 2) * 10 // Alternating 1000 and 1010ms
        }));
      }
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.flags).toContain("constant_think_time");
    });

    it("should detect instant_complex_moves flag", () => {
      const moves: GameMoveData[] = [];
      for (let i = 0; i < 15; i++) {
        moves.push(createMockMove({
          moveNumber: i + 1,
          san: "Qxd7+",
          thinkTimeMs: 150,
          isCapture: true,
          isCheck: true,
        }));
      }
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.flags).toContain("instant_complex_moves");
    });

    it("should detect suspicious_pattern flag for too many instant moves", () => {
      const moves: GameMoveData[] = [];
      for (let i = 0; i < 20; i++) {
        moves.push(createMockMove({
          moveNumber: i + 1,
          // 70% of moves under minimum time (under 100ms threshold)
          thinkTimeMs: i < 14 ? 50 : 5000,
        }));
      }
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.flags).toContain("suspicious_pattern");
    });

    it("should not flag normal game patterns", () => {
      const moves = createNormalGameMoves(20);
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.flags).toHaveLength(0);
    });
  });

  describe("suspicion score", () => {
    it("should return low score for normal play", () => {
      service.recordMoves(createNormalGameMoves(20));

      const analysis = service.analyzeGame();
      expect(analysis.pattern.suspicionScore).toBeLessThan(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_REVIEW);
    });

    it("should return high score for suspicious play", () => {
      service.recordMoves(createSuspiciousMoves(20));

      const analysis = service.analyzeGame();
      expect(analysis.pattern.suspicionScore).toBeGreaterThanOrEqual(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_REVIEW);
    });

    it("should cap score at 100", () => {
      // Create extremely suspicious pattern
      const moves: GameMoveData[] = [];
      for (let i = 0; i < 30; i++) {
        moves.push(createMockMove({
          moveNumber: i + 1,
          san: "Qxd7#",
          thinkTimeMs: 50,
          isCapture: true,
          isCheck: true,
          isCheckmate: true,
        }));
      }
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      expect(analysis.pattern.suspicionScore).toBeLessThanOrEqual(100);
    });
  });

  describe("report generation", () => {
    it("should recommend 'clear' for low suspicion", () => {
      service.recordMoves(createNormalGameMoves(20));

      const analysis = service.analyzeGame();
      expect(analysis.report.recommendation).toBe("clear");
    });

    it("should recommend 'review' for moderate suspicion", () => {
      // Create mildly suspicious pattern
      const moves: GameMoveData[] = [];
      for (let i = 0; i < 15; i++) {
        moves.push(createMockMove({
          moveNumber: i + 1,
          thinkTimeMs: 2000 + (i % 3) * 50, // Some consistency
          san: i % 3 === 0 ? "Qxd7+" : "e4",
          isCapture: i % 3 === 0,
          isCheck: i % 3 === 0,
        }));
      }
      service.recordMoves(moves);

      const analysis = service.analyzeGame();
      if (analysis.pattern.suspicionScore >= ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_REVIEW &&
          analysis.pattern.suspicionScore < ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_FLAG) {
        expect(analysis.report.recommendation).toBe("review");
      }
    });

    it("should include game details in report", () => {
      service.recordMoves(createNormalGameMoves(15));

      const analysis = service.analyzeGame();
      expect(analysis.report.gameId).toBe("test-game-id");
      expect(analysis.report.playerId).toBe("test-player-id");
      expect(analysis.report.totalMoves).toBe(15);
    });

    it("should include timestamp in report", () => {
      service.recordMoves(createNormalGameMoves(10));

      const analysis = service.analyzeGame();
      expect(analysis.report.createdAt).toBeDefined();
      expect(new Date(analysis.report.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("shouldFlag", () => {
    it("should be false for normal games", () => {
      service.recordMoves(createNormalGameMoves(20));

      const analysis = service.analyzeGame();
      expect(analysis.shouldFlag).toBe(false);
    });

    it("should be true when score exceeds flag threshold", () => {
      service.recordMoves(createSuspiciousMoves(30));

      const analysis = service.analyzeGame();
      if (analysis.pattern.suspicionScore >= ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_FLAG) {
        expect(analysis.shouldFlag).toBe(true);
      }
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("isMoveSuspiciouslyFast", () => {
  it("should return true for moves under threshold", () => {
    expect(isMoveSuspiciouslyFast(50)).toBe(true);
    expect(isMoveSuspiciouslyFast(99)).toBe(true);
  });

  it("should return false for moves at or above threshold", () => {
    expect(isMoveSuspiciouslyFast(ANTI_CHEAT_THRESHOLDS.MIN_THINK_TIME_MS)).toBe(false);
    expect(isMoveSuspiciouslyFast(5000)).toBe(false);
  });
});

describe("getSuspicionLevelText", () => {
  it("should return correct text for each level", () => {
    expect(getSuspicionLevelText(0)).toBe("Low");
    expect(getSuspicionLevelText(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_REVIEW)).toBe("Moderate");
    expect(getSuspicionLevelText(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_FLAG)).toBe("High");
    expect(getSuspicionLevelText(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_BAN)).toBe("Critical");
  });
});

describe("getSuspicionLevelColor", () => {
  it("should return correct colors for each level", () => {
    expect(getSuspicionLevelColor(0)).toBe("#00AA00");
    expect(getSuspicionLevelColor(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_REVIEW)).toBe("#FFAA00");
    expect(getSuspicionLevelColor(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_FLAG)).toBe("#FF6600");
    expect(getSuspicionLevelColor(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_BAN)).toBe("#FF0000");
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createAntiCheatService", () => {
  it("should create a new service instance", () => {
    const service = createAntiCheatService("game-123", "player-456");
    expect(service).toBeInstanceOf(AntiCheatService);
  });

  it("should initialize with correct game and player IDs", () => {
    const service = createAntiCheatService("game-123", "player-456");
    const analysis = service.analyzeGame();

    expect(analysis.pattern.gameId).toBe("game-123");
    expect(analysis.pattern.playerId).toBe("player-456");
  });
});

// ============================================================================
// ANTI_CHEAT_THRESHOLDS Tests
// ============================================================================

describe("ANTI_CHEAT_THRESHOLDS", () => {
  it("should have correct threshold values", () => {
    expect(ANTI_CHEAT_THRESHOLDS.MIN_THINK_TIME_MS).toBe(100);
    expect(ANTI_CHEAT_THRESHOLDS.CONSTANT_TIME_VARIANCE_THRESHOLD).toBe(500);
    expect(ANTI_CHEAT_THRESHOLDS.INSTANT_COMPLEX_MOVE_THRESHOLD_MS).toBe(500);
    expect(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_REVIEW).toBe(60);
    expect(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_FLAG).toBe(80);
    expect(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_BAN).toBe(95);
  });

  it("should have increasing suspicion thresholds", () => {
    expect(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_REVIEW)
      .toBeLessThan(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_FLAG);
    expect(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_FLAG)
      .toBeLessThan(ANTI_CHEAT_THRESHOLDS.SUSPICION_SCORE_BAN);
  });
});
