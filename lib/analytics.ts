/**
 * Analytics Service
 *
 * Centralized analytics tracking for key user events.
 * Type-safe events with automatic batching and persistence.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorTracker } from './errorTracking';

// ============================================================================
// Event Types
// ============================================================================

export enum AnalyticsEvent {
  // Session
  APP_OPENED = 'app_opened',
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',

  // Auth
  LOGIN_STARTED = 'login_started',
  LOGIN_COMPLETED = 'login_completed',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  WALLET_CONNECTED = 'wallet_connected',

  // Game
  GAME_STARTED = 'game_started',
  GAME_COMPLETED = 'game_completed',
  GAME_ABANDONED = 'game_abandoned',
  MOVE_MADE = 'move_made',
  GAME_RESIGNED = 'game_resigned',

  // Challenge
  CHALLENGE_CREATED = 'challenge_created',
  CHALLENGE_ACCEPTED = 'challenge_accepted',
  CHALLENGE_CANCELLED = 'challenge_cancelled',

  // Matchmaking
  MATCHMAKING_STARTED = 'matchmaking_started',
  MATCHMAKING_FOUND = 'matchmaking_found',
  MATCHMAKING_CANCELLED = 'matchmaking_cancelled',

  // Financial
  DEPOSIT_STARTED = 'deposit_started',
  DEPOSIT_COMPLETED = 'deposit_completed',
  DEPOSIT_FAILED = 'deposit_failed',
  WITHDRAWAL_STARTED = 'withdrawal_started',
  WITHDRAWAL_COMPLETED = 'withdrawal_completed',
  WAGER_PLACED = 'wager_placed',
  WINNINGS_CLAIMED = 'winnings_claimed',

  // UI
  SCREEN_VIEW = 'screen_view',
  BUTTON_CLICK = 'button_click',
  FEATURE_USED = 'feature_used',

  // Engagement
  LEADERBOARD_VIEWED = 'leaderboard_viewed',
  PROFILE_VIEWED = 'profile_viewed',
  GAME_HISTORY_VIEWED = 'game_history_viewed',
}

export interface AnalyticsEventProperties {
  [AnalyticsEvent.APP_OPENED]: { source?: string };
  [AnalyticsEvent.SESSION_START]: { is_first_session?: boolean };
  [AnalyticsEvent.SESSION_END]: { duration_ms: number };
  [AnalyticsEvent.LOGIN_STARTED]: { method: string };
  [AnalyticsEvent.LOGIN_COMPLETED]: { method: string; is_new_user?: boolean };
  [AnalyticsEvent.LOGIN_FAILED]: { method: string; error_code?: string };
  [AnalyticsEvent.LOGOUT]: Record<string, never>;
  [AnalyticsEvent.WALLET_CONNECTED]: { wallet_type?: string };
  [AnalyticsEvent.GAME_STARTED]: { game_id: string; game_type: string; time_control: string; wager_amount?: number; opponent_type: string; is_white: boolean };
  [AnalyticsEvent.GAME_COMPLETED]: { game_id: string; game_type: string; result: string; end_reason: string; duration_ms: number; total_moves: number; wager_amount?: number; elo_change?: number };
  [AnalyticsEvent.GAME_ABANDONED]: { game_id: string; moves_played: number };
  [AnalyticsEvent.MOVE_MADE]: { game_id: string; move_number: number; time_taken_ms: number };
  [AnalyticsEvent.GAME_RESIGNED]: { game_id: string; moves_played: number };
  [AnalyticsEvent.CHALLENGE_CREATED]: { wager_amount: number; time_control: string; is_public: boolean };
  [AnalyticsEvent.CHALLENGE_ACCEPTED]: { challenge_id: string; wager_amount: number };
  [AnalyticsEvent.CHALLENGE_CANCELLED]: { challenge_id: string };
  [AnalyticsEvent.MATCHMAKING_STARTED]: { game_type: string; elo_range?: string };
  [AnalyticsEvent.MATCHMAKING_FOUND]: { wait_time_ms: number };
  [AnalyticsEvent.MATCHMAKING_CANCELLED]: { wait_time_ms: number };
  [AnalyticsEvent.DEPOSIT_STARTED]: { amount: number; method?: string };
  [AnalyticsEvent.DEPOSIT_COMPLETED]: { amount: number; method?: string };
  [AnalyticsEvent.DEPOSIT_FAILED]: { amount: number; error_code?: string };
  [AnalyticsEvent.WITHDRAWAL_STARTED]: { amount: number };
  [AnalyticsEvent.WITHDRAWAL_COMPLETED]: { amount: number };
  [AnalyticsEvent.WAGER_PLACED]: { amount: number; game_id: string };
  [AnalyticsEvent.WINNINGS_CLAIMED]: { amount: number; game_id: string };
  [AnalyticsEvent.SCREEN_VIEW]: { screen_name: string; previous_screen?: string };
  [AnalyticsEvent.BUTTON_CLICK]: { button_name: string; screen_name: string };
  [AnalyticsEvent.FEATURE_USED]: { feature_name: string; context?: string };
  [AnalyticsEvent.LEADERBOARD_VIEWED]: { leaderboard_type?: string };
  [AnalyticsEvent.PROFILE_VIEWED]: { is_own_profile: boolean };
  [AnalyticsEvent.GAME_HISTORY_VIEWED]: Record<string, never>;
}

export interface AnalyticsUserProperties {
  user_id?: string;
  username?: string;
  email?: string;
  wallet_address?: string;
  elo_rating?: number;
  games_played?: number;
}

// ============================================================================
// Analytics Service
// ============================================================================

const STORAGE_KEY = '@treasure_chess:analytics_queue';
const SESSION_KEY = '@treasure_chess:analytics_session';

interface AnalyticsConfig {
  enabled: boolean;
  debugMode: boolean;
  batchSize: number;
  flushInterval: number;
}

const defaultConfig: AnalyticsConfig = {
  enabled: !__DEV__,
  debugMode: __DEV__,
  batchSize: 10,
  flushInterval: 30000,
};

class AnalyticsService {
  private config: AnalyticsConfig = defaultConfig;
  private eventQueue: Array<{ event: AnalyticsEvent; properties: Record<string, unknown>; timestamp: number; sessionId: string }> = [];
  private userProperties: AnalyticsUserProperties = {};
  private sessionId: string = '';
  private sessionStartTime: number = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;

  async initialize(config?: Partial<AnalyticsConfig>): Promise<void> {
    if (this.isInitialized) return;

    this.config = { ...defaultConfig, ...config };
    this.sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    this.sessionStartTime = Date.now();

    await this.loadPersistedEvents();

    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
    }

    this.track(AnalyticsEvent.SESSION_START, { is_first_session: await this.isFirstSession() });
    this.isInitialized = true;

    if (this.config.debugMode) {
      console.info('[Analytics] Initialized', { sessionId: this.sessionId });
    }
  }

  cleanup(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.isInitialized) {
      this.track(AnalyticsEvent.SESSION_END, { duration_ms: Date.now() - this.sessionStartTime });
    }
    this.flush();
    this.isInitialized = false;
  }

  setUserProperties(properties: Partial<AnalyticsUserProperties>): void {
    this.userProperties = { ...this.userProperties, ...properties };
    if (properties.user_id) {
      ErrorTracker.setUser({
        id: properties.user_id,
        username: properties.username,
        email: properties.email,
        walletAddress: properties.wallet_address,
      });
    }
    if (this.config.debugMode) {
      console.info('[Analytics] User properties updated', properties);
    }
  }

  clearUserProperties(): void {
    this.userProperties = {};
    ErrorTracker.setUser(null);
  }

  track<E extends AnalyticsEvent>(event: E, properties: AnalyticsEventProperties[E]): void {
    if (!this.config.enabled && !this.config.debugMode) return;

    const enrichedProperties = this.enrichProperties(properties as Record<string, unknown>);
    this.eventQueue.push({ event, properties: enrichedProperties, timestamp: Date.now(), sessionId: this.sessionId });

    ErrorTracker.addBreadcrumb('analytics', event, enrichedProperties, 'info');

    if (this.config.debugMode) {
      console.info(`[Analytics] ${event}`, enrichedProperties);
    }

    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  trackScreenView(screenName: string, previousScreen?: string): void {
    this.track(AnalyticsEvent.SCREEN_VIEW, { screen_name: screenName, previous_screen: previousScreen });
  }

  trackButtonClick(buttonName: string, screenName: string): void {
    this.track(AnalyticsEvent.BUTTON_CLICK, { button_name: buttonName, screen_name: screenName });
  }

  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.persistEvents();
      if (this.config.debugMode) {
        console.info(`[Analytics] Flushed ${eventsToSend.length} events`);
      }
    } catch {
      this.eventQueue = [...eventsToSend, ...this.eventQueue];
    }
  }

  private enrichProperties(properties: Record<string, unknown>): Record<string, unknown> {
    return {
      ...properties,
      platform: Platform.OS,
      platform_version: Platform.Version,
      app_version: process.env.EXPO_PUBLIC_APP_VERSION || '1.0.0',
      timestamp_iso: new Date().toISOString(),
      ...(this.userProperties.user_id && { user_id: this.userProperties.user_id }),
      ...(this.userProperties.elo_rating && { user_elo: this.userProperties.elo_rating }),
    };
  }

  private async loadPersistedEvents(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) this.eventQueue = [...JSON.parse(data), ...this.eventQueue];
    } catch { /* ignore */ }
  }

  private async persistEvents(): Promise<void> {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.eventQueue)); }
    catch { /* ignore */ }
  }

  private async isFirstSession(): Promise<boolean> {
    try {
      const session = await AsyncStorage.getItem(SESSION_KEY);
      if (!session) {
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ firstSession: Date.now() }));
        return true;
      }
      return false;
    } catch { return false; }
  }
}

export const Analytics = new AnalyticsService();

// ============================================================================
// React Hook
// ============================================================================

import { useCallback } from 'react';

export function useAnalytics() {
  const track = useCallback(<E extends AnalyticsEvent>(event: E, properties: AnalyticsEventProperties[E]) => {
    Analytics.track(event, properties);
  }, []);

  const trackScreenView = useCallback((screenName: string, previousScreen?: string) => {
    Analytics.trackScreenView(screenName, previousScreen);
  }, []);

  const trackButtonClick = useCallback((buttonName: string, screenName: string) => {
    Analytics.trackButtonClick(buttonName, screenName);
  }, []);

  return { track, trackScreenView, trackButtonClick, setUserProperties: Analytics.setUserProperties.bind(Analytics) };
}
