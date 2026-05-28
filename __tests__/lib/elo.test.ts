/**
 * ELO Rating System Unit Tests
 *
 * Comprehensive test coverage for:
 * - K-factor calculation based on experience and rating
 * - Expected score calculation
 * - Rating change calculations
 * - Match rating calculations for both players
 * - Rating categories and display utilities
 * - Provisional rating detection
 * - Performance rating calculation
 * - Tournament batch calculations
 */

import {
  getKFactor,
  calculateExpectedScore,
  resultToScore,
  calculateNewRating,
  calculateMatchRatings,
  isProvisionalRating,
  getRatingCategory,
  getRatingChangeColor,
  formatRatingChange,
  calculateOutcomeProbabilities,
  estimateRatingUncertainty,
  calculateTournamentRatings,
  calculatePerformanceRating,
  K_FACTOR_NEW,
  K_FACTOR_INTERMEDIATE,
  K_FACTOR_ESTABLISHED,
  K_FACTOR_EXPERT,
  GAMES_THRESHOLD_NEW,
  GAMES_THRESHOLD_INTERMEDIATE,
  RATING_THRESHOLD_EXPERT,
  RATING_FLOOR,
  DEFAULT_RATING,
  PROVISIONAL_THRESHOLD,
  MAX_RATING_DIFF,
  type EloCalculationInput,
  type GameResult,
  type BatchEloPlayer,
} from "@/lib/elo";

// ============================================================================
// K-Factor Tests
// ============================================================================

describe("getKFactor", () => {
  describe("experience-based K-factor", () => {
    it("should return K=32 for new players (<30 games)", () => {
      expect(getKFactor(0)).toBe(K_FACTOR_NEW);
      expect(getKFactor(10)).toBe(K_FACTOR_NEW);
      expect(getKFactor(29)).toBe(K_FACTOR_NEW);
    });

    it("should return K=24 for intermediate players (30-99 games)", () => {
      expect(getKFactor(30)).toBe(K_FACTOR_INTERMEDIATE);
      expect(getKFactor(50)).toBe(K_FACTOR_INTERMEDIATE);
      expect(getKFactor(99)).toBe(K_FACTOR_INTERMEDIATE);
    });

    it("should return K=16 for established players (100+ games)", () => {
      expect(getKFactor(100)).toBe(K_FACTOR_ESTABLISHED);
      expect(getKFactor(500)).toBe(K_FACTOR_ESTABLISHED);
      expect(getKFactor(1000)).toBe(K_FACTOR_ESTABLISHED);
    });
  });

  describe("rating-based K-factor for experts", () => {
    it("should return K=10 for expert players (2400+) regardless of games", () => {
      expect(getKFactor(0, 2400)).toBe(K_FACTOR_EXPERT);
      expect(getKFactor(50, 2500)).toBe(K_FACTOR_EXPERT);
      expect(getKFactor(200, 2700)).toBe(K_FACTOR_EXPERT);
    });

    it("should use experience-based K-factor for sub-expert ratings", () => {
      expect(getKFactor(10, 2000)).toBe(K_FACTOR_NEW);
      expect(getKFactor(50, 2300)).toBe(K_FACTOR_INTERMEDIATE);
      expect(getKFactor(150, 2399)).toBe(K_FACTOR_ESTABLISHED);
    });
  });

  describe("edge cases", () => {
    it("should handle exactly at thresholds", () => {
      expect(getKFactor(GAMES_THRESHOLD_NEW - 1)).toBe(K_FACTOR_NEW);
      expect(getKFactor(GAMES_THRESHOLD_NEW)).toBe(K_FACTOR_INTERMEDIATE);
      expect(getKFactor(GAMES_THRESHOLD_INTERMEDIATE - 1)).toBe(K_FACTOR_INTERMEDIATE);
      expect(getKFactor(GAMES_THRESHOLD_INTERMEDIATE)).toBe(K_FACTOR_ESTABLISHED);
    });

    it("should handle rating exactly at expert threshold", () => {
      expect(getKFactor(0, RATING_THRESHOLD_EXPERT)).toBe(K_FACTOR_EXPERT);
      expect(getKFactor(0, RATING_THRESHOLD_EXPERT - 1)).toBe(K_FACTOR_NEW);
    });
  });
});

// ============================================================================
// Expected Score Tests
// ============================================================================

describe("calculateExpectedScore", () => {
  it("should return 0.5 for equal ratings", () => {
    expect(calculateExpectedScore(1500, 1500)).toBe(0.5);
    expect(calculateExpectedScore(1200, 1200)).toBe(0.5);
    expect(calculateExpectedScore(2000, 2000)).toBe(0.5);
  });

  it("should return higher score for higher rated player", () => {
    const score = calculateExpectedScore(1600, 1400);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it("should return lower score for lower rated player", () => {
    const score = calculateExpectedScore(1400, 1600);
    expect(score).toBeLessThan(0.5);
    expect(score).toBeGreaterThan(0);
  });

  it("should be symmetric for complementary probabilities", () => {
    const scoreHigher = calculateExpectedScore(1600, 1400);
    const scoreLower = calculateExpectedScore(1400, 1600);
    expect(scoreHigher + scoreLower).toBeCloseTo(1, 10);
  });

  it("should clamp extreme rating differences", () => {
    // With MAX_RATING_DIFF = 400, differences beyond this should be clamped
    const scoreMaxDiff = calculateExpectedScore(1200, 1600); // Exactly at max diff
    const scoreBeyondMax = calculateExpectedScore(1200, 2000); // Beyond max diff

    // Both should give the same result due to clamping
    expect(scoreMaxDiff).toBe(scoreBeyondMax);
  });

  it("should return approximately 0.76 for 200 point advantage", () => {
    const score = calculateExpectedScore(1400, 1200);
    expect(score).toBeCloseTo(0.76, 1);
  });

  it("should return approximately 0.91 for 400 point advantage", () => {
    const score = calculateExpectedScore(1600, 1200);
    expect(score).toBeCloseTo(0.91, 1);
  });
});

// ============================================================================
// Result to Score Tests
// ============================================================================

describe("resultToScore", () => {
  it("should return 1 for a win", () => {
    expect(resultToScore("win")).toBe(1);
  });

  it("should return 0.5 for a draw", () => {
    expect(resultToScore("draw")).toBe(0.5);
  });

  it("should return 0 for a loss", () => {
    expect(resultToScore("loss")).toBe(0);
  });
});

// ============================================================================
// Calculate New Rating Tests
// ============================================================================

describe("calculateNewRating", () => {
  describe("basic rating changes", () => {
    it("should increase rating for a win against equal opponent", () => {
      const input: EloCalculationInput = {
        playerRating: 1500,
        opponentRating: 1500,
        result: "win",
        playerGamesPlayed: 50,
      };
      const result = calculateNewRating(input);

      expect(result.newRating).toBeGreaterThan(1500);
      expect(result.ratingChange).toBeGreaterThan(0);
    });

    it("should decrease rating for a loss against equal opponent", () => {
      const input: EloCalculationInput = {
        playerRating: 1500,
        opponentRating: 1500,
        result: "loss",
        playerGamesPlayed: 50,
      };
      const result = calculateNewRating(input);

      expect(result.newRating).toBeLessThan(1500);
      expect(result.ratingChange).toBeLessThan(0);
    });

    it("should not change rating for a draw against equal opponent", () => {
      const input: EloCalculationInput = {
        playerRating: 1500,
        opponentRating: 1500,
        result: "draw",
        playerGamesPlayed: 50,
      };
      const result = calculateNewRating(input);

      expect(result.newRating).toBe(1500);
      expect(result.ratingChange).toBe(0);
    });
  });

  describe("upset scenarios", () => {
    it("should give larger gain for upset win", () => {
      const input: EloCalculationInput = {
        playerRating: 1200,
        opponentRating: 1500,
        result: "win",
        playerGamesPlayed: 50,
      };
      const result = calculateNewRating(input);

      // Upset win should give close to full K points
      expect(result.ratingChange).toBeGreaterThan(15);
    });

    it("should give smaller loss for expected loss", () => {
      const input: EloCalculationInput = {
        playerRating: 1200,
        opponentRating: 1500,
        result: "loss",
        playerGamesPlayed: 50,
      };
      const result = calculateNewRating(input);

      // Expected loss should lose fewer points
      expect(result.ratingChange).toBeGreaterThan(-10);
    });

    it("should give smaller gain for expected win", () => {
      const input: EloCalculationInput = {
        playerRating: 1500,
        opponentRating: 1200,
        result: "win",
        playerGamesPlayed: 50,
      };
      const result = calculateNewRating(input);

      // Expected win should give fewer points
      expect(result.ratingChange).toBeLessThan(10);
    });
  });

  describe("rating floor protection", () => {
    it("should not go below rating floor", () => {
      const input: EloCalculationInput = {
        playerRating: RATING_FLOOR + 10,
        opponentRating: 2000,
        result: "loss",
        playerGamesPlayed: 5, // New player, high K-factor
      };
      const result = calculateNewRating(input);

      expect(result.newRating).toBeGreaterThanOrEqual(RATING_FLOOR);
    });

    it("should correctly calculate change when hitting floor", () => {
      // Use a rating that would actually hit the floor
      // 110 rating losing to an equal 110 rated opponent, new player K=32
      // Loss against equal opponent: expected = 0.5, actual = 0, change = 32 * (0 - 0.5) = -16
      // 110 - 16 = 94 -> clamped to 100
      const input: EloCalculationInput = {
        playerRating: 110,
        opponentRating: 110,
        result: "loss",
        playerGamesPlayed: 5,
      };
      const result = calculateNewRating(input);

      expect(result.newRating).toBe(RATING_FLOOR);
      // ratingChange reflects the effective change after floor protection
      // 100 - 110 = -10 (clamped from theoretical -16)
      expect(result.ratingChange).toBe(-10);
    });
  });

  describe("K-factor impact", () => {
    it("should have larger swings for new players", () => {
      const newPlayerInput: EloCalculationInput = {
        playerRating: 1500,
        opponentRating: 1500,
        result: "win",
        playerGamesPlayed: 5,
      };
      const establishedInput: EloCalculationInput = {
        playerRating: 1500,
        opponentRating: 1500,
        result: "win",
        playerGamesPlayed: 150,
      };

      const newResult = calculateNewRating(newPlayerInput);
      const establishedResult = calculateNewRating(establishedInput);

      expect(newResult.ratingChange).toBeGreaterThan(establishedResult.ratingChange);
      expect(newResult.kFactor).toBe(K_FACTOR_NEW);
      expect(establishedResult.kFactor).toBe(K_FACTOR_ESTABLISHED);
    });
  });

  describe("return value structure", () => {
    it("should return all required fields", () => {
      const input: EloCalculationInput = {
        playerRating: 1500,
        opponentRating: 1400,
        result: "win",
        playerGamesPlayed: 50,
      };
      const result = calculateNewRating(input);

      expect(result).toHaveProperty("newRating");
      expect(result).toHaveProperty("ratingChange");
      expect(result).toHaveProperty("expectedScore");
      expect(result).toHaveProperty("kFactor");

      expect(typeof result.newRating).toBe("number");
      expect(typeof result.ratingChange).toBe("number");
      expect(typeof result.expectedScore).toBe("number");
      expect(typeof result.kFactor).toBe("number");
    });
  });
});

// ============================================================================
// Calculate Match Ratings Tests
// ============================================================================

describe("calculateMatchRatings", () => {
  it("should return ratings for both players", () => {
    const [player1, player2] = calculateMatchRatings(1500, 1500, "win", 50, 50);

    expect(player1).toHaveProperty("newRating");
    expect(player2).toHaveProperty("newRating");
  });

  it("should give opposite results to each player on win/loss", () => {
    const [player1, player2] = calculateMatchRatings(1500, 1500, "win", 50, 50);

    expect(player1.ratingChange).toBeGreaterThan(0);
    expect(player2.ratingChange).toBeLessThan(0);
  });

  it("should give equal zero change on draw between equal players", () => {
    const [player1, player2] = calculateMatchRatings(1500, 1500, "draw", 50, 50);

    expect(player1.ratingChange).toBe(0);
    expect(player2.ratingChange).toBe(0);
  });

  it("should handle asymmetric K-factors", () => {
    // New player vs established player
    const [newPlayer, established] = calculateMatchRatings(1500, 1500, "win", 10, 150);

    // New player gains more (higher K) than established player loses
    expect(Math.abs(newPlayer.ratingChange)).toBeGreaterThan(Math.abs(established.ratingChange));
  });

  it("should correctly flip result for second player", () => {
    const [winner, loser] = calculateMatchRatings(1400, 1600, "win", 50, 50);

    // Lower rated player won (upset)
    expect(winner.ratingChange).toBeGreaterThan(0);
    expect(loser.ratingChange).toBeLessThan(0);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("isProvisionalRating", () => {
  it("should return true for players with fewer than threshold games", () => {
    expect(isProvisionalRating(0)).toBe(true);
    expect(isProvisionalRating(5)).toBe(true);
    expect(isProvisionalRating(PROVISIONAL_THRESHOLD - 1)).toBe(true);
  });

  it("should return false for players with threshold or more games", () => {
    expect(isProvisionalRating(PROVISIONAL_THRESHOLD)).toBe(false);
    expect(isProvisionalRating(50)).toBe(false);
    expect(isProvisionalRating(100)).toBe(false);
  });
});

describe("getRatingCategory", () => {
  it("should return correct categories for all rating ranges", () => {
    expect(getRatingCategory(2700)).toBe("Super Grandmaster");
    expect(getRatingCategory(2500)).toBe("Grandmaster");
    expect(getRatingCategory(2400)).toBe("International Master");
    expect(getRatingCategory(2200)).toBe("FIDE Master");
    expect(getRatingCategory(2000)).toBe("Expert");
    expect(getRatingCategory(1800)).toBe("Class A");
    expect(getRatingCategory(1600)).toBe("Class B");
    expect(getRatingCategory(1400)).toBe("Class C");
    expect(getRatingCategory(1200)).toBe("Class D");
    expect(getRatingCategory(1000)).toBe("Class E");
    expect(getRatingCategory(800)).toBe("Beginner");
  });

  it("should handle edge cases at category boundaries", () => {
    expect(getRatingCategory(2699)).toBe("Grandmaster");
    expect(getRatingCategory(2499)).toBe("International Master");
    expect(getRatingCategory(1199)).toBe("Class E");
    expect(getRatingCategory(999)).toBe("Beginner");
  });
});

describe("getRatingChangeColor", () => {
  it("should return green for positive change", () => {
    expect(getRatingChangeColor(10)).toBe("#4CAF50");
    expect(getRatingChangeColor(1)).toBe("#4CAF50");
  });

  it("should return red for negative change", () => {
    expect(getRatingChangeColor(-10)).toBe("#F44336");
    expect(getRatingChangeColor(-1)).toBe("#F44336");
  });

  it("should return gray for no change", () => {
    expect(getRatingChangeColor(0)).toBe("#9E9E9E");
  });
});

describe("formatRatingChange", () => {
  it("should add plus sign for positive changes", () => {
    expect(formatRatingChange(15)).toBe("+15");
    expect(formatRatingChange(1)).toBe("+1");
  });

  it("should show negative sign for negative changes", () => {
    expect(formatRatingChange(-15)).toBe("-15");
    expect(formatRatingChange(-1)).toBe("-1");
  });

  it("should show 0 for no change", () => {
    expect(formatRatingChange(0)).toBe("0");
  });
});

describe("calculateOutcomeProbabilities", () => {
  it("should return valid probability distribution", () => {
    const probs = calculateOutcomeProbabilities(1500, 1500);

    expect(probs.win).toBeGreaterThanOrEqual(0);
    expect(probs.draw).toBeGreaterThanOrEqual(0);
    expect(probs.loss).toBeGreaterThanOrEqual(0);
    expect(probs.win + probs.draw + probs.loss).toBeCloseTo(1, 10);
  });

  it("should have higher win probability for higher rated player", () => {
    const probs = calculateOutcomeProbabilities(1600, 1400);

    expect(probs.win).toBeGreaterThan(probs.loss);
  });

  it("should have equal win/loss probability for equal ratings", () => {
    const probs = calculateOutcomeProbabilities(1500, 1500);

    expect(probs.win).toBeCloseTo(probs.loss, 5);
  });

  it("should have higher draw probability for closer ratings", () => {
    const closeProbs = calculateOutcomeProbabilities(1500, 1510);
    const farProbs = calculateOutcomeProbabilities(1500, 1700);

    expect(closeProbs.draw).toBeGreaterThan(farProbs.draw);
  });
});

describe("estimateRatingUncertainty", () => {
  it("should return highest uncertainty for no games", () => {
    expect(estimateRatingUncertainty(0)).toBe(350);
  });

  it("should decrease uncertainty with more games", () => {
    const uncertainty0 = estimateRatingUncertainty(0);
    const uncertainty10 = estimateRatingUncertainty(10);
    const uncertainty50 = estimateRatingUncertainty(50);
    const uncertainty100 = estimateRatingUncertainty(100);

    expect(uncertainty0).toBeGreaterThan(uncertainty10);
    expect(uncertainty10).toBeGreaterThan(uncertainty50);
    expect(uncertainty50).toBeGreaterThan(uncertainty100);
  });

  it("should return minimum uncertainty for many games", () => {
    expect(estimateRatingUncertainty(100)).toBe(50);
    expect(estimateRatingUncertainty(500)).toBe(50);
  });
});

// ============================================================================
// Tournament and Performance Rating Tests
// ============================================================================

describe("calculateTournamentRatings", () => {
  it("should return results for all players", () => {
    const players: BatchEloPlayer[] = [
      { id: "p1", rating: 1500, gamesPlayed: 50 },
      { id: "p2", rating: 1400, gamesPlayed: 50 },
      { id: "p3", rating: 1600, gamesPlayed: 50 },
    ];

    const results: (GameResult | null)[][] = [
      [null, "win", "loss"],
      ["loss", null, "draw"],
      ["win", "draw", null],
    ];

    const batchResults = calculateTournamentRatings(players, results);

    expect(batchResults).toHaveLength(3);
    expect(batchResults[0].playerId).toBe("p1");
    expect(batchResults[1].playerId).toBe("p2");
    expect(batchResults[2].playerId).toBe("p3");
  });

  it("should preserve old ratings", () => {
    const players: BatchEloPlayer[] = [
      { id: "p1", rating: 1500, gamesPlayed: 50 },
      { id: "p2", rating: 1400, gamesPlayed: 50 },
    ];

    const results: (GameResult | null)[][] = [
      [null, "win"],
      ["loss", null],
    ];

    const batchResults = calculateTournamentRatings(players, results);

    expect(batchResults[0].oldRating).toBe(1500);
    expect(batchResults[1].oldRating).toBe(1400);
  });

  it("should skip null results (unplayed games)", () => {
    const players: BatchEloPlayer[] = [
      { id: "p1", rating: 1500, gamesPlayed: 50 },
      { id: "p2", rating: 1500, gamesPlayed: 50 },
    ];

    const results: (GameResult | null)[][] = [
      [null, null],
      [null, null],
    ];

    const batchResults = calculateTournamentRatings(players, results);

    expect(batchResults[0].ratingChange).toBe(0);
    expect(batchResults[1].ratingChange).toBe(0);
  });
});

describe("calculatePerformanceRating", () => {
  it("should return default rating for empty input", () => {
    expect(calculatePerformanceRating([], [])).toBe(DEFAULT_RATING);
  });

  it("should return average opponent rating plus 400 for perfect score", () => {
    const opponents = [1400, 1500, 1600];
    const scores = [1, 1, 1]; // All wins
    const avgOpp = (1400 + 1500 + 1600) / 3;

    const perf = calculatePerformanceRating(opponents, scores);

    expect(perf).toBe(Math.round(avgOpp + 400));
  });

  it("should return average opponent rating minus 400 for zero score", () => {
    const opponents = [1400, 1500, 1600];
    const scores = [0, 0, 0]; // All losses
    const avgOpp = (1400 + 1500 + 1600) / 3;

    const perf = calculatePerformanceRating(opponents, scores);

    expect(perf).toBe(Math.round(avgOpp - 400));
  });

  it("should return approximately average opponent rating for 50% score", () => {
    const opponents = [1500, 1500];
    const scores = [1, 0]; // 50%

    const perf = calculatePerformanceRating(opponents, scores);

    expect(perf).toBeCloseTo(1500, -1); // Within 10 points
  });

  it("should handle mismatched array lengths", () => {
    const opponents = [1500, 1600];
    const scores = [1]; // Mismatched

    expect(calculatePerformanceRating(opponents, scores)).toBe(DEFAULT_RATING);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("ELO constants", () => {
  it("should have correct K-factor values", () => {
    expect(K_FACTOR_NEW).toBe(32);
    expect(K_FACTOR_INTERMEDIATE).toBe(24);
    expect(K_FACTOR_ESTABLISHED).toBe(16);
    expect(K_FACTOR_EXPERT).toBe(10);
  });

  it("should have correct thresholds", () => {
    expect(GAMES_THRESHOLD_NEW).toBe(30);
    expect(GAMES_THRESHOLD_INTERMEDIATE).toBe(100);
    expect(RATING_THRESHOLD_EXPERT).toBe(2400);
    expect(PROVISIONAL_THRESHOLD).toBe(10);
  });

  it("should have correct rating floor and default", () => {
    expect(RATING_FLOOR).toBe(100);
    expect(DEFAULT_RATING).toBe(1200);
  });

  it("should have correct max rating diff", () => {
    expect(MAX_RATING_DIFF).toBe(400);
  });
});
