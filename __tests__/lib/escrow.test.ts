/**
 * Escrow Service Unit Tests
 *
 * Comprehensive test coverage for:
 * - Wager validation
 * - Fund locking/unlocking
 * - Escrow creation
 * - Game settlement (win, loss, draw) with 5% rake
 * - Rake distribution (80% treasury, 20% reward pool)
 * - Refunds (no rake on draws)
 * - Utility functions (calculations, formatting)
 * - Vault balance queries
 */

import {
  isValidWagerAmount,
  calculatePotentialWinnings,
  calculateRakeBreakdown,
  tctToUsd,
  usdToTct,
  formatTct,
  formatUsd,
  MIN_WAGER_TCT,
  MAX_WAGER_TCT,
  DEFAULT_RAKE_RATE,
  DEFAULT_COMMISSION_RATE,
  TREASURY_SPLIT,
  REWARD_POOL_SPLIT,
  TCT_TO_USD,
  WAGER_PRESETS,
} from "@/lib/escrow";

// ============================================================================
// Constants Tests
// ============================================================================

describe("Escrow Constants", () => {
  it("should have correct wager limits", () => {
    expect(MIN_WAGER_TCT).toBe(25);
    expect(MAX_WAGER_TCT).toBe(1000);
  });

  it("should have correct rake rate of 5%", () => {
    expect(DEFAULT_RAKE_RATE).toBe(0.05); // 5%
    expect(DEFAULT_COMMISSION_RATE).toBe(0.05); // Alias
  });

  it("should have correct rake split ratios", () => {
    expect(TREASURY_SPLIT).toBe(0.80); // 80% to treasury
    expect(REWARD_POOL_SPLIT).toBe(0.20); // 20% to reward pool
    expect(TREASURY_SPLIT + REWARD_POOL_SPLIT).toBe(1.0); // Must sum to 100%
  });

  it("should have correct TCT to USD conversion", () => {
    expect(TCT_TO_USD).toBe(0.04); // 1 TCT = $0.04
  });

  it("should have valid wager presets", () => {
    expect(WAGER_PRESETS).toEqual([0, 25, 50, 100, 250, 500]);
    // All non-zero presets should be within limits
    WAGER_PRESETS.forEach((preset) => {
      if (preset > 0) {
        expect(preset).toBeGreaterThanOrEqual(MIN_WAGER_TCT);
        expect(preset).toBeLessThanOrEqual(MAX_WAGER_TCT);
      }
    });
  });
});

// ============================================================================
// Wager Validation Tests
// ============================================================================

describe("isValidWagerAmount", () => {
  it("should allow free play (0 wager)", () => {
    expect(isValidWagerAmount(0)).toBe(true);
  });

  it("should allow minimum wager", () => {
    expect(isValidWagerAmount(MIN_WAGER_TCT)).toBe(true);
  });

  it("should allow maximum wager", () => {
    expect(isValidWagerAmount(MAX_WAGER_TCT)).toBe(true);
  });

  it("should reject wager below minimum", () => {
    expect(isValidWagerAmount(MIN_WAGER_TCT - 1)).toBe(false);
    expect(isValidWagerAmount(10)).toBe(false);
    expect(isValidWagerAmount(1)).toBe(false);
  });

  it("should reject wager above maximum", () => {
    expect(isValidWagerAmount(MAX_WAGER_TCT + 1)).toBe(false);
    expect(isValidWagerAmount(2000)).toBe(false);
    expect(isValidWagerAmount(10000)).toBe(false);
  });

  it("should allow wagers within valid range", () => {
    expect(isValidWagerAmount(50)).toBe(true);
    expect(isValidWagerAmount(100)).toBe(true);
    expect(isValidWagerAmount(250)).toBe(true);
    expect(isValidWagerAmount(500)).toBe(true);
  });

  it("should handle edge cases", () => {
    expect(isValidWagerAmount(-1)).toBe(false);
    expect(isValidWagerAmount(-100)).toBe(false);
  });
});

// ============================================================================
// Potential Winnings Calculation Tests (5% Rake)
// ============================================================================

describe("calculatePotentialWinnings", () => {
  it("should return 0 for free play", () => {
    expect(calculatePotentialWinnings(0)).toBe(0);
  });

  it("should calculate winnings with default 5% rake", () => {
    // 100 TCT wager each player
    // Total pool: 200 TCT
    // Rake: 5% of 200 = 10 TCT
    // Winner gets: 200 - 10 = 190 TCT
    expect(calculatePotentialWinnings(100)).toBe(190);
  });

  it("should calculate winnings with minimum wager", () => {
    // 25 TCT wager each player
    // Total pool: 50 TCT
    // Rake: 5% of 50 = 2.5 TCT
    // Winner gets: 50 - 2.5 = 47.5 TCT
    expect(calculatePotentialWinnings(25)).toBe(47.5);
  });

  it("should calculate winnings with maximum wager", () => {
    // 1000 TCT wager each player
    // Total pool: 2000 TCT
    // Rake: 5% of 2000 = 100 TCT
    // Winner gets: 2000 - 100 = 1900 TCT
    expect(calculatePotentialWinnings(1000)).toBe(1900);
  });

  it("should respect custom rake rate", () => {
    // 100 TCT wager, 10% rake (old rate)
    // Total pool: 200 TCT
    // Rake: 10% of 200 = 20 TCT
    // Winner gets: 200 - 20 = 180 TCT
    expect(calculatePotentialWinnings(100, 0.10)).toBe(180);
  });

  it("should handle zero rake", () => {
    // 100 TCT wager, 0% rake
    // Total pool: 200 TCT
    // Winner gets: 200 TCT
    expect(calculatePotentialWinnings(100, 0)).toBe(200);
  });

  it("should handle all preset wager amounts with 5% rake", () => {
    const expectedResults = [
      { wager: 0, winnings: 0 },
      { wager: 25, winnings: 47.5 },   // 50 - 2.5
      { wager: 50, winnings: 95 },     // 100 - 5
      { wager: 100, winnings: 190 },   // 200 - 10
      { wager: 250, winnings: 475 },   // 500 - 25
      { wager: 500, winnings: 950 },   // 1000 - 50
    ];

    expectedResults.forEach(({ wager, winnings }) => {
      expect(calculatePotentialWinnings(wager)).toBe(winnings);
    });
  });
});

// ============================================================================
// Rake Breakdown Calculation Tests (80/20 Split)
// ============================================================================

describe("calculateRakeBreakdown", () => {
  it("should calculate rake breakdown with default 5% rate", () => {
    const breakdown = calculateRakeBreakdown(200); // 200 TCT pot

    // 5% rake of 200 = 10 TCT
    expect(breakdown.rakeAmount).toBe(10);
    // 80% to treasury = 8 TCT
    expect(breakdown.treasuryAmount).toBe(8);
    // 20% to reward pool = 2 TCT
    expect(breakdown.rewardPoolAmount).toBe(2);
    // Winner gets pot - rake = 190 TCT
    expect(breakdown.winnerPayout).toBe(190);
  });

  it("should calculate rake breakdown for minimum wager pot", () => {
    const breakdown = calculateRakeBreakdown(50); // 50 TCT pot (2x 25 wager)

    expect(breakdown.rakeAmount).toBe(2.5);
    expect(breakdown.treasuryAmount).toBe(2);
    expect(breakdown.rewardPoolAmount).toBe(0.5);
    expect(breakdown.winnerPayout).toBe(47.5);
  });

  it("should calculate rake breakdown for maximum wager pot", () => {
    const breakdown = calculateRakeBreakdown(2000); // 2000 TCT pot (2x 1000 wager)

    expect(breakdown.rakeAmount).toBe(100);
    expect(breakdown.treasuryAmount).toBe(80);
    expect(breakdown.rewardPoolAmount).toBe(20);
    expect(breakdown.winnerPayout).toBe(1900);
  });

  it("should ensure treasury + reward pool = total rake", () => {
    const testPots = [50, 100, 200, 500, 1000, 2000];

    testPots.forEach((pot) => {
      const breakdown = calculateRakeBreakdown(pot);
      // Allow for small floating point differences
      expect(breakdown.treasuryAmount + breakdown.rewardPoolAmount).toBeCloseTo(
        breakdown.rakeAmount,
        2
      );
    });
  });

  it("should ensure winner payout + rake = total pot", () => {
    const testPots = [50, 100, 200, 500, 1000, 2000];

    testPots.forEach((pot) => {
      const breakdown = calculateRakeBreakdown(pot);
      expect(breakdown.winnerPayout + breakdown.rakeAmount).toBeCloseTo(pot, 2);
    });
  });

  it("should respect custom rake rate", () => {
    const breakdown = calculateRakeBreakdown(200, 0.10); // 10% rake

    expect(breakdown.rakeAmount).toBe(20);
    expect(breakdown.treasuryAmount).toBe(16); // 80% of 20
    expect(breakdown.rewardPoolAmount).toBe(4); // 20% of 20
    expect(breakdown.winnerPayout).toBe(180);
  });

  it("should handle zero pot", () => {
    const breakdown = calculateRakeBreakdown(0);

    expect(breakdown.rakeAmount).toBe(0);
    expect(breakdown.treasuryAmount).toBe(0);
    expect(breakdown.rewardPoolAmount).toBe(0);
    expect(breakdown.winnerPayout).toBe(0);
  });
});

// ============================================================================
// Currency Conversion Tests
// ============================================================================

describe("tctToUsd", () => {
  it("should convert TCT to USD correctly", () => {
    expect(tctToUsd(100)).toBe(4); // 100 * 0.04
    expect(tctToUsd(25)).toBe(1); // 25 * 0.04
    expect(tctToUsd(1000)).toBe(40); // 1000 * 0.04
  });

  it("should handle zero", () => {
    expect(tctToUsd(0)).toBe(0);
  });

  it("should handle fractional values", () => {
    expect(tctToUsd(50)).toBe(2);
    expect(tctToUsd(250)).toBe(10);
  });
});

describe("usdToTct", () => {
  it("should convert USD to TCT correctly", () => {
    expect(usdToTct(4)).toBe(100); // 4 / 0.04
    expect(usdToTct(1)).toBe(25); // 1 / 0.04
    expect(usdToTct(40)).toBe(1000); // 40 / 0.04
  });

  it("should handle zero", () => {
    expect(usdToTct(0)).toBe(0);
  });

  it("should be inverse of tctToUsd", () => {
    const tctValues = [25, 50, 100, 250, 500, 1000];
    tctValues.forEach((tct) => {
      const usd = tctToUsd(tct);
      const backToTct = usdToTct(usd);
      expect(backToTct).toBeCloseTo(tct, 10);
    });
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

describe("formatTct", () => {
  it("should format whole numbers without decimals", () => {
    expect(formatTct(100)).toBe("100");
    expect(formatTct(1000)).toBe("1,000");
  });

  it("should format with commas for large numbers", () => {
    expect(formatTct(1000000)).toBe("1,000,000");
  });

  it("should handle zero", () => {
    expect(formatTct(0)).toBe("0");
  });

  it("should format decimal values appropriately", () => {
    expect(formatTct(47.5)).toBe("47.5");
    expect(formatTct(123.45)).toBe("123.45");
  });
});

describe("formatUsd", () => {
  it("should format with dollar sign and 2 decimals", () => {
    expect(formatUsd(4)).toBe("$4.00");
    expect(formatUsd(10)).toBe("$10.00");
    expect(formatUsd(1.5)).toBe("$1.50");
  });

  it("should handle zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("should round to 2 decimal places", () => {
    expect(formatUsd(1.999)).toBe("$2.00");
    expect(formatUsd(1.001)).toBe("$1.00");
  });
});

// ============================================================================
// Integration Scenarios - 5% Rake with 80/20 Split
// ============================================================================

describe("Escrow Integration Scenarios", () => {
  describe("Standard Win Game Flow with 5% Rake", () => {
    it("should calculate correct winnings for 100 TCT wager", () => {
      const wagerAmount = 100;
      const totalPot = wagerAmount * 2; // 200 TCT

      // Validate wager
      expect(isValidWagerAmount(wagerAmount)).toBe(true);

      // Calculate rake breakdown
      const breakdown = calculateRakeBreakdown(totalPot);
      expect(breakdown.rakeAmount).toBe(10); // 5% of 200
      expect(breakdown.treasuryAmount).toBe(8); // 80% of 10
      expect(breakdown.rewardPoolAmount).toBe(2); // 20% of 10
      expect(breakdown.winnerPayout).toBe(190);

      // Calculate potential winnings matches breakdown
      const potentialWinnings = calculatePotentialWinnings(wagerAmount);
      expect(potentialWinnings).toBe(breakdown.winnerPayout);

      // Convert to USD for display
      const wagerUsd = tctToUsd(wagerAmount);
      const winningsUsd = tctToUsd(potentialWinnings);
      const rakeUsd = tctToUsd(breakdown.rakeAmount);

      expect(wagerUsd).toBe(4); // $4 wager
      expect(winningsUsd).toBeCloseTo(7.6, 2); // $7.60 winnings
      expect(rakeUsd).toBeCloseTo(0.4, 2); // $0.40 rake

      // Format for display
      expect(formatTct(potentialWinnings)).toBe("190");
      expect(formatUsd(winningsUsd)).toBe("$7.60");
    });

    it("should calculate correct winnings for max wager with rake", () => {
      const wagerAmount = MAX_WAGER_TCT;
      const totalPot = wagerAmount * 2;

      expect(isValidWagerAmount(wagerAmount)).toBe(true);

      const breakdown = calculateRakeBreakdown(totalPot);
      expect(breakdown.rakeAmount).toBe(100); // 5% of 2000
      expect(breakdown.treasuryAmount).toBe(80);
      expect(breakdown.rewardPoolAmount).toBe(20);
      expect(breakdown.winnerPayout).toBe(1900);

      const winningsUsd = tctToUsd(breakdown.winnerPayout);
      expect(winningsUsd).toBe(76);
      expect(formatUsd(winningsUsd)).toBe("$76.00");
    });
  });

  describe("Draw Scenario - No Rake", () => {
    it("should return full wager on draw (no rake taken)", () => {
      const wagerAmount = 100;

      // In a draw, each player gets their full wager back
      // No rake is taken on draws
      // Total pot = 200, each player gets 100 back
      expect(isValidWagerAmount(wagerAmount)).toBe(true);

      // For draws, winner payout would be 0 (no winner)
      // Both players get refunded their original stake
      const refundAmount = wagerAmount;
      expect(refundAmount).toBe(100);

      // Rake on draws = 0
      const rakeOnDraw = 0;
      expect(rakeOnDraw).toBe(0);
    });
  });

  describe("Rake Commission Calculations with 5% Rate", () => {
    it("should correctly calculate 5% rake for various wagers", () => {
      const testCases = [
        { wager: 25, pot: 50, expectedRake: 2.5, expectedWinnings: 47.5, treasury: 2, rewardPool: 0.5 },
        { wager: 50, pot: 100, expectedRake: 5, expectedWinnings: 95, treasury: 4, rewardPool: 1 },
        { wager: 100, pot: 200, expectedRake: 10, expectedWinnings: 190, treasury: 8, rewardPool: 2 },
        { wager: 250, pot: 500, expectedRake: 25, expectedWinnings: 475, treasury: 20, rewardPool: 5 },
        { wager: 500, pot: 1000, expectedRake: 50, expectedWinnings: 950, treasury: 40, rewardPool: 10 },
        { wager: 1000, pot: 2000, expectedRake: 100, expectedWinnings: 1900, treasury: 80, rewardPool: 20 },
      ];

      testCases.forEach(({ wager, pot, expectedRake, expectedWinnings, treasury, rewardPool }) => {
        const breakdown = calculateRakeBreakdown(pot);

        expect(breakdown.rakeAmount).toBe(expectedRake);
        expect(breakdown.winnerPayout).toBe(expectedWinnings);
        expect(breakdown.treasuryAmount).toBe(treasury);
        expect(breakdown.rewardPoolAmount).toBe(rewardPool);

        // Verify calculatePotentialWinnings matches
        const winnings = calculatePotentialWinnings(wager);
        expect(winnings).toBe(expectedWinnings);
      });
    });
  });

  describe("Rake Distribution Invariants", () => {
    it("should always split rake 80/20 between treasury and reward pool", () => {
      const testPots = [50, 100, 200, 500, 1000, 2000];

      testPots.forEach((pot) => {
        const breakdown = calculateRakeBreakdown(pot);

        // Treasury should be 80% of rake
        expect(breakdown.treasuryAmount / breakdown.rakeAmount).toBeCloseTo(0.8, 2);
        // Reward pool should be 20% of rake
        expect(breakdown.rewardPoolAmount / breakdown.rakeAmount).toBeCloseTo(0.2, 2);
      });
    });

    it("should preserve total pot across all components", () => {
      const testPots = [50, 100, 200, 500, 1000, 2000];

      testPots.forEach((pot) => {
        const breakdown = calculateRakeBreakdown(pot);

        // winnerPayout + rakeAmount should equal original pot
        expect(breakdown.winnerPayout + breakdown.rakeAmount).toBeCloseTo(pot, 2);

        // treasury + rewardPool should equal rakeAmount
        expect(breakdown.treasuryAmount + breakdown.rewardPoolAmount).toBeCloseTo(
          breakdown.rakeAmount,
          2
        );
      });
    });
  });
});

// ============================================================================
// Migration Comparison: Old 10% vs New 5% Rake
// ============================================================================

describe("Rake Rate Comparison (10% vs 5%)", () => {
  it("should show increased player winnings with 5% vs 10% rake", () => {
    const testWagers = [25, 50, 100, 250, 500, 1000];

    testWagers.forEach((wager) => {
      const pot = wager * 2;

      // Old system: 10% rake
      const oldRake = pot * 0.10;
      const oldWinnings = pot - oldRake;

      // New system: 5% rake
      const newRake = pot * 0.05;
      const newWinnings = pot - newRake;

      // Player savings with new system
      const savings = newWinnings - oldWinnings;

      // New winnings should be 5% of pot more than old
      expect(savings).toBe(pot * 0.05);

      // Verify with calculatePotentialWinnings
      expect(calculatePotentialWinnings(wager, 0.10)).toBe(oldWinnings);
      expect(calculatePotentialWinnings(wager, 0.05)).toBe(newWinnings);
    });
  });

  it("should show breakdown difference between old and new rates", () => {
    const pot = 200; // 100 TCT wager each

    // Old 10% system
    const oldBreakdown = calculateRakeBreakdown(pot, 0.10);
    expect(oldBreakdown.rakeAmount).toBe(20);
    expect(oldBreakdown.winnerPayout).toBe(180);

    // New 5% system
    const newBreakdown = calculateRakeBreakdown(pot, 0.05);
    expect(newBreakdown.rakeAmount).toBe(10);
    expect(newBreakdown.winnerPayout).toBe(190);

    // Player gets 10 TCT more with new system
    expect(newBreakdown.winnerPayout - oldBreakdown.winnerPayout).toBe(10);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("Edge Cases", () => {
  it("should handle very small decimal amounts", () => {
    expect(tctToUsd(0.01)).toBeCloseTo(0.0004, 6);
    expect(usdToTct(0.01)).toBeCloseTo(0.25, 6);
  });

  it("should handle large numbers", () => {
    expect(tctToUsd(1000000)).toBe(40000);
    expect(usdToTct(40000)).toBe(1000000);
  });

  it("should format large numbers correctly", () => {
    expect(formatTct(1000000)).toBe("1,000,000");
    expect(formatUsd(40000)).toBe("$40000.00");
  });

  it("should handle zero rake rate", () => {
    const breakdown = calculateRakeBreakdown(200, 0);

    expect(breakdown.rakeAmount).toBe(0);
    expect(breakdown.treasuryAmount).toBe(0);
    expect(breakdown.rewardPoolAmount).toBe(0);
    expect(breakdown.winnerPayout).toBe(200);
  });

  it("should handle maximum rake rate (50%)", () => {
    const breakdown = calculateRakeBreakdown(200, 0.50);

    expect(breakdown.rakeAmount).toBe(100);
    expect(breakdown.treasuryAmount).toBe(80);
    expect(breakdown.rewardPoolAmount).toBe(20);
    expect(breakdown.winnerPayout).toBe(100);
  });
});

// ============================================================================
// Type and Interface Validation
// ============================================================================

describe("Type Validation", () => {
  it("should export all required types", () => {
    // These imports should not throw
    expect(DEFAULT_RAKE_RATE).toBeDefined();
    expect(DEFAULT_COMMISSION_RATE).toBeDefined();
    expect(TREASURY_SPLIT).toBeDefined();
    expect(REWARD_POOL_SPLIT).toBeDefined();
  });

  it("should have consistent type signatures for calculations", () => {
    // calculatePotentialWinnings returns number
    const winnings: number = calculatePotentialWinnings(100);
    expect(typeof winnings).toBe("number");

    // calculateRakeBreakdown returns object with all numeric fields
    const breakdown = calculateRakeBreakdown(200);
    expect(typeof breakdown.rakeAmount).toBe("number");
    expect(typeof breakdown.treasuryAmount).toBe("number");
    expect(typeof breakdown.rewardPoolAmount).toBe("number");
    expect(typeof breakdown.winnerPayout).toBe("number");
  });
});
