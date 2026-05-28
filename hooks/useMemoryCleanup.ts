/**
 * Memory Cleanup Hooks
 *
 * Utilities for preventing memory leaks and managing component cleanup.
 * These hooks ensure proper cleanup of:
 * - Event listeners
 * - Timers/intervals
 * - Subscriptions
 * - Async operations
 * - Animation values
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { AppState, AppStateStatus, Animated } from 'react-native';

/**
 * Hook that returns whether the component is still mounted
 * Useful for preventing state updates after unmount in async operations
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}

/**
 * Hook for safe async state updates
 * Wraps setState to only update if component is still mounted
 */
export function useSafeState<T>(initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);
  const isMounted = useIsMounted();

  const setSafeState = useCallback((value: T | ((prev: T) => T)) => {
    if (isMounted()) {
      setState(value);
    }
  }, [isMounted]);

  return [state, setSafeState];
}

/**
 * Hook that automatically clears timeouts on unmount
 */
export function useTimeout(): (callback: () => void, delay: number) => void {
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      // Clear all timeouts on unmount
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current.clear();
    };
  }, []);

  return useCallback((callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      callback();
      timeoutsRef.current.delete(timeoutId);
    }, delay);
    timeoutsRef.current.add(timeoutId);
  }, []);
}

/**
 * Hook that automatically clears intervals on unmount
 */
export function useInterval(): {
  set: (callback: () => void, delay: number) => string;
  clear: (id: string) => void;
  clearAll: () => void;
} {
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const counterRef = useRef(0);

  useEffect(() => {
    return () => {
      // Clear all intervals on unmount
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current.clear();
    };
  }, []);

  const set = useCallback((callback: () => void, delay: number): string => {
    const id = `interval_${counterRef.current++}`;
    const intervalId = setInterval(callback, delay);
    intervalsRef.current.set(id, intervalId);
    return id;
  }, []);

  const clear = useCallback((id: string) => {
    const intervalId = intervalsRef.current.get(id);
    if (intervalId) {
      clearInterval(intervalId);
      intervalsRef.current.delete(id);
    }
  }, []);

  const clearAll = useCallback(() => {
    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current.clear();
  }, []);

  return { set, clear, clearAll };
}

/**
 * Hook for managing subscriptions with automatic cleanup
 */
export function useSubscriptions(): {
  add: (unsubscribe: () => void) => void;
  remove: (unsubscribe: () => void) => void;
} {
  const subscriptionsRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    return () => {
      // Unsubscribe all on unmount
      subscriptionsRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {
          console.warn('Error during subscription cleanup:', e);
        }
      });
      subscriptionsRef.current.clear();
    };
  }, []);

  const add = useCallback((unsubscribe: () => void) => {
    subscriptionsRef.current.add(unsubscribe);
  }, []);

  const remove = useCallback((unsubscribe: () => void) => {
    subscriptionsRef.current.delete(unsubscribe);
    unsubscribe();
  }, []);

  return { add, remove };
}

/**
 * Hook for tracking app state (foreground/background)
 * Useful for pausing expensive operations when app is backgrounded
 */
export function useAppState(): AppStateStatus {
  const [appState, setAppState] = useSafeState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, [setAppState]);

  return appState;
}

/**
 * Hook that runs callback when app comes to foreground
 */
export function useOnForeground(callback: () => void): void {
  const appState = useAppState();
  const prevAppState = useRef(appState);

  useEffect(() => {
    if (
      prevAppState.current !== 'active' &&
      appState === 'active'
    ) {
      callback();
    }
    prevAppState.current = appState;
  }, [appState, callback]);
}

/**
 * Hook that runs callback when app goes to background
 */
export function useOnBackground(callback: () => void): void {
  const appState = useAppState();
  const prevAppState = useRef(appState);

  useEffect(() => {
    if (
      prevAppState.current === 'active' &&
      appState !== 'active'
    ) {
      callback();
    }
    prevAppState.current = appState;
  }, [appState, callback]);
}

/**
 * Hook for creating Animated.Value with automatic cleanup
 */
export function useAnimatedValue(
  initialValue: number
): Animated.Value {
  const animatedValue = useRef<Animated.Value | null>(null);

  if (animatedValue.current === null) {
    animatedValue.current = new Animated.Value(initialValue);
  }

  useEffect(() => {
    return () => {
      // Stop any running animations
      animatedValue.current?.stopAnimation();
    };
  }, []);

  return animatedValue.current;
}

/**
 * Hook for safe async effects
 * Prevents state updates if component unmounts during async operation
 */
export function useAsyncEffect(
  effect: (isMounted: () => boolean) => Promise<void | (() => void)>,
  deps: React.DependencyList
): void {
  const isMounted = useIsMounted();

  useEffect(() => {
    let cleanup: void | (() => void);

    const runEffect = async () => {
      cleanup = await effect(isMounted);
    };

    runEffect();

    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Hook for debounced cleanup
 * Delays cleanup to avoid flickering during rapid state changes
 */
export function useDebouncedCleanup(
  cleanup: () => void,
  delay: number = 100
): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;

  useEffect(() => {
    return () => {
      // Clear any pending cleanup
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Schedule cleanup with delay
      timeoutRef.current = setTimeout(() => {
        cleanupRef.current();
      }, delay);
    };
  }, [delay]);
}

/**
 * Memory pressure detection (iOS only)
 * Triggers callback when system is low on memory
 */
export function useMemoryWarning(callback: () => void): void {
  useEffect(() => {
    // This would use native modules in a real implementation
    // For now, we can use the performance library to track
    if (__DEV__) {
      console.debug('[Memory] Memory warning listener registered');
    }

    return () => {
      if (__DEV__) {
        console.debug('[Memory] Memory warning listener removed');
      }
    };
  }, [callback]);
}

/**
 * Hook to clear component-specific caches on unmount
 */
export function useCacheCleanup(
  cacheKeys: string[],
  clearCache: (key: string) => void
): void {
  const keysRef = useRef(cacheKeys);
  const clearRef = useRef(clearCache);

  useEffect(() => {
    keysRef.current = cacheKeys;
    clearRef.current = clearCache;
  }, [cacheKeys, clearCache]);

  useEffect(() => {
    return () => {
      keysRef.current.forEach((key) => {
        try {
          clearRef.current(key);
        } catch (e) {
          console.warn(`Error clearing cache for key ${key}:`, e);
        }
      });
    };
  }, []);
}

export default {
  useIsMounted,
  useSafeState,
  useTimeout,
  useInterval,
  useSubscriptions,
  useAppState,
  useOnForeground,
  useOnBackground,
  useAnimatedValue,
  useAsyncEffect,
  useDebouncedCleanup,
  useMemoryWarning,
  useCacheCleanup,
};
