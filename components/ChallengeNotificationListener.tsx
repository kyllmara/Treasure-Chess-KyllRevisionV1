/**
 * ChallengeNotificationListener
 *
 * Sits in the root layout and subscribes to the challenge_notifications
 * table via Supabase Realtime. Handles multiple notification types:
 * - challenge_received: opponent was challenged
 * - challenge_declined: creator's challenge was declined (Make Public / Cancel)
 * - challenge_accepted (opponent_joined_lobby): opponent joined the lobby
 * - game_starting (player_ready): other player marked ready
 *
 * Falls back to polling if Realtime subscription fails.
 */

import { useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useChallengeStore } from "@/stores/challengeStore";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import type { RealtimeChannel } from "@supabase/supabase-js";
import React from "react";

const POLL_INTERVAL = 5000; // 5 seconds
const REALTIME_CONNECT_TIMEOUT = 3000; // Wait 3s for realtime before starting poll

// Exported ref so the lobby screen can suppress duplicate alerts
// when the user is already viewing that challenge
export const suppressedChallengeIdRef = React.createRef<string | null>() as React.MutableRefObject<string | null>;
suppressedChallengeIdRef.current = null;

// Track shown notification IDs to prevent duplicates (realtime + poll race condition)
const shownNotificationIds = new Set<string>();

// Notification types we listen for
const LISTENED_TYPES = [
  "challenge_received",
  "challenge_declined",
  "challenge_accepted",
  "game_starting",
];

export function ChallengeNotificationListener() {
  const router = useRouter();
  const { profile, isAuthenticated, isGuest } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const routerRef = useRef(router);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const realtimeActiveRef = useRef(false);

  // Keep router ref current for use inside callbacks
  routerRef.current = router;

  const showChallengeAlert = useCallback(
    (row: any) => {
      const title = row.title || "You've Been Challenged!";
      const body = row.body || "Someone challenged you to a game.";

      Alert.alert(title, body, [
        {
          text: "Dismiss",
          style: "cancel",
        },
        {
          text: "View Challenge",
          onPress: () => {
            // Navigate to the challenge board where opponent can accept/decline
            routerRef.current.push("/challenge-board" as any);
          },
        },
      ]);
    },
    []
  );

  const showDeclinedAlert = useCallback(
    (row: any) => {
      const title = row.title || "Challenge Declined";
      const body = row.body || "Your opponent declined the challenge.";
      const challengeId = row.challenge_id;

      const { makePublic, deleteDeclinedChallenge } = useChallengeStore.getState();

      Alert.alert(title, body, [
        {
          text: "Cancel Challenge",
          style: "destructive",
          onPress: async () => {
            await deleteDeclinedChallenge(challengeId);
          },
        },
        {
          text: "Make Public",
          onPress: async () => {
            const success = await makePublic(challengeId);
            if (success) {
              routerRef.current.push({
                pathname: "/create-challenge" as any,
                params: {
                  challengeId,
                  rejoin: "true",
                },
              });
            }
          },
        },
      ]);
    },
    []
  );

  const showLobbyAlert = useCallback(
    (row: any) => {
      const title = row.title || "Lobby Update";
      const body = row.body || "Something happened in your lobby.";
      const challengeId = row.challenge_id;

      // Suppress if user is already viewing this challenge's lobby
      if (suppressedChallengeIdRef.current === challengeId) {
        console.log("[ChallengeNotificationListener] Suppressing lobby alert for active challenge:", challengeId);
        return;
      }

      Alert.alert(title, body, [
        {
          text: "Dismiss",
          style: "cancel",
        },
        {
          text: "Go to Lobby",
          onPress: () => {
            routerRef.current.push({
              pathname: "/create-challenge" as any,
              params: {
                challengeId,
                rejoin: "true",
              },
            });
          },
        },
      ]);
    },
    []
  );

  const handleNewNotification = useCallback(
    (payload: any) => {
      const row = payload.new;
      if (!row) return;

      const notifType = row.notification_type;
      if (!LISTENED_TYPES.includes(notifType)) return;

      // Deduplicate: check if we've already shown this notification
      if (shownNotificationIds.has(row.id)) {
        console.log("[ChallengeNotificationListener] Skipping duplicate (realtime):", row.id);
        return;
      }
      shownNotificationIds.add(row.id);
      // Clean up old IDs after 60 seconds to prevent memory leak
      setTimeout(() => shownNotificationIds.delete(row.id), 60000);

      console.log(
        "[ChallengeNotificationListener] New notification (realtime):",
        row.id,
        notifType,
        row.data?.type
      );

      lastSeenIdRef.current = row.id;

      // Route by notification type
      switch (notifType) {
        case "challenge_received":
          showChallengeAlert(row);
          break;

        case "challenge_declined":
          showDeclinedAlert(row);
          break;

        case "challenge_accepted":
          // Check data.type for specific sub-type
          if (row.data?.type === "opponent_joined_lobby") {
            showLobbyAlert(row);
          } else {
            showChallengeAlert(row);
          }
          break;

        case "game_starting":
          if (row.data?.type === "player_ready") {
            showLobbyAlert(row);
          }
          break;

        default:
          showChallengeAlert(row);
          break;
      }
    },
    [showChallengeAlert, showDeclinedAlert, showLobbyAlert]
  );

  // Polling fallback: check for unread notifications of all listened types
  const pollForNotifications = useCallback(
    async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from("challenge_notifications")
          .select("*")
          .eq("user_id", userId)
          .in("notification_type", LISTENED_TYPES as any)
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(1) as { data: any[] | null; error: any };

        if (error) {
          console.log("[ChallengeNotificationListener] Poll error:", error.message);
          return;
        }

        if (data && data.length > 0) {
          const row = data[0];

          // Deduplicate: check if we've already shown this notification
          if (shownNotificationIds.has(row.id)) {
            console.log("[ChallengeNotificationListener] Skipping duplicate (poll):", row.id);
            return;
          }

          // Skip if we've already shown this notification (backup check)
          if (lastSeenIdRef.current === row.id) return;

          // Only show if created within the last 30 seconds (avoid showing old ones)
          const createdAt = new Date(row.created_at).getTime();
          const now = Date.now();
          if (now - createdAt > 30000) return;

          // Mark as shown BEFORE displaying to prevent race condition
          shownNotificationIds.add(row.id);
          setTimeout(() => shownNotificationIds.delete(row.id), 60000);

          console.log(
            "[ChallengeNotificationListener] New notification (poll):",
            row.id,
            row.notification_type
          );

          lastSeenIdRef.current = row.id;

          // Route by notification type (same as realtime handler)
          const notifType = row.notification_type;
          switch (notifType) {
            case "challenge_received":
              showChallengeAlert(row);
              break;
            case "challenge_declined":
              showDeclinedAlert(row);
              break;
            case "challenge_accepted":
              if (row.data?.type === "opponent_joined_lobby") {
                showLobbyAlert(row);
              } else {
                showChallengeAlert(row);
              }
              break;
            case "game_starting":
              if (row.data?.type === "player_ready") {
                showLobbyAlert(row);
              }
              break;
            default:
              showChallengeAlert(row);
              break;
          }

          // Mark as read so we don't show it again
          await (supabase
            .from("challenge_notifications")
            .update({ is_read: true, read_at: new Date().toISOString() } as any)
            .eq("id", row.id) as any);
        }
      } catch (err) {
        console.log("[ChallengeNotificationListener] Poll exception:", err);
      }
    },
    [showChallengeAlert, showDeclinedAlert, showLobbyAlert]
  );

  useEffect(() => {
    if (DEV_BYPASS_AUTH || !profile?.id || !isAuthenticated || isGuest) {
      // Cleanup if user logs out, is guest, or is in DEV bypass (stub user has no DB rows)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      realtimeActiveRef.current = false;
      return;
    }

    const userId = profile.id;

    // First verify we have a valid Supabase session
    const setupSubscription = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        console.log(
          "[ChallengeNotificationListener] No Supabase session, falling back to polling"
        );
        // Start polling fallback
        startPolling(userId);
        return;
      }

      console.log(
        "[ChallengeNotificationListener] Supabase session found, subscribing to realtime"
      );

      // Subscribe to challenge_notifications for this user
      const channel = supabase
        .channel(`challenge-notifs:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "challenge_notifications",
            filter: `user_id=eq.${userId}`,
          },
          handleNewNotification
        )
        .subscribe((status, err) => {
          console.log(
            "[ChallengeNotificationListener] Subscription status:",
            status,
            err ? `Error: ${err.message}` : ""
          );

          if (status === "SUBSCRIBED") {
            realtimeActiveRef.current = true;
            // Stop polling if realtime connects
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              console.log(
                "[ChallengeNotificationListener] Realtime active, stopped polling"
              );
            }
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            realtimeActiveRef.current = false;
            console.log(
              "[ChallengeNotificationListener] Realtime failed, starting polling fallback"
            );
            startPolling(userId);
          }
        });

      channelRef.current = channel;
    };

    const startPolling = (uid: string) => {
      if (pollIntervalRef.current) return; // Already polling
      console.log("[ChallengeNotificationListener] Starting poll fallback");
      pollIntervalRef.current = setInterval(() => {
        pollForNotifications(uid);
      }, POLL_INTERVAL);
    };

    // Start realtime subscription
    setupSubscription();

    // Delay polling - give realtime a chance to connect first
    const pollDelayTimeout = setTimeout(() => {
      if (!realtimeActiveRef.current) {
        console.log("[ChallengeNotificationListener] Realtime not connected, starting polling");
        startPolling(userId);
      }
    }, REALTIME_CONNECT_TIMEOUT);

    return () => {
      clearTimeout(pollDelayTimeout);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      realtimeActiveRef.current = false;
    };
  }, [profile?.id, isAuthenticated, isGuest, handleNewNotification, pollForNotifications]);

  return null;
}
