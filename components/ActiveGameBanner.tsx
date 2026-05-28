/**
 * Active Game Banner
 *
 * Shows a banner when the user has an active game in progress.
 * Allows them to quickly rejoin the game from any screen.
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Play, Clock } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface ActiveGame {
  id: string;
  white_player_id: string;
  black_player_id: string;
  wager_tct: number;
  current_turn: string;
  white_time_remaining: number;
  black_time_remaining: number;
  white_player?: { username: string };
  black_player?: { username: string };
}

export function ActiveGameBanner() {
  const router = useRouter();
  const { profile, isAuthenticated } = useAuth();
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkForActiveGame = useCallback(async () => {
    if (!profile?.id || !isAuthenticated) {
      setActiveGame(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("games")
        .select(`
          id,
          white_player_id,
          black_player_id,
          wager_tct,
          current_turn,
          white_time_remaining,
          black_time_remaining,
          white_player:profiles!games_white_player_id_fkey(username),
          black_player:profiles!games_black_player_id_fkey(username)
        `)
        .eq("status", "active")
        .or(`white_player_id.eq.${profile.id},black_player_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        // No active game found (or other error)
        if (error.code !== "PGRST116") {
          console.log("[ActiveGameBanner] Error checking for active game:", error.message);
        }
        setActiveGame(null);
        return;
      }

      setActiveGame(data as ActiveGame);
    } catch (err) {
      console.error("[ActiveGameBanner] Error:", err);
      setActiveGame(null);
    }
  }, [profile?.id, isAuthenticated]);

  // Check on mount and focus
  useFocusEffect(
    useCallback(() => {
      checkForActiveGame();
    }, [checkForActiveGame])
  );

  // Subscribe to game updates
  useEffect(() => {
    if (!profile?.id || !isAuthenticated) return;

    const channel = supabase
      .channel("active_game_check")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
        },
        (payload) => {
          // Refresh active game status on any game change
          checkForActiveGame();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, isAuthenticated, checkForActiveGame]);

  if (!activeGame) {
    return null;
  }

  const isMyTurn = (activeGame.white_player_id === profile?.id && activeGame.current_turn === "w") ||
                   (activeGame.black_player_id === profile?.id && activeGame.current_turn === "b");

  const opponentName = activeGame.white_player_id === profile?.id
    ? activeGame.black_player?.username || "Opponent"
    : activeGame.white_player?.username || "Opponent";

  const handleRejoin = () => {
    router.push({
      pathname: "/online-game",
      params: { gameId: activeGame.id },
    });
  };

  return (
    <TouchableOpacity
      style={[styles.banner, isMyTurn && styles.bannerMyTurn]}
      onPress={handleRejoin}
      activeOpacity={0.8}
    >
      <View style={styles.bannerContent}>
        <Play size={18} color={isMyTurn ? "#FFF" : "#4ECDC4"} />
        <View style={styles.textContainer}>
          <Text style={[styles.bannerTitle, isMyTurn && styles.bannerTitleMyTurn]}>
            {isMyTurn ? "Your Turn!" : "Game in Progress"}
          </Text>
          <Text style={[styles.bannerSubtitle, isMyTurn && styles.bannerSubtitleMyTurn]}>
            vs {opponentName} {activeGame.wager_tct > 0 && `• ${activeGame.wager_tct} TCT`}
          </Text>
        </View>
      </View>
      <View style={[styles.rejoinButton, isMyTurn && styles.rejoinButtonMyTurn]}>
        <Text style={[styles.rejoinText, isMyTurn && styles.rejoinTextMyTurn]}>Rejoin</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderBottomWidth: 1,
    borderBottomColor: "#4ECDC4",
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bannerMyTurn: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderBottomColor: "#FFD700",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  textContainer: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  bannerTitleMyTurn: {
    color: "#FFD700",
  },
  bannerSubtitle: {
    fontSize: 12,
    color: "rgba(78, 205, 196, 0.8)",
    marginTop: 2,
  },
  bannerSubtitleMyTurn: {
    color: "rgba(255, 215, 0, 0.8)",
  },
  rejoinButton: {
    backgroundColor: "rgba(78, 205, 196, 0.3)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rejoinButtonMyTurn: {
    backgroundColor: "rgba(255, 215, 0, 0.3)",
  },
  rejoinText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4ECDC4",
  },
  rejoinTextMyTurn: {
    color: "#FFD700",
  },
});
