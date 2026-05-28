/**
 * Push Notifications Service - Web Stub
 *
 * Web platform doesn't support expo-notifications.
 * This stub provides no-op implementations for all methods.
 */

import { useCallback, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import type {
  INotificationService,
  LocalNotificationOptions,
  PushTokenResult,
} from "./notifications.types";

export * from "./notifications.types";

/**
 * Web Notification Service Stub
 * All methods are no-ops since web doesn't support native notifications
 */
class NotificationServiceWebClass implements INotificationService {
  async initialize(): Promise<void> {
    console.log("[NotificationService] Web platform - notifications not supported");
  }

  cleanup(): void {}

  async registerForPushNotifications(): Promise<PushTokenResult> {
    return { token: null, error: "Push notifications not supported on web" };
  }

  getPushToken(): string | null {
    return null;
  }

  async checkPermissions(): Promise<boolean> {
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    return false;
  }

  async showLocalNotification(_options: LocalNotificationOptions): Promise<string> {
    return "";
  }

  async scheduleNotification(_options: LocalNotificationOptions, _trigger: any): Promise<string> {
    return "";
  }

  async cancelNotification(_notificationId: string): Promise<void> {}

  async cancelAllNotifications(): Promise<void> {}

  async getPendingNotifications(): Promise<any[]> {
    return [];
  }

  async notifyYourTurn(_gameId: string, _opponentName: string): Promise<void> {}

  async notifyMatchFound(_gameId: string, _opponentName: string, _wagerAmount?: number): Promise<void> {}

  async notifyChallengeReceived(_challengeId: string, _opponentName: string, _wagerAmount: number): Promise<void> {}

  async notifyChallengeAccepted(_challengeId: string, _gameId: string, _opponentName: string): Promise<void> {}

  async notifyGameEnded(_gameId: string, _result: "win" | "lose" | "draw", _opponentName: string, _amount?: number): Promise<void> {}

  async notifyDepositConfirmed(_amount: number, _txHash?: string): Promise<void> {}

  async notifyWithdrawalComplete(_amount: number, _txHash?: string): Promise<void> {}

  async notifyAchievementUnlocked(_achievementId: string, _achievementName: string, _description: string): Promise<void> {}

  async setBadgeCount(_count: number): Promise<void> {}

  async getBadgeCount(): Promise<number> {
    return 0;
  }

  async clearBadge(): Promise<void> {}
}

/**
 * Global NotificationService instance (web stub)
 */
export const NotificationService = new NotificationServiceWebClass();

/**
 * Hook to use notification service in components (web stub)
 */
export function useNotifications() {
  const [pushToken] = useState<string | null>(null);
  const [isRegistered] = useState(false);
  const [permissionGranted] = useState(false);
  const { notifications } = useSettingsStore();

  const requestPermissions = useCallback(async () => false, []);

  const showNotification = useCallback(
    async (_options: LocalNotificationOptions) => null,
    []
  );

  return {
    pushToken,
    isRegistered,
    permissionGranted,
    requestPermissions,
    showNotification,
    notifyYourTurn: NotificationService.notifyYourTurn.bind(NotificationService),
    notifyMatchFound: NotificationService.notifyMatchFound.bind(NotificationService),
    notifyChallengeReceived: NotificationService.notifyChallengeReceived.bind(NotificationService),
    notifyChallengeAccepted: NotificationService.notifyChallengeAccepted.bind(NotificationService),
    notifyGameEnded: NotificationService.notifyGameEnded.bind(NotificationService),
    notifyDepositConfirmed: NotificationService.notifyDepositConfirmed.bind(NotificationService),
    notifyWithdrawalComplete: NotificationService.notifyWithdrawalComplete.bind(NotificationService),
    notifyAchievementUnlocked: NotificationService.notifyAchievementUnlocked.bind(NotificationService),
    setBadgeCount: NotificationService.setBadgeCount.bind(NotificationService),
    clearBadge: NotificationService.clearBadge.bind(NotificationService),
  };
}

export default NotificationService;
