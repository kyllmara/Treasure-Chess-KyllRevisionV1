/**
 * Network Status Hook
 *
 * React hook for monitoring network connectivity.
 * Provides current status and offline queue information.
 */

import { useState, useEffect, useCallback } from 'react';
import { NetworkMonitor, NetworkState } from '@/lib/networkMonitor';

export interface UseNetworkStatusReturn {
  isOnline: boolean;
  isOffline: boolean;
  status: NetworkState['status'];
  networkState: NetworkState;
  queueSize: number;
  refresh: () => Promise<void>;
  offlineDuration: number | null;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
  const [networkState, setNetworkState] = useState<NetworkState>(NetworkMonitor.getState());
  const [queueSize, setQueueSize] = useState(NetworkMonitor.getQueueSize());
  const [offlineDuration, setOfflineDuration] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = NetworkMonitor.subscribe((state) => {
      setNetworkState(state);
      setQueueSize(NetworkMonitor.getQueueSize());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!networkState.isConnected && networkState.lastOffline) {
      const interval = setInterval(() => {
        setOfflineDuration(Date.now() - networkState.lastOffline!.getTime());
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setOfflineDuration(null);
    }
  }, [networkState.isConnected, networkState.lastOffline]);

  const refresh = useCallback(async () => {
    await NetworkMonitor.refresh();
  }, []);

  return {
    isOnline: networkState.isConnected,
    isOffline: !networkState.isConnected,
    status: networkState.status,
    networkState,
    queueSize,
    refresh,
    offlineDuration,
  };
}

export interface UseOfflineAwareActionOptions {
  operationType: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  queueWhenOffline?: boolean;
}

export function useOfflineAwareAction<T>(
  action: (payload: T) => Promise<void>,
  options: UseOfflineAwareActionOptions
) {
  const { isOffline } = useNetworkStatus();
  const [isPending, setIsPending] = useState(false);
  const [wasQueued, setWasQueued] = useState(false);

  const execute = useCallback(async (payload: T) => {
    setIsPending(true);
    setWasQueued(false);

    try {
      if (isOffline && options.queueWhenOffline) {
        await NetworkMonitor.enqueue(options.operationType, payload, { priority: options.priority });
        setWasQueued(true);
      } else if (isOffline) {
        throw new Error('No internet connection');
      } else {
        await action(payload);
      }
    } finally {
      setIsPending(false);
    }
  }, [action, isOffline, options.operationType, options.priority, options.queueWhenOffline]);

  return { execute, isPending, wasQueued };
}

export default useNetworkStatus;
