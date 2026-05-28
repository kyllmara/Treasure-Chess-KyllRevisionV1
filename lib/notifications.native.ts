/**
 * Push Notifications Service
 *
 * Elite-standard notification system for Treasure Chess featuring:
 * - Expo Push Notifications integration
 * - Permission handling with graceful fallbacks
 * - Token management and persistence
 * - Notification categories and actions
 * - Deep linking support for navigation
 * - Settings-aware notification delivery
 *
 * This file exports from platform-specific implementations:
 * - notifications.native.ts for iOS/Android
 * - notifications.web.ts for web (stub implementation)
 *
 * @example
 * // Initialize on app start
 * await NotificationService.initialize();
 *
 * // Register for push notifications
 * const token = await NotificationService.registerForPushNotifications();
 *
 * // Send local notification
 * await NotificationService.showLocalNotification({
 *   title: "Your Turn!",
 *   body: "ChessMaster moved. It's your turn to play.",
 *   data: { type: "your_turn", gameId: "123" },
 * });
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUserStore } from "@/stores/userStore";

// Re-export types
export * from "./notifications.types";

import type {
  INotificationService,
  LocalNotificationOptions,
  NotificationData,
  NotificationHandlerResult,
  PushTokenResult,
} from "./notifications.types";

import { NOTIFICATION_CATEGORIES } from "./notifications.types";

/**
 * Notification channel configuration for Android
 */
const ANDROID_CHANNEL_CONFIG = {
  name: "Treasure Chess",
  description: "Game and wallet notifications",
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: "#FFD700",
  sound: "notification.wav",
};

/**
 * Singleton Notification Service
 */
class NotificationServiceClass implements INotificationService {
  private isInitialized = false;
  private pushToken: string | null = null;
  private notificationListener: { remove: () => void } | null = null;
  private responseListener: { remove: () => void } | null = null;

  /**
   * Initialize the notification service
   * Sets up handlers, channels, and categories
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Configure notification behavior
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          const result = await this.handleNotificationReceived(notification);
          return {
            shouldShowBanner: result.shouldShowBanner,
            shouldShowList: result.shouldShowList,
            shouldPlaySound: result.shouldPlaySound,
            shouldSetBadge: result.shouldSetBadge,
          };
        },
      });

      // Set up Android notification channel
      if (Platform.OS === "android") {
        await this.setupAndroidChannel();
      }

      // Set up notification categories with actions
      await this.setupNotificationCategories();

      // Set up listeners
      this.setupListeners();

      this.isInitialized = true;
      console.log("[NotificationService] Initialized successfully");
    } catch (error) {
      console.error("[NotificationService] Initialization failed:", error);
    }
  }

  /**
   * Clean up listeners on unmount
   */
  cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  /**
   * Register for push notifications and get token
   */
  async registerForPushNotifications(): Promise<PushTokenResult> {
    try {
      // Check if physical device
      if (!Device.isDevice) {
        return {
          token: null,
          error: "Push notifications require a physical device",
        };
      }

      // Check/request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        return {
          token: null,
          error: "Notification permission not granted",
        };
      }

      // Get project ID for Expo push notifications
      const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId ??
                        (Constants as any).easConfig?.projectId;

      if (!projectId) {
        console.warn("[NotificationService] No project ID found for push notifications");
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      this.pushToken = tokenData.data;
      console.log("[NotificationService] Push token obtained:", this.pushToken);

      return { token: this.pushToken };
    } catch (error) {
      console.error("[NotificationService] Failed to get push token:", error);
      return {
        token: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get the current push token
   */
  getPushToken(): string | null {
    return this.pushToken;
  }

  /**
   * Check if push notifications are available
   */
  async checkPermissions(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  }

  /**
   * Show a local notification
   */
  async showLocalNotification(options: LocalNotificationOptions): Promise<string> {
    const { title, body, data, sound = true, badge, categoryId, subtitle } = options;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...(subtitle ? { subtitle } : {}),
        data: data as Record<string, unknown>,
        sound: sound ? "notification.wav" : undefined,
        ...(badge != null ? { badge } : {}),
        categoryIdentifier: categoryId,
      },
      trigger: null,
    });

    return notificationId;
  }

  /**
   * Schedule a notification for future delivery
   */
  async scheduleNotification(
    options: LocalNotificationOptions,
    trigger: any
  ): Promise<string> {
    const { title, body, data, sound = true, badge, categoryId, subtitle } = options;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...(subtitle ? { subtitle } : {}),
        data: data as Record<string, unknown>,
        sound: sound ? "notification.wav" : undefined,
        ...(badge != null ? { badge } : {}),
        categoryIdentifier: categoryId,
      },
      trigger,
    });

    return notificationId;
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Get all pending notifications
   */
  async getPendingNotifications(): Promise<any[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  /**
   * Send "Your Turn" notification
   */
  async notifyYourTurn(gameId: string, opponentName: string): Promise<void> {
    await this.showLocalNotification({
      title: "Your Turn!",
      body: `${opponentName} made a move. It's your turn to play.`,
      data: {
        type: "your_turn",
        gameId,
        opponentName,
      },
      categoryId: NOTIFICATION_CATEGORIES.GAME_ACTION,
    });
  }

  /**
   * Send "Match Found" notification
   */
  async notifyMatchFound(gameId: string, opponentName: string, wagerAmount?: number): Promise<void> {
    try {
      const body = wagerAmount
        ? `Matched with ${opponentName} for $${wagerAmount.toFixed(2)}`
        : `Matched with ${opponentName}`;

      await this.showLocalNotification({
        title: "Match Found!",
        body,
        data: {
          type: "match_found",
          gameId,
          opponentName,
          amount: wagerAmount,
        },
        categoryId: NOTIFICATION_CATEGORIES.GAME_ACTION,
      });
    } catch (error) {
      console.warn("[Notifications] notifyMatchFound failed (non-fatal):", error);
    }
  }

  /**
   * Send "Challenge Received" notification
   */
  async notifyChallengeReceived(
    challengeId: string,
    opponentName: string,
    wagerAmount: number
  ): Promise<void> {
    await this.showLocalNotification({
      title: "New Challenge!",
      body: `${opponentName} challenged you for $${wagerAmount.toFixed(2)}`,
      data: {
        type: "challenge_received",
        challengeId,
        opponentName,
        amount: wagerAmount,
      },
      categoryId: NOTIFICATION_CATEGORIES.CHALLENGE,
    });
  }

  /**
   * Send "Challenge Accepted" notification
   */
  async notifyChallengeAccepted(
    challengeId: string,
    gameId: string,
    opponentName: string
  ): Promise<void> {
    await this.showLocalNotification({
      title: "Challenge Accepted!",
      body: `${opponentName} accepted your challenge. Game is starting!`,
      data: {
        type: "challenge_accepted",
        challengeId,
        gameId,
        opponentName,
      },
      categoryId: NOTIFICATION_CATEGORIES.CHALLENGE,
    });
  }

  /**
   * Send "Challenge Expiring" notification
   */
  async notifyChallengeExpiring(
    challengeId: string,
    roomCode: string,
    minutesRemaining: number
  ): Promise<void> {
    await this.showLocalNotification({
      title: "Challenge Expiring Soon",
      body: `Your challenge (${roomCode}) expires in ${minutesRemaining} minutes.`,
      data: {
        type: "challenge_expiring",
        challengeId,
        roomCode,
      },
      categoryId: NOTIFICATION_CATEGORIES.CHALLENGE,
    });
  }

  /**
   * Send "Challenge Expired" notification
   */
  async notifyChallengeExpired(
    challengeId: string,
    roomCode: string
  ): Promise<void> {
    await this.showLocalNotification({
      title: "Challenge Expired",
      body: `Your challenge (${roomCode}) has expired without being accepted.`,
      data: {
        type: "challenge_expired",
        challengeId,
        roomCode,
      },
      categoryId: NOTIFICATION_CATEGORIES.CHALLENGE,
    });
  }

  /**
   * Send "Challenge Declined" notification
   */
  async notifyChallengeDeclined(
    challengeId: string,
    opponentName: string
  ): Promise<void> {
    await this.showLocalNotification({
      title: "Challenge Declined",
      body: `${opponentName} declined your challenge.`,
      data: {
        type: "challenge_declined",
        challengeId,
        opponentName,
      },
      categoryId: NOTIFICATION_CATEGORIES.CHALLENGE,
    });
  }

  /**
   * Send "Game Ended" notification
   */
  async notifyGameEnded(
    gameId: string,
    result: "win" | "lose" | "draw",
    opponentName: string,
    amount?: number
  ): Promise<void> {
    let title: string;
    let body: string;

    switch (result) {
      case "win":
        title = "Victory!";
        body = amount
          ? `You beat ${opponentName} and won $${amount.toFixed(2)}!`
          : `You beat ${opponentName}!`;
        break;
      case "lose":
        title = "Game Over";
        body = `${opponentName} won the game.`;
        break;
      case "draw":
        title = "Draw";
        body = `Your game with ${opponentName} ended in a draw.`;
        break;
    }

    await this.showLocalNotification({
      title,
      body,
      data: {
        type: "game_ended",
        gameId,
        opponentName,
        amount,
      },
      categoryId: NOTIFICATION_CATEGORIES.GAME_ACTION,
    });
  }

  /**
   * Send "Deposit Confirmed" notification
   */
  async notifyDepositConfirmed(amount: number, txHash?: string): Promise<void> {
    await this.showLocalNotification({
      title: "Deposit Confirmed",
      body: `$${amount.toFixed(2)} has been added to your wallet.`,
      data: {
        type: "deposit_confirmed",
        amount,
      },
      categoryId: NOTIFICATION_CATEGORIES.WALLET,
    });
  }

  /**
   * Send "Withdrawal Complete" notification
   */
  async notifyWithdrawalComplete(amount: number, txHash?: string): Promise<void> {
    await this.showLocalNotification({
      title: "Withdrawal Complete",
      body: `$${amount.toFixed(2)} has been sent to your wallet.`,
      data: {
        type: "withdrawal_complete",
        amount,
      },
      categoryId: NOTIFICATION_CATEGORIES.WALLET,
    });
  }

  /**
   * Send "Achievement Unlocked" notification
   */
  async notifyAchievementUnlocked(
    achievementId: string,
    achievementName: string,
    description: string
  ): Promise<void> {
    await this.showLocalNotification({
      title: "Achievement Unlocked!",
      body: `${achievementName}: ${description}`,
      data: {
        type: "achievement_unlocked",
        achievementId,
      },
      categoryId: NOTIFICATION_CATEGORIES.GENERAL,
    });
  }

  /**
   * Set app badge count
   */
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  /**
   * Get current badge count
   */
  async getBadgeCount(): Promise<number> {
    return Notifications.getBadgeCountAsync();
  }

  /**
   * Clear badge count
   */
  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  /**
   * Handle notification received while app is foregrounded
   */
  private async handleNotificationReceived(
    notification: Notifications.Notification
  ): Promise<NotificationHandlerResult> {
    const data = notification?.request?.content?.data as NotificationData;

    switch (data?.type) {
      case "your_turn":
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };

      case "match_found":
      case "challenge_received":
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };

      case "deposit_confirmed":
      case "withdrawal_complete":
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };

      default:
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
    }
  }

  /**
   * Handle notification response (tap)
   */
  private handleNotificationResponse(
    response: Notifications.NotificationResponse
  ): void {
    const data = response?.notification?.request?.content?.data as NotificationData;

    console.log("[NotificationService] Notification tapped:", data);

    this.navigateFromNotification(data);
  }

  /**
   * Navigate to appropriate screen based on notification data
   */
  private navigateFromNotification(data: NotificationData): void {
    if (!data?.type) return;

    switch (data.type) {
      case "your_turn":
      case "match_found":
      case "game_started":
        if (data.gameId) {
          router.push({
            pathname: "/game",
            params: { gameId: data.gameId },
          } as any);
        }
        break;

      case "matchmaking_player_found":
        // Player in queue notification - take them directly to play-now
        // with the wager amount pre-selected so they can instantly join
        router.push({
          pathname: "/play-now",
          params: {
            wagerTct: (data as any).wagerTct?.toString(),
            autoStart: "true",
          },
        } as any);
        break;

      case "challenge_received":
      case "challenge_declined":
        if (data.challengeId) {
          router.push({
            pathname: "/create-challenge",
            params: {
              challengeId: data.challengeId,
              roomCode: (data as any).roomCode || "",
              rejoin: "true",
            },
          } as any);
        }
        break;

      case "opponent_joined_lobby":
      case "player_ready":
        if (data.challengeId) {
          router.push({
            pathname: "/create-challenge",
            params: {
              challengeId: data.challengeId,
              rejoin: "true",
            },
          } as any);
        }
        break;

      case "challenge_accepted":
        if (data.gameId) {
          router.push({
            pathname: "/game",
            params: { gameId: data.gameId },
          } as any);
        } else if (data.challengeId) {
          // opponent_joined_lobby uses challenge_accepted notification type
          router.push({
            pathname: "/create-challenge",
            params: {
              challengeId: data.challengeId,
              rejoin: "true",
            },
          } as any);
        }
        break;

      case "game_ended":
        if (data.gameId) {
          router.push({
            pathname: "/game-result",
            params: { gameId: data.gameId },
          } as any);
        }
        break;

      case "deposit_confirmed":
      case "withdrawal_complete":
        router.push("/wallet" as any);
        break;

      case "achievement_unlocked":
        router.push("/profile" as any);
        break;

      default:
        router.push("/");
        break;
    }
  }

  /**
   * Set up Android notification channel
   */
  private async setupAndroidChannel(): Promise<void> {
    await Notifications.setNotificationChannelAsync("default", {
      name: ANDROID_CHANNEL_CONFIG.name,
      description: ANDROID_CHANNEL_CONFIG.description,
      importance: ANDROID_CHANNEL_CONFIG.importance,
      vibrationPattern: ANDROID_CHANNEL_CONFIG.vibrationPattern,
      lightColor: ANDROID_CHANNEL_CONFIG.lightColor,
      sound: ANDROID_CHANNEL_CONFIG.sound,
    });
  }

  /**
   * Set up notification categories with actions
   */
  private async setupNotificationCategories(): Promise<void> {
    await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.GAME_ACTION, [
      {
        identifier: "play",
        buttonTitle: "Play Now",
        options: {
          opensAppToForeground: true,
        },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.CHALLENGE, [
      {
        identifier: "accept",
        buttonTitle: "Accept",
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: "decline",
        buttonTitle: "Decline",
        options: {
          opensAppToForeground: false,
          isDestructive: true,
        },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.WALLET, [
      {
        identifier: "view",
        buttonTitle: "View Wallet",
        options: {
          opensAppToForeground: true,
        },
      },
    ]);
  }

  /**
   * Set up notification listeners
   */
  private setupListeners(): void {
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("[NotificationService] Notification received:", notification);
      }
    );

    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        this.handleNotificationResponse(response);
      }
    );
  }
}

/**
 * Global NotificationService instance
 */
export const NotificationService = new NotificationServiceClass();

/**
 * Hook to use notification service in components
 */
export function useNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const { notifications } = useSettingsStore();
  const { savePushToken, profile } = useUserStore();
  const syncedTokenRef = useRef<string | null>(null);

  // Sync push token to Supabase when obtained
  const syncTokenToSupabase = useCallback(async (token: string) => {
    if (syncedTokenRef.current === token) return;
    if (!profile) return;

    const success = await savePushToken(token);
    if (success) {
      syncedTokenRef.current = token;
    }
  }, [savePushToken, profile]);

  useEffect(() => {
    const initialize = async () => {
      await NotificationService.initialize();

      const hasPermission = await NotificationService.checkPermissions();
      setPermissionGranted(hasPermission);

      if (hasPermission && notifications.pushEnabled) {
        const result = await NotificationService.registerForPushNotifications();
        if (result.token) {
          setPushToken(result.token);
          setIsRegistered(true);
          await syncTokenToSupabase(result.token);
        }
      }
    };

    initialize();

    return () => {
      NotificationService.cleanup();
    };
  }, [notifications.pushEnabled, syncTokenToSupabase]);

  // Sync token when profile becomes available
  useEffect(() => {
    if (pushToken && profile && syncedTokenRef.current !== pushToken) {
      syncTokenToSupabase(pushToken);
    }
  }, [pushToken, profile, syncTokenToSupabase]);

  const requestPermissions = useCallback(async () => {
    const granted = await NotificationService.requestPermissions();
    setPermissionGranted(granted);

    if (granted) {
      const result = await NotificationService.registerForPushNotifications();
      if (result.token) {
        setPushToken(result.token);
        setIsRegistered(true);
        await syncTokenToSupabase(result.token);
      }
    }

    return granted;
  }, [syncTokenToSupabase]);

  const showNotification = useCallback(
    async (options: LocalNotificationOptions) => {
      if (!notifications.pushEnabled) return null;

      const { type } = options.data || {};

      if (type === "your_turn" && !notifications.notifyYourTurn) return null;
      if (type === "challenge_received" && !notifications.notifyGameInvites) return null;
      if (type === "game_ended" && !notifications.notifyGameResults) return null;
      if (type === "deposit_confirmed" && !notifications.notifyDeposits) return null;
      if (type === "withdrawal_complete" && !notifications.notifyDeposits) return null;
      if (type === "achievement_unlocked" && !notifications.notifyAchievements) return null;

      return NotificationService.showLocalNotification(options);
    },
    [notifications]
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
    notifyChallengeExpiring: NotificationService.notifyChallengeExpiring.bind(NotificationService),
    notifyChallengeExpired: NotificationService.notifyChallengeExpired.bind(NotificationService),
    notifyChallengeDeclined: NotificationService.notifyChallengeDeclined.bind(NotificationService),
    notifyGameEnded: NotificationService.notifyGameEnded.bind(NotificationService),
    notifyDepositConfirmed: NotificationService.notifyDepositConfirmed.bind(NotificationService),
    notifyWithdrawalComplete: NotificationService.notifyWithdrawalComplete.bind(NotificationService),
    notifyAchievementUnlocked: NotificationService.notifyAchievementUnlocked.bind(NotificationService),
    setBadgeCount: NotificationService.setBadgeCount.bind(NotificationService),
    clearBadge: NotificationService.clearBadge.bind(NotificationService),
  };
}

export default NotificationService;
