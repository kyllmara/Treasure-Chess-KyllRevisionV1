/**
 * Security Validation Schemas
 *
 * Comprehensive Zod validation for all user inputs.
 * Critical for real-money gaming security.
 *
 * @module lib/security/validation
 */

import { z } from "zod";
import { getAddress } from "ethers";

// ============================================================================
// Constants
// ============================================================================

/** Minimum age for real-money gaming (years) */
export const MIN_GAMBLING_AGE = 18;

/** Maximum username length */
export const MAX_USERNAME_LENGTH = 30;

/** Minimum username length */
export const MIN_USERNAME_LENGTH = 3;

/** Maximum message length */
export const MAX_MESSAGE_LENGTH = 500;

/** Minimum deposit amount in TCT */
export const MIN_DEPOSIT_AMOUNT = 10;

/** Maximum deposit amount in TCT */
export const MAX_DEPOSIT_AMOUNT = 10000;

/** Minimum withdrawal amount in TCT */
export const MIN_WITHDRAWAL_AMOUNT = 10;

/** Maximum withdrawal amount in TCT */
export const MAX_WITHDRAWAL_AMOUNT = 5000;

/** Valid stake amounts */
export const VALID_STAKE_AMOUNTS = [0, 5, 10, 25, 50, 100] as const;

// ============================================================================
// Regex Patterns
// ============================================================================

/** Ethereum address pattern (0x followed by 40 hex characters) */
export const ETHEREUM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/** Solana address pattern (base58, 32-44 characters) */
export const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** UK sort code pattern (XX-XX-XX) */
export const UK_SORT_CODE_REGEX = /^\d{2}-\d{2}-\d{2}$/;

/** IBAN pattern (2 letter country code + 2 check digits + up to 30 alphanumeric) */
export const IBAN_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/;

/** SWIFT/BIC code pattern */
export const SWIFT_CODE_REGEX = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

/** US routing number (9 digits) */
export const US_ROUTING_NUMBER_REGEX = /^\d{9}$/;

/** Username pattern (alphanumeric, underscores, no leading/trailing underscores) */
export const USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

/** Email pattern (RFC 5322 simplified) */
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** OTP code pattern (6 digits) */
export const OTP_REGEX = /^\d{6}$/;

/** UUID v4 pattern */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// Base Schemas
// ============================================================================

/** UUID validation */
export const uuidSchema = z.string().regex(UUID_REGEX, "Invalid UUID format");

/** Email validation */
export const emailSchema = z
  .string()
  .min(5, "Email is too short")
  .max(254, "Email is too long")
  .regex(EMAIL_REGEX, "Invalid email format")
  .toLowerCase()
  .trim();

/** OTP code validation */
export const otpSchema = z
  .string()
  .length(6, "OTP must be 6 digits")
  .regex(OTP_REGEX, "OTP must contain only digits");

/** Username validation */
export const usernameSchema = z
  .string()
  .min(MIN_USERNAME_LENGTH, `Username must be at least ${MIN_USERNAME_LENGTH} characters`)
  .max(MAX_USERNAME_LENGTH, `Username must be at most ${MAX_USERNAME_LENGTH} characters`)
  .regex(USERNAME_REGEX, "Username can only contain letters, numbers, and underscores")
  .refine(
    (val) => !val.includes("__"),
    "Username cannot contain consecutive underscores"
  )
  .refine(
    (val) => !/admin|moderator|support|system|help|root/i.test(val),
    "This username is reserved"
  );

/** Display name (more permissive than username but still safe) */
export const displayNameSchema = z
  .string()
  .min(1, "Display name is required")
  .max(50, "Display name is too long")
  .trim()
  .refine(
    (val) => !/[<>{}[\]\\\/]/.test(val),
    "Display name contains invalid characters"
  );

/** Message/text content validation */
export const messageSchema = z
  .string()
  .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`)
  .trim();

// ============================================================================
// Wallet Address Schemas
// ============================================================================

/** Ethereum wallet address */
export const ethereumAddressSchema = z
  .string()
  .regex(ETHEREUM_ADDRESS_REGEX, "Invalid Ethereum address format")
  .refine((val) => {
    try {
      getAddress(val);
      return true;
    } catch {
      return false;
    }
  }, "Invalid Ethereum address checksum")
  .transform((val) => val.toLowerCase());

/** Solana wallet address */
export const solanaAddressSchema = z
  .string()
  .regex(SOLANA_ADDRESS_REGEX, "Invalid Solana address format");

/** Multi-chain wallet address (accepts ETH or SOL) */
export const walletAddressSchema = z.union([
  ethereumAddressSchema,
  solanaAddressSchema,
]);

// ============================================================================
// Financial Schemas
// ============================================================================

/** TCT amount (positive number with reasonable limits) */
export const tctAmountSchema = z
  .number()
  .positive("Amount must be positive")
  .max(1000000, "Amount exceeds maximum limit")
  .refine(
    (val) => Number.isFinite(val) && !Number.isNaN(val),
    "Invalid amount"
  );

/** Deposit amount validation */
export const depositAmountSchema = z
  .number()
  .min(MIN_DEPOSIT_AMOUNT, `Minimum deposit is $${MIN_DEPOSIT_AMOUNT}`)
  .max(MAX_DEPOSIT_AMOUNT, `Maximum deposit is $${MAX_DEPOSIT_AMOUNT}`)
  .refine(
    (val) => Number.isFinite(val) && !Number.isNaN(val),
    "Invalid deposit amount"
  );

/** Withdrawal amount validation */
export const withdrawalAmountSchema = z
  .number()
  .min(MIN_WITHDRAWAL_AMOUNT, `Minimum withdrawal is $${MIN_WITHDRAWAL_AMOUNT}`)
  .max(MAX_WITHDRAWAL_AMOUNT, `Maximum withdrawal is $${MAX_WITHDRAWAL_AMOUNT}`)
  .refine(
    (val) => Number.isFinite(val) && !Number.isNaN(val),
    "Invalid withdrawal amount"
  );

/** Stake amount validation (must be valid tier) */
export const stakeAmountSchema = z
  .number()
  .refine(
    (val): val is typeof VALID_STAKE_AMOUNTS[number] =>
      VALID_STAKE_AMOUNTS.includes(val as any),
    `Invalid stake amount. Must be one of: ${VALID_STAKE_AMOUNTS.join(", ")}`
  );

// ============================================================================
// Banking Schemas
// ============================================================================

/** UK bank account details */
export const ukBankAccountSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(100),
  sortCode: z
    .string()
    .regex(UK_SORT_CODE_REGEX, "Sort code must be in format XX-XX-XX"),
  accountNumber: z
    .string()
    .length(8, "Account number must be 8 digits")
    .regex(/^\d+$/, "Account number must contain only digits"),
});

/** International bank account (IBAN) */
export const internationalBankAccountSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(100),
  iban: z
    .string()
    .regex(IBAN_REGEX, "Invalid IBAN format")
    .transform((val) => val.replace(/\s/g, "").toUpperCase()),
  swiftCode: z
    .string()
    .regex(SWIFT_CODE_REGEX, "Invalid SWIFT/BIC code")
    .toUpperCase()
    .optional(),
  bankName: z.string().min(2).max(100).optional(),
  bankAddress: z.string().max(200).optional(),
});

/** US bank account */
export const usBankAccountSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(100),
  routingNumber: z
    .string()
    .regex(US_ROUTING_NUMBER_REGEX, "Routing number must be 9 digits"),
  accountNumber: z
    .string()
    .min(4, "Account number too short")
    .max(17, "Account number too long")
    .regex(/^\d+$/, "Account number must contain only digits"),
  accountType: z.enum(["checking", "savings"]),
});

// ============================================================================
// Authentication Schemas
// ============================================================================

/** Login with email request */
export const loginEmailSchema = z.object({
  email: emailSchema,
});

/** Verify OTP request */
export const verifyOtpSchema = z.object({
  email: emailSchema,
  otpCode: otpSchema,
});

/** OAuth login request */
export const oauthLoginSchema = z.object({
  provider: z.enum(["google", "apple", "twitter", "discord"]),
});

// ============================================================================
// Profile Schemas
// ============================================================================

/** Profile update request */
export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  avatarIndex: z.number().int().min(0).max(50).optional(),
  country: z.string().length(2, "Country must be ISO 3166-1 alpha-2 code").optional(),
  bio: z.string().max(200, "Bio must be at most 200 characters").optional(),
});

/** Initial profile setup */
export const profileSetupSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema.optional(),
  avatarIndex: z.number().int().min(0).max(50).default(0),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms of service" }),
  }),
  isOver18: z.literal(true, {
    errorMap: () => ({ message: "You must be 18 or older to play" }),
  }),
});

// ============================================================================
// Game Schemas
// ============================================================================

/** Valid time control IDs */
export const TIME_CONTROL_IDS = [
  "bullet_1_0",
  "bullet_1_1",
  "bullet_2_1",
  "blitz_3_0",
  "blitz_3_2",
  "blitz_5_0",
  "blitz_5_3",
  "rapid_10_0",
  "rapid_10_5",
  "rapid_15_10",
  "classical_30_0",
] as const;

/** Time control validation */
export const timeControlIdSchema = z.enum(TIME_CONTROL_IDS);

/** Matchmaking request */
export const matchmakingRequestSchema = z.object({
  stakeAmount: stakeAmountSchema,
  timeControlId: timeControlIdSchema,
});

/** Challenge creation request */
export const challengeCreateSchema = z.object({
  opponentId: uuidSchema.optional(),
  opponentUsername: usernameSchema.optional(),
  stakeAmount: stakeAmountSchema,
  timeControlId: timeControlIdSchema,
  colorPreference: z.enum(["white", "black", "random"]).default("random"),
  isRated: z.boolean().default(true),
  message: messageSchema.optional(),
}).refine(
  (data) => data.opponentId || data.opponentUsername,
  "Either opponentId or opponentUsername is required"
);

/** Chess move validation */
export const chessMoveSchema = z.object({
  gameId: uuidSchema,
  from: z.string().regex(/^[a-h][1-8]$/, "Invalid square notation"),
  to: z.string().regex(/^[a-h][1-8]$/, "Invalid square notation"),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

// ============================================================================
// Withdrawal Schemas
// ============================================================================

/** Crypto withdrawal request */
export const cryptoWithdrawalSchema = z.object({
  amount: withdrawalAmountSchema,
  walletAddress: walletAddressSchema,
  chain: z.enum(["ethereum", "solana", "polygon", "base"]),
  currency: z.enum(["USDC", "USDT", "ETH", "SOL"]).default("USDC"),
});

/** Bank withdrawal request */
export const bankWithdrawalSchema = z.object({
  amount: withdrawalAmountSchema,
  currency: z.enum(["USD", "EUR", "GBP"]),
  bankDetails: z.union([
    ukBankAccountSchema,
    internationalBankAccountSchema,
    usBankAccountSchema,
  ]),
});

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Type-safe validation helper
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Get human-readable validation errors
 */
export function getValidationErrors(error: z.ZodError): string[] {
  if (!error || !error.errors) return [];
  return error.errors.map((e) => {
    const path = e.path.join(".");
    return path ? `${path}: ${e.message}` : e.message;
  });
}

/**
 * Validate and throw on error (for server-side use)
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Create a validation result with formatted errors
 */
export function createValidationResult<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): {
  isValid: boolean;
  data?: T;
  errors?: string[];
  fieldErrors?: Record<string, string>;
} {
  const result = schema.safeParse(data);

  if (result.success) {
    return { isValid: true, data: result.data };
  }

  const fieldErrors: Record<string, string> = {};
  if (result.error && result.error.errors) {
    result.error.errors.forEach((e) => {
      const path = e.path.join(".");
      if (path) {
        fieldErrors[path] = e.message;
      }
    });
  }

  return {
    isValid: false,
    errors: getValidationErrors(result.error),
    fieldErrors,
  };
}

// ============================================================================
// Type Exports
// ============================================================================

export type Email = z.infer<typeof emailSchema>;
export type Username = z.infer<typeof usernameSchema>;
export type OtpCode = z.infer<typeof otpSchema>;
export type EthereumAddress = z.infer<typeof ethereumAddressSchema>;
export type SolanaAddress = z.infer<typeof solanaAddressSchema>;
export type WalletAddress = z.infer<typeof walletAddressSchema>;
export type TctAmount = z.infer<typeof tctAmountSchema>;
export type DepositAmount = z.infer<typeof depositAmountSchema>;
export type WithdrawalAmount = z.infer<typeof withdrawalAmountSchema>;
export type StakeAmount = z.infer<typeof stakeAmountSchema>;
export type TimeControlId = z.infer<typeof timeControlIdSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type ProfileSetup = z.infer<typeof profileSetupSchema>;
export type MatchmakingRequest = z.infer<typeof matchmakingRequestSchema>;
export type ChallengeCreate = z.infer<typeof challengeCreateSchema>;
export type ChessMove = z.infer<typeof chessMoveSchema>;
export type CryptoWithdrawal = z.infer<typeof cryptoWithdrawalSchema>;
export type BankWithdrawal = z.infer<typeof bankWithdrawalSchema>;
export type UkBankAccount = z.infer<typeof ukBankAccountSchema>;
export type InternationalBankAccount = z.infer<typeof internationalBankAccountSchema>;
export type UsBankAccount = z.infer<typeof usBankAccountSchema>;
