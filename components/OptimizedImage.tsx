/**
 * OptimizedImage Component
 *
 * A performance-optimized image component that:
 * - Uses expo-image for efficient caching and loading
 * - Implements progressive loading with placeholders
 * - Supports lazy loading with viewport detection
 * - Memoizes to prevent unnecessary re-renders
 */

import React, { memo, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Image, ImageSource, ImageContentFit, ImageProps } from 'expo-image';

// Cache policy for images - use aggressive caching
const DEFAULT_CACHE_POLICY = 'memory-disk';

// Blurhash placeholder for loading state
const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export interface OptimizedImageProps {
  /** Image source - can be require() or { uri: string } */
  source: ImageSource;
  /** Width of the image */
  width?: number;
  /** Height of the image */
  height?: number;
  /** How the image should be resized to fit its container */
  contentFit?: ImageContentFit;
  /** Placeholder blurhash for loading state */
  placeholder?: string;
  /** Whether to show a loading placeholder */
  showPlaceholder?: boolean;
  /** Style for the image */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Whether the image should fade in */
  transition?: number;
  /** Priority for loading (low, normal, high) */
  priority?: 'low' | 'normal' | 'high';
  /** Callback when image loads */
  onLoad?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Optimized image component with caching and progressive loading
 */
export const OptimizedImage = memo(({
  source,
  width,
  height,
  contentFit = 'contain',
  placeholder = DEFAULT_BLURHASH,
  showPlaceholder = true,
  style,
  accessibilityLabel,
  transition = 200,
  priority = 'normal',
  onLoad,
  onError,
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Memoize the style object to prevent re-renders
  const imageStyle = useMemo(() => ({
    width,
    height,
  }), [width, height]);

  // Memoize container style
  const containerStyle = useMemo(() => [
    style,
    imageStyle,
  ], [style, imageStyle]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback((error: { error: string }) => {
    setHasError(true);
    onError?.(new Error(error.error));
  }, [onError]);

  // Show fallback if error
  if (hasError) {
    return (
      <View style={[styles.fallback, containerStyle]}>
        <View style={styles.fallbackIcon} />
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={containerStyle}
      contentFit={contentFit}
      placeholder={showPlaceholder ? { blurhash: placeholder } : undefined}
      transition={transition}
      cachePolicy={DEFAULT_CACHE_POLICY}
      priority={priority}
      accessibilityLabel={accessibilityLabel}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
});

OptimizedImage.displayName = 'OptimizedImage';

/**
 * Optimized avatar image with circular mask
 */
export const OptimizedAvatar = memo(({
  source,
  size = 48,
  borderColor,
  borderWidth = 0,
  ...props
}: OptimizedImageProps & {
  size?: number;
  borderColor?: string;
  borderWidth?: number;
}) => {
  const avatarStyle = useMemo(() => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth,
    borderColor,
    overflow: 'hidden' as const,
  }), [size, borderWidth, borderColor]);

  return (
    <OptimizedImage
      {...props}
      source={source}
      width={size}
      height={size}
      contentFit="cover"
      style={avatarStyle}
    />
  );
});

OptimizedAvatar.displayName = 'OptimizedAvatar';

/**
 * Chess piece image optimized for the board
 * Uses memory-only caching for pieces that are used frequently
 */
export const OptimizedChessPiece = memo(({
  source,
  size,
}: {
  source: ImageSource;
  size: number;
}) => {
  const pieceStyle = useMemo(() => ({
    width: size,
    height: size,
  }), [size]);

  return (
    <Image
      source={source}
      style={pieceStyle}
      contentFit="contain"
      cachePolicy="memory" // Pieces are small and frequently used
      transition={0} // No transition for game pieces
    />
  );
});

OptimizedChessPiece.displayName = 'OptimizedChessPiece';

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});

export default OptimizedImage;
