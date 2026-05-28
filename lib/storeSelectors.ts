/**
 * Zustand Store Selectors
 *
 * Optimized, memoized selectors for all Zustand stores.
 * Prevents unnecessary re-renders by only triggering updates
 * when the specific data being accessed changes.
 *
 * Usage:
 *   import { useGameBoard, useGameStatus } from '@/lib/storeSelectors';
 *   const { board, lastMove } = useGameBoard();
 *   const { status, result } = useGameStatus();
 */

import { useRef, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { shallowEqual } from './performance';

// ============================================================================
// Types
// ============================================================================

type EqualityFn<T> = (a: T, b: T) => boolean;

// ============================================================================
// Selector Factory
// ============================================================================

/**
 * Creates a stable selector hook that only updates when selected values change
 */
export function createStableSelector<TStore, TResult>(
  useStore: <U>(selector: (state: TStore) => U, equalityFn?: EqualityFn<U>) => U,
  selector: (state: TStore) => TResult,
  equalityFn: EqualityFn<TResult> = shallowEqual
): () => TResult {
  return () => useStore(selector, equalityFn);
}

/**
 * Creates a parameterized selector hook
 */
export function createParameterizedSelector<TStore, TParams, TResult>(
  useStore: <U>(selector: (state: TStore) => U, equalityFn?: EqualityFn<U>) => U,
  selectorFactory: (params: TParams) => (state: TStore) => TResult,
  equalityFn: EqualityFn<TResult> = shallowEqual
): (params: TParams) => TResult {
  return (params: TParams) => {
    const selectorRef = useRef(selectorFactory(params));

    // Update selector when params change
    const selector = useCallback(
      (state: TStore) => selectorFactory(params)(state),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [JSON.stringify(params)]
    );

    return useStore(selector, equalityFn);
  };
}

// ============================================================================
// Game Store Selectors
// ============================================================================

import { useGameStore, GameState } from '@/stores/gameStore';

// Board state selector - only updates when board changes
export const useGameBoard = createStableSelector(
  useGameStore,
  (state: GameState) => ({
    fen: state.chess.fen(),
    lastMove: state.lastMove,
    selectedSquare: state.selectedSquare,
    possibleMoves: state.possibleMoves,
  })
);

// Game status selector
export const useGameStatus = createStableSelector(
  useGameStore,
  (state: GameState) => ({
    status: state.status,
    result: state.result,
    isPlayerTurn: state.isPlayerTurn,
    mode: state.mode,
  })
);

// Timer selector - updates frequently but isolated
export const useGameTimers = createStableSelector(
  useGameStore,
  (state: GameState) => ({
    playerTime: state.playerTime,
    opponentTime: state.opponentTime,
    timeControl: state.timeControl,
    increment: state.increment,
  })
);

// Player info selector
export const useGamePlayers = createStableSelector(
  useGameStore,
  (state: GameState) => ({
    playerColor: state.playerColor,
    opponent: state.opponent,
    wagerAmount: state.wagerAmount,
    isWagerGame: state.isWagerGame,
  })
);

// Move history selector
export const useGameHistory = createStableSelector(
  useGameStore,
  (state: GameState) => ({
    moveHistory: state.moveHistory,
    capturedByPlayer: state.capturedByPlayer,
    capturedByOpponent: state.capturedByOpponent,
  })
);

// Actions selector - never changes, stable reference
export const useGameActions = () =>
  useGameStore(
    (state) => ({
      initGame: state.initGame,
      selectSquare: state.selectSquare,
      makeMove: state.makeMove,
      setOpponentMove: state.setOpponentMove,
      updatePlayerTime: state.updatePlayerTime,
      updateOpponentTime: state.updateOpponentTime,
      setStatus: state.setStatus,
      setResult: state.setResult,
      resetGame: state.resetGame,
    }),
    shallow
  );

// ============================================================================
// Practice Store Selectors
// ============================================================================

import { usePracticeStore, PracticeGameState } from '@/stores/practiceStore';

// Practice board selector
export const usePracticeBoard = createStableSelector(
  usePracticeStore,
  (state: PracticeGameState) => ({
    fen: state.chess?.fen() || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: state.lastMove,
    selectedSquare: state.selectedSquare,
    possibleMoves: state.possibleMoves,
  })
);

// Practice status selector
export const usePracticeStatus = createStableSelector(
  usePracticeStore,
  (state: PracticeGameState) => ({
    status: state.status,
    result: state.result,
    difficulty: state.difficulty,
    isPlayerTurn: state.isPlayerTurn,
    isThinking: state.isThinking,
  })
);

// Practice stats selector
export const usePracticeStats = createStableSelector(
  usePracticeStore,
  (state: PracticeGameState) => ({
    gamesPlayed: state.gamesPlayed,
    wins: state.wins,
    losses: state.losses,
    draws: state.draws,
    currentStreak: state.currentStreak,
    bestStreak: state.bestStreak,
  })
);

// Practice actions - stable reference
export const usePracticeActions = () =>
  usePracticeStore(
    (state) => ({
      initGame: state.initGame,
      selectSquare: state.selectSquare,
      makeMove: state.makeMove,
      undo: state.undo,
      redo: state.redo,
      showHint: state.showHint,
      resetGame: state.resetGame,
      setDifficulty: state.setDifficulty,
    }),
    shallow
  );

// ============================================================================
// Settings Store Selectors
// ============================================================================

import { useSettingsStore, SettingsState } from '@/stores/settingsStore';

// Visual settings selector
export const useVisualSettings = createStableSelector(
  useSettingsStore,
  (state: SettingsState) => ({
    boardTheme: state.boardTheme,
    pieceStyle: state.pieceStyle,
    showCoordinates: state.showCoordinates,
    showLegalMoves: state.showLegalMoves,
    animationsEnabled: state.animationsEnabled,
  })
);

// Audio settings selector
export const useAudioSettings = createStableSelector(
  useSettingsStore,
  (state: SettingsState) => ({
    soundEnabled: state.soundEnabled,
    musicEnabled: state.musicEnabled,
    soundVolume: state.soundVolume,
    musicVolume: state.musicVolume,
    hapticEnabled: state.hapticEnabled,
  })
);

// Game settings selector
export const useGameSettings = createStableSelector(
  useSettingsStore,
  (state: SettingsState) => ({
    autoQueen: state.autoQueen,
    confirmMoves: state.confirmMoves,
    premoveEnabled: state.premoveEnabled,
  })
);

// Settings actions - stable reference
export const useSettingsActions = () =>
  useSettingsStore(
    (state) => ({
      setBoardTheme: state.setBoardTheme,
      setPieceStyle: state.setPieceStyle,
      setSoundEnabled: state.setSoundEnabled,
      setMusicEnabled: state.setMusicEnabled,
      setSoundVolume: state.setSoundVolume,
      setMusicVolume: state.setMusicVolume,
      setHapticEnabled: state.setHapticEnabled,
      setAnimationsEnabled: state.setAnimationsEnabled,
      reset: state.reset,
    }),
    shallow
  );

// ============================================================================
// User Store Selectors
// ============================================================================

import { useUserStore, UserState } from '@/stores/userStore';

// User profile selector
export const useUserProfile = createStableSelector(
  useUserStore,
  (state: UserState) => ({
    id: state.id,
    username: state.username,
    avatarId: state.avatarId,
    eloRating: state.eloRating,
    country: state.country,
  })
);

// User stats selector
export const useUserStats = createStableSelector(
  useUserStore,
  (state: UserState) => ({
    totalGames: state.totalGames,
    wins: state.wins,
    losses: state.losses,
    draws: state.draws,
    winStreak: state.winStreak,
    bestWinStreak: state.bestWinStreak,
  })
);

// User wallet selector
export const useUserWallet = createStableSelector(
  useUserStore,
  (state: UserState) => ({
    balance: state.balance,
    pendingBalance: state.pendingBalance,
    totalEarnings: state.totalEarnings,
    totalWagered: state.totalWagered,
  })
);

// ============================================================================
// Wallet Store Selectors
// ============================================================================

import { useWalletStore, WalletState } from '@/stores/walletStore';

// Wallet balance selector
export const useWalletBalance = createStableSelector(
  useWalletStore,
  (state: WalletState) => ({
    balance: state.balance,
    pendingDeposits: state.pendingDeposits,
    pendingWithdrawals: state.pendingWithdrawals,
    isLoading: state.isLoading,
  })
);

// Transaction history selector
export const useTransactionHistory = createStableSelector(
  useWalletStore,
  (state: WalletState) => ({
    transactions: state.transactions,
    lastFetched: state.lastFetched,
  })
);

// ============================================================================
// Challenge Store Selectors
// ============================================================================

import { useChallengeStore, ChallengeState } from '@/stores/challengeStore';

// Active challenges selector
export const useActiveChallenges = createStableSelector(
  useChallengeStore,
  (state: ChallengeState) => ({
    challenges: state.challenges.filter((c) => c.status === 'open'),
    isLoading: state.isLoading,
    lastFetched: state.lastFetched,
  })
);

// My challenges selector
export const useMyChallenges = createStableSelector(
  useChallengeStore,
  (state: ChallengeState) => ({
    created: state.challenges.filter((c) => c.creatorId === state.userId),
    joined: state.challenges.filter(
      (c) => c.opponentId === state.userId && c.status !== 'open'
    ),
  })
);

// ============================================================================
// Compound Selectors
// ============================================================================

/**
 * Combined selector for chess board rendering
 * Optimized to minimize re-renders during gameplay
 */
export function useChessBoardData() {
  const board = useGameBoard();
  const status = useGameStatus();
  const settings = useVisualSettings();

  return {
    ...board,
    ...status,
    boardTheme: settings.boardTheme,
    pieceStyle: settings.pieceStyle,
    showCoordinates: settings.showCoordinates,
    showLegalMoves: settings.showLegalMoves,
  };
}

/**
 * Combined selector for game screen
 */
export function useGameScreenData() {
  const board = useGameBoard();
  const status = useGameStatus();
  const timers = useGameTimers();
  const players = useGamePlayers();

  return {
    ...board,
    ...status,
    ...timers,
    ...players,
  };
}

// ============================================================================
// Utility: Pick specific fields
// ============================================================================

/**
 * Create a selector that picks specific fields from state
 */
export function createPickSelector<TStore, K extends keyof TStore>(
  useStore: <U>(selector: (state: TStore) => U, equalityFn?: EqualityFn<U>) => U,
  keys: K[]
): () => Pick<TStore, K> {
  return () =>
    useStore(
      (state) => {
        const result = {} as Pick<TStore, K>;
        keys.forEach((key) => {
          result[key] = state[key];
        });
        return result;
      },
      shallow
    );
}

export default {
  createStableSelector,
  createParameterizedSelector,
  createPickSelector,
  // Game
  useGameBoard,
  useGameStatus,
  useGameTimers,
  useGamePlayers,
  useGameHistory,
  useGameActions,
  // Practice
  usePracticeBoard,
  usePracticeStatus,
  usePracticeStats,
  usePracticeActions,
  // Settings
  useVisualSettings,
  useAudioSettings,
  useGameSettings,
  useSettingsActions,
  // User
  useUserProfile,
  useUserStats,
  useUserWallet,
  // Wallet
  useWalletBalance,
  useTransactionHistory,
  // Challenges
  useActiveChallenges,
  useMyChallenges,
  // Compound
  useChessBoardData,
  useGameScreenData,
};
