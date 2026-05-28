/**
 * Structured Error System
 *
 * Provides typed errors with codes, user-friendly messages, and recovery hints.
 * Central error handling across the entire application.
 */

// ============================================================================
// Error Codes - Exhaustive enumeration of all possible errors
// ============================================================================

export enum ErrorCode {
  // Network errors (1xxx)
  NETWORK_OFFLINE = 1000,
  NETWORK_TIMEOUT = 1001,
  NETWORK_REQUEST_FAILED = 1002,
  NETWORK_SERVER_UNREACHABLE = 1003,

  // Authentication errors (2xxx)
  AUTH_SESSION_EXPIRED = 2000,
  AUTH_INVALID_CREDENTIALS = 2001,
  AUTH_UNAUTHORIZED = 2002,
  AUTH_TOKEN_REFRESH_FAILED = 2003,
  AUTH_WALLET_CONNECTION_FAILED = 2004,

  // Supabase/API errors (3xxx)
  API_REQUEST_FAILED = 3000,
  API_RATE_LIMITED = 3001,
  API_INVALID_RESPONSE = 3002,
  API_RESOURCE_NOT_FOUND = 3003,
  API_CONFLICT = 3004,
  API_VALIDATION_ERROR = 3005,

  // Game errors (4xxx)
  GAME_NOT_FOUND = 4000,
  GAME_ALREADY_STARTED = 4001,
  GAME_ALREADY_ENDED = 4002,
  GAME_INVALID_MOVE = 4003,
  GAME_NOT_YOUR_TURN = 4004,
  GAME_SYNC_FAILED = 4005,
  GAME_TIMEOUT_EXPIRED = 4006,

  // Challenge errors (5xxx)
  CHALLENGE_NOT_FOUND = 5000,
  CHALLENGE_ALREADY_ACCEPTED = 5001,
  CHALLENGE_EXPIRED = 5002,
  CHALLENGE_CANCELLED = 5003,
  CHALLENGE_INVALID_WAGER = 5004,
  CHALLENGE_INSUFFICIENT_BALANCE = 5005,

  // Wallet/Transaction errors (6xxx)
  WALLET_INSUFFICIENT_FUNDS = 6000,
  WALLET_TRANSACTION_FAILED = 6001,
  WALLET_DEPOSIT_FAILED = 6002,
  WALLET_WITHDRAWAL_FAILED = 6003,
  WALLET_ESCROW_FAILED = 6004,

  // Matchmaking errors (7xxx)
  MATCHMAKING_QUEUE_FULL = 7000,
  MATCHMAKING_NO_OPPONENTS = 7001,
  MATCHMAKING_ALREADY_IN_QUEUE = 7002,
  MATCHMAKING_CANCELLED = 7003,

  // Local/Device errors (8xxx)
  STORAGE_READ_FAILED = 8000,
  STORAGE_WRITE_FAILED = 8001,
  PERMISSION_DENIED = 8002,
  DEVICE_NOT_SUPPORTED = 8003,

  // Unknown/Generic errors (9xxx)
  UNKNOWN = 9000,
  UNEXPECTED = 9001,
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  NETWORK = 'network',
  AUTH = 'auth',
  API = 'api',
  GAME = 'game',
  CHALLENGE = 'challenge',
  WALLET = 'wallet',
  MATCHMAKING = 'matchmaking',
  STORAGE = 'storage',
  UNKNOWN = 'unknown',
}

// ============================================================================
// AppError - The core error class
// ============================================================================

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  userMessage?: string;
  recoveryHint?: string;
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  originalError?: Error | unknown;
  context?: Record<string, unknown>;
  retryable?: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly recoveryHint: string;
  readonly severity: ErrorSeverity;
  readonly category: ErrorCategory;
  readonly originalError?: Error | unknown;
  readonly context: Record<string, unknown>;
  readonly retryable: boolean;
  readonly timestamp: Date;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.userMessage = options.userMessage || this.getDefaultUserMessage(options.code);
    this.recoveryHint = options.recoveryHint || this.getDefaultRecoveryHint(options.code);
    this.severity = options.severity || this.getDefaultSeverity(options.code);
    this.category = options.category || this.getDefaultCategory(options.code);
    this.originalError = options.originalError;
    this.context = options.context || {};
    this.retryable = options.retryable ?? this.isDefaultRetryable(options.code);
    this.timestamp = new Date();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  private getDefaultUserMessage(code: ErrorCode): string {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.NETWORK_OFFLINE]: 'You appear to be offline',
      [ErrorCode.NETWORK_TIMEOUT]: 'The request took too long',
      [ErrorCode.NETWORK_REQUEST_FAILED]: 'Unable to connect to the server',
      [ErrorCode.NETWORK_SERVER_UNREACHABLE]: 'Server is temporarily unavailable',
      [ErrorCode.AUTH_SESSION_EXPIRED]: 'Your session has expired',
      [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid login credentials',
      [ErrorCode.AUTH_UNAUTHORIZED]: 'You don\'t have permission for this action',
      [ErrorCode.AUTH_TOKEN_REFRESH_FAILED]: 'Unable to refresh your session',
      [ErrorCode.AUTH_WALLET_CONNECTION_FAILED]: 'Failed to connect wallet',
      [ErrorCode.API_REQUEST_FAILED]: 'Something went wrong',
      [ErrorCode.API_RATE_LIMITED]: 'Too many requests. Please slow down',
      [ErrorCode.API_INVALID_RESPONSE]: 'Received unexpected data from server',
      [ErrorCode.API_RESOURCE_NOT_FOUND]: 'The requested item was not found',
      [ErrorCode.API_CONFLICT]: 'This action conflicts with current state',
      [ErrorCode.API_VALIDATION_ERROR]: 'Invalid data provided',
      [ErrorCode.GAME_NOT_FOUND]: 'Game not found',
      [ErrorCode.GAME_ALREADY_STARTED]: 'This game has already started',
      [ErrorCode.GAME_ALREADY_ENDED]: 'This game has already ended',
      [ErrorCode.GAME_INVALID_MOVE]: 'Invalid move',
      [ErrorCode.GAME_NOT_YOUR_TURN]: 'It\'s not your turn',
      [ErrorCode.GAME_SYNC_FAILED]: 'Failed to sync game state',
      [ErrorCode.GAME_TIMEOUT_EXPIRED]: 'Time has expired',
      [ErrorCode.CHALLENGE_NOT_FOUND]: 'Challenge not found',
      [ErrorCode.CHALLENGE_ALREADY_ACCEPTED]: 'This challenge has already been accepted',
      [ErrorCode.CHALLENGE_EXPIRED]: 'This challenge has expired',
      [ErrorCode.CHALLENGE_CANCELLED]: 'This challenge was cancelled',
      [ErrorCode.CHALLENGE_INVALID_WAGER]: 'Invalid wager amount',
      [ErrorCode.CHALLENGE_INSUFFICIENT_BALANCE]: 'Insufficient balance for this wager',
      [ErrorCode.WALLET_INSUFFICIENT_FUNDS]: 'Insufficient funds',
      [ErrorCode.WALLET_TRANSACTION_FAILED]: 'Transaction failed',
      [ErrorCode.WALLET_DEPOSIT_FAILED]: 'Deposit failed',
      [ErrorCode.WALLET_WITHDRAWAL_FAILED]: 'Withdrawal failed',
      [ErrorCode.WALLET_ESCROW_FAILED]: 'Failed to lock funds for game',
      [ErrorCode.MATCHMAKING_QUEUE_FULL]: 'Matchmaking queue is full',
      [ErrorCode.MATCHMAKING_NO_OPPONENTS]: 'No opponents available right now',
      [ErrorCode.MATCHMAKING_ALREADY_IN_QUEUE]: 'You\'re already in the matchmaking queue',
      [ErrorCode.MATCHMAKING_CANCELLED]: 'Matchmaking was cancelled',
      [ErrorCode.STORAGE_READ_FAILED]: 'Failed to load saved data',
      [ErrorCode.STORAGE_WRITE_FAILED]: 'Failed to save data',
      [ErrorCode.PERMISSION_DENIED]: 'Permission denied',
      [ErrorCode.DEVICE_NOT_SUPPORTED]: 'This feature isn\'t supported on your device',
      [ErrorCode.UNKNOWN]: 'An unexpected error occurred',
      [ErrorCode.UNEXPECTED]: 'Something went wrong',
    };
    return messages[code] || 'An error occurred';
  }

  private getDefaultRecoveryHint(code: ErrorCode): string {
    const hints: Partial<Record<ErrorCode, string>> = {
      [ErrorCode.NETWORK_OFFLINE]: 'Check your internet connection and try again',
      [ErrorCode.NETWORK_TIMEOUT]: 'Try again in a moment',
      [ErrorCode.NETWORK_REQUEST_FAILED]: 'Check your connection or try again later',
      [ErrorCode.NETWORK_SERVER_UNREACHABLE]: 'Please try again in a few minutes',
      [ErrorCode.AUTH_SESSION_EXPIRED]: 'Please sign in again',
      [ErrorCode.AUTH_WALLET_CONNECTION_FAILED]: 'Make sure your wallet app is open and try again',
      [ErrorCode.API_RATE_LIMITED]: 'Wait a moment before trying again',
      [ErrorCode.GAME_SYNC_FAILED]: 'Pull down to refresh the game',
      [ErrorCode.CHALLENGE_INSUFFICIENT_BALANCE]: 'Add funds to your wallet first',
      [ErrorCode.WALLET_INSUFFICIENT_FUNDS]: 'Deposit more funds to continue',
      [ErrorCode.MATCHMAKING_NO_OPPONENTS]: 'Try again in a few moments or create a challenge',
    };
    return hints[code] || 'Please try again';
  }

  private getDefaultSeverity(code: ErrorCode): ErrorSeverity {
    if (code >= 1000 && code < 2000) return ErrorSeverity.MEDIUM;
    if (code >= 2000 && code < 3000) return ErrorSeverity.HIGH;
    if (code >= 3000 && code < 4000) return ErrorSeverity.MEDIUM;
    if (code >= 4000 && code < 5000) return ErrorSeverity.MEDIUM;
    if (code >= 5000 && code < 6000) return ErrorSeverity.MEDIUM;
    if (code >= 6000 && code < 7000) return ErrorSeverity.HIGH;
    if (code >= 7000 && code < 8000) return ErrorSeverity.LOW;
    if (code >= 8000 && code < 9000) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.MEDIUM;
  }

  private getDefaultCategory(code: ErrorCode): ErrorCategory {
    if (code >= 1000 && code < 2000) return ErrorCategory.NETWORK;
    if (code >= 2000 && code < 3000) return ErrorCategory.AUTH;
    if (code >= 3000 && code < 4000) return ErrorCategory.API;
    if (code >= 4000 && code < 5000) return ErrorCategory.GAME;
    if (code >= 5000 && code < 6000) return ErrorCategory.CHALLENGE;
    if (code >= 6000 && code < 7000) return ErrorCategory.WALLET;
    if (code >= 7000 && code < 8000) return ErrorCategory.MATCHMAKING;
    if (code >= 8000 && code < 9000) return ErrorCategory.STORAGE;
    return ErrorCategory.UNKNOWN;
  }

  private isDefaultRetryable(code: ErrorCode): boolean {
    return [
      ErrorCode.NETWORK_OFFLINE,
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.NETWORK_REQUEST_FAILED,
      ErrorCode.NETWORK_SERVER_UNREACHABLE,
      ErrorCode.API_RATE_LIMITED,
      ErrorCode.GAME_SYNC_FAILED,
      ErrorCode.MATCHMAKING_NO_OPPONENTS,
    ].includes(code);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      recoveryHint: this.recoveryHint,
      severity: this.severity,
      category: this.category,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

// ============================================================================
// Error Parsing
// ============================================================================

interface SupabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}

export function parseError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    if (error.message.includes('Network request failed') ||
        error.message.includes('fetch failed') ||
        error.message.includes('Failed to fetch')) {
      return new AppError({
        code: ErrorCode.NETWORK_REQUEST_FAILED,
        message: error.message,
        originalError: error,
      });
    }

    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return new AppError({
        code: ErrorCode.NETWORK_TIMEOUT,
        message: error.message,
        originalError: error,
      });
    }

    if ('code' in error || 'status' in error) {
      return parseSupabaseError(error as Error & SupabaseError);
    }

    return new AppError({
      code: ErrorCode.UNEXPECTED,
      message: error.message,
      originalError: error,
    });
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    return parseSupabaseError(error as SupabaseError);
  }

  if (typeof error === 'string') {
    return new AppError({ code: ErrorCode.UNEXPECTED, message: error });
  }

  return new AppError({
    code: ErrorCode.UNKNOWN,
    message: 'An unknown error occurred',
    originalError: error,
  });
}

function parseSupabaseError(error: SupabaseError): AppError {
  const { code, message = 'Unknown error', status } = error;

  if (code === 'PGRST301' || status === 401) {
    return new AppError({ code: ErrorCode.AUTH_UNAUTHORIZED, message, originalError: error });
  }
  if (code === 'PGRST204' || status === 404) {
    return new AppError({ code: ErrorCode.API_RESOURCE_NOT_FOUND, message, originalError: error });
  }
  if (status === 409) {
    return new AppError({ code: ErrorCode.API_CONFLICT, message, originalError: error });
  }
  if (status === 429) {
    return new AppError({ code: ErrorCode.API_RATE_LIMITED, message, originalError: error });
  }
  if (status && status >= 500) {
    return new AppError({ code: ErrorCode.NETWORK_SERVER_UNREACHABLE, message, originalError: error });
  }
  if (message.toLowerCase().includes('insufficient')) {
    return new AppError({ code: ErrorCode.WALLET_INSUFFICIENT_FUNDS, message, originalError: error });
  }

  return new AppError({ code: ErrorCode.API_REQUEST_FAILED, message, originalError: error });
}

// ============================================================================
// Type Guards
// ============================================================================

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isNetworkError(error: unknown): boolean {
  if (isAppError(error)) return error.category === ErrorCategory.NETWORK;
  if (error instanceof Error) {
    return error.message.includes('Network') || error.message.includes('fetch') || error.message.includes('timeout');
  }
  return false;
}

export function isAuthError(error: unknown): boolean {
  return isAppError(error) && error.category === ErrorCategory.AUTH;
}

export function isRetryableError(error: unknown): boolean {
  if (isAppError(error)) return error.retryable;
  return isNetworkError(error);
}

// ============================================================================
// Factory Functions
// ============================================================================

export const createNetworkError = (
  code: ErrorCode = ErrorCode.NETWORK_REQUEST_FAILED,
  originalError?: unknown,
  context?: Record<string, unknown>
): AppError => new AppError({ code, message: `Network error: ${code}`, originalError, context });

export const createApiError = (
  code: ErrorCode = ErrorCode.API_REQUEST_FAILED,
  message: string,
  originalError?: unknown,
  context?: Record<string, unknown>
): AppError => new AppError({ code, message, originalError, context });

export const createGameError = (
  code: ErrorCode,
  message: string,
  context?: Record<string, unknown>
): AppError => new AppError({ code, message, context });

export const createWalletError = (
  code: ErrorCode,
  message: string,
  originalError?: unknown,
  context?: Record<string, unknown>
): AppError => new AppError({ code, message, originalError, context });
