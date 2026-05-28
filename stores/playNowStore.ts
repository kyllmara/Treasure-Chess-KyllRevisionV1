/**
 * Play Now Matchmaking Store
 *
 * Zustand store for quick matchmaking with:
 * - ELO-based matching
 * - On-chain USDC escrow (same flow as challengeStore)
 * - Real-time player finding
 * - Push notifications when match found
 * - Queue management
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { supabase } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import { getRelaySDK } from "@/lib/relay";


// ============================================================================
// Types
// ============================================================================

export type PlayNowStatus =
  | "idle"
  | "selecting" // Selecting wager amount
  | "searching" // Actively searching for opponent
  | "matched" // Found a match
  | "cancelled"
  | "error";

export interface MatchedOpponent {
  id: string;
  username: string;
  avatarIndex: number;
  eloRating: number;
}

export interface PlayNowSettings {
  wagerTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
}

export interface PlayNowQueueEntry {
  id: string;
  oderId: string;
  wagerTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  eloRating: number;
  eloRangeMin: number;
  eloRangeMax: number;
  onChainGameId: string | null;
  status: "waiting" | "matched" | "cancelled" | "expired";
  matchedWithId: string | null;
  gameId: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface PlayNowStoreState {
  // Status
  status: PlayNowStatus;
  error: string | null;

  // Settings
  settings: PlayNowSettings;

  // Queue entry
  queueEntry: PlayNowQueueEntry | null;
  onChainGameId: string | null;

  // Match result
  matchedGameId: string | null;
  matchedOpponent: MatchedOpponent | null;
  playerColor: "w" | "b" | null;

  // Search stats
  searchStartTime: number | null;
  searchDurationSeconds: number;
  playersInQueue: number;
  compatiblePlayers: number;

  // Internal
  _userId: string | null;
  _userElo: number;
  _subscription: RealtimeChannel | null;
  _pollInterval: NodeJS.Timeout | null;
  _durationInterval: NodeJS.Timeout | null;
  _biconomyInitialized: boolean;
  _findMatchInProgress: boolean;
}

export interface PlayNowStoreActions {
  // Initialization
  initialize: (userId: string, userElo: number) => void;
  initializeBiconomy: (walletProvider: any) => Promise<boolean>;
  cleanup: () => void;

  // Settings
  updateSettings: (settings: Partial<PlayNowSettings>) => void;

  // Queue actions
  startSearching: () => Promise<boolean>;
  cancelSearch: () => Promise<boolean>;

  // Internal
  _findMatch: () => Promise<boolean>;
  _checkForMatch: () => Promise<void>;
  _expandEloRange: () => Promise<void>;
  _createGame: (opponent: any) => Promise<string | null>;
  _notifyPlayersInQueue: () => Promise<void>;

  // UI helpers
  clearError: () => void;
  clearMatch: () => void;
  resetState: () => void;
}

export type PlayNowStore = PlayNowStoreState & PlayNowStoreActions;

// ============================================================================
// Constants
// ============================================================================

// Fixed time control: 5+3 Blitz (like Chess.com default)
const FIXED_TIME_CONTROL = 300; // 5 minutes
const FIXED_INCREMENT = 3; // 3 seconds

const DEFAULT_SETTINGS: PlayNowSettings = {
  wagerTct: 0,
  timeControlSeconds: FIXED_TIME_CONTROL,
  incrementSeconds: FIXED_INCREMENT,
};

const QUEUE_TIMEOUT_SECONDS = 120; // 2 minutes
const INITIAL_ELO_RANGE = 100;
const MAX_ELO_RANGE = 400;
const ELO_EXPANSION_PER_SECOND = 5;
const POLL_INTERVAL_MS = 1000;
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Wager options for Play Now (TCT amounts)
export const PLAY_NOW_WAGER_OPTIONS = [0, 10, 25, 50, 100, 250];

// ============================================================================
// Store Implementation
// ============================================================================

export const usePlayNowStore = create<PlayNowStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    status: "idle",
    error: null,
    settings: { ...DEFAULT_SETTINGS },
    queueEntry: null,
    onChainGameId: null,
    matchedGameId: null,
    matchedOpponent: null,
    playerColor: null,
    searchStartTime: null,
    searchDurationSeconds: 0,
    playersInQueue: 0,
    compatiblePlayers: 0,
    _userId: null,
    _userElo: 1200,
    _subscription: null,
    _pollInterval: null,
    _durationInterval: null,
    _biconomyInitialized: false,
    _findMatchInProgress: false,

    // --------------------------------------------------------------------------
    // Initialization
    // --------------------------------------------------------------------------

    initialize: (userId: string, userElo: number) => {
      const state = get();
      if (state._userId === userId) return;

      // Cleanup existing
      if (state._subscription) {
        supabase.removeChannel(state._subscription);
      }
      if (state._pollInterval) {
        clearInterval(state._pollInterval);
      }
      if (state._durationInterval) {
        clearInterval(state._durationInterval);
      }

      set({
        _userId: userId,
        _userElo: userElo,
        _subscription: null,
        _pollInterval: null,
        _durationInterval: null,
      });
    },

    initializeBiconomy: async (walletProvider: any) => {
      const state = get();
      if (state._biconomyInitialized) return true;

      try {
        const sdk = getRelaySDK();
        // Check if SDK is already initialized (from AuthContext pre-initialization)
        if (sdk.isInitialized()) {
          console.log("[PlayNowStore] Relay SDK already initialized, syncing state");
        } else {
          await sdk.initialize(walletProvider);
          console.log("[PlayNowStore] Relay SDK initialized");
        }
        set({ _biconomyInitialized: true });
        return true;
      } catch (error) {
        console.error("[PlayNowStore] Failed to initialize Relay SDK:", error);
        return false;
      }
    },

    cleanup: () => {
      const state = get();

      if (state._subscription) {
        supabase.removeChannel(state._subscription);
      }
      if (state._pollInterval) {
        clearInterval(state._pollInterval);
      }
      if (state._durationInterval) {
        clearInterval(state._durationInterval);
      }

      set({
        status: "idle",
        error: null,
        queueEntry: null,
        onChainGameId: null,
        matchedGameId: null,
        matchedOpponent: null,
        playerColor: null,
        searchStartTime: null,
        searchDurationSeconds: 0,
        _subscription: null,
        _pollInterval: null,
        _durationInterval: null,
        _findMatchInProgress: false,
      });
    },

    // --------------------------------------------------------------------------
    // Settings
    // --------------------------------------------------------------------------

    updateSettings: (settings: Partial<PlayNowSettings>) => {
      set((prev) => ({
        settings: { ...prev.settings, ...settings },
      }));
    },

    // --------------------------------------------------------------------------
    // Queue Actions
    // --------------------------------------------------------------------------

    startSearching: async () => {
      const state = get();
      if (!state._userId) {
        set({ error: "Not authenticated" });
        return false;
      }

      if (state.status === "searching") {
        return false;
      }

      const { wagerTct, timeControlSeconds, incrementSeconds } = state.settings;

      set({ status: "searching", error: null });

      try {
        // Step 1: Cancel any existing queue entries
        await supabase
          .from("play_now_queue")
          .update({ status: "cancelled" })
          .eq("user_id", state._userId)
          .eq("status", "waiting");

        // Step 2: Calculate ELO range
        const eloRangeMin = state._userElo - INITIAL_ELO_RANGE;
        const eloRangeMax = state._userElo + INITIAL_ELO_RANGE;

        // Step 3: Insert queue entry (NO escrow yet — escrow happens after match)
        const expiresAt = new Date(Date.now() + QUEUE_TIMEOUT_SECONDS * 1000);

        const { data: queueEntry, error: insertError } = await supabase
          .from("play_now_queue")
          .insert({
            user_id: state._userId,
            wager_tct: wagerTct,
            time_control_seconds: timeControlSeconds,
            increment_seconds: incrementSeconds,
            elo_rating: state._userElo,
            elo_range_min: eloRangeMin,
            elo_range_max: eloRangeMax,
            on_chain_game_id: null,
            status: "waiting",
            expires_at: expiresAt.toISOString(),
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Step 4: Send push notifications to compatible players in queue
        await get()._notifyPlayersInQueue();

        // Step 5: Start searching
        set({
          queueEntry: {
            id: queueEntry.id,
            oderId: queueEntry.user_id,
            wagerTct: queueEntry.wager_tct,
            timeControlSeconds: queueEntry.time_control_seconds,
            incrementSeconds: queueEntry.increment_seconds,
            eloRating: queueEntry.elo_rating,
            eloRangeMin: queueEntry.elo_range_min,
            eloRangeMax: queueEntry.elo_range_max,
            onChainGameId: null,
            status: queueEntry.status,
            matchedWithId: queueEntry.matched_with_id,
            gameId: queueEntry.game_id,
            createdAt: queueEntry.created_at,
            expiresAt: queueEntry.expires_at,
          },
          onChainGameId: null,
          searchStartTime: Date.now(),
          searchDurationSeconds: 0,
        });

        // Step 6: Try to find immediate match
        const matched = await get()._findMatch();
        if (matched) return true;

        // Step 8: Start polling and subscription
        const pollInterval = setInterval(async () => {
          await get()._checkForMatch();
        }, POLL_INTERVAL_MS);

        const durationInterval = setInterval(() => {
          const startTime = get().searchStartTime;
          if (startTime) {
            set({ searchDurationSeconds: Math.floor((Date.now() - startTime) / 1000) });
          }
        }, 1000);

        // Subscribe to queue updates
        const subscription = supabase
          .channel(`play_now_queue:${queueEntry.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "play_now_queue",
              filter: `id=eq.${queueEntry.id}`,
            },
            async (payload) => {
              const newData = payload.new as any;
              if (newData.status === "matched" && newData.game_id) {
                // We got matched by someone else
                await get()._checkForMatch();
              }
            }
          )
          .subscribe();

        set({
          _pollInterval: pollInterval,
          _durationInterval: durationInterval,
          _subscription: subscription,
        });

        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start search";
        console.error("[PlayNowStore] startSearching error:", error);
        set({ status: "error", error: message });
        return false;
      }
    },

    cancelSearch: async () => {
      const state = get();

      // Stop polling
      if (state._pollInterval) {
        clearInterval(state._pollInterval);
      }
      if (state._durationInterval) {
        clearInterval(state._durationInterval);
      }
      if (state._subscription) {
        supabase.removeChannel(state._subscription);
      }

      // Cancel queue entry
      if (state.queueEntry) {
        await supabase
          .from("play_now_queue")
          .update({ status: "cancelled" })
          .eq("id", state.queueEntry.id);
      }

      set({
        status: "cancelled",
        queueEntry: null,
        onChainGameId: null,
        searchStartTime: null,
        searchDurationSeconds: 0,
        _pollInterval: null,
        _durationInterval: null,
        _subscription: null,
        _findMatchInProgress: false,
      });

      return true;
    },

    // --------------------------------------------------------------------------
    // Internal Match Finding
    // --------------------------------------------------------------------------

    _findMatch: async () => {
      const state = get();
      if (!state.queueEntry || !state._userId) return false;

      // Prevent concurrent _findMatch calls (relay operations take time)
      if (state._findMatchInProgress) {
        console.log("[PlayNowStore] _findMatch already in progress, skipping");
        return false;
      }
      set({ _findMatchInProgress: true });

      const searchDuration = state.searchStartTime
        ? Math.floor((Date.now() - state.searchStartTime) / 1000)
        : 0;

      // Calculate expanded ELO range based on search duration
      const expansion = Math.min(
        searchDuration * ELO_EXPANSION_PER_SECOND,
        MAX_ELO_RANGE - INITIAL_ELO_RANGE
      );
      const eloRangeMin = state._userElo - INITIAL_ELO_RANGE - expansion;
      const eloRangeMax = state._userElo + INITIAL_ELO_RANGE + expansion;

      try {
        // Use the find_compatible_opponents RPC (SECURITY DEFINER, cleans up expired entries)
        const { data: opponents, error } = await (supabase.rpc as any)(
          "find_compatible_opponents",
          {
            p_user_id: state._userId,
            p_wager_tct: state.settings.wagerTct,
            p_time_control_seconds: state.settings.timeControlSeconds,
            p_increment_seconds: state.settings.incrementSeconds,
            p_elo_rating: state._userElo,
            p_elo_range_min: eloRangeMin,
            p_elo_range_max: eloRangeMax,
            p_limit: 10,
          }
        );

        if (error) throw error;

        // Update stats
        const { count: totalCount } = await supabase
          .from("play_now_queue")
          .select("*", { count: "exact", head: true })
          .eq("status", "waiting")
          .eq("wager_tct", state.settings.wagerTct)
          .neq("user_id", state._userId);

        set({
          playersInQueue: totalCount || 0,
          compatiblePlayers: opponents?.length || 0,
        });

        if (!opponents || opponents.length === 0) {
          set({ _findMatchInProgress: false });
          return false;
        }

        const validOpponent = opponents[0];

        // Map RPC result fields to match expected shape
        const opponentEntry = {
          id: validOpponent.queue_id,
          user_id: validOpponent.opponent_id,
          elo_rating: validOpponent.opponent_elo,
          on_chain_game_id: validOpponent.on_chain_game_id,
          profiles: {
            username: validOpponent.opponent_username,
            avatar_index: validOpponent.opponent_avatar_index,
            elo_rating: validOpponent.opponent_elo,
          },
        };

        // NO escrow operations here — escrow happens in background AFTER game starts

        // Try to claim the match atomically via RPC (bypasses RLS)
        const { data: claimResult, error: claimError } = await (supabase.rpc as any)(
          "claim_play_now_match",
          {
            p_my_queue_id: state.queueEntry.id,
            p_opponent_queue_id: opponentEntry.id,
          }
        );

        if (claimError || !claimResult?.success) {
          console.log("[PlayNowStore] Claim failed:", claimError?.message || claimResult?.error);
          set({ _findMatchInProgress: false });
          return false;
        }

        // Create the game immediately (escrow locks in background)
        const gameId = await get()._createGame(opponentEntry);

        if (gameId) {
          // Update both queue entries with game ID via RPC (bypasses RLS)
          await (supabase.rpc as any)("set_play_now_game_id", {
            p_my_queue_id: state.queueEntry.id,
            p_opponent_queue_id: opponentEntry.id,
            p_game_id: gameId,
          });

          // Stop polling
          if (state._pollInterval) clearInterval(state._pollInterval);
          if (state._durationInterval) clearInterval(state._durationInterval);
          if (state._subscription) supabase.removeChannel(state._subscription);

          const profile = opponentEntry.profiles as any;

          set({
            status: "matched",
            matchedGameId: gameId,
            matchedOpponent: {
              id: opponentEntry.user_id,
              username: profile?.username || "Opponent",
              avatarIndex: profile?.avatar_index || 0,
              eloRating: opponentEntry.elo_rating,
            },
            _pollInterval: null,
            _durationInterval: null,
            _subscription: null,
            _findMatchInProgress: false,
          });

          return true;
        }

        set({ _findMatchInProgress: false });
        return false;
      } catch (error) {
        console.error("[PlayNowStore] _findMatch error:", error);
        set({ _findMatchInProgress: false });
        return false;
      }
    },

    _checkForMatch: async () => {
      const state = get();
      if (!state.queueEntry || state.status !== "searching") return;

      try {
        // Check if we've been matched by someone else
        const { data: entry, error: entryError } = await supabase
          .from("play_now_queue")
          .select("*, profiles:matched_with_id(id, username, avatar_index, elo_rating)")
          .eq("id", state.queueEntry.id)
          .single();

        if (entryError) {
          console.error("[PlayNowStore] _checkForMatch query error:", entryError);
          return;
        }

        if (entry?.status === "matched" && entry?.game_id) {
          // Stop polling immediately
          const currentState = get();
          if (currentState._pollInterval) clearInterval(currentState._pollInterval);
          if (currentState._durationInterval) clearInterval(currentState._durationInterval);
          if (currentState._subscription) supabase.removeChannel(currentState._subscription);

          const profile = entry.profiles as any;

          // Get game to determine our color
          const { data: game } = await supabase
            .from("games")
            .select("white_player_id, black_player_id")
            .eq("id", entry.game_id)
            .single();

          const playerColor = game?.white_player_id === currentState._userId ? "w" : "b";

          set({
            status: "matched",
            matchedGameId: entry.game_id,
            matchedOpponent: {
              id: entry.matched_with_id,
              username: profile?.username || "Opponent",
              avatarIndex: profile?.avatar_index || 0,
              eloRating: profile?.elo_rating || 1200,
            },
            playerColor,
            _pollInterval: null,
            _durationInterval: null,
            _subscription: null,
            _findMatchInProgress: false,
          });

          return;
        }

        // Check for expiration
        if (state.searchDurationSeconds >= QUEUE_TIMEOUT_SECONDS) {
          await get().cancelSearch();
          set({ status: "error", error: "Search timed out. Please try again." });
          return;
        }

        // Try to find a match
        await get()._findMatch();

        // Expand ELO range
        await get()._expandEloRange();
      } catch (err) {
        console.error("[PlayNowStore] _checkForMatch error:", err);
        // Reset mutex on error so future calls aren't blocked
        set({ _findMatchInProgress: false });
      }
    },

    _expandEloRange: async () => {
      const state = get();
      if (!state.queueEntry || !state.searchStartTime) return;

      const searchDuration = Math.floor((Date.now() - state.searchStartTime) / 1000);
      const expansion = Math.min(
        searchDuration * ELO_EXPANSION_PER_SECOND,
        MAX_ELO_RANGE - INITIAL_ELO_RANGE
      );

      const newMin = state._userElo - INITIAL_ELO_RANGE - expansion;
      const newMax = state._userElo + INITIAL_ELO_RANGE + expansion;

      await supabase
        .from("play_now_queue")
        .update({
          elo_range_min: newMin,
          elo_range_max: newMax,
        })
        .eq("id", state.queueEntry.id);
    },

    _createGame: async (opponent: any) => {
      const state = get();
      if (!state._userId || !state.queueEntry) return null;

      try {
        // Random color assignment
        const playerIsWhite = Math.random() < 0.5;
        const whitePlayerId = playerIsWhite ? state._userId : opponent.user_id;
        const blackPlayerId = playerIsWhite ? opponent.user_id : state._userId;

        // Get profiles
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, elo_rating")
          .in("id", [state._userId, opponent.user_id]);

        const myProfile = profiles?.find((p) => p.id === state._userId);
        const oppProfile = profiles?.find((p) => p.id === opponent.user_id);

        // Create game immediately — NO on-chain escrow verification
        // Escrow will be locked in background while players are already playing
        const { data: game, error: gameError } = await supabase
          .from("games")
          .insert({
            white_player_id: whitePlayerId,
            black_player_id: blackPlayerId,
            wager_tct: state.settings.wagerTct,
            time_control_seconds: state.settings.timeControlSeconds,
            increment_seconds: state.settings.incrementSeconds,
            status: "active",
            initial_fen: INITIAL_FEN,
            current_fen: INITIAL_FEN,
            white_time_remaining: state.settings.timeControlSeconds,
            black_time_remaining: state.settings.timeControlSeconds,
            move_count: 0,
            current_turn: "w",
            white_elo_before: playerIsWhite
              ? (myProfile?.elo_rating || 1200)
              : (oppProfile?.elo_rating || 1200),
            black_elo_before: playerIsWhite
              ? (oppProfile?.elo_rating || 1200)
              : (myProfile?.elo_rating || 1200),
            started_at: new Date().toISOString(),
            on_chain_game_id: null, // Will be set by background escrow
          })
          .select()
          .single();

        if (gameError || !game) {
          console.error("[PlayNowStore] Failed to create game:", gameError);
          return null;
        }

        // Lock TCT balances in DB immediately for wager games (prevents double-spend)
        if (state.settings.wagerTct > 0) {
          await supabase.from("game_escrows").insert({
            game_id: game.id,
            player_white_id: whitePlayerId,
            player_white_locked_tct: state.settings.wagerTct,
            player_black_id: blackPlayerId,
            player_black_locked_tct: state.settings.wagerTct,
            total_pool_tct: state.settings.wagerTct * 2,
            status: "active", // Must be "active" for settle_escrow_with_rake to work
            on_chain_game_id: null,
          });

          // Lock TCT balances for both players via RPC (SECURITY DEFINER)
          for (const playerId of [whitePlayerId, blackPlayerId]) {
            await (supabase.rpc as any)("lock_balance_for_game", {
              p_user_id: playerId,
              p_amount: state.settings.wagerTct,
              p_game_id: game.id,
            });
          }

          // On-chain escrow is handled by each player's device independently
          // in online-game.tsx after the game starts:
          // - White player's device: creates escrow (approveAndCreateGame)
          // - Black player's device: polls for escrow, then joins (joinGameWithPermit)
          // This runs in parallel while players are already making moves.
        }

        set({ playerColor: playerIsWhite ? "w" : "b" });

        return game.id;
      } catch (error) {
        console.error("[PlayNowStore] _createGame error:", error);
        return null;
      }
    },

    _notifyPlayersInQueue: async () => {
      const state = get();
      if (!state._userId) return;

      try {
        // Find players in queue with compatible settings
        const { data: compatiblePlayers } = await supabase
          .from("play_now_queue")
          .select("user_id")
          .eq("status", "waiting")
          .eq("wager_tct", state.settings.wagerTct)
          .eq("time_control_seconds", state.settings.timeControlSeconds)
          .neq("user_id", state._userId)
          .limit(50);

        if (!compatiblePlayers || compatiblePlayers.length === 0) return;

        // Get push tokens for these users
        const userIds = compatiblePlayers.map((p) => p.user_id);

        const { data: tokens } = await supabase
          .from("profiles")
          .select("id, push_token")
          .in("id", userIds)
          .not("push_token", "is", null);

        if (!tokens || tokens.length === 0) return;

        // Send push notifications via Supabase Edge Function
        await supabase.functions.invoke("send-push-notification", {
          body: {
            tokens: tokens.map((t) => t.push_token),
            title: "Player Found!",
            body: `A player is looking for a ${state.settings.wagerTct > 0 ? `${state.settings.wagerTct} TCT` : "free"} match. Tap to play!`,
            data: {
              type: "matchmaking_player_found",
              wagerTct: state.settings.wagerTct,
              timeControl: state.settings.timeControlSeconds,
            },
          },
        });

        console.log("[PlayNowStore] Notified", tokens.length, "players in queue");
      } catch (error) {
        console.error("[PlayNowStore] _notifyPlayersInQueue error:", error);
      }
    },

    // --------------------------------------------------------------------------
    // UI Helpers
    // --------------------------------------------------------------------------

    clearError: () => set({ error: null }),

    clearMatch: () => set({
      matchedGameId: null,
      matchedOpponent: null,
      playerColor: null,
    }),

    resetState: () => {
      const state = get();

      if (state._pollInterval) clearInterval(state._pollInterval);
      if (state._durationInterval) clearInterval(state._durationInterval);
      if (state._subscription) supabase.removeChannel(state._subscription);

      set({
        status: "idle",
        error: null,
        queueEntry: null,
        onChainGameId: null,
        matchedGameId: null,
        matchedOpponent: null,
        playerColor: null,
        searchStartTime: null,
        searchDurationSeconds: 0,
        playersInQueue: 0,
        compatiblePlayers: 0,
        _pollInterval: null,
        _durationInterval: null,
        _subscription: null,
      });
    },
  }))
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const usePlayNowStatus = () =>
  usePlayNowStore((state) => state.status);

export const usePlayNowSettings = () =>
  usePlayNowStore((state) => state.settings);

export const usePlayNowMatch = () =>
  usePlayNowStore((state) => ({
    gameId: state.matchedGameId,
    opponent: state.matchedOpponent,
    playerColor: state.playerColor,
  }));

export const usePlayNowSearchStats = () =>
  usePlayNowStore((state) => ({
    duration: state.searchDurationSeconds,
    playersInQueue: state.playersInQueue,
    compatiblePlayers: state.compatiblePlayers,
  }));

export default usePlayNowStore;
