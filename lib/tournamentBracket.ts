/**
 * Tournament Bracket Utilities
 *
 * Functions for building and rendering tournament brackets,
 * Swiss pairing visualization, and standings calculations.
 */

import type {
  TournamentMatch,
  TournamentRegistration,
  BracketNode,
  SwissStanding,
} from './tournament.types';

// ============================================================================
// Bracket Building
// ============================================================================

/**
 * Build a bracket tree from tournament matches
 */
export function buildBracketTree(
  matches: TournamentMatch[]
): BracketNode | null {
  if (matches.length === 0) return null;

  // Find the final match (highest round, match 1)
  const maxRound = Math.max(...matches.map((m) => m.round));
  const finalMatch = matches.find(
    (m) => m.round === maxRound && m.match_number === 1
  );

  if (!finalMatch) return null;

  // Build tree recursively
  return buildNodeFromMatch(finalMatch, matches, maxRound);
}

function buildNodeFromMatch(
  match: TournamentMatch,
  allMatches: TournamentMatch[],
  totalRounds: number
): BracketNode {
  const node: BracketNode = {
    match,
    round: match.round,
    position: match.match_number,
    children: [null, null],
  };

  // Find feeder matches (previous round matches that feed into this one)
  if (match.round > 1) {
    const feederMatches = allMatches.filter(
      (m) => m.next_match_id === match.id
    );

    for (const feeder of feederMatches) {
      const childNode = buildNodeFromMatch(feeder, allMatches, totalRounds);
      if (feeder.next_match_slot === 1) {
        node.children[0] = childNode;
      } else {
        node.children[1] = childNode;
      }
    }
  }

  return node;
}

/**
 * Get matches organized by round for flat bracket display
 */
export function organizeMatchesByRound(
  matches: TournamentMatch[]
): Map<number, TournamentMatch[]> {
  const rounds = new Map<number, TournamentMatch[]>();

  for (const match of matches) {
    if (!rounds.has(match.round)) {
      rounds.set(match.round, []);
    }
    rounds.get(match.round)!.push(match);
  }

  // Sort matches within each round
  for (const [round, roundMatches] of rounds) {
    rounds.set(
      round,
      roundMatches.sort((a, b) => a.match_number - b.match_number)
    );
  }

  return rounds;
}

// ============================================================================
// Bracket Dimensions
// ============================================================================

export interface BracketDimensions {
  totalRounds: number;
  bracketSize: number;
  matchesPerRound: number[];
  width: number;
  height: number;
}

/**
 * Calculate bracket dimensions for rendering
 */
export function calculateBracketDimensions(
  playerCount: number,
  matchWidth: number = 200,
  matchHeight: number = 80,
  horizontalGap: number = 40,
  verticalGap: number = 20
): BracketDimensions {
  // Calculate bracket size (next power of 2)
  let bracketSize = 1;
  while (bracketSize < playerCount) {
    bracketSize *= 2;
  }

  const totalRounds = Math.log2(bracketSize);
  const matchesPerRound: number[] = [];

  for (let i = 0; i < totalRounds; i++) {
    matchesPerRound.push(bracketSize / Math.pow(2, i + 1));
  }

  const width = totalRounds * (matchWidth + horizontalGap);
  const height = (bracketSize / 2) * (matchHeight + verticalGap);

  return {
    totalRounds,
    bracketSize,
    matchesPerRound,
    width,
    height,
  };
}

/**
 * Get position for a match in the bracket
 */
export function getMatchPosition(
  round: number,
  matchNumber: number,
  dimensions: BracketDimensions,
  matchWidth: number = 200,
  matchHeight: number = 80,
  horizontalGap: number = 40,
  verticalGap: number = 20
): { x: number; y: number } {
  const x = (round - 1) * (matchWidth + horizontalGap);

  // Calculate vertical position
  const matchesInRound = dimensions.matchesPerRound[round - 1];
  const totalHeight = dimensions.height;
  const sectionHeight = totalHeight / matchesInRound;
  const y = (matchNumber - 0.5) * sectionHeight - matchHeight / 2;

  return { x, y };
}

/**
 * Calculate connector line points between matches
 */
export function getConnectorPoints(
  fromMatch: { x: number; y: number; width: number; height: number },
  toMatch: { x: number; y: number; height: number }
): { startX: number; startY: number; endX: number; endY: number; midX: number } {
  const startX = fromMatch.x + fromMatch.width;
  const startY = fromMatch.y + fromMatch.height / 2;
  const endX = toMatch.x;
  const endY = toMatch.y + toMatch.height / 2;
  const midX = (startX + endX) / 2;

  return { startX, startY, endX, endY, midX };
}

// ============================================================================
// Swiss Standings
// ============================================================================

/**
 * Calculate Swiss standings from registrations
 */
export function calculateSwissStandings(
  registrations: TournamentRegistration[]
): SwissStanding[] {
  // Sort by score, buchholz, sonneborn-berger, seed
  const sorted = [...registrations].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.buchholz_score !== b.buchholz_score)
      return b.buchholz_score - a.buchholz_score;
    if (a.sonneborn_berger !== b.sonneborn_berger)
      return b.sonneborn_berger - a.sonneborn_berger;
    return (a.seed || 999) - (b.seed || 999);
  });

  return sorted.map((reg, index) => ({
    registration: reg,
    rank: index + 1,
    profile: reg.profile || {
      id: reg.user_id,
      username: 'Unknown',
      avatar_index: 0,
      elo_rating: 1200,
    },
  }));
}

/**
 * Format score for display (e.g., "2.5" for 2 wins and 1 draw)
 */
export function formatScore(score: number): string {
  if (score % 1 === 0) {
    return score.toString();
  }
  return score.toFixed(1);
}

/**
 * Get score breakdown (wins/draws/losses)
 */
export function getScoreBreakdown(
  registration: TournamentRegistration
): string {
  return `${registration.wins}W/${registration.draws}D/${registration.losses}L`;
}

// ============================================================================
// Round Names
// ============================================================================

const KNOCKOUT_ROUND_NAMES: Record<number, string> = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Round of 16',
  4: 'Quarterfinals',
  5: 'Semifinals',
  6: 'Final',
};

/**
 * Get display name for a knockout round
 */
export function getKnockoutRoundName(
  round: number,
  totalRounds: number
): string {
  const roundFromEnd = totalRounds - round + 1;

  if (roundFromEnd === 1) return 'Final';
  if (roundFromEnd === 2) return 'Semifinals';
  if (roundFromEnd === 3) return 'Quarterfinals';

  const playersInRound = Math.pow(2, roundFromEnd);
  return `Round of ${playersInRound}`;
}

/**
 * Get display name for a Swiss round
 */
export function getSwissRoundName(round: number): string {
  return `Round ${round}`;
}

// ============================================================================
// Match Status Helpers
// ============================================================================

/**
 * Check if a match is ready to be played
 */
export function isMatchReady(match: TournamentMatch): boolean {
  return (
    match.status === 'pending' &&
    match.player1_id !== null &&
    match.player2_id !== null
  );
}

/**
 * Check if a match is a bye
 */
export function isBye(match: TournamentMatch): boolean {
  return match.status === 'bye';
}

/**
 * Get the opponent for a player in a match
 */
export function getOpponent(
  match: TournamentMatch,
  playerId: string
): { id: string | null; isPlayer1: boolean } {
  if (match.player1_id === playerId) {
    return { id: match.player2_id, isPlayer1: false };
  } else if (match.player2_id === playerId) {
    return { id: match.player1_id, isPlayer1: true };
  }
  return { id: null, isPlayer1: false };
}

/**
 * Check if a player won a match
 */
export function didPlayerWin(
  match: TournamentMatch,
  playerId: string
): boolean {
  return match.winner_id === playerId;
}

/**
 * Get match result for a player
 */
export function getMatchResult(
  match: TournamentMatch,
  playerId: string
): 'win' | 'loss' | 'draw' | 'pending' | 'bye' {
  if (match.status === 'bye') {
    return match.player1_id === playerId ? 'bye' : 'pending';
  }

  if (match.status !== 'completed') {
    return 'pending';
  }

  if (match.winner_id === null) {
    return 'draw';
  }

  return match.winner_id === playerId ? 'win' : 'loss';
}

// ============================================================================
// Seeding
// ============================================================================

/**
 * Generate seeding order for a bracket
 * Uses standard tournament seeding (1 vs 16, 8 vs 9, etc.)
 */
export function generateBracketSeeding(playerCount: number): number[] {
  // Find bracket size
  let bracketSize = 1;
  while (bracketSize < playerCount) {
    bracketSize *= 2;
  }

  // Generate seeding recursively
  const seeds = generateSeedingRecursive(bracketSize);

  // Filter out seeds beyond player count (these become byes)
  return seeds;
}

function generateSeedingRecursive(size: number): number[] {
  if (size === 1) return [1];

  const half = size / 2;
  const topHalf = generateSeedingRecursive(half);

  // Interleave with complementary seeds
  const result: number[] = [];
  for (const seed of topHalf) {
    result.push(seed);
    result.push(size + 1 - seed);
  }

  return result;
}

/**
 * Get seeding matchups for first round
 */
export function getFirstRoundMatchups(
  playerCount: number
): Array<[number, number | null]> {
  const seeds = generateBracketSeeding(playerCount);
  const matchups: Array<[number, number | null]> = [];

  for (let i = 0; i < seeds.length; i += 2) {
    const seed1 = seeds[i];
    const seed2 = seeds[i + 1];

    // If seed is greater than player count, it's a bye
    const player1 = seed1 <= playerCount ? seed1 : null;
    const player2 = seed2 <= playerCount ? seed2 : null;

    if (player1 !== null || player2 !== null) {
      matchups.push([player1!, player2]);
    }
  }

  return matchups;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate bracket structure
 */
export function validateBracket(matches: TournamentMatch[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for duplicate match positions
  const positions = new Set<string>();
  for (const match of matches) {
    const key = `${match.round}-${match.match_number}`;
    if (positions.has(key)) {
      errors.push(`Duplicate match position: Round ${match.round}, Match ${match.match_number}`);
    }
    positions.add(key);
  }

  // Check that all matches (except round 1) have valid next_match references
  const matchIds = new Set(matches.map((m) => m.id));
  for (const match of matches) {
    if (match.next_match_id && !matchIds.has(match.next_match_id)) {
      errors.push(`Invalid next_match_id for match ${match.id}`);
    }
  }

  // Check round progression
  const rounds = organizeMatchesByRound(matches);
  const roundNumbers = Array.from(rounds.keys()).sort((a, b) => a - b);

  for (let i = 0; i < roundNumbers.length - 1; i++) {
    const currentRound = rounds.get(roundNumbers[i])!;
    const nextRound = rounds.get(roundNumbers[i + 1])!;

    // Each round should have half the matches of the previous
    if (nextRound.length !== Math.ceil(currentRound.length / 2)) {
      errors.push(
        `Invalid match count: Round ${roundNumbers[i]} has ${currentRound.length} matches, ` +
        `Round ${roundNumbers[i + 1]} should have ${Math.ceil(currentRound.length / 2)} but has ${nextRound.length}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
