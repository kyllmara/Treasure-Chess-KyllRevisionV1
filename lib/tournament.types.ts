/**
 * Tournament System Type Definitions
 */

// ============================================================================
// Enums
// ============================================================================

export type TournamentType = 'knockout' | 'swiss' | 'arena';

export type TournamentStatus =
  | 'draft'
  | 'registration'
  | 'starting'
  | 'active'
  | 'completed'
  | 'cancelled';

export type TournamentMatchStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'bye';

// ============================================================================
// Database Types
// ============================================================================

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  type: TournamentType;

  // Entry and prizes
  entry_fee_tct: number;
  prize_pool_tct: number;
  rake_percentage: number;

  // Player limits
  min_players: number;
  max_players: number;
  current_players: number;

  // Timing
  start_time: string;
  registration_deadline: string | null;
  registration_opens_at: string | null;

  // Game settings
  time_control_seconds: number;
  increment_seconds: number;
  is_rated: boolean;

  // Swiss-specific
  rounds: number | null;
  current_round: number;

  // Status
  status: TournamentStatus;

  // Metadata
  created_by: string | null;
  template_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TournamentRegistration {
  id: string;
  tournament_id: string;
  user_id: string;

  // Seeding and standings
  seed: number | null;
  score: number;
  buchholz_score: number;
  sonneborn_berger: number;
  wins: number;
  draws: number;
  losses: number;

  // Status
  is_eliminated: boolean;
  final_place: number | null;

  // Timing
  registered_at: string;
  checked_in_at: string | null;

  // Entry fee tracking
  entry_fee_paid: number;
  entry_fee_refunded: boolean;

  // Joined profile data
  profile?: {
    id: string;
    username: string;
    avatar_index: number;
    elo_rating: number;
  };
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;

  // Match position in bracket
  round: number;
  match_number: number;
  bracket_position: string | null;

  // Players
  player1_id: string | null;
  player2_id: string | null;
  player1_seed: number | null;
  player2_seed: number | null;

  // Result
  winner_id: string | null;
  game_id: string | null;
  player1_score: number;
  player2_score: number;

  // Status
  status: TournamentMatchStatus;

  // Timing
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;

  // Next match reference
  next_match_id: string | null;
  next_match_slot: number | null;

  // Joined player data
  player1?: {
    id: string;
    username: string;
    avatar_index: number;
    elo_rating: number;
  };
  player2?: {
    id: string;
    username: string;
    avatar_index: number;
    elo_rating: number;
  };
  winner?: {
    id: string;
    username: string;
  };
}

export interface TournamentPrize {
  id: string;
  tournament_id: string;
  place: number;
  percentage: number;
  fixed_amount: number | null;
  user_id: string | null;
  amount_tct: number | null;
  paid_at: string | null;
  transaction_id: string | null;

  // Joined user data
  user?: {
    id: string;
    username: string;
    avatar_index: number;
  };
}

export interface TournamentTemplate {
  id: string;
  name: string;
  description: string | null;
  type: TournamentType;
  entry_fee_tct: number;
  prize_distribution: PrizeDistribution[];
  min_players: number;
  max_players: number;
  time_control_seconds: number;
  increment_seconds: number;
  rounds: number | null;
  recurrence: 'daily' | 'weekly' | 'monthly' | null;
  day_of_week: number | null;
  day_of_month: number | null;
  hour_utc: number;
  minute_utc: number;
  registration_hours_before: number;
  registration_closes_minutes_before: number;
  is_active: boolean;
  created_at: string;
  last_created_tournament_id: string | null;
  next_scheduled_at: string | null;
}

export interface PrizeDistribution {
  place: number;
  percentage: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface RegisterForTournamentResult {
  success: boolean;
  error?: string;
  registration_id?: string;
  seed?: number;
  entry_fee_paid?: number;
  required?: number;
  available?: number;
}

export interface UnregisterFromTournamentResult {
  success: boolean;
  error?: string;
  refund_amount?: number;
}

export interface StartTournamentResult {
  success: boolean;
  error?: string;
  tournament_id?: string;
  type?: TournamentType;
  players?: number;
  bracket_result?: {
    bracket_size?: number;
    num_rounds?: number;
    num_byes?: number;
    matches_created?: number;
  };
}

export interface RecordMatchResultResult {
  success: boolean;
  error?: string;
  match_id?: string;
  winner_id?: string | null;
  is_draw?: boolean;
}

// ============================================================================
// UI Types
// ============================================================================

export interface TournamentWithDetails extends Tournament {
  registrations?: TournamentRegistration[];
  matches?: TournamentMatch[];
  prizes?: TournamentPrize[];
  user_registration?: TournamentRegistration | null;
}

export interface TournamentListFilters {
  status?: TournamentStatus | TournamentStatus[];
  type?: TournamentType;
  minEntryFee?: number;
  maxEntryFee?: number;
  hasAvailableSlots?: boolean;
}

export interface BracketNode {
  match: TournamentMatch;
  round: number;
  position: number;
  children: [BracketNode | null, BracketNode | null];
}

export interface SwissStanding {
  registration: TournamentRegistration;
  rank: number;
  profile: {
    id: string;
    username: string;
    avatar_index: number;
    elo_rating: number;
  };
}

// ============================================================================
// Event Types (for realtime subscriptions)
// ============================================================================

export type TournamentEventType =
  | 'tournament_updated'
  | 'registration_added'
  | 'registration_removed'
  | 'match_updated'
  | 'round_started'
  | 'tournament_completed';

export interface TournamentEvent {
  type: TournamentEventType;
  tournament_id: string;
  data: unknown;
  timestamp: string;
}

export interface TournamentSubscriptionCallbacks {
  onTournamentUpdated?: (tournament: Tournament) => void;
  onRegistrationAdded?: (registration: TournamentRegistration) => void;
  onRegistrationRemoved?: (userId: string) => void;
  onMatchUpdated?: (match: TournamentMatch) => void;
  onRoundStarted?: (round: number) => void;
  onTournamentCompleted?: (tournament: Tournament) => void;
  onError?: (error: Error) => void;
}
