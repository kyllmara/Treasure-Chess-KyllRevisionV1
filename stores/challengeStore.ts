/**
 * Challenge Store
 *
 * Zustand store for global challenge state management.
 * Provides persistent state for:
 * - Active challenges (created/received)
 * - Challenge board cache
 * - Current challenge being viewed
 * - UI state for challenge flows
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  ChallengeService,
  Challenge,
  ChallengeFilters,
  CreateChallengeInput,
  generateRoomCode,
} from "@/lib/challenges";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRelaySDK, tctToUsdc, type RelayResponse } from "@/lib/relay";
import { ethers } from "ethers";

// Alias for backward compatibility
type TransactionResult = RelayResponse;

// ============================================================================
// Types
// ============================================================================

export interface ChallengeSettings {
  timeControl: number; // seconds
  increment: number; // seconds
  wagerAmount: number; // TCT
  isPublic: boolean;
  isRated: boolean;
  colorPreference: "white" | "black" | "random";
}

export interface ChallengeStoreState {
  // User's challenges
  myCreatedChallenges: Challenge[];
  myReceivedChallenges: Challenge[];

  // Public challenge board
  publicChallenges: Challenge[];
  boardFilters: ChallengeFilters;

  // Current active challenge
  currentChallenge: Challenge | null;
  currentRoomCode: string | null;

  // On-chain game ID (bytes32)
  currentOnChainGameId: string | null;

  // Pending challenge creation settings
  pendingSettings: ChallengeSettings;

  // UI States
  isLoading: boolean;
  isCreating: boolean;
  isJoining: boolean;
  isOnChainPending: boolean; // Waiting for on-chain tx
  error: string | null;

  // Result
  joinedGameId: string | null;

  // Internal
  _userId: string | null;
  _service: ChallengeService | null;
  _myChallengesSubscription: RealtimeChannel | null;
  _publicSubscription: RealtimeChannel | null;
  _biconomyInitialized: boolean;
}

export interface ChallengeStoreActions {
  // Initialization
  initialize: (userId: string) => void;
  initializeBiconomy: (walletProvider: any) => Promise<boolean>;
  cleanup: () => void;

  // Challenge creation (with on-chain escrow)
  updatePendingSettings: (settings: Partial<ChallengeSettings>) => void;
  createPublicChallenge: () => Promise<Challenge | null>;
  createPrivateChallenge: () => Promise<{ challenge: Challenge; roomCode: string } | null>;
  createChallengeWithSettings: (settings: ChallengeSettings) => Promise<Challenge | null>;

  // On-chain challenge creation (creates escrow first, then DB record)
  createOnChainChallenge: (isPublic: boolean) => Promise<{ challenge: Challenge; onChainGameId: string } | null>;

  // Challenge joining (with on-chain escrow)
  joinByRoomCode: (roomCode: string) => Promise<boolean>;
  joinChallenge: (challengeId: string) => Promise<boolean>;
  joinOnChainChallenge: (challengeId: string, onChainGameId: string) => Promise<{ success: boolean; gameId?: string; error?: string }>;
  searchByCode: (roomCode: string) => Promise<Challenge | null>;

  // Mark player as ready in lobby (triggers fund lock when both ready)
  markReady: (challengeId: string) => Promise<{ success: boolean; gameStarted?: boolean; gameId?: string; error?: string }>;
  unmarkReady: (challengeId: string) => Promise<{ success: boolean; error?: string }>;
  leaveLobbyAsOpponent: (challengeId: string) => Promise<{ success: boolean; error?: string }>;

  // Challenge management
  cancelChallenge: (challengeId?: string) => Promise<boolean>;
  cancelOnChainChallenge: (challengeId?: string, onChainGameId?: string) => Promise<boolean>;
  declineChallenge: (challengeId: string) => Promise<boolean>;
  makePublic: (challengeId: string) => Promise<boolean>;
  deleteDeclinedChallenge: (challengeId: string) => Promise<boolean>;

  // Data fetching
  refreshMyChallenges: () => Promise<void>;
  refreshPublicBoard: () => Promise<void>;
  setFilters: (filters: Partial<ChallengeFilters>) => void;
  loadChallenge: (challengeId: string) => Promise<Challenge | null>;

  // UI helpers
  clearError: () => void;
  clearJoinedGame: () => void;
  setCurrentChallenge: (challenge: Challenge | null) => void;
  resetState: () => void;
}

export type ChallengeStore = ChallengeStoreState & ChallengeStoreActions;

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_SETTINGS: ChallengeSettings = {
  timeControl: 300, // 5 minutes
  increment: 3, // 3 second increment
  wagerAmount: 0,
  isPublic: true,
  isRated: true,
  colorPreference: "random",
};

const initialState: Omit<
  ChallengeStoreState,
  "_userId" | "_service" | "_myChallengesSubscription" | "_publicSubscription" | "_biconomyInitialized"
> = {
  myCreatedChallenges: [],
  myReceivedChallenges: [],
  publicChallenges: [],
  boardFilters: {},
  currentChallenge: null,
  currentRoomCode: null,
  currentOnChainGameId: null,
  pendingSettings: { ...DEFAULT_SETTINGS },
  isLoading: false,
  isCreating: false,
  isJoining: false,
  isOnChainPending: false,
  error: null,
  joinedGameId: null,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useChallengeStore = create<ChallengeStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    ...initialState,
    _userId: null,
    _service: null,
    _myChallengesSubscription: null,
    _publicSubscription: null,
    _biconomyInitialized: false,

    // --------------------------------------------------------------------------
    // Initialization
    // --------------------------------------------------------------------------

    initialize: (userId: string) => {
      const state = get();

      // Avoid re-initialization
      if (state._userId === userId && state._service) {
        return;
      }

      // Cleanup existing subscriptions
      if (state._myChallengesSubscription) {
        state._myChallengesSubscription.unsubscribe();
      }
      if (state._publicSubscription) {
        state._publicSubscription.unsubscribe();
      }

      // Create service with callbacks for real-time updates
      const service = new ChallengeService(userId, {
        onChallengeAccepted: (challenge, gameId) => {
          set((prev) => ({
            ...prev,
            joinedGameId: gameId,
            currentChallenge: challenge,
          }));
        },
        onChallengeDeclined: (challenge) => {
          set((prev) => ({
            ...prev,
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== challenge.id
            ),
          }));
        },
        onChallengeCancelled: (challenge) => {
          set((prev) => ({
            ...prev,
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== challenge.id
            ),
            myReceivedChallenges: prev.myReceivedChallenges.filter(
              (c) => c.id !== challenge.id
            ),
            currentChallenge:
              prev.currentChallenge?.id === challenge.id
                ? null
                : prev.currentChallenge,
          }));
        },
        onChallengeExpired: (challenge) => {
          set((prev) => ({
            ...prev,
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== challenge.id
            ),
            myReceivedChallenges: prev.myReceivedChallenges.filter(
              (c) => c.id !== challenge.id
            ),
          }));
        },
        onNewChallenge: (challenge) => {
          set((prev) => ({
            ...prev,
            myReceivedChallenges: [challenge, ...prev.myReceivedChallenges],
          }));
        },
      });

      // Setup my challenges subscription
      service.subscribeToMyChallenges();

      set({
        _userId: userId,
        _service: service,
        _myChallengesSubscription: null, // Subscription is managed internally by service
      });

      // Fetch initial data
      get().refreshMyChallenges();
    },

    cleanup: () => {
      const state = get();

      // Cleanup service (handles internal subscriptions)
      if (state._service) {
        state._service.destroy();
      }
      if (state._publicSubscription) {
        state._publicSubscription.unsubscribe();
      }

      set({
        ...initialState,
        _userId: null,
        _service: null,
        _myChallengesSubscription: null,
        _publicSubscription: null,
      });
    },

    // --------------------------------------------------------------------------
    // Biconomy Initialization
    // --------------------------------------------------------------------------

    initializeBiconomy: async (walletProvider: any) => {
      const state = get();
      if (state._biconomyInitialized) return true;

      try {
        const sdk = getRelaySDK();
        // Check if SDK is already initialized (from AuthContext pre-initialization)
        if (sdk.isInitialized()) {
          console.log("[ChallengeStore] Relay SDK already initialized, syncing state");
        } else {
          await sdk.initialize(walletProvider);
          console.log("[ChallengeStore] Relay SDK initialized");
        }
        set({ _biconomyInitialized: true });
        return true;
      } catch (error) {
        console.error("[ChallengeStore] Failed to initialize Relay SDK:", error);
        return false;
      }
    },

    // --------------------------------------------------------------------------
    // Challenge Creation
    // --------------------------------------------------------------------------

    updatePendingSettings: (settings: Partial<ChallengeSettings>) => {
      set((prev) => ({
        pendingSettings: { ...prev.pendingSettings, ...settings },
      }));
    },

    // --------------------------------------------------------------------------
    // On-Chain Challenge Creation (NEW - with smart contract escrow)
    // --------------------------------------------------------------------------

    createOnChainChallenge: async (isPublic: boolean) => {
      const state = get();
      if (!state._service || !state._userId) {
        set({ error: "Not authenticated" });
        return null;
      }

      if (!state._biconomyInitialized) {
        set({ error: "Wallet not connected" });
        return null;
      }

      set({ isCreating: true, error: null });

      try {
        // Generate unique game ID for on-chain (will be used when opponent joins)
        const gameId = `${state._userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const gameIdBytes = ethers.id(gameId);

        // Convert TCT wager to USDC
        const wagerTct = state.pendingSettings.wagerAmount;
        const wagerUsdc = tctToUsdc(wagerTct).toFixed(6);

        console.log("[ChallengeStore] Creating challenge (NO on-chain tx yet):", {
          gameId,
          gameIdBytes,
          wagerTct,
          wagerUsdc,
        });

        // NEW FLOW: Only create database record, NO on-chain transaction
        // Funds will be locked when opponent accepts and both players confirm
        // The on_chain_game_id is stored so we know which game ID to use when creating escrow later

        const challenge = await state._service.createChallenge({
          creatorId: state._userId,
          timeControlSeconds: state.pendingSettings.timeControl,
          incrementSeconds: state.pendingSettings.increment,
          wagerTct: wagerTct,
          isPublic: isPublic,
          isRated: state.pendingSettings.isRated,
          colorPreference: state.pendingSettings.colorPreference,
          // Store the game ID bytes - will be used when both players lock funds
          onChainGameId: wagerTct > 0 ? gameIdBytes : undefined,
        });

        if (!challenge) {
          throw new Error("Failed to create challenge record");
        }

        console.log("[ChallengeStore] Challenge created (funds NOT locked yet):", {
          id: challenge.id,
          room_code: challenge.room_code,
          wager_tct: challenge.wager_tct,
          on_chain_game_id: gameIdBytes,
        });

        set((prev) => ({
          isCreating: false,
          currentChallenge: challenge,
          currentRoomCode: challenge.room_code,
          currentOnChainGameId: wagerTct > 0 ? gameIdBytes : null,
          myCreatedChallenges: [challenge, ...prev.myCreatedChallenges],
        }));

        return { challenge, onChainGameId: gameIdBytes };
      } catch (error) {
        let message = error instanceof Error ? error.message : "Failed to create challenge";
        console.error("[ChallengeStore] createOnChainChallenge error:", error);

        // Check for auth errors and provide better messaging
        if (message.includes("401") || message.includes("JWT") || message.includes("authenticated")) {
          message = "Session expired. Please log out and log back in to create challenges.";
        }

        set({ isCreating: false, error: message });
        return null;
      }
    },

    createPublicChallenge: async () => {
      const state = get();
      if (!state._service || !state._userId) {
        set({ error: "Not authenticated" });
        return null;
      }

      set({ isCreating: true, error: null });

      try {
        const challenge = await state._service.createChallenge({
          creatorId: state._userId,
          timeControlSeconds: state.pendingSettings.timeControl,
          incrementSeconds: state.pendingSettings.increment,
          wagerTct: state.pendingSettings.wagerAmount,
          isPublic: true,
          isRated: state.pendingSettings.isRated,
          colorPreference: state.pendingSettings.colorPreference,
        });

        if (challenge) {
          set((prev) => ({
            isCreating: false,
            currentChallenge: challenge,
            currentRoomCode: challenge.room_code,
            myCreatedChallenges: [challenge, ...prev.myCreatedChallenges],
          }));
          return challenge;
        } else {
          set({ isCreating: false, error: "Failed to create challenge" });
          return null;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create challenge";
        set({ isCreating: false, error: message });
        return null;
      }
    },

    createPrivateChallenge: async () => {
      const state = get();
      if (!state._service || !state._userId) {
        set({ error: "Not authenticated" });
        return null;
      }

      set({ isCreating: true, error: null });

      try {
        const challenge = await state._service.createChallenge({
          creatorId: state._userId,
          timeControlSeconds: state.pendingSettings.timeControl,
          incrementSeconds: state.pendingSettings.increment,
          wagerTct: state.pendingSettings.wagerAmount,
          isPublic: false,
          isRated: state.pendingSettings.isRated,
          colorPreference: state.pendingSettings.colorPreference,
        });

        if (challenge) {
          console.log("[ChallengeStore] Private challenge created:", {
            id: challenge.id,
            room_code: challenge.room_code,
            is_public: challenge.is_public,
            fullChallenge: JSON.stringify(challenge).substring(0, 500),
          });
          set((prev) => ({
            isCreating: false,
            currentChallenge: challenge,
            currentRoomCode: challenge.room_code,
            myCreatedChallenges: [challenge, ...prev.myCreatedChallenges],
          }));
          return { challenge, roomCode: challenge.room_code };
        } else {
          console.log("[ChallengeStore] Private challenge creation returned null");
          set({ isCreating: false, error: "Failed to create challenge" });
          return null;
        }
      } catch (error) {
        console.error("[ChallengeStore] Private challenge creation error:", error);
        const message =
          error instanceof Error ? error.message : "Failed to create challenge";
        set({ isCreating: false, error: message });
        return null;
      }
    },

    createChallengeWithSettings: async (settings: ChallengeSettings) => {
      const state = get();
      if (!state._service || !state._userId) {
        set({ error: "Not authenticated" });
        return null;
      }

      set({ isCreating: true, error: null });

      try {
        const challenge = await state._service.createChallenge({
          creatorId: state._userId,
          timeControlSeconds: settings.timeControl,
          incrementSeconds: settings.increment,
          wagerTct: settings.wagerAmount,
          isPublic: settings.isPublic,
          isRated: settings.isRated,
          colorPreference: settings.colorPreference,
        });

        if (challenge) {
          set((prev) => ({
            isCreating: false,
            currentChallenge: challenge,
            currentRoomCode: challenge.room_code,
            myCreatedChallenges: [challenge, ...prev.myCreatedChallenges],
          }));
          return challenge;
        } else {
          set({ isCreating: false, error: "Failed to create challenge" });
          return null;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create challenge";
        set({ isCreating: false, error: message });
        return null;
      }
    },

    // --------------------------------------------------------------------------
    // Creator Confirms and Locks Funds
    // --------------------------------------------------------------------------
    // Called when an opponent wants to play and the creator confirms
    // Mark the current player as ready in the lobby
    // When both players are ready, this triggers fund locking and game creation

    markReady: async (challengeId: string) => {
      const state = get();
      if (!state._service || !state._userId) {
        return { success: false, error: "Not authenticated" };
      }

      // Prevent duplicate calls - if already processing, return early
      if (state.isOnChainPending) {
        console.log("[ChallengeStore] markReady already in progress, skipping duplicate call");
        return { success: false, error: "Already processing" };
      }

      set({ isOnChainPending: true, error: null });

      try {
        // Get the latest challenge state
        const challenge = await state._service.getChallengeById(challengeId);
        if (!challenge) {
          // Challenge not found - may have been deleted or already completed
          console.log("[ChallengeStore] markReady - challenge not found, may already be accepted/completed");
          set({ isOnChainPending: false });
          return { success: false, error: "Challenge not found or already completed" };
        }

        // Check if challenge was already accepted and game created
        if (challenge.status === "accepted" && challenge.game_id) {
          console.log("[ChallengeStore] markReady - challenge already accepted, game exists:", challenge.game_id);
          set({
            isOnChainPending: false,
            joinedGameId: challenge.game_id,
          });
          return {
            success: true,
            gameStarted: true,
            gameId: challenge.game_id,
          };
        }

        // If challenge is cancelled, declined, or expired, return error
        if (challenge.status !== "pending") {
          console.log("[ChallengeStore] markReady - challenge status is not pending:", challenge.status);
          set({ isOnChainPending: false });
          return { success: false, error: `Challenge is ${challenge.status}` };
        }

        const isCreator = challenge.creator_id === state._userId;
        const isOpponent = challenge.opponent_id === state._userId;

        if (!isCreator && !isOpponent) {
          throw new Error("You are not a participant in this challenge");
        }

        // For wager challenges, verify wallet is connected
        if (challenge.wager_tct > 0 && !state._biconomyInitialized) {
          throw new Error("Wallet not connected");
        }

        console.log("[ChallengeStore] Marking ready:", {
          challengeId,
          isCreator,
          isOpponent,
          creatorReady: challenge.creator_ready,
          opponentReady: challenge.opponent_ready,
          wager_tct: challenge.wager_tct,
        });

        // Step 1: Mark as ready in the database FIRST (no funds locked yet)
        const updateData = isCreator
          ? { creator_ready: true }
          : { opponent_ready: true };

        const { error: updateError } = await supabase
          .from("challenges")
          .update(updateData as never)
          .eq("id", challengeId);

        if (updateError) {
          throw new Error("Failed to update ready status");
        }

        // Notify the OTHER player that this player is ready
        try {
          const otherPlayerId = isCreator ? challenge.opponent_id : challenge.creator_id;
          if (otherPlayerId) {
            const { data: myProfile } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", state._userId)
              .single();
            const myUsername = (myProfile as any)?.username || "Your opponent";

            await supabase.from("challenge_notifications").insert({
              user_id: otherPlayerId,
              challenge_id: challengeId,
              notification_type: "game_starting",
              title: "Player Ready!",
              body: `${myUsername} is ready to play!`,
              data: { type: "player_ready", challengeId },
              is_read: false,
              is_push_sent: false,
            } as any);
          }
        } catch (notifyError) {
          console.error("[ChallengeStore] Failed to insert ready notification:", notifyError);
        }

        // Refresh challenge to get latest state
        const updatedChallenge = await state._service.getChallengeById(challengeId);
        if (!updatedChallenge) {
          throw new Error("Failed to refresh challenge");
        }

        // Check if BOTH players are now ready
        const bothReady = updatedChallenge.creator_ready && updatedChallenge.opponent_ready;

        if (!bothReady) {
          // Not both ready yet - just update local state and return
          console.log("[ChallengeStore] Waiting for other player to ready up");
          set({
            isOnChainPending: false,
            currentChallenge: updatedChallenge,
          });
          return { success: true, gameStarted: false };
        }

        // BOTH PLAYERS ARE READY - Start game immediately!
        // On-chain escrow will be locked in background (like Play Now flow)
        console.log("[ChallengeStore] Both players ready! Starting game immediately...");

        // For wager games, we'll let online-game.tsx handle background escrow locking
        // This follows the same pattern as Play Now - game starts immediately,
        // white player creates escrow, black player polls and joins in background
        if (challenge.wager_tct > 0) {
          console.log("[ChallengeStore] Wager game - escrow will be locked in background after game starts");
        }

        // Start the game!
        console.log("[ChallengeStore] Starting game (escrow will lock in background)...");

        // Start the game from lobby (works for both creator and opponent)
        const acceptResult = await state._service.startGameFromLobby(challengeId);

        if (!acceptResult.success || !acceptResult.gameId) {
          // Check if the challenge was already processed by the other player
          // This happens when both clients race to call startGameFromLobby
          if (acceptResult.error === "Challenge not found") {
            // Re-fetch the challenge to see if a game was created
            const latestChallenge = await state._service.getChallengeById(challengeId);
            if (latestChallenge?.status === "accepted" && latestChallenge?.game_id) {
              // Game was created by the other player, return success
              console.log("[ChallengeStore] Challenge already processed by other player, game exists:", latestChallenge.game_id);
              set({
                isOnChainPending: false,
                joinedGameId: latestChallenge.game_id,
              });
              return {
                success: true,
                gameStarted: true,
                gameId: latestChallenge.game_id,
              };
            }
          }
          throw new Error(acceptResult.error || "Failed to create game");
        }

        console.log("[ChallengeStore] Game created:", acceptResult.gameId);

        set({
          isOnChainPending: false,
          joinedGameId: acceptResult.gameId,
        });

        return {
          success: true,
          gameStarted: true,
          gameId: acceptResult.gameId,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to ready up";
        console.error("[ChallengeStore] markReady error:", error);
        set({ isOnChainPending: false, error: message });
        return { success: false, error: message };
      }
    },

    // --------------------------------------------------------------------------
    // Unmark Ready (toggle back to not-ready before funds are locked)
    // --------------------------------------------------------------------------

    unmarkReady: async (challengeId: string) => {
      const state = get();
      if (!state._service || !state._userId) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        const challenge = await state._service.getChallengeById(challengeId);
        if (!challenge) {
          return { success: false, error: "Challenge not found" };
        }

        // Don't allow unready if both are already ready (funds may be locking)
        if (challenge.creator_ready && challenge.opponent_ready) {
          return { success: false, error: "Both players are ready, cannot unready" };
        }

        const isCreator = challenge.creator_id === state._userId;
        const updateData = isCreator
          ? { creator_ready: false }
          : { opponent_ready: false };

        const { error: updateError } = await supabase
          .from("challenges")
          .update(updateData as never)
          .eq("id", challengeId);

        if (updateError) {
          return { success: false, error: "Failed to update ready status" };
        }

        // Refresh challenge state
        const updatedChallenge = await state._service.getChallengeById(challengeId);
        if (updatedChallenge) {
          set({ currentChallenge: updatedChallenge });
        }

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to unready";
        console.error("[ChallengeStore] unmarkReady error:", error);
        return { success: false, error: message };
      }
    },

    // --------------------------------------------------------------------------
    // Leave Lobby as Opponent (soft decline - challenge stays active)
    // --------------------------------------------------------------------------

    leaveLobbyAsOpponent: async (challengeId: string) => {
      const state = get();
      if (!state._service || !state._userId) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        const success = await state._service.leaveLobbyAsOpponent(challengeId);

        if (success) {
          set({
            currentChallenge: null,
            currentRoomCode: null,
          });
          return { success: true };
        } else {
          return { success: false, error: "Failed to leave lobby" };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to leave lobby";
        console.error("[ChallengeStore] leaveLobbyAsOpponent error:", error);
        return { success: false, error: message };
      }
    },

    // --------------------------------------------------------------------------
    // Challenge Joining
    // --------------------------------------------------------------------------

    // --------------------------------------------------------------------------
    // Join Lobby for On-Chain Challenge (opponent joins the waiting lobby)
    // --------------------------------------------------------------------------

    joinOnChainChallenge: async (challengeId: string, onChainGameId: string) => {
      const state = get();
      if (!state._service || !state._userId) {
        set({ error: "Not authenticated" });
        return { success: false, error: "Not authenticated" };
      }

      set({ isJoining: true, error: null });

      try {
        console.log("[ChallengeStore] Joining challenge lobby:", {
          challengeId,
          onChainGameId,
        });

        // Get the challenge
        const challenge = await state._service.getChallengeById(challengeId);
        if (!challenge) {
          throw new Error("Challenge not found");
        }

        // Check if already joined
        if (challenge.opponent_id === state._userId) {
          // Already in lobby, return success to navigate to lobby
          set({
            isJoining: false,
            currentChallenge: challenge,
          });
          return { success: true, joinedLobby: true, challenge } as any;
        }

        // Validate challenge is still joinable
        if (challenge.status !== "pending") {
          throw new Error("This challenge is no longer available");
        }

        // Check if someone else already joined
        if (challenge.opponent_id && challenge.opponent_id !== state._userId) {
          throw new Error("This challenge already has an opponent");
        }

        // Join the challenge by setting opponent_id
        const { error: updateError, data: updateData } = await supabase
          .from("challenges")
          .update({
            opponent_id: state._userId,
          } as never)
          .eq("id", challengeId)
          .eq("status", "pending")
          .select();

        console.log("[ChallengeStore] Join lobby update result:", { updateError, updateData });

        if (updateError) {
          console.error("[ChallengeStore] Join lobby update error:", updateError);
          throw new Error(`Failed to join challenge: ${updateError.message || updateError.code || 'Unknown error'}`);
        }

        // Check if update actually changed anything (RLS might silently reject)
        if (!updateData || updateData.length === 0) {
          console.error("[ChallengeStore] Join lobby update returned no data - RLS may have blocked");
          throw new Error("Unable to join challenge - it may no longer be available");
        }

        // Refresh challenge to get updated state
        const updatedChallenge = await state._service.getChallengeById(challengeId);

        // Notify the creator that an opponent has joined the lobby
        try {
          const [creatorResult, opponentResult] = await Promise.all([
            supabase
              .from("profiles")
              .select("push_token, notifications_enabled")
              .eq("id", challenge.creator_id)
              .single(),
            supabase
              .from("profiles")
              .select("username")
              .eq("id", state._userId)
              .single(),
          ]);

          const creatorToken = creatorResult.data?.push_token;
          const notificationsEnabled = creatorResult.data?.notifications_enabled;
          const opponentUsername = opponentResult.data?.username || "A player";

          if (creatorToken && notificationsEnabled) {
            await supabase.functions.invoke("send-push-notification", {
              body: {
                tokens: [creatorToken],
                title: "Opponent Joined!",
                body: `${opponentUsername} has joined your ${challenge.wager_tct} TCT challenge lobby. Ready up to start!`,
                data: {
                  type: "opponent_joined_lobby",
                  challengeId: challengeId,
                },
                categoryId: "game_action",
              },
            });
            console.log("[ChallengeStore] Sent push notification to challenge creator");
          }

          // Insert in-app notification for creator
          await supabase.from("challenge_notifications").insert({
            user_id: challenge.creator_id,
            challenge_id: challengeId,
            notification_type: "challenge_accepted",
            title: "Opponent Joined!",
            body: `${opponentUsername} has joined your challenge lobby. Ready up to start!`,
            data: { type: "opponent_joined_lobby", challengeId },
            is_read: false,
            is_push_sent: !!(creatorToken && notificationsEnabled),
          } as any);
        } catch (notifyError) {
          console.error("[ChallengeStore] Failed to send notification to creator:", notifyError);
        }

        set({
          isJoining: false,
          currentChallenge: updatedChallenge,
        });

        // Return success with flag to indicate joined lobby (not game started yet)
        return { success: true, joinedLobby: true, challenge: updatedChallenge } as any;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to join challenge";
        console.error("[ChallengeStore] joinOnChainChallenge error:", error);
        set({ isJoining: false, error: message });
        return { success: false, error: message };
      }
    },

    joinByRoomCode: async (roomCode: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      set({ isJoining: true, error: null });

      try {
        // First, search for the challenge to get on-chain game ID
        const challenge = await state._service.getChallengeByCode(roomCode);
        if (!challenge) {
          set({ isJoining: false, error: "Challenge not found" });
          return false;
        }

        // If challenge has on-chain game ID and wager > 0, use on-chain join
        if (challenge.on_chain_game_id && challenge.wager_tct > 0) {
          set({ isJoining: false }); // Reset, joinOnChainChallenge will set it
          const joinResult = await get().joinOnChainChallenge(challenge.id, challenge.on_chain_game_id);
          return joinResult.success;
        }

        // Otherwise, use standard join (free games)
        const result = await state._service.acceptChallengeByCode(roomCode);

        if (result.success) {
          set({
            isJoining: false,
            joinedGameId: result.gameId || null,
          });
          return true;
        } else {
          set({
            isJoining: false,
            error: result.error || "Failed to join challenge",
          });
          return false;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to join challenge";
        set({ isJoining: false, error: message });
        return false;
      }
    },

    joinChallenge: async (challengeId: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      set({ isJoining: true, error: null });

      try {
        // First, get challenge details to check for on-chain game ID
        const challenge = await state._service.getChallengeById(challengeId);
        if (!challenge) {
          set({ isJoining: false, error: "Challenge not found" });
          return false;
        }

        // If challenge has on-chain game ID and wager > 0, use on-chain join
        if (challenge.on_chain_game_id && challenge.wager_tct > 0) {
          set({ isJoining: false }); // Reset, joinOnChainChallenge will set it
          const joinResult = await get().joinOnChainChallenge(challenge.id, challenge.on_chain_game_id);
          return joinResult.success;
        }

        // Otherwise, use standard join (free games)
        const result = await state._service.acceptChallengeById(challengeId);

        if (result.success) {
          set((prev) => ({
            isJoining: false,
            joinedGameId: result.gameId || null,
            publicChallenges: prev.publicChallenges.filter(
              (c) => c.id !== challengeId
            ),
          }));
          return true;
        } else {
          set({
            isJoining: false,
            error: result.error || "Failed to join challenge",
          });
          return false;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to join challenge";
        set({ isJoining: false, error: message });
        return false;
      }
    },

    searchByCode: async (roomCode: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return null;
      }

      set({ isLoading: true, error: null });

      try {
        const challenge = await state._service.getChallengeByCode(roomCode);

        if (challenge) {
          set({
            isLoading: false,
            currentChallenge: challenge,
          });
          return challenge;
        } else {
          set({
            isLoading: false,
            error: "No challenge found with that code",
          });
          return null;
        }
      } catch (error) {
        set({
          isLoading: false,
          error: "Failed to search for challenge",
        });
        return null;
      }
    },

    // --------------------------------------------------------------------------
    // Challenge Management
    // --------------------------------------------------------------------------

    cancelChallenge: async (challengeId?: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      const idToCancel = challengeId || state.currentChallenge?.id;
      if (!idToCancel) {
        set({ error: "No challenge to cancel" });
        return false;
      }

      // Check if this challenge has an on-chain game
      const challenge = state.currentChallenge?.id === idToCancel
        ? state.currentChallenge
        : state.myCreatedChallenges.find((c) => c.id === idToCancel);

      console.log("[ChallengeStore] cancelChallenge - checking for on-chain game:", {
        challengeId: idToCancel,
        on_chain_game_id: challenge?.on_chain_game_id,
        wager_tct: challenge?.wager_tct,
        currentOnChainGameId: state.currentOnChainGameId,
      });

      // Use currentOnChainGameId as fallback (set during challenge creation)
      const onChainGameId = challenge?.on_chain_game_id || state.currentOnChainGameId;

      if (onChainGameId && (challenge?.wager_tct ?? 0) > 0) {
        console.log("[ChallengeStore] Cancelling on-chain challenge:", onChainGameId);
        return get().cancelOnChainChallenge(idToCancel, onChainGameId);
      }

      // Standard cancel for free games
      try {
        const success = await state._service.cancelChallenge(idToCancel);

        if (success) {
          set((prev) => ({
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== idToCancel
            ),
            currentChallenge:
              prev.currentChallenge?.id === idToCancel
                ? null
                : prev.currentChallenge,
            currentRoomCode:
              prev.currentChallenge?.id === idToCancel
                ? null
                : prev.currentRoomCode,
            currentOnChainGameId:
              prev.currentChallenge?.id === idToCancel
                ? null
                : prev.currentOnChainGameId,
          }));
          return true;
        } else {
          set({ error: "Failed to cancel challenge" });
          return false;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to cancel challenge";
        set({ error: message });
        return false;
      }
    },

    cancelOnChainChallenge: async (challengeId?: string, onChainGameId?: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      if (!state._biconomyInitialized) {
        set({ error: "Wallet not connected" });
        return false;
      }

      const idToCancel = challengeId || state.currentChallenge?.id;
      const gameIdToCancel = onChainGameId || state.currentOnChainGameId;

      if (!idToCancel) {
        set({ error: "No challenge to cancel" });
        return false;
      }

      set({ isOnChainPending: true, error: null });

      console.log("[ChallengeStore] cancelOnChainChallenge starting:", {
        idToCancel,
        gameIdToCancel,
      });

      try {
        // Step 1: Cancel on-chain (refunds USDC)
        if (gameIdToCancel) {
          console.log("[ChallengeStore] Calling relay cancelGame for:", gameIdToCancel);
          const sdk = getRelaySDK();

          // Check if this game is on the old escrow contract
          // Old escrow: 0x6e24927EFa2B4DB5654331Fb20312C9f59712501
          // If the challenge was created before the contract update, use old escrow
          const OLD_ESCROW = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";

          // Try to get the game from the current escrow first
          let result;
          try {
            const game = await sdk.getOnChainGame(gameIdToCancel);
            if (game && game.status !== 0) {
              // Game exists on current escrow
              result = await sdk.cancelGame(gameIdToCancel);
            } else {
              // Game might be on old escrow, try there
              console.log("[ChallengeStore] Game not found on new escrow, trying old escrow");
              result = await sdk.cancelGameOnOldEscrow(gameIdToCancel);
            }
          } catch {
            // If getOnChainGame fails, try both escrows
            console.log("[ChallengeStore] Trying cancel on current escrow...");
            result = await sdk.cancelGame(gameIdToCancel);
            if (!result.success) {
              console.log("[ChallengeStore] Failed on current escrow, trying old escrow...");
              result = await sdk.cancelGameOnOldEscrow(gameIdToCancel);
            }
          }

          console.log("[ChallengeStore] cancelGame result:", result);

          if (!result.success) {
            throw new Error(result.error || "Failed to cancel on-chain game");
          }

          console.log("[ChallengeStore] On-chain game cancelled successfully:", result.txHash);
        } else {
          console.warn("[ChallengeStore] No gameIdToCancel provided, skipping on-chain cancel");
        }

        // Step 2: Cancel in database
        const success = await state._service.cancelChallenge(idToCancel);

        if (success) {
          set((prev) => ({
            isOnChainPending: false,
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== idToCancel
            ),
            currentChallenge:
              prev.currentChallenge?.id === idToCancel
                ? null
                : prev.currentChallenge,
            currentRoomCode:
              prev.currentChallenge?.id === idToCancel
                ? null
                : prev.currentRoomCode,
            currentOnChainGameId:
              prev.currentChallenge?.id === idToCancel
                ? null
                : prev.currentOnChainGameId,
          }));
          return true;
        } else {
          // On-chain cancel succeeded but DB failed - USDC is refunded, just need to update UI
          set((prev) => ({
            isOnChainPending: false,
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== idToCancel
            ),
            currentChallenge: null,
            currentRoomCode: null,
            currentOnChainGameId: null,
            error: "Challenge cancelled on-chain but database update failed",
          }));
          return true; // Consider it a success since USDC is refunded
        }
      } catch (error) {
        let message = error instanceof Error ? error.message : "Failed to cancel challenge";
        console.error("[ChallengeStore] cancelOnChainChallenge error:", error);

        // Check for auth errors and provide better messaging
        if (message.includes("401") || message.includes("JWT") || message.includes("authenticated")) {
          message = "Session expired. Please log out and log back in to cancel this challenge.";
        }

        set({ isOnChainPending: false, error: message });
        return false;
      }
    },

    declineChallenge: async (challengeId: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      try {
        const success = await state._service.declineChallenge(challengeId);

        if (success) {
          set((prev) => ({
            myReceivedChallenges: prev.myReceivedChallenges.filter(
              (c) => c.id !== challengeId
            ),
          }));
          return true;
        } else {
          set({ error: "Failed to decline challenge" });
          return false;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to decline challenge";
        set({ error: message });
        return false;
      }
    },

    makePublic: async (challengeId: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      try {
        const updated = await state._service.makePublic(challengeId);
        if (updated) {
          set({
            currentChallenge: updated,
            currentRoomCode: updated.room_code,
          });
          return true;
        } else {
          set({ error: "Failed to make challenge public" });
          return false;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to make challenge public";
        set({ error: message });
        return false;
      }
    },

    deleteDeclinedChallenge: async (challengeId: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      try {
        const success = await state._service.deleteChallengeCompletely(challengeId);
        if (success) {
          set((prev) => ({
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== challengeId
            ),
            currentChallenge: prev.currentChallenge?.id === challengeId ? null : prev.currentChallenge,
            currentRoomCode: prev.currentChallenge?.id === challengeId ? null : prev.currentRoomCode,
            currentOnChainGameId: prev.currentChallenge?.id === challengeId ? null : prev.currentOnChainGameId,
          }));
          return true;
        } else {
          set({ error: "Failed to delete challenge" });
          return false;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete challenge";
        set({ error: message });
        return false;
      }
    },

    // --------------------------------------------------------------------------
    // Data Fetching
    // --------------------------------------------------------------------------

    refreshMyChallenges: async () => {
      const state = get();
      if (!state._service || !state._userId) return;

      set({ isLoading: true });

      try {
        const challenges = await state._service.getMyChallenges();

        const created = challenges.filter((c) => c.creator_id === state._userId);
        const received = challenges.filter(
          (c) => c.opponent_id === state._userId && c.creator_id !== state._userId
        );

        set({
          isLoading: false,
          myCreatedChallenges: created,
          myReceivedChallenges: received,
        });
      } catch (error) {
        set({
          isLoading: false,
          error: "Failed to fetch challenges",
        });
      }
    },

    refreshPublicBoard: async () => {
      const state = get();
      if (!state._service) return;

      set({ isLoading: true });

      try {
        const challenges = await state._service.getPublicChallenges(
          state.boardFilters
        );

        // Setup public subscription if not already
        if (!state._publicSubscription) {
          state._service.subscribeToPublicChallenges(
            (updatedChallenges: Challenge[]) => {
              set((prev) => ({
                ...prev,
                publicChallenges: updatedChallenges.filter(
                  (c) => c.creator_id !== prev._userId
                ),
              }));
            }
          );
          // Mark that we've set up subscription (service manages internally)
          set({ _publicSubscription: null });
        }

        set({
          isLoading: false,
          publicChallenges: challenges,
        });
      } catch (error) {
        set({
          isLoading: false,
          error: "Failed to fetch public challenges",
        });
      }
    },

    setFilters: (filters: Partial<ChallengeFilters>) => {
      set((prev) => ({
        boardFilters: { ...prev.boardFilters, ...filters },
      }));
      // Auto-refresh with new filters
      get().refreshPublicBoard();
    },

    loadChallenge: async (challengeId: string) => {
      const state = get();
      if (!state._service) return null;

      set({ isLoading: true, error: null });

      try {
        const challenge = await state._service.getChallengeById(challengeId);

        if (challenge) {
          set({
            isLoading: false,
            currentChallenge: challenge,
            currentRoomCode: challenge.room_code,
          });
          return challenge;
        } else {
          set({
            isLoading: false,
            error: "Challenge not found",
          });
          return null;
        }
      } catch (error) {
        set({
          isLoading: false,
          error: "Failed to load challenge",
        });
        return null;
      }
    },

    // --------------------------------------------------------------------------
    // UI Helpers
    // --------------------------------------------------------------------------

    clearError: () => {
      set({ error: null });
    },

    clearJoinedGame: () => {
      set({ joinedGameId: null });
    },

    setCurrentChallenge: (challenge: Challenge | null) => {
      set({
        currentChallenge: challenge,
        currentRoomCode: challenge?.room_code || null,
      });
    },

    resetState: () => {
      set({
        currentChallenge: null,
        currentRoomCode: null,
        pendingSettings: { ...DEFAULT_SETTINGS },
        isLoading: false,
        isCreating: false,
        isJoining: false,
        error: null,
        joinedGameId: null,
      });
    },
  }))
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useMyCreatedChallenges = () =>
  useChallengeStore((state) => state.myCreatedChallenges);

export const useMyReceivedChallenges = () =>
  useChallengeStore((state) => state.myReceivedChallenges);

export const usePublicChallenges = () =>
  useChallengeStore((state) => state.publicChallenges);

export const useCurrentChallenge = () =>
  useChallengeStore((state) => state.currentChallenge);

export const useChallengeLoading = () =>
  useChallengeStore((state) => ({
    isLoading: state.isLoading,
    isCreating: state.isCreating,
    isJoining: state.isJoining,
  }));

export const useChallengeError = () =>
  useChallengeStore((state) => state.error);

export const useJoinedGameId = () =>
  useChallengeStore((state) => state.joinedGameId);

export const usePendingSettings = () =>
  useChallengeStore((state) => state.pendingSettings);

export default useChallengeStore;
