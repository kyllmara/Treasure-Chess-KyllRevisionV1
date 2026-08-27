import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Chess, Square, Move } from "chess.js";
import { useRouter } from "expo-router";
import { RotateCcw, X, Trophy, ChevronLeft, ChevronRight, MessageCircle, Share2, Bot } from "lucide-react-native";
import { VictoryCelebration, AnimatedDragons } from "@/components/VictoryCelebration";
import { useApp } from "@/contexts/AppContext";
import { ChessPieceComponent } from "@/components/ChessPieces";
import { useSettingsStore } from "@/stores/settingsStore";
import type { BoardTheme } from "@/types";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useMoveAnimations } from "@/hooks/useMoveAnimations";
import { BoardAnimationOverlay } from "@/components/BoardAnimationOverlay";

const { width } = Dimensions.get("window");
const BOARD_SIZE = Math.min(width - 40, 400);
const SQUARE_SIZE = BOARD_SIZE / 8;

type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
type PieceColor = "w" | "b";

interface ChessPiece {
  type: PieceSymbol;
  color: PieceColor;
}

const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> = {
  purple: { light: "#FFFFFF", dark: "#9B7EC8" },
  classic: { light: "#FFFFFF", dark: "#000000" },
  eco: { light: "#8B4513", dark: "#6B8E23" },
  retro: { light: "#E8D7B8", dark: "#A67C52" },
};

// Bot difficulty levels — using abstract color-coded identifiers
const BOT_COLORS: Record<string, string> = {
  beginner: "#4CAF82",
  rookie:   "#4A90E2",
  adept:    "#F5C400",
  expert:   "#E05C5C",
};

type DifficultyLevel = "beginner" | "rookie" | "adept" | "expert";
type TimeLimit = 180 | 300 | 600 | 900 | null;

// Helper to get piece name
const getPieceName = (type: string): string => {
  const names: Record<string, string> = {
    p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king'
  };
  return names[type] || type;
};

export default function PracticeScreen() {
  const router = useRouter();
  const { t, user } = useApp();
  const { game: gameSettings } = useSettingsStore();

  const boardTheme = gameSettings?.boardTheme || user.gameSettings?.boardTheme || "retro";
  const pieceStyle = gameSettings?.pieceStyle || user.gameSettings?.pieceStyle || "classic";
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);
  const [timeLimit, setTimeLimit] = useState<TimeLimit>(null);
  const [showTimerSelection, setShowTimerSelection] = useState<boolean>(false);
  const [playerTime, setPlayerTime] = useState<number>(300);
  const [botTime, setBotTime] = useState<number>(300);
  const [game, setGame] = useState<Chess>(new Chess());
  const [board, setBoard] = useState<(ChessPiece | null)[][]>(
    getBoardArray(new Chess())
  );
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  const {
    legalGlowAlpha, startLegalGlow, stopLegalGlow,
    glideState, triggerGlide, handleGlideComplete,
    illegalSquare, illegalAlpha, illegalShakeX, triggerIllegalMove,
    captureSquare, handleCaptureComplete, enabled: animEnabled,
  } = useMoveAnimations();

  const legalGlowStyle = useAnimatedStyle(() => ({ opacity: legalGlowAlpha.value }));
  const illegalStyle = useAnimatedStyle(() => ({
    opacity: illegalAlpha.value,
    transform: [{ translateX: illegalShakeX.value }],
  }));

  // Game history & result
  const [gameHistory, setGameHistory] = useState<Move[]>([]);
  const [gameResult, setGameResult] = useState<{ winner: 'player' | 'opponent' | 'draw'; reason: string } | null>(null);

  // Feedback mode
  const [feedbackMode, setFeedbackMode] = useState<boolean>(false);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(0);
  const [moveFeedback, setMoveFeedback] = useState<Record<number, string>>({});
  const [loadingFeedback, setLoadingFeedback] = useState<boolean>(false);

  const botColor = difficulty ? BOT_COLORS[difficulty] : "#8099A8";

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

  const handleReset = useCallback(() => {
    const newGame = new Chess();
    setGame(newGame);
    setBoard(getBoardArray(newGame));
    setSelectedSquare(null);
    setLastMove(null);
    setGameHistory([]);
    setGameResult(null);
    setFeedbackMode(false);
    setCurrentMoveIndex(0);
    setMoveFeedback({});
    if (timeLimit) {
      setPlayerTime(timeLimit);
      setBotTime(timeLimit);
    }
  }, [timeLimit]);

  const handleNewGame = useCallback(() => {
    handleReset();
    setDifficulty(null);
    setShowTimerSelection(false);
  }, [handleReset]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!difficulty || !timeLimit || gameResult) return;

    const currentTurn = game.turn();
    const timer = setInterval(() => {
      if (currentTurn === "w") {
        setPlayerTime(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setGameResult({ winner: 'opponent', reason: 'You ran out of time' });
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBotTime(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setGameResult({ winner: 'player', reason: 'Computer ran out of time' });
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [game, difficulty, timeLimit, gameResult]);

  const PIECE_VALUES: Record<string, number> = {
    p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
  };

  // Center control bonus by square
  const CENTER_BONUS: Record<string, number> = {
    d4: 30, d5: 30, e4: 30, e5: 30,
    c3: 15, c4: 15, c5: 15, c6: 15,
    d3: 15, d6: 15, e3: 15, e6: 15,
    f3: 15, f4: 15, f5: 15, f6: 15,
  };

  const evaluatePosition = useCallback((chess: Chess): number => {
    if (chess.isCheckmate()) {
      return chess.turn() === 'w' ? -99999 : 99999;
    }
    if (chess.isDraw()) return 0;

    let score = 0;
    const boardObj = chess.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardObj[r][c];
        if (!piece) continue;

        const value = PIECE_VALUES[piece.type] || 0;
        const sign = piece.color === 'w' ? 1 : -1;
        score += sign * value;

        // Center control
        const files = ['a','b','c','d','e','f','g','h'];
        const ranks = ['8','7','6','5','4','3','2','1'];
        const sq = files[c] + ranks[r];
        const centerBonus = CENTER_BONUS[sq] || 0;
        score += sign * centerBonus;

        // Development bonus: knights and bishops off back rank
        if ((piece.type === 'n' || piece.type === 'b')) {
          const backRank = piece.color === 'w' ? 7 : 0;
          if (r !== backRank) {
            score += sign * 15;
          }
        }

        // Pawn advancement bonus
        if (piece.type === 'p') {
          const advancement = piece.color === 'w' ? (6 - r) : (r - 1);
          score += sign * advancement * 5;
        }
      }
    }

    // Mobility bonus
    const moves = chess.moves();
    const mobilitySign = chess.turn() === 'w' ? 1 : -1;
    score += mobilitySign * moves.length * 2;

    // Check bonus
    if (chess.inCheck()) {
      score += mobilitySign * -30;
    }

    return score;
  }, []);

  // Evaluate a move by making it and scoring the resulting position
  // depth=0 for shallow, depth=1 for one-ply lookahead
  const evaluateMove = useCallback((chess: Chess, moveObj: Move, depth: number = 0): number => {
    const testGame = new Chess(chess.fen());
    testGame.move(moveObj.san);

    if (testGame.isCheckmate()) {
      return 99999;
    }

    if (depth === 0) {
      // Evaluate from the moving side's perspective (higher = better for mover)
      const rawScore = evaluatePosition(testGame);
      // If it was black's move, black wants lower scores
      return chess.turn() === 'w' ? rawScore : -rawScore;
    }

    // depth=1: consider opponent's best reply
    const opponentMoves = testGame.moves({ verbose: true });
    if (opponentMoves.length === 0) {
      const rawScore = evaluatePosition(testGame);
      return chess.turn() === 'w' ? rawScore : -rawScore;
    }

    // Opponent picks their best move (worst for us)
    let worstForUs = Infinity;
    for (const opp of opponentMoves) {
      const deeper = new Chess(testGame.fen());
      deeper.move(opp.san);
      const rawScore = evaluatePosition(deeper);
      const scoreForMover = chess.turn() === 'w' ? rawScore : -rawScore;
      if (scoreForMover < worstForUs) {
        worstForUs = scoreForMover;
      }
    }

    return worstForUs;
  }, [evaluatePosition]);

  const makeComputerMove = useCallback(() => {
    if (gameResult) return;

    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return;

    let selectedMove: Move;

    if (difficulty === "beginner") {
      // Pure random — sometimes blunders, sometimes finds good moves by accident
      selectedMove = moves[Math.floor(Math.random() * moves.length)];
    } else if (difficulty === "rookie") {
      // Shallow eval (no lookahead), picks best 40% of the time, random otherwise
      const scoredMoves = moves.map(m => ({
        move: m,
        score: evaluateMove(game, m, 0),
      }));
      scoredMoves.sort((a, b) => b.score - a.score);

      if (Math.random() < 0.4) {
        // Pick from top 3 moves with some randomness
        const topN = Math.min(3, scoredMoves.length);
        selectedMove = scoredMoves[Math.floor(Math.random() * topN)].move;
      } else {
        selectedMove = moves[Math.floor(Math.random() * moves.length)];
      }
    } else if (difficulty === "adept") {
      // 1-ply lookahead, picks best 70% of the time
      const scoredMoves = moves.map(m => ({
        move: m,
        score: evaluateMove(game, m, 1),
      }));
      scoredMoves.sort((a, b) => b.score - a.score);

      if (Math.random() < 0.7) {
        // Pick from top 2
        const topN = Math.min(2, scoredMoves.length);
        selectedMove = scoredMoves[Math.floor(Math.random() * topN)].move;
      } else {
        // Pick from top half
        const halfLen = Math.max(1, Math.floor(scoredMoves.length / 2));
        selectedMove = scoredMoves[Math.floor(Math.random() * halfLen)].move;
      }
    } else {
      // Expert: 1-ply lookahead, always picks the best move
      const scoredMoves = moves.map(m => ({
        move: m,
        score: evaluateMove(game, m, 1),
      }));
      scoredMoves.sort((a, b) => b.score - a.score);
      selectedMove = scoredMoves[0].move;
    }

    const result = game.move(selectedMove.san);
    if (result) {
      setGameHistory(prev => [...prev, result]);
      setLastMove({ from: result.from as Square, to: result.to as Square });
    }
    setBoard(getBoardArray(game));

    if (game.isCheckmate()) {
      setGameResult({ winner: 'opponent', reason: 'Checkmate' });
    } else if (game.isDraw()) {
      setGameResult({ winner: 'draw', reason: game.isStalemate() ? 'Stalemate' : 'Draw' });
    }
  }, [game, gameResult, difficulty, evaluateMove]);

  const handleSquarePress = useCallback(
    (row: number, col: number) => {
      if (gameResult) return;

      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
      const square = (files[col] + ranks[row]) as Square;

      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          const moves = game.moves({ square, verbose: true });
          setPossibleMoves(moves.map(m => m.to as Square));
          startLegalGlow();
        }
      } else {
        try {
          const fromPiece = game.get(selectedSquare);
          const capturePiece = game.get(square);
          const result = game.move({
            from: selectedSquare,
            to: square,
            promotion: "q",
          });

          if (result) {
            if (fromPiece) triggerGlide(selectedSquare, square, fromPiece, SQUARE_SIZE, false, capturePiece ? square : undefined);
            stopLegalGlow();
            setGameHistory(prev => [...prev, result]);
            setLastMove({ from: result.from as Square, to: result.to as Square });
          } else {
            triggerIllegalMove(selectedSquare);
            stopLegalGlow();
          }
          setBoard(getBoardArray(game));
          setPossibleMoves([]);
          setSelectedSquare(null);

          if (game.isCheckmate()) {
            setGameResult({ winner: 'player', reason: 'Checkmate' });
          } else if (game.isDraw()) {
            setGameResult({ winner: 'draw', reason: game.isStalemate() ? 'Stalemate' : 'Draw' });
          } else if (result) {
            setTimeout(() => makeComputerMove(), 500);
          }
        } catch (error) {
          console.log("Invalid move:", error);
          triggerIllegalMove(selectedSquare);
          stopLegalGlow();
          setPossibleMoves([]);
          setSelectedSquare(null);
        }
      }
    },
    [selectedSquare, game, gameResult, makeComputerMove, triggerGlide, triggerIllegalMove, startLegalGlow, stopLegalGlow]
  );

  // Get only player move indices (white = even indices: 0, 2, 4, ...)
  const playerMoveIndices = useMemo(() => {
    return gameHistory.map((_, i) => i).filter(i => i % 2 === 0);
  }, [gameHistory]);

  // Helper to explain why a move is good
  const explainMoveStrength = (move: Move, chess: Chess): string => {
    const reasons: string[] = [];

    // Check if it's a capture
    if (move.captured) {
      const capturedName = getPieceName(move.captured);
      reasons.push(`captures the ${capturedName}`);
    }

    // Check if it gives check
    if (move.san.includes('+')) {
      reasons.push('puts the opponent in check');
    }

    // Check for center control
    const centerSquares = ['d4', 'd5', 'e4', 'e5'];
    if (centerSquares.includes(move.to)) {
      reasons.push('controls the center');
    }

    // Check for development
    if ((move.piece === 'n' || move.piece === 'b') && ['1', '8'].includes(move.from[1])) {
      reasons.push('develops a piece');
    }

    // Check for castling
    if (move.san === 'O-O' || move.san === 'O-O-O') {
      reasons.push('castles for king safety');
    }

    if (reasons.length === 0) {
      reasons.push('improves your position');
    }

    return reasons.join(' and ');
  };

  // Feedback functions — only for player moves (local analysis without AI)
  const generateMoveFeedback = (moveIndex: number) => {
    if (moveFeedback[moveIndex]) return;
    if (moveIndex >= gameHistory.length) return;

    setLoadingFeedback(true);

    try {
      const move = gameHistory[moveIndex];

      // Build position before this move to find the best alternative
      const preGame = new Chess();
      for (let i = 0; i < moveIndex; i++) {
        preGame.move(gameHistory[i].san);
      }

      // Score all available moves with 1-ply lookahead to find the optimal one
      const availableMoves = preGame.moves({ verbose: true });
      const scoredMoves = availableMoves.map(m => ({
        move: m,
        score: evaluateMove(preGame, m, 1),
      }));
      scoredMoves.sort((a, b) => b.score - a.score);
      const bestMove = scoredMoves[0]?.move;
      const playedMoveRank = scoredMoves.findIndex(m => m.move.san === move.san);
      const playedMoveScore = scoredMoves.find(m => m.move.san === move.san)?.score ?? 0;
      const bestScore = scoredMoves[0]?.score ?? 0;
      const scoreDiff = bestScore - playedMoveScore;

      // Determine move quality
      let quality: 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' = 'Excellent';
      let qualityEmoji = '✅';
      if (playedMoveRank === 0) {
        quality = 'Excellent';
        qualityEmoji = '🌟';
      } else if (scoreDiff < 30) {
        quality = 'Good';
        qualityEmoji = '✅';
      } else if (scoreDiff < 100) {
        quality = 'Inaccuracy';
        qualityEmoji = '⚠️';
      } else if (scoreDiff < 300) {
        quality = 'Mistake';
        qualityEmoji = '❌';
      } else {
        quality = 'Blunder';
        qualityEmoji = '💀';
      }

      const moveNumber = Math.floor(moveIndex / 2) + 1;
      const wasBestMove = bestMove && bestMove.san === move.san;
      const pieceName = getPieceName(move.piece);

      // Helper to describe a move in plain English
      const describeMoveAction = (m: Move): string => {
        const piece = getPieceName(m.piece);
        if (m.captured) {
          const capturedPiece = getPieceName(m.captured);
          return `${piece} from ${m.from} captures ${capturedPiece} on ${m.to}`;
        }
        if (m.san === 'O-O') return 'king castles kingside';
        if (m.san === 'O-O-O') return 'king castles queenside';
        return `${piece} from ${m.from} to ${m.to}`;
      };

      // Generate feedback text locally
      let feedback = '';

      if (wasBestMove || playedMoveRank === 0) {
        const strength = explainMoveStrength(move, preGame);
        feedback = `${qualityEmoji} ${quality} move! Your ${describeMoveAction(move)} was the best choice. This move ${strength}.`;
      } else if (quality === 'Good') {
        feedback = `${qualityEmoji} ${quality} move. Your ${describeMoveAction(move)} is a reasonable choice that ${explainMoveStrength(move, preGame)}. `;
        if (bestMove) {
          feedback += `The optimal move was ${describeMoveAction(bestMove)}, which would have been slightly stronger.`;
        }
      } else if (quality === 'Inaccuracy') {
        feedback = `${qualityEmoji} ${quality}. Your ${describeMoveAction(move)} is playable but not the best. `;
        if (bestMove) {
          feedback += `Consider ${describeMoveAction(bestMove)} instead — it ${explainMoveStrength(bestMove, preGame)}.`;
        }
      } else if (quality === 'Mistake') {
        feedback = `${qualityEmoji} ${quality}! Your ${describeMoveAction(move)} loses some advantage. `;
        if (bestMove) {
          feedback += `A much better move was ${describeMoveAction(bestMove)}, which ${explainMoveStrength(bestMove, preGame)}.`;
        }
      } else {
        feedback = `${qualityEmoji} ${quality}! Your ${describeMoveAction(move)} is a serious error that significantly weakens your position. `;
        if (bestMove) {
          feedback += `You should have played ${describeMoveAction(bestMove)}, which ${explainMoveStrength(bestMove, preGame)}.`;
        }
      }

      setMoveFeedback(prev => ({ ...prev, [moveIndex]: feedback }));
    } catch (error) {
      console.error("Failed to generate feedback:", error);
      setMoveFeedback(prev => ({ ...prev, [moveIndex]: "Unable to analyze this move." }));
    } finally {
      setLoadingFeedback(false);
    }
  };

  const startFeedbackMode = () => {
    if (playerMoveIndices.length === 0) return;
    setFeedbackMode(true);
    setCurrentMoveIndex(0); // Index into playerMoveIndices
    generateMoveFeedback(playerMoveIndices[0]);
  };

  const nextMove = () => {
    if (currentMoveIndex < playerMoveIndices.length - 1) {
      const newIndex = currentMoveIndex + 1;
      setCurrentMoveIndex(newIndex);
      generateMoveFeedback(playerMoveIndices[newIndex]);
    }
  };

  const previousMove = () => {
    if (currentMoveIndex > 0) {
      setCurrentMoveIndex(currentMoveIndex - 1);
    }
  };

  const getBoardStateAtMove = (moveIndex: number): (ChessPiece | null)[][] => {
    const tempGame = new Chess();
    for (let i = 0; i <= moveIndex; i++) {
      tempGame.move(gameHistory[i].san);
    }
    return getBoardArray(tempGame);
  };

  // Screen: Feedback mode — player moves only
  if (feedbackMode && playerMoveIndices.length > 0) {
    const actualMoveIndex = playerMoveIndices[currentMoveIndex];
    const currentMove = gameHistory[actualMoveIndex];
    const boardState = getBoardStateAtMove(actualMoveIndex);
    const feedback = moveFeedback[actualMoveIndex];

    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <ScrollView contentContainerStyle={styles.feedbackScrollContent}>
          <TouchableOpacity
            style={styles.closeFeedbackButton}
            onPress={() => {
              setFeedbackMode(false);
              setCurrentMoveIndex(0);
            }}
          >
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.feedbackHeader}>
            <MessageCircle size={32} color="#FFD700" />
            <Text style={styles.feedbackTitle}>Move Analysis</Text>
            <Text style={styles.feedbackSubtitle}>
              Your Move {currentMoveIndex + 1} of {playerMoveIndices.length}
            </Text>
          </View>

          <View style={styles.feedbackBoardContainer}>
            <View style={styles.boardWrapper}>
              <View style={styles.rankLabels}>
                {["8","7","6","5","4","3","2","1"].map((rank) => (
                  <View key={rank} style={[styles.coordLabel, { height: SQUARE_SIZE }]}>
                    <Text style={styles.coordText}>{rank}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.boardAndFiles}>
                <View style={styles.chessBoard}>
                  {boardState.map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.row}>
                      {row.map((piece, colIndex) => {
                        const isLight = (rowIndex + colIndex) % 2 === 0;
                        const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
                        const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
                        const square = (files[colIndex] + ranks[rowIndex]) as Square;
                        const isLastMoveSquare = currentMove && (currentMove.from === square || currentMove.to === square);
                        const themeColors = BOARD_THEMES[boardTheme as keyof typeof BOARD_THEMES];

                        return (
                          <View
                            key={`${rowIndex}-${colIndex}`}
                            style={[
                              styles.square,
                              { backgroundColor: isLight ? themeColors.light : themeColors.dark },
                              isLastMoveSquare && styles.lastMoveHighlight,
                            ]}
                          >
                            {piece && (
                              <View style={styles.pieceContainer}>
                                <ChessPieceComponent
                                  type={piece.type}
                                  color={piece.color}
                                  size={SQUARE_SIZE * 0.75}
                                  style={pieceStyle}
                                />
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
                <View style={styles.fileLabels}>
                  {["a","b","c","d","e","f","g","h"].map((file) => (
                    <View key={file} style={[styles.coordLabel, { width: SQUARE_SIZE }]}>
                      <Text style={styles.coordText}>{file}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.moveInfoCard}>
              <Text style={styles.moveNotation}>
                {getPieceName(currentMove.piece).charAt(0).toUpperCase() + getPieceName(currentMove.piece).slice(1)} {currentMove.from} → {currentMove.to}
              </Text>
              <Text style={styles.moveDescription}>
                Your move #{Math.floor(actualMoveIndex / 2) + 1}
              </Text>
            </View>
          </View>

          {/* Feedback Message Box */}
          <View style={styles.feedbackMessageBox}>
            {loadingFeedback ? (
              <View style={styles.feedbackLoadingContainer}>
                <ActivityIndicator size="large" color="#FFD700" />
                <Text style={styles.feedbackLoadingText}>Analyzing your move...</Text>
              </View>
            ) : (
              <Text style={styles.feedbackMessageText}>{feedback || "Loading analysis..."}</Text>
            )}
          </View>

          {/* Next Button - Primary Action */}
          <TouchableOpacity
            style={[
              styles.nextButton,
              currentMoveIndex === playerMoveIndices.length - 1 && styles.nextButtonLast,
            ]}
            onPress={() => {
              if (currentMoveIndex === playerMoveIndices.length - 1) {
                setFeedbackMode(false);
                setCurrentMoveIndex(0);
              } else {
                nextMove();
              }
            }}
          >
            <LinearGradient
              colors={currentMoveIndex === playerMoveIndices.length - 1 ? ["#4CAF82", "#3A9F6E"] : ["#FFD700", "#FFA500"]}
              style={styles.nextButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.nextButtonText}>
                {currentMoveIndex === playerMoveIndices.length - 1 ? "Finish Review" : "Next Move"}
              </Text>
              {currentMoveIndex < playerMoveIndices.length - 1 && (
                <ChevronRight size={24} color="#0F0F1E" />
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Move Counter */}
          <View style={styles.moveProgressContainer}>
            <Text style={styles.moveProgressText}>
              Move {currentMoveIndex + 1} of {playerMoveIndices.length}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${((currentMoveIndex + 1) / playerMoveIndices.length) * 100}%` }
                ]}
              />
            </View>
          </View>

          {/* Previous Button - Secondary */}
          {currentMoveIndex > 0 && (
            <TouchableOpacity
              style={styles.previousButton}
              onPress={previousMove}
            >
              <ChevronLeft size={20} color="#A0A0A0" />
              <Text style={styles.previousButtonText}>Previous Move</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.backToResultsButton}
            onPress={() => {
              setFeedbackMode(false);
              setCurrentMoveIndex(0);
            }}
          >
            <Text style={styles.backToResultsButtonText}>Back to Results</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Screen: Game Over
  if (gameResult) {
    const celebrationResult = gameResult.winner === 'player' ? 'win' : gameResult.winner === 'opponent' ? 'lose' : 'draw';

    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <VictoryCelebration result={celebrationResult} visible={true}>
          {null}
        </VictoryCelebration>

        <ScrollView contentContainerStyle={styles.gameOverScrollContent}>
          <View style={styles.gameOverContent}>
            <AnimatedDragons size={70} />

            {gameResult.winner === 'player' && (
              <>
                <Trophy size={80} color="#FFD700" />
                <Text style={styles.gameOverTitle}>Victory!</Text>
                <Text style={styles.gameOverReason}>{gameResult.reason}</Text>
                <Text style={styles.gameOverDifficultyLabel}>
                  vs {difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : ''} Bot
                </Text>
              </>
            )}
            {gameResult.winner === 'opponent' && (
              <>
                <X size={80} color="#FF4444" />
                <Text style={styles.gameOverTitleLoss}>Defeat</Text>
                <Text style={styles.gameOverReason}>{gameResult.reason}</Text>
                <Text style={styles.gameOverDifficultyLabel}>
                  vs {difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : ''} Bot
                </Text>
              </>
            )}
            {gameResult.winner === 'draw' && (
              <>
                <Trophy size={80} color="#A0A0A0" />
                <Text style={styles.gameOverTitleDraw}>Draw</Text>
                <Text style={styles.gameOverReason}>{gameResult.reason}</Text>
                <Text style={styles.gameOverDifficultyLabel}>
                  vs {difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : ''} Bot
                </Text>
              </>
            )}

            <View style={styles.gameOverMoveCount}>
              <Text style={styles.gameOverMoveCountText}>
                {gameHistory.length} moves played
              </Text>
            </View>

            <View style={styles.gameOverButtons}>
              <TouchableOpacity
                style={styles.gameOverButton}
                onPress={handleReset}
              >
                <LinearGradient
                  colors={["#FFD700", "#FFA500"]}
                  style={styles.gameOverButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.gameOverButtonText}>Rematch</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gameOverButton}
                onPress={handleNewGame}
              >
                <View style={styles.gameOverSecondaryButton}>
                  <Text style={styles.gameOverSecondaryButtonText}>New Game</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gameOverButton}
                onPress={startFeedbackMode}
              >
                <View style={styles.gameOverFeedbackButton}>
                  <MessageCircle size={20} color="#FFD700" />
                  <Text style={styles.gameOverFeedbackButtonText}>View Feedback</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gameOverButton}
                onPress={() => router.back()}
              >
                <View style={styles.gameOverSecondaryButton}>
                  <Text style={styles.gameOverSecondaryButtonText}>Back to Home</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shareButton}
                onPress={() => {
                  const resultText = gameResult.winner === 'player' ? 'Won' : gameResult.winner === 'opponent' ? 'Lost' : 'Drew';
                  const diffLabel = difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : '';
                  import('react-native').then(({ Share }) => {
                    Share.share({
                      message: `I just ${resultText} a practice game vs ${diffLabel} Bot on Treasure Chess! ${gameResult.reason}. Download and challenge me!`,
                    });
                  });
                }}
              >
                <Share2 size={20} color="#FFD700" />
                <Text style={styles.shareButtonText}>Share Result</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Screen 1: Difficulty selection
  if (!difficulty) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <View style={styles.headerSimple}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <X size={24} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitleCentered}>{t("practiceMode")}</Text>
        </View>

        <View style={styles.difficultyContainer}>
          <Text style={styles.difficultyTitle}>Select Difficulty Level</Text>

          {(["beginner", "rookie", "adept", "expert"] as DifficultyLevel[]).map((level) => {
            const labels: Record<DifficultyLevel, { name: string; desc: string }> = {
              beginner: { name: "Beginner", desc: "Perfect for learning" },
              rookie:   { name: "Rookie",   desc: "Some challenge" },
              adept:    { name: "Adept",    desc: "Real competition" },
              expert:   { name: "Expert",   desc: "Ultimate challenge" },
            };
            return (
              <TouchableOpacity
                key={level}
                style={styles.difficultyButton}
                onPress={() => { setDifficulty(level); setShowTimerSelection(true); }}
              >
                <View style={styles.difficultyContent}>
                  <View style={[styles.difficultyAvatar, { backgroundColor: BOT_COLORS[level], alignItems: "center", justifyContent: "center" }]}>
                    <Bot size={28} color="#FFFFFF" strokeWidth={1.5} />
                  </View>
                  <View style={styles.difficultyInfo}>
                    <Text style={styles.difficultyName}>{labels[level].name}</Text>
                    <Text style={styles.difficultyDesc}>{labels[level].desc}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>
    );
  }

  // Screen 2: Timer selection
  if (showTimerSelection) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <View style={styles.headerSimple}>
          <TouchableOpacity style={styles.backButton} onPress={() => { setDifficulty(null); setShowTimerSelection(false); }}>
            <X size={24} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitleCentered}>Select Timer</Text>
        </View>

        <View style={styles.difficultyContainer}>
          <Text style={styles.difficultyTitle}>Choose Game Timer</Text>

          <TouchableOpacity
            style={styles.timerButton}
            onPress={() => { setTimeLimit(180); setPlayerTime(180); setBotTime(180); setShowTimerSelection(false); }}
          >
            <Text style={styles.timerText}>3 Minutes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.timerButton}
            onPress={() => { setTimeLimit(300); setPlayerTime(300); setBotTime(300); setShowTimerSelection(false); }}
          >
            <Text style={styles.timerText}>5 Minutes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.timerButton}
            onPress={() => { setTimeLimit(600); setPlayerTime(600); setBotTime(600); setShowTimerSelection(false); }}
          >
            <Text style={styles.timerText}>10 Minutes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.timerButton}
            onPress={() => { setTimeLimit(900); setPlayerTime(900); setBotTime(900); setShowTimerSelection(false); }}
          >
            <Text style={styles.timerText}>15 Minutes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.timerButton, styles.noLimitButton]}
            onPress={() => { setTimeLimit(null); setShowTimerSelection(false); }}
          >
            <Text style={styles.timerText}>No Time Limit</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // Screen 3: Active game
  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleReset}>
          <RotateCcw size={20} color="#FFD700" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("practiceMode")}</Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <X size={20} color="#FFD700" />
        </TouchableOpacity>
      </View>

      <View style={styles.info}>
        {timeLimit && (
          <View style={styles.timerContainer}>
            <View style={styles.timerBox}>
              <Text style={styles.timerLabel}>Computer</Text>
              <Text style={styles.timerValue}>{formatTime(botTime)}</Text>
            </View>
            <View style={styles.timerBox}>
              <Text style={styles.timerLabel}>You</Text>
              <Text style={styles.timerValue}>{formatTime(playerTime)}</Text>
            </View>
          </View>
        )}
        <View style={styles.opponentInfo}>
          <View style={[styles.opponentAvatar, { backgroundColor: botColor, alignItems: "center", justifyContent: "center" }]}>
            <Bot size={22} color="#FFFFFF" strokeWidth={1.5} />
          </View>
          <View>
            <Text style={styles.infoText}>Opponent: {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Bot</Text>
          </View>
        </View>
      </View>

      <View style={styles.boardWrapper}>
        <View style={styles.rankLabels}>
          {["8","7","6","5","4","3","2","1"].map((rank) => (
            <View key={rank} style={[styles.coordLabel, { height: SQUARE_SIZE }]}>
              <Text style={styles.coordText}>{rank}</Text>
            </View>
          ))}
        </View>
        <View style={styles.boardAndFiles}>
          <View style={styles.chessBoard}>
            {board.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((piece, colIndex) => {
                  const isLight = (rowIndex + colIndex) % 2 === 0;
                  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
                  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
                  const square = (files[colIndex] + ranks[rowIndex]) as Square;
                  const isSelected = selectedSquare === square;
                  const isPossibleMove = possibleMoves.includes(square);
                  const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);
                  const themeColors = BOARD_THEMES[boardTheme as keyof typeof BOARD_THEMES];

                  return (
                    <TouchableOpacity
                      key={`${rowIndex}-${colIndex}`}
                      style={[
                        styles.square,
                        { backgroundColor: isLight ? themeColors.light : themeColors.dark },
                        isLastMoveSquare && styles.lastMoveHighlight,
                        isSelected && styles.selectedSquare,
                      ]}
                      onPress={() => handleSquarePress(rowIndex, colIndex)}
                    >
                      {square === illegalSquare && (
                        <Animated.View style={[StyleSheet.absoluteFillObject, styles.illegalOverlay, illegalStyle]} />
                      )}
                      {isPossibleMove && (
                        animEnabled ? (
                          <Animated.View style={[
                            styles.possibleMoveDot,
                            piece ? styles.captureIndicatorGlow : styles.moveIndicatorGlow,
                            legalGlowStyle,
                          ]} />
                        ) : (
                          <View style={styles.possibleMoveDot} />
                        )
                      )}
                      {piece && !(glideState && (square === glideState.from || square === glideState.to)) && (
                        <View style={styles.pieceContainer}>
                          <ChessPieceComponent
                            type={piece.type}
                            color={piece.color}
                            size={SQUARE_SIZE * 0.75}
                            style={pieceStyle}
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <BoardAnimationOverlay
              boardSize={BOARD_SIZE}
              squareSize={SQUARE_SIZE}
              isFlipped={false}
              glideState={glideState}
              pieceStyle={pieceStyle}
              captureSquare={captureSquare}
              onGlideComplete={handleGlideComplete}
              onCaptureComplete={handleCaptureComplete}
            />
          </View>
          <View style={styles.fileLabels}>
            {["a","b","c","d","e","f","g","h"].map((file) => (
              <View key={file} style={[styles.coordLabel, { width: SQUARE_SIZE }]}>
                <Text style={styles.coordText}>{file}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.turnText}>
          {game.turn() === "w" ? "Your Turn (White)" : "Computer's Turn (Black)"}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerSimple: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleCentered: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    textAlign: "center",
    marginRight: 44,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  info: {
    alignItems: "center",
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: "#4CAF82",
    fontWeight: "600" as const,
  },

  // Board wrapper with coordinates
  boardWrapper: {
    flexDirection: "row",
    alignSelf: "center",
  },
  rankLabels: {
    justifyContent: "flex-start",
    marginRight: 4,
  },
  boardAndFiles: {
    alignItems: "center",
  },
  fileLabels: {
    flexDirection: "row",
    marginTop: 4,
  },
  coordLabel: {
    justifyContent: "center",
    alignItems: "center",
  },
  coordText: {
    color: "#A0A0A0",
    fontSize: 10,
    fontWeight: "600" as const,
  },

  chessBoard: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    alignSelf: "center",
    borderWidth: 2,
    borderColor: "#FFD700",
    overflow: "hidden",
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
    backgroundColor: "#9BCF53",
  },
  lastMoveHighlight: {
    backgroundColor: "rgba(255, 215, 0, 0.3)",
  },
  illegalOverlay: {
    backgroundColor: "rgba(255, 30, 30, 0.6)",
    zIndex: 5,
  },
  possibleMoveDot: {
    position: "absolute",
    width: SQUARE_SIZE * 0.32,
    height: SQUARE_SIZE * 0.32,
    borderRadius: SQUARE_SIZE * 0.16,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  moveIndicatorGlow: {
    backgroundColor: "rgba(0, 220, 80, 0.75)",
  },
  captureIndicatorGlow: {
    width: SQUARE_SIZE - 4,
    height: SQUARE_SIZE - 4,
    borderRadius: SQUARE_SIZE / 2,
    backgroundColor: "transparent",
    borderWidth: 3,
    borderColor: "rgba(0, 220, 80, 0.75)",
  },
  pieceContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    marginTop: 20,
    alignItems: "center",
  },
  turnText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },

  // Difficulty selection
  difficultyContainer: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  difficultyTitle: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 30,
  },
  difficultyButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#4CAF82",
  },
  difficultyContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  difficultyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  difficultyInfo: {
    flex: 1,
  },
  difficultyName: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  difficultyDesc: {
    fontSize: 14,
    color: "#4CAF82",
  },
  opponentInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  opponentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#FFD700",
  },

  // Timer
  timerButton: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#4CAF82",
    alignItems: "center",
  },
  timerText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  noLimitButton: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderColor: "#FFD700",
  },
  timerContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 16,
  },
  timerBox: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    borderRadius: 12,
    padding: 12,
    minWidth: 100,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#4CAF82",
  },
  timerLabel: {
    fontSize: 12,
    color: "#4CAF82",
    fontWeight: "600" as const,
    marginBottom: 4,
  },
  timerValue: {
    fontSize: 20,
    color: "#FFFFFF",
    fontWeight: "700" as const,
  },

  // Game Over screen
  gameOverScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingTop: 40,
  },
  gameOverContent: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 24,
    padding: 40,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  gameOverDragonAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: "#FFD700",
    marginBottom: 20,
  },
  gameOverTitle: {
    fontSize: 36,
    fontWeight: "800" as const,
    color: "#FFD700",
    marginTop: 20,
  },
  gameOverTitleLoss: {
    fontSize: 36,
    fontWeight: "800" as const,
    color: "#FF4444",
    marginTop: 20,
  },
  gameOverTitleDraw: {
    fontSize: 36,
    fontWeight: "800" as const,
    color: "#A0A0A0",
    marginTop: 20,
  },
  gameOverReason: {
    fontSize: 16,
    color: "#A0A0A0",
    marginTop: 12,
    textAlign: "center",
  },
  gameOverDifficultyLabel: {
    fontSize: 14,
    color: "#4CAF82",
    fontWeight: "600" as const,
    marginTop: 8,
  },
  gameOverMoveCount: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 16,
  },
  gameOverMoveCountText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
  gameOverButtons: {
    width: "100%",
    gap: 12,
    marginTop: 32,
  },
  gameOverButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  gameOverButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  gameOverButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  gameOverSecondaryButton: {
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  gameOverSecondaryButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  gameOverFeedbackButton: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  gameOverFeedbackButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFD700",
  },

  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    backgroundColor: "transparent",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  shareButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFD700",
  },

  // Feedback mode
  feedbackScrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 80,
    alignItems: "center",
  },
  closeFeedbackButton: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  feedbackHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  feedbackTitle: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    marginTop: 12,
  },
  feedbackSubtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 4,
  },
  feedbackBoardContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
  },
  moveInfoCard: {
    marginTop: 16,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    alignItems: "center",
  },
  moveNotation: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: "#FFD700",
  },
  moveDescription: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 4,
  },
  // Feedback Message Box
  feedbackMessageBox: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    minHeight: 120,
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 215, 0, 0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  feedbackMessageText: {
    fontSize: 17,
    lineHeight: 26,
    color: "#1A1A2E",
    fontWeight: "500" as const,
    textAlign: "left",
  },
  feedbackLoadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  feedbackLoadingText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600" as const,
  },
  // Next Button - Primary
  nextButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  nextButtonLast: {
    // Different color when it's the last move
  },
  nextButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: "#0F0F1E",
  },
  // Move Progress
  moveProgressContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  moveProgressText: {
    fontSize: 14,
    color: "#A0A0A0",
    fontWeight: "600" as const,
    marginBottom: 8,
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FFD700",
    borderRadius: 3,
  },
  // Previous Button - Secondary
  previousButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 16,
  },
  previousButtonText: {
    fontSize: 16,
    color: "#A0A0A0",
    fontWeight: "600" as const,
  },
  backToResultsButton: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  backToResultsButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
});
