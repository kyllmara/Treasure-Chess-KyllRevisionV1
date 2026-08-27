/**
 * TournamentMatchListener
 *
 * Sits in the root layout and subscribes to the tournament_matches
 * table via Supabase Realtime. When a match involving the current user
 * becomes ready (both players assigned, status pending/in_progress),
 * it shows an in-app toast and fires a local push notification.
 *
 * Falls back to polling if Realtime subscription fails.
 */

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ToastNotification";
import { NotificationService } from "@/lib/notifications";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import type { RealtimeChannel } from "@supabase/supabase-js";

const POLL_INTERVAL = 10_000; // 10 seconds

export function TournamentMatchListener() {
  const router = useRouter();
  const { profile, isAuthenticated, isGuest } = useAuth();
  const { showToast } = useToast();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const routerRef = useRef(router);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenMatchIdRef = useRef<string | null>(null);
  const realtimeActiveRef = useRef(false);

  // Keep router ref current for use inside callbacks
  routerRef.current = router;

  const notifyMatchReady = useCallback(
    (row: any) => {
      const matchId = row.id;
      const gameId = row.game_id;

      // Deduplicate
      if (lastSeenMatchIdRef.current === matchId) return;
      lastSeenMatchIdRef.current = matchId;

      console.log(
        "[TournamentMatchListener] Match ready:",
        matchId,
        "game:",
        gameId
      );

      // Show in-app toast with action button
      showToast({
        type: "info",
        title: "Match Ready!",
        message: "Your tournament match is ready to play.",
        duration: 8000,
        action: gameId
          ? {
              label: "Play Now",
              onPress: () => {
                routerRef.current.push(`/online-game?gameId=${gameId}` as any);
              },
            }
          : undefined,
      });

      // Also fire a local push notification for visibility
      NotificationService.showLocalNotification({
        title: "Tournament Match Ready!",
        body: "Your tournament match is ready. Tap to play now.",
        data: {
          type: "match_found",
          gameId: gameId ?? undefined,
        },
      }).catch((err: any) => {
        console.log(
          "[TournamentMatchListener] Local notification error:",
          err
        );
      });
    },
    [showToast]
  );

  const isMatchReadyForUser = useCallback(
    (row: any, userId: string): boolean => {
      // Check if the current user is a player in this match
      const isPlayer =
        row.player1_id === userId || row.player2_id === userId;
      if (!isPlayer) return false;

      // Both players must be assigned
      if (!row.player1_id || !row.player2_id) return false;

      // Match must be pending or in_progress
      const status = row.status;
      if (status !== "pending" && status !== "in_progress") return false;

      return true;
    },
    []
  );

  const handleRealtimeEvent = useCallback(
    (payload: any) => {
      const row = payload.new;
      if (!row || !profile?.id) return;

      console.log(
        "[TournamentMatchListener] Realtime event:",
        payload.eventType,
        row.id,
        row.status
      );

      if (isMatchReadyForUser(row, profile.id)) {
        notifyMatchReady(row);
      }
    },
    [profile?.id, isMatchReadyForUser, notifyMatchReady]
  );

  // Polling fallback: check for pending matches involving the user
  const pollForMatches = useCallback(
    async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from("tournament_matches")
          .select("*")
          .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
          .in("status", ["pending", "in_progress"] as any)
          .not("player1_id", "is", null)
          .not("player2_id", "is", null)
          .order("scheduled_at", { ascending: false, nullsFirst: false })
          .limit(1) as { data: any[] | null; error: any };

        if (error) {
          console.log(
            "[TournamentMatchListener] Poll error:",
            error.message
          );
          return;
        }

        if (data && data.length > 0) {
          const row = data[0];
          // Skip if we've already notified for this match
          if (lastSeenMatchIdRef.current === row.id) return;

          notifyMatchReady(row);
        }
      } catch (err) {
        console.log("[TournamentMatchListener] Poll exception:", err);
      }
    },
    [notifyMatchReady]
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

    const setupSubscription = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        console.log(
          "[TournamentMatchListener] No Supabase session, falling back to polling"
        );
        startPolling(userId);
        return;
      }

      console.log(
        "[TournamentMatchListener] Subscribing to realtime"
      );

      const channel = supabase
        .channel(`tournament-matches:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tournament_matches",
          },
          handleRealtimeEvent
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tournament_matches",
          },
          handleRealtimeEvent
        )
        .subscribe((status, err) => {
          console.log(
            "[TournamentMatchListener] Subscription status:",
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
                "[TournamentMatchListener] Realtime active, stopped polling"
              );
            }
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            realtimeActiveRef.current = false;
            console.log(
              "[TournamentMatchListener] Realtime failed, starting polling fallback"
            );
            startPolling(userId);
          }
        });

      channelRef.current = channel;
    };

    const startPolling = (uid: string) => {
      if (pollIntervalRef.current) return; // Already polling
      console.log("[TournamentMatchListener] Starting poll fallback");
      pollIntervalRef.current = setInterval(() => {
        pollForMatches(uid);
      }, POLL_INTERVAL);
    };

    // Start both: try realtime, fall back to polling
    setupSubscription();
    // Start polling immediately as backup until realtime confirms
    startPolling(userId);

    return () => {
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
  }, [
    profile?.id,
    isAuthenticated,
    isGuest,
    handleRealtimeEvent,
    pollForMatches,
  ]);

  return null;
}
