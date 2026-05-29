/**
 * House Challenge Game Screen
 *
 * Dedicated game screen for house challenges featuring:
 * - Dynamic AI difficulty based on challenge settings
 * - Win condition tracking (checkmate in X, with piece, sacrifice queen)
 * - Settlement with platform via database functions
 * - On-chain payout for winners
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Chess, Square, Move } from "chess.js";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Clock, Trophy, X, Crown, ArrowLeft } from "lucide-react-native";
import { useApp } from "@/contexts/AppContext";
import { ChessPieceComponent } from "@/components/ChessPieces";
import { PawnPromotionModal } from "@/components/PawnPromotionModal";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAuth } from "@/contexts/AuthContext";
import { useHouseChallengeStore } from "@/stores/houseChallengeStore";
import { chessAI, type Difficulty } from "@/lib/chessAI";
import {
  getDifficultyColor,
  getObjectiveDescription,
  type AIDifficultyLevel,
  type ChallengeObjectiveType,
} from "@/types/houseChallenge";
import ConfettiCannon from "react-native-confetti-cannon";

const { width } = Dimensions.get("window");
const BOARD_SIZE = Math.min(width - 40, 360);
const SQUARE_SIZE = BOARD_SIZE / 8;

type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
type PieceColor = "w" | "b";

interface ChessPiece {
  type: PieceSymbol;
  color: PieceColor;
}

const BOARD_THEMES = {
  purple: { light: "#FFFFFF", dark: "#9B7EC8" },
  classic: { light: "#FFFFFF", dark: "#000000" },
  eco: { light: "#8B4513", dark: "#6B8E23" },
  retro: { light: "#E8D7B8", dark: "#A67C52" },
};

function getBoardArray(chess: Chess): (ChessPiece | null)[][] {
  const boardArray: (ChessPiece | null)[][] = [];
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  ranks.forEach((rank) => {
    const row: (ChessPiece | null)[] = [];
    files.forEach((file) => {
      const square = (file + rank) as Square;
      const piece = chess.get(square);
      row.push(piece || null);
    });
    boardArray.push(row);
  });

  return boardArray;
}

export default function HouseChallengeGameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useApp();
  const { profile } = useAuth();
  const { game: gameSettings } = useSettingsStore();
  const {
    currentChallenge,
    currentAttempt,
    startChallenge,
    completeChallenge,
    processWinPayout,
    forfeitChallenge,
    loadChallenge,
    checkNeedsEntryPayment,
    isStarting,
    isCompleting,
  } = useHouseChallengeStore();

  const {
    playMove,
    playPiecePickup,
    playIllegalMove,
    playGameStart,
    playWin,
    playLose,
    playLowTime,
  } = useSoundAndHaptics();

  // Game state
  const [game] = useState<Chess>(new Chess());
  const [board, setBoard] = useState<(ChessPiece | null)[][]>(getBoardArray(game));
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);

  // Game progress
  const [gamePhase, setGamePhase] = useState<"loading" | "ready" | "playing" | "ended">("loading");
  const [playerTime, setPlayerTime] = useState<number>(300);
  const [opponentTime, setOpponentTime] = useState<number>(300);
  const [isPlayerTurn, setIsPlayerTurn] = useState<boolean>(true);
  const [moveCount, setMoveCount] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  // Objective tracking
  const [queenSacrificed, setQueenSacrificed] = useState<boolean>(false);
  const [checkmatingPiece, setCheckmatingPiece] = useState<PieceSymbol | null>(null);
  const [capturedByPlayer, setCapturedByPlayer] = useState<ChessPiece[]>([]);
  const [capturedByOpponent, setCapturedByOpponent] = useState<ChessPiece[]>([]);

  // Entry session tracking (multi-attempt per entry fee)
  const [entrySessionId, setEntrySessionId] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number>(1);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(0);
  const [attemptsPerEntry, setAttemptsPerEntry] = useState<number>(1);
  const [needsPayment, setNeedsPayment] = useState<boolean>(true);

  // Result state
  const [gameResult, setGameResult] = useState<{
    winner: "player" | "opponent" | "draw";
    reason: string;
    objectiveMet?: boolean;
    payoutAmount?: number;
    payoutStatus?: "pending" | "processing" | "completed" | "failed";
    payoutTxHash?: string;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // AI state
  const [isAiThinking, setIsAiThinking] = useState(false);
  const lowTimeWarningPlayed = useRef(false);
  const settlementPerformed = useRef(false);

  // Extract params
  const challengeId = params.challengeId as string;

  // Settings
  const boardTheme = gameSettings?.boardTheme || "purple";
  const pieceStyle = gameSettings?.pieceStyle || "unity";

  // Load challenge and check entry payment status
  useEffect(() => {
    const initGame = async () => {
      if (!challengeId || !profile?.id) return;

      // Load challenge details
      const challenge = await loadChallenge(challengeId);
      if (!challenge) {
        Alert.alert("Error", "Challenge not found", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return;
      }

      // Check if user has remaining attempts from a previous session
      const paymentStatus = await checkNeedsEntryPayment(challengeId);
      console.log("[HouseChallenge] Payment status:", paymentStatus);

      // Check if user is eligible to attempt at all
      if (!paymentStatus.canAttempt) {
        Alert.alert(
          "Cannot Play",
          paymentStatus.errorMessage || "You cannot attempt this challenge",
          [{ text: "OK", onPress: () => router.back() }]
        );
        return;
      }

      setNeedsPayment(paymentStatus.needsPayment);
      setAttemptsPerEntry(paymentStatus.attemptsPerEntry);

      if (!paymentStatus.needsPayment && paymentStatus.currentSessionId) {
        // User has remaining attempts in an existing session
        setEntrySessionId(paymentStatus.currentSessionId);
        setAttemptsRemaining(paymentStatus.remainingAttempts);
        setAttemptNumber(paymentStatus.attemptsPerEntry - paymentStatus.remainingAttempts + 1);
      }

      setGamePhase("ready");
    };

    initGame();
  }, [challengeId, profile?.id]);

  // Start the challenge
  const handleStartChallenge = async () => {
    if (!currentChallenge || !profile?.id) return;

    // Only check balance if user needs to pay (no remaining attempts)
    if (needsPayment) {
      // Final balance check before starting
      const availableTct = profile.availableTct ?? 0;
      if (currentChallenge.entry_fee_tct > availableTct) {
        Alert.alert(
          "Insufficient Balance",
          `You need ${currentChallenge.entry_fee_tct.toLocaleString()} TCT but you only have ${availableTct.toLocaleString()} TCT.`,
          [
            { text: "Top Up", onPress: () => router.push("/wallet" as any) },
            { text: "Cancel", style: "cancel" },
          ]
        );
        return;
      }
    } else {
      console.log("[HouseChallenge] Using remaining attempt from session:", entrySessionId);
    }

    // Start the challenge (pass existing session ID if continuing)
    const result = await startChallenge(currentChallenge.id, entrySessionId || undefined);
    if (!result.success) {
      Alert.alert("Error", result.error_message || "Failed to start challenge", [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }

    // Update session tracking
    if (result.newEntrySessionId) {
      setEntrySessionId(result.newEntrySessionId);
    }
    if (result.attemptNumber !== undefined) {
      setAttemptNumber(result.attemptNumber);
    }
    if (result.attemptsRemaining !== undefined) {
      setAttemptsRemaining(result.attemptsRemaining);
    }

    // Set up game based on player color
    const playerColor = result.player_color || currentChallenge.player_color;
    const shouldFlip = playerColor === "black";
    setIsFlipped(shouldFlip);
    setIsPlayerTurn(playerColor === "white");
    setPlayerTime(currentChallenge.time_limit_seconds);
    setOpponentTime(currentChallenge.time_limit_seconds);

    setGamePhase("playing");
    playGameStart();

    // If player is black, AI makes the first move
    if (playerColor === "black") {
      setTimeout(() => makeAIMove(), 500);
    }
  };

  // Map AI difficulty
  const getAIDifficulty = (level: AIDifficultyLevel): Difficulty => {
    return level as Difficulty;
  };

  // Make AI move
  const makeAIMove = useCallback(async () => {
    if (!currentChallenge || game.isGameOver()) return;

    setIsAiThinking(true);

    try {
      const difficulty = getAIDifficulty(currentChallenge.ai_difficulty);
      const bestMove = await chessAI.getBestMove(game.fen(), difficulty);

      if (bestMove) {
        const moveObj = game.move(bestMove);

        if (moveObj) {
          playMove({
            isCapture: !!moveObj.captured,
            isCheck: game.inCheck(),
            isCastle: moveObj.san === "O-O" || moveObj.san === "O-O-O",
            isPromotion: !!moveObj.promotion,
          });

          setLastMove({ from: moveObj.from, to: moveObj.to });

          if (moveObj.captured) {
            const capturedPiece: ChessPiece = {
              type: moveObj.captured as PieceSymbol,
              color: "w" as PieceColor,
            };
            setCapturedByOpponent((prev) => [...prev, capturedPiece]);

            // Track if opponent captures player's queen
            if (moveObj.captured === "q") {
              setQueenSacrificed(true);
            }
          }
        }

        setBoard(getBoardArray(game));
        setIsPlayerTurn(true);

        // Check for game end
        if (game.isCheckmate()) {
          handleGameEnd("opponent", "Checkmate - You got checkmated", false);
        } else if (game.isDraw()) {
          handleGameEnd("draw", "Game ended in a draw", false);
        }
      }
    } catch (error) {
      console.error("[HouseChallenge] AI move error:", error);
      // Fallback to random move
      const moves = game.moves();
      if (moves.length > 0) {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        game.move(randomMove);
        setBoard(getBoardArray(game));
        setIsPlayerTurn(true);
      }
    } finally {
      setIsAiThinking(false);
    }
  }, [currentChallenge, game, playMove]);

  // Check if objective is met
  const checkObjectiveMet = useCallback(
    (matingPiece?: PieceSymbol | null): boolean => {
      if (!currentChallenge) return false;

      const type = currentChallenge.objective_type;
      const value = currentChallenge.objective_value;

      switch (type) {
        case "checkmate_in_moves":
          const maxMoves = parseInt(value);
          return moveCount <= maxMoves;

        case "checkmate_with_piece":
          const piece = matingPiece || checkmatingPiece;
          return piece === value;

        case "sacrifice_queen":
          return queenSacrificed && game.isCheckmate();

        case "smothered_mate":
          return matingPiece === "n" || checkmatingPiece === "n";

        default:
          return true;
      }
    },
    [currentChallenge, moveCount, checkmatingPiece, queenSacrificed, game]
  );

  // Handle game end
  const handleGameEnd = useCallback(
    async (
      winner: "player" | "opponent" | "draw",
      reason: string,
      isPlayerCheckmate: boolean
    ) => {
      if (settlementPerformed.current || !currentAttempt) return;
      settlementPerformed.current = true;

      setGamePhase("ended");

      // Determine if objective was met
      let objectiveMet = false;
      let payoutAmount: number | undefined;

      if (winner === "player" && isPlayerCheckmate) {
        const history = game.history({ verbose: true });
        const lastMoveHistory = history[history.length - 1];
        const matingPiece = lastMoveHistory?.piece as PieceSymbol | undefined;

        if (matingPiece) {
          setCheckmatingPiece(matingPiece);
        }

        objectiveMet = checkObjectiveMet(matingPiece);
      }

      // Complete the challenge in database
      const result = await completeChallenge(
        currentAttempt.id,
        objectiveMet,
        moveCount,
        game.fen(),
        game.pgn(),
        checkmatingPiece || undefined,
        queenSacrificed
      );

      if (result.won && result.payout_amount) {
        payoutAmount = result.payout_amount;
        playWin();
        setShowConfetti(true);

        // Set initial result with pending payout
        setGameResult({
          winner,
          reason: `Challenge Complete! ${currentChallenge?.name}`,
          objectiveMet: true,
          payoutAmount,
          payoutStatus: "processing",
        });

        // Trigger the payout immediately
        console.log("[HouseChallenge] Triggering payout for attempt:", currentAttempt.id);
        const payoutResult = await processWinPayout(currentAttempt.id);
        console.log("[HouseChallenge] Payout result:", payoutResult);

        // Update result with payout status
        setGameResult(prev => prev ? {
          ...prev,
          payoutStatus: payoutResult.success ? "completed" : "failed",
          payoutTxHash: payoutResult.txHash,
        } : null);

      } else {
        playLose();
        setGameResult({
          winner,
          reason,
          objectiveMet,
          payoutAmount,
        });
      }
    },
    [
      currentAttempt,
      currentChallenge,
      moveCount,
      checkmatingPiece,
      queenSacrificed,
      game,
      checkObjectiveMet,
      completeChallenge,
      processWinPayout,
      playWin,
      playLose,
      profile?.id,
    ]
  );

  // Handle time out
  const handleTimeOut = useCallback(
    (isPlayer: boolean) => {
      if (isPlayer) {
        handleGameEnd("opponent", "You ran out of time", false);
      } else {
        // Opponent (AI) ran out of time - but house challenges require checkmate
        handleGameEnd("draw", "Opponent ran out of time - checkmate required to win", false);
      }
    },
    [handleGameEnd]
  );

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (gamePhase === "playing") {
      interval = setInterval(() => {
        if (isPlayerTurn) {
          setPlayerTime((prev) => {
            if (prev <= 1) {
              handleTimeOut(true);
              return 0;
            }
            if (prev === 10 && !lowTimeWarningPlayed.current) {
              playLowTime();
              lowTimeWarningPlayed.current = true;
            }
            return prev - 1;
          });
        } else {
          setOpponentTime((prev) => {
            if (prev <= 1) {
              handleTimeOut(false);
              return 0;
            }
            return prev - 1;
          });
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gamePhase, isPlayerTurn, handleTimeOut, playLowTime]);

  // Handle square press
  const handleSquarePress = useCallback(
    (row: number, col: number) => {
      if (gamePhase !== "playing" || !isPlayerTurn || isAiThinking) return;

      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

      // Adjust for flipped board
      const actualRow = isFlipped ? 7 - row : row;
      const actualCol = isFlipped ? 7 - col : col;

      const square = (files[actualCol] + ranks[actualRow]) as Square;
      const playerColor = isFlipped ? "b" : "w";

      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === playerColor) {
          playPiecePickup();
          setSelectedSquare(square);
          const moves = game.moves({ square, verbose: true });
          setPossibleMoves(moves.map((m) => m.to));
        }
      } else {
        try {
          const pieceMoving = game.get(selectedSquare);

          // Check for pawn promotion
          const isPawnPromotion =
            pieceMoving?.type === "p" &&
            ((pieceMoving.color === "w" && square[1] === "8") ||
              (pieceMoving.color === "b" && square[1] === "1"));

          if (isPawnPromotion && !user.gameSettings?.autoQueen) {
            setPendingPromotion({ from: selectedSquare, to: square });
            return;
          }

          const moveObj: Move | null = game.move({
            from: selectedSquare,
            to: square,
            promotion: "q",
          });

          if (moveObj) {
            playMove({
              isCapture: !!moveObj.captured,
              isCheck: game.inCheck(),
              isCastle: moveObj.san === "O-O" || moveObj.san === "O-O-O",
              isPromotion: !!moveObj.promotion,
            });

            setMoveCount((prev) => prev + 1);
            setLastMove({ from: moveObj.from, to: moveObj.to });

            if (moveObj.captured) {
              const capturedPiece: ChessPiece = {
                type: moveObj.captured as PieceSymbol,
                color: (playerColor === "w" ? "b" : "w") as PieceColor,
              };
              setCapturedByPlayer((prev) => [...prev, capturedPiece]);
            }
          }

          setBoard(getBoardArray(game));
          setSelectedSquare(null);
          setPossibleMoves([]);
          setIsPlayerTurn(false);

          // Check for game end
          if (game.isCheckmate()) {
            const history = game.history({ verbose: true });
            const lastMoveHistory = history[history.length - 1];
            const matingPiece = lastMoveHistory?.piece as PieceSymbol;
            setCheckmatingPiece(matingPiece);
            handleGameEnd("player", "Checkmate!", true);
          } else if (game.isDraw()) {
            handleGameEnd("draw", "Game ended in a draw", false);
          } else {
            setTimeout(() => makeAIMove(), 500);
          }
        } catch (error) {
          playIllegalMove();
          const piece = game.get(square);
          if (piece && piece.color === playerColor) {
            setSelectedSquare(square);
            const moves = game.moves({ square, verbose: true });
            setPossibleMoves(moves.map((m) => m.to));
          } else {
            setSelectedSquare(null);
            setPossibleMoves([]);
          }
        }
      }
    },
    [
      gamePhase,
      isPlayerTurn,
      isAiThinking,
      isFlipped,
      selectedSquare,
      game,
      playPiecePickup,
      playMove,
      playIllegalMove,
      makeAIMove,
      handleGameEnd,
      user.gameSettings?.autoQueen,
    ]
  );

  // Handle promotion
  const handlePromotionSelect = useCallback(
    (piece: PieceSymbol) => {
      if (!pendingPromotion) return;

      try {
        const moveObj = game.move({
          from: pendingPromotion.from,
          to: pendingPromotion.to,
          promotion: piece,
        });

        if (moveObj) {
          playMove({ isPromotion: true, isCheck: game.inCheck() });
          setMoveCount((prev) => prev + 1);
          setLastMove({ from: moveObj.from, to: moveObj.to });

          if (moveObj.captured) {
            const playerColor = isFlipped ? "b" : "w";
            const capturedPiece: ChessPiece = {
              type: moveObj.captured as PieceSymbol,
              color: (playerColor === "w" ? "b" : "w") as PieceColor,
            };
            setCapturedByPlayer((prev) => [...prev, capturedPiece]);
          }
        }

        setBoard(getBoardArray(game));
        setSelectedSquare(null);
        setPossibleMoves([]);
        setPendingPromotion(null);
        setIsPlayerTurn(false);

        if (game.isCheckmate()) {
          const history = game.history({ verbose: true });
          const lastMoveHistory = history[history.length - 1];
          const matingPiece = lastMoveHistory?.piece as PieceSymbol;
          setCheckmatingPiece(matingPiece);
          handleGameEnd("player", "Checkmate!", true);
        } else if (game.isDraw()) {
          handleGameEnd("draw", "Game ended in a draw", false);
        } else {
          setTimeout(() => makeAIMove(), 500);
        }
      } catch (error) {
        playIllegalMove();
        setPendingPromotion(null);
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    },
    [pendingPromotion, game, playMove, playIllegalMove, isFlipped, makeAIMove, handleGameEnd]
  );

  // Handle forfeit
  const handleForfeit = () => {
    Alert.alert(
      "Forfeit Challenge",
      "Are you sure you want to forfeit? You will lose your entry fee.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Forfeit",
          style: "destructive",
          onPress: async () => {
            if (currentAttempt) {
              await forfeitChallenge(currentAttempt.id);
            }
            router.back();
          },
        },
      ]
    );
  };

  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Render board
  const renderBoard = () => {
    const theme = BOARD_THEMES[boardTheme as keyof typeof BOARD_THEMES] || BOARD_THEMES.purple;

    return (
      <View style={styles.boardContainer}>
        <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
          {board.map((row, rowIndex) =>
            row.map((piece, colIndex) => {
              // Adjust for flipped board
              const displayRow = isFlipped ? 7 - rowIndex : rowIndex;
              const displayCol = isFlipped ? 7 - colIndex : colIndex;

              const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
              const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
              const square = (files[displayCol] + ranks[displayRow]) as Square;

              const isLight = (rowIndex + colIndex) % 2 === 0;
              const isSelected = selectedSquare === square;
              const isPossibleMove = possibleMoves.includes(square);
              const isLastMoveSquare =
                lastMove && (lastMove.from === square || lastMove.to === square);

              return (
                <TouchableOpacity
                  key={`${rowIndex}-${colIndex}`}
                  style={[
                    styles.square,
                    {
                      width: SQUARE_SIZE,
                      height: SQUARE_SIZE,
                      backgroundColor: isLight ? theme.light : theme.dark,
                    },
                    isSelected && styles.selectedSquare,
                    isLastMoveSquare && styles.lastMoveSquare,
                  ]}
                  onPress={() => handleSquarePress(rowIndex, colIndex)}
                  activeOpacity={0.8}
                >
                  {isPossibleMove && (
                    <View
                      style={[
                        styles.possibleMoveDot,
                        piece && styles.possibleMoveCapture,
                      ]}
                    />
                  )}
                  {piece && (
                    <ChessPieceComponent
                      type={piece.type}
                      color={piece.color}
                      size={SQUARE_SIZE * 0.85}
                      style={pieceStyle}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
    );
  };

  // Loading state
  if (gamePhase === "loading") {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>Loading challenge...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Ready state (confirm to start)
  if (gamePhase === "ready" && currentChallenge) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <ScrollView contentContainerStyle={styles.readyContainer}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <ArrowLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <Crown size={48} color="#FFD700" />
            <Text style={styles.challengeTitle}>{currentChallenge.name}</Text>
            <Text style={styles.challengeDescription}>{currentChallenge.description}</Text>

            {/* Multi-attempt session info */}
            {!needsPayment && attemptsRemaining > 0 && (
              <View style={styles.sessionInfoBox}>
                <Text style={styles.sessionInfoTitle}>You have attempts remaining!</Text>
                <Text style={styles.sessionInfoText}>
                  Attempt {attemptNumber} of {attemptsPerEntry} (no payment required)
                </Text>
              </View>
            )}

            <View style={styles.challengeInfo}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Entry Fee:</Text>
                <Text style={[styles.infoValueGold, !needsPayment && { textDecorationLine: 'line-through', opacity: 0.5 }]}>
                  {currentChallenge.entry_fee_tct.toLocaleString()} TCT
                </Text>
                {!needsPayment && (
                  <Text style={styles.freeAttemptBadge}>FREE</Text>
                )}
              </View>
              {needsPayment && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Your Balance:</Text>
                  <Text style={[styles.infoValue, (profile?.availableTct ?? 0) >= currentChallenge.entry_fee_tct ? { color: "#4ADE80" } : { color: "#EF4444" }]}>
                    {(profile?.availableTct ?? 0).toLocaleString()} TCT
                  </Text>
                </View>
              )}
              {attemptsPerEntry > 1 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Attempts Per Entry:</Text>
                  <Text style={styles.infoValue}>{attemptsPerEntry}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Prize (2x):</Text>
                <Text style={styles.infoValueGreen}>
                  {(currentChallenge.entry_fee_tct * currentChallenge.prize_multiplier).toLocaleString()} TCT
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Time Limit:</Text>
                <Text style={styles.infoValue}>
                  {Math.floor(currentChallenge.time_limit_seconds / 60)} minutes
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Your Color:</Text>
                <Text style={styles.infoValue}>
                  {currentChallenge.player_color === "random"
                    ? "Random"
                    : currentChallenge.player_color.charAt(0).toUpperCase() +
                      currentChallenge.player_color.slice(1)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>AI Difficulty:</Text>
                <Text style={[styles.infoValue, { color: getDifficultyColor(currentChallenge.difficulty) }]}>
                  {currentChallenge.difficulty}
                </Text>
              </View>
            </View>

            <View style={styles.objectiveBox}>
              <Text style={styles.objectiveLabel}>Objective</Text>
              <Text style={styles.objectiveText}>
                {getObjectiveDescription(
                  currentChallenge.objective_type,
                  currentChallenge.objective_value
                )}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.startButton, isStarting && styles.startButtonDisabled]}
              onPress={handleStartChallenge}
              disabled={isStarting}
            >
              {isStarting ? (
                <>
                  <ActivityIndicator color="#0F0F1E" style={{ marginRight: 8 }} />
                  <Text style={styles.startButtonText}>Starting...</Text>
                </>
              ) : !needsPayment ? (
                <Text style={styles.startButtonText}>
                  Start Attempt {attemptNumber} of {attemptsPerEntry}
                </Text>
              ) : (
                <Text style={styles.startButtonText}>
                  {currentChallenge.entry_fee_tct > 0
                    ? `Pay ${currentChallenge.entry_fee_tct.toLocaleString()} TCT & Start`
                    : "Start Challenge"}
                </Text>
              )}
            </TouchableOpacity>

          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Handle Try Again - reset game state for next attempt
  const handleTryAgain = () => {
    // Reset game state
    game.reset();
    setBoard(getBoardArray(game));
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMove(null);
    setMoveCount(0);
    setQueenSacrificed(false);
    setCheckmatingPiece(null);
    setCapturedByPlayer([]);
    setCapturedByOpponent([]);
    setGameResult(null);
    setShowConfetti(false);
    settlementPerformed.current = false;
    lowTimeWarningPlayed.current = false;

    // Update attempt tracking for next attempt
    setAttemptNumber(attemptNumber + 1);
    setAttemptsRemaining(attemptsRemaining - 1);

    // Go back to ready state
    setGamePhase("ready");
  };

  // Game ended state
  if (gamePhase === "ended" && gameResult) {
    const isWin = gameResult.winner === "player" && gameResult.objectiveMet;
    const canTryAgain = !isWin && attemptsRemaining > 0;

    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {showConfetti && (
            <ConfettiCannon
              count={150}
              origin={{ x: width / 2, y: 0 }}
              fadeOut
              autoStart
            />
          )}
          <View style={styles.resultContainer}>
          {isWin ? (
            <Trophy size={64} color="#FFD700" />
          ) : (
            <X size={64} color="#EF4444" />
          )}
          <Text style={[styles.resultTitle, isWin && styles.resultTitleWin]}>
            {isWin ? "Challenge Complete!" : "Challenge Failed"}
          </Text>
          <Text style={styles.resultReason}>{gameResult.reason}</Text>

          {gameResult.payoutAmount && (
            <View style={styles.payoutBox}>
              <Text style={styles.payoutLabel}>You Won</Text>
              <Text style={styles.payoutAmount}>
                {gameResult.payoutAmount.toLocaleString()} TCT
              </Text>
              <Text style={styles.payoutNote}>
                {gameResult.payoutStatus === "processing" && "Sending to your wallet..."}
                {gameResult.payoutStatus === "completed" && "Sent to your wallet!"}
                {gameResult.payoutStatus === "failed" && "Payout failed - contact support"}
                {gameResult.payoutStatus === "pending" && "Processing payout..."}
              </Text>
              {gameResult.payoutStatus === "completed" && (
                <ActivityIndicator size="small" color="#4ADE80" style={{ marginTop: 8, display: 'none' }} />
              )}
            </View>
          )}

          <View style={styles.resultStats}>
            <Text style={styles.resultStatText}>Moves Made: {moveCount}</Text>
            {checkmatingPiece && (
              <Text style={styles.resultStatText}>
                Checkmating Piece: {checkmatingPiece.toUpperCase()}
              </Text>
            )}
          </View>

          {/* Show remaining attempts info */}
          {canTryAgain && (
            <View style={styles.attemptsRemainingBox}>
              <Text style={styles.attemptsRemainingText}>
                You have {attemptsRemaining} attempt{attemptsRemaining > 1 ? 's' : ''} remaining!
              </Text>
              <Text style={styles.attemptsRemainingSubtext}>
                No additional payment required
              </Text>
            </View>
          )}

          <View style={styles.resultButtonsContainer}>
            {canTryAgain && (
              <TouchableOpacity
                style={styles.tryAgainButton}
                onPress={handleTryAgain}
              >
                <Text style={styles.tryAgainButtonText}>
                  Try Again ({attemptsRemaining} left)
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.returnButton, canTryAgain && styles.returnButtonSecondary]}
              onPress={() => router.replace("/challenge-board" as any)}
            >
              <Text style={[styles.returnButtonText, canTryAgain && styles.returnButtonTextSecondary]}>
                {canTryAgain ? "Leave (Save Attempts)" : "Return to Challenges"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Playing state
  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.gameContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.forfeitButton} onPress={handleForfeit}>
            <X size={20} color="#EF4444" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.challengeBadge}>
              <Crown size={16} color="#FFD700" />
              <Text style={styles.challengeBadgeText}>{currentChallenge?.name}</Text>
            </View>
            {attemptsPerEntry > 1 && (
              <Text style={styles.attemptIndicator}>
                Attempt {attemptNumber}/{attemptsPerEntry}
              </Text>
            )}
          </View>
          <View style={styles.movesCounter}>
            <Text style={styles.movesText}>Moves: {moveCount}</Text>
          </View>
        </View>

        {/* Opponent Timer */}
        <View style={[styles.timerBar, !isPlayerTurn && styles.timerBarActive]}>
          <Clock size={16} color={!isPlayerTurn ? "#FFD700" : "#A0A0A0"} />
          <Text style={[styles.timerText, !isPlayerTurn && styles.timerTextActive]}>
            AI: {formatTime(opponentTime)}
          </Text>
          {isAiThinking && <ActivityIndicator size="small" color="#FFD700" />}
        </View>

        {/* Board */}
        {renderBoard()}

        {/* Player Timer */}
        <View style={[styles.timerBar, isPlayerTurn && styles.timerBarActive]}>
          <Clock size={16} color={isPlayerTurn ? "#FFD700" : "#A0A0A0"} />
          <Text style={[styles.timerText, isPlayerTurn && styles.timerTextActive]}>
            You: {formatTime(playerTime)}
          </Text>
        </View>

        {/* Objective Reminder */}
        <View style={styles.objectiveReminder}>
          <Text style={styles.objectiveReminderText}>
            Objective: {currentChallenge && getObjectiveDescription(
              currentChallenge.objective_type,
              currentChallenge.objective_value
            )}
          </Text>
        </View>
        </View>
      </SafeAreaView>

      {/* Promotion Modal */}
      {pendingPromotion && (
        <PawnPromotionModal
          visible={!!pendingPromotion}
          color={isFlipped ? "b" : "w"}
          onSelect={handlePromotionSelect}
          onCancel={() => {
            setPendingPromotion(null);
            setSelectedSquare(null);
            setPossibleMoves([]);
          }}
        />
      )}
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: { fontSize: 16, color: "#A0A0A0" },

  // Ready state
  readyContainer: {
    flexGrow: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  challengeTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 16,
  },
  challengeDescription: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    marginTop: 8,
  },
  challengeInfo: {
    width: "100%",
    marginTop: 24,
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  infoLabel: { fontSize: 14, color: "#A0A0A0" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  infoValueGold: { fontSize: 16, fontWeight: "700", color: "#FFD700" },
  infoValueGreen: { fontSize: 16, fontWeight: "700", color: "#4ADE80" },
  freeAttemptBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F0F1E",
    backgroundColor: "#4ADE80",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  sessionInfoBox: {
    width: "100%",
    marginTop: 16,
    padding: 16,
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.4)",
    alignItems: "center",
  },
  sessionInfoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4ADE80",
  },
  sessionInfoText: {
    fontSize: 14,
    color: "#FFFFFF",
    marginTop: 4,
  },
  objectiveBox: {
    width: "100%",
    marginTop: 24,
    padding: 16,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    alignItems: "center",
  },
  objectiveLabel: { fontSize: 12, fontWeight: "600", color: "#FFD700" },
  objectiveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 8,
  },
  startButton: {
    width: "100%",
    marginTop: 32,
    backgroundColor: "#FFD700",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  startButtonDisabled: { opacity: 0.6 },
  startButtonText: { fontSize: 18, fontWeight: "700", color: "#0F0F1E" },

  // Game state
  gameContainer: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  forfeitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    alignItems: "center",
    gap: 4,
  },
  challengeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  challengeBadgeText: { fontSize: 13, fontWeight: "600", color: "#FFD700" },
  attemptIndicator: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  movesCounter: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  movesText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  timerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginVertical: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
  },
  timerBarActive: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  timerText: { fontSize: 16, fontWeight: "600", color: "#A0A0A0" },
  timerTextActive: { color: "#FFD700" },
  objectiveReminder: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 12,
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 8,
    alignItems: "center",
  },
  objectiveReminderText: { fontSize: 12, color: "#FFD700", textAlign: "center" },

  // Board
  boardContainer: { alignItems: "center", marginVertical: 8 },
  board: { flexDirection: "row", flexWrap: "wrap" },
  square: { justifyContent: "center", alignItems: "center" },
  selectedSquare: { backgroundColor: "rgba(255, 215, 0, 0.4)" },
  lastMoveSquare: { backgroundColor: "rgba(78, 205, 196, 0.3)" },
  possibleMoveDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(0, 255, 0, 0.4)",
  },
  possibleMoveCapture: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 3,
    borderColor: "rgba(255, 0, 0, 0.5)",
  },

  // Result state
  resultContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#EF4444",
    marginTop: 16,
  },
  resultTitleWin: { color: "#4ADE80" },
  resultReason: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    marginTop: 8,
  },
  payoutBox: {
    marginTop: 24,
    padding: 20,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
    alignItems: "center",
  },
  payoutLabel: { fontSize: 14, color: "#4ADE80" },
  payoutAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: "#4ADE80",
    marginTop: 4,
  },
  payoutNote: { fontSize: 12, color: "#A0A0A0", marginTop: 8 },
  resultStats: { marginTop: 24, gap: 8 },
  resultStatText: { fontSize: 14, color: "#A0A0A0" },
  attemptsRemainingBox: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
    alignItems: "center",
  },
  attemptsRemainingText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4ADE80",
  },
  attemptsRemainingSubtext: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 4,
  },
  resultButtonsContainer: {
    marginTop: 24,
    width: "100%",
    gap: 12,
    alignItems: "center",
  },
  tryAgainButton: {
    backgroundColor: "#4ADE80",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  tryAgainButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  returnButton: {
    marginTop: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  returnButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  returnButtonText: { fontSize: 16, fontWeight: "700", color: "#0F0F1E" },
  returnButtonTextSecondary: { color: "#A0A0A0" },
});
