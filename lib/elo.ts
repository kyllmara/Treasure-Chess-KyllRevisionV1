/**
 * ELO Rating System
 *
 * Elite-level implementation featuring:
 * - Standard FIDE-style ELO calculations
 * - Dynamic K-factor based on player experience
 * - Support for all game outcomes (win/loss/draw)
 * - Rating floor protection (minimum 100)
 * - Provisional rating detection
 * - Batch rating calculations for tournaments
 */

// ============================================================================
// Types
// ============================================================================

export interface EloCalculationInput {
  playerRating: number;
  opponentRating: number;
  result: GameResult;
  playerGamesPlayed: number;
}

export interface EloCalculationResult {
  newRating: number;
  ratingChange: number;
  expectedScore: number;
  kFactor: number;
}

export interface BatchEloPlayer {
  id: string;
  rating: number;
  gamesPlayed: number;
}

export interface BatchEloResult {
  playerId: string;
  oldRating: number;
  newRating: number;
  ratingChange: number;
}

export type GameResult = "win" | "loss" | "draw";

// ============================================================================
// Constants
// ============================================================================

/**
 * K-Factor configuration:
 * - K=32 for new players (<30 games) - faster rating adjustment
 * - K=24 for intermediate players (30-99 games)
 * - K=16 for established players (100+ games) - more stable ratings
 *
 * For very high-rated players (2400+), K=10 is sometimes used,
 * but we use K=16 for simplicity in this implementation.
 */
export const K_FACTOR_NEW = 32;
export const K_FACTOR_INTERMEDIATE = 24;
export const K_FACTOR_ESTABLISHED = 16;
export const K_FACTOR_EXPERT = 10;

export const GAMES_THRESHOLD_NEW = 30;
export const GAMES_THRESHOLD_INTERMEDIATE = 100;
export const RATING_THRESHOLD_EXPERT = 2400;

export const RATING_FLOOR = 100;
export const DEFAULT_RATING = 0;
export const PROVISIONAL_THRESHOLD = 10;

// Maximum rating difference to consider for expected score calculation
// Prevents extreme expected scores for mismatched players
export const MAX_RATING_DIFF = 400;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the K-factor for a player based on their experience and rating.
 *
 * @param gamesPlayed - Number of rated games the player has completed
 * @param rating - Current player rating (optional, for expert detection)
 * @returns The K-factor to use for ELO calculations
 */
export function getKFactor(gamesPlayed: number, rating?: number): number {
  // Expert players (2400+) get lowest K-factor for stability
  if (rating !== undefined && rating >= RATING_THRESHOLD_EXPERT) {
    return K_FACTOR_EXPERT;
  }

  // New players (<30 games) get highest K-factor
  if (gamesPlayed < GAMES_THRESHOLD_NEW) {
    return K_FACTOR_NEW;
  }

  // Intermediate players (30-99 games)
  if (gamesPlayed < GAMES_THRESHOLD_INTERMEDIATE) {
    return K_FACTOR_INTERMEDIATE;
  }

  // Established players (100+ games)
  return K_FACTOR_ESTABLISHED;
}

/**
 * Calculate the expected score for a player against an opponent.
 * Uses the standard ELO formula: E = 1 / (1 + 10^((Ro - Rp) / 400))
 *
 * The expected score represents the probability of winning plus
 * half the probability of drawing.
 *
 * @param playerRating - The player's current rating
 * @param opponentRating - The opponent's current rating
 * @returns Expected score between 0 and 1
 */
export function calculateExpectedScore(
  playerRating: number,
  opponentRating: number
): number {
  // Clamp rating difference to prevent extreme expected scores
  const ratingDiff = Math.max(
    -MAX_RATING_DIFF,
    Math.min(MAX_RATING_DIFF, opponentRating - playerRating)
  );

  return 1 / (1 + Math.pow(10, ratingDiff / 400));
}

/**
 * Convert a game result to a numeric score.
 *
 * @param result - The game result (win/loss/draw)
 * @returns Numeric score: 1 for win, 0.5 for draw, 0 for loss
 */
export function resultToScore(result: GameResult): number {
  switch (result) {
    case "win":
      return 1;
    case "draw":
      return 0.5;
    case "loss":
      return 0;
  }
}

/**
 * Calculate the new ELO rating after a game.
 *
 * Formula: R' = R + K * (S - E)
 * Where:
 * - R' is the new rating
 * - R is the current rating
 * - K is the K-factor
 * - S is the actual score (1 for win, 0.5 for draw, 0 for loss)
 * - E is the expected score
 *
 * @param input - The calculation input parameters
 * @returns The calculation result with new rating and metadata
 */
export function calculateNewRating(
  input: EloCalculationInput
): EloCalculationResult {
  const { playerRating, opponentRating, result, playerGamesPlayed } = input;

  const kFactor = getKFactor(playerGamesPlayed, playerRating);
  const expectedScore = calculateExpectedScore(playerRating, opponentRating);
  const actualScore = resultToScore(result);

  // Calculate rating change
  const ratingChange = Math.round(kFactor * (actualScore - expectedScore));

  // Calculate new rating with floor protection
  const newRating = Math.max(RATING_FLOOR, playerRating + ratingChange);

  return {
    newRating,
    ratingChange: newRating - playerRating,
    expectedScore,
    kFactor,
  };
}

/**
 * Calculate new ratings for both players after a game.
 * Ensures that rating changes are balanced (one gains what the other loses,
 * adjusted for K-factor differences).
 *
 * @param player1Rating - First player's rating
 * @param player2Rating - Second player's rating
 * @param player1Result - First player's result (win/loss/draw)
 * @param player1GamesPlayed - First player's games played
 * @param player2GamesPlayed - Second player's games played
 * @returns Array of two EloCalculationResults [player1, player2]
 */
export function calculateMatchRatings(
  player1Rating: number,
  player2Rating: number,
  player1Result: GameResult,
  player1GamesPlayed: number,
  player2GamesPlayed: number
): [EloCalculationResult, EloCalculationResult] {
  const player2Result: GameResult =
    player1Result === "win" ? "loss" :
    player1Result === "loss" ? "win" :
    "draw";

  const player1Calc = calculateNewRating({
    playerRating: player1Rating,
    opponentRating: player2Rating,
    result: player1Result,
    playerGamesPlayed: player1GamesPlayed,
  });

  const player2Calc = calculateNewRating({
    playerRating: player2Rating,
    opponentRating: player1Rating,
    result: player2Result,
    playerGamesPlayed: player2GamesPlayed,
  });

  return [player1Calc, player2Calc];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a player's rating is provisional (not yet established).
 * Provisional ratings are considered less reliable.
 *
 * @param gamesPlayed - Number of rated games played
 * @returns True if the rating is provisional
 */
export function isProvisionalRating(gamesPlayed: number): boolean {
  return gamesPlayed < PROVISIONAL_THRESHOLD;
}

/**
 * Get a human-readable rating category based on ELO rating.
 * Categories are loosely based on FIDE/USCF classifications.
 *
 * @param rating - The player's rating
 * @returns A string description of the rating category
 */
export function getRatingCategory(rating: number): string {
  if (rating >= 2700) return "Super Grandmaster";
  if (rating >= 2500) return "Grandmaster";
  if (rating >= 2400) return "International Master";
  if (rating >= 2200) return "FIDE Master";
  if (rating >= 2000) return "Expert";
  if (rating >= 1800) return "Class A";
  if (rating >= 1600) return "Class B";
  if (rating >= 1400) return "Class C";
  if (rating >= 1200) return "Class D";
  if (rating >= 1000) return "Class E";
  return "Beginner";
}

/**
 * Get a color indicator for rating change display.
 *
 * @param ratingChange - The rating change value
 * @returns A color string for UI display
 */
export function getRatingChangeColor(ratingChange: number): string {
  if (ratingChange > 0) return "#4CAF50"; // Green for gain
  if (ratingChange < 0) return "#F44336"; // Red for loss
  return "#9E9E9E"; // Gray for no change
}

/**
 * Format rating change for display with sign.
 *
 * @param ratingChange - The rating change value
 * @returns Formatted string like "+15" or "-8"
 */
export function formatRatingChange(ratingChange: number): string {
  if (ratingChange > 0) return `+${ratingChange}`;
  return ratingChange.toString();
}

/**
 * Calculate the probability of each outcome based on ratings.
 *
 * @param playerRating - The player's rating
 * @param opponentRating - The opponent's rating
 * @returns Object with win, draw, and loss probabilities
 */
export function calculateOutcomeProbabilities(
  playerRating: number,
  opponentRating: number
): { win: number; draw: number; loss: number } {
  const expectedScore = calculateExpectedScore(playerRating, opponentRating);

  // Estimate draw probability based on rating difference
  // Closer ratings = higher draw probability
  const ratingDiff = Math.abs(playerRating - opponentRating);
  const drawBase = 0.3; // Base draw probability
  const drawFactor = Math.max(0, 1 - ratingDiff / 400);
  const drawProbability = drawBase * drawFactor;

  // Distribute remaining probability between win and loss
  const remainingProbability = 1 - drawProbability;

  return {
    win: expectedScore * remainingProbability,
    draw: drawProbability,
    loss: (1 - expectedScore) * remainingProbability,
  };
}

/**
 * Estimate rating uncertainty based on games played.
 * Higher uncertainty for fewer games.
 *
 * @param gamesPlayed - Number of rated games played
 * @returns Estimated uncertainty in rating points
 */
export function estimateRatingUncertainty(gamesPlayed: number): number {
  if (gamesPlayed === 0) return 350;
  if (gamesPlayed < 5) return 250;
  if (gamesPlayed < 10) return 200;
  if (gamesPlayed < 20) return 150;
  if (gamesPlayed < 50) return 100;
  if (gamesPlayed < 100) return 75;
  return 50;
}

// ============================================================================
// Batch Operations (for tournaments or bulk updates)
// ============================================================================

/**
 * Calculate rating changes for a tournament round-robin.
 * Each player plays against every other player once.
 *
 * @param players - Array of players with their ratings
 * @param results - Matrix of results [player1Index][player2Index]
 * @returns Array of batch results for each player
 */
export function calculateTournamentRatings(
  players: BatchEloPlayer[],
  results: (GameResult | null)[][]
): BatchEloResult[] {
  const batchResults: BatchEloResult[] = players.map((player) => ({
    playerId: player.id,
    oldRating: player.rating,
    newRating: player.rating,
    ratingChange: 0,
  }));

  // Calculate cumulative rating changes
  for (let i = 0; i < players.length; i++) {
    let totalChange = 0;

    for (let j = 0; j < players.length; j++) {
      if (i === j || results[i][j] === null) continue;

      const calc = calculateNewRating({
        playerRating: players[i].rating,
        opponentRating: players[j].rating,
        result: results[i][j]!,
        playerGamesPlayed: players[i].gamesPlayed,
      });

      totalChange += calc.ratingChange;
    }

    batchResults[i].ratingChange = totalChange;
    batchResults[i].newRating = Math.max(
      RATING_FLOOR,
      players[i].rating + totalChange
    );
  }

  return batchResults;
}

// ============================================================================
// Performance Rating Calculation
// ============================================================================

/**
 * Calculate performance rating for a series of games.
 * Performance rating represents the rating at which the player
 * would be expected to achieve their actual score.
 *
 * @param opponentRatings - Array of opponent ratings
 * @param scores - Array of scores (1 for win, 0.5 for draw, 0 for loss)
 * @returns The calculated performance rating
 */
export function calculatePerformanceRating(
  opponentRatings: number[],
  scores: number[]
): number {
  if (opponentRatings.length === 0 || opponentRatings.length !== scores.length) {
    return DEFAULT_RATING;
  }

  const avgOpponentRating =
    opponentRatings.reduce((sum, r) => sum + r, 0) / opponentRatings.length;
  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  const scorePercentage = totalScore / scores.length;

  // Convert score percentage to rating difference
  // Using inverse of expected score formula
  if (scorePercentage >= 1) {
    return avgOpponentRating + 400; // Cap at +400 for perfect score
  }
  if (scorePercentage <= 0) {
    return avgOpponentRating - 400; // Cap at -400 for zero score
  }

  const ratingDiff = -400 * Math.log10(1 / scorePercentage - 1);

  return Math.round(avgOpponentRating + ratingDiff);
}

export default {
  calculateNewRating,
  calculateMatchRatings,
  calculateExpectedScore,
  getKFactor,
  getRatingCategory,
  formatRatingChange,
  getRatingChangeColor,
  isProvisionalRating,
  calculateOutcomeProbabilities,
  estimateRatingUncertainty,
  calculateTournamentRatings,
  calculatePerformanceRating,
  resultToScore,
  K_FACTOR_NEW,
  K_FACTOR_ESTABLISHED,
  DEFAULT_RATING,
  RATING_FLOOR,
};
