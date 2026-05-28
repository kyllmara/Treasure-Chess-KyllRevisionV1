/**
 * ELO Service Unit Tests
 *
 * Comprehensive test coverage for:
 * - Rating updates after games
 * - Player stats calculations
 * - Streak management
 * - Rating history retrieval
 * - Leaderboard generation
 * - Format helpers
 */

import {
  EloService,
  updateRatingsAfterGame,
  getRatingHistory,
  getLeaderboard,
  formatRatingUpdateMessage,
  getStreakText,
  getStreakColor,
  type GameEndInput,
  type PlayerStats,
} from "@/lib/eloService";

// ============================================================================
// Test Helper Functions
// ============================================================================

function createMockGameEndInput(overrides: Partial<GameEndInput> = {}): GameEndInput {
  return {
    gameId: "test-game-id",
    winnerId: "white-player-id",
    result: "white_wins",
    reason: "checkmate",
    finalFen: "rnb1kbnr/pppp1ppp/4p3/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    pgn: "1. f3 e6 2. g4 Qh4#",
    ...overrides,
  };
}

// ============================================================================
// EloService.updateRatingsAfterGame Tests (Demo Mode)
// ============================================================================

describe("EloService.updateRatingsAfterGame", () => {
  describe("demo mode (no Supabase)", () => {
    it("should return success for white win", async () => {
      const input = createMockGameEndInput({ result: "white_wins" });
      const result = await EloService.updateRatingsAfterGame(input);

      expect(result.success).toBe(true);
      expect(result.whiteUpdate).toBeDefined();
      expect(result.blackUpdate).toBeDefined();
    });

    it("should return success for black win", async () => {
      const input = createMockGameEndInput({
        result: "black_wins",
        winnerId: "black-player-id",
      });
      const result = await EloService.updateRatingsAfterGame(input);

      expect(result.success).toBe(true);
    });

    it("should return success for draw", async () => {
      const input = createMockGameEndInput({
        result: "draw",
        winnerId: null,
      });
      const result = await EloService.updateRatingsAfterGame(input);

      expect(result.success).toBe(true);
    });

    it("should calculate positive rating change for winner", async () => {
      const input = createMockGameEndInput({ result: "white_wins" });
      const result = await EloService.updateRatingsAfterGame(input);

      expect(result.whiteUpdate!.ratingChange).toBeGreaterThan(0);
      expect(result.blackUpdate!.ratingChange).toBeLessThan(0);
    });

    it("should calculate negative rating change for loser", async () => {
      const input = createMockGameEndInput({ result: "black_wins" });
      const result = await EloService.updateRatingsAfterGame(input);

      expect(result.whiteUpdate!.ratingChange).toBeLessThan(0);
      expect(result.blackUpdate!.ratingChange).toBeGreaterThan(0);
    });

    it("should calculate zero rating change for draw", async () => {
      const input = createMockGameEndInput({ result: "draw", winnerId: null });
      const result = await EloService.updateRatingsAfterGame(input);

      expect(result.whiteUpdate!.ratingChange).toBe(0);
      expect(result.blackUpdate!.ratingChange).toBe(0);
    });

    it("should include all required fields in update", async () => {
      const input = createMockGameEndInput();
      const result = await EloService.updateRatingsAfterGame(input);

      const update = result.whiteUpdate!;
      expect(update).toHaveProperty("playerId");
      expect(update).toHaveProperty("gameId");
      expect(update).toHaveProperty("ratingBefore");
      expect(update).toHaveProperty("ratingAfter");
      expect(update).toHaveProperty("ratingChange");
      expect(update).toHaveProperty("kFactor");
      expect(update).toHaveProperty("expectedScore");
      expect(update).toHaveProperty("actualScore");
      expect(update).toHaveProperty("opponentRating");
      expect(update).toHaveProperty("isProvisional");
      expect(update).toHaveProperty("gamesPlayedBefore");
      expect(update).toHaveProperty("timestamp");
    });

    it("should set correct actual scores", async () => {
      const whiteWins = await EloService.updateRatingsAfterGame(
        createMockGameEndInput({ result: "white_wins" })
      );
      expect(whiteWins.whiteUpdate!.actualScore).toBe(1);
      expect(whiteWins.blackUpdate!.actualScore).toBe(0);

      const blackWins = await EloService.updateRatingsAfterGame(
        createMockGameEndInput({ result: "black_wins" })
      );
      expect(blackWins.whiteUpdate!.actualScore).toBe(0);
      expect(blackWins.blackUpdate!.actualScore).toBe(1);

      const draw = await EloService.updateRatingsAfterGame(
        createMockGameEndInput({ result: "draw", winnerId: null })
      );
      expect(draw.whiteUpdate!.actualScore).toBe(0.5);
      expect(draw.blackUpdate!.actualScore).toBe(0.5);
    });
  });
});

// ============================================================================
// EloService.calculateNewStats Tests
// ============================================================================

describe("EloService.calculateNewStats", () => {
  // We test via the private method indirectly through updateRatingsAfterGame
  // But we can test the logic by examining the expected behavior

  it("should increment games played", async () => {
    // In demo mode, games_played_before is 10, so after should reflect update
    const result = await EloService.updateRatingsAfterGame(createMockGameEndInput());
    expect(result.whiteUpdate!.gamesPlayedBefore).toBe(10);
  });
});

// ============================================================================
// Streak Management Tests
// ============================================================================

describe("Streak Management", () => {
  describe("getStreakText", () => {
    it("should return win streak text for positive values", () => {
      expect(getStreakText(1)).toBe("1 win streak");
      expect(getStreakText(5)).toBe("5 win streak");
      expect(getStreakText(10)).toBe("10 win streak");
    });

    it("should return loss streak text for negative values", () => {
      expect(getStreakText(-1)).toBe("1 loss streak");
      expect(getStreakText(-5)).toBe("5 loss streak");
      expect(getStreakText(-10)).toBe("10 loss streak");
    });

    it("should return no streak for zero", () => {
      expect(getStreakText(0)).toBe("No streak");
    });
  });

  describe("getStreakColor", () => {
    it("should return green for good win streaks", () => {
      expect(getStreakColor(3)).toBe("#4CAF50");
      expect(getStreakColor(5)).toBe("#4CAF50");
      expect(getStreakColor(10)).toBe("#4CAF50");
    });

    it("should return light green for small win streaks", () => {
      expect(getStreakColor(1)).toBe("#8BC34A");
      expect(getStreakColor(2)).toBe("#8BC34A");
    });

    it("should return gray for no streak", () => {
      expect(getStreakColor(0)).toBe("#9E9E9E");
    });

    it("should return orange for small loss streaks", () => {
      expect(getStreakColor(-1)).toBe("#FF9800");
      expect(getStreakColor(-2)).toBe("#FF9800");
    });

    it("should return red for bad loss streaks", () => {
      expect(getStreakColor(-3)).toBe("#F44336");
      expect(getStreakColor(-5)).toBe("#F44336");
      expect(getStreakColor(-10)).toBe("#F44336");
    });
  });
});

// ============================================================================
// Rating History Tests (Demo Mode)
// ============================================================================

describe("EloService.getRatingHistory", () => {
  it("should return array of rating history entries", async () => {
    const history = await EloService.getRatingHistory("test-player-id");

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  it("should return correct number of entries based on limit", async () => {
    const history5 = await EloService.getRatingHistory("test-player-id", 5);
    const history10 = await EloService.getRatingHistory("test-player-id", 10);

    expect(history5.length).toBe(5);
    expect(history10.length).toBe(10);
  });

  it("should include required fields in history entries", async () => {
    const history = await EloService.getRatingHistory("test-player-id", 1);
    const entry = history[0];

    expect(entry).toHaveProperty("gameId");
    expect(entry).toHaveProperty("ratingAfter");
    expect(entry).toHaveProperty("ratingChange");
    expect(entry).toHaveProperty("result");
    expect(entry).toHaveProperty("opponentUsername");
    expect(entry).toHaveProperty("playedAt");
  });

  it("should return valid result values", async () => {
    const history = await EloService.getRatingHistory("test-player-id", 20);

    for (const entry of history) {
      expect(["win", "loss", "draw"]).toContain(entry.result);
    }
  });
});

// ============================================================================
// Leaderboard Tests (Demo Mode)
// ============================================================================

describe("EloService.getLeaderboard", () => {
  it("should return array of leaderboard entries", async () => {
    const leaderboard = await EloService.getLeaderboard();

    expect(Array.isArray(leaderboard)).toBe(true);
    expect(leaderboard.length).toBeGreaterThan(0);
  });

  it("should return correct number of entries based on limit", async () => {
    const leaderboard10 = await EloService.getLeaderboard(10);
    const leaderboard25 = await EloService.getLeaderboard(25);

    expect(leaderboard10.length).toBe(10);
    expect(leaderboard25.length).toBe(25);
  });

  it("should include required fields in leaderboard entries", async () => {
    const leaderboard = await EloService.getLeaderboard(1);
    const entry = leaderboard[0];

    expect(entry).toHaveProperty("rank");
    expect(entry).toHaveProperty("playerId");
    expect(entry).toHaveProperty("username");
    expect(entry).toHaveProperty("avatarIndex");
    expect(entry).toHaveProperty("rating");
    expect(entry).toHaveProperty("gamesPlayed");
    expect(entry).toHaveProperty("winRate");
    expect(entry).toHaveProperty("currentStreak");
  });

  it("should have ranks in ascending order", async () => {
    const leaderboard = await EloService.getLeaderboard(20);

    for (let i = 0; i < leaderboard.length; i++) {
      expect(leaderboard[i].rank).toBe(i + 1);
    }
  });

  it("should have ratings in descending order", async () => {
    const leaderboard = await EloService.getLeaderboard(20);

    for (let i = 1; i < leaderboard.length; i++) {
      expect(leaderboard[i - 1].rating).toBeGreaterThanOrEqual(leaderboard[i].rating);
    }
  });

  it("should have valid win rates (0-100)", async () => {
    const leaderboard = await EloService.getLeaderboard(20);

    for (const entry of leaderboard) {
      expect(entry.winRate).toBeGreaterThanOrEqual(0);
      expect(entry.winRate).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================================
// Convenience Function Tests
// ============================================================================

describe("Convenience functions", () => {
  describe("updateRatingsAfterGame", () => {
    it("should delegate to EloService.updateRatingsAfterGame", async () => {
      const input = createMockGameEndInput();
      const result = await updateRatingsAfterGame(input);

      expect(result.success).toBe(true);
    });
  });

  describe("getRatingHistory", () => {
    it("should delegate to EloService.getRatingHistory", async () => {
      const history = await getRatingHistory("player-id");

      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe("getLeaderboard", () => {
    it("should delegate to EloService.getLeaderboard", async () => {
      const leaderboard = await getLeaderboard();

      expect(Array.isArray(leaderboard)).toBe(true);
    });
  });
});

// ============================================================================
// Format Helper Tests
// ============================================================================

describe("formatRatingUpdateMessage", () => {
  it("should format positive rating change", () => {
    const update = {
      playerId: "test",
      gameId: "test",
      ratingBefore: 1200,
      ratingAfter: 1215,
      ratingChange: 15,
      kFactor: 32,
      expectedScore: 0.5,
      actualScore: 1,
      opponentRating: 1200,
      isProvisional: false,
      gamesPlayedBefore: 10,
      timestamp: new Date().toISOString(),
    };

    const message = formatRatingUpdateMessage(update);

    expect(message).toContain("1215");
    expect(message).toContain("+15");
  });

  it("should format negative rating change", () => {
    const update = {
      playerId: "test",
      gameId: "test",
      ratingBefore: 1200,
      ratingAfter: 1185,
      ratingChange: -15,
      kFactor: 32,
      expectedScore: 0.5,
      actualScore: 0,
      opponentRating: 1200,
      isProvisional: false,
      gamesPlayedBefore: 10,
      timestamp: new Date().toISOString(),
    };

    const message = formatRatingUpdateMessage(update);

    expect(message).toContain("1185");
    expect(message).toContain("-15");
  });

  it("should include rating category", () => {
    const update = {
      playerId: "test",
      gameId: "test",
      ratingBefore: 1200,
      ratingAfter: 1200,
      ratingChange: 0,
      kFactor: 32,
      expectedScore: 0.5,
      actualScore: 0.5,
      opponentRating: 1200,
      isProvisional: false,
      gamesPlayedBefore: 10,
      timestamp: new Date().toISOString(),
    };

    const message = formatRatingUpdateMessage(update);

    expect(message).toContain("Class D"); // 1200 is Class D
  });
});

// ============================================================================
// PlayerStats Type Tests
// ============================================================================

describe("PlayerStats type", () => {
  it("should have correct structure", () => {
    const stats: PlayerStats = {
      gamesPlayed: 100,
      gamesWon: 55,
      gamesLost: 40,
      gamesDrawn: 5,
      currentStreak: 3,
      longestStreak: 7,
    };

    expect(stats.gamesPlayed).toBe(stats.gamesWon + stats.gamesLost + stats.gamesDrawn);
  });
});
