/**
 * Security Module
 *
 * Comprehensive security utilities for real-money gaming.
 * Includes validation, sanitization, rate limiting, and auditing.
 *
 * @module lib/security
 */

// ============================================================================
// Validation
// ============================================================================

export {
  // Schemas
  emailSchema,
  otpSchema,
  usernameSchema,
  displayNameSchema,
  messageSchema,
  ethereumAddressSchema,
  solanaAddressSchema,
  walletAddressSchema,
  tctAmountSchema,
  depositAmountSchema,
  withdrawalAmountSchema,
  stakeAmountSchema,
  ukBankAccountSchema,
  internationalBankAccountSchema,
  usBankAccountSchema,
  loginEmailSchema,
  verifyOtpSchema,
  oauthLoginSchema,
  profileUpdateSchema,
  profileSetupSchema,
  timeControlIdSchema,
  matchmakingRequestSchema,
  challengeCreateSchema,
  chessMoveSchema,
  cryptoWithdrawalSchema,
  bankWithdrawalSchema,
  uuidSchema,

  // Utilities
  validate,
  getValidationErrors,
  validateOrThrow,
  createValidationResult,

  // Constants
  VALID_STAKE_AMOUNTS,
  TIME_CONTROL_IDS,
  MIN_DEPOSIT_AMOUNT,
  MAX_DEPOSIT_AMOUNT,
  MIN_WITHDRAWAL_AMOUNT,
  MAX_WITHDRAWAL_AMOUNT,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  MAX_MESSAGE_LENGTH,

  // Regex patterns
  ETHEREUM_ADDRESS_REGEX,
  SOLANA_ADDRESS_REGEX,
  UK_SORT_CODE_REGEX,
  IBAN_REGEX,
  SWIFT_CODE_REGEX,
  EMAIL_REGEX,
  OTP_REGEX,
  UUID_REGEX,

  // Types
  type Email,
  type Username,
  type OtpCode,
  type EthereumAddress,
  type SolanaAddress,
  type WalletAddress,
  type TctAmount,
  type DepositAmount,
  type WithdrawalAmount,
  type StakeAmount,
  type TimeControlId,
  type ProfileUpdate,
  type ProfileSetup,
  type MatchmakingRequest,
  type ChallengeCreate,
  type ChessMove,
  type CryptoWithdrawal,
  type BankWithdrawal,
  type UkBankAccount,
  type InternationalBankAccount,
  type UsBankAccount,
} from "./validation";

// ============================================================================
// Sanitization
// ============================================================================

export {
  // Core functions
  encodeHtmlEntities,
  stripHtml,
  removeDangerousPatterns,
  sanitizeDisplayName,
  sanitizeUsername,
  sanitizeMessage,
  sanitizeUrl,
  sanitizeFileName,

  // Detection functions
  detectXss,
  detectSqlInjection,
  detectCommandInjection,
  securityCheck,

  // JSON sanitization
  sanitizeJsonObject,

  // React Native helpers
  sanitizeForDisplay,
  safeTextProps,

  // Constants
  SECURITY_PATTERNS,
} from "./sanitization";

// ============================================================================
// Rate Limiting
// ============================================================================

export {
  // Class
  RateLimiter,
  RateLimitError,

  // Pre-configured limiters
  authRateLimiter,
  otpRateLimiter,
  passwordResetRateLimiter,
  apiRateLimiter,
  withdrawalRateLimiter,
  matchmakingRateLimiter,
  challengeRateLimiter,

  // Configurations
  AUTH_RATE_LIMIT,
  OTP_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
  API_RATE_LIMIT,
  WITHDRAWAL_RATE_LIMIT,
  MATCHMAKING_RATE_LIMIT,
  CHALLENGE_RATE_LIMIT,

  // Utilities
  formatRetryTime,
  withRateLimit,
  useRateLimit,

  // Types
  type RateLimitConfig,
  type RateLimitResult,
} from "./rateLimiter";

// ============================================================================
// Environment
// ============================================================================

export {
  // Detection
  isDevelopment,
  isProduction,
  isExpoGo,
  isStandalone,
  getEnvironment,

  // Configuration
  getSecurityConfig,

  // Security checks
  runSecurityChecks,
  assertProductionReady,

  // Feature flags
  isFeatureEnabled,
  isDemoModeAllowed,
  areTestAccountsAllowed,
  areMockPaymentsAllowed,

  // Test account detection
  isTestEmail,
  isTestUsername,
  validateNotTestAccount,

  // App version
  getAppVersion,
  getBuildNumber,
  isVersionOutdated,

  // Device security
  checkDeviceSecurity,

  // Exports
  environment,

  // Types
  type SecurityConfig,
  type SecurityCheckResult,
} from "./environment";

// ============================================================================
// Logger
// ============================================================================

export {
  // Logger instance
  logger,

  // Convenience functions
  logDebug,
  logInfo,
  logWarn,
  logError,
  logAudit,

  // Types
  type LogLevel,
  type LogEntry,
  type AuditLogEntry,
} from "./logger";

// ============================================================================
// Ledger (Double-Entry Accounting)
// ============================================================================

export {
  // Service
  LedgerService,
  ledger,

  // Convenience functions
  recordDeposit,
  recordWithdrawal,
  lockEscrow,
  releaseEscrow,
  getUserBalance,
  getTransactionHistory,

  // Constants
  SYSTEM_ACCOUNTS,
  PLATFORM_FEE_RATE,
  MIN_TRANSACTION_AMOUNT,

  // Types
  type AccountType,
  type TransactionType,
  type EntryDirection,
  type LedgerEntry,
  type LedgerTransaction,
  type AccountBalance,
} from "./ledger";

// ============================================================================
// Escrow
// ============================================================================

export {
  // Service
  EscrowService,
  escrowService,

  // Convenience functions
  createEscrow,
  lockFunds,
  lockBothPlayers,
  releaseFunds,
  cancelEscrow,
  getEscrow,
  getPlayerEscrows,
  getPlayerLockedFunds,

  // Types
  type EscrowState,
  type EscrowStatus,
  type EscrowResult,
  type GameOutcome,
} from "./escrow";

// ============================================================================
// Quick Access Utilities
// ============================================================================

/**
 * Validate and sanitize user input in one step
 */
export function processUserInput(input: string): {
  sanitized: string;
  isValid: boolean;
  threats: string[];
} {
  const { securityCheck } = require("./sanitization");
  return securityCheck(input);
}

/**
 * Check if current environment allows an operation
 */
export function checkOperationAllowed(
  operation: "demo" | "test_accounts" | "mock_payments"
): boolean {
  const { isDemoModeAllowed, areTestAccountsAllowed, areMockPaymentsAllowed } =
    require("./environment");

  switch (operation) {
    case "demo":
      return isDemoModeAllowed();
    case "test_accounts":
      return areTestAccountsAllowed();
    case "mock_payments":
      return areMockPaymentsAllowed();
    default:
      return false;
  }
}

/**
 * Initialize security module (call on app start)
 */
export async function initializeSecurity(): Promise<{
  environment: string;
  securityPassed: boolean;
  issues: string[];
}> {
  const { getEnvironment, runSecurityChecks } = require("./environment");
  const { logger } = require("./logger");

  const env = getEnvironment();
  const checks = runSecurityChecks();

  if (!checks.passed) {
    logger.warn("Security", "Security checks found issues", {
      issues: checks.issues,
      warnings: checks.warnings,
    });
  }

  logger.info("Security", "Security module initialized", {
    environment: env,
    checksPassed: checks.passed,
  });

  return {
    environment: env,
    securityPassed: checks.passed,
    issues: checks.issues,
  };
}
