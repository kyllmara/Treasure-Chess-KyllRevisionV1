/**
 * Online Game Screen
 *
 * Real-time multiplayer chess game with:
 * - Supabase real-time sync for moves
 * - Chess.com style clocks (time + increment)
 * - Move validation on client and server
 * - Game result detection and settlement
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Chess, Square, Move, PieceSymbol as ChessPieceSymbol } from "chess.js";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Clock, Flag, MessageCircle, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getRelaySDK, tctToUsdc } from "@/lib/relay";
import { ChessPieceComponent } from "@/components/ChessPieces";
import { PawnPromotionModal } from "@/components/PawnPromotionModal";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";
import { useSettingsStore } from "@/stores/settingsStore";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getAvatarSource, ROBOT_AVATAR_INDEX } from "@/constants/avatars";

const { width } = Dimensions.get("window");
const BOARD_SIZE = Math.min(width - 40, 360);
const SQUARE_SIZE = BOARD_SIZE / 8;

type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
type PieceColor = "w" | "b";

interface ChessPiece {
  type: PieceSymbol;
  color: PieceColor;
}

interface GameData {
  id: string;
  white_player_id: string;
  black_player_id: string;
  winner_id: string | null;
  wager_tct: number;
  time_control_seconds: number;
  increment_seconds: number;
  status: string;
  result: string | null;
  current_fen: string;
  white_time_remaining: number;
  black_time_remaining: number;
  move_count: number;
  current_turn: string;
  last_move_at: string | null;
  started_at: string | null;
  white_player?: { username: string; elo_rating: number; avatar_index: number; country?: string };
  black_player?: { username: string; elo_rating: number; avatar_index: number; country?: string };
}

interface GameMove {
  id: string;
  game_id: string;
  move_number: number;
  player_id: string;
  san: string;
  uci: string;
  fen_after: string;
  time_remaining: number;
  created_at: string;
}

const BOARD_THEMES = {
  purple: { light: "#FFFFFF", dark: "#9B7EC8" },
  classic: { light: "#FFFFFF", dark: "#000000" },
  eco: { light: "#8B4513", dark: "#6B8E23" },
  retro: { light: "#E8D7B8", dark: "#A67C52" },
};

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Country flags mapping
const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸",
  UK: "🇬🇧",
  GB: "🇬🇧",
  CA: "🇨🇦",
  AU: "🇦🇺",
  DE: "🇩🇪",
  FR: "🇫🇷",
  JP: "🇯🇵",
  BR: "🇧🇷",
  IN: "🇮🇳",
  MX: "🇲🇽",
  ES: "🇪🇸",
  IT: "🇮🇹",
  RU: "🇷🇺",
  CN: "🇨🇳",
  KR: "🇰🇷",
  NL: "🇳🇱",
  SE: "🇸🇪",
  NO: "🇳🇴",
  PL: "🇵🇱",
  DEFAULT: "🌍",
};

const getCountryFlag = (countryCode?: string): string => {
  if (!countryCode) return COUNTRY_FLAGS.DEFAULT;
  return COUNTRY_FLAGS[countryCode.toUpperCase()] || COUNTRY_FLAGS.DEFAULT;
};

export default function OnlineGameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    gameId: string;
    wagerTct?: string;
    timeControl?: string;
    source?: string; // "play-now" | "challenge" | "tournament"
  }>();
  const { profile } = useAuth();
  const { game: gameSettings } = useSettingsStore();
  const {
    playMove,
    playPiecePickup,
    playIllegalMove,
    playGameStart,
    playWin,
    playLose,
    playDraw,
    playLowTime,
  } = useSoundAndHaptics();

  // Game state
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [chess] = useState(() => new Chess());
  const [board, setBoard] = useState<(ChessPiece | null)[][]>(() => {
    // Initialize with standard starting position so board is never blank
    const boardArray: (ChessPiece | null)[][] = [];
    const tempChess = new Chess();
    const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    ranks.forEach((rank) => {
      const row: (ChessPiece | null)[] = [];
      files.forEach((file) => {
        const square = (file + rank) as Square;
        const piece = tempChess.get(square);
        row.push(piece || null);
      });
      boardArray.push(row);
    });
    return boardArray;
  });
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);

  // Clock state
  const [whiteTime, setWhiteTime] = useState<number>(300);
  const [blackTime, setBlackTime] = useState<number>(300);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs to track current times for cleanup (state won't be accessible in cleanup)
  const whiteTimeRef = useRef<number>(300);
  const blackTimeRef = useRef<number>(300);
  const gameIdRef = useRef<string | undefined>(undefined);
  const gameStatusRef = useRef<string>("active");
  const chessRef = useRef<Chess>(chess); // Ref to access chess object in cleanup

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const isSubmittingMoveRef = useRef(false); // Ref for polling to check
  const [error, setError] = useState<string | null>(null);

  // Real-time subscription
  const subscriptionRef = useRef<RealtimeChannel | null>(null);

  // Tournament tracking — if this game is part of a tournament, navigate back there on end
  const tournamentIdRef = useRef<string | null>(null);

  // Computed values
  const gameId = params.gameId;
  const myColor = gameData?.white_player_id === profile?.id ? "w" : "b";
  const isMyTurn = gameData?.current_turn === myColor;
  const isFlipped = myColor === "b";
  const boardTheme = gameSettings?.boardTheme || "purple";
  const pieceStyle = gameSettings?.pieceStyle || "unity";

  // Get board array from chess.js
  const getBoardArray = useCallback((chessInstance: Chess): (ChessPiece | null)[][] => {
    const boardArray: (ChessPiece | null)[][] = [];
    const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

    ranks.forEach((rank) => {
      const row: (ChessPiece | null)[] = [];
      files.forEach((file) => {
        const square = (file + rank) as Square;
        const piece = chessInstance.get(square);
        row.push(piece || null);
      });
      boardArray.push(row);
    });

    return boardArray;
  }, []);

  // Format time for display (MM:SS)
  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Load game data from database
  const loadGame = useCallback(async () => {
    if (!gameId) return;

    console.log("[OnlineGame] loadGame called for gameId:", gameId);

    try {
      // Fetch game data and all moves in parallel for consistency
      const [gameResult, movesResult] = await Promise.all([
        supabase
          .from("games")
          .select(`
            *,
            white_player:profiles!games_white_player_id_fkey(username, elo_rating, avatar_index),
            black_player:profiles!games_black_player_id_fkey(username, elo_rating, avatar_index)
          `)
          .eq("id", gameId)
          .single(),
        supabase
          .from("game_moves")
          .select("*")
          .eq("game_id", gameId)
          .order("move_number", { ascending: true })
      ]);

      if (gameResult.error) throw gameResult.error;

      const gameData = gameResult.data as GameData;
      const moves = movesResult.data || [];

      setGameData(gameData);

      // CRITICAL: Reconstruct game state from moves for reliability
      // This ensures both players see exactly the same position
      chess.reset(); // Start from initial position

      // Replay all moves to reconstruct the game state
      for (const move of moves) {
        try {
          // Use UCI format (e2e4) to replay moves
          const from = move.uci.substring(0, 2);
          const to = move.uci.substring(2, 4);
          const promotion = move.uci.length > 4 ? move.uci[4] : undefined;

          chess.move({ from, to, promotion } as any);
        } catch (e) {
          console.error("[OnlineGame] Failed to replay move:", move.san, e);
        }
      }

      const reconstructedFen = chess.fen();
      console.log("[OnlineGame] Reconstructed FEN from", moves.length, "moves:", reconstructedFen);
      console.log("[OnlineGame] Database FEN:", gameData.current_fen);

      // If there's a mismatch, log it (the reconstructed state is authoritative)
      if (gameData.current_fen && gameData.current_fen !== reconstructedFen && moves.length > 0) {
        console.warn("[OnlineGame] FEN mismatch! Using reconstructed state from moves.");
        // Update the database with the correct FEN
        await supabase
          .from("games")
          .update({
            current_fen: reconstructedFen,
            current_turn: chess.turn()
          })
          .eq("id", gameId);
      }

      // Update the chessRef to match current chess state
      chessRef.current = chess;

      setBoard(getBoardArray(chess));
      console.log("[OnlineGame] Chess loaded, turn:", chess.turn(), "move_count:", moves.length);

      // Set clocks from database
      setWhiteTime(gameData.white_time_remaining || gameData.time_control_seconds);
      setBlackTime(gameData.black_time_remaining || gameData.time_control_seconds);

      setIsLoading(false);
      playGameStart();
    } catch (err) {
      console.error("[OnlineGame] Error loading game:", err);
      setError("Failed to load game");
      setIsLoading(false);
    }
  }, [gameId, chess, getBoardArray, playGameStart]);

  // Subscribe to game updates
  const subscribeToGame = useCallback(() => {
    if (!gameId) return;

    // Clean up existing subscription first
    if (subscriptionRef.current) {
      console.log("[OnlineGame] Cleaning up existing subscription");
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    console.log("[OnlineGame] Subscribing to game:", gameId);

    const channel = supabase
      .channel(`game:${gameId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: profile?.id || 'anonymous' },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          console.log("[OnlineGame] Game updated:", payload.new);
          const newData = payload.new as GameData;

          setGameData((prev) => prev ? { ...prev, ...newData } : null);

          // Update chess board if FEN changed
          if (newData.current_fen) {
            chess.load(newData.current_fen);
            chessRef.current = chess; // Keep ref in sync
            setBoard(getBoardArray(chess));

            // Play move sound for opponent's moves
            if (profile?.id) {
              const isMyTurn = (newData.current_turn === 'w' && myColor === 'w') ||
                               (newData.current_turn === 'b' && myColor === 'b');
              // If it's now my turn, opponent just moved
              if (isMyTurn) {
                playMove();
              }
            }
          }

          // Update clocks
          if (newData.white_time_remaining !== undefined) {
            setWhiteTime(newData.white_time_remaining);
          }
          if (newData.black_time_remaining !== undefined) {
            setBlackTime(newData.black_time_remaining);
          }

          // Handle game end - navigate to game-result screen with VictoryCelebration
          if (newData.status === "completed" || newData.status === "abandoned") {
            // Stop clock
            if (clockIntervalRef.current) {
              clearInterval(clockIntervalRef.current);
              clockIntervalRef.current = null;
            }

            const isWinner = newData.winner_id === profile?.id;
            const isDraw = newData.result === "draw";

            // Play sound
            if (isDraw) playDraw();
            else if (isWinner) playWin();
            else playLose();

            // Navigate after short delay for sound to play
            setTimeout(() => {
              navigateAfterGameEnd();
            }, 300);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_moves",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          console.log("[OnlineGame] New move received:", payload.new);
          const move = payload.new as GameMove;

          // Only process opponent's moves (we already updated for our own)
          if (move.player_id !== profile?.id) {
            console.log("[OnlineGame] Opponent move:", move.san);

            // Update board from the move's FEN
            chess.load(move.fen_after);
            chessRef.current = chess; // Keep ref in sync
            setBoard(getBoardArray(chess));
            setLastMove({
              from: move.uci.substring(0, 2) as Square,
              to: move.uci.substring(2, 4) as Square
            });
            playMove();

            // If game is over from opponent's move, handle completion
            if (chess.isGameOver()) {
              console.log("[OnlineGame] Game over from opponent move, isCheckmate:", chess.isCheckmate());

              const isCheckmate = chess.isCheckmate();
              const opponentColor = myColor === "w" ? "b" : "w";

              // Play end game sound immediately
              if (isCheckmate) {
                playLose(); // Opponent checkmated us
              } else {
                playDraw();
              }

              // Fallback: if game still active after 2s, complete it ourselves
              setTimeout(async () => {
                // Use ref to check current status (not stale state)
                if (gameStatusRef.current === "active") {
                  console.log("[OnlineGame] Game still active after opponent checkmate, completing...");

                  try {
                    const { error } = await supabase.functions.invoke("game-complete", {
                      body: {
                        gameId,
                        result: isCheckmate ? (opponentColor === "w" ? "white_wins" : "black_wins") : "draw",
                        winnerId: isCheckmate ? move.player_id : null,
                        endReason: isCheckmate ? "checkmate" : "draw",
                        finalFen: move.fen_after,
                      },
                    });

                    if (error) {
                      console.error("[OnlineGame] Fallback game-complete error:", error);
                      // Force navigate even on error
                      navigateAfterGameEnd();
                    }
                  } catch (err) {
                    console.error("[OnlineGame] Fallback game-complete exception:", err);
                    navigateAfterGameEnd();
                  }
                }
              }, 2000);
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log("[OnlineGame] Subscription status:", status, err ? `Error: ${err.message}` : '');
        if (status === 'CHANNEL_ERROR') {
          console.error("[OnlineGame] Channel error, will retry...");
          // Retry subscription after a delay
          setTimeout(() => {
            if (subscriptionRef.current) {
              supabase.removeChannel(subscriptionRef.current);
              subscriptionRef.current = null;
            }
            subscribeToGame();
          }, 2000);
        }
      });

    subscriptionRef.current = channel;
  }, [gameId, chess, getBoardArray, profile?.id, myColor, playMove, playDraw, playWin, playLose, router, navigateAfterGameEnd]);

  // Polling fallback for sync (in case realtime fails)
  useEffect(() => {
    if (!gameId || !gameData || gameData.status !== "active") return;

    const pollInterval = setInterval(async () => {
      // Don't poll while submitting a move to avoid race conditions
      if (isSubmittingMoveRef.current) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from("games")
          .select("current_fen, current_turn, white_time_remaining, black_time_remaining, status, result, winner_id, move_count")
          .eq("id", gameId)
          .single();

        if (error || !data) return;

        // Only update if there's a change (to avoid unnecessary re-renders)
        if (data.current_fen !== gameData.current_fen || data.move_count !== gameData.move_count) {
          console.log("[OnlineGame] Polling detected change, syncing...");

          // Update game data
          setGameData((prev) => prev ? { ...prev, ...data } : null);

          // Update board
          chess.load(data.current_fen);
          chessRef.current = chess; // Keep ref in sync
          setBoard(getBoardArray(chess));

          // Update clocks
          setWhiteTime(data.white_time_remaining);
          setBlackTime(data.black_time_remaining);

          // Play sound if it's now my turn (opponent just moved)
          const isNowMyTurn = (data.current_turn === 'w' && myColor === 'w') ||
                             (data.current_turn === 'b' && myColor === 'b');
          if (isNowMyTurn && data.move_count > gameData.move_count) {
            playMove();
          }

          // Handle game end - navigate to game-result screen with VictoryCelebration
          if (data.status === "completed" || data.status === "abandoned") {
            clearInterval(pollInterval);
            if (clockIntervalRef.current) {
              clearInterval(clockIntervalRef.current);
              clockIntervalRef.current = null;
            }

            const isWinner = data.winner_id === profile?.id;
            const isDraw = data.result === "draw";

            // Play sound
            if (isDraw) playDraw();
            else if (isWinner) playWin();
            else playLose();

            // Navigate back
            navigateAfterGameEnd();
          }
        }
      } catch (err) {
        console.error("[OnlineGame] Polling error:", err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [gameId, gameData?.current_fen, gameData?.move_count, gameData?.status, myColor, chess, getBoardArray, profile?.id, playMove, playDraw, playWin, playLose, navigateAfterGameEnd]);

  // Clock management
  useEffect(() => {
    if (!gameData || gameData.status !== "active") return;

    // Clear existing interval
    if (clockIntervalRef.current) {
      clearInterval(clockIntervalRef.current);
    }

    // Start clock for current player
    clockIntervalRef.current = setInterval(() => {
      if (gameData.current_turn === "w") {
        setWhiteTime((prev) => {
          const newTime = prev - 0.1;
          if (newTime <= 10 && newTime > 9.9) playLowTime();
          if (newTime <= 0) {
            handleTimeout("w");
            return 0;
          }
          return newTime;
        });
      } else {
        setBlackTime((prev) => {
          const newTime = prev - 0.1;
          if (newTime <= 10 && newTime > 9.9) playLowTime();
          if (newTime <= 0) {
            handleTimeout("b");
            return 0;
          }
          return newTime;
        });
      }
    }, 100);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
      }
    };
  }, [gameData?.current_turn, gameData?.status, playLowTime]);

  // Handle timeout
  const handleTimeout = useCallback(async (losingColor: "w" | "b") => {
    if (!gameId || !gameData) return;

    const winnerId = losingColor === "w" ? gameData.black_player_id : gameData.white_player_id;
    const result = losingColor === "w" ? "black_wins" : "white_wins";

    try {
      await supabase.functions.invoke("game-complete", {
        body: {
          gameId,
          result,
          winnerId,
          endReason: "timeout",
          finalFen: chess.fen(),
        },
      });
    } catch (err) {
      console.error("[OnlineGame] Timeout error:", err);
    }
  }, [gameId, gameData, chess]);

  // Navigate after game ends — tournament games go back to tournament, others go to game-result
  const navigateAfterGameEnd = useCallback(() => {
    if (tournamentIdRef.current) {
      router.replace(`/tournament/${tournamentIdRef.current}`);
    } else {
      router.replace({
        pathname: "/game-result",
        params: {
          gameId: gameId as string,
          playerId: profile?.id || "",
          source: params.source || "play-now", // Default to play-now if not specified
        },
      });
    }
  }, [gameId, profile?.id, router, params.source]);

  // Handle square press

  // Execute a move
  const executeMove = useCallback(
    async (from: Square, to: Square, promotion?: string) => {
      if (!gameId || !profile?.id || !gameData) return;

      // Don't allow moves if game is not active
      if (gameData.status !== "active") {
        console.log("[OnlineGame] Cannot submit move - game is not active:", gameData.status);
        return;
      }

      setIsSubmittingMove(true);
      isSubmittingMoveRef.current = true;
      setSelectedSquare(null);
      setPossibleMoves([]);

      try {
        // Ensure chess object is synced with the latest game state before making move
        const expectedFen = gameData.current_fen || INITIAL_FEN;
        if (chess.fen() !== expectedFen) {
          console.log("[OnlineGame] Chess state out of sync, reloading from server FEN");
          chess.load(expectedFen);
        }

        // Make move locally first
        const moveResult = chess.move({
          from,
          to,
          promotion: promotion as "q" | "r" | "b" | "n" | undefined,
        });

        if (!moveResult) {
          playIllegalMove();
          setIsSubmittingMove(false);
          isSubmittingMoveRef.current = false;
          return;
        }

        // Capture game state BEFORE database operations (to avoid race condition with realtime subscription)
        const isGameOverNow = chess.isGameOver();
        const isCheckmateNow = chess.isCheckmate();
        const isDrawNow = chess.isDraw();
        const isStalemateNow = chess.isStalemate();
        const isThreefoldNow = chess.isThreefoldRepetition();
        const isInsufficientNow = chess.isInsufficientMaterial();
        const fenAfterMove = chess.fen();

        console.log("[OnlineGame] Move:", moveResult.san, isGameOverNow ? "(game over)" : "");

        playMove();
        chessRef.current = chess; // Keep ref in sync after move
        setBoard(getBoardArray(chess));
        setLastMove({ from, to });

        // Calculate new time with increment
        const increment = gameData.increment_seconds || 0;
        const currentTime = myColor === "w" ? whiteTime : blackTime;
        const newTimeRemaining = currentTime + increment;

        // Update clock locally
        if (myColor === "w") {
          setWhiteTime(newTimeRemaining);
        } else {
          setBlackTime(newTimeRemaining);
        }

        // Submit move to database
        const fenBefore = expectedFen; // Use the synced FEN
        const fenAfter = fenAfterMove; // Use captured FEN to avoid race condition
        const uci = from + to + (promotion || "");

        // Insert move record
        // Calculate time spent on this move (previous time - new time remaining)
        const previousTime = myColor === "w" ? gameData.white_time_remaining : gameData.black_time_remaining;
        const timeSpentMs = Math.round(Math.max(0, (previousTime - newTimeRemaining) * 1000));
        const timeRemainingMs = Math.round(newTimeRemaining * 1000);

        // Insert move to database
        const { error: moveError } = await supabase.from("game_moves").insert({
          game_id: gameId,
          move_number: gameData.move_count + 1,
          player_id: profile.id,
          san: moveResult.san,
          uci,
          fen_before: fenBefore,
          fen_after: fenAfter,
          time_spent_ms: timeSpentMs,
          time_remaining_ms: timeRemainingMs,
          is_capture: moveResult.captured !== undefined,
          is_check: moveResult.san.includes("+") || moveResult.san.includes("#"),
          is_checkmate: isCheckmateNow,
          is_castling: moveResult.san.includes("O-O"),
          is_en_passant: moveResult.flags.includes("e"),
          is_promotion: moveResult.promotion !== undefined,
          promotion_piece: moveResult.promotion || null,
        } as never);

        if (moveError) throw moveError;
        console.log("[OnlineGame] Move inserted to DB");

        // Update game state
        const gameUpdate: any = {
          current_fen: fenAfter,
          move_count: gameData.move_count + 1,
          current_turn: chess.turn(),
          last_move_at: new Date().toISOString(),
        };

        // Update time for the player who just moved (round to integer for database)
        if (myColor === "w") {
          gameUpdate.white_time_remaining = Math.round(newTimeRemaining);
        } else {
          gameUpdate.black_time_remaining = Math.round(newTimeRemaining);
        }

        // Update game record
        const { error: updateError } = await supabase
          .from("games")
          .update(gameUpdate as never)
          .eq("id", gameId);

        if (updateError) throw updateError;
        console.log("[OnlineGame] Game state updated in DB");

        // Update local game data
        setGameData((prev) => (prev ? { ...prev, ...gameUpdate } : null));

        // Check for game end using CAPTURED state (before DB operations modified chess object)
        console.log("[OnlineGame] Checking game over:", isGameOverNow, "FEN:", fenAfter);
        if (isGameOverNow) {
          // Determine end reason using captured state
          let endReason = "checkmate";
          if (isDrawNow) {
            if (isStalemateNow) endReason = "stalemate";
            else if (isThreefoldNow) endReason = "threefold_repetition";
            else if (isInsufficientNow) endReason = "insufficient_material";
            else endReason = "fifty_move_rule";
          }

          // Call edge function to complete game with retry logic
          const gameResult = isCheckmateNow ? (myColor === "w" ? "white_wins" : "black_wins") : "draw";
          console.log("[OnlineGame] Completing game:", gameResult, endReason);

          const completeGame = async (attempt: number = 1): Promise<boolean> => {
            try {
              const { error: completeError } = await supabase.functions.invoke("game-complete", {
                body: {
                  gameId,
                  result: gameResult,
                  winnerId: isCheckmateNow ? profile.id : null,
                  endReason,
                  finalFen: fenAfter,
                },
              });

              if (completeError) {
                console.error(`[OnlineGame] game-complete error (attempt ${attempt}):`, completeError.message);
                if (attempt < 3) {
                  console.log(`[OnlineGame] Retrying game-complete in 2s...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  return completeGame(attempt + 1);
                }
                return false;
              }

              console.log("[OnlineGame] Game completed successfully");
              return true;
            } catch (err) {
              console.error(`[OnlineGame] game-complete exception (attempt ${attempt}):`, err);
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return completeGame(attempt + 1);
              }
              return false;
            }
          };

          const success = await completeGame();

          if (!success) {
            console.error("[OnlineGame] Failed to complete game after 3 attempts, forcing navigation");
            // Force navigate to result even if game-complete failed
            // The game state is already in the database, settlement can happen later
            setTimeout(() => {
              navigateAfterGameEnd();
            }, 500);
          }
        } else {
          console.log("[OnlineGame] Game is not over yet");
        }
      } catch (err: any) {
        console.error("[OnlineGame] Move error:", err?.message || err);
        chess.undo();
        setBoard(getBoardArray(chess));
        Alert.alert("Error", "Failed to submit move");
      } finally {
        setIsSubmittingMove(false);
        isSubmittingMoveRef.current = false;
      }
    },
    [gameId, profile?.id, gameData, chess, myColor, whiteTime, blackTime, getBoardArray, playMove, playIllegalMove, navigateAfterGameEnd]
  );

  // Square press handler
  const handleSquarePressImpl = useCallback(
    (square: Square) => {
      if (!isMyTurn || isSubmittingMove || gameData?.status !== "active") return;

      const piece = chess.get(square);

      if (selectedSquare) {
        const move = possibleMoves.find((m) => m === square);
        if (move) {
          const movingPiece = chess.get(selectedSquare);
          const isPromotion =
            movingPiece?.type === "p" &&
            ((movingPiece.color === "w" && square[1] === "8") ||
              (movingPiece.color === "b" && square[1] === "1"));

          if (isPromotion) {
            setPendingPromotion({ from: selectedSquare, to: square });
          } else {
            executeMove(selectedSquare, square);
          }
        } else if (piece && piece.color === myColor) {
          playPiecePickup();
          setSelectedSquare(square);
          const moves = chess.moves({ square, verbose: true });
          setPossibleMoves(moves.map((m) => m.to as Square));
        } else {
          setSelectedSquare(null);
          setPossibleMoves([]);
        }
      } else if (piece && piece.color === myColor) {
        playPiecePickup();
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
        setPossibleMoves(moves.map((m) => m.to as Square));
      }
    },
    [chess, selectedSquare, possibleMoves, isMyTurn, isSubmittingMove, gameData?.status, myColor, playPiecePickup, executeMove]
  );

  // Handle promotion selection
  const handlePromotion = useCallback(
    (piece: ChessPieceSymbol) => {
      if (pendingPromotion && (piece === "q" || piece === "r" || piece === "b" || piece === "n")) {
        executeMove(pendingPromotion.from, pendingPromotion.to, piece);
        setPendingPromotion(null);
      }
    },
    [pendingPromotion, executeMove]
  );

  // Handle resign
  const handleResign = useCallback(() => {
    Alert.alert("Resign", "Are you sure you want to resign?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Resign",
        style: "destructive",
        onPress: async () => {
          if (!gameId || !gameData || !profile?.id) return;

          const winnerId = myColor === "w" ? gameData.black_player_id : gameData.white_player_id;
          const result = myColor === "w" ? "black_wins" : "white_wins";

          try {
            console.log("[OnlineGame] Calling game-complete for resign:", { gameId, result, winnerId });

            const response = await supabase.functions.invoke("game-complete", {
              body: {
                gameId,
                result,
                winnerId,
                endReason: "resign",
                finalFen: chess.fen(),
              },
            });

            console.log("[OnlineGame] Resign response:", JSON.stringify(response));

            if (response.error) {
              // Try to get more details from the error
              const errorDetails = await response.error.context?.json?.() || response.data;
              console.error("[OnlineGame] Resign error:", response.error);
              console.error("[OnlineGame] Resign error details:", JSON.stringify(errorDetails));
              Alert.alert("Error", errorDetails?.error || response.data?.error || "Failed to resign");
            } else {
              console.log("[OnlineGame] Resign successful");
            }
          } catch (err: any) {
            console.error("[OnlineGame] Error resigning:", err?.message || err);
            // Try to extract response body for more details
            if (err?.context?.json) {
              try {
                const body = await err.context.json();
                console.error("[OnlineGame] Resign error body:", JSON.stringify(body));
              } catch {}
            }
            Alert.alert("Error", "Failed to resign");
          }
        },
      },
    ]);
  }, [gameId, gameData, profile?.id, myColor, chess]);

  // Keep refs in sync with state (for cleanup access)
  useEffect(() => {
    whiteTimeRef.current = whiteTime;
  }, [whiteTime]);

  useEffect(() => {
    blackTimeRef.current = blackTime;
  }, [blackTime]);

  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);

  useEffect(() => {
    if (gameData?.status) {
      gameStatusRef.current = gameData.status;
    }
  }, [gameData?.status]);

  // Save game state to database when leaving (to persist state for rejoin)
  const saveGameState = useCallback(async () => {
    const gId = gameIdRef.current;
    const status = gameStatusRef.current;

    // Only save if game is active
    if (!gId || status !== "active") {
      console.log("[OnlineGame] Not saving - game not active:", { gId, status });
      return;
    }

    const wTime = Math.floor(whiteTimeRef.current);
    const bTime = Math.floor(blackTimeRef.current);
    const currentFen = chessRef.current?.fen() || null;
    const currentTurn = chessRef.current?.turn() || null;

    console.log("[OnlineGame] Saving game state before leaving:", {
      wTime,
      bTime,
      fen: currentFen?.substring(0, 30),
      turn: currentTurn
    });

    try {
      await supabase
        .from("games")
        .update({
          white_time_remaining: wTime,
          black_time_remaining: bTime,
          current_fen: currentFen,
          current_turn: currentTurn,
          last_move_at: new Date().toISOString(),
        })
        .eq("id", gId);
      console.log("[OnlineGame] Game state saved successfully");
    } catch (err) {
      console.error("[OnlineGame] Failed to save game state:", err);
    }
  }, []);

  // Initialize - load game first
  useEffect(() => {
    console.log("[OnlineGame] Component mounted, loading game:", gameId);
    loadGame();

    return () => {
      console.log("[OnlineGame] Component unmounting, cleaning up");
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
      }
      // Save game state before unmounting
      saveGameState();
      // Cancel any partial on-chain escrow (creator locked but joiner didn't)
      cancelPartialOnChainEscrow();
    };
  }, [loadGame, saveGameState, cancelPartialOnChainEscrow]);

  // Check if this game is part of a tournament (for end-of-game navigation)
  useEffect(() => {
    if (!gameId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("tournament_matches")
          .select("tournament_id")
          .eq("game_id", gameId)
          .single();
        if (data?.tournament_id) {
          tournamentIdRef.current = data.tournament_id;
          console.log("[OnlineGame] Tournament game detected, tournament:", data.tournament_id);
        }
      } catch {
        // Not a tournament game — that's fine
      }
    })();
  }, [gameId]);

  // Subscribe after game is loaded (gameData is set)
  useEffect(() => {
    if (!gameData) return;

    subscribeToGame();

    return () => {
      if (subscriptionRef.current) {
        console.log("[OnlineGame] Cleanup: removing channel");
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [gameData?.id, subscribeToGame]);

  // ========================================================================
  // Background on-chain escrow locking
  // Each player's device independently locks their portion while playing.
  // White player creates the escrow, black player joins after it's created.
  //
  // EXPLOIT PROTECTIONS:
  // 1. DB balances are locked BEFORE game starts (in playNowStore._createGame)
  //    so even if on-chain escrow never completes, DB settlement always pays winner.
  // 2. If game ends with partial on-chain escrow (creator locked but joiner didn't),
  //    white player's device cancels the on-chain escrow to refund their USDC.
  // 3. Escrow attempts abort immediately if game is no longer active.
  // 4. Black player polling stops as soon as game ends.
  // 5. On unmount, any partial on-chain escrow is cleaned up.
  // ========================================================================
  const escrowAttemptedRef = useRef(false);
  const onChainGameIdRef = useRef<string | null>(null);    // Track created on-chain escrow ID
  const escrowFullyJoinedRef = useRef(false);               // True when both players locked on-chain
  const blackPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper: cancel a partial on-chain escrow (only creator locked, joiner never joined)
  const cancelPartialOnChainEscrow = useCallback(async () => {
    const onChainId = onChainGameIdRef.current;
    if (!onChainId || escrowFullyJoinedRef.current) return; // Nothing to cancel

    const isWhite = gameData?.white_player_id === profile?.id;
    if (!isWhite) return; // Only the creator (white) can cancel

    try {
      const sdk = getRelaySDK();
      if (!sdk.isInitialized()) return;

      // Check on-chain status: 1 = Created (only creator locked), 2 = Active (both locked)
      const onChainGame = await sdk.getOnChainGame(onChainId);
      if (!onChainGame || onChainGame.status !== 1) return; // Only cancel if still in Created state

      console.log("[OnlineGame] Canceling partial on-chain escrow:", onChainId);
      const cancelResult = await sdk.cancelGame(onChainId);
      if (cancelResult.success) {
        console.log("[OnlineGame] Partial escrow canceled, creator refunded:", cancelResult.txHash);
        // Mark escrow as canceled in DB
        if (gameData?.id) {
          supabase.from("game_escrows").update({ on_chain_escrow_state: "canceled" }).eq("game_id", gameData.id);
        }
      } else {
        console.warn("[OnlineGame] Failed to cancel partial escrow:", cancelResult.error);
      }
    } catch (err) {
      console.warn("[OnlineGame] Escrow cleanup error (non-fatal):", err);
    }
  }, [gameData?.white_player_id, profile?.id]);

  // Cleanup partial on-chain escrow when game ends
  useEffect(() => {
    if (!gameData) return;
    if (gameData.status === "completed" || gameData.status === "abandoned") {
      // Stop black player polling immediately
      if (blackPollIntervalRef.current) {
        clearInterval(blackPollIntervalRef.current);
        blackPollIntervalRef.current = null;
      }
      // Cancel any partial on-chain escrow (creator locked but joiner didn't)
      cancelPartialOnChainEscrow();
    }
  }, [gameData?.status, cancelPartialOnChainEscrow]);

  useEffect(() => {
    if (!gameData || !profile?.id) return;
    if (escrowAttemptedRef.current) return; // Only attempt once
    if (!gameData.wager_tct || gameData.wager_tct <= 0) return; // Free game
    if (gameData.status !== "active") return; // Game already ended

    // Check if escrow is already locked on-chain
    const checkAndLockEscrow = async () => {
      try {
        // Re-check game status before proceeding (game may have ended quickly)
        const { data: freshGame } = await supabase
          .from("games")
          .select("on_chain_game_id, status")
          .eq("id", gameData.id)
          .single();

        if (freshGame?.status !== "active") {
          console.log("[OnlineGame] Game no longer active, skipping escrow");
          return;
        }

        if (freshGame?.on_chain_game_id) {
          onChainGameIdRef.current = freshGame.on_chain_game_id;
          // On-chain escrow already exists
          const isWhite = gameData.white_player_id === profile.id;

          if (!isWhite) {
            // Black player: check if we need to join
            const sdk = getRelaySDK();
            if (!sdk.isInitialized()) return;

            const onChainGame = await sdk.getOnChainGame(freshGame.on_chain_game_id);
            // Status 1 = Created (waiting for player 2), Status 2 = Active (both joined)
            if (onChainGame && onChainGame.status === 1) {
              console.log("[OnlineGame] Joining on-chain escrow in background:", freshGame.on_chain_game_id);
              const joinResult = await sdk.joinGameWithPermit(freshGame.on_chain_game_id);
              if (joinResult.success) {
                console.log("[OnlineGame] Joined on-chain escrow:", joinResult.txHash);
                escrowFullyJoinedRef.current = true;
                await supabase.from("game_escrows").update({ on_chain_escrow_state: "both_locked" }).eq("game_id", gameData.id);
              } else {
                console.warn("[OnlineGame] Failed to join escrow (non-fatal):", joinResult.error);
              }
            } else if (onChainGame && onChainGame.status >= 2) {
              escrowFullyJoinedRef.current = true;
              console.log("[OnlineGame] On-chain escrow already fully active");
            }
          }
          // White player: escrow already created, nothing to do
          return;
        }

        // No on-chain escrow yet — only white player creates it
        const isWhite = gameData.white_player_id === profile.id;
        if (!isWhite) {
          // Black player: poll for on_chain_game_id to appear, then join
          console.log("[OnlineGame] Black player: waiting for on-chain escrow to be created...");
          const pollForEscrow = setInterval(async () => {
            try {
              const { data: g } = await supabase
                .from("games")
                .select("on_chain_game_id, status")
                .eq("id", gameData.id)
                .single();

              // Stop polling if game ended
              if (g?.status !== "active") {
                clearInterval(pollForEscrow);
                blackPollIntervalRef.current = null;
                return;
              }

              if (g?.on_chain_game_id) {
                clearInterval(pollForEscrow);
                blackPollIntervalRef.current = null;
                onChainGameIdRef.current = g.on_chain_game_id;

                const sdk = getRelaySDK();
                if (!sdk.isInitialized()) return;

                // Re-check game status right before joining (game could have ended during poll)
                const { data: statusCheck } = await supabase
                  .from("games")
                  .select("status")
                  .eq("id", gameData.id)
                  .single();
                if (statusCheck?.status !== "active") {
                  console.log("[OnlineGame] Game ended before join, skipping");
                  return;
                }

                console.log("[OnlineGame] Black player: joining on-chain escrow:", g.on_chain_game_id);
                const joinResult = await sdk.joinGameWithPermit(g.on_chain_game_id);
                if (joinResult.success) {
                  console.log("[OnlineGame] Black player joined escrow:", joinResult.txHash);
                  escrowFullyJoinedRef.current = true;
                  await supabase.from("game_escrows").update({ on_chain_escrow_state: "both_locked" }).eq("game_id", gameData.id);
                } else {
                  console.warn("[OnlineGame] Black player failed to join escrow (non-fatal):", joinResult.error);
                }
              }
            } catch (err) {
              console.warn("[OnlineGame] Escrow poll error (non-fatal):", err);
            }
          }, 3000); // Poll every 3s

          blackPollIntervalRef.current = pollForEscrow;

          // Stop polling after 2 minutes
          setTimeout(() => {
            if (blackPollIntervalRef.current === pollForEscrow) {
              clearInterval(pollForEscrow);
              blackPollIntervalRef.current = null;
            }
          }, 120000);
          return;
        }

        // White player: create the on-chain escrow
        escrowAttemptedRef.current = true;
        const sdk = getRelaySDK();
        if (!sdk.isInitialized()) {
          console.warn("[OnlineGame] Relay SDK not initialized, skipping escrow");
          return;
        }

        // Final check: is game still active right before committing on-chain funds?
        const { data: preCreateCheck } = await supabase
          .from("games")
          .select("status")
          .eq("id", gameData.id)
          .single();
        if (preCreateCheck?.status !== "active") {
          console.log("[OnlineGame] Game ended before escrow creation, skipping");
          return;
        }

        const wagerUsdc = tctToUsdc(gameData.wager_tct).toFixed(6);
        console.log("[OnlineGame] White player: creating on-chain escrow for", gameData.wager_tct, "TCT (", wagerUsdc, "USDC)");

        const createResult = await sdk.approveAndCreateGame(gameData.id, wagerUsdc, 0);

        if (!createResult.success) {
          console.warn("[OnlineGame] Failed to create on-chain escrow (non-fatal):", createResult.error);
          return;
        }

        const onChainGameId = createResult.gameIdBytes || createResult.gameId;
        onChainGameIdRef.current = onChainGameId;
        console.log("[OnlineGame] On-chain escrow created:", onChainGameId);

        // Check if game is still active before writing to DB (game may have ended during escrow creation)
        const { data: postCreateCheck } = await supabase
          .from("games")
          .select("status")
          .eq("id", gameData.id)
          .single();

        if (postCreateCheck?.status !== "active") {
          // Game ended while we were creating escrow — cancel immediately to refund
          console.log("[OnlineGame] Game ended during escrow creation, canceling...");
          try {
            const cancelResult = await sdk.cancelGame(onChainGameId);
            console.log("[OnlineGame] Escrow canceled after game end:", cancelResult.success);
          } catch (cancelErr) {
            console.warn("[OnlineGame] Failed to cancel escrow after game end:", cancelErr);
          }
          return;
        }

        // Write on_chain_game_id to DB so black player's device can see it
        await supabase
          .from("games")
          .update({ on_chain_game_id: onChainGameId })
          .eq("id", gameData.id);

        await supabase
          .from("game_escrows")
          .update({
            on_chain_game_id: onChainGameId,
            on_chain_escrow_state: "creator_locked",
          })
          .eq("game_id", gameData.id);

        console.log("[OnlineGame] On-chain escrow ID saved to DB (state: creator_locked)");
      } catch (err) {
        console.warn("[OnlineGame] Background escrow error (non-fatal):", err);
      }
    };

    // Small delay so the game UI renders first
    const timer = setTimeout(checkAndLockEscrow, 2000);
    return () => {
      clearTimeout(timer);
      // Cleanup polling on unmount
      if (blackPollIntervalRef.current) {
        clearInterval(blackPollIntervalRef.current);
        blackPollIntervalRef.current = null;
      }
    };
  }, [gameData?.id, gameData?.wager_tct, gameData?.status, profile?.id]);

  // Render loading state
  if (isLoading) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Loading game...</Text>
        </View>
      </LinearGradient>
    );
  }

  // Render error state
  if (error || !gameData) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error || "Game not found"}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const whitePlayer = gameData.white_player;
  const blackPlayer = gameData.black_player;
  const topPlayer = isFlipped ? whitePlayer : blackPlayer;
  const bottomPlayer = isFlipped ? blackPlayer : whitePlayer;
  const topTime = isFlipped ? whiteTime : blackTime;
  const bottomTime = isFlipped ? blackTime : whiteTime;
  const topIsActive = isFlipped ? gameData.current_turn === "w" : gameData.current_turn === "b";
  const bottomIsActive = isFlipped ? gameData.current_turn === "b" : gameData.current_turn === "w";
  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      {/* Close button - saves game state then navigates to home */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={async () => {
          // Save game state before leaving so opponent and this player can rejoin
          await saveGameState();
          router.replace("/");
        }}
      >
        <X size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Stake display at top */}
      <View style={styles.stakeHeader}>
        <Text style={styles.stakeLabel}>Prize Pool</Text>
        <Text style={styles.stakeAmount}>
          {(Number(gameData.wager_tct) * 2 * 0.9).toLocaleString()} TCT
        </Text>
      </View>

      {/* Top player info (opponent) */}
      <View style={styles.playerSection}>
        <View style={styles.playerInfo}>
          <View style={styles.avatarContainer}>
            <Image
              source={getAvatarSource(topPlayer?.avatar_index ?? ROBOT_AVATAR_INDEX)}
              style={styles.avatarImage}
            />
            <Text style={styles.countryFlag}>{getCountryFlag(topPlayer?.country)}</Text>
          </View>
          <View style={styles.playerDetails}>
            <Text style={styles.playerName}>{topPlayer?.username || "Opponent"}</Text>
            <Text style={styles.playerRating}>⭐ {topPlayer?.elo_rating || 0}</Text>
          </View>
        </View>
        <View style={[styles.clock, topIsActive && styles.clockActive]}>
          <Clock size={16} color={topIsActive ? "#0F0F1E" : "#FFD700"} />
          <Text style={[styles.clockText, topIsActive && styles.clockTextActive]}>
            {formatTime(topTime)}
          </Text>
        </View>
      </View>

      {/* Chess board */}
      <View style={styles.boardContainer}>
        <View style={styles.boardWrapper}>
          {/* Rank labels */}
          <View style={styles.rankLabels}>
            {(isFlipped ? ["1","2","3","4","5","6","7","8"] : ["8","7","6","5","4","3","2","1"]).map((rank) => (
              <View key={rank} style={[styles.coordLabel, { height: SQUARE_SIZE }]}>
                <Text style={styles.coordText}>{rank}</Text>
              </View>
            ))}
          </View>
          <View style={styles.boardAndFiles}>
            <View style={styles.chessBoard}>
              {Array.from({ length: 8 }, (_, displayRow) => {
                const boardRow = isFlipped ? 7 - displayRow : displayRow;
                return (
                  <View key={displayRow} style={styles.row}>
                    {Array.from({ length: 8 }, (_, displayCol) => {
                      const boardCol = isFlipped ? 7 - displayCol : displayCol;
                      const piece = board[boardRow]?.[boardCol] || null;
                      const isLight = (boardRow + boardCol) % 2 === 0;
                      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
                      const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
                      const square = (files[boardCol] + ranks[boardRow]) as Square;
                      const isSelected = selectedSquare === square;
                      const isPossibleMove = possibleMoves.includes(square);
                      const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);
                      const isKingInCheck = chess.inCheck() && piece?.type === 'k' && piece?.color === chess.turn();
                      const themeColors = BOARD_THEMES[boardTheme];

                      return (
                        <TouchableOpacity
                          key={`${boardRow}-${boardCol}`}
                          style={[
                            styles.square,
                            { backgroundColor: isLight ? themeColors.light : themeColors.dark },
                            isLastMoveSquare && styles.lastMoveSquare,
                            isSelected && styles.selectedSquare,
                            isKingInCheck && styles.checkSquare,
                          ]}
                          onPress={() => handleSquarePressImpl(square)}
                        >
                          {isPossibleMove && (
                            <View style={[
                              styles.possibleMoveIndicator,
                              piece && styles.captureIndicator,
                            ]} />
                          )}
                          {piece && (
                            <View style={styles.pieceContainer}>
                              <ChessPieceComponent
                                type={piece.type}
                                color={piece.color}
                                size={SQUARE_SIZE - 4}
                                style={pieceStyle}
                              />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
            {/* File labels */}
            <View style={styles.fileLabels}>
              {(isFlipped ? ["h","g","f","e","d","c","b","a"] : ["a","b","c","d","e","f","g","h"]).map((file) => (
                <View key={file} style={[styles.coordLabel, { width: SQUARE_SIZE }]}>
                  <Text style={styles.coordText}>{file}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Turn indicator */}
        <View style={styles.turnIndicator}>
          <Text style={styles.turnText}>
            {gameData.status !== "active"
              ? "Game Over"
              : isMyTurn
              ? "Your turn"
              : "Opponent's turn"}
          </Text>
        </View>
      </View>

      {/* Bottom player info (you) */}
      <View style={styles.playerSection}>
        <View style={styles.playerInfo}>
          <View style={styles.avatarContainer}>
            <Image
              source={getAvatarSource(bottomPlayer?.avatar_index ?? 1)}
              style={[styles.avatarImage, styles.myAvatarImage]}
            />
            <Text style={styles.countryFlag}>{getCountryFlag(bottomPlayer?.country)}</Text>
          </View>
          <View style={styles.playerDetails}>
            <Text style={styles.playerName}>{bottomPlayer?.username || "You"}</Text>
            <Text style={styles.playerRating}>⭐ {bottomPlayer?.elo_rating || 0}</Text>
          </View>
        </View>
        <View style={[styles.clock, bottomIsActive && styles.clockActive]}>
          <Clock size={16} color={bottomIsActive ? "#0F0F1E" : "#FFD700"} />
          <Text style={[styles.clockText, bottomIsActive && styles.clockTextActive]}>
            {formatTime(bottomTime)}
          </Text>
        </View>
      </View>

      {/* Game actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.resignButton}
          onPress={handleResign}
          disabled={gameData.status !== "active"}
        >
          <Flag size={20} color="#EF4444" />
          <Text style={styles.resignText}>Resign</Text>
        </TouchableOpacity>
      </View>

      {/* Pawn promotion modal */}
      {pendingPromotion && (
        <PawnPromotionModal
          visible={true}
          color={myColor}
          pieceStyle={pieceStyle}
          onSelect={handlePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 16,
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: "#FFD700",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#0F0F1E",
    fontSize: 16,
    fontWeight: "700",
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  stakeHeader: {
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  stakeLabel: {
    color: "#A0A0A0",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  stakeAmount: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "700",
  },
  playerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarContainer: {
    position: "relative",
    width: 48,
    height: 48,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  myAvatarImage: {
    borderColor: "#FFD700",
  },
  countryFlag: {
    position: "absolute",
    bottom: -2,
    right: -2,
    fontSize: 16,
    backgroundColor: "#1A1A2E",
    borderRadius: 8,
    overflow: "hidden",
  },
  playerDetails: {
    gap: 2,
  },
  playerName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  playerRating: {
    color: "#A0A0A0",
    fontSize: 12,
  },
  clock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  clockActive: {
    backgroundColor: "#FFD700",
  },
  clockText: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  clockTextActive: {
    color: "#0F0F1E",
  },
  boardContainer: {
    alignItems: "center",
    marginVertical: 16,
  },
  boardWrapper: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "flex-start",
  },
  rankLabels: {
    justifyContent: "flex-start",
    marginRight: 2,
  },
  boardAndFiles: {
    alignItems: "center",
  },
  fileLabels: {
    flexDirection: "row",
    marginTop: 2,
  },
  coordLabel: {
    justifyContent: "center",
    alignItems: "center",
  },
  coordText: {
    color: "#A0A0A0",
    fontSize: 10,
    fontWeight: "600",
  },
  board: {
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  chessBoard: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedSquare: {
    backgroundColor: "rgba(255, 215, 0, 0.4)",
  },
  lastMoveSquare: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  checkSquare: {
    backgroundColor: "rgba(255, 0, 0, 0.4)",
  },
  pieceContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  possibleMoveIndicator: {
    position: "absolute",
    width: "30%",
    height: "30%",
    borderRadius: 100,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  captureIndicator: {
    width: "90%",
    height: "90%",
    backgroundColor: "transparent",
    borderWidth: 3,
    borderColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 100,
  },
  possibleMove: {
    position: "absolute",
    width: "30%",
    height: "30%",
    borderRadius: 100,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  possibleCapture: {
    width: "90%",
    height: "90%",
    backgroundColor: "transparent",
    borderWidth: 3,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  turnIndicator: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 20,
  },
  turnText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  resignButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  resignText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "600",
  },
});
