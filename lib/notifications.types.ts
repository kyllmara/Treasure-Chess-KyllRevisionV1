/**
 * Push Notifications Types
 * Shared types for notification service across platforms
 */

/**
 * Notification types for the app
 */
export type NotificationType =
  | "your_turn"
  | "match_found"
  | "challenge_received"
  | "challenge_accepted"
  | "challenge_declined"
  | "challenge_expired"
  | "game_started"
  | "game_ended"
  | "deposit_confirmed"
  | "withdrawal_complete"
  | "achievement_unlocked"
  | "low_time_warning"
  | "general";

/**
 * Notification data payload
 */
export interface NotificationData {
  type: NotificationType;
  gameId?: string;
  challengeId?: string;
  opponentId?: string;
  opponentName?: string;
  amount?: number;
  achievementId?: string;
  [key: string]: unknown;
}

/**
 * Local notification options
 */
export interface LocalNotificationOptions {
  title: string;
  body: string;
  data?: NotificationData;
  sound?: boolean;
  badge?: number;
  categoryId?: string;
  subtitle?: string;
}

/**
 * Notification handler result (matches expo-notifications NotificationBehavior)
 */
export interface NotificationHandlerResult {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
  priority?: number;
}

/**
 * Push notification registration result
 */
export interface PushTokenResult {
  token: string | null;
  error?: string;
}

/**
 * Notification category identifiers
 */
export const NOTIFICATION_CATEGORIES = {
  GAME_ACTION: "game_action",
  CHALLENGE: "challenge",
  WALLET: "wallet",
  GENERAL: "general",
} as const;

/**
 * Interface for NotificationService
 */
export interface INotificationService {
  initialize(): Promise<void>;
  cleanup(): void;
  registerForPushNotifications(): Promise<PushTokenResult>;
  getPushToken(): string | null;
  checkPermissions(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  showLocalNotification(options: LocalNotificationOptions): Promise<string>;
  scheduleNotification(options: LocalNotificationOptions, trigger: any): Promise<string>;
  cancelNotification(notificationId: string): Promise<void>;
  cancelAllNotifications(): Promise<void>;
  getPendingNotifications(): Promise<any[]>;
  notifyYourTurn(gameId: string, opponentName: string): Promise<void>;
  notifyMatchFound(gameId: string, opponentName: string, wagerAmount?: number): Promise<void>;
  notifyChallengeReceived(challengeId: string, opponentName: string, wagerAmount: number): Promise<void>;
  notifyChallengeAccepted(challengeId: string, gameId: string, opponentName: string): Promise<void>;
  notifyGameEnded(gameId: string, result: "win" | "lose" | "draw", opponentName: string, amount?: number): Promise<void>;
  notifyDepositConfirmed(amount: number, txHash?: string): Promise<void>;
  notifyWithdrawalComplete(amount: number, txHash?: string): Promise<void>;
  notifyAchievementUnlocked(achievementId: string, achievementName: string, description: string): Promise<void>;
  setBadgeCount(count: number): Promise<void>;
  getBadgeCount(): Promise<number>;
  clearBadge(): Promise<void>;
}
