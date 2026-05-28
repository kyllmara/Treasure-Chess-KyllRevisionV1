/**
 * Error Tracking & Monitoring Service
 *
 * Provides centralized error reporting with Sentry integration.
 * Includes fingerprinting, breadcrumbs, and user context.
 */

import { Platform } from 'react-native';
import { AppError, ErrorCode, ErrorSeverity, ErrorCategory, parseError, isAppError } from './errors';

// ============================================================================
// Types
// ============================================================================

interface UserContext {
  id: string;
  username?: string;
  email?: string;
  walletAddress?: string;
}

interface Breadcrumb {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  level: 'debug' | 'info' | 'warning' | 'error';
  timestamp: number;
}

type SentryInstance = {
  init: (options: unknown) => void;
  captureException: (error: Error, context?: unknown) => string;
  captureMessage: (message: string, context?: unknown) => string;
  setUser: (user: unknown) => void;
  setTag: (key: string, value: string) => void;
  addBreadcrumb: (breadcrumb: unknown) => void;
  withScope: (callback: (scope: unknown) => void) => void;
} | null;

// ============================================================================
// Configuration
// ============================================================================

interface ErrorTrackingConfig {
  dsn?: string;
  environment: 'development' | 'staging' | 'production';
  release?: string;
  debug?: boolean;
  sampleRate?: number;
  enableInDev?: boolean;
}

const defaultConfig: ErrorTrackingConfig = {
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  release: process.env.EXPO_PUBLIC_APP_VERSION || '1.0.0',
  debug: __DEV__,
  sampleRate: 1.0,
  enableInDev: false,
};

// ============================================================================
// Breadcrumb Buffer
// ============================================================================

const MAX_BREADCRUMBS = 100;
const breadcrumbBuffer: Breadcrumb[] = [];

function addToBreadcrumbBuffer(breadcrumb: Breadcrumb): void {
  breadcrumbBuffer.push(breadcrumb);
  if (breadcrumbBuffer.length > MAX_BREADCRUMBS) {
    breadcrumbBuffer.shift();
  }
}

// ============================================================================
// Error Tracker Service
// ============================================================================

let Sentry: SentryInstance = null;
let isInitialized = false;

class ErrorTrackerService {
  private config: ErrorTrackingConfig = defaultConfig;
  private userContext: UserContext | null = null;
  private enabled = false;

  async initialize(config?: Partial<ErrorTrackingConfig>): Promise<void> {
    if (isInitialized) return;

    this.config = { ...defaultConfig, ...config };

    if (__DEV__ && !this.config.enableInDev) {
      console.info('[ErrorTracking] Disabled in development');
      isInitialized = true;
      return;
    }

    if (!this.config.dsn) {
      console.warn('[ErrorTracking] No Sentry DSN configured');
      isInitialized = true;
      return;
    }

    // Sentry disabled for demo - just use console logging
    console.info('[ErrorTracking] Using console logging (Sentry disabled)');

    isInitialized = true;
  }

  private flushBreadcrumbBuffer(): void {
    if (!Sentry) return;
    for (const b of breadcrumbBuffer) {
      Sentry.addBreadcrumb({
        category: b.category,
        message: b.message,
        data: b.data,
        level: b.level,
        timestamp: b.timestamp / 1000,
      });
    }
    breadcrumbBuffer.length = 0;
  }

  setUser(user: UserContext | null): void {
    this.userContext = user;
    if (!Sentry) return;

    if (user) {
      Sentry.setUser({ id: user.id, username: user.username, email: user.email });
      if (user.walletAddress) {
        Sentry.setTag('wallet', user.walletAddress.slice(0, 10) + '...');
      }
    } else {
      Sentry.setUser(null);
    }
  }

  setTag(key: string, value: string): void {
    if (Sentry) Sentry.setTag(key, value);
  }

  addBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>,
    level: 'debug' | 'info' | 'warning' | 'error' = 'info'
  ): void {
    const breadcrumb: Breadcrumb = { category, message, data, level, timestamp: Date.now() };
    addToBreadcrumbBuffer(breadcrumb);

    if (Sentry) {
      Sentry.addBreadcrumb({ category, message, data, level, timestamp: Date.now() / 1000 });
    }
  }

  captureError(
    error: unknown,
    context?: { tags?: Record<string, string>; extras?: Record<string, unknown>; fingerprint?: string[] }
  ): string | null {
    const appError = isAppError(error) ? error : parseError(error);
    this.logErrorLocally(appError);

    if (!this.enabled || !Sentry) return null;

    let eventId: string | null = null;

    Sentry.withScope((scope: unknown) => {
      const s = scope as {
        setLevel: (l: string) => void;
        setTag: (k: string, v: string) => void;
        setExtra: (k: string, v: unknown) => void;
        setFingerprint: (f: string[]) => void;
      };

      s.setLevel(this.severityToSentryLevel(appError.severity));
      s.setTag('error.code', String(appError.code));
      s.setTag('error.category', appError.category);
      s.setTag('error.retryable', String(appError.retryable));

      if (context?.tags) {
        Object.entries(context.tags).forEach(([k, v]) => s.setTag(k, v));
      }

      s.setExtra('appError', appError.toJSON());
      if (context?.extras) {
        Object.entries(context.extras).forEach(([k, v]) => s.setExtra(k, v));
      }

      if (context?.fingerprint) {
        s.setFingerprint(context.fingerprint);
      } else {
        s.setFingerprint(['{{ default }}', String(appError.code)]);
      }

      eventId = Sentry!.captureException(appError);
    });

    return eventId;
  }

  captureMessage(
    message: string,
    level: 'debug' | 'info' | 'warning' | 'error' = 'info',
    context?: Record<string, unknown>
  ): string | null {
    const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
    logFn(`[ErrorTracking] ${message}`, context);

    if (!this.enabled || !Sentry) return null;

    let eventId: string | null = null;
    Sentry.withScope((scope: unknown) => {
      const s = scope as { setLevel: (l: string) => void; setExtra: (k: string, v: unknown) => void };
      s.setLevel(level);
      if (context) s.setExtra('context', context);
      eventId = Sentry!.captureMessage(message);
    });

    return eventId;
  }

  private logErrorLocally(error: AppError): void {
    const prefix = `[${error.category.toUpperCase()}]`;
    const codeStr = `(${ErrorCode[error.code]})`;

    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      console.error(`${prefix} ${codeStr}:`, error.message, error.context);
    } else if (error.severity === ErrorSeverity.MEDIUM) {
      console.warn(`${prefix} ${codeStr}:`, error.message);
    } else {
      console.info(`${prefix} ${codeStr}:`, error.message);
    }
  }

  private severityToSentryLevel(severity: ErrorSeverity): string {
    const map: Record<ErrorSeverity, string> = {
      [ErrorSeverity.CRITICAL]: 'fatal',
      [ErrorSeverity.HIGH]: 'error',
      [ErrorSeverity.MEDIUM]: 'warning',
      [ErrorSeverity.LOW]: 'info',
    };
    return map[severity] || 'error';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isReady(): boolean {
    return isInitialized;
  }

  async testCapture(): Promise<string | null> {
    const testError = new AppError({
      code: ErrorCode.UNKNOWN,
      message: 'Test error from ErrorTracker.testCapture()',
      severity: ErrorSeverity.LOW,
      context: { test: true, timestamp: new Date().toISOString() },
    });
    return this.captureError(testError, { tags: { test: 'true' } });
  }
}

export const ErrorTracker = new ErrorTrackerService();

// ============================================================================
// Utilities
// ============================================================================

export function withErrorTracking<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: { operation?: string; tags?: Record<string, string> }
): T {
  return (async (...args: Parameters<T>) => {
    ErrorTracker.addBreadcrumb('function', `Starting ${context?.operation || fn.name}`, { args: args.length });
    try {
      const result = await fn(...args);
      ErrorTracker.addBreadcrumb('function', `Completed ${context?.operation || fn.name}`);
      return result;
    } catch (error) {
      ErrorTracker.captureError(error, {
        tags: { operation: context?.operation || fn.name, ...context?.tags },
        extras: { args },
      });
      throw error;
    }
  }) as T;
}

export function createScopedTracker(category: ErrorCategory) {
  return {
    captureError: (error: unknown, context?: Record<string, unknown>) => {
      ErrorTracker.captureError(error, { tags: { scope: category }, extras: context });
    },
    addBreadcrumb: (message: string, data?: Record<string, unknown>) => {
      ErrorTracker.addBreadcrumb(category, message, data);
    },
  };
}
