export { useAuth } from "./useAuth";
export type { AuthState, AuthActions } from "./useAuth";

export { useWallet } from "./useWallet";
export type { WalletState, WalletActions, UseWalletReturn } from "./useWallet";

export { useGameChannel } from "./useGameChannel";
export type { UseGameChannelOptions, UseGameChannelReturn } from "./useGameChannel";

export { useGameTimer } from "./useGameTimer";
export type {
  TimeControl,
  GameTimerState,
  UseGameTimerOptions,
  UseGameTimerReturn,
} from "./useGameTimer";

export { useMatchmaking } from "./useMatchmaking";
export type { UseMatchmakingOptions, UseMatchmakingReturn } from "./useMatchmaking";

export {
  useTournaments,
  useActiveTournaments,
  useTournament,
  useTournamentRegistration,
  useTournamentCountdown,
} from "./useTournament";
export type {
  UseTournamentsOptions,
  UseTournamentsReturn,
  UseTournamentOptions,
  UseTournamentReturn,
  UseTournamentRegistrationOptions,
  UseTournamentRegistrationReturn,
  UseTournamentCountdownReturn,
} from "./useTournament";

// Memory cleanup and performance hooks
export {
  useIsMounted,
  useSafeState,
  useTimeout,
  useInterval,
  useSubscriptions,
  useAppState,
  useOnForeground,
  useOnBackground,
  useAnimatedValue,
  useAsyncEffect,
  useDebouncedCleanup,
  useMemoryWarning,
  useCacheCleanup,
} from "./useMemoryCleanup";

// Livestream hooks
export {
  useLivestream,
  usePlatformConnections,
  useStreamSettings,
  useLiveStreams,
  useStreamStatistics,
  useViewerCount,
  useMediaPermissions,
} from "./useLivestream";
export type {
  UseLivestreamOptions,
  UseLivestreamReturn,
  UsePlatformConnectionsReturn,
  UseStreamSettingsReturn,
  LiveStreamEntry,
  UseLiveStreamsReturn,
  UseStreamStatisticsReturn,
  UseMediaPermissionsReturn,
} from "./useLivestream";

// Profile sync hooks
export {
  useProfileSync,
  useEloTracking,
  useSyncStatus,
  useProfileUpdate,
} from "./useProfileSync";
export type {
  EloChangeInfo,
  ProfileSyncHookResult,
} from "./useProfileSync";

// Home stats hooks
export {
  useHomeStats,
  useAnimatedElo,
  useAnimatedBalance,
  useHomeStatsSyncStatus,
} from "./useHomeStats";
export type {
  HomeStats,
  ValueChangeEvent,
  SyncStatus,
  UseHomeStatsResult,
} from "./useHomeStats";

// Rewards and achievements hooks
export {
  useRewards,
  useRewardTriggers,
  useUnclaimedRewards,
  useFeaturedAchievement,
  useRewardProgress,
  useAchievementProgress,
  usePlayerAchievementBadges,
} from "./useRewards";
export type {
  UseRewardsOptions,
  UseRewardsReturn,
  UseRewardTriggersReturn,
  UseUnclaimedRewardsReturn,
  UseFeaturedAchievementReturn,
} from "./useRewards";

// Migration hooks
export {
  useMigration,
  useMigrationRollback,
} from "./useMigration";
export type {
  UseMigrationReturn,
} from "./useMigration";
