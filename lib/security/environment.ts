/**
 * Environment Security and Production Checks
 *
 * Ensures proper security configuration for different environments.
 * Prevents demo/test code from running in production.
 *
 * @module lib/security/environment
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

// ============================================================================
// Environment Detection
// ============================================================================

/** Check if running in development mode */
export const isDevelopment = __DEV__;

/** Check if running in production mode */
export const isProduction = !__DEV__;

/** Check if running in Expo Go */
export const isExpoGo = Constants.appOwnership === "expo";

/** Check if running as standalone app */
export const isStandalone = Constants.appOwnership === "standalone";

/** Get current environment name */
export function getEnvironment(): "development" | "staging" | "production" {
  if (__DEV__) return "development";

  // Check for staging indicators
  const releaseChannel = Constants.expoConfig?.extra?.releaseChannel;
  if (releaseChannel === "staging" || releaseChannel === "beta") {
    return "staging";
  }

  return "production";
}

// ============================================================================
// Security Configuration
// ============================================================================

export interface SecurityConfig {
  /** Allow demo mode (bypass auth) */
  allowDemoMode: boolean;
  /** Allow test accounts */
  allowTestAccounts: boolean;
  /** Require HTTPS for API calls */
  requireHttps: boolean;
  /** Enable debug logging */
  enableDebugLogging: boolean;
  /** Enable crash reporting */
  enableCrashReporting: boolean;
  /** Minimum API version required */
  minApiVersion: string;
  /** Enable certificate pinning */
  enableCertPinning: boolean;
  /** Allow mock payment providers */
  allowMockPayments: boolean;
  /** Require KYC for withdrawals */
  requireKycForWithdrawal: boolean;
  /** Maximum session duration (ms) */
  maxSessionDuration: number;
}

/** Development security config (permissive) */
const developmentConfig: SecurityConfig = {
  allowDemoMode: true,
  allowTestAccounts: true,
  requireHttps: false,
  enableDebugLogging: true,
  enableCrashReporting: false,
  minApiVersion: "1.0.0",
  enableCertPinning: false,
  allowMockPayments: true,
  requireKycForWithdrawal: false,
  maxSessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/** Staging security config (moderate) */
const stagingConfig: SecurityConfig = {
  allowDemoMode: true,
  allowTestAccounts: true,
  requireHttps: true,
  enableDebugLogging: true,
  enableCrashReporting: true,
  minApiVersion: "1.0.0",
  enableCertPinning: false,
  allowMockPayments: true,
  requireKycForWithdrawal: false,
  maxSessionDuration: 24 * 60 * 60 * 1000, // 24 hours
};

/** Production security config (strict) */
const productionConfig: SecurityConfig = {
  allowDemoMode: false,
  allowTestAccounts: false,
  requireHttps: true,
  enableDebugLogging: false,
  enableCrashReporting: true,
  minApiVersion: "1.0.0",
  enableCertPinning: true,
  allowMockPayments: false,
  requireKycForWithdrawal: true,
  maxSessionDuration: 4 * 60 * 60 * 1000, // 4 hours
};

/** Get security config for current environment */
export function getSecurityConfig(): SecurityConfig {
  const env = getEnvironment();
  switch (env) {
    case "development":
      return developmentConfig;
    case "staging":
      return stagingConfig;
    case "production":
      return productionConfig;
  }
}

// ============================================================================
// Security Checks
// ============================================================================

export interface SecurityCheckResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Run comprehensive security checks
 */
export function runSecurityChecks(): SecurityCheckResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const config = getSecurityConfig();
  const env = getEnvironment();

  // Check 1: Production should not allow demo mode
  if (env === "production" && config.allowDemoMode) {
    issues.push("Demo mode should be disabled in production");
  }

  // Check 2: Production should not allow test accounts
  if (env === "production" && config.allowTestAccounts) {
    issues.push("Test accounts should be disabled in production");
  }

  // Check 3: HTTPS should be required in production
  if (env === "production" && !config.requireHttps) {
    issues.push("HTTPS should be required in production");
  }

  // Check 4: Debug logging should be disabled in production
  if (env === "production" && config.enableDebugLogging) {
    issues.push("Debug logging should be disabled in production");
  }

  // Check 5: Crash reporting should be enabled in production
  if (env === "production" && !config.enableCrashReporting) {
    warnings.push("Crash reporting should be enabled in production");
  }

  // Check 6: Certificate pinning for production
  if (env === "production" && !config.enableCertPinning) {
    warnings.push("Certificate pinning is recommended for production");
  }

  // Check 7: Mock payments should be disabled in production
  if (env === "production" && config.allowMockPayments) {
    issues.push("Mock payments should be disabled in production");
  }

  // Check 8: KYC should be required for production withdrawals
  if (env === "production" && !config.requireKycForWithdrawal) {
    issues.push("KYC verification should be required for withdrawals in production");
  }

  // Check 9: Verify environment variables
  const requiredEnvVars = [
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      if (env === "production") {
        issues.push(`Missing required environment variable: ${envVar}`);
      } else {
        warnings.push(`Missing environment variable: ${envVar}`);
      }
    }
  }

  // Check 10: Verify no sensitive data in logs
  if (env === "production") {
    // This would be checked at build time
    warnings.push("Ensure console.log statements are removed from production build");
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Assert environment is suitable for production
 * Throws if critical issues found
 */
export function assertProductionReady(): void {
  if (!isProduction) return;

  const result = runSecurityChecks();
  if (!result.passed) {
    const errorMsg = `Production security check failed:\n${result.issues.join("\n")}`;
    throw new Error(errorMsg);
  }
}

// ============================================================================
// Feature Flags Based on Environment
// ============================================================================

/**
 * Check if a feature should be enabled
 */
export function isFeatureEnabled(feature: keyof SecurityConfig): boolean {
  const config = getSecurityConfig();
  return config[feature] as boolean;
}

/**
 * Check if demo mode is allowed
 */
export function isDemoModeAllowed(): boolean {
  return getSecurityConfig().allowDemoMode;
}

/**
 * Check if test accounts are allowed
 */
export function areTestAccountsAllowed(): boolean {
  return getSecurityConfig().allowTestAccounts;
}

/**
 * Check if mock payments are allowed
 */
export function areMockPaymentsAllowed(): boolean {
  return getSecurityConfig().allowMockPayments;
}

// ============================================================================
// Test Account Detection
// ============================================================================

/** Test email patterns */
const TEST_EMAIL_PATTERNS = [
  /test@/i,
  /demo@/i,
  /fake@/i,
  /example@/i,
  /@test\./i,
  /@example\./i,
  /@mailinator\./i,
  /\+test@/i,
];

/** Test username patterns */
const TEST_USERNAME_PATTERNS = [
  /^test/i,
  /^demo/i,
  /^fake/i,
  /^admin/i,
  /^root/i,
  /test$/i,
  /demo$/i,
];

/**
 * Check if email appears to be a test account
 */
export function isTestEmail(email: string): boolean {
  return TEST_EMAIL_PATTERNS.some((pattern) => pattern.test(email));
}

/**
 * Check if username appears to be a test account
 */
export function isTestUsername(username: string): boolean {
  return TEST_USERNAME_PATTERNS.some((pattern) => pattern.test(username));
}

/**
 * Validate account is not a test account (for production)
 */
export function validateNotTestAccount(
  email?: string,
  username?: string
): { valid: boolean; reason?: string } {
  if (!isProduction || areTestAccountsAllowed()) {
    return { valid: true };
  }

  if (email && isTestEmail(email)) {
    return { valid: false, reason: "Test email addresses are not allowed" };
  }

  if (username && isTestUsername(username)) {
    return { valid: false, reason: "Test usernames are not allowed" };
  }

  return { valid: true };
}

// ============================================================================
// App Version Checks
// ============================================================================

/**
 * Get current app version
 */
export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/**
 * Get build number
 */
export function getBuildNumber(): string {
  if (Platform.OS === "ios") {
    return Constants.expoConfig?.ios?.buildNumber ?? "0";
  }
  return String(Constants.expoConfig?.android?.versionCode ?? 0);
}

/**
 * Check if app version is outdated
 */
export function isVersionOutdated(minVersion: string): boolean {
  const current = getAppVersion();
  return compareVersions(current, minVersion) < 0;
}

/**
 * Compare semver versions
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;

    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }

  return 0;
}

// ============================================================================
// Device Security
// ============================================================================

/**
 * Check for security risks on device
 */
export async function checkDeviceSecurity(): Promise<{
  isSecure: boolean;
  risks: string[];
}> {
  const risks: string[] = [];

  // Note: Full jailbreak/root detection would require native modules
  // These are basic checks that can be done in JS

  // Check 1: Running in Expo Go (less secure for production)
  if (isExpoGo && isProduction) {
    risks.push("Running in Expo Go is not recommended for production");
  }

  // Check 2: Debug mode in production
  if (__DEV__ && isProduction) {
    risks.push("Debug mode detected in production environment");
  }

  return {
    isSecure: risks.length === 0,
    risks,
  };
}

// ============================================================================
// Exports
// ============================================================================

export const environment = {
  isDevelopment,
  isProduction,
  isExpoGo,
  isStandalone,
  current: getEnvironment(),
  config: getSecurityConfig(),
};
