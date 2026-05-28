/**
 * Multiplayer Types
 *
 * Comprehensive type definitions for the elite multiplayer system including:
 * - Stake-based queues
 * - Time controls
 * - Move acknowledgments
 * - Rematch system
 * - Friend challenges
 * - Anti-cheat detection
 * - Pre-game ready confirmation
 * - ELO rating system
 */

import type { Square } from "chess.js";

// ============================================================================
// Stake Configuration
// ============================================================================

export const STAKE_TIERS = {
  FREE: 0,
  MICRO: 5,
  LOW: 10,
  MEDIUM: 25,
  HIGH: 50,
  WHALE: 100,
} as const;

export type StakeTier = (typeof STAKE_TIERS)[keyof typeof STAKE_TIERS];

export const STAKE_TIER_NAMES: Record<StakeTier, string> = {
  [STAKE_TIERS.FREE]: "Free",
  [STAKE_TIERS.MICRO]: "Micro ($5)",
  [STAKE_TIERS.LOW]: "Low ($10)",
  [STAKE_TIERS.MEDIUM]: "Medium ($25)",
  [STAKE_TIERS.HIGH]: "High ($50)",
  [STAKE_TIERS.WHALE]: "Whale ($100)",
};

// ============================================================================
// Time Control Configuration
// ============================================================================

export interface TimeControl {
  id: string;
  name: string;
  category: TimeControlCategory;
  baseTimeSeconds: number;
  incrementSeconds: number;
  displayName: string;
}

export type TimeControlCategory = "bullet" | "blitz" | "rapid" | "classical";

export const TIME_CONTROLS: TimeControl[] = [
  {
    id: "bullet_1_0",
    name: "1+0",
    category: "bullet",
    baseTimeSeconds: 60,
    incrementSeconds: 0,
    displayName: "Bullet 1+0",
  },
  {
    id: "bullet_1_1",
    name: "1+1",
    category: "bullet",
    baseTimeSeconds: 60,
    incrementSeconds: 1,
    displayName: "Bullet 1+1",
  },
  {
    id: "bullet_2_1",
    name: "2+1",
    category: "bullet",
    baseTimeSeconds: 120,
    incrementSeconds: 1,
    displayName: "Bullet 2+1",
  },
  {
    id: "blitz_3_0",
    name: "3+0",
    category: "blitz",
    baseTimeSeconds: 180,
    incrementSeconds: 0,
    displayName: "Blitz 3+0",
  },
  {
    id: "blitz_3_2",
    name: "3+2",
    category: "blitz",
    baseTimeSeconds: 180,
    incrementSeconds: 2,
    displayName: "Blitz 3+2",
  },
  {
    id: "blitz_5_0",
    name: "5+0",
    category: "blitz",
    baseTimeSeconds: 300,
    incrementSeconds: 0,
    displayName: "Blitz 5+0",
  },
  {
    id: "blitz_5_3",
    name: "5+3",
    category: "blitz",
    baseTimeSeconds: 300,
    incrementSeconds: 3,
    displayName: "Blitz 5+3",
  },
  {
    id: "rapid_10_0",
    name: "10+0",
    category: "rapid",
    baseTimeSeconds: 600,
    incrementSeconds: 0,
    displayName: "Rapid 10+0",
  },
  {
    id: "rapid_10_5",
    name: "10+5",
    category: "rapid",
    baseTimeSeconds: 600,
    incrementSeconds: 5,
    displayName: "Rapid 10+5",
  },
  {
    id: "rapid_15_10",
    name: "15+10",
    category: "rapid",
    baseTimeSeconds: 900,
    incrementSeconds: 10,
    displayName: "Rapid 15+10",
  },
  {
    id: "classical_30_0",
    name: "30+0",
    category: "classical",
    baseTimeSeconds: 1800,
    incrementSeconds: 0,
    displayName: "Classical 30+0",
  },
];

export const TIME_CONTROL_BY_ID = TIME_CONTROLS.reduce(
  (acc, tc) => {
    acc[tc.id] = tc;
    return acc;
  },
  {} as Record<string, TimeControl>
);

export function getTimeControlById(id: string): TimeControl | undefined {
  return TIME_CONTROL_BY_ID[id];
}

export function getTimeControlCategory(
  baseTimeSeconds: number,
  incrementSeconds: number
): TimeControlCategory {
  const estimatedGameTime = baseTimeSeconds + 40 * incrementSeconds;

  if (estimatedGameTime < 180) return "bullet";
  if (estimatedGameTime < 480) return "blitz";
  if (estimatedGameTime < 1500) return "rapid";
  return "classical";
}

// ============================================================================
// Queue Configuration
// ============================================================================

export interface QueueConfig {
  stakeTier: StakeTier;
  timeControl: TimeControl;
  isRated: boolean;
}

export interface QueueKey {
  stakeTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
}

export function getQueueKey(config: QueueConfig): string {
  return `${config.stakeTier}_${config.timeControl.baseTimeSeconds}_${config.timeControl.incrementSeconds}`;
}

export function parseQueueKey(key: string): QueueKey | null {
  const parts = key.split("_");
  if (parts.length !== 3) return null;
  return {
    stakeTct: parseInt(parts[0], 10),
    timeControlSeconds: parseInt(parts[1], 10),
    incrementSeconds: parseInt(parts[2], 10),
  };
}

// ============================================================================
// Move Acknowledgment System
// ============================================================================

export interface MoveAcknowledgment {
  moveId: string;
  gameId: string;
  moveNumber: number;
  san: string;
  from: Square;
  to: Square;
  fen: string;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedAt?: number;
  retryCount: number;
}

export interface MoveAckPayload {
  type: "move_ack";
  moveId: string;
  gameId: string;
  moveNumber: number;
  playerId: string;
  timestamp: number;
}

export interface MoveWithAck {
  type: "move_with_ack";
  moveId: string;
  from: Square;
  to: Square;
  promotion?: string;
  san: string;
  fen: string;
  moveNumber: number;
  timeRemainingMs: number;
  timestamp: number;
  requiresAck: boolean;
}

export const MOVE_ACK_TIMEOUT_MS = 5000;
export const MOVE_ACK_MAX_RETRIES = 3;

// ============================================================================
// Rematch System
// ============================================================================

export type RematchStatus =
  | "none"
  | "offered"
  | "pending"
  | "accepted"
  | "declined"
  | "expired";

export interface RematchOffer {
  gameId: string;
  offeringPlayerId: string;
  receivingPlayerId: string;
  stakeTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  swapColors: boolean;
  status: RematchStatus;
  offeredAt: string;
  expiresAt: string;
  newGameId?: string;
}

export interface RematchPayload {
  type: "rematch_offer" | "rematch_accept" | "rematch_decline" | "rematch_expire";
  gameId: string;
  playerId: string;
  timestamp: number;
  newGameId?: string;
}

export const REMATCH_OFFER_TIMEOUT_SECONDS = 30;

// ============================================================================
// Friend Challenge System
// ============================================================================

export interface FriendChallengeInput {
  challengerUserId: string;
  targetUsername: string;
  stakeTct: number;
  timeControl: TimeControl;
  colorPreference: "white" | "black" | "random";
  isRated: boolean;
  message?: string;
}

export interface FriendChallenge {
  id: string;
  challengerId: string;
  challengerUsername: string;
  challengerAvatarIndex: number;
  challengerElo: number;
  targetUserId: string;
  targetUsername: string;
  stakeTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  colorPreference: "white" | "black" | "random";
  isRated: boolean;
  message?: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  gameId?: string;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
}

export interface FriendChallengeNotification {
  type: "friend_challenge";
  challenge: FriendChallenge;
  timestamp: number;
}

export const FRIEND_CHALLENGE_TIMEOUT_MINUTES = 5;

// ============================================================================
// Pre-Game Ready Confirmation
// ============================================================================

export type ReadyStatus = "waiting" | "ready" | "not_ready" | "timed_out";

export interface PlayerReadyState {
  playerId: string;
  username: string;
  avatarIndex: number;
  eloRating: number;
  isReady: boolean;
  readyAt?: number;
  color: "w" | "b";
}

export interface PreGameState {
  gameId: string;
  whitePlayer: PlayerReadyState;
  blackPlayer: PlayerReadyState;
  status: "waiting" | "both_ready" | "cancelled" | "timed_out";
  createdAt: number;
  expiresAt: number;
  startCountdown?: number;
}

export interface ReadyPayload {
  type: "player_ready" | "player_not_ready" | "ready_timeout" | "game_start_countdown";
  gameId: string;
  playerId: string;
  timestamp: number;
  countdown?: number;
}

export const READY_CONFIRMATION_TIMEOUT_SECONDS = 30;
export const GAME_START_COUNTDOWN_SECONDS = 5;

// ============================================================================
// Anti-Cheat Detection
// ============================================================================

export interface MoveAnalytics {
  moveNumber: number;
  san: string;
  thinkTimeMs: number;
  positionComplexity: number;
  engineEvaluation?: number;
  isBookMove: boolean;
  isBestMove?: boolean;
  isTopThreeMove?: boolean;
}

export interface PlayerMovePattern {
  playerId: string;
  gameId: string;
  averageThinkTimeMs: number;
  thinkTimeStdDev: number;
  consistencyScore: number;
  accuracyScore: number;
  complexMoveAccuracy: number;
  bookMoveRatio: number;
  moveTimings: number[];
  suspicionScore: number;
  flags: AntiCheatFlag[];
}

export type AntiCheatFlag =
  | "unusual_accuracy"
  | "constant_think_time"
  | "instant_complex_moves"
  | "no_time_pressure_effect"
  | "suspicious_pattern"
  | "engine_correlation";

export interface AntiCheatReport {
  gameId: string;
  playerId: string;
  totalMoves: number;
  flags: AntiCheatFlag[];
  suspicionScore: number;
  averageThinkTimeMs: number;
  accuracyPercentage: number;
  recommendation: "clear" | "review" | "flag" | "ban";
  details: string;
  createdAt: string;
}

export const ANTI_CHEAT_THRESHOLDS = {
  MIN_THINK_TIME_MS: 100,
  SUSPICIOUS_ACCURACY_THRESHOLD: 0.95,
  CONSTANT_TIME_VARIANCE_THRESHOLD: 500,
  INSTANT_COMPLEX_MOVE_THRESHOLD_MS: 500,
  SUSPICION_SCORE_REVIEW: 60,
  SUSPICION_SCORE_FLAG: 80,
  SUSPICION_SCORE_BAN: 95,
} as const;

// ============================================================================
// Reconnection System
// ============================================================================

export interface ReconnectionState {
  gameId: string;
  playerId: string;
  lastKnownMoveNumber: number;
  lastKnownFen: string;
  disconnectedAt: number;
  reconnectedAt?: number;
  missedMoves: MoveWithAck[];
  resyncRequired: boolean;
}

export interface ReconnectionPayload {
  type: "reconnect_request" | "reconnect_state" | "reconnect_ack";
  gameId: string;
  playerId: string;
  lastMoveNumber: number;
  timestamp: number;
}

export interface GameStateSnapshot {
  gameId: string;
  fen: string;
  moveCount: number;
  whiteTimeRemainingMs: number;
  blackTimeRemainingMs: number;
  currentTurn: "w" | "b";
  moves: Array<{
    moveNumber: number;
    san: string;
    from: Square;
    to: Square;
    fen: string;
  }>;
  status: "active" | "completed" | "abandoned";
  result?: "white_wins" | "black_wins" | "draw";
  lastMoveAt?: number;
}

export const RECONNECTION_GRACE_PERIOD_MS = 60000; // 1 minute
export const RECONNECTION_ABANDON_THRESHOLD_MS = 300000; // 5 minutes

// ============================================================================
// ELO Rating System Types
// ============================================================================

export interface EloUpdate {
  playerId: string;
  gameId: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  kFactor: number;
  expectedScore: number;
  actualScore: number;
  opponentRating: number;
  isProvisional: boolean;
  gamesPlayedBefore: number;
  timestamp: string;
}

export interface GameEloResult {
  whitePlayer: EloUpdate;
  blackPlayer: EloUpdate;
  result: "white_wins" | "black_wins" | "draw";
  reason: string;
}

// ============================================================================
// Server Validation Types
// ============================================================================

export interface ServerMoveValidation {
  gameId: string;
  playerId: string;
  moveNumber: number;
  from: Square;
  to: Square;
  promotion?: string;
  fenBefore: string;
  fenAfter?: string;
  timeRemainingMs: number;
  clientTimestamp: number;
  serverTimestamp?: number;
}

export interface ServerValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: ServerValidationErrorCode;
  serverFen?: string;
  serverMoveNumber?: number;
  correctionRequired?: boolean;
  correction?: {
    fen: string;
    moveNumber: number;
    whiteTimeMs: number;
    blackTimeMs: number;
  };
}

export type ServerValidationErrorCode =
  | "INVALID_MOVE"
  | "NOT_YOUR_TURN"
  | "GAME_OVER"
  | "GAME_NOT_FOUND"
  | "STATE_MISMATCH"
  | "TIME_EXPIRED"
  | "PLAYER_NOT_IN_GAME"
  | "INTERNAL_ERROR";

// ============================================================================
// Match Found Result
// ============================================================================

export interface MatchFoundResult {
  matched: boolean;
  gameId?: string;
  opponentId?: string;
  playerColor?: "w" | "b";
  opponent?: {
    id: string;
    username: string;
    avatarIndex: number;
    eloRating: number;
  };
  preGameState?: PreGameState;
  stakeTct?: number;
  timeControl?: TimeControl;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatTimeControl(tc: TimeControl): string {
  if (tc.incrementSeconds === 0) {
    return `${Math.floor(tc.baseTimeSeconds / 60)} min`;
  }
  return `${Math.floor(tc.baseTimeSeconds / 60)}+${tc.incrementSeconds}`;
}

export function getTimeControlColor(category: TimeControlCategory): string {
  switch (category) {
    case "bullet":
      return "#EF4444"; // Red
    case "blitz":
      return "#F59E0B"; // Amber
    case "rapid":
      return "#10B981"; // Green
    case "classical":
      return "#3B82F6"; // Blue
  }
}

export function isValidStakeTier(stake: number): stake is StakeTier {
  return Object.values(STAKE_TIERS).includes(stake as StakeTier);
}

export function getStakeTierForAmount(amount: number): StakeTier {
  const tiers = Object.values(STAKE_TIERS).sort((a, b) => b - a);
  for (const tier of tiers) {
    if (amount >= tier) return tier;
  }
  return STAKE_TIERS.FREE;
}
