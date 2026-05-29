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

  // Pending challenge creation settings
  pendingSettings: ChallengeSettings;

  // UI States
  isLoading: boolean;
  isCreating: boolean;
  isJoining: boolean;
  error: string | null;

  // Result
  joinedGameId: string | null;

  // Internal
  _userId: string | null;
  _service: ChallengeService | null;
  _myChallengesSubscription: RealtimeChannel | null;
  _publicSubscription: RealtimeChannel | null;
}

export interface ChallengeStoreActions {
  // Initialization
  initialize: (userId: string) => void;
  cleanup: () => void;

  // Challenge creation
  updatePendingSettings: (settings: Partial<ChallengeSettings>) => void;
  createPublicChallenge: () => Promise<Challenge | null>;
  createPrivateChallenge: () => Promise<{ challenge: Challenge; roomCode: string } | null>;
  createChallengeWithSettings: (settings: ChallengeSettings) => Promise<Challenge | null>;

  // Challenge joining
  joinByRoomCode: (roomCode: string) => Promise<boolean>;
  joinChallenge: (challengeId: string) => Promise<boolean>;
  searchByCode: (roomCode: string) => Promise<Challenge | null>;

  // Mark player as ready in lobby (triggers fund lock when both ready)
  markReady: (challengeId: string) => Promise<{ success: boolean; gameStarted?: boolean; gameId?: string; error?: string }>;
  unmarkReady: (challengeId: string) => Promise<{ success: boolean; error?: string }>;
  leaveLobbyAsOpponent: (challengeId: string) => Promise<{ success: boolean; error?: string }>;

  // Challenge management
  cancelChallenge: (challengeId?: string) => Promise<boolean>;
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
  "_userId" | "_service" | "_myChallengesSubscription" | "_publicSubscription"
> = {
  myCreatedChallenges: [],
  myReceivedChallenges: [],
  publicChallenges: [],
  boardFilters: {},
  currentChallenge: null,
  currentRoomCode: null,
  pendingSettings: { ...DEFAULT_SETTINGS },
  isLoading: false,
  isCreating: false,
  isJoining: false,
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
    // Challenge Creation
    // --------------------------------------------------------------------------

    updatePendingSettings: (settings: Partial<ChallengeSettings>) => {
      set((prev) => ({
        pendingSettings: { ...prev.pendingSettings, ...settings },
      }));
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

      set({ error: null });

      try {
        // Get the latest challenge state
        const challenge = await state._service.getChallengeById(challengeId);
        if (!challenge) {
          // Challenge not found - may have been deleted or already completed
          console.log("[ChallengeStore] markReady - challenge not found, may already be accepted/completed");
          return { success: false, error: "Challenge not found or already completed" };
        }

        // Check if challenge was already accepted and game created
        if (challenge.status === "accepted" && challenge.game_id) {
          console.log("[ChallengeStore] markReady - challenge already accepted, game exists:", challenge.game_id);
          set({
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
          return { success: false, error: `Challenge is ${challenge.status}` };
        }

        const isCreator = challenge.creator_id === state._userId;
        const isOpponent = challenge.opponent_id === state._userId;

        if (!isCreator && !isOpponent) {
          throw new Error("You are not a participant in this challenge");
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
            currentChallenge: updatedChallenge,
          });
          return { success: true, gameStarted: false };
        }

        // BOTH PLAYERS ARE READY - Start game immediately!
        console.log("[ChallengeStore] Both players ready! Starting game immediately...");

        // Start the game!
        console.log("[ChallengeStore] Starting game...");

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
        set({ error: message });
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

    joinByRoomCode: async (roomCode: string) => {
      const state = get();
      if (!state._service) {
        set({ error: "Not authenticated" });
        return false;
      }

      set({ isJoining: true, error: null });

      try {
        // Use standard DB join for all challenges
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
        // Use standard DB join for all challenges
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

      // Standard cancel via DB
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
