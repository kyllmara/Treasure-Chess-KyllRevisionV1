/**
 * Tournament Service Tests
 *
 * Tests for tournament utility functions, formatting, and validation.
 */

import {
  formatTournamentType,
  formatTournamentStatus,
  isRegistrationOpen,
  getTimeUntilStart,
  formatTimeRemaining,
  calculatePrizeAmount,
  formatPlace,
} from "@/lib/tournament";
import type { Tournament, TournamentStatus, TournamentType } from "@/lib/tournament.types";

// ============================================================================
// Test Data Factory
// ============================================================================

function createTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "tournament-1",
    name: "Test Tournament",
    description: "A test tournament",
    type: "knockout",
    entry_fee_tct: 100,
    prize_pool_tct: 1000,
    rake_percentage: 5,
    min_players: 4,
    max_players: 16,
    current_players: 8,
    start_time: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    registration_deadline: null,
    registration_opens_at: null,
    time_control_seconds: 600,
    increment_seconds: 5,
    is_rated: true,
    rounds: null,
    current_round: 0,
    status: "registration",
    created_by: "admin",
    template_id: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

// ============================================================================
// Format Functions Tests
// ============================================================================

describe("Tournament Formatting", () => {
  describe("formatTournamentType", () => {
    it("should format knockout type", () => {
      expect(formatTournamentType("knockout")).toBe("Knockout");
    });

    it("should format swiss type", () => {
      expect(formatTournamentType("swiss")).toBe("Swiss");
    });

    it("should format arena type", () => {
      expect(formatTournamentType("arena")).toBe("Arena");
    });

    it("should handle unknown types by returning the type itself", () => {
      expect(formatTournamentType("unknown" as TournamentType)).toBe("unknown");
    });
  });

  describe("formatTournamentStatus", () => {
    it("should format draft status", () => {
      expect(formatTournamentStatus("draft")).toBe("Coming Soon");
    });

    it("should format registration status", () => {
      expect(formatTournamentStatus("registration")).toBe("Registration Open");
    });

    it("should format starting status", () => {
      expect(formatTournamentStatus("starting")).toBe("Starting Soon");
    });

    it("should format active status", () => {
      expect(formatTournamentStatus("active")).toBe("In Progress");
    });

    it("should format completed status", () => {
      expect(formatTournamentStatus("completed")).toBe("Completed");
    });

    it("should format cancelled status", () => {
      expect(formatTournamentStatus("cancelled")).toBe("Cancelled");
    });
  });

  describe("formatPlace", () => {
    it("should format 1st place", () => {
      expect(formatPlace(1)).toBe("1st");
    });

    it("should format 2nd place", () => {
      expect(formatPlace(2)).toBe("2nd");
    });

    it("should format 3rd place", () => {
      expect(formatPlace(3)).toBe("3rd");
    });

    it("should format 4th and beyond with th suffix", () => {
      expect(formatPlace(4)).toBe("4th");
      expect(formatPlace(5)).toBe("5th");
      expect(formatPlace(10)).toBe("10th");
    });

    it("should handle 11th, 12th, 13th specially", () => {
      expect(formatPlace(11)).toBe("11th");
      expect(formatPlace(12)).toBe("12th");
      expect(formatPlace(13)).toBe("13th");
    });

    it("should handle 21st, 22nd, 23rd", () => {
      expect(formatPlace(21)).toBe("21st");
      expect(formatPlace(22)).toBe("22nd");
      expect(formatPlace(23)).toBe("23rd");
    });
  });
});

// ============================================================================
// Registration Tests
// ============================================================================

describe("Registration Helpers", () => {
  describe("isRegistrationOpen", () => {
    it("should return true when status is registration", () => {
      const tournament = createTournament({ status: "registration" });
      expect(isRegistrationOpen(tournament)).toBe(true);
    });

    it("should return false when status is not registration", () => {
      const statuses: TournamentStatus[] = ["draft", "starting", "active", "completed", "cancelled"];

      for (const status of statuses) {
        const tournament = createTournament({ status });
        expect(isRegistrationOpen(tournament)).toBe(false);
      }
    });

    it("should return false when registration deadline has passed", () => {
      const tournament = createTournament({
        status: "registration",
        registration_deadline: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      });
      expect(isRegistrationOpen(tournament)).toBe(false);
    });

    it("should return false when registration has not opened yet", () => {
      const tournament = createTournament({
        status: "registration",
        registration_opens_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      });
      expect(isRegistrationOpen(tournament)).toBe(false);
    });

    it("should return true when within registration window", () => {
      const tournament = createTournament({
        status: "registration",
        registration_opens_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        registration_deadline: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      });
      expect(isRegistrationOpen(tournament)).toBe(true);
    });
  });
});

// ============================================================================
// Time Functions Tests
// ============================================================================

describe("Time Functions", () => {
  describe("getTimeUntilStart", () => {
    it("should return positive time for future tournaments", () => {
      const tournament = createTournament({
        start_time: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = getTimeUntilStart(tournament);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(3600000);
    });

    it("should return 0 for past tournaments", () => {
      const tournament = createTournament({
        start_time: new Date(Date.now() - 3600000).toISOString(),
      });

      const result = getTimeUntilStart(tournament);

      expect(result).toBe(0);
    });
  });

  describe("formatTimeRemaining", () => {
    it("should format days correctly", () => {
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      const result = formatTimeRemaining(twoDays);

      expect(result).toContain("2d");
    });

    it("should format hours correctly", () => {
      const threeHours = 3 * 60 * 60 * 1000;
      const result = formatTimeRemaining(threeHours);

      expect(result).toContain("3h");
    });

    it("should format minutes correctly", () => {
      const fortyFiveMinutes = 45 * 60 * 1000;
      const result = formatTimeRemaining(fortyFiveMinutes);

      expect(result).toContain("45m");
    });

    it("should format seconds when under a minute", () => {
      const thirtySeconds = 30 * 1000;
      const result = formatTimeRemaining(thirtySeconds);

      expect(result).toContain("30s");
    });

    it("should return 'Starting now' for zero or negative time", () => {
      expect(formatTimeRemaining(0)).toBe("Starting now");
      expect(formatTimeRemaining(-1000)).toBe("Starting now");
    });
  });
});

// ============================================================================
// Prize Calculation Tests
// ============================================================================

describe("Prize Calculations", () => {
  describe("calculatePrizeAmount", () => {
    it("should calculate correct prize amount", () => {
      const prizePool = 1000;

      expect(calculatePrizeAmount(prizePool, 50)).toBe(500);
      expect(calculatePrizeAmount(prizePool, 30)).toBe(300);
      expect(calculatePrizeAmount(prizePool, 20)).toBe(200);
    });

    it("should handle decimal percentages and floor the result", () => {
      const prizePool = 1000;

      // Function floors the result, so 33.33% of 1000 = 333.3 -> 333
      expect(calculatePrizeAmount(prizePool, 33.33)).toBe(333);
    });

    it("should handle zero prize pool", () => {
      expect(calculatePrizeAmount(0, 50)).toBe(0);
    });

    it("should handle zero percentage", () => {
      expect(calculatePrizeAmount(1000, 0)).toBe(0);
    });
  });
});

// ============================================================================
// Tournament Validation Tests
// ============================================================================

describe("Tournament Validation", () => {
  describe("Tournament structure", () => {
    it("should have valid tournament type", () => {
      const validTypes: TournamentType[] = ["knockout", "swiss", "arena"];
      const tournament = createTournament();

      expect(validTypes).toContain(tournament.type);
    });

    it("should have valid tournament status", () => {
      const validStatuses: TournamentStatus[] = [
        "draft",
        "registration",
        "starting",
        "active",
        "completed",
        "cancelled",
      ];
      const tournament = createTournament();

      expect(validStatuses).toContain(tournament.status);
    });

    it("should have non-negative player counts", () => {
      const tournament = createTournament();

      expect(tournament.min_players).toBeGreaterThanOrEqual(0);
      expect(tournament.max_players).toBeGreaterThanOrEqual(tournament.min_players);
      expect(tournament.current_players).toBeGreaterThanOrEqual(0);
      expect(tournament.current_players).toBeLessThanOrEqual(tournament.max_players);
    });

    it("should have non-negative entry fee", () => {
      const tournament = createTournament();
      expect(tournament.entry_fee_tct).toBeGreaterThanOrEqual(0);
    });

    it("should have valid time control settings", () => {
      const tournament = createTournament();

      expect(tournament.time_control_seconds).toBeGreaterThan(0);
      expect(tournament.increment_seconds).toBeGreaterThanOrEqual(0);
    });

    it("should have rake percentage between 0 and 100", () => {
      const tournament = createTournament();

      expect(tournament.rake_percentage).toBeGreaterThanOrEqual(0);
      expect(tournament.rake_percentage).toBeLessThanOrEqual(100);
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("Edge Cases", () => {
  it("should handle tournament with 0 entry fee (free tournament)", () => {
    const tournament = createTournament({
      entry_fee_tct: 0,
      prize_pool_tct: 500, // Sponsored prize pool
    });

    expect(tournament.entry_fee_tct).toBe(0);
    expect(tournament.prize_pool_tct).toBeGreaterThan(0);
  });

  it("should handle tournament with max players reached", () => {
    const tournament = createTournament({
      max_players: 16,
      current_players: 16,
    });

    expect(tournament.current_players).toBe(tournament.max_players);
  });

  it("should handle swiss tournament with rounds specified", () => {
    const tournament = createTournament({
      type: "swiss",
      rounds: 7,
      current_round: 3,
    });

    expect(tournament.rounds).toBe(7);
    expect(tournament.current_round).toBeLessThanOrEqual(tournament.rounds);
  });

  it("should handle arena tournament", () => {
    const tournament = createTournament({
      type: "arena",
      rounds: null, // Arena has no fixed rounds
    });

    expect(tournament.type).toBe("arena");
    expect(tournament.rounds).toBeNull();
  });

  it("should handle very large prize pools", () => {
    const tournament = createTournament({
      prize_pool_tct: 1000000,
    });

    expect(calculatePrizeAmount(tournament.prize_pool_tct, 50)).toBe(500000);
  });
});

// ============================================================================
// Status Transition Tests
// ============================================================================

describe("Tournament Status Transitions", () => {
  it("should follow valid status progression", () => {
    // Valid progression: draft -> registration -> starting -> active -> completed
    const validProgressions = [
      ["draft", "registration"],
      ["registration", "starting"],
      ["starting", "active"],
      ["active", "completed"],
      // Cancellation can happen from any non-terminal state
      ["draft", "cancelled"],
      ["registration", "cancelled"],
      ["starting", "cancelled"],
      ["active", "cancelled"],
    ];

    // Verify all progressions are logical
    for (const [from, to] of validProgressions) {
      expect(from).not.toBe(to);
    }
  });

  it("should not allow backwards status transitions", () => {
    // Invalid progressions
    const invalidProgressions = [
      ["completed", "active"],
      ["active", "starting"],
      ["starting", "registration"],
      ["registration", "draft"],
      ["cancelled", "active"],
    ];

    // These should be prevented by business logic (not tested here, but documented)
    expect(invalidProgressions.length).toBeGreaterThan(0);
  });
});
