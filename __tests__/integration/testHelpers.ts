/**
 * Integration Test Helpers
 *
 * Utilities for integration testing that simulate real app behavior.
 * These helpers provide mock implementations and test fixtures for:
 * - User creation and authentication
 * - Game session management
 * - Challenge/matchmaking flows
 * - Wallet operations
 */

import { Chess } from "chess.js";

// ============================================================================
// Types
// ============================================================================

export interface MockUser {
  id: string;
  username: string;
  email: string;
  avatar_index: number;
  elo_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  balance_tct: number;
  locked_tct: number;
  created_at: string;
}

export interface MockGame {
  id: string;
  white_player_id: string;
  black_player_id: string;
  status: "pending" | "active" | "completed" | "abandoned" | "cancelled";
  current_fen: string;
  current_turn: "w" | "b";
  time_control_seconds: number;
  increment_seconds: number;
  white_time_remaining: number;
  black_time_remaining: number;
  wager_tct: number;
  is_rated: boolean;
  winner_id: string | null;
  result_reason: string | null;
  move_count: number;
  pgn: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface MockChallenge {
  id: string;
  room_code: string;
  creator_id: string;
  opponent_id: string | null;
  wager_tct: number;
  time_control_seconds: number;
  increment_seconds: number;
  creator_color_preference: "white" | "black" | "random";
  is_public: boolean;
  is_rated: boolean;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  game_id: string | null;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

export interface MockEscrow {
  id: string;
  game_id: string;
  white_player_id: string;
  black_player_id: string;
  white_wager_tct: number;
  black_wager_tct: number;
  total_pool_tct: number;
  commission_rate: number;
  status: "active" | "settled" | "refunded" | "disputed";
  winner_id: string | null;
  winner_payout_tct: number | null;
  commission_tct: number | null;
  settled_at: string | null;
  created_at: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

let userIdCounter = 1;
let gameIdCounter = 1;
let challengeIdCounter = 1;
let escrowIdCounter = 1;

/**
 * Create a mock user with default values
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = `user-${userIdCounter++}`;
  return {
    id,
    username: `Player${userIdCounter}`,
    email: `player${userIdCounter}@test.com`,
    avatar_index: Math.floor(Math.random() * 30),
    elo_rating: 1200,
    games_played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    balance_tct: 1000,
    locked_tct: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock game with default values
 */
export function createMockGame(
  whitePlayer: MockUser,
  blackPlayer: MockUser,
  overrides: Partial<MockGame> = {}
): MockGame {
  const id = `game-${gameIdCounter++}`;
  return {
    id,
    white_player_id: whitePlayer.id,
    black_player_id: blackPlayer.id,
    status: "active",
    current_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    current_turn: "w",
    time_control_seconds: 300,
    increment_seconds: 3,
    white_time_remaining: 300,
    black_time_remaining: 300,
    wager_tct: 0,
    is_rated: true,
    winner_id: null,
    result_reason: null,
    move_count: 0,
    pgn: "",
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    ended_at: null,
    ...overrides,
  };
}

/**
 * Create a mock challenge with default values
 */
export function createMockChallenge(
  creator: MockUser,
  overrides: Partial<MockChallenge> = {}
): MockChallenge {
  const id = `challenge-${challengeIdCounter++}`;
  return {
    id,
    room_code: generateRoomCode(),
    creator_id: creator.id,
    opponent_id: null,
    wager_tct: 0,
    time_control_seconds: 300,
    increment_seconds: 3,
    creator_color_preference: "random",
    is_public: true,
    is_rated: true,
    status: "pending",
    game_id: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    accepted_at: null,
    ...overrides,
  };
}

/**
 * Create a mock escrow with default values
 */
export function createMockEscrow(
  game: MockGame,
  wagerAmount: number
): MockEscrow {
  const id = `escrow-${escrowIdCounter++}`;
  return {
    id,
    game_id: game.id,
    white_player_id: game.white_player_id,
    black_player_id: game.black_player_id,
    white_wager_tct: wagerAmount,
    black_wager_tct: wagerAmount,
    total_pool_tct: wagerAmount * 2,
    commission_rate: 0.1,
    status: "active",
    winner_id: null,
    winner_payout_tct: null,
    commission_tct: null,
    settled_at: null,
    created_at: new Date().toISOString(),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random room code
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Reset all counters (call in beforeEach)
 */
export function resetCounters(): void {
  userIdCounter = 1;
  gameIdCounter = 1;
  challengeIdCounter = 1;
  escrowIdCounter = 1;
}

// ============================================================================
// Game Simulation Helpers
// ============================================================================

/**
 * Simulate a series of moves on a game
 */
export function simulateGame(
  game: MockGame,
  moves: string[]
): { game: MockGame; chess: Chess } {
  const chess = new Chess(game.current_fen);

  for (const move of moves) {
    const result = chess.move(move);
    if (!result) {
      throw new Error(`Invalid move: ${move}`);
    }
    game.move_count++;
    game.current_turn = chess.turn();
  }

  game.current_fen = chess.fen();
  game.pgn = chess.pgn();

  return { game, chess };
}

/**
 * Complete a game with a winner
 */
export function completeGame(
  game: MockGame,
  winnerId: string,
  reason: string = "checkmate"
): MockGame {
  return {
    ...game,
    status: "completed",
    winner_id: winnerId,
    result_reason: reason,
    ended_at: new Date().toISOString(),
  };
}

/**
 * Complete a game as a draw
 */
export function completeGameAsDraw(
  game: MockGame,
  reason: string = "agreement"
): MockGame {
  return {
    ...game,
    status: "completed",
    winner_id: null,
    result_reason: reason,
    ended_at: new Date().toISOString(),
  };
}

// ============================================================================
// Balance Simulation Helpers
// ============================================================================

/**
 * Lock funds for a wager
 */
export function lockFunds(user: MockUser, amount: number): MockUser {
  if (user.balance_tct < amount) {
    throw new Error("Insufficient balance");
  }
  return {
    ...user,
    balance_tct: user.balance_tct - amount,
    locked_tct: user.locked_tct + amount,
  };
}

/**
 * Unlock funds (refund)
 */
export function unlockFunds(user: MockUser, amount: number): MockUser {
  return {
    ...user,
    balance_tct: user.balance_tct + amount,
    locked_tct: user.locked_tct - amount,
  };
}

/**
 * Settle escrow - payout to winner
 */
export function settleEscrow(
  escrow: MockEscrow,
  winnerId: string | null
): {
  escrow: MockEscrow;
  winnerPayout: number;
  loserRefund: number;
  commission: number;
} {
  const commission = escrow.total_pool_tct * escrow.commission_rate * 0.5; // Commission on wager, not pool

  if (winnerId === null) {
    // Draw - refund both players
    return {
      escrow: {
        ...escrow,
        status: "settled",
        winner_id: null,
        winner_payout_tct: escrow.white_wager_tct,
        commission_tct: 0,
        settled_at: new Date().toISOString(),
      },
      winnerPayout: 0,
      loserRefund: 0,
      commission: 0,
    };
  }

  const winnerPayout = escrow.total_pool_tct - commission;

  return {
    escrow: {
      ...escrow,
      status: "settled",
      winner_id: winnerId,
      winner_payout_tct: winnerPayout,
      commission_tct: commission,
      settled_at: new Date().toISOString(),
    },
    winnerPayout,
    loserRefund: 0,
    commission,
  };
}

// ============================================================================
// ELO Simulation Helpers
// ============================================================================

/**
 * Update player ratings after a game
 */
export function updateRatings(
  winner: MockUser,
  loser: MockUser,
  isDraw: boolean = false
): { winner: MockUser; loser: MockUser } {
  // Simplified ELO calculation for testing
  const K = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loser.elo_rating - winner.elo_rating) / 400));
  const expectedLoser = 1 - expectedWinner;

  let winnerChange: number;
  let loserChange: number;

  if (isDraw) {
    winnerChange = Math.round(K * (0.5 - expectedWinner));
    loserChange = Math.round(K * (0.5 - expectedLoser));
  } else {
    winnerChange = Math.round(K * (1 - expectedWinner));
    loserChange = Math.round(K * (0 - expectedLoser));
  }

  return {
    winner: {
      ...winner,
      elo_rating: Math.max(100, winner.elo_rating + winnerChange),
      games_played: winner.games_played + 1,
      wins: isDraw ? winner.wins : winner.wins + 1,
      draws: isDraw ? winner.draws + 1 : winner.draws,
    },
    loser: {
      ...loser,
      elo_rating: Math.max(100, loser.elo_rating + loserChange),
      games_played: loser.games_played + 1,
      losses: isDraw ? loser.losses : loser.losses + 1,
      draws: isDraw ? loser.draws + 1 : loser.draws,
    },
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a game is in a valid state
 */
export function assertValidGameState(game: MockGame): void {
  expect(game.id).toBeTruthy();
  expect(game.white_player_id).toBeTruthy();
  expect(game.black_player_id).toBeTruthy();
  expect(["pending", "active", "completed", "abandoned", "cancelled"]).toContain(game.status);
  expect(["w", "b"]).toContain(game.current_turn);
  expect(game.move_count).toBeGreaterThanOrEqual(0);
}

/**
 * Assert that a user has valid balance state
 */
export function assertValidBalanceState(user: MockUser): void {
  expect(user.balance_tct).toBeGreaterThanOrEqual(0);
  expect(user.locked_tct).toBeGreaterThanOrEqual(0);
}

/**
 * Assert that escrow was settled correctly
 */
export function assertValidSettlement(
  escrow: MockEscrow,
  expectedWinner: string | null
): void {
  expect(escrow.status).toBe("settled");
  expect(escrow.winner_id).toBe(expectedWinner);
  expect(escrow.settled_at).toBeTruthy();

  if (expectedWinner) {
    expect(escrow.winner_payout_tct).toBeGreaterThan(0);
    expect(escrow.commission_tct).toBeGreaterThanOrEqual(0);
  }
}

export default {
  createMockUser,
  createMockGame,
  createMockChallenge,
  createMockEscrow,
  generateRoomCode,
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
};
