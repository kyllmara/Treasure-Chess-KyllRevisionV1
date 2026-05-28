/**
 * Tournament Bracket Tests
 *
 * Tests for bracket generation, Swiss pairing, and standings calculations.
 */

import {
  buildBracketTree,
  organizeMatchesByRound,
  calculateBracketDimensions,
  getMatchPosition,
  calculateSwissStandings,
  formatScore,
  getScoreBreakdown,
  getKnockoutRoundName,
  getSwissRoundName,
  isMatchReady,
  isBye,
  getOpponent,
  didPlayerWin,
  getMatchResult,
  generateBracketSeeding,
  getFirstRoundMatchups,
  validateBracket,
} from "@/lib/tournamentBracket";
import type { TournamentMatch, TournamentRegistration } from "@/lib/tournament.types";

// ============================================================================
// Test Data Factories
// ============================================================================

function createMatch(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: `match-${Math.random().toString(36).substr(2, 9)}`,
    tournament_id: "tournament-1",
    round: 1,
    match_number: 1,
    bracket_position: null,
    player1_id: "player-1",
    player2_id: "player-2",
    player1_seed: 1,
    player2_seed: 2,
    winner_id: null,
    game_id: null,
    player1_score: 0,
    player2_score: 0,
    status: "pending",
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    next_match_id: null,
    next_match_slot: null,
    ...overrides,
  };
}

function createRegistration(overrides: Partial<TournamentRegistration> = {}): TournamentRegistration {
  return {
    id: `reg-${Math.random().toString(36).substr(2, 9)}`,
    tournament_id: "tournament-1",
    user_id: `user-${Math.random().toString(36).substr(2, 9)}`,
    seed: null,
    score: 0,
    buchholz_score: 0,
    sonneborn_berger: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    is_eliminated: false,
    final_place: null,
    registered_at: new Date().toISOString(),
    checked_in_at: null,
    entry_fee_paid: 0,
    entry_fee_refunded: false,
    ...overrides,
  };
}

// ============================================================================
// Bracket Building Tests
// ============================================================================

describe("Bracket Building", () => {
  describe("buildBracketTree", () => {
    it("should return null for empty matches array", () => {
      const result = buildBracketTree([]);
      expect(result).toBeNull();
    });

    it("should build tree for single match final", () => {
      const finalMatch = createMatch({
        id: "final",
        round: 1,
        match_number: 1,
      });

      const result = buildBracketTree([finalMatch]);

      expect(result).not.toBeNull();
      expect(result!.match.id).toBe("final");
      expect(result!.round).toBe(1);
      expect(result!.children).toEqual([null, null]);
    });

    it("should build tree for 4-player bracket", () => {
      const sf1 = createMatch({
        id: "sf1",
        round: 1,
        match_number: 1,
        next_match_id: "final",
        next_match_slot: 1,
      });
      const sf2 = createMatch({
        id: "sf2",
        round: 1,
        match_number: 2,
        next_match_id: "final",
        next_match_slot: 2,
      });
      const final = createMatch({
        id: "final",
        round: 2,
        match_number: 1,
      });

      const matches = [sf1, sf2, final];
      const result = buildBracketTree(matches);

      expect(result).not.toBeNull();
      expect(result!.match.id).toBe("final");
      expect(result!.children[0]?.match.id).toBe("sf1");
      expect(result!.children[1]?.match.id).toBe("sf2");
    });
  });

  describe("organizeMatchesByRound", () => {
    it("should organize matches by round number", () => {
      const matches = [
        createMatch({ round: 1, match_number: 1 }),
        createMatch({ round: 1, match_number: 2 }),
        createMatch({ round: 2, match_number: 1 }),
      ];

      const result = organizeMatchesByRound(matches);

      expect(result.get(1)?.length).toBe(2);
      expect(result.get(2)?.length).toBe(1);
    });

    it("should sort matches within each round by match number", () => {
      const matches = [
        createMatch({ round: 1, match_number: 3 }),
        createMatch({ round: 1, match_number: 1 }),
        createMatch({ round: 1, match_number: 2 }),
      ];

      const result = organizeMatchesByRound(matches);
      const round1 = result.get(1)!;

      expect(round1[0].match_number).toBe(1);
      expect(round1[1].match_number).toBe(2);
      expect(round1[2].match_number).toBe(3);
    });
  });
});

// ============================================================================
// Bracket Dimensions Tests
// ============================================================================

describe("Bracket Dimensions", () => {
  describe("calculateBracketDimensions", () => {
    it("should calculate dimensions for 8-player bracket", () => {
      const result = calculateBracketDimensions(8);

      expect(result.bracketSize).toBe(8);
      expect(result.totalRounds).toBe(3);
      expect(result.matchesPerRound).toEqual([4, 2, 1]);
    });

    it("should round up to next power of 2", () => {
      const result = calculateBracketDimensions(6);

      expect(result.bracketSize).toBe(8);
      expect(result.totalRounds).toBe(3);
    });

    it("should handle 16-player bracket", () => {
      const result = calculateBracketDimensions(16);

      expect(result.bracketSize).toBe(16);
      expect(result.totalRounds).toBe(4);
      expect(result.matchesPerRound).toEqual([8, 4, 2, 1]);
    });
  });

  describe("getMatchPosition", () => {
    it("should calculate position for first round match", () => {
      const dimensions = calculateBracketDimensions(8);
      const position = getMatchPosition(1, 1, dimensions);

      expect(position.x).toBe(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
    });

    it("should calculate increasing x for later rounds", () => {
      const dimensions = calculateBracketDimensions(8);
      const pos1 = getMatchPosition(1, 1, dimensions);
      const pos2 = getMatchPosition(2, 1, dimensions);
      const pos3 = getMatchPosition(3, 1, dimensions);

      expect(pos2.x).toBeGreaterThan(pos1.x);
      expect(pos3.x).toBeGreaterThan(pos2.x);
    });
  });
});

// ============================================================================
// Swiss Standings Tests
// ============================================================================

describe("Swiss Standings", () => {
  describe("calculateSwissStandings", () => {
    it("should sort players by score descending", () => {
      const registrations = [
        createRegistration({
          user_id: "p1",
          score: 2,
          profile: { id: "p1", username: "Player1", avatar_index: 0, elo_rating: 1200 },
        }),
        createRegistration({
          user_id: "p2",
          score: 3,
          profile: { id: "p2", username: "Player2", avatar_index: 0, elo_rating: 1200 },
        }),
        createRegistration({
          user_id: "p3",
          score: 1,
          profile: { id: "p3", username: "Player3", avatar_index: 0, elo_rating: 1200 },
        }),
      ];

      const standings = calculateSwissStandings(registrations);

      expect(standings[0].profile.username).toBe("Player2");
      expect(standings[0].rank).toBe(1);
      expect(standings[1].profile.username).toBe("Player1");
      expect(standings[1].rank).toBe(2);
      expect(standings[2].profile.username).toBe("Player3");
      expect(standings[2].rank).toBe(3);
    });

    it("should use buchholz as first tiebreaker", () => {
      const registrations = [
        createRegistration({
          user_id: "p1",
          score: 2,
          buchholz_score: 5,
          profile: { id: "p1", username: "Player1", avatar_index: 0, elo_rating: 1200 },
        }),
        createRegistration({
          user_id: "p2",
          score: 2,
          buchholz_score: 7,
          profile: { id: "p2", username: "Player2", avatar_index: 0, elo_rating: 1200 },
        }),
      ];

      const standings = calculateSwissStandings(registrations);

      expect(standings[0].profile.username).toBe("Player2");
      expect(standings[1].profile.username).toBe("Player1");
    });

    it("should use sonneborn-berger as second tiebreaker", () => {
      const registrations = [
        createRegistration({
          user_id: "p1",
          score: 2,
          buchholz_score: 5,
          sonneborn_berger: 3,
          profile: { id: "p1", username: "Player1", avatar_index: 0, elo_rating: 1200 },
        }),
        createRegistration({
          user_id: "p2",
          score: 2,
          buchholz_score: 5,
          sonneborn_berger: 5,
          profile: { id: "p2", username: "Player2", avatar_index: 0, elo_rating: 1200 },
        }),
      ];

      const standings = calculateSwissStandings(registrations);

      expect(standings[0].profile.username).toBe("Player2");
    });
  });

  describe("formatScore", () => {
    it("should format whole numbers without decimal", () => {
      expect(formatScore(3)).toBe("3");
      expect(formatScore(0)).toBe("0");
    });

    it("should format half points with one decimal", () => {
      expect(formatScore(2.5)).toBe("2.5");
      expect(formatScore(0.5)).toBe("0.5");
    });
  });

  describe("getScoreBreakdown", () => {
    it("should format W/D/L breakdown", () => {
      const reg = createRegistration({
        wins: 3,
        draws: 1,
        losses: 2,
      });

      expect(getScoreBreakdown(reg)).toBe("3W/1D/2L");
    });
  });
});

// ============================================================================
// Round Names Tests
// ============================================================================

describe("Round Names", () => {
  describe("getKnockoutRoundName", () => {
    it("should return Final for last round", () => {
      expect(getKnockoutRoundName(4, 4)).toBe("Final");
      expect(getKnockoutRoundName(3, 3)).toBe("Final");
    });

    it("should return Semifinals for second-to-last round", () => {
      expect(getKnockoutRoundName(3, 4)).toBe("Semifinals");
      expect(getKnockoutRoundName(2, 3)).toBe("Semifinals");
    });

    it("should return Quarterfinals for third-to-last round", () => {
      expect(getKnockoutRoundName(2, 4)).toBe("Quarterfinals");
    });

    it("should return Round of X for earlier rounds", () => {
      expect(getKnockoutRoundName(1, 4)).toBe("Round of 16");
      expect(getKnockoutRoundName(1, 5)).toBe("Round of 32");
    });
  });

  describe("getSwissRoundName", () => {
    it("should return Round X format", () => {
      expect(getSwissRoundName(1)).toBe("Round 1");
      expect(getSwissRoundName(5)).toBe("Round 5");
    });
  });
});

// ============================================================================
// Match Status Tests
// ============================================================================

describe("Match Status Helpers", () => {
  describe("isMatchReady", () => {
    it("should return true when pending with both players", () => {
      const match = createMatch({
        status: "pending",
        player1_id: "p1",
        player2_id: "p2",
      });

      expect(isMatchReady(match)).toBe(true);
    });

    it("should return false when not pending", () => {
      const match = createMatch({
        status: "completed",
        player1_id: "p1",
        player2_id: "p2",
      });

      expect(isMatchReady(match)).toBe(false);
    });

    it("should return false when missing player", () => {
      const match = createMatch({
        status: "pending",
        player1_id: "p1",
        player2_id: null,
      });

      expect(isMatchReady(match)).toBe(false);
    });
  });

  describe("isBye", () => {
    it("should return true for bye status", () => {
      const match = createMatch({ status: "bye" });
      expect(isBye(match)).toBe(true);
    });

    it("should return false for other statuses", () => {
      const match = createMatch({ status: "pending" });
      expect(isBye(match)).toBe(false);
    });
  });

  describe("getOpponent", () => {
    it("should return player2 when given player1", () => {
      const match = createMatch({
        player1_id: "p1",
        player2_id: "p2",
      });

      const result = getOpponent(match, "p1");

      expect(result.id).toBe("p2");
      expect(result.isPlayer1).toBe(false);
    });

    it("should return player1 when given player2", () => {
      const match = createMatch({
        player1_id: "p1",
        player2_id: "p2",
      });

      const result = getOpponent(match, "p2");

      expect(result.id).toBe("p1");
      expect(result.isPlayer1).toBe(true);
    });

    it("should return null when player not in match", () => {
      const match = createMatch({
        player1_id: "p1",
        player2_id: "p2",
      });

      const result = getOpponent(match, "p3");

      expect(result.id).toBeNull();
    });
  });

  describe("didPlayerWin", () => {
    it("should return true when player is winner", () => {
      const match = createMatch({
        winner_id: "p1",
      });

      expect(didPlayerWin(match, "p1")).toBe(true);
    });

    it("should return false when player is not winner", () => {
      const match = createMatch({
        winner_id: "p2",
      });

      expect(didPlayerWin(match, "p1")).toBe(false);
    });
  });

  describe("getMatchResult", () => {
    it("should return win when player won", () => {
      const match = createMatch({
        status: "completed",
        player1_id: "p1",
        winner_id: "p1",
      });

      expect(getMatchResult(match, "p1")).toBe("win");
    });

    it("should return loss when player lost", () => {
      const match = createMatch({
        status: "completed",
        player1_id: "p1",
        player2_id: "p2",
        winner_id: "p2",
      });

      expect(getMatchResult(match, "p1")).toBe("loss");
    });

    it("should return draw when no winner", () => {
      const match = createMatch({
        status: "completed",
        player1_id: "p1",
        winner_id: null,
      });

      expect(getMatchResult(match, "p1")).toBe("draw");
    });

    it("should return pending when match not completed", () => {
      const match = createMatch({
        status: "pending",
        player1_id: "p1",
      });

      expect(getMatchResult(match, "p1")).toBe("pending");
    });

    it("should return bye for bye matches", () => {
      const match = createMatch({
        status: "bye",
        player1_id: "p1",
        player2_id: null,
      });

      expect(getMatchResult(match, "p1")).toBe("bye");
    });
  });
});

// ============================================================================
// Seeding Tests
// ============================================================================

describe("Bracket Seeding", () => {
  describe("generateBracketSeeding", () => {
    it("should generate correct seeding for 4 players", () => {
      const seeds = generateBracketSeeding(4);

      // Standard seeding: 1 vs 4, 2 vs 3
      expect(seeds).toHaveLength(4);
      expect(seeds[0]).toBe(1);
      expect(seeds[1]).toBe(4);
      expect(seeds[2]).toBe(2);
      expect(seeds[3]).toBe(3);
    });

    it("should generate correct seeding for 8 players", () => {
      const seeds = generateBracketSeeding(8);

      expect(seeds).toHaveLength(8);
      // 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6
      expect(seeds[0]).toBe(1);
      expect(seeds[1]).toBe(8);
    });

    it("should pad to power of 2", () => {
      const seeds = generateBracketSeeding(6);

      expect(seeds).toHaveLength(8);
    });
  });

  describe("getFirstRoundMatchups", () => {
    it("should generate matchups for 4 players", () => {
      const matchups = getFirstRoundMatchups(4);

      expect(matchups).toHaveLength(2);
      expect(matchups[0]).toEqual([1, 4]);
      expect(matchups[1]).toEqual([2, 3]);
    });

    it("should handle byes for non-power-of-2 players", () => {
      const matchups = getFirstRoundMatchups(3);

      // With 3 players in a 4-bracket, seed 4 gets a bye
      expect(matchups.some((m) => m[1] === null)).toBe(true);
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("Bracket Validation", () => {
  describe("validateBracket", () => {
    it("should validate correct bracket structure", () => {
      const matches = [
        createMatch({ id: "sf1", round: 1, match_number: 1, next_match_id: "final" }),
        createMatch({ id: "sf2", round: 1, match_number: 2, next_match_id: "final" }),
        createMatch({ id: "final", round: 2, match_number: 1 }),
      ];

      const result = validateBracket(matches);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect duplicate match positions", () => {
      const matches = [
        createMatch({ id: "m1", round: 1, match_number: 1 }),
        createMatch({ id: "m2", round: 1, match_number: 1 }), // Duplicate
      ];

      const result = validateBracket(matches);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    it("should detect invalid next_match references", () => {
      const matches = [
        createMatch({ id: "m1", round: 1, match_number: 1, next_match_id: "nonexistent" }),
      ];

      const result = validateBracket(matches);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid next_match_id"))).toBe(true);
    });
  });
});
