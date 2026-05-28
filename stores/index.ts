export { useUserStore } from "./userStore";
export type { UserProfile, GameSettings, CreateProfileData } from "./userStore";

export { useGameStore } from "./gameStore";
export type { GameMode, GameStatus, GameResult, Player, GameState } from "./gameStore";

export { useWalletStore } from "./walletStore";
export type { Transaction, TransactionType, TransactionStatus, WalletState } from "./walletStore";

export { usePracticeStore } from "./practiceStore";
export type { PracticeGameState } from "./practiceStore";

export {
  useOnlineGameStore,
  useOnlineGameStatus,
  useOnlineGameConnectionState,
  useOnlineGameIsPlayerTurn,
  useOnlineGameOpponent,
  useOnlineGameDrawOffer,
} from "./onlineGameStore";
export type {
  OnlineGameStatus,
  OnlineGameState,
  Opponent,
  EndReason,
} from "./onlineGameStore";

export {
  useLivestreamStore,
  useStreamState,
  useStreamPreferences,
  usePlatformConnections,
  useStreamControls,
  useStreamActions,
  selectIsStreaming,
  selectCurrentSession,
  selectConnectionState,
  selectHealth,
  selectViewerCount,
  selectPlatformConnections,
  selectIsPlatformConnected,
} from "./livestreamStore";
export type {
  StreamPreferences,
  LivestreamState,
} from "./livestreamStore";
