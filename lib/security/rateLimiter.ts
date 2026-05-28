/**
 * Rate Limiter for Security-Critical Operations
 *
 * Client-side rate limiting with sliding window algorithm.
 * Protects against brute force attacks and abuse.
 *
 * @module lib/security/rateLimiter
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Maximum number of attempts allowed */
  maxAttempts: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Cooldown period after limit exceeded (ms) */
  cooldownMs?: number;
  /** Storage key prefix */
  keyPrefix?: string;
}

export interface RateLimitResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Remaining attempts in current window */
  remaining: number;
  /** Time in ms until limit resets */
  resetIn: number;
  /** Time in ms until action allowed (if blocked) */
  retryAfter: number;
}

interface StoredAttempt {
  timestamp: number;
}

interface RateLimitState {
  attempts: StoredAttempt[];
  lockedUntil?: number;
}

// ============================================================================
// Default Configurations
// ============================================================================

/** Rate limit for login attempts (5 per minute) */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 60 * 1000, // 1 minute
  cooldownMs: 5 * 60 * 1000, // 5 minute cooldown
  keyPrefix: "rate_auth",
};

/** Rate limit for OTP verification (3 per minute) */
export const OTP_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 3,
  windowMs: 60 * 1000, // 1 minute
  cooldownMs: 10 * 60 * 1000, // 10 minute cooldown
  keyPrefix: "rate_otp",
};

/** Rate limit for password reset requests (3 per hour) */
export const PASSWORD_RESET_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  cooldownMs: 60 * 60 * 1000, // 1 hour cooldown
  keyPrefix: "rate_pwd_reset",
};

/** Rate limit for API calls (100 per minute) */
export const API_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 100,
  windowMs: 60 * 1000, // 1 minute
  keyPrefix: "rate_api",
};

/** Rate limit for withdrawal requests (5 per day) */
export const WITHDRAWAL_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  cooldownMs: 60 * 60 * 1000, // 1 hour cooldown
  keyPrefix: "rate_withdraw",
};

/** Rate limit for matchmaking (10 per minute) */
export const MATCHMAKING_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 60 * 1000, // 1 minute
  keyPrefix: "rate_match",
};

/** Rate limit for challenge creation (20 per hour) */
export const CHALLENGE_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 20,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: "rate_challenge",
};

// ============================================================================
// RateLimiter Class
// ============================================================================

export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private memoryCache: Map<string, RateLimitState> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = {
      maxAttempts: config.maxAttempts,
      windowMs: config.windowMs,
      cooldownMs: config.cooldownMs ?? 0,
      keyPrefix: config.keyPrefix ?? "rate_limit",
    };
  }

  /**
   * Get storage key for a given identifier
   */
  private getStorageKey(identifier: string): string {
    return `${this.config.keyPrefix}_${identifier}`;
  }

  /**
   * Load state from storage
   */
  private async loadState(identifier: string): Promise<RateLimitState> {
    const key = this.getStorageKey(identifier);

    // Check memory cache first
    const cached = this.memoryCache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const state = JSON.parse(stored) as RateLimitState;
        this.memoryCache.set(key, state);
        return state;
      }
    } catch (error) {
      console.warn("[RateLimiter] Failed to load state:", error);
    }

    return { attempts: [] };
  }

  /**
   * Save state to storage
   */
  private async saveState(identifier: string, state: RateLimitState): Promise<void> {
    const key = this.getStorageKey(identifier);
    this.memoryCache.set(key, state);

    try {
      await AsyncStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn("[RateLimiter] Failed to save state:", error);
    }
  }

  /**
   * Clean expired attempts from state
   */
  private cleanExpiredAttempts(state: RateLimitState): RateLimitState {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    return {
      ...state,
      attempts: state.attempts.filter((a) => a.timestamp > windowStart),
    };
  }

  /**
   * Check if action is allowed and record attempt
   */
  async check(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    let state = await this.loadState(identifier);

    // Check if in cooldown period
    if (state.lockedUntil && state.lockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: state.lockedUntil - now,
        retryAfter: state.lockedUntil - now,
      };
    }

    // Clear lock if cooldown expired
    if (state.lockedUntil && state.lockedUntil <= now) {
      state.lockedUntil = undefined;
      state.attempts = [];
    }

    // Clean expired attempts
    state = this.cleanExpiredAttempts(state);

    const remaining = Math.max(0, this.config.maxAttempts - state.attempts.length);
    const oldestAttempt = state.attempts[0]?.timestamp ?? now;
    const resetIn = Math.max(0, oldestAttempt + this.config.windowMs - now);

    // Check if limit exceeded
    if (state.attempts.length >= this.config.maxAttempts) {
      // Apply cooldown if configured
      if (this.config.cooldownMs > 0 && !state.lockedUntil) {
        state.lockedUntil = now + this.config.cooldownMs;
        await this.saveState(identifier, state);
      }

      return {
        allowed: false,
        remaining: 0,
        resetIn: state.lockedUntil ? state.lockedUntil - now : resetIn,
        retryAfter: state.lockedUntil ? state.lockedUntil - now : resetIn,
      };
    }

    // Record this attempt
    state.attempts.push({ timestamp: now });
    await this.saveState(identifier, state);

    return {
      allowed: true,
      remaining: remaining - 1,
      resetIn,
      retryAfter: 0,
    };
  }

  /**
   * Check if action is allowed without recording
   */
  async peek(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    let state = await this.loadState(identifier);

    // Check if in cooldown period
    if (state.lockedUntil && state.lockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: state.lockedUntil - now,
        retryAfter: state.lockedUntil - now,
      };
    }

    // Clean expired attempts (don't save)
    state = this.cleanExpiredAttempts(state);

    const remaining = Math.max(0, this.config.maxAttempts - state.attempts.length);
    const oldestAttempt = state.attempts[0]?.timestamp ?? now;
    const resetIn = Math.max(0, oldestAttempt + this.config.windowMs - now);

    return {
      allowed: state.attempts.length < this.config.maxAttempts,
      remaining,
      resetIn,
      retryAfter: remaining > 0 ? 0 : resetIn,
    };
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = this.getStorageKey(identifier);
    this.memoryCache.delete(key);

    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn("[RateLimiter] Failed to reset state:", error);
    }
  }

  /**
   * Clear all rate limit data for this limiter
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();

    try {
      const keys = await AsyncStorage.getAllKeys();
      const rateLimitKeys = keys.filter((k) => k.startsWith(this.config.keyPrefix));
      if (rateLimitKeys.length > 0) {
        await AsyncStorage.multiRemove(rateLimitKeys);
      }
    } catch (error) {
      console.warn("[RateLimiter] Failed to clear all:", error);
    }
  }
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/** Auth rate limiter instance */
export const authRateLimiter = new RateLimiter(AUTH_RATE_LIMIT);

/** OTP rate limiter instance */
export const otpRateLimiter = new RateLimiter(OTP_RATE_LIMIT);

/** Password reset rate limiter instance */
export const passwordResetRateLimiter = new RateLimiter(PASSWORD_RESET_RATE_LIMIT);

/** API rate limiter instance */
export const apiRateLimiter = new RateLimiter(API_RATE_LIMIT);

/** Withdrawal rate limiter instance */
export const withdrawalRateLimiter = new RateLimiter(WITHDRAWAL_RATE_LIMIT);

/** Matchmaking rate limiter instance */
export const matchmakingRateLimiter = new RateLimiter(MATCHMAKING_RATE_LIMIT);

/** Challenge rate limiter instance */
export const challengeRateLimiter = new RateLimiter(CHALLENGE_RATE_LIMIT);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format retry time for display
 */
export function formatRetryTime(ms: number): string {
  if (ms <= 0) return "now";

  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Create rate limited wrapper for async functions
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  limiter: RateLimiter,
  getIdentifier: (...args: Parameters<T>) => string
): T {
  return (async (...args: Parameters<T>) => {
    const identifier = getIdentifier(...args);
    const result = await limiter.check(identifier);

    if (!result.allowed) {
      throw new RateLimitError(
        `Rate limit exceeded. Try again in ${formatRetryTime(result.retryAfter)}`,
        result
      );
    }

    return fn(...args);
  }) as T;
}

/**
 * Rate limit error class
 */
export class RateLimitError extends Error {
  public readonly result: RateLimitResult;

  constructor(message: string, result: RateLimitResult) {
    super(message);
    this.name = "RateLimitError";
    this.result = result;
  }
}

// ============================================================================
// Hook for React Native
// ============================================================================

import { useState, useCallback } from "react";

/**
 * React hook for rate limiting
 */
export function useRateLimit(
  limiter: RateLimiter,
  identifier: string
): {
  check: () => Promise<RateLimitResult>;
  peek: () => Promise<RateLimitResult>;
  reset: () => Promise<void>;
  isBlocked: boolean;
  remaining: number;
  retryAfter: number;
} {
  const [isBlocked, setIsBlocked] = useState(false);
  const [remaining, setRemaining] = useState(limiter["config"].maxAttempts);
  const [retryAfter, setRetryAfter] = useState(0);

  const updateState = useCallback((result: RateLimitResult) => {
    setIsBlocked(!result.allowed);
    setRemaining(result.remaining);
    setRetryAfter(result.retryAfter);
  }, []);

  const check = useCallback(async () => {
    const result = await limiter.check(identifier);
    updateState(result);
    return result;
  }, [limiter, identifier, updateState]);

  const peek = useCallback(async () => {
    const result = await limiter.peek(identifier);
    updateState(result);
    return result;
  }, [limiter, identifier, updateState]);

  const reset = useCallback(async () => {
    await limiter.reset(identifier);
    setIsBlocked(false);
    setRemaining(limiter["config"].maxAttempts);
    setRetryAfter(0);
  }, [limiter, identifier]);

  return {
    check,
    peek,
    reset,
    isBlocked,
    remaining,
    retryAfter,
  };
}
