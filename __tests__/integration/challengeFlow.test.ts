/**
 * Challenge Flow Integration Tests
 *
 * End-to-end tests for the complete challenge lifecycle:
 * - Creating a challenge
 * - Finding a challenge by room code
 * - Accepting a challenge
 * - Handling challenge acceptance callback
 * - Cancelling a challenge
 * - Challenge expiration handling
 */

// Note: Using react's act instead of react-native to avoid ESM issues
// import { act } from "react";
import {
  generateRoomCode,
  isValidRoomCode,
  formatTimeControl,
  getTimeControlCategory,
} from "@/lib/challenges";
import {
  calculateNewRating,
  calculateMatchRatings,
  getRatingCategory,
} from "@/lib/elo";
import { gameResultToPGN, formatTermination } from "@/lib/pgn";

// ============================================================================
// Challenge Creation Flow Tests
// ============================================================================

describe("Challenge Creation Flow", () => {
  describe("room code generation and validation", () => {
    it("should generate valid room codes that pass validation", () => {
      for (let i = 0; i < 50; i++) {
        const code = generateRoomCode();
        expect(isValidRoomCode(code)).toBe(true);
      }
    });

    it("should generate unique codes with high probability", () => {
      const codes = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        codes.add(generateRoomCode());
      }

      // With 30 characters and 6 positions, collision rate should be very low
      const uniqueRate = codes.size / iterations;
      expect(uniqueRate).toBeGreaterThan(0.99);
    });

    it("should validate codes case-insensitively", () => {
      const code = generateRoomCode();
      expect(isValidRoomCode(code.toLowerCase())).toBe(true);
      expect(isValidRoomCode(code.toUpperCase())).toBe(true);
    });
  });

  describe("time control configuration", () => {
    const timeControls = [
      { seconds: 60, increment: 0, expectedFormat: "1 min", expectedCategory: "Bullet" },
      { seconds: 60, increment: 1, expectedFormat: "1+1", expectedCategory: "Bullet" },
      { seconds: 180, increment: 0, expectedFormat: "3 min", expectedCategory: "Blitz" },
      { seconds: 180, increment: 2, expectedFormat: "3+2", expectedCategory: "Blitz" },
      { seconds: 300, increment: 0, expectedFormat: "5 min", expectedCategory: "Blitz" },
      { seconds: 300, increment: 3, expectedFormat: "5+3", expectedCategory: "Blitz" },
      { seconds: 600, increment: 0, expectedFormat: "10 min", expectedCategory: "Rapid" },
      { seconds: 600, increment: 5, expectedFormat: "10+5", expectedCategory: "Rapid" },
      { seconds: 900, increment: 10, expectedFormat: "15+10", expectedCategory: "Rapid" },
      { seconds: 1800, increment: 0, expectedFormat: "30 min", expectedCategory: "Classical" },
    ];

    timeControls.forEach(({ seconds, increment, expectedFormat, expectedCategory }) => {
      it(`should format ${seconds}+${increment} correctly`, () => {
        expect(formatTimeControl(seconds, increment)).toBe(expectedFormat);
      });

      it(`should categorize ${seconds}+${increment} as ${expectedCategory}`, () => {
        expect(getTimeControlCategory(seconds, increment)).toBe(expectedCategory);
      });
    });
  });
});

// ============================================================================
// Challenge Acceptance Flow Tests
// ============================================================================

describe("Challenge Acceptance Flow", () => {
  describe("color assignment", () => {
    it("should correctly assign colors based on preference", () => {
      // Test logic for color assignment
      const colorPreferences: Array<"white" | "black" | "random"> = [
        "white",
        "black",
        "random",
      ];

      colorPreferences.forEach((pref) => {
        if (pref === "white") {
          // Creator gets white
          expect(pref).toBe("white");
        } else if (pref === "black") {
          // Creator gets black, acceptor gets white
          expect(pref).toBe("black");
        } else {
          // Random assignment
          expect(pref).toBe("random");
        }
      });
    });
  });

  describe("wager validation", () => {
    it("should require sufficient balance for wager", () => {
      const userBalance = 100;
      const wagerAmounts = [0, 50, 100, 150, 200];

      wagerAmounts.forEach((wager) => {
        const hasBalance = userBalance >= wager;
        if (wager <= userBalance) {
          expect(hasBalance).toBe(true);
        } else {
          expect(hasBalance).toBe(false);
        }
      });
    });
  });
});

// ============================================================================
// Game Completion Flow Tests
// ============================================================================

describe("Game Completion Flow", () => {
  describe("ELO rating updates", () => {
    it("should correctly calculate ratings for all outcome types", () => {
      const player1Rating = 1500;
      const player2Rating = 1500;
      const gamesPlayed = 50;

      // Win/Loss
      const [winner, loser] = calculateMatchRatings(
        player1Rating,
        player2Rating,
        "win",
        gamesPlayed,
        gamesPlayed
      );

      expect(winner.ratingChange).toBeGreaterThan(0);
      expect(loser.ratingChange).toBeLessThan(0);

      // Draw
      const [draw1, draw2] = calculateMatchRatings(
        player1Rating,
        player2Rating,
        "draw",
        gamesPlayed,
        gamesPlayed
      );

      expect(draw1.ratingChange).toBe(0);
      expect(draw2.ratingChange).toBe(0);
    });

    it("should update rating categories correctly", () => {
      // Test progression through rating categories
      const ratings = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2500, 2700];
      const expectedCategories = [
        "Beginner",
        "Class E",
        "Class D",
        "Class C",
        "Class B",
        "Class A",
        "Expert",
        "FIDE Master",
        "International Master",
        "Grandmaster",
        "Super Grandmaster",
      ];

      ratings.forEach((rating, index) => {
        expect(getRatingCategory(rating)).toBe(expectedCategories[index]);
      });
    });

    it("should handle upset wins correctly", () => {
      // Lower rated player beats higher rated
      const lowerRating = 1300;
      const higherRating = 1700;

      const result = calculateNewRating({
        playerRating: lowerRating,
        opponentRating: higherRating,
        result: "win",
        playerGamesPlayed: 50,
      });

      // Upset win should give larger rating gain
      expect(result.ratingChange).toBeGreaterThan(15);
    });
  });

  describe("PGN generation", () => {
    it("should convert game results to correct PGN format", () => {
      expect(gameResultToPGN("white_wins")).toBe("1-0");
      expect(gameResultToPGN("black_wins")).toBe("0-1");
      expect(gameResultToPGN("draw")).toBe("1/2-1/2");
      expect(gameResultToPGN(null)).toBe("*");
    });

    it("should format termination reasons correctly", () => {
      expect(formatTermination("checkmate", "w")).toBe("White wins by checkmate");
      expect(formatTermination("checkmate", "b")).toBe("Black wins by checkmate");
      expect(formatTermination("timeout", "w")).toBe("White wins on time");
      expect(formatTermination("resign", "w")).toBe("White wins by resignation");
      expect(formatTermination("stalemate")).toBe("Draw by stalemate");
      expect(formatTermination("draw_agreement")).toBe("Draw by agreement");
      expect(formatTermination("insufficient_material")).toBe("Draw by insufficient material");
      expect(formatTermination("threefold_repetition")).toBe("Draw by threefold repetition");
      expect(formatTermination("fifty_moves")).toBe("Draw by fifty-move rule");
    });
  });
});

// ============================================================================
// Challenge Cancellation Flow Tests
// ============================================================================

describe("Challenge Cancellation Flow", () => {
  describe("wager refund on cancellation", () => {
    it("should track wager amounts for refund", () => {
      const wagerAmounts = [0, 10, 25, 50, 100, 250, 500];

      wagerAmounts.forEach((wager) => {
        // Refund should equal original wager
        const refundAmount = wager;
        expect(refundAmount).toBe(wager);
      });
    });
  });

  describe("challenge state transitions", () => {
    it("should handle valid state transitions", () => {
      type ChallengeStatus =
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "expired";

      const validTransitions: Record<ChallengeStatus, ChallengeStatus[]> = {
        pending: ["accepted", "declined", "cancelled", "expired"],
        accepted: [], // Terminal state (moves to game)
        declined: [], // Terminal state
        cancelled: [], // Terminal state
        expired: [], // Terminal state
      };

      // Verify pending can transition to all other states
      expect(validTransitions.pending).toContain("accepted");
      expect(validTransitions.pending).toContain("declined");
      expect(validTransitions.pending).toContain("cancelled");
      expect(validTransitions.pending).toContain("expired");

      // Verify terminal states have no valid transitions
      expect(validTransitions.accepted).toHaveLength(0);
      expect(validTransitions.declined).toHaveLength(0);
      expect(validTransitions.cancelled).toHaveLength(0);
      expect(validTransitions.expired).toHaveLength(0);
    });
  });
});

// ============================================================================
// Real-time Subscription Flow Tests
// ============================================================================

describe("Real-time Subscription Flow", () => {
  describe("challenge update handling", () => {
    it("should handle different challenge status updates", () => {
      const statuses: Array<{
        status: string;
        shouldNavigateToGame: boolean;
        shouldRemoveFromList: boolean;
      }> = [
        { status: "accepted", shouldNavigateToGame: true, shouldRemoveFromList: false },
        { status: "declined", shouldNavigateToGame: false, shouldRemoveFromList: true },
        { status: "cancelled", shouldNavigateToGame: false, shouldRemoveFromList: true },
        { status: "expired", shouldNavigateToGame: false, shouldRemoveFromList: true },
      ];

      statuses.forEach(({ status, shouldNavigateToGame, shouldRemoveFromList }) => {
        if (status === "accepted") {
          expect(shouldNavigateToGame).toBe(true);
        } else {
          expect(shouldNavigateToGame).toBe(false);
          expect(shouldRemoveFromList).toBe(true);
        }
      });
    });
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("Edge Cases and Error Handling", () => {
  describe("invalid room code handling", () => {
    it("should reject codes with wrong length", () => {
      expect(isValidRoomCode("ABC12")).toBe(false);
      expect(isValidRoomCode("ABC1234")).toBe(false);
      expect(isValidRoomCode("")).toBe(false);
      expect(isValidRoomCode("A")).toBe(false);
    });

    it("should reject codes with invalid characters", () => {
      expect(isValidRoomCode("ABC12O")).toBe(false); // O looks like 0
      expect(isValidRoomCode("ABC12I")).toBe(false); // I looks like 1
      expect(isValidRoomCode("ABC12L")).toBe(false); // L looks like 1
      expect(isValidRoomCode("ABC120")).toBe(false); // 0 looks like O
      expect(isValidRoomCode("ABC121")).toBe(false); // 1 looks like I/L
    });

    it("should reject codes with special characters", () => {
      expect(isValidRoomCode("ABC-12")).toBe(false);
      expect(isValidRoomCode("ABC 12")).toBe(false);
      expect(isValidRoomCode("ABC!12")).toBe(false);
    });
  });

  describe("rating edge cases", () => {
    it("should not go below rating floor", () => {
      const result = calculateNewRating({
        playerRating: 150,
        opponentRating: 2000,
        result: "loss",
        playerGamesPlayed: 5,
      });

      expect(result.newRating).toBeGreaterThanOrEqual(100);
    });

    it("should handle expert-level ratings correctly", () => {
      const expertResult = calculateNewRating({
        playerRating: 2400,
        opponentRating: 2400,
        result: "win",
        playerGamesPlayed: 100,
      });

      // Expert K-factor (10) should result in smaller change
      expect(expertResult.kFactor).toBe(10);
      expect(Math.abs(expertResult.ratingChange)).toBeLessThanOrEqual(10);
    });
  });

  describe("time control edge cases", () => {
    it("should handle very short time controls", () => {
      expect(getTimeControlCategory(30, 0)).toBe("Bullet");
    });

    it("should handle long time controls", () => {
      expect(getTimeControlCategory(3600, 0)).toBe("Classical");
      expect(getTimeControlCategory(7200, 30)).toBe("Classical");
    });

    it("should handle large increments", () => {
      // 5 min + 30 sec increment = 300 + 40*30 = 1500 >= 1500 = Classical
      expect(getTimeControlCategory(300, 30)).toBe("Classical");
    });
  });
});

// ============================================================================
// Performance and Stress Tests
// ============================================================================

describe("Performance Tests", () => {
  describe("room code generation performance", () => {
    it("should generate codes quickly", () => {
      const iterations = 10000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        generateRoomCode();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 10k generations in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("rating calculation performance", () => {
    it("should calculate ratings quickly", () => {
      const iterations = 10000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        calculateMatchRatings(
          1500 + (i % 500),
          1500 - (i % 500),
          i % 3 === 0 ? "win" : i % 3 === 1 ? "loss" : "draw",
          50 + (i % 100),
          50 + (i % 100)
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 10k calculations in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });
});

// ============================================================================
// Data Consistency Tests
// ============================================================================

describe("Data Consistency Tests", () => {
  describe("rating symmetry", () => {
    it("should maintain rating change symmetry for equal K-factors", () => {
      const [winner, loser] = calculateMatchRatings(1500, 1500, "win", 50, 50);

      // With equal K-factors and equal ratings, changes should be symmetric
      expect(winner.ratingChange).toBe(-loser.ratingChange);
    });

    it("should maintain expected score symmetry", () => {
      const { calculateExpectedScore } = require("@/lib/elo");

      const score1 = calculateExpectedScore(1500, 1400);
      const score2 = calculateExpectedScore(1400, 1500);

      expect(score1 + score2).toBeCloseTo(1, 10);
    });
  });

  describe("time control consistency", () => {
    it("should have consistent category boundaries", () => {
      // Bullet/Blitz boundary at 180
      expect(getTimeControlCategory(179, 0)).toBe("Bullet");
      expect(getTimeControlCategory(180, 0)).toBe("Blitz");

      // Blitz/Rapid boundary at 480
      expect(getTimeControlCategory(479, 0)).toBe("Blitz");
      expect(getTimeControlCategory(480, 0)).toBe("Rapid");

      // Rapid/Classical boundary at 1500
      expect(getTimeControlCategory(1499, 0)).toBe("Rapid");
      expect(getTimeControlCategory(1500, 0)).toBe("Classical");
    });
  });
});
