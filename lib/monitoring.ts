/**
 * Monitoring & Error Handling Module
 *
 * Central export for all error handling, monitoring, and analytics utilities.
 *
 * Usage:
 *   import { ErrorTracker, Analytics, NetworkMonitor } from '@/lib/monitoring';
 */

// Core error types and utilities
export {
  AppError,
  ErrorCode,
  ErrorSeverity,
  ErrorCategory,
  parseError,
  isAppError,
  isNetworkError,
  isAuthError,
  isRetryableError,
  createNetworkError,
  createApiError,
  createGameError,
  createWalletError,
} from './errors';

export type { AppErrorOptions } from './errors';

// Error tracking (Sentry integration)
export {
  ErrorTracker,
  withErrorTracking,
  createScopedTracker,
} from './errorTracking';

// Network monitoring
export {
  NetworkMonitor,
  fetchWithRetry,
} from './networkMonitor';

export type {
  NetworkStatus,
  NetworkState,
  QueuedOperation,
  FetchWithRetryOptions,
} from './networkMonitor';

// Analytics
export {
  Analytics,
  AnalyticsEvent,
  useAnalytics,
} from './analytics';

export type {
  AnalyticsEventProperties,
  AnalyticsUserProperties,
} from './analytics';

// ============================================================================
// Initialization Helper
// ============================================================================

/**
 * Initialize all monitoring services
 *
 * Call this once at app startup, typically in _layout.tsx
 */
export async function initializeMonitoring(options?: {
  sentryDsn?: string;
  enableInDev?: boolean;
  userId?: string;
  username?: string;
}): Promise<void> {
  const { ErrorTracker } = await import('./errorTracking');
  const { NetworkMonitor } = await import('./networkMonitor');
  const { Analytics } = await import('./analytics');

  await Promise.all([
    ErrorTracker.initialize({
      dsn: options?.sentryDsn,
      enableInDev: options?.enableInDev,
    }),
    NetworkMonitor.initialize(),
    Analytics.initialize({
      enabled: !__DEV__,
      debugMode: __DEV__,
    }),
  ]);

  if (options?.userId) {
    ErrorTracker.setUser({
      id: options.userId,
      username: options.username,
    });
    Analytics.setUserProperties({
      user_id: options.userId,
      username: options.username,
    });
  }

  console.info('[Monitoring] All services initialized');
}

/**
 * Cleanup all monitoring services
 *
 * Call this on app unmount
 */
export function cleanupMonitoring(): void {
  import('./networkMonitor').then(({ NetworkMonitor }) => NetworkMonitor.cleanup());
  import('./analytics').then(({ Analytics }) => Analytics.cleanup());
}
