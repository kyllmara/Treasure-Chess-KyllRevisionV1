/**
 * Network Status Indicator
 *
 * Displays offline status and pending operations count.
 * Shows a non-intrusive banner when offline.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { WifiOff, CloudOff, RefreshCw } from 'lucide-react-native';
import { NetworkMonitor, NetworkState } from '@/lib/networkMonitor';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

// ============================================================================
// Types
// ============================================================================

interface NetworkStatusIndicatorProps {
  position?: 'top' | 'bottom';
  alwaysShow?: boolean;
  style?: object;
}

// ============================================================================
// Hook
// ============================================================================

function useNetworkStatus() {
  const [networkState, setNetworkState] = useState<NetworkState>(NetworkMonitor.getState());
  const [queueSize, setQueueSize] = useState(NetworkMonitor.getQueueSize());

  useEffect(() => {
    const unsubscribe = NetworkMonitor.subscribe((state) => {
      setNetworkState(state);
      setQueueSize(NetworkMonitor.getQueueSize());
    });
    return unsubscribe;
  }, []);

  return {
    isOnline: networkState.isConnected,
    isOffline: !networkState.isConnected,
    networkState,
    queueSize,
    refresh: () => NetworkMonitor.refresh(),
    offlineDuration: !networkState.isConnected && networkState.lastOffline
      ? Date.now() - networkState.lastOffline.getTime()
      : null,
  };
}

// ============================================================================
// Component
// ============================================================================

export function NetworkStatusIndicator({ position = 'top', alwaysShow = false, style }: NetworkStatusIndicatorProps): JSX.Element | null {
  const { isOffline, queueSize, refresh, offlineDuration } = useNetworkStatus();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [currentDuration, setCurrentDuration] = useState(offlineDuration);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOffline || alwaysShow ? 0 : -100,
      useNativeDriver: true,
      tension: 100,
      friction: 15,
    }).start();
  }, [isOffline, alwaysShow, slideAnim]);

  useEffect(() => {
    if (isOffline) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isOffline, pulseAnim]);

  useEffect(() => {
    if (isOffline && offlineDuration !== null) {
      const interval = setInterval(() => {
        setCurrentDuration(Date.now() - (NetworkMonitor.getState().lastOffline?.getTime() || Date.now()));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCurrentDuration(null);
    }
  }, [isOffline, offlineDuration]);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  if (!isOffline && !alwaysShow) return null;

  return (
    <Animated.View style={[styles.container, position === 'bottom' && styles.containerBottom, { transform: [{ translateY: slideAnim }] }, style]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <WifiOff size={18} color={Colors.error} strokeWidth={2} />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>No Internet Connection</Text>
          <Text style={styles.subtitle}>
            {queueSize > 0
              ? `${queueSize} action${queueSize > 1 ? 's' : ''} queued`
              : currentDuration
              ? `Offline for ${formatDuration(currentDuration)}`
              : 'Waiting for connection...'}
          </Text>
        </View>

        <TouchableOpacity style={styles.retryButton} onPress={refresh} activeOpacity={0.7}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <RefreshCw size={18} color={Colors.textPrimary} strokeWidth={2} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {queueSize > 0 && (
        <View style={styles.queueIndicator}>
          <CloudOff size={12} color={Colors.textMuted} />
          <Text style={styles.queueText}>Changes will sync when online</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ============================================================================
// Compact Indicator
// ============================================================================

export function CompactNetworkIndicator({ style }: { style?: object }): JSX.Element | null {
  const { isOffline, queueSize } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <View style={[styles.compactContainer, style]}>
      <WifiOff size={14} color={Colors.error} strokeWidth={2} />
      {queueSize > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{queueSize > 9 ? '9+' : queueSize}</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 10,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(30, 30, 40, 0.95)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
    overflow: 'hidden',
    zIndex: 1000,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  containerBottom: { top: undefined, bottom: Platform.OS === 'ios' ? 100 : 80 },
  content: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  iconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255, 68, 68, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  textContainer: { flex: 1 },
  title: { ...Typography.label, color: Colors.textPrimary, marginBottom: 2 },
  subtitle: { ...Typography.caption, color: Colors.textSecondary },
  retryButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.05)', justifyContent: 'center', alignItems: 'center', marginLeft: Spacing.sm },
  queueIndicator: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', backgroundColor: 'rgba(255, 255, 255, 0.02)' },
  queueText: { ...Typography.caption, color: Colors.textMuted, fontSize: 11 },
  compactContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: 'rgba(255, 68, 68, 0.15)', borderRadius: BorderRadius.round },
  badge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center', marginLeft: 4, paddingHorizontal: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', color: Colors.textPrimary },
});

export default NetworkStatusIndicator;
