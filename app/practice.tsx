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
import { RotateCcw, X, Trophy, ChevronLeft, ChevronRight, MessageCircle, Share2 } from "lucide-react-native";
import { VictoryCelebration, AnimatedDragons } from "@/components/VictoryCelebration";
import { useApp } from "@/contexts/AppContext";
import { ChessPieceComponent } from "@/components/ChessPieces";
import { useSettingsStore } from "@/stores/settingsStore";
import type { BoardTheme } from "@/types";

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

const BABY_DRAGON_AVATARS = [
  "https://r2-pub.rork.com/generated-images/c6e13d72-4e3e-4370-ac6c-d36eb6e5ee42.png",
  "https://r2-pub.rork.com/generated-images/50e45f39-9e13-44e4-919a-ab70e0c5e0be.png",
  "https://r2-pub.rork.com/generated-images/e55af6fb-4f83-4609-92a2-fa5a2c0db1e3.png",
  "https://r2-pub.rork.com/generated-images/ec61f93d-e18a-4495-826a-c39f9bb8e7dd.png",
  "https://r2-pub.rork.com/generated-images/72f6c5a0-ca33-45b0-983e-1eb9d163e8bb.png",
  "https://r2-pub.rork.com/generated-images/a3fb5afd-fa35-4f50-bf05-ab2b20e24be3.png",
  "https://r2-pub.rork.com/generated-images/0e4b27b6-03c8-4ed4-9d3b-5a43d35edc67.png",
  "https://r2-pub.rork.com/generated-images/1ecfe1df-5b1c-4dfd-a43e-3e1a84b85c41.png",
  "https://r2-pub.rork.com/generated-images/5207e46f-41e3-4e48-b46c-df1ff0aa8bcd.png",
];

const TEENAGE_DRAGON_AVATARS = [
  "https://r2-pub.rork.com/generated-images/0d77351e-5ae4-4fd4-85c9-d40337247e61.png",
  "https://r2-pub.rork.com/generated-images/2c7178ac-3096-416e-be22-cf009c5c489d.png",
  "https://r2-pub.rork.com/generated-images/69b5e875-14b0-4b40-bf22-96c695d6b2be.png",
  "https://r2-pub.rork.com/generated-images/47fcabb7-7000-4456-83c2-e6859069b70d.png",
  "https://r2-pub.rork.com/generated-images/f42d0447-3172-4b8a-80a2-d2b2050ff66a.png",
  "https://r2-pub.rork.com/generated-images/4d9bc44e-e1de-464f-8f12-4c7fe48c84d3.png",
  "https://r2-pub.rork.com/generated-images/af03441f-c644-46ce-8ab1-44a2a267ba28.png",
  "https://r2-pub.rork.com/generated-images/7b7d41b2-8aaf-4077-b084-b463d9da58c5.png",
  "https://r2-pub.rork.com/generated-images/4891fc39-750e-4ebd-b2fa-73600f8549a0.png",
];

const NON_FIERCE_ADULT_AVATARS = [
  "https://r2-pub.rork.com/generated-images/d5421ced-b222-469e-86e9-bf57414cd738.png",
  "https://r2-pub.rork.com/generated-images/46bcf6c6-8dca-4af3-aa89-ce289ea66004.png",
  "https://r2-pub.rork.com/generated-images/2f70b854-6a4a-4f81-a1c8-857d5031cd61.png",
  "https://r2-pub.rork.com/generated-images/adf6e262-3a9b-4cdf-9e15-d41f4d687826.png",
  "https://r2-pub.rork.com/generated-images/b3053a7e-b6e6-45fd-aded-154af7b1bd06.png",
  "https://r2-pub.rork.com/generated-images/6086acd7-2054-4db0-a38b-ddb62d8173a7.png",
  "https://r2-pub.rork.com/generated-images/d4928689-63db-46a9-a7c4-806463141952.png",
  "https://r2-pub.rork.com/generated-images/637923f8-0483-4397-8775-a745526d7f32.png",
  "https://r2-pub.rork.com/generated-images/6c6df691-2973-4fa3-9236-d8ce2ce0a9b5.png",
];

const FIERCE_ADULT_AVATARS = [
  "https://r2-pub.rork.com/generated-images/4090decb-e03e-4e1e-836d-6a97455932cf.png",
  "https://r2-pub.rork.com/generated-images/4924e9b1-d303-43b7-8b57-3476ed6f13d1.png",
  "https://r2-pub.rork.com/generated-images/a3c6b842-cef7-4a61-a6c9-f84aeac959f8.png",
  "https://r2-pub.rork.com/generated-images/3f3a6e15-3411-4972-8348-766fa05572db.png",
  "https://r2-pub.rork.com/generated-images/6233121d-9638-41cd-9cc0-831af74194eb.png",
  "https://r2-pub.rork.com/generated-images/3f21ea07-c0f6-4802-9c4e-d7df12cc6b31.png",
  "https://r2-pub.rork.com/generated-images/c7776511-a385-4bf9-a051-7cce392c1409.png",
  "https://r2-pub.rork.com/generated-images/d0da5601-05dc-405b-b099-4e6b1ff8dd3e.png",
  "https://r2-pub.rork.com/generated-images/30e626dc-e0de-411a-859d-edd24d7608fc.png",
];

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
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  // Game history & result
  const [gameHistory, setGameHistory] = useState<Move[]>([]);
  const [gameResult, setGameResult] = useState<{ winner: 'player' | 'opponent' | 'draw'; reason: string } | null>(null);

  // Feedback mode
  const [feedbackMode, setFeedbackMode] = useState<boolean>(false);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(0);
  const [moveFeedback, setMoveFeedback] = useState<Record<number, string>>({});
  const [loadingFeedback, setLoadingFeedback] = useState<boolean>(false);

  const botAvatar = useMemo(() => {
    if (!difficulty) return null;

    switch (difficulty) {
      case "beginner":
        return BABY_DRAGON_AVATARS[0];
      case "rookie":
        return TEENAGE_DRAGON_AVATARS[Math.floor(Math.random() * TEENAGE_DRAGON_AVATARS.length)];
      case "adept":
        return NON_FIERCE_ADULT_AVATARS[Math.floor(Math.random() * NON_FIERCE_ADULT_AVATARS.length)];
      case "expert":
        return FIERCE_ADULT_AVATARS[Math.floor(Math.random() * FIERCE_ADULT_AVATARS.length)];
      default:
        return null;
    }
  }, [difficulty]);

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
        }
      } else {
        try {
          const result = game.move({
            from: selectedSquare,
            to: square,
            promotion: "q",
          });

          if (result) {
            setGameHistory(prev => [...prev, result]);
            setLastMove({ from: result.from as Square, to: result.to as Square });
          }
          setBoard(getBoardArray(game));
          setSelectedSquare(null);

          if (game.isCheckmate()) {
            setGameResult({ winner: 'player', reason: 'Checkmate' });
          } else if (game.isDraw()) {
            setGameResult({ winner: 'draw', reason: game.isStalemate() ? 'Stalemate' : 'Draw' });
          } else {
            setTimeout(() => makeComputerMove(), 500);
          }
        } catch (error) {
          console.log("Invalid move:", error);
          setSelectedSquare(null);
        }
      }
    },
    [selectedSquare, game, gameResult, makeComputerMove]
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
              colors={currentMoveIndex === playerMoveIndices.length - 1 ? ["#4ECDC4", "#45B7AA"] : ["#FFD700", "#FFA500"]}
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

          <TouchableOpacity
            style={styles.difficultyButton}
            onPress={() => { setDifficulty("beginner"); setShowTimerSelection(true); }}
          >
            <View style={styles.difficultyContent}>
              <Image
                source={{ uri: BABY_DRAGON_AVATARS[0] }}
                style={styles.difficultyAvatar}
              />
              <View style={styles.difficultyInfo}>
                <Text style={styles.difficultyName}>Beginner</Text>
                <Text style={styles.difficultyDesc}>Perfect for learning</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.difficultyButton}
            onPress={() => { setDifficulty("rookie"); setShowTimerSelection(true); }}
          >
            <View style={styles.difficultyContent}>
              <Image source={{ uri: TEENAGE_DRAGON_AVATARS[0] }} style={styles.difficultyAvatar} />
              <View style={styles.difficultyInfo}>
                <Text style={styles.difficultyName}>Rookie</Text>
                <Text style={styles.difficultyDesc}>Some challenge</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.difficultyButton}
            onPress={() => { setDifficulty("adept"); setShowTimerSelection(true); }}
          >
            <View style={styles.difficultyContent}>
              <Image source={{ uri: NON_FIERCE_ADULT_AVATARS[0] }} style={styles.difficultyAvatar} />
              <View style={styles.difficultyInfo}>
                <Text style={styles.difficultyName}>Adept</Text>
                <Text style={styles.difficultyDesc}>Real competition</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.difficultyButton}
            onPress={() => { setDifficulty("expert"); setShowTimerSelection(true); }}
          >
            <View style={styles.difficultyContent}>
              <Image source={{ uri: FIERCE_ADULT_AVATARS[0] }} style={styles.difficultyAvatar} />
              <View style={styles.difficultyInfo}>
                <Text style={styles.difficultyName}>Expert</Text>
                <Text style={styles.difficultyDesc}>Ultimate challenge</Text>
              </View>
            </View>
          </TouchableOpacity>
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
          {botAvatar && <Image source={{ uri: botAvatar }} style={styles.opponentAvatar} />}
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
                    </TouchableOpacity>
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
    color: "#4ECDC4",
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
    borderColor: "#4ECDC4",
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
    color: "#4ECDC4",
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
    borderColor: "#4ECDC4",
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
    borderColor: "#4ECDC4",
  },
  timerLabel: {
    fontSize: 12,
    color: "#4ECDC4",
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
    color: "#4ECDC4",
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
