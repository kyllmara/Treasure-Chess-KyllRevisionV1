/**
 * Tournament Flow E2E Tests
 *
 * Tests the complete tournament lifecycle from creation to prize distribution.
 * These tests simulate the entire flow without requiring actual database connections.
 */

import {
  generateBracketSeeding,
  getFirstRoundMatchups,
  calculateSwissStandings,
  validateBracket,
  buildBracketTree,
  organizeMatchesByRound,
  isMatchReady,
  getMatchResult,
  formatScore,
} from "@/lib/tournamentBracket";
import {
  formatTournamentStatus,
  formatTournamentType,
  isRegistrationOpen,
  calculatePrizeAmount,
  formatPlace,
} from "@/lib/tournament";
import type {
  Tournament,
  TournamentRegistration,
  TournamentMatch,
} from "@/lib/tournament.types";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockTournament(
  overrides: Partial<Tournament> = {}
): Tournament {
  return {
    id: "tournament-1",
    name: "Test Championship",
    description: "A test tournament",
    type: "knockout",
    entry_fee_tct: 100,
    prize_pool_tct: 1000,
    rake_percentage: 5,
    min_players: 4,
    max_players: 8,
    current_players: 0,
    start_time: new Date(Date.now() + 3600000).toISOString(),
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

function createMockRegistration(
  tournamentId: string,
  userId: string,
  seed: number
): TournamentRegistration {
  return {
    id: `reg-${userId}`,
    tournament_id: tournamentId,
    user_id: userId,
    seed,
    score: 0,
    buchholz_score: 0,
    sonneborn_berger: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    is_eliminated: false,
    final_place: null,
    registered_at: new Date().toISOString(),
    checked_in_at: new Date().toISOString(),
    entry_fee_paid: 100,
    entry_fee_refunded: false,
    profile: {
      id: userId,
      username: `Player${seed}`,
      avatar_index: seed % 10,
      elo_rating: 1200 + seed * 50,
    },
  };
}

function createMockMatch(
  tournamentId: string,
  round: number,
  matchNumber: number,
  player1Id: string | null,
  player2Id: string | null,
  overrides: Partial<TournamentMatch> = {}
): TournamentMatch {
  return {
    id: `match-r${round}-m${matchNumber}`,
    tournament_id: tournamentId,
    round,
    match_number: matchNumber,
    bracket_position: null,
    player1_id: player1Id,
    player2_id: player2Id,
    player1_seed: player1Id ? parseInt(player1Id.replace("player-", "")) : null,
    player2_seed: player2Id ? parseInt(player2Id.replace("player-", "")) : null,
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

// ============================================================================
// Knockout Tournament Flow Tests
// ============================================================================

describe("Knockout Tournament Flow", () => {
  describe("8-Player Knockout Tournament", () => {
    let tournament: Tournament;
    let registrations: TournamentRegistration[];
    let matches: TournamentMatch[];

    beforeEach(() => {
      // Create tournament
      tournament = createMockTournament({
        id: "knockout-8",
        name: "8-Player Knockout",
        type: "knockout",
        max_players: 8,
        prize_pool_tct: 800,
      });

      // Register 8 players
      registrations = [];
      for (let i = 1; i <= 8; i++) {
        registrations.push(
          createMockRegistration(tournament.id, `player-${i}`, i)
        );
      }
      tournament.current_players = 8;

      // Generate bracket
      matches = [];
      const seeding = generateBracketSeeding(8);
      const matchups = getFirstRoundMatchups(8);

      // Create round 1 matches (quarterfinals)
      for (let i = 0; i < matchups.length; i++) {
        const [seed1, seed2] = matchups[i];
        matches.push(
          createMockMatch(
            tournament.id,
            1,
            i + 1,
            seed1 ? `player-${seed1}` : null,
            seed2 ? `player-${seed2}` : null,
            {
              next_match_id: `match-r2-m${Math.floor(i / 2) + 1}`,
              next_match_slot: (i % 2) + 1,
            }
          )
        );
      }

      // Create round 2 matches (semifinals)
      matches.push(
        createMockMatch(tournament.id, 2, 1, null, null, {
          next_match_id: "match-r3-m1",
          next_match_slot: 1,
        })
      );
      matches.push(
        createMockMatch(tournament.id, 2, 2, null, null, {
          next_match_id: "match-r3-m1",
          next_match_slot: 2,
        })
      );

      // Create final match
      matches.push(createMockMatch(tournament.id, 3, 1, null, null));
    });

    it("should create valid bracket structure", () => {
      const validation = validateBracket(matches);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should generate correct seeding for 8 players", () => {
      const seeding = generateBracketSeeding(8);
      expect(seeding).toHaveLength(8);

      // Standard seeding: 1v8, 4v5, 2v7, 3v6
      expect(seeding[0]).toBe(1);
      expect(seeding[1]).toBe(8);
    });

    it("should have 3 rounds for 8 players", () => {
      const roundMap = organizeMatchesByRound(matches);
      expect(roundMap.size).toBe(3);
      expect(roundMap.get(1)?.length).toBe(4); // Quarterfinals
      expect(roundMap.get(2)?.length).toBe(2); // Semifinals
      expect(roundMap.get(3)?.length).toBe(1); // Final
    });

    it("should identify ready matches correctly", () => {
      const qfMatches = matches.filter((m) => m.round === 1);

      for (const match of qfMatches) {
        expect(isMatchReady(match)).toBe(true);
      }

      // Semifinal matches are not ready (no players yet)
      const sfMatches = matches.filter((m) => m.round === 2);
      for (const match of sfMatches) {
        expect(isMatchReady(match)).toBe(false);
      }
    });

    it("should advance winners correctly", () => {
      // Simulate quarterfinal results
      const qfResults = [
        { matchIndex: 0, winnerId: "player-1" },
        { matchIndex: 1, winnerId: "player-4" },
        { matchIndex: 2, winnerId: "player-2" },
        { matchIndex: 3, winnerId: "player-3" },
      ];

      // Apply results
      for (const result of qfResults) {
        const match = matches[result.matchIndex];
        match.winner_id = result.winnerId;
        match.status = "completed";
      }

      // Verify semifinal matchups would be correct
      // SF1: Winner of QF1 vs Winner of QF2 (1 vs 4)
      // SF2: Winner of QF3 vs Winner of QF4 (2 vs 3)
      const expectedSF1Players = ["player-1", "player-4"];
      const expectedSF2Players = ["player-2", "player-3"];

      // Verify all matches report correct results
      for (const match of matches.filter((m) => m.round === 1)) {
        if (match.winner_id) {
          const result = getMatchResult(match, match.winner_id);
          expect(result).toBe("win");

          const loserId = match.player1_id === match.winner_id
            ? match.player2_id
            : match.player1_id;
          if (loserId) {
            expect(getMatchResult(match, loserId)).toBe("loss");
          }
        }
      }
    });

    it("should build bracket tree correctly", () => {
      const tree = buildBracketTree(matches);

      expect(tree).not.toBeNull();
      expect(tree!.round).toBe(3); // Final round
      expect(tree!.children[0]).not.toBeNull(); // SF1
      expect(tree!.children[1]).not.toBeNull(); // SF2
    });

    it("should calculate prizes correctly", () => {
      const prizePool = tournament.prize_pool_tct;

      expect(calculatePrizeAmount(prizePool, 50)).toBe(400); // 1st: 50%
      expect(calculatePrizeAmount(prizePool, 30)).toBe(240); // 2nd: 30%
      expect(calculatePrizeAmount(prizePool, 20)).toBe(160); // 3rd: 20%
    });
  });

  describe("Tournament with Byes", () => {
    it("should handle 6-player tournament with byes", () => {
      const matchups = getFirstRoundMatchups(6);

      // Should have 4 first-round matches (bracket size 8)
      // Seeds 1 and 2 get byes (they face null opponents who are > playerCount)
      const byeCount = matchups.filter((m) => m[1] === null).length;
      expect(byeCount).toBe(2);
    });

    it("should handle 5-player tournament with byes", () => {
      const matchups = getFirstRoundMatchups(5);

      // Seeds 1, 2, 3 get byes
      const byeCount = matchups.filter((m) => m[1] === null).length;
      expect(byeCount).toBe(3);
    });
  });
});

// ============================================================================
// Swiss Tournament Flow Tests
// ============================================================================

describe("Swiss Tournament Flow", () => {
  describe("8-Player Swiss Tournament", () => {
    let tournament: Tournament;
    let registrations: TournamentRegistration[];

    beforeEach(() => {
      tournament = createMockTournament({
        id: "swiss-8",
        name: "8-Player Swiss",
        type: "swiss",
        max_players: 8,
        rounds: 3,
        current_round: 0,
      });

      registrations = [];
      for (let i = 1; i <= 8; i++) {
        registrations.push(
          createMockRegistration(tournament.id, `player-${i}`, i)
        );
      }
      tournament.current_players = 8;
    });

    it("should start with all players at 0 score", () => {
      const standings = calculateSwissStandings(registrations);

      expect(standings).toHaveLength(8);
      for (const standing of standings) {
        expect(standing.registration.score).toBe(0);
      }
    });

    it("should update standings after round 1", () => {
      // Simulate round 1 results: players 1-4 win
      registrations[0].wins = 1;
      registrations[0].score = 1;
      registrations[1].wins = 1;
      registrations[1].score = 1;
      registrations[2].wins = 1;
      registrations[2].score = 1;
      registrations[3].wins = 1;
      registrations[3].score = 1;
      registrations[4].losses = 1;
      registrations[5].losses = 1;
      registrations[6].losses = 1;
      registrations[7].losses = 1;

      const standings = calculateSwissStandings(registrations);

      // Top 4 should have 1 point, bottom 4 should have 0
      expect(standings[0].registration.score).toBe(1);
      expect(standings[4].registration.score).toBe(0);
    });

    it("should use tiebreakers correctly", () => {
      // Two players with same score but different buchholz
      registrations[0].score = 2;
      registrations[0].buchholz_score = 3;
      registrations[1].score = 2;
      registrations[1].buchholz_score = 5;

      const standings = calculateSwissStandings(registrations);

      // Player with higher buchholz should rank higher
      expect(standings[0].registration.user_id).toBe("player-2");
      expect(standings[1].registration.user_id).toBe("player-1");
    });

    it("should format scores correctly", () => {
      expect(formatScore(3)).toBe("3");
      expect(formatScore(2.5)).toBe("2.5");
      expect(formatScore(0)).toBe("0");
    });
  });
});

// ============================================================================
// Registration Flow Tests
// ============================================================================

describe("Tournament Registration Flow", () => {
  it("should allow registration when status is registration", () => {
    const tournament = createMockTournament({
      status: "registration",
      current_players: 5,
      max_players: 8,
    });

    expect(isRegistrationOpen(tournament)).toBe(true);
  });

  it("should block registration when tournament is full", () => {
    const tournament = createMockTournament({
      status: "registration",
      current_players: 8,
      max_players: 8,
    });

    expect(isRegistrationOpen(tournament)).toBe(false);
  });

  it("should block registration when tournament is active", () => {
    const tournament = createMockTournament({
      status: "active",
      current_players: 8,
      max_players: 8,
    });

    expect(isRegistrationOpen(tournament)).toBe(false);
  });

  it("should respect registration deadline", () => {
    const pastDeadline = createMockTournament({
      status: "registration",
      registration_deadline: new Date(Date.now() - 3600000).toISOString(),
    });

    const futureDeadline = createMockTournament({
      status: "registration",
      registration_deadline: new Date(Date.now() + 3600000).toISOString(),
    });

    expect(isRegistrationOpen(pastDeadline)).toBe(false);
    expect(isRegistrationOpen(futureDeadline)).toBe(true);
  });

  it("should respect registration opens at time", () => {
    const notYetOpen = createMockTournament({
      status: "registration",
      registration_opens_at: new Date(Date.now() + 3600000).toISOString(),
    });

    const alreadyOpen = createMockTournament({
      status: "registration",
      registration_opens_at: new Date(Date.now() - 3600000).toISOString(),
    });

    expect(isRegistrationOpen(notYetOpen)).toBe(false);
    expect(isRegistrationOpen(alreadyOpen)).toBe(true);
  });
});

// ============================================================================
// Prize Distribution Tests
// ============================================================================

describe("Prize Distribution Flow", () => {
  it("should calculate standard prize distribution", () => {
    const prizePool = 1000;

    // Standard 50/30/20 distribution
    expect(calculatePrizeAmount(prizePool, 50)).toBe(500);
    expect(calculatePrizeAmount(prizePool, 30)).toBe(300);
    expect(calculatePrizeAmount(prizePool, 20)).toBe(200);

    // Total should equal prize pool
    const total =
      calculatePrizeAmount(prizePool, 50) +
      calculatePrizeAmount(prizePool, 30) +
      calculatePrizeAmount(prizePool, 20);
    expect(total).toBe(1000);
  });

  it("should handle rounding for odd prize pools", () => {
    const prizePool = 999;

    // Prizes are floored
    expect(calculatePrizeAmount(prizePool, 50)).toBe(499);
    expect(calculatePrizeAmount(prizePool, 30)).toBe(299);
    expect(calculatePrizeAmount(prizePool, 20)).toBe(199);
  });

  it("should format places correctly", () => {
    expect(formatPlace(1)).toBe("1st");
    expect(formatPlace(2)).toBe("2nd");
    expect(formatPlace(3)).toBe("3rd");
    expect(formatPlace(4)).toBe("4th");
    expect(formatPlace(11)).toBe("11th");
    expect(formatPlace(21)).toBe("21st");
    expect(formatPlace(22)).toBe("22nd");
    expect(formatPlace(23)).toBe("23rd");
  });
});

// ============================================================================
// Tournament Status Transitions
// ============================================================================

describe("Tournament Status Transitions", () => {
  it("should display correct status text", () => {
    expect(formatTournamentStatus("draft")).toBe("Coming Soon");
    expect(formatTournamentStatus("registration")).toBe("Registration Open");
    expect(formatTournamentStatus("starting")).toBe("Starting Soon");
    expect(formatTournamentStatus("active")).toBe("In Progress");
    expect(formatTournamentStatus("completed")).toBe("Completed");
    expect(formatTournamentStatus("cancelled")).toBe("Cancelled");
  });

  it("should display correct type text", () => {
    expect(formatTournamentType("knockout")).toBe("Knockout");
    expect(formatTournamentType("swiss")).toBe("Swiss");
    expect(formatTournamentType("arena")).toBe("Arena");
  });
});

// ============================================================================
// Full Tournament Lifecycle Simulation
// ============================================================================

describe("Full Tournament Lifecycle", () => {
  it("should simulate complete 4-player knockout tournament", () => {
    // Phase 1: Setup
    const tournament = createMockTournament({
      id: "full-test",
      type: "knockout",
      max_players: 4,
      prize_pool_tct: 400,
      status: "registration",
    });

    // Phase 2: Registration
    const players = ["alice", "bob", "charlie", "david"];

    // Registration starts with 0 players
    expect(isRegistrationOpen(tournament)).toBe(true);

    // Register all players
    const registrations = players.map((name, i) =>
      createMockRegistration(tournament.id, name, i + 1)
    );
    tournament.current_players = 4;

    // Registration is now closed (tournament is full)
    expect(isRegistrationOpen(tournament)).toBe(false);

    // Phase 3: Start Tournament
    tournament.status = "active";
    tournament.current_round = 1;

    expect(isRegistrationOpen(tournament)).toBe(false);
    expect(formatTournamentStatus(tournament.status)).toBe("In Progress");

    // Phase 4: Generate Bracket
    const matchups = getFirstRoundMatchups(4);
    expect(matchups).toEqual([
      [1, 4], // alice vs david
      [2, 3], // bob vs charlie
    ]);

    // Create matches
    const matches: TournamentMatch[] = [
      createMockMatch(tournament.id, 1, 1, "alice", "david", {
        next_match_id: "final",
        next_match_slot: 1,
      }),
      createMockMatch(tournament.id, 1, 2, "bob", "charlie", {
        next_match_id: "final",
        next_match_slot: 2,
      }),
      createMockMatch(tournament.id, 2, 1, null, null, {
        id: "final",
      }),
    ];

    // Phase 5: Play Semifinals
    matches[0].winner_id = "alice";
    matches[0].status = "completed";
    matches[1].winner_id = "bob";
    matches[1].status = "completed";

    // Advance to final
    matches[2].player1_id = "alice";
    matches[2].player2_id = "bob";

    expect(isMatchReady(matches[2])).toBe(true);

    // Phase 6: Play Final
    matches[2].winner_id = "alice";
    matches[2].status = "completed";

    // Phase 7: Finalize
    tournament.status = "completed";
    tournament.completed_at = new Date().toISOString();

    // Verify results
    expect(getMatchResult(matches[2], "alice")).toBe("win");
    expect(getMatchResult(matches[2], "bob")).toBe("loss");

    // Phase 8: Prize Distribution
    const prizes = {
      1: calculatePrizeAmount(tournament.prize_pool_tct, 50), // 200
      2: calculatePrizeAmount(tournament.prize_pool_tct, 30), // 120
      3: calculatePrizeAmount(tournament.prize_pool_tct, 20), // 80
    };

    expect(prizes[1]).toBe(200);
    expect(prizes[2]).toBe(120);
    expect(prizes[3]).toBe(80);

    // Verify total prizes
    expect(prizes[1] + prizes[2] + prizes[3]).toBe(400);
  });

  it("should simulate complete Swiss tournament", () => {
    // Setup Swiss tournament
    const tournament = createMockTournament({
      id: "swiss-full",
      type: "swiss",
      max_players: 4,
      rounds: 2,
      prize_pool_tct: 400,
      status: "registration",
    });

    // Register players with different ratings
    const players = [
      { id: "p1", rating: 1400 },
      { id: "p2", rating: 1300 },
      { id: "p3", rating: 1200 },
      { id: "p4", rating: 1100 },
    ];

    const registrations = players.map((p, i) =>
      createMockRegistration(tournament.id, p.id, i + 1)
    );

    // Start tournament
    tournament.status = "active";
    tournament.current_round = 1;

    // Round 1: Top seeds vs bottom seeds
    // p1 beats p4, p2 beats p3
    registrations[0].wins = 1;
    registrations[0].score = 1;
    registrations[1].wins = 1;
    registrations[1].score = 1;
    registrations[2].losses = 1;
    registrations[3].losses = 1;

    // Update buchholz (opponent's scores)
    registrations[0].buchholz_score = 0; // p4's score
    registrations[1].buchholz_score = 0; // p3's score
    registrations[2].buchholz_score = 1; // p2's score
    registrations[3].buchholz_score = 1; // p1's score

    // Advance to round 2
    tournament.current_round = 2;

    // Round 2: p1 vs p2 (1-1), p3 vs p4 (0-0)
    // p1 beats p2, p3 beats p4
    registrations[0].wins = 2;
    registrations[0].score = 2;
    registrations[1].losses = 1;
    registrations[2].wins = 1;
    registrations[2].score = 1;
    registrations[2].losses = 1;
    registrations[3].losses = 2;

    // Update buchholz
    registrations[0].buchholz_score = 0 + 1; // p4 + p2
    registrations[1].buchholz_score = 0 + 2; // p3 + p1
    registrations[2].buchholz_score = 1 + 0; // p2 + p4
    registrations[3].buchholz_score = 2 + 1; // p1 + p3

    // Calculate final standings
    const standings = calculateSwissStandings(registrations);

    // p1 should be first (2 points)
    expect(standings[0].registration.user_id).toBe("p1");
    expect(standings[0].registration.score).toBe(2);

    // p2 and p3 both have 1 point, but p2 has higher buchholz
    expect(standings[1].registration.user_id).toBe("p2");
    expect(standings[2].registration.user_id).toBe("p3");

    // p4 should be last (0 points)
    expect(standings[3].registration.user_id).toBe("p4");
    expect(standings[3].registration.score).toBe(0);

    // Finalize
    tournament.status = "completed";
    expect(formatTournamentStatus(tournament.status)).toBe("Completed");
  });
});
