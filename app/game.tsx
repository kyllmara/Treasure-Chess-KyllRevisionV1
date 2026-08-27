import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ScrollView,
  Image,
  Animated,
  ActivityIndicator,
  Share,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Chess, Square, Move } from "chess.js";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Clock, Trophy, X, ChevronLeft, ChevronRight, MessageCircle, Share2, RotateCcw } from "lucide-react-native";
import { useApp } from "@/contexts/AppContext";
import { ChessPieceComponent } from "@/components/ChessPieces";
import { PawnPromotionModal } from "@/components/PawnPromotionModal";
import type { BetAmount, BoardTheme } from "@/types";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";
import { useSettingsStore } from "@/stores/settingsStore";
import ConfettiCannon from "react-native-confetti-cannon";
import { generateText } from "@rork-ai/toolkit-sdk";
import { VictoryCelebration, AnimatedDragons, SpinningRays } from "@/components/VictoryCelebration";
import { AntiCheatService, createAntiCheatService, type GameMoveData } from "@/lib/antiCheat";
import { RewardUnlockAnimation } from "@/components/RewardUnlockAnimation";
const TCT_COIN_IMAGE = require("@/assets/images/ui/coin_stack.png");
import { useRewardTriggers, type UnlockedReward, type EarnedAchievement } from "@/hooks/useRewards";
import { useWalletStore } from "@/stores/walletStore";
import { useAuth } from "@/hooks/useAuth";
import { lockFundsForChallenge, unlockFundsForChallenge } from "@/lib/escrow";
import { supabase } from "@/lib/supabase";
import ReAnimated, { useAnimatedStyle } from "react-native-reanimated";
import { useMoveAnimations } from "@/hooks/useMoveAnimations";
import { BoardAnimationOverlay } from "@/components/BoardAnimationOverlay";

const { width } = Dimensions.get("window");
const BOARD_SIZE = Math.min(width - 40, 360);
const SQUARE_SIZE = BOARD_SIZE / 8;
const GAME_DURATION = 120;
const BET_AMOUNTS: BetAmount[] = [5, 10, 25, 50];
const TCT_TO_USD = 0.04;

function usdToTCT(usd: number): number {
  return usd / TCT_TO_USD;
}

type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
type PieceColor = "w" | "b";

interface ChessPiece {
  type: PieceSymbol;
  color: PieceColor;
}

const PIECE_SYMBOLS: Record<string, string> = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> = {
  purple: { light: "#FFFFFF", dark: "#9B7EC8" },
  classic: { light: "#FFFFFF", dark: "#000000" },
  eco: { light: "#8B4513", dark: "#6B8E23" },
  retro: { light: "#E8D7B8", dark: "#A67C52" },
};

export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, placeBet, winGame, loseGame } = useApp();
  const {
    playMove,
    playPiecePickup,
    playIllegalMove,
    playGameStart,
    playWin,
    playLose,
    playDraw,
    playLowTime,
    playButtonPress,
    isSoundEnabled,
    isHapticEnabled,
  } = useSoundAndHaptics();
  const { game: gameSettings } = useSettingsStore();
  const { profile } = useAuth();
  // Get TCT balance from wallet store (single source of truth)
  const { tctBalance, tctToUsd, refreshBalance } = useWalletStore();
  const [game] = useState<Chess>(new Chess());
  const [board, setBoard] = useState<(ChessPiece | null)[][]>(
    getBoardArray(game)
  );
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([]);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [betAmount, setBetAmount] = useState<BetAmount | null>(null);
  const [playerTime, setPlayerTime] = useState<number>(GAME_DURATION);
  const [opponentTime, setOpponentTime] = useState<number>(GAME_DURATION);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [capturedByPlayer, setCapturedByPlayer] = useState<ChessPiece[]>([]);
  const [capturedByOpponent, setCapturedByOpponent] = useState<ChessPiece[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState<boolean>(true);
  const [gameResult, setGameResult] = useState<{ winner: 'player' | 'opponent' | 'draw'; reason: string } | null>(null);
  const [moveCount, setMoveCount] = useState<number>(0);
  const [queenSacrificed, setQueenSacrificed] = useState<boolean>(false);
  const [checkmatingPiece, setCheckmatingPiece] = useState<PieceSymbol | null>(null);
  const coinAnimations = useRef<Animated.Value[]>([]);
  const [showCoins, setShowCoins] = useState<boolean>(false);
  const [gameHistory, setGameHistory] = useState<Move[]>([]);
  const [feedbackMode, setFeedbackMode] = useState<boolean>(false);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(0);
  const [moveFeedback, setMoveFeedback] = useState<Record<number, string>>({});
  const [loadingFeedback, setLoadingFeedback] = useState<boolean>(false);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [justUnlockedTeenageDragons, setJustUnlockedTeenageDragons] = useState<boolean>(false);

  // Anti-cheat tracking
  const antiCheatRef = useRef<AntiCheatService | null>(null);
  const moveStartTimeRef = useRef<number>(Date.now());
  const [showRematchOffer, setShowRematchOffer] = useState<boolean>(false);
  const [rematchCountdown, setRematchCountdown] = useState<number>(30);
  const [justUnlockedNonFierceAdults, setJustUnlockedNonFierceAdults] = useState<boolean>(false);
  const [justUnlockedFierceAdults, setJustUnlockedFierceAdults] = useState<boolean>(false);
  const [unlockTier, setUnlockTier] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const gameResultRef = useRef<View>(null);

  // Rewards system integration
  const { checkForUnlocks, newlyUnlocked, newlyEarned, clearNewlyUnlocked } = useRewardTriggers();
  const [showRewardAnimation, setShowRewardAnimation] = useState<boolean>(false);
  const rewardCheckPerformed = useRef<boolean>(false);

  // House challenge fund locking
  const [houseFundsLocked, setHouseFundsLocked] = useState<boolean>(false);
  const houseChallengeSettled = useRef<boolean>(false);

  const isHouseChallenge = !!params.challengeId;
  const challengeName = params.challengeName as string | undefined;
  const challengeDescription = params.challengeDescription as string | undefined;
  const challengeAmount = params.challengeAmount ? parseFloat(params.challengeAmount as string) : null;
  const challengeObjectiveType = params.challengeObjectiveType as string | undefined;
  const challengeObjectiveValue = params.challengeObjectiveValue as string | undefined;

  const isP2PChallenge = !!params.betAmount && !!params.opponent;
  const p2pBetAmount = params.betAmount ? parseFloat(params.betAmount as string) : null;
  const p2pOpponent = params.opponent as string | undefined;
  const p2pOpponentRating = params.opponentRating ? parseInt(params.opponentRating as string) : undefined;
  const p2pOpponentCountry = params.opponentCountry as string | undefined;
  const p2pOpponentAvatar = params.opponentAvatar as string | undefined;
  const customGameClock = params.gameClock ? parseInt(params.gameClock as string) : GAME_DURATION;

  // Online challenge game (from challenge board - both players have locked USDC in escrow)
  const isOnlineChallenge = !!params.gameId && !!params.wagerTct;
  const onlineGameId = params.gameId as string | undefined;
  const onlineWagerTct = params.wagerTct ? parseInt(params.wagerTct as string) : 0;
  const onlineTimeControl = params.timeControl ? parseInt(params.timeControl as string) : GAME_DURATION;

  // Tournament game (from tournament bracket - wager already set at tournament level)
  const isTournamentGame = !!params.matchId && !params.wagerTct;
  const tournamentGameId = params.matchId as string | undefined;

  // Use settings from the centralized settings store
  const boardTheme = gameSettings?.boardTheme || "purple";
  const pieceStyle = gameSettings?.pieceStyle || "unity";

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


  useEffect(() => {
    if (isHouseChallenge && challengeAmount && !gameStarted) {
      const requiredTct = usdToTCT(challengeAmount);
      if (requiredTct > tctBalance) {
        Alert.alert("Insufficient Funds", `You need ${requiredTct.toLocaleString()} TCT to start this challenge.`, [
          { text: "Top Up", onPress: () => router.push("/wallet" as any) },
          { text: "Cancel", onPress: () => router.back(), style: "cancel" }
        ]);
        return;
      }

      // Lock player's funds via escrow before starting
      const lockAndStart = async () => {
        if (!profile?.id) {
          Alert.alert("Error", "Please sign in to play house challenges.", [
            { text: "OK", onPress: () => router.back() }
          ]);
          return;
        }

        const houseChallengeId = `house_${params.challengeId}_${Date.now()}`;
        const lockResult = await lockFundsForChallenge(profile.id, requiredTct, houseChallengeId);

        if (!lockResult.success) {
          Alert.alert("Error", lockResult.error || "Failed to lock funds for challenge.", [
            { text: "OK", onPress: () => router.back() }
          ]);
          return;
        }

        setHouseFundsLocked(true);
        setBetAmount(challengeAmount as BetAmount);
        setPlayerTime(customGameClock);
        setOpponentTime(customGameClock);
        setGameStarted(true);
        playGameStart();
      };

      lockAndStart();
    }

    if (isP2PChallenge && p2pBetAmount && !gameStarted) {
      // Convert USD amount to TCT for balance check (1 TCT = $0.04)
      const requiredTct = usdToTCT(p2pBetAmount);
      if (requiredTct > tctBalance) {
        Alert.alert("Insufficient Funds", "Please add more funds to your wallet", [
          { text: "OK", onPress: () => router.back() }
        ]);
        return;
      }
      try {
        placeBet(p2pBetAmount as BetAmount);
        setBetAmount(p2pBetAmount as BetAmount);
        setPlayerTime(customGameClock);
        setOpponentTime(customGameClock);
        setGameStarted(true);
        // Initialize anti-cheat for online games
        const gameId = params.gameId as string || `game_${Date.now()}`;
        antiCheatRef.current = createAntiCheatService(gameId, user.username);
        moveStartTimeRef.current = Date.now();
      } catch {
        Alert.alert("Error", "Failed to place bet", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }
    }

    // Tournament game (from tournament bracket - entry fee already locked)
    if (isTournamentGame && tournamentGameId && !gameStarted) {
      console.log("[Game] Starting tournament game:", { gameId: tournamentGameId });
      (async () => {
        try {
          // Fetch the game record to get time control
          const { data: gameRecord } = await (supabase as any)
            .from("games")
            .select("time_control_seconds, wager_tct")
            .eq("id", tournamentGameId)
            .single();

          const timeControl = gameRecord?.time_control_seconds || GAME_DURATION;
          setBetAmount(0 as BetAmount);
          setPlayerTime(timeControl);
          setOpponentTime(timeControl);
          setGameStarted(true);
          antiCheatRef.current = createAntiCheatService(tournamentGameId, user.username);
          moveStartTimeRef.current = Date.now();
          playGameStart();
        } catch (err) {
          console.error("[Game] Failed to start tournament game:", err);
          Alert.alert("Error", "Failed to start tournament game", [
            { text: "OK", onPress: () => router.back() }
          ]);
        }
      })();
    }

    // Online challenge game (from challenge board - USDC already locked in escrow)
    if (isOnlineChallenge && onlineGameId && !gameStarted) {
      console.log("[Game] Starting online challenge game:", {
        gameId: onlineGameId,
        wagerTct: onlineWagerTct,
        timeControl: onlineTimeControl,
      });
      try {
        // No need to place bet - USDC already locked in smart contract escrow
        // Convert TCT to USD for display purposes
        const wagerUsd = (onlineWagerTct * TCT_TO_USD) as BetAmount;
        setBetAmount(wagerUsd);
        setPlayerTime(onlineTimeControl);
        setOpponentTime(onlineTimeControl);
        setGameStarted(true);
        // Initialize anti-cheat for online games
        antiCheatRef.current = createAntiCheatService(onlineGameId, user.username);
        moveStartTimeRef.current = Date.now();
        playGameStart();
      } catch (err) {
        console.error("[Game] Failed to start online challenge:", err);
        Alert.alert("Error", "Failed to start game", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }
    }
  }, [isHouseChallenge, isP2PChallenge, isOnlineChallenge, isTournamentGame, challengeAmount, p2pBetAmount, onlineGameId, onlineWagerTct, onlineTimeControl, tournamentGameId, gameStarted, customGameClock, tctBalance, placeBet, router, params.gameId, params.challengeId, user.username, playGameStart, playButtonPress, profile?.id]);

  const checkChallengeObjective = useCallback((overrideCheckmatingPiece?: PieceSymbol | null): boolean => {
    if (!isHouseChallenge || !challengeObjectiveType) return true;

    switch (challengeObjectiveType) {
      case "checkmate_in_moves":
        const maxMoves = parseInt(challengeObjectiveValue || "0");
        return moveCount <= maxMoves;
      case "checkmate_with_piece":
        // Use override if provided (since state may not be updated yet in same render)
        const piece = overrideCheckmatingPiece !== undefined ? overrideCheckmatingPiece : checkmatingPiece;
        return piece === challengeObjectiveValue;
      case "sacrifice_queen":
        return queenSacrificed && game.isCheckmate();
      default:
        return true;
    }
  }, [isHouseChallenge, challengeObjectiveType, challengeObjectiveValue, moveCount, checkmatingPiece, queenSacrificed, game]);

  // Settle house challenge: unlock funds on win (vault pays prize), forfeit on loss
  const settleHouseChallenge = useCallback(async (objectiveMet: boolean) => {
    if (!isHouseChallenge || !profile?.id || !houseFundsLocked || houseChallengeSettled.current) return;
    houseChallengeSettled.current = true;

    const wagerTct = challengeAmount ? usdToTCT(challengeAmount) : 0;
    const houseChallengeId = `house_${params.challengeId}_${Date.now()}`;

    if (objectiveMet) {
      // Player wins: unlock their stake + vault pays the prize
      // Unlock player's locked funds
      await unlockFundsForChallenge(profile.id, wagerTct, houseChallengeId);
      // The vault payout is handled server-side via the escrow settlement
      // For now, trigger a balance refresh to reflect the unlocked funds
      console.log("[Game] House challenge WON - unlocking", wagerTct, "TCT, vault pays prize");
    } else {
      // Player loses: their locked funds go to the platform vault
      // The lock_balance_for_challenge already moved funds to locked state
      // On loss, the funds stay locked/forfeited (vault keeps them)
      console.log("[Game] House challenge LOST - forfeiting", wagerTct, "TCT to vault");
    }

    // Refresh wallet balance to reflect changes
    if (profile.id) {
      setTimeout(() => refreshBalance(profile.id), 1000);
    }
  }, [isHouseChallenge, profile?.id, houseFundsLocked, challengeAmount, params.challengeId, refreshBalance]);

  // Record move for anti-cheat analysis
  const recordMoveForAntiCheat = useCallback((moveObj: Move, fenAfter: string) => {
    if (!antiCheatRef.current) return;

    const thinkTimeMs = Date.now() - moveStartTimeRef.current;

    const moveData: GameMoveData = {
      moveNumber: Math.ceil(moveCount / 2) + 1,
      san: moveObj.san,
      thinkTimeMs,
      isCapture: !!moveObj.captured,
      isCheck: game.inCheck(),
      isCheckmate: game.isCheckmate(),
      isCastling: moveObj.san === 'O-O' || moveObj.san === 'O-O-O',
      fenAfter,
    };

    antiCheatRef.current.recordMove(moveData);
    // Reset timer for next move
    moveStartTimeRef.current = Date.now();
  }, [moveCount, game]);

  // Analyze game for anti-cheat at game end
  const analyzeGameForAntiCheat = useCallback(async () => {
    if (!antiCheatRef.current || !isP2PChallenge) return;

    const analysis = antiCheatRef.current.analyzeGame();

    if (analysis.shouldFlag) {
      console.warn('[AntiCheat] Suspicious activity detected:', analysis.report);
      // Save report for review
      await antiCheatRef.current.saveReport(analysis.report);
    }

    // Log analysis result for debugging
    console.log('[AntiCheat] Game analysis:', {
      suspicionScore: analysis.report.suspicionScore,
      flags: analysis.report.flags,
      recommendation: analysis.report.recommendation,
    });
  }, [isP2PChallenge]);

  const handleTimeOut = useCallback((isPlayer: boolean) => {
    setGameOver(true);
    const history = game.history({ verbose: true });
    setGameHistory(history);
    if (isPlayer) {
      if (isHouseChallenge) {
        // Player ran out of time - challenge failed, funds forfeited
        settleHouseChallenge(false);
        setGameResult({ winner: 'opponent', reason: "You ran out of time - challenge failed" });
      } else {
        if (betAmount) {
          loseGame(betAmount);
        }
        setGameResult({ winner: 'opponent', reason: "You ran out of time" });
      }
    } else {
      if (betAmount) {
        if (isHouseChallenge) {
          // Opponent (computer) ran out of time - but house challenges require checkmate
          settleHouseChallenge(false);
          setGameResult({ winner: 'draw', reason: "Opponent ran out of time - challenge requires checkmate to win prize" });
        } else {
          winGame(betAmount, false);
          setGameResult({ winner: 'player', reason: "Opponent ran out of time" });
        }
      }
    }
  }, [betAmount, winGame, loseGame, isHouseChallenge, settleHouseChallenge, game]);

  // Track if low time warning has been played
  const lowTimeWarningPlayed = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (gameStarted && !gameOver) {
      interval = setInterval(() => {
        if (isPlayerTurn) {
          setPlayerTime((prev) => {
            if (prev <= 1) {
              handleTimeOut(true);
              return 0;
            }
            // Play low time warning at 10 seconds
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
  }, [gameStarted, gameOver, isPlayerTurn, handleTimeOut, playLowTime]);

  // Check for reward unlocks when game ends
  useEffect(() => {
    if (gameOver && gameResult && !rewardCheckPerformed.current) {
      rewardCheckPerformed.current = true;
      // Delay slightly to ensure game result is displayed first
      const timer = setTimeout(async () => {
        try {
          const result = await checkForUnlocks();
          if (result.unlockedRewards.length > 0 || result.earnedAchievements.length > 0) {
            // Wait a bit for the game over screen to be visible
            setTimeout(() => {
              setShowRewardAnimation(true);
            }, 1500);
          }
        } catch (error) {
          console.error("[GameScreen] Failed to check rewards:", error);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gameOver, gameResult, checkForUnlocks]);

  // Handle reward animation dismissal
  const handleRewardAnimationDismiss = useCallback(() => {
    setShowRewardAnimation(false);
    clearNewlyUnlocked();
  }, [clearNewlyUnlocked]);

  const handleStartGame = async (amount: BetAmount) => {
    // Convert USD amount to TCT for balance check (1 TCT = $0.04)
    const requiredTct = usdToTCT(amount);
    if (requiredTct > tctBalance) {
      Alert.alert("Insufficient Funds", "Please add more funds to your wallet");
      return;
    }

    try {
      // Play chip stack sound for stake selection
      const { AudioManager } = await import("@/lib/audio");
      AudioManager.play("chipStack");

      placeBet(amount);
      setBetAmount(amount);
      setGameStarted(true);
      playGameStart();
    } catch {
      Alert.alert("Error", "Failed to place bet");
    }
  };

  const makeComputerMove = useCallback(() => {
    const moves = game.moves();
    if (moves.length > 0) {
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      const moveObj: Move | null = game.move(randomMove);

      if (moveObj) {
        // Play sound with proper options
        playMove({
          isCapture: !!moveObj.captured,
          isCheck: game.inCheck(),
          isCastle: moveObj.san === 'O-O' || moveObj.san === 'O-O-O',
          isPromotion: !!moveObj.promotion,
        });

        setLastMove({ from: moveObj.from, to: moveObj.to });

        if (moveObj.captured) {
          const capturedPiece: ChessPiece = {
            type: moveObj.captured as PieceSymbol,
            color: "w" as PieceColor,
          };
          setCapturedByOpponent((prev) => [...prev, capturedPiece]);

          // Track queen sacrifice: opponent captures player's queen
          if (moveObj.captured === "q") {
            setQueenSacrificed(true);
          }
        }
      }

      setBoard(getBoardArray(game));
      setIsPlayerTurn(true);

      if (game.isCheckmate()) {
        setGameOver(true);
        playLose();
        const history = game.history({ verbose: true });
        setGameHistory(history);
        if (isHouseChallenge) {
          // Player got checkmated - challenge failed
          settleHouseChallenge(false);
        } else if (betAmount) {
          loseGame(betAmount);
        }
        setGameResult({ winner: 'opponent', reason: "Checkmate" });
      }
    }
  }, [game, betAmount, loseGame, playMove, playLose, isHouseChallenge, settleHouseChallenge]);

  const handleSquarePress = useCallback(
    (row: number, col: number) => {
      if (!gameStarted || gameOver) return;

      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
      const square = (files[col] + ranks[row]) as Square;

      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === 'w') {
          playPiecePickup();
          setSelectedSquare(square);
          const moves = game.moves({ square, verbose: true });
          setPossibleMoves(moves.map(move => move.to));
          startLegalGlow();
        }
      } else {
        if (!isPlayerTurn) {
          const piece = game.get(square);
          if (piece && piece.color === 'w') {
            stopLegalGlow();
            setSelectedSquare(square);
            const moves = game.moves({ square, verbose: true });
            setPossibleMoves(moves.map(move => move.to));
            startLegalGlow();
          } else {
            stopLegalGlow();
            setSelectedSquare(null);
            setPossibleMoves([]);
          }
          return;
        }

        try {
          const pieceMoving = game.get(selectedSquare);
          const capturePiece = game.get(square);

          // Check if this is a pawn promotion move
          const isPawnPromotion = pieceMoving?.type === 'p' &&
            ((pieceMoving.color === 'w' && square[1] === '8') ||
             (pieceMoving.color === 'b' && square[1] === '1'));

          // If pawn promotion and autoQueen is disabled, show modal
          if (isPawnPromotion && !user.gameSettings?.autoQueen) {
            stopLegalGlow();
            setPendingPromotion({ from: selectedSquare, to: square });
            return;
          }

          const moveObj: Move | null = game.move({
            from: selectedSquare,
            to: square,
            promotion: "q",
          });

          if (!moveObj) {
            triggerIllegalMove(selectedSquare);
            stopLegalGlow();
          }

          if (moveObj) {
            if (pieceMoving) triggerGlide(selectedSquare, square, pieceMoving, SQUARE_SIZE, isFlipped, capturePiece ? square : undefined);
            stopLegalGlow();
            // Play sound with proper move options
            playMove({
              isCapture: !!moveObj.captured,
              isCheck: game.inCheck(),
              isCastle: moveObj.san === 'O-O' || moveObj.san === 'O-O-O',
              isPromotion: !!moveObj.promotion,
            });
            setMoveCount((prev) => prev + 1);
            setLastMove({ from: moveObj.from, to: moveObj.to });

            // Record move for anti-cheat analysis
            recordMoveForAntiCheat(moveObj, game.fen());

            if (moveObj.captured) {
              const capturedPiece: ChessPiece = {
                type: moveObj.captured as PieceSymbol,
                color: "b" as PieceColor,
              };
              setCapturedByPlayer((prev) => [...prev, capturedPiece]);
            }
          }

          setBoard(getBoardArray(game));
          setSelectedSquare(null);
          setPossibleMoves([]);
          setIsPlayerTurn(false);

          if (game.isCheckmate()) {
            setGameOver(true);
            // Analyze game for anti-cheat
            analyzeGameForAntiCheat();

            const history = game.history({ verbose: true });
            const lastMoveHistory = history[history.length - 1];
            const matingPiece = lastMoveHistory ? lastMoveHistory.piece as PieceSymbol : null;
            if (matingPiece) {
              setCheckmatingPiece(matingPiece);
            }
            setGameHistory(history);

            if (isHouseChallenge && betAmount) {
              const objectiveMet = checkChallengeObjective(matingPiece);
              settleHouseChallenge(objectiveMet);
              if (objectiveMet) {
                playWin();
                setGameResult({ winner: 'player', reason: `Challenge completed! ${challengeName}` });
              } else {
                playLose();
                setGameResult({ winner: 'opponent', reason: "Challenge failed - objective not met" });
              }
            } else if (betAmount) {
              playWin();
              winGame(betAmount, true);
              setGameResult({ winner: 'player', reason: "Checkmate" });
            }
            // Show rematch offer for P2P games
            if (isP2PChallenge) {
              setShowRematchOffer(true);
              setRematchCountdown(30);
            }
          } else if (game.isDraw()) {
            setGameOver(true);
            // Analyze game for anti-cheat
            analyzeGameForAntiCheat();
            playDraw();
            const history = game.history({ verbose: true });
            setGameHistory(history);
            if (isHouseChallenge) {
              settleHouseChallenge(false);
              setGameResult({ winner: 'draw', reason: "Challenge failed - game ended in a draw" });
            } else {
              setGameResult({ winner: 'draw', reason: "Game ended in a draw" });
            }
            // Show rematch offer for P2P games
            if (isP2PChallenge) {
              setShowRematchOffer(true);
              setRematchCountdown(30);
            }
          } else {
            setTimeout(() => makeComputerMove(), 500);
          }
        } catch (error) {
          console.log("Invalid move:", error);
          triggerIllegalMove(selectedSquare);
          stopLegalGlow();
          playIllegalMove();
          const piece = game.get(square);
          if (piece && piece.color === 'w') {
            setSelectedSquare(square);
            const moves = game.moves({ square, verbose: true });
            setPossibleMoves(moves.map(move => move.to));
            startLegalGlow();
          } else {
            setSelectedSquare(null);
            setPossibleMoves([]);
          }
        }
      }
    },
    [selectedSquare, gameStarted, gameOver, game, betAmount, winGame, makeComputerMove, isHouseChallenge, checkChallengeObjective, settleHouseChallenge, challengeName, playMove, playWin, playLose, playDraw, playIllegalMove, playPiecePickup, isPlayerTurn, recordMoveForAntiCheat, analyzeGameForAntiCheat, isP2PChallenge, triggerGlide, triggerIllegalMove, startLegalGlow, stopLegalGlow]
  );

  const getPieceSize = (): number => {
    return SQUARE_SIZE * 0.85;
  };

  const handlePromotionSelect = useCallback((piece: PieceSymbol) => {
    if (!pendingPromotion) return;

    try {
      const moveObj: Move | null = game.move({
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: piece,
      });

      if (moveObj) {
        // Play promotion sound
        playMove({
          isCapture: !!moveObj.captured,
          isCheck: game.inCheck(),
          isPromotion: true,
        });
        setMoveCount((prev) => prev + 1);
        setLastMove({ from: moveObj.from, to: moveObj.to });

        // Record move for anti-cheat analysis
        recordMoveForAntiCheat(moveObj, game.fen());

        if (moveObj.captured) {
          const capturedPiece: ChessPiece = {
            type: moveObj.captured as PieceSymbol,
            color: "b" as PieceColor,
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
        setGameOver(true);
        // Analyze game for anti-cheat
        analyzeGameForAntiCheat();

        const history = game.history({ verbose: true });
        const lastMoveHistory = history[history.length - 1];
        const matingPiece = lastMoveHistory ? lastMoveHistory.piece as PieceSymbol : null;
        if (matingPiece) {
          setCheckmatingPiece(matingPiece);
        }
        setGameHistory(history);

        if (isHouseChallenge && betAmount) {
          const objectiveMet = checkChallengeObjective(matingPiece);
          settleHouseChallenge(objectiveMet);
          if (objectiveMet) {
            playWin();
            setGameResult({ winner: 'player', reason: `Challenge completed! ${challengeName}` });
          } else {
            playLose();
            setGameResult({ winner: 'opponent', reason: "Challenge failed - objective not met" });
          }
        } else if (betAmount) {
          playWin();
          winGame(betAmount, true);
          setGameResult({ winner: 'player', reason: "Checkmate" });
        }
        // Show rematch offer for P2P games
        if (isP2PChallenge) {
          setShowRematchOffer(true);
          setRematchCountdown(30);
        }
      } else if (game.isDraw()) {
        setGameOver(true);
        // Analyze game for anti-cheat
        analyzeGameForAntiCheat();
        playDraw();
        const history = game.history({ verbose: true });
        setGameHistory(history);
        if (isHouseChallenge) {
          settleHouseChallenge(false);
          setGameResult({ winner: 'draw', reason: "Challenge failed - game ended in a draw" });
        } else {
          setGameResult({ winner: 'draw', reason: "Game ended in a draw" });
        }
        // Show rematch offer for P2P games
        if (isP2PChallenge) {
          setShowRematchOffer(true);
          setRematchCountdown(30);
        }
      } else {
        setTimeout(() => makeComputerMove(), 500);
      }
    } catch (error) {
      console.log("Promotion move failed:", error);
      playIllegalMove();
      setPendingPromotion(null);
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }, [pendingPromotion, game, playMove, playWin, playLose, playDraw, playIllegalMove, isHouseChallenge, betAmount, checkChallengeObjective, settleHouseChallenge, challengeName, winGame, makeComputerMove, recordMoveForAntiCheat, analyzeGameForAntiCheat, isP2PChallenge]);

  const handlePromotionCancel = useCallback(() => {
    setPendingPromotion(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getCountryFlag = (country: string): string => {
    const flagMap: Record<string, string> = {
      "United States": "🇺🇸",
      "United Kingdom": "🇬🇧",
      "Canada": "🇨🇦",
      "Australia": "🇦🇺",
      "Germany": "🇩🇪",
      "France": "🇫🇷",
      "Spain": "🇪🇸",
      "Italy": "🇮🇹",
      "Netherlands": "🇳🇱",
      "Brazil": "🇧🇷",
      "Mexico": "🇲🇽",
      "Japan": "🇯🇵",
      "China": "🇨🇳",
      "India": "🇮🇳",
      "Russia": "🇷🇺",
      "South Korea": "🇰🇷",
      "Argentina": "🇦🇷",
      "Portugal": "🇵🇹",
      "Sweden": "🇸🇪",
      "Norway": "🇳🇴",
      "Denmark": "🇩🇰",
      "Finland": "🇫🇮",
      "Poland": "🇵🇱",
      "Turkey": "🇹🇷",
      "South Africa": "🇿🇦",
      "Nigeria": "🇳🇬",
      "Egypt": "🇪🇬",
      "Saudi Arabia": "🇸🇦",
      "UAE": "🇦🇪",
      "Indonesia": "🇮🇩",
      "Thailand": "🇹🇭",
      "Vietnam": "🇻🇳",
      "Philippines": "🇵🇭",
      "Malaysia": "🇲🇾",
      "Singapore": "🇸🇬",
      "New Zealand": "🇳🇿",
      "Ireland": "🇮🇪",
      "Belgium": "🇧🇪",
      "Switzerland": "🇨🇭",
      "Austria": "🇦🇹",
      "Greece": "🇬🇷",
      "Czech Republic": "🇨🇿",
      "Romania": "🇷🇴",
      "Ukraine": "🇺🇦",
      "Israel": "🇮🇱",
      "Chile": "🇨🇱",
      "Colombia": "🇨🇴",
      "Peru": "🇵🇪",
      "Venezuela": "🇻🇪",
    };
    return flagMap[country] || "🌍";
  };

  useEffect(() => {
    if (gameResult && gameResult.winner === 'player') {
      const timer = setTimeout(() => {
        setShowCoins(true);
        animateCoins();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [gameResult]);

  // Rematch countdown timer
  useEffect(() => {
    if (!showRematchOffer || rematchCountdown <= 0) return;

    const timer = setInterval(() => {
      setRematchCountdown((prev) => {
        if (prev <= 1) {
          setShowRematchOffer(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showRematchOffer, rematchCountdown]);

  // Handle sending rematch offer
  const handleRematchOffer = useCallback(() => {
    // In real implementation, this would send rematch through RematchService
    // For now, start a new game with same settings
    game.reset();
    setBoard(getBoardArray(game));
    setSelectedSquare(null);
    setGameStarted(true);
    setPlayerTime(customGameClock);
    setOpponentTime(customGameClock);
    setGameOver(false);
    setCapturedByPlayer([]);
    setCapturedByOpponent([]);
    setIsPlayerTurn(true);
    setGameResult(null);
    setMoveCount(0);
    setQueenSacrificed(false);
    setCheckmatingPiece(null);
    setShowRematchOffer(false);
    setRematchCountdown(30);
    // Reset anti-cheat for new game
    if (antiCheatRef.current) {
      antiCheatRef.current.clearMoves();
    }
    moveStartTimeRef.current = Date.now();
  }, [game, customGameClock]);

  const generateMoveFeedback = async (moveIndex: number) => {
    if (moveFeedback[moveIndex]) return;
    if (moveIndex >= gameHistory.length) return;
    
    setLoadingFeedback(true);
    try {
      const move = gameHistory[moveIndex];
      const isPlayerMove = moveIndex % 2 === 0;
      
      const prompt = `You are a professional chess coach analyzing a ${isPlayerMove ? "player's" : "opponent's"} move. The move was: ${move.san} (from ${move.from} to ${move.to}). Move number: ${Math.floor(moveIndex / 2) + 1}. 

Provide personalized, encouraging feedback about this move in 1-2 sentences. Focus on:
- Was it a good tactical move?
- Did it improve board position?
- Any missed opportunities?
- Strategic value

Be friendly and constructive. Keep it brief and conversational.`;
      
      const feedback = await generateText(prompt);
      setMoveFeedback(prev => ({ ...prev, [moveIndex]: feedback }));
    } catch (error) {
      console.error("Failed to generate feedback:", error);
      setMoveFeedback(prev => ({ ...prev, [moveIndex]: "Unable to generate feedback for this move." }));
    } finally {
      setLoadingFeedback(false);
    }
  };

  const startFeedbackMode = () => {
    if (gameHistory.length === 0) return;
    setFeedbackMode(true);
    setCurrentMoveIndex(0);
    generateMoveFeedback(0);
  };

  const nextMove = () => {
    if (currentMoveIndex < gameHistory.length - 1) {
      const newIndex = currentMoveIndex + 1;
      setCurrentMoveIndex(newIndex);
      generateMoveFeedback(newIndex);
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

  const animateCoins = () => {
    const numberOfCoins = 20;
    coinAnimations.current = Array.from({ length: numberOfCoins }, () => new Animated.Value(0));

    const animations = coinAnimations.current.map((anim, index) => {
      return Animated.sequence([
        Animated.delay(index * 40),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.parallel(animations).start();
  };

  const handleShareResult = async () => {
    try {
      const message = gameResult?.winner === 'player'
        ? `I just won ${betAmount ? usdToTCT(betAmount * 2 * 0.9).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ''} $TCT playing Treasure Chess! Join me and earn crypto while playing chess.`
        : gameResult?.winner === 'draw'
        ? `Just had an intense chess match on Treasure Chess! Join me and earn crypto while playing chess.`
        : `Just played a match on Treasure Chess! Join me and earn crypto while playing chess.`;

      await Share.share({
        message,
        title: 'Treasure Chess Result',
      });
    } catch (error) {
      console.log('Share error:', error);
    }
  };

  const checkUnlockTiers = useCallback(() => {
    const totalWins = user.totalWins || 0;

    if (totalWins === 10 && !justUnlockedTeenageDragons) {
      setJustUnlockedTeenageDragons(true);
      setUnlockTier('teenage');
      setShowUnlockModal(true);
    } else if (totalWins === 75 && !justUnlockedNonFierceAdults) {
      setJustUnlockedNonFierceAdults(true);
      setUnlockTier('non-fierce');
      setShowUnlockModal(true);
    } else if (totalWins === 200 && !justUnlockedFierceAdults) {
      setJustUnlockedFierceAdults(true);
      setUnlockTier('fierce');
      setShowUnlockModal(true);
    }
  }, [user.totalWins, justUnlockedTeenageDragons, justUnlockedNonFierceAdults, justUnlockedFierceAdults]);

  if (feedbackMode && gameHistory.length > 0) {
    const currentMove = gameHistory[currentMoveIndex];
    const isPlayerMove = currentMoveIndex % 2 === 0;
    const boardState = getBoardStateAtMove(currentMoveIndex);
    const feedback = moveFeedback[currentMoveIndex];

    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <ScrollView contentContainerStyle={styles.feedbackContainer}>
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
              Move {currentMoveIndex + 1} of {gameHistory.length}
            </Text>
          </View>

          <View style={styles.feedbackBoardContainer}>
            <View style={styles.chessBoard}>
              {boardState.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                  {row.map((piece, colIndex) => {
                    const isLight = (rowIndex + colIndex) % 2 === 0;
                    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
                    const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
                    const square = (files[colIndex] + ranks[rowIndex]) as Square;
                    const isLastMoveSquare = currentMove && (currentMove.from === square || currentMove.to === square);
                    const themeColors = BOARD_THEMES[boardTheme];

                    return (
                      <View
                        key={`${rowIndex}-${colIndex}`}
                        style={[
                          styles.square,
                          { backgroundColor: isLight ? themeColors.light : themeColors.dark },
                          isLastMoveSquare && styles.lastMoveSquare,
                        ]}
                      >
                        {piece && (
                          <View style={styles.pieceContainer}>
                            <ChessPieceComponent
                              type={piece.type}
                              color={piece.color}
                              size={getPieceSize()}
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

            <View style={styles.moveInfoCard}>
              <Text style={styles.moveNotation}>{currentMove.san}</Text>
              <Text style={styles.moveDescription}>
                {isPlayerMove ? "Your move" : "Opponent's move"}: {currentMove.from} → {currentMove.to}
              </Text>
            </View>
          </View>

          <View style={styles.feedbackCard}>
            <View style={styles.dragonAvatarContainer}>
              <Image
                source={user.profilePicture ? { uri: user.profilePicture } : require("@/assets/images/ui/avatar_box.png")}
                style={styles.dragonAvatar}
              />
              <View style={styles.speechBubble}>
                <View style={styles.speechBubbleArrow} />
                {loadingFeedback ? (
                  <View style={styles.feedbackLoadingContainer}>
                    <ActivityIndicator size="small" color="#FFD700" />
                    <Text style={styles.feedbackLoadingText}>Analyzing move...</Text>
                  </View>
                ) : (
                  <Text style={styles.feedbackText}>{feedback || "Loading feedback..."}</Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.navigationControls}>
            <TouchableOpacity
              style={[styles.navButton, currentMoveIndex === 0 && styles.navButtonDisabled]}
              onPress={previousMove}
              disabled={currentMoveIndex === 0}
            >
              <ChevronLeft size={32} color={currentMoveIndex === 0 ? "#555" : "#FFD700"} />
              <Text style={[styles.navButtonText, currentMoveIndex === 0 && styles.navButtonTextDisabled]}>
                Previous
              </Text>
            </TouchableOpacity>

            <View style={styles.moveCounter}>
              <Text style={styles.moveCounterText}>
                {currentMoveIndex + 1} / {gameHistory.length}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.navButton,
                currentMoveIndex === gameHistory.length - 1 && styles.navButtonDisabled,
              ]}
              onPress={nextMove}
              disabled={currentMoveIndex === gameHistory.length - 1}
            >
              <Text
                style={[
                  styles.navButtonText,
                  currentMoveIndex === gameHistory.length - 1 && styles.navButtonTextDisabled,
                ]}
              >
                Next
              </Text>
              <ChevronRight
                size={32}
                color={currentMoveIndex === gameHistory.length - 1 ? "#555" : "#FFD700"}
              />
            </TouchableOpacity>
          </View>

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

  // Get celebration result type
  const getCelebrationResult = (): "win" | "lose" | "draw" => {
    if (!gameResult) return "draw";
    if (gameResult.winner === 'player') return "win";
    if (gameResult.winner === 'opponent') return "lose";
    return "draw";
  };

  if (gameResult) {
    const celebrationResult = getCelebrationResult();

    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        {/* Victory Celebration with dragons and rays */}
        <VictoryCelebration
          result={celebrationResult}
          visible={true}
        >
          {null}
        </VictoryCelebration>

        {gameResult.winner === 'player' && (
          <>
            <ConfettiCannon
              count={200}
              origin={{ x: width / 2, y: -10 }}
              autoStart={true}
              fadeOut={true}
              fallSpeed={3000}
              colors={['#FFD700', '#FFA500', '#E05C5C', '#4CAF82', '#45B7D1', '#96CEB4']}
            />
            {showCoins && (
              <View style={styles.coinAnimationContainer}>
                {coinAnimations.current.map((anim, index) => {
                  const angleOffset = (index - 10) * 12;
                  const translateY = anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -Dimensions.get('window').height * 0.9],
                  });
                  const translateX = anim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0, angleOffset * 4, angleOffset * 1.5],
                  });
                  const opacity = anim.interpolate({
                    inputRange: [0, 0.1, 0.7, 1],
                    outputRange: [0, 1, 1, 0],
                  });
                  const scale = anim.interpolate({
                    inputRange: [0, 0.2, 0.5, 1],
                    outputRange: [0.5, 1.3, 1.2, 0.4],
                  });
                  const rotate = anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '1080deg'],
                  });

                  return (
                    <Animated.View
                      key={index}
                      style={[
                        styles.coin,
                        {
                          transform: [
                            { translateY },
                            { translateX },
                            { scale },
                            { rotate },
                          ],
                          opacity,
                        },
                      ]}
                    >
                      <Image
                        source={TCT_COIN_IMAGE}
                        style={styles.coinImage}
                      />
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </>
        )}
        {gameResult.winner === 'player' && (
          <View style={styles.victoryHeader}>
            <View style={styles.victoryUserInfo}>
              <Image
                source={user.profilePicture ? { uri: user.profilePicture } : require("@/assets/images/ui/avatar_box.png")}
                style={styles.victoryProfilePic}
              />
              <View style={styles.victoryUserDetails}>
                <Text style={styles.victoryUsername}>{user.username}</Text>
                <View style={styles.victoryStatsRow}>
                  <Text style={styles.victoryTCT}>
                    {tctBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT
                  </Text>
                  <Text style={styles.victoryDivider}>•</Text>
                  <Text style={styles.victoryPoints}>⭐ {user.totalPoints}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
        <View style={styles.gameOverContainer}>
          <View style={styles.gameOverContent}>
            {/* Animated Dragons */}
            <AnimatedDragons size={70} />

            {gameResult.winner === 'player' && (
              <>
                <Trophy size={80} color="#FFD700" />
                <Text style={styles.gameOverTitle}>Victory!</Text>
                <Text style={styles.gameOverReason}>{gameResult.reason}</Text>
                <View style={styles.eloChange}>
                  <Text style={styles.eloChangeText}>+7 ELO</Text>
                </View>
                {betAmount && (
                  <View style={styles.gameOverPrize}>
                    <Text style={styles.gameOverPrizeLabel}>You Won</Text>
                    {isHouseChallenge ? (
                      <>
                        <Text style={styles.gameOverPrizeTCT}>{usdToTCT(betAmount * 2).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT</Text>
                        <Text style={styles.gameOverPrizeUSD}>${(betAmount * 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.gameOverPrizeTCT}>{usdToTCT(betAmount * 2 - (betAmount * 2) * 0.1).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT</Text>
                        <Text style={styles.gameOverPrizeUSD}>${(betAmount * 2 - (betAmount * 2) * 0.1).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                      </>
                    )}
                  </View>
                )}
              </>
            )}
            {gameResult.winner === 'opponent' && (
              <>
                <X size={80} color="#FF4444" />
                <Text style={styles.gameOverTitleLoss}>Defeat</Text>
                <Text style={styles.gameOverReason}>{gameResult.reason}</Text>
                <View style={styles.eloChangeLoss}>
                  <Text style={styles.eloChangeLossText}>-7 ELO</Text>
                </View>
              </>
            )}
            {gameResult.winner === 'draw' && (
              <>
                <Trophy size={80} color="#A0A0A0" />
                <Text style={styles.gameOverTitleDraw}>Draw</Text>
                <Text style={styles.gameOverReason}>{gameResult.reason}</Text>
                <View style={styles.eloChangeDraw}>
                  <Text style={styles.eloChangeDrawText}>0 ELO</Text>
                </View>
              </>
            )}
            <View style={styles.gameOverButtons}>
              {/* P2P Rematch with countdown */}
              {isP2PChallenge && showRematchOffer && (
                <TouchableOpacity
                  style={styles.gameOverButton}
                  onPress={handleRematchOffer}
                >
                  <LinearGradient
                    colors={["#4CAF50", "#45a049"]}
                    style={styles.gameOverButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={styles.rematchButtonContent}>
                      <RotateCcw size={20} color="#FFFFFF" />
                      <Text style={styles.rematchButtonText}>Offer Rematch</Text>
                      <View style={styles.rematchCountdownBadge}>
                        <Text style={styles.rematchCountdownText}>{rematchCountdown}s</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              {/* Regular rematch for non-P2P games */}
              {!isHouseChallenge && !isP2PChallenge && (
                <TouchableOpacity
                  style={styles.gameOverButton}
                  onPress={() => {
                    game.reset();
                    setBoard(getBoardArray(game));
                    setSelectedSquare(null);
                    setGameStarted(true);
                    setPlayerTime(GAME_DURATION);
                    setOpponentTime(GAME_DURATION);
                    setGameOver(false);
                    setCapturedByPlayer([]);
                    setCapturedByOpponent([]);
                    setIsPlayerTurn(true);
                    setGameResult(null);
                    setMoveCount(0);
                    setQueenSacrificed(false);
                    setCheckmatingPiece(null);
                  }}
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
              )}
              {!isHouseChallenge && !isP2PChallenge && (
                <TouchableOpacity
                  style={styles.gameOverButton}
                  onPress={() => {
                    game.reset();
                    setBoard(getBoardArray(game));
                    setSelectedSquare(null);
                    setGameStarted(false);
                    setBetAmount(null);
                    setPlayerTime(GAME_DURATION);
                    setOpponentTime(GAME_DURATION);
                    setGameOver(false);
                    setCapturedByPlayer([]);
                    setCapturedByOpponent([]);
                    setIsPlayerTurn(true);
                    setGameResult(null);
                    setMoveCount(0);
                    setQueenSacrificed(false);
                    setCheckmatingPiece(null);
                  }}
                >
                  <View style={styles.gameOverSecondaryButton}>
                    <Text style={styles.gameOverSecondaryButtonText}>New Game</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.gameOverButton}
                onPress={startFeedbackMode}
              >
                <View style={styles.gameOverSecondaryButton}>
                  <Text style={styles.gameOverSecondaryButtonText}>View Feedback</Text>
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
                onPress={handleShareResult}
              >
                <Share2 size={20} color="#FFD700" />
                <Text style={styles.shareButtonText}>Share Result</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Unlock Modal */}
        {showUnlockModal && (
          <BlurView intensity={80} tint="dark" style={styles.unlockModalOverlay}>
            <View style={styles.unlockModalContent}>
              <Text style={styles.unlockModalTitle}>
                {unlockTier === 'teenage' && 'Milestone Reached!'}
                {unlockTier === 'non-fierce' && 'Elite Rank Achieved!'}
                {unlockTier === 'fierce' && 'Champion Status!'}
              </Text>
              <Text style={styles.unlockModalDescription}>
                {unlockTier === 'teenage' && 'You reached 10 wins! New profile options are now available.'}
                {unlockTier === 'non-fierce' && 'You reached 75 wins! More profile customisation unlocked.'}
                {unlockTier === 'fierce' && 'You reached 200 wins! You\'ve unlocked the top tier.'}
              </Text>
              <TouchableOpacity
                style={styles.unlockModalButton}
                onPress={() => setShowUnlockModal(false)}
              >
                <LinearGradient
                  colors={["#FFD700", "#FFA500"]}
                  style={styles.unlockModalButtonGradient}
                >
                  <Text style={styles.unlockModalButtonText}>Awesome!</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </BlurView>
        )}

        {/* Reward Unlock Animation */}
        {showRewardAnimation && (newlyUnlocked.length > 0 || newlyEarned.length > 0) && (
          <RewardUnlockAnimation
            unlockedRewards={newlyUnlocked}
            earnedAchievements={newlyEarned}
            onDismiss={handleRewardAnimationDismiss}
            autoDismissDelay={5000}
          />
        )}
      </LinearGradient>
    );
  }

  if (!gameStarted && !isHouseChallenge && !isP2PChallenge && !isOnlineChallenge && !isTournamentGame) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <X size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.betSelectionContainer}
          showsVerticalScrollIndicator={false}
        >
          <Trophy size={64} color="#FFD700" />
          <Text style={styles.betTitle}>Set Your Stake</Text>
          <Text style={styles.betSubtitle}>Winner takes all minus 10% fee</Text>
          <Text style={styles.gameInfoText}>Game Clock: 120 seconds</Text>
          <Text style={styles.gameInfoText}>Token Ratio: 25:1</Text>

          <View style={styles.balanceInfo}>
            <Text style={styles.balanceLabel}>Your Balance</Text>
            <View style={styles.balanceAmounts}>
              <Text style={styles.balanceTCT}>{tctBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT</Text>
              <Text style={styles.balanceText}>${tctToUsd(tctBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
            <TouchableOpacity
              style={styles.topUpButton}
              onPress={() => router.push("/wallet" as any)}
            >
              <Text style={styles.topUpButtonText}>Top Up Balance</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.betGrid}>
            {BET_AMOUNTS.map((amount) => {
              const requiredTct = usdToTCT(amount);
              const canAfford = tctBalance >= requiredTct;
              return (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.betButton,
                  !canAfford && styles.betButtonDisabled,
                ]}
                onPress={() => handleStartGame(amount)}
                disabled={!canAfford}
              >
                <LinearGradient
                  colors={
                    !canAfford
                      ? ["#333", "#222"]
                      : ["#FFD700", "#FFA500"]
                  }
                  style={styles.betButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.betAmountContainer}>
                    <Text style={styles.betTCT}>{usdToTCT(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT</Text>
                    <Text style={styles.betAmount}>${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.betWinningsContainer}>
                    <Text style={styles.betWinningsTCT}>
                      {usdToTCT(amount * 2 - (amount * 2) * 0.1).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT
                    </Text>
                    <Text style={styles.betWinnings}>Win ${(amount * 2 - (amount * 2) * 0.1).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.customMatchButton}
            onPress={() => router.push("/custom-match" as any)}
          >
            <Text style={styles.customMatchText}>Custom Match</Text>
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.onlineMatchButton}
            onPress={() => {
              if (betAmount) {
                router.push({
                  pathname: "/matchmaking" as any,
                  params: { stake: betAmount.toString() },
                });
              }
            }}
          >
            <Text style={styles.onlineMatchText}>Find Online Opponent</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gamePlayContainer}>
      <View style={styles.gameContent}>
        <View style={styles.opponentSection}>
          <View style={styles.playerInfoCard}>
            <View style={styles.playerAvatarSection}>
              <Image 
                source={{ uri: p2pOpponentAvatar || "https://api.dicebear.com/7.x/bottts/png?seed=Opponent" }} 
                style={styles.playerAvatar}
              />
              <Text style={styles.playerCountryFlag}>{getCountryFlag(p2pOpponentCountry || "United States")}</Text>
            </View>
            <View style={styles.playerDetails}>
              <Text style={styles.playerName}>{p2pOpponent || "Opponent"}</Text>
              {p2pOpponentRating && (
                <Text style={styles.playerRating}>⭐ {p2pOpponentRating}</Text>
              )}
            </View>
            <View style={[styles.timerContainer, !isPlayerTurn && styles.activeTimer]}>
              <Clock size={14} color="#FFD700" />
              <Text style={styles.timerText}>{formatTime(opponentTime)}</Text>
            </View>
          </View>
          <View style={styles.capturedPieces}>
            {capturedByOpponent.map((piece, index) => (
              <Text key={index} style={styles.capturedPiece}>
                {PIECE_SYMBOLS[piece.color + piece.type]}
              </Text>
            ))}
          </View>
        </View>

        {isHouseChallenge && challengeName && (
          <View style={styles.challengeInfoCard}>
            <Text style={styles.challengeInfoTitle}>{challengeName}</Text>
            <Text style={styles.challengeInfoDescription}>{challengeDescription}</Text>
          </View>
        )}
        
        <View style={styles.stakeDisplay}>
          {isHouseChallenge ? (
            <View style={styles.houseChallengeStakes}>
              <View style={styles.stakeColumn}>
                <Text style={styles.stakeLabel}>Stake</Text>
                <Text style={styles.stakeTCT}>{betAmount ? usdToTCT(betAmount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 0} $TCT</Text>
                <Text style={styles.stakeUSD}>${betAmount ? betAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}</Text>
              </View>
              <View style={styles.stakeDivider} />
              <View style={styles.stakeColumn}>
                <Text style={styles.stakeLabel}>Prize Pool</Text>
                <Text style={styles.stakeTCT}>{betAmount ? usdToTCT(betAmount * 2).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 0} $TCT</Text>
                <Text style={styles.stakeUSD}>${betAmount ? (betAmount * 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.stakeLabel}>Total Stake</Text>
              <Text style={styles.stakeTCT}>{betAmount ? usdToTCT(betAmount * 2).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 0} $TCT</Text>
              <Text style={styles.stakeUSD}>${betAmount ? (betAmount * 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}</Text>
            </>
          )}
        </View>

        <View style={styles.boardWrapper}>
          {/* Rank labels (1-8) on left side */}
          <View style={styles.rankLabels}>
            {(isFlipped ? ["1","2","3","4","5","6","7","8"] : ["8","7","6","5","4","3","2","1"]).map((rank) => (
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
                    const isKingInCheck = game.inCheck() && piece?.type === 'k' && piece?.color === game.turn();
                    const themeColors = BOARD_THEMES[boardTheme];

                    return (
                      <TouchableOpacity
                        key={`${rowIndex}-${colIndex}`}
                        style={[
                          styles.square,
                          { backgroundColor: isLight ? themeColors.light : themeColors.dark },
                          isLastMoveSquare && styles.lastMoveSquare,
                          isSelected && styles.selectedSquare,
                          isKingInCheck && styles.checkSquare,
                        ]}
                        onPress={() => handleSquarePress(rowIndex, colIndex)}
                      >
                        {square === illegalSquare && (
                          <ReAnimated.View style={[StyleSheet.absoluteFillObject, styles.illegalOverlay, illegalStyle]} />
                        )}
                        {isPossibleMove && (
                          animEnabled ? (
                            <ReAnimated.View style={[
                              styles.possibleMoveIndicator,
                              piece ? styles.captureIndicatorGlow : styles.moveIndicatorGlow,
                              legalGlowStyle,
                            ]} />
                          ) : (
                            <View style={[
                              styles.possibleMoveIndicator,
                              piece && styles.captureIndicator,
                            ]} />
                          )
                        )}
                        {piece && !(glideState && (square === glideState.from || square === glideState.to)) && (
                          <View style={styles.pieceContainer}>
                            <ChessPieceComponent
                              type={piece.type}
                              color={piece.color}
                              size={getPieceSize()}
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
                isFlipped={isFlipped}
                glideState={glideState}
                pieceStyle={pieceStyle}
                captureSquare={captureSquare}
                onGlideComplete={handleGlideComplete}
                onCaptureComplete={handleCaptureComplete}
              />
            </View>
            {/* File labels (a-h) along bottom */}
            <View style={styles.fileLabels}>
              {(isFlipped ? ["h","g","f","e","d","c","b","a"] : ["a","b","c","d","e","f","g","h"]).map((file) => (
                <View key={file} style={[styles.coordLabel, { width: SQUARE_SIZE }]}>
                  <Text style={styles.coordText}>{file}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.playerSection}>
          <View style={styles.capturedPieces}>
            {capturedByPlayer.map((piece, index) => (
              <Text key={index} style={styles.capturedPiece}>
                {PIECE_SYMBOLS[piece.color + piece.type]}
              </Text>
            ))}
          </View>
          <View style={styles.playerInfoCard}>
            <View style={styles.playerAvatarSection}>
              <Image
                source={user.profilePicture ? { uri: user.profilePicture } : require("@/assets/images/ui/avatar_box.png")}
                style={styles.playerAvatar}
              />
              <Text style={styles.playerCountryFlag}>{getCountryFlag(user.country)}</Text>
            </View>
            <View style={styles.playerDetails}>
              <Text style={styles.playerName}>{user.username}</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.playerRating}>⭐ {user.totalPoints}</Text>
                <Text style={styles.playerBalance}>• {tctBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT</Text>
              </View>
            </View>
            <View style={[styles.timerContainer, isPlayerTurn && styles.activeTimer]}>
              <Clock size={14} color="#FFD700" />
              <Text style={styles.timerText}>{formatTime(playerTime)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Pawn Promotion Modal */}
      <PawnPromotionModal
        visible={pendingPromotion !== null}
        color="w"
        pieceStyle={pieceStyle}
        onSelect={handlePromotionSelect}
        onCancel={handlePromotionCancel}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gamePlayContainer: {
    flex: 1,
  },
  gameContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  closeButton: {
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
  scrollView: {
    flex: 1,
  },
  betSelectionContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingTop: 80,
    paddingBottom: 40,
  },
  betTitle: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    marginTop: 20,
  },
  betSubtitle: {
    fontSize: 16,
    color: "#A0A0A0",
    marginTop: 8,
    marginBottom: 0,
  },
  betGrid: {
    width: "100%",
    gap: 16,
  },
  betButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  betButtonDisabled: {
    opacity: 0.5,
  },
  betButtonGradient: {
    padding: 24,
    alignItems: "center",
  },
  betAmountContainer: {
    alignItems: "center",
  },
  betTCT: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#0F0F1E",
  },
  betAmount: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#0F0F1E",
    marginTop: 2,
    opacity: 0.6,
  },
  betWinningsContainer: {
    alignItems: "center",
    marginTop: 8,
  },
  betWinningsTCT: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#0F0F1E",
    opacity: 0.8,
  },
  betWinnings: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#0F0F1E",
    marginTop: 2,
    opacity: 0.6,
  },
  balanceInfo: {
    width: "100%",
    marginTop: 32,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginBottom: 8,
  },
  balanceAmounts: {
    alignItems: "center",
  },
  balanceTCT: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: "#FFD700",
  },
  balanceText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFD700",
    marginTop: 4,
    opacity: 0.7,
  },
  topUpButton: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  topUpButtonText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#FFD700",
    textAlign: "center",
  },
  customMatchButton: {
    marginTop: 16,
    width: "100%",
    padding: 16,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
    alignItems: "center",
  },
  customMatchText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
    width: "100%",
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dividerText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginHorizontal: 16,
  },
  onlineMatchButton: {
    width: "100%",
    padding: 16,
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4ADE80",
    alignItems: "center",
  },
  onlineMatchText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#4ADE80",
  },
  opponentSection: {
    marginBottom: 12,
  },
  playerSection: {
    marginTop: 12,
  },
  playerInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playerNameContainer: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  playerRating: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginTop: 2,
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  activeTimer: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  timerText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  capturedPieces: {
    flexDirection: "row",
    flexWrap: "wrap",
    minHeight: 30,
    gap: 4,
  },
  capturedPiece: {
    fontSize: 24,
    fontWeight: "700" as const,
  },
  stakeDisplay: {
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  stakeLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginBottom: 2,
  },
  stakeTCT: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#FFD700",
  },
  stakeUSD: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#FFD700",
    opacity: 0.7,
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
  chessBoard: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
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
  lastMoveSquare: {
    backgroundColor: "rgba(255, 255, 0, 0.3)",
  },
  checkSquare: {
    backgroundColor: "rgba(255, 0, 0, 0.5)",
  },
  captureIndicator: {
    width: SQUARE_SIZE - 4,
    height: SQUARE_SIZE - 4,
    borderRadius: SQUARE_SIZE / 2,
    backgroundColor: "transparent",
    borderWidth: 3,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  piece: {
    fontSize: SQUARE_SIZE * 0.7,
    fontWeight: "700" as const,
    textAlign: "center",
  },
  whitePiece: {
    color: "#FFFFFF",
    textShadowColor: "#000000",
    textShadowOffset: { width: -1, height: -1 },
    textShadowRadius: 1,
  },
  blackPiece: {
    color: "#000000",
    textShadowColor: "#FFFFFF",
    textShadowOffset: { width: -2, height: -2 },
    textShadowRadius: 2,
  },
  pieceLarge: {
    fontSize: SQUARE_SIZE * 0.85,
  },
  pieceExtraLarge: {
    fontSize: SQUARE_SIZE * 1.0,
  },
  playerInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  playerAvatarSection: {
    position: "relative",
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  playerCountryFlag: {
    position: "absolute",
    bottom: -4,
    right: -4,
    fontSize: 18,
    backgroundColor: "#0F0F1E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  playerDetails: {
    flex: 1,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  playerBalance: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#FFD700",
  },
  gameInfoText: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 4,
  },
  gameOverContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingTop: 140,
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
  gameOverPrize: {
    marginTop: 24,
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  gameOverPrizeLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginBottom: 8,
  },
  gameOverPrizeTCT: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#FFD700",
  },
  gameOverPrizeUSD: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFD700",
    marginTop: 4,
    opacity: 0.7,
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
  rematchButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  rematchButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  rematchCountdownBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rematchCountdownText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  challengeInfoCard: {
    width: "100%",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  challengeInfoTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#FFD700",
    marginBottom: 6,
    textAlign: "center",
  },
  challengeInfoDescription: {
    fontSize: 13,
    color: "#A0A0A0",
    textAlign: "center",
  },
  houseChallengeStakes: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  stakeColumn: {
    alignItems: "center",
    flex: 1,
  },
  stakeDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 215, 0, 0.3)",
    marginHorizontal: 16,
  },
  pieceContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  possibleMoveIndicator: {
    position: "absolute",
    width: SQUARE_SIZE * 0.3,
    height: SQUARE_SIZE * 0.3,
    borderRadius: SQUARE_SIZE * 0.15,
    backgroundColor: "rgba(155, 207, 83, 0.6)",
  },
  illegalOverlay: {
    backgroundColor: "rgba(255, 30, 30, 0.6)",
    zIndex: 5,
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
  victoryHeader: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  victoryUserInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  victoryProfilePic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  victoryUserDetails: {
    marginLeft: 12,
    flex: 1,
  },
  victoryUsername: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  victoryStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  victoryTCT: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  victoryDivider: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  victoryPoints: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
  },
  coinAnimationContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    zIndex: 5,
  },
  coin: {
    position: "absolute",
    width: 50,
    height: 50,
    marginLeft: -25,
    marginTop: -25,
  },
  coinImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  feedbackContainer: {
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
  highlightedSquare: {
    backgroundColor: "#9BCF53",
  },
  feedbackCard: {
    width: "100%",
    marginBottom: 24,
  },
  dragonAvatarContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  dragonAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#FFD700",
  },
  speechBubble: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 16,
    padding: 16,
    position: "relative",
    minHeight: 100,
    justifyContent: "center",
  },
  speechBubbleArrow: {
    position: "absolute",
    left: -10,
    top: 24,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderRightWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "rgba(255, 255, 255, 0.95)",
  },
  feedbackText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#0F0F1E",
    fontWeight: "600" as const,
  },
  feedbackLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  feedbackLoadingText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600" as const,
  },
  navigationControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  navButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  navButtonTextDisabled: {
    color: "#555",
  },
  moveCounter: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  moveCounterText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFFFFF",
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
  eloChange: {
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#4ADE80",
  },
  eloChangeText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#4ADE80",
  },
  eloChangeLoss: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  eloChangeLossText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#EF4444",
  },
  eloChangeDraw: {
    backgroundColor: "rgba(160, 160, 160, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#A0A0A0",
  },
  eloChangeDrawText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#A0A0A0",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  unlockModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  unlockModalContent: {
    backgroundColor: "rgba(26, 26, 46, 0.95)",
    borderRadius: 24,
    padding: 32,
    marginHorizontal: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  unlockModalTitle: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: "#FFD700",
    textAlign: "center",
    marginBottom: 12,
  },
  unlockModalDescription: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  unlockModalButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  unlockModalButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  unlockModalButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
});
