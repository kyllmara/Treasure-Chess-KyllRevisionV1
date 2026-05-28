/**
 * Network Monitor & Offline Queue
 *
 * Monitors network connectivity, manages offline state, and queues
 * operations for retry when connection is restored.
 */

import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorTracker } from './errorTracking';
import { AppError, ErrorCode } from './errors';

// ============================================================================
// Types
// ============================================================================

export type NetworkStatus = 'online' | 'offline' | 'unknown';

export interface NetworkState {
  status: NetworkStatus;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
  lastOnline: Date | null;
  lastOffline: Date | null;
}

export interface QueuedOperation {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

type OperationHandler = (payload: unknown) => Promise<void>;
type NetworkChangeCallback = (state: NetworkState) => void;

// ============================================================================
// Constants
// ============================================================================

const QUEUE_STORAGE_KEY = '@treasure_chess:offline_queue';
const MAX_QUEUE_SIZE = 50;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000, 30000, 60000];
const CONNECTIVITY_CHECK_URL = 'https://www.google.com/generate_204';
const CONNECTIVITY_CHECK_INTERVAL = 30000;

// ============================================================================
// Network Monitor Service
// ============================================================================

class NetworkMonitorService {
  private state: NetworkState = {
    status: 'unknown',
    isConnected: true,
    isInternetReachable: null,
    type: null,
    lastOnline: null,
    lastOffline: null,
  };

  private listeners: Set<NetworkChangeCallback> = new Set();
  private queue: QueuedOperation[] = [];
  private handlers: Map<string, OperationHandler> = new Map();
  private isProcessingQueue = false;
  private isInitialized = false;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadQueue();
      await this.checkConnectivity();

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
      }

      this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

      this.checkIntervalId = setInterval(() => {
        this.checkConnectivity();
      }, CONNECTIVITY_CHECK_INTERVAL);

      this.isInitialized = true;
      ErrorTracker.addBreadcrumb('network', 'Network monitor initialized', { status: this.state.status });
    } catch (error) {
      console.error('[NetworkMonitor] Failed to initialize:', error);
      this.isInitialized = true;
    }
  }

  cleanup(): void {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    this.listeners.clear();
    this.isInitialized = false;
  }

  private handleOnline = (): void => this.updateState(true);
  private handleOffline = (): void => this.updateState(false);

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === 'active') this.checkConnectivity();
  };

  async checkConnectivity(): Promise<boolean> {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateState(false);
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(CONNECTIVITY_CHECK_URL, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);
      this.updateState(true);
      return true;
    } catch {
      this.updateState(false);
      return false;
    }
  }

  private updateState(isConnected: boolean): void {
    const wasConnected = this.state.isConnected;
    if (wasConnected === isConnected && this.state.status !== 'unknown') return;

    this.state = {
      status: isConnected ? 'online' : 'offline',
      isConnected,
      isInternetReachable: isConnected,
      type: null,
      lastOnline: isConnected ? new Date() : this.state.lastOnline,
      lastOffline: !isConnected && wasConnected ? new Date() : this.state.lastOffline,
    };

    if (wasConnected !== isConnected) {
      ErrorTracker.addBreadcrumb('network', isConnected ? 'Connection restored' : 'Connection lost');
      if (isConnected && !wasConnected) this.processQueue();
    }

    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const callback of this.listeners) {
      try { callback(this.state); } catch (error) { console.warn('[NetworkMonitor] Listener error:', error); }
    }
  }

  getState(): NetworkState { return { ...this.state }; }
  isOnline(): boolean { return this.state.isConnected; }
  isOffline(): boolean { return !this.state.isConnected; }

  subscribe(callback: NetworkChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.state);
    return () => { this.listeners.delete(callback); };
  }

  async refresh(): Promise<NetworkState> {
    await this.checkConnectivity();
    return this.state;
  }

  registerHandler(type: string, handler: OperationHandler): void { this.handlers.set(type, handler); }
  unregisterHandler(type: string): void { this.handlers.delete(type); }

  async enqueue(
    type: string,
    payload: unknown,
    options?: { priority?: 'low' | 'normal' | 'high' | 'critical'; maxRetries?: number }
  ): Promise<string> {
    const operation: QueuedOperation = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      priority: options?.priority ?? 'normal',
    };

    this.queue.push(operation);
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue
        .sort((a, b) => this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority))
        .slice(0, MAX_QUEUE_SIZE);
    }

    await this.persistQueue();
    ErrorTracker.addBreadcrumb('queue', `Enqueued operation: ${type}`, { id: operation.id, priority: operation.priority, queueSize: this.queue.length });

    if (this.isOnline()) this.processQueue();
    return operation.id;
  }

  getPendingOperations(): QueuedOperation[] { return [...this.queue]; }
  getQueueSize(): number { return this.queue.length; }

  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.persistQueue();
    ErrorTracker.addBreadcrumb('queue', 'Queue cleared');
  }

  async removeOperation(id: string): Promise<void> {
    this.queue = this.queue.filter((op) => op.id !== id);
    await this.persistQueue();
  }

  async processQueue(): Promise<void> {
    if (this.isProcessingQueue || !this.isOnline() || this.queue.length === 0) return;

    this.isProcessingQueue = true;
    ErrorTracker.addBreadcrumb('queue', 'Processing queue', { count: this.queue.length });

    const sortedQueue = [...this.queue].sort((a, b) => this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority));

    for (const operation of sortedQueue) {
      if (!this.isOnline()) break;
      await this.processOperation(operation);
    }

    this.isProcessingQueue = false;
    await this.persistQueue();
  }

  private async processOperation(operation: QueuedOperation): Promise<void> {
    const handler = this.handlers.get(operation.type);
    if (!handler) {
      console.warn(`[NetworkMonitor] No handler for operation type: ${operation.type}`);
      await this.removeOperation(operation.id);
      return;
    }

    try {
      await handler(operation.payload);
      await this.removeOperation(operation.id);
      ErrorTracker.addBreadcrumb('queue', `Operation completed: ${operation.type}`, { id: operation.id });
    } catch (error) {
      operation.retryCount++;
      if (operation.retryCount >= operation.maxRetries) {
        await this.removeOperation(operation.id);
        ErrorTracker.captureError(new AppError({
          code: ErrorCode.NETWORK_REQUEST_FAILED,
          message: `Queue operation failed after ${operation.maxRetries} retries: ${operation.type}`,
          originalError: error,
          context: { operationId: operation.id, type: operation.type },
        }));
      } else {
        const delay = RETRY_DELAYS[Math.min(operation.retryCount, RETRY_DELAYS.length - 1)];
        ErrorTracker.addBreadcrumb('queue', `Operation retry scheduled: ${operation.type}`, { id: operation.id, retryCount: operation.retryCount, delay });
        setTimeout(() => { if (this.isOnline()) this.processOperation(operation); }, delay);
      }
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (data) this.queue = JSON.parse(data);
    } catch (error) {
      console.warn('[NetworkMonitor] Failed to load queue:', error);
      this.queue = [];
    }
  }

  private async persistQueue(): Promise<void> {
    try { await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue)); }
    catch (error) { console.warn('[NetworkMonitor] Failed to persist queue:', error); }
  }

  private getPriorityValue(priority: QueuedOperation['priority']): number {
    const map = { critical: 4, high: 3, normal: 2, low: 1 };
    return map[priority] || 2;
  }
}

export const NetworkMonitor = new NetworkMonitorService();

// ============================================================================
// Fetch with Retry
// ============================================================================

export interface FetchWithRetryOptions extends RequestInit {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  offlineQueue?: { type: string; priority?: QueuedOperation['priority'] };
}

export async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const { maxRetries = 3, retryDelay = 1000, timeout = 30000, offlineQueue, ...fetchOptions } = options;

  if (NetworkMonitor.isOffline()) {
    if (offlineQueue) {
      await NetworkMonitor.enqueue(offlineQueue.type, { url, options: fetchOptions }, { priority: offlineQueue.priority });
      throw new AppError({ code: ErrorCode.NETWORK_OFFLINE, message: 'Request queued for when connection is restored', context: { url, queued: true } });
    }
    throw new AppError({ code: ErrorCode.NETWORK_OFFLINE, message: 'No internet connection', context: { url } });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === 'AbortError') {
        lastError = new AppError({ code: ErrorCode.NETWORK_TIMEOUT, message: `Request timed out after ${timeout}ms`, context: { url, timeout } });
      }
    }
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
    }
  }

  throw new AppError({ code: ErrorCode.NETWORK_REQUEST_FAILED, message: `Request failed after ${maxRetries + 1} attempts`, originalError: lastError, context: { url, attempts: maxRetries + 1 } });
}
