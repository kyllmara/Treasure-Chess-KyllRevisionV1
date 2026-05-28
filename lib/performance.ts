/**
 * Performance Optimization Utilities
 *
 * Core utilities for optimizing React Native app performance:
 * - Component memoization helpers
 * - Render tracking and profiling
 * - Debounce/throttle utilities
 * - Performance measurement tools
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { InteractionManager, Platform } from 'react-native';

// ============================================================================
// Types
// ============================================================================

export interface PerformanceMetrics {
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
  totalRenderTime: number;
  mountTime: number;
}

export interface RenderInfo {
  componentName: string;
  renderCount: number;
  props: Record<string, unknown>;
  timestamp: number;
}

export interface PerformanceConfig {
  enableProfiling: boolean;
  logSlowRenders: boolean;
  slowRenderThreshold: number; // ms
  trackRenderCounts: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: PerformanceConfig = {
  enableProfiling: __DEV__,
  logSlowRenders: __DEV__,
  slowRenderThreshold: 16, // ~60fps frame budget
  trackRenderCounts: __DEV__,
};

let config: PerformanceConfig = { ...DEFAULT_CONFIG };

export function configurePerformance(options: Partial<PerformanceConfig>): void {
  config = { ...config, ...options };
}

// ============================================================================
// Render Tracking
// ============================================================================

const renderCounts = new Map<string, number>();
const renderTimes = new Map<string, number[]>();

/**
 * Track component render counts for debugging
 */
export function trackRender(componentName: string): void {
  if (!config.trackRenderCounts) return;

  const count = (renderCounts.get(componentName) || 0) + 1;
  renderCounts.set(componentName, count);

  if (__DEV__ && count % 10 === 0) {
    console.debug(`[Perf] ${componentName} rendered ${count} times`);
  }
}

/**
 * Get render statistics for all tracked components
 */
export function getRenderStats(): Map<string, number> {
  return new Map(renderCounts);
}

/**
 * Reset all render tracking data
 */
export function resetRenderStats(): void {
  renderCounts.clear();
  renderTimes.clear();
}

// ============================================================================
// Performance Measurement
// ============================================================================

const performanceMarks = new Map<string, number>();

/**
 * Start a performance measurement
 */
export function startMeasure(name: string): void {
  if (!config.enableProfiling) return;
  performanceMarks.set(name, performance.now());
}

/**
 * End a performance measurement and return duration
 */
export function endMeasure(name: string): number {
  if (!config.enableProfiling) return 0;

  const startTime = performanceMarks.get(name);
  if (startTime === undefined) {
    console.warn(`[Perf] No start mark found for: ${name}`);
    return 0;
  }

  const duration = performance.now() - startTime;
  performanceMarks.delete(name);

  if (config.logSlowRenders && duration > config.slowRenderThreshold) {
    console.warn(`[Perf] Slow operation: ${name} took ${duration.toFixed(2)}ms`);
  }

  return duration;
}

/**
 * Measure an async operation
 */
export async function measureAsync<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  startMeasure(name);
  try {
    return await operation();
  } finally {
    endMeasure(name);
  }
}

/**
 * Measure a sync operation
 */
export function measureSync<T>(name: string, operation: () => T): T {
  startMeasure(name);
  try {
    return operation();
  } finally {
    endMeasure(name);
  }
}

// ============================================================================
// Debounce & Throttle
// ============================================================================

/**
 * Debounce a function - delays execution until after wait ms have elapsed
 * since the last invocation
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Throttle a function - limits execution to at most once per wait ms
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - lastCallTime);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCallTime = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        timeoutId = null;
        func(...args);
      }, remaining);
    }
  };
}

// ============================================================================
// Interaction Management
// ============================================================================

/**
 * Schedule work after animations/interactions complete
 * Useful for deferring expensive operations
 */
export function runAfterInteractions<T>(
  task: () => T | Promise<T>,
  options?: { name?: string; timeout?: number }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const { name = 'anonymous', timeout = 5000 } = options || {};

    const timeoutId = setTimeout(() => {
      console.warn(`[Perf] Task "${name}" timed out after ${timeout}ms`);
    }, timeout);

    InteractionManager.runAfterInteractions({
      name,
      gen: async () => {
        try {
          const result = await task();
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      },
    });
  });
}

/**
 * Yield to UI thread to prevent blocking during expensive operations
 */
export function yieldToUI(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute work in batches, yielding between each batch
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => R,
  options?: { batchSize?: number; yieldMs?: number }
): Promise<R[]> {
  const { batchSize = 10, yieldMs = 0 } = options || {};
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...batch.map(processor));

    if (i + batchSize < items.length) {
      await yieldToUI(yieldMs);
    }
  }

  return results;
}

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to track component render count (development only)
 */
export function useRenderCount(componentName: string): number {
  const renderCount = useRef(0);

  renderCount.current += 1;

  useEffect(() => {
    if (__DEV__ && config.trackRenderCounts) {
      trackRender(componentName);
    }
  });

  return renderCount.current;
}

/**
 * Hook to detect why a component re-rendered
 */
export function useWhyDidYouRender<T extends Record<string, unknown>>(
  componentName: string,
  props: T
): void {
  const previousProps = useRef<T | undefined>();

  useEffect(() => {
    if (!__DEV__) return;

    if (previousProps.current) {
      const changedProps: string[] = [];

      Object.keys(props).forEach((key) => {
        if (props[key] !== previousProps.current?.[key]) {
          changedProps.push(key);
        }
      });

      if (changedProps.length > 0) {
        console.debug(
          `[WhyRender] ${componentName} re-rendered due to:`,
          changedProps.map((key) => ({
            key,
            from: previousProps.current?.[key],
            to: props[key],
          }))
        );
      }
    }

    previousProps.current = { ...props };
  });
}

/**
 * Hook for debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for debounced callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(
    () => debounce((...args: Parameters<T>) => callbackRef.current(...args), delay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delay, ...deps]
  );
}

/**
 * Hook for throttled callback
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  limit: number,
  deps: React.DependencyList = []
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(
    () => throttle((...args: Parameters<T>) => callbackRef.current(...args), limit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [limit, ...deps]
  );
}

/**
 * Hook to run expensive initialization after mount
 */
export function useDeferredInit<T>(
  initializer: () => T | Promise<T>,
  fallback: T
): T {
  const [value, setValue] = React.useState<T>(fallback);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    runAfterInteractions(initializer).then(setValue);
  }, [initializer]);

  return value;
}

/**
 * Hook for stable callback reference (prevents re-renders from callback changes)
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args) => callbackRef.current(...args)) as T,
    []
  );
}

// ============================================================================
// Memoization Helpers
// ============================================================================

/**
 * Create a memoized selector from a store
 * Prevents re-renders when unrelated store parts change
 */
export function createSelector<TState, TResult>(
  selector: (state: TState) => TResult,
  equalityFn?: (a: TResult, b: TResult) => boolean
): (state: TState) => TResult {
  let lastState: TState | undefined;
  let lastResult: TResult | undefined;

  return (state: TState): TResult => {
    if (lastState === state) {
      return lastResult as TResult;
    }

    const result = selector(state);

    if (
      lastResult !== undefined &&
      equalityFn
        ? equalityFn(lastResult, result)
        : shallowEqual(lastResult, result)
    ) {
      return lastResult;
    }

    lastState = state;
    lastResult = result;
    return result;
  };
}

/**
 * Shallow equality check for objects
 */
export function shallowEqual<T>(objA: T, objB: T): boolean {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== 'object' || objA === null) return false;
  if (typeof objB !== 'object' || objB === null) return false;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, key) ||
      !Object.is((objA as Record<string, unknown>)[key], (objB as Record<string, unknown>)[key])
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Deep equality check for objects (use sparingly - expensive)
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a !== 'object' || a === null) return false;
  if (typeof b !== 'object' || b === null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    Object.prototype.hasOwnProperty.call(b, key) &&
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

// ============================================================================
// Performance Reporter
// ============================================================================

interface PerformanceReport {
  timestamp: Date;
  platform: string;
  renderStats: Record<string, number>;
  memoryWarnings: number;
}

let memoryWarningCount = 0;

export function incrementMemoryWarning(): void {
  memoryWarningCount++;
}

/**
 * Generate a performance report for debugging
 */
export function generatePerformanceReport(): PerformanceReport {
  const stats: Record<string, number> = {};
  renderCounts.forEach((count, name) => {
    stats[name] = count;
  });

  return {
    timestamp: new Date(),
    platform: Platform.OS,
    renderStats: stats,
    memoryWarnings: memoryWarningCount,
  };
}

/**
 * Log performance report to console
 */
export function logPerformanceReport(): void {
  if (!__DEV__) return;

  const report = generatePerformanceReport();
  console.log('\n========== Performance Report ==========');
  console.log(`Platform: ${report.platform}`);
  console.log(`Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`Memory Warnings: ${report.memoryWarnings}`);
  console.log('\nRender Counts:');

  const sortedStats = Object.entries(report.renderStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  sortedStats.forEach(([name, count]) => {
    console.log(`  ${name}: ${count}`);
  });

  console.log('========================================\n');
}

export default {
  configurePerformance,
  trackRender,
  getRenderStats,
  resetRenderStats,
  startMeasure,
  endMeasure,
  measureAsync,
  measureSync,
  debounce,
  throttle,
  runAfterInteractions,
  yieldToUI,
  batchProcess,
  createSelector,
  shallowEqual,
  deepEqual,
  generatePerformanceReport,
  logPerformanceReport,
};
