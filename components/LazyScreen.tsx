/**
 * LazyScreen Component
 *
 * Wraps screens to defer expensive rendering until after navigation animations.
 * This improves perceived performance by showing a lightweight placeholder
 * during screen transitions.
 *
 * Usage:
 * ```tsx
 * export default function MyScreen() {
 *   return (
 *     <LazyScreen>
 *       <ExpensiveContent />
 *     </LazyScreen>
 *   );
 * }
 * ```
 */

import React, {
  memo,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  Suspense,
} from 'react';
import {
  View,
  StyleSheet,
  InteractionManager,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface LazyScreenProps {
  /** Content to render after interactions complete */
  children: ReactNode;
  /** Minimum time to show placeholder (ms) - prevents flicker */
  minDelay?: number;
  /** Custom placeholder component */
  placeholder?: ReactNode;
  /** Background colors for default placeholder */
  placeholderColors?: [string, string];
  /** Whether to show loading indicator */
  showLoadingIndicator?: boolean;
  /** Callback when content is ready */
  onReady?: () => void;
}

/**
 * Default placeholder with gradient background
 */
const DefaultPlaceholder = memo(({
  colors = ['#05060f', '#0F0F1E'],
  showIndicator = true,
}: {
  colors?: [string, string];
  showIndicator?: boolean;
}) => (
  <LinearGradient colors={colors} style={styles.placeholder}>
    {showIndicator && (
      <ActivityIndicator
        size="large"
        color="rgba(255, 215, 0, 0.5)"
      />
    )}
  </LinearGradient>
));

DefaultPlaceholder.displayName = 'DefaultPlaceholder';

/**
 * LazyScreen - Defers rendering until after navigation animations
 */
export const LazyScreen = memo(({
  children,
  minDelay = 0,
  placeholder,
  placeholderColors,
  showLoadingIndicator = true,
  onReady,
}: LazyScreenProps) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const startTime = Date.now();

    // Wait for navigation animations to complete
    const handle = InteractionManager.runAfterInteractions(() => {
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, minDelay - elapsed);

      // If we need additional delay, wait
      if (remainingDelay > 0) {
        setTimeout(() => {
          if (isMounted) {
            setIsReady(true);
            onReady?.();
          }
        }, remainingDelay);
      } else {
        if (isMounted) {
          setIsReady(true);
          onReady?.();
        }
      }
    });

    return () => {
      isMounted = false;
      handle.cancel();
    };
  }, [minDelay, onReady]);

  if (!isReady) {
    return placeholder ?? (
      <DefaultPlaceholder
        colors={placeholderColors}
        showIndicator={showLoadingIndicator}
      />
    );
  }

  return <>{children}</>;
});

LazyScreen.displayName = 'LazyScreen';

/**
 * Higher-order component version of LazyScreen
 */
export function withLazyLoading<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<LazyScreenProps, 'children'>
) {
  const LazyWrappedComponent = (props: P) => (
    <LazyScreen {...options}>
      <WrappedComponent {...props} />
    </LazyScreen>
  );

  LazyWrappedComponent.displayName = `LazyLoaded(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return memo(LazyWrappedComponent);
}

/**
 * Hook for deferred initialization
 * Useful for expensive setup that can wait until after mount
 */
export function useDeferredLoad(delay = 0): boolean {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const handle = InteractionManager.runAfterInteractions(() => {
      if (delay > 0) {
        setTimeout(() => {
          if (isMounted) setIsLoaded(true);
        }, delay);
      } else {
        if (isMounted) setIsLoaded(true);
      }
    });

    return () => {
      isMounted = false;
      handle.cancel();
    };
  }, [delay]);

  return isLoaded;
}

/**
 * Component that only renders its children after interactions complete
 * Lighter weight than LazyScreen - no placeholder
 */
export const DeferredRender = memo(({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) => {
  const isLoaded = useDeferredLoad();
  return isLoaded ? <>{children}</> : <>{fallback}</>;
});

DeferredRender.displayName = 'DeferredRender';

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LazyScreen;
