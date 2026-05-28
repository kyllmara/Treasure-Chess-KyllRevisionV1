/**
 * House Challenge Type Definitions
 *
 * Types for the house challenges system where users play against AI
 * with specific objectives to win prize multipliers.
 */

// ============================================================================
// Enums (matching database enums)
// ============================================================================

export type HouseChallengeStatus = 'active' | 'paused' | 'ended' | 'archived';

export type HouseChallengeAttemptStatus =
  | 'pending'
  | 'in_progress'
  | 'won'
  | 'lost'
  | 'forfeited'
  | 'expired';

export type HousePayoutStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export type AIDifficultyLevel =
  | 'beginner'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'expert';

export type ChallengeObjectiveType =
  | 'checkmate_in_moves'
  | 'checkmate_with_piece'
  | 'sacrifice_queen'
  | 'promotion_mate'
  | 'back_rank_mate'
  | 'smothered_mate'
  | 'capture_all_pieces'
  | 'no_captures'
  | 'time_under'
  | 'move_limit';

export type PlayerColor = 'white' | 'black' | 'random';

export type DifficultyLabel = 'Easy' | 'Medium' | 'Hard' | 'Expert';

// ============================================================================
// House Challenge Interface
// ============================================================================

export interface HouseChallengeDB {
  id: string;
  name: string;
  description: string;
  entry_fee_tct: number;
  prize_multiplier: number;
  difficulty: DifficultyLabel;
  ai_difficulty: AIDifficultyLevel;
  time_limit_seconds: number;
  player_color: PlayerColor;
  objective_type: ChallengeObjectiveType;
  objective_value: string;
  max_entries_per_user: number | null;
  max_entries_per_user_per_month: number | null;
  max_total_entries: number | null;
  attempts_per_entry: number;
  is_active: boolean;
  status: HouseChallengeStatus;
  start_date: string | null;
  end_date: string | null;
  total_attempts: number;
  total_wins: number;
  total_entry_fees_collected: number;
  total_payouts: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * House challenge with computed user-specific fields
 */
export interface HouseChallenge extends HouseChallengeDB {
  // User-specific computed fields (from get_active_house_challenges)
  user_attempts?: number;
  can_attempt?: boolean; // Computed based on max_entries_per_user and user_attempts
}

// ============================================================================
// House Challenge Attempt Interface
// ============================================================================

export interface HouseChallengeAttemptDB {
  id: string;
  challenge_id: string;
  user_id: string;
  entry_fee_paid_tct: number;
  status: HouseChallengeAttemptStatus;
  player_color: 'white' | 'black';
  moves_made: number;
  final_fen: string | null;
  pgn: string | null;
  objective_met: boolean | null;
  checkmating_piece: string | null;
  queen_sacrificed: boolean;
  payout_status: HousePayoutStatus;
  payout_amount_tct: number | null;
  payout_tx_hash: string | null;
  payout_error: string | null;
  game_started_at: string | null;
  game_ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * House challenge attempt with joined challenge info
 */
export interface HouseChallengeAttempt extends HouseChallengeAttemptDB {
  challenge?: Pick<HouseChallengeDB, 'name' | 'description' | 'difficulty' | 'objective_type' | 'objective_value'>;
}

// ============================================================================
// Function Return Types
// ============================================================================

export interface StartHouseChallengeResult {
  success: boolean;
  attempt_id: string | null;
  player_color: PlayerColor | null;
  error_message: string | null;
  newEntrySessionId?: string;
  attemptNumber?: number;
  attemptsRemaining?: number;
}

export interface CompleteHouseChallengeResult {
  success: boolean;
  won: boolean;
  payout_amount: number | null;
  error_message: string | null;
}

export interface ForfeitHouseChallengeResult {
  success: boolean;
  error_message: string | null;
}

// ============================================================================
// Input Types for Creating/Updating
// ============================================================================

export interface CreateHouseChallengeInput {
  name: string;
  description: string;
  entry_fee_tct: number;
  prize_multiplier?: number;
  difficulty: DifficultyLabel;
  ai_difficulty: AIDifficultyLevel;
  time_limit_seconds: number;
  player_color: PlayerColor;
  objective_type: ChallengeObjectiveType;
  objective_value: string;
  max_entries_per_user?: number | null;
  max_entries_per_user_per_month?: number | null;
  max_total_entries?: number | null;
  attempts_per_entry?: number;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface UpdateHouseChallengeInput {
  name?: string;
  description?: string;
  entry_fee_tct?: number;
  prize_multiplier?: number;
  difficulty?: DifficultyLabel;
  ai_difficulty?: AIDifficultyLevel;
  time_limit_seconds?: number;
  player_color?: PlayerColor;
  objective_type?: ChallengeObjectiveType;
  objective_value?: string;
  max_entries_per_user?: number | null;
  max_entries_per_user_per_month?: number | null;
  max_total_entries?: number | null;
  attempts_per_entry?: number;
  is_active?: boolean;
  status?: HouseChallengeStatus;
  start_date?: string | null;
  end_date?: string | null;
}

// ============================================================================
// UI Helper Types
// ============================================================================

export interface HouseChallengeFilters {
  difficulty?: DifficultyLabel;
  minEntryFee?: number;
  maxEntryFee?: number;
  objectiveType?: ChallengeObjectiveType;
}

export interface HouseChallengeStats {
  totalChallenges: number;
  activeChallenges: number;
  totalAttempts: number;
  totalWins: number;
  winRate: number;
  totalFeesCollected: number;
  totalPayouts: number;
  netRevenue: number;
}

// ============================================================================
// AI Difficulty Mapping
// ============================================================================

export const AI_DIFFICULTY_ELO_MAP: Record<AIDifficultyLevel, number> = {
  beginner: 800,
  easy: 1000,
  medium: 1400,
  hard: 1800,
  expert: 2200,
};

export const AI_DIFFICULTY_DEPTH_MAP: Record<AIDifficultyLevel, number> = {
  beginner: 2,
  easy: 4,
  medium: 8,
  hard: 12,
  expert: 18,
};

// ============================================================================
// Objective Display Helpers
// ============================================================================

export function getObjectiveDescription(
  type: ChallengeObjectiveType,
  value: string
): string {
  switch (type) {
    case 'checkmate_in_moves':
      return `Checkmate in ${value} moves or less`;
    case 'checkmate_with_piece':
      return `Checkmate using your ${getPieceName(value)}`;
    case 'sacrifice_queen':
      return 'Win after sacrificing your queen';
    case 'promotion_mate':
      return 'Checkmate with a promoted piece';
    case 'back_rank_mate':
      return 'Deliver a back rank checkmate';
    case 'smothered_mate':
      return 'Deliver a smothered mate (knight)';
    case 'capture_all_pieces':
      return 'Capture all opponent pieces except king';
    case 'no_captures':
      return 'Win without capturing any pieces';
    case 'time_under':
      return `Win with ${value}+ seconds remaining`;
    case 'move_limit':
      return `Win within ${value} total moves`;
    default:
      return 'Complete the objective';
  }
}

export function getPieceName(pieceCode: string): string {
  const pieceNames: Record<string, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  return pieceNames[pieceCode.toLowerCase()] || 'piece';
}

export function getDifficultyColor(difficulty: DifficultyLabel): string {
  switch (difficulty) {
    case 'Easy':
      return '#4ADE80';
    case 'Medium':
      return '#FCD34D';
    case 'Hard':
      return '#FB923C';
    case 'Expert':
      return '#EF4444';
    default:
      return '#A0A0A0';
  }
}
