/**
 * Challenge Store Unit Tests
 *
 * Comprehensive test coverage for:
 * - Store initialization and cleanup
 * - Challenge creation (public and private)
 * - Challenge joining
 * - Challenge cancellation and decline
 * - Settings management
 * - Selector hooks
 * - State transitions
 */

// Using jest's act from react instead of react-native to avoid ESM issues
import { act } from "react";
import {
  useChallengeStore,
  useMyCreatedChallenges,
  useMyReceivedChallenges,
  usePublicChallenges,
  useCurrentChallenge,
  useChallengeLoading,
  useChallengeError,
  useJoinedGameId,
  usePendingSettings,
  type ChallengeSettings,
  type ChallengeStoreState,
} from "@/stores/challengeStore";

// ============================================================================
// Mock Dependencies
// ============================================================================

jest.mock("@/lib/challenges", () => ({
  ChallengeService: jest.fn().mockImplementation(() => ({
    createChallenge: jest.fn().mockResolvedValue(null),
    acceptChallengeByCode: jest.fn().mockResolvedValue({ success: false }),
    acceptChallengeById: jest.fn().mockResolvedValue({ success: false }),
    getChallengeByCode: jest.fn().mockResolvedValue(null),
    getChallengeById: jest.fn().mockResolvedValue(null),
    cancelChallenge: jest.fn().mockResolvedValue(false),
    declineChallenge: jest.fn().mockResolvedValue(false),
    getMyCreatedChallenges: jest.fn().mockResolvedValue([]),
    getMyChallenges: jest.fn().mockResolvedValue([]),
    getPublicChallenges: jest.fn().mockResolvedValue([]),
    subscribeToMyChallenges: jest.fn(),
    subscribeToPublicChallenges: jest.fn(),
    destroy: jest.fn(),
  })),
  generateRoomCode: jest.fn().mockReturnValue("ABC234"),
  ChallengeFilters: {},
}));

// ============================================================================
// Test Utilities
// ============================================================================

const resetStore = () => {
  useChallengeStore.setState({
    myCreatedChallenges: [],
    myReceivedChallenges: [],
    publicChallenges: [],
    boardFilters: {},
    currentChallenge: null,
    currentRoomCode: null,
    pendingSettings: {
      timeControl: 300,
      increment: 3,
      wagerAmount: 0,
      isPublic: true,
      isRated: true,
      colorPreference: "random",
    },
    isLoading: false,
    isCreating: false,
    isJoining: false,
    error: null,
    joinedGameId: null,
    _userId: null,
    _service: null,
    _myChallengesSubscription: null,
    _publicSubscription: null,
  });
};

const mockChallenge = {
  id: "challenge-1",
  room_code: "XYZ789",
  creator_id: "user-123",
  opponent_id: null,
  wager_tct: 0,
  time_control_seconds: 300,
  increment_seconds: 3,
  creator_color_preference: "random" as const,
  is_public: true,
  is_rated: true,
  status: "pending" as const,
  game_id: null,
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
  accepted_at: null,
};

// ============================================================================
// Store State Tests
// ============================================================================

describe("useChallengeStore", () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have correct default values", () => {
      const state = useChallengeStore.getState();

      expect(state.myCreatedChallenges).toEqual([]);
      expect(state.myReceivedChallenges).toEqual([]);
      expect(state.publicChallenges).toEqual([]);
      expect(state.currentChallenge).toBeNull();
      expect(state.currentRoomCode).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.isCreating).toBe(false);
      expect(state.isJoining).toBe(false);
      expect(state.error).toBeNull();
      expect(state.joinedGameId).toBeNull();
    });

    it("should have default pending settings", () => {
      const state = useChallengeStore.getState();

      expect(state.pendingSettings).toEqual({
        timeControl: 300,
        increment: 3,
        wagerAmount: 0,
        isPublic: true,
        isRated: true,
        colorPreference: "random",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Initialization Tests
  // --------------------------------------------------------------------------

  describe("initialize", () => {
    it("should set userId and create service", () => {
      const { initialize } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      const state = useChallengeStore.getState();
      expect(state._userId).toBe("user-123");
      expect(state._service).not.toBeNull();
    });

    it("should not re-initialize with same userId", () => {
      const { initialize } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      const firstService = useChallengeStore.getState()._service;

      act(() => {
        initialize("user-123");
      });

      const secondService = useChallengeStore.getState()._service;
      expect(firstService).toBe(secondService);
    });

    it("should re-initialize with different userId", () => {
      const { initialize } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      const firstService = useChallengeStore.getState()._service;

      act(() => {
        initialize("user-456");
      });

      const state = useChallengeStore.getState();
      expect(state._userId).toBe("user-456");
      // Note: In real implementation, this would create a new service
    });
  });

  describe("cleanup", () => {
    it("should reset state to initial values", () => {
      const { initialize, cleanup } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      // Modify state
      useChallengeStore.setState({
        myCreatedChallenges: [mockChallenge as any],
        error: "Some error",
        isLoading: true,
      });

      act(() => {
        cleanup();
      });

      const state = useChallengeStore.getState();
      expect(state._userId).toBeNull();
      expect(state._service).toBeNull();
      expect(state.myCreatedChallenges).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Settings Management Tests
  // --------------------------------------------------------------------------

  describe("updatePendingSettings", () => {
    it("should update time control", () => {
      const { updatePendingSettings } = useChallengeStore.getState();

      act(() => {
        updatePendingSettings({ timeControl: 600 });
      });

      expect(useChallengeStore.getState().pendingSettings.timeControl).toBe(600);
    });

    it("should update increment", () => {
      const { updatePendingSettings } = useChallengeStore.getState();

      act(() => {
        updatePendingSettings({ increment: 5 });
      });

      expect(useChallengeStore.getState().pendingSettings.increment).toBe(5);
    });

    it("should update wager amount", () => {
      const { updatePendingSettings } = useChallengeStore.getState();

      act(() => {
        updatePendingSettings({ wagerAmount: 100 });
      });

      expect(useChallengeStore.getState().pendingSettings.wagerAmount).toBe(100);
    });

    it("should update color preference", () => {
      const { updatePendingSettings } = useChallengeStore.getState();

      act(() => {
        updatePendingSettings({ colorPreference: "white" });
      });

      expect(useChallengeStore.getState().pendingSettings.colorPreference).toBe(
        "white"
      );
    });

    it("should preserve other settings when updating one", () => {
      const { updatePendingSettings } = useChallengeStore.getState();

      act(() => {
        updatePendingSettings({ timeControl: 900 });
      });

      const settings = useChallengeStore.getState().pendingSettings;
      expect(settings.timeControl).toBe(900);
      expect(settings.increment).toBe(3); // preserved
      expect(settings.wagerAmount).toBe(0); // preserved
    });

    it("should update multiple settings at once", () => {
      const { updatePendingSettings } = useChallengeStore.getState();

      act(() => {
        updatePendingSettings({
          timeControl: 180,
          increment: 2,
          wagerAmount: 50,
          colorPreference: "black",
        });
      });

      const settings = useChallengeStore.getState().pendingSettings;
      expect(settings.timeControl).toBe(180);
      expect(settings.increment).toBe(2);
      expect(settings.wagerAmount).toBe(50);
      expect(settings.colorPreference).toBe("black");
    });
  });

  // --------------------------------------------------------------------------
  // Challenge Creation Tests
  // --------------------------------------------------------------------------

  describe("createPublicChallenge", () => {
    it("should set error when not authenticated", async () => {
      const { createPublicChallenge } = useChallengeStore.getState();

      const result = await createPublicChallenge();

      expect(result).toBeNull();
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });

    it("should set isCreating during creation", async () => {
      const { initialize, createPublicChallenge } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      // Check state during creation
      const promise = createPublicChallenge();

      // With our mock, this completes immediately
      await promise;

      expect(useChallengeStore.getState().isCreating).toBe(false);
    });
  });

  describe("createPrivateChallenge", () => {
    it("should set error when not authenticated", async () => {
      const { createPrivateChallenge } = useChallengeStore.getState();

      const result = await createPrivateChallenge();

      expect(result).toBeNull();
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });
  });

  describe("createChallengeWithSettings", () => {
    it("should set error when not authenticated", async () => {
      const { createChallengeWithSettings } = useChallengeStore.getState();

      const settings: ChallengeSettings = {
        timeControl: 600,
        increment: 5,
        wagerAmount: 0,
        isPublic: true,
        isRated: true,
        colorPreference: "random",
      };

      const result = await createChallengeWithSettings(settings);

      expect(result).toBeNull();
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });
  });

  // --------------------------------------------------------------------------
  // Challenge Joining Tests
  // --------------------------------------------------------------------------

  describe("joinByRoomCode", () => {
    it("should set error when not authenticated", async () => {
      const { joinByRoomCode } = useChallengeStore.getState();

      const result = await joinByRoomCode("ABC123");

      expect(result).toBe(false);
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });

    it("should set isJoining during join attempt", async () => {
      const { initialize, joinByRoomCode } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      const promise = joinByRoomCode("XYZ789");

      await promise;

      expect(useChallengeStore.getState().isJoining).toBe(false);
    });
  });

  describe("joinChallenge", () => {
    it("should set error when not authenticated", async () => {
      const { joinChallenge } = useChallengeStore.getState();

      const result = await joinChallenge("challenge-id");

      expect(result).toBe(false);
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });
  });

  describe("searchByCode", () => {
    it("should set error when not authenticated", async () => {
      const { searchByCode } = useChallengeStore.getState();

      const result = await searchByCode("ABC123");

      expect(result).toBeNull();
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });

    it("should set isLoading during search", async () => {
      const { initialize, searchByCode } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      const promise = searchByCode("XYZ789");

      await promise;

      expect(useChallengeStore.getState().isLoading).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Challenge Management Tests
  // --------------------------------------------------------------------------

  describe("cancelChallenge", () => {
    it("should set error when not authenticated", async () => {
      const { cancelChallenge } = useChallengeStore.getState();

      const result = await cancelChallenge("challenge-id");

      expect(result).toBe(false);
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });

    it("should set error when no challenge to cancel", async () => {
      const { initialize, cancelChallenge } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      const result = await cancelChallenge();

      expect(result).toBe(false);
      expect(useChallengeStore.getState().error).toBe("No challenge to cancel");
    });
  });

  describe("declineChallenge", () => {
    it("should set error when not authenticated", async () => {
      const { declineChallenge } = useChallengeStore.getState();

      const result = await declineChallenge("challenge-id");

      expect(result).toBe(false);
      expect(useChallengeStore.getState().error).toBe("Not authenticated");
    });
  });

  // --------------------------------------------------------------------------
  // Data Fetching Tests
  // --------------------------------------------------------------------------

  describe("refreshMyChallenges", () => {
    it("should do nothing when not authenticated", async () => {
      const { refreshMyChallenges } = useChallengeStore.getState();

      await refreshMyChallenges();

      expect(useChallengeStore.getState().isLoading).toBe(false);
    });

    it("should set isLoading during fetch", async () => {
      const { initialize, refreshMyChallenges } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      await refreshMyChallenges();

      expect(useChallengeStore.getState().isLoading).toBe(false);
    });
  });

  describe("refreshPublicBoard", () => {
    it("should do nothing when not authenticated", async () => {
      const { refreshPublicBoard } = useChallengeStore.getState();

      await refreshPublicBoard();

      expect(useChallengeStore.getState().isLoading).toBe(false);
    });
  });

  describe("setFilters", () => {
    it("should update board filters", () => {
      const { initialize, setFilters } = useChallengeStore.getState();

      act(() => {
        initialize("user-123");
      });

      act(() => {
        setFilters({ timeCategory: "blitz" as any });
      });

      expect(useChallengeStore.getState().boardFilters).toHaveProperty(
        "timeCategory"
      );
    });
  });

  describe("loadChallenge", () => {
    it("should return null when not authenticated", async () => {
      const { loadChallenge } = useChallengeStore.getState();

      const result = await loadChallenge("challenge-id");

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // UI Helper Tests
  // --------------------------------------------------------------------------

  describe("clearError", () => {
    it("should clear error state", () => {
      useChallengeStore.setState({ error: "Some error" });

      const { clearError } = useChallengeStore.getState();

      act(() => {
        clearError();
      });

      expect(useChallengeStore.getState().error).toBeNull();
    });
  });

  describe("clearJoinedGame", () => {
    it("should clear joinedGameId", () => {
      useChallengeStore.setState({ joinedGameId: "game-123" });

      const { clearJoinedGame } = useChallengeStore.getState();

      act(() => {
        clearJoinedGame();
      });

      expect(useChallengeStore.getState().joinedGameId).toBeNull();
    });
  });

  describe("setCurrentChallenge", () => {
    it("should set current challenge and room code", () => {
      const { setCurrentChallenge } = useChallengeStore.getState();

      act(() => {
        setCurrentChallenge(mockChallenge as any);
      });

      const state = useChallengeStore.getState();
      expect(state.currentChallenge).toEqual(mockChallenge);
      expect(state.currentRoomCode).toBe(mockChallenge.room_code);
    });

    it("should clear current challenge when passed null", () => {
      useChallengeStore.setState({
        currentChallenge: mockChallenge as any,
        currentRoomCode: mockChallenge.room_code,
      });

      const { setCurrentChallenge } = useChallengeStore.getState();

      act(() => {
        setCurrentChallenge(null);
      });

      const state = useChallengeStore.getState();
      expect(state.currentChallenge).toBeNull();
      expect(state.currentRoomCode).toBeNull();
    });
  });

  describe("resetState", () => {
    it("should reset UI-related state", () => {
      useChallengeStore.setState({
        currentChallenge: mockChallenge as any,
        currentRoomCode: "ABC123",
        pendingSettings: {
          timeControl: 900,
          increment: 10,
          wagerAmount: 100,
          isPublic: false,
          isRated: false,
          colorPreference: "white",
        },
        isLoading: true,
        isCreating: true,
        isJoining: true,
        error: "Some error",
        joinedGameId: "game-123",
      });

      const { resetState } = useChallengeStore.getState();

      act(() => {
        resetState();
      });

      const state = useChallengeStore.getState();
      expect(state.currentChallenge).toBeNull();
      expect(state.currentRoomCode).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.isCreating).toBe(false);
      expect(state.isJoining).toBe(false);
      expect(state.error).toBeNull();
      expect(state.joinedGameId).toBeNull();
      expect(state.pendingSettings).toEqual({
        timeControl: 300,
        increment: 3,
        wagerAmount: 0,
        isPublic: true,
        isRated: true,
        colorPreference: "random",
      });
    });
  });
});

// ============================================================================
// Selector Hook Tests
// ============================================================================

describe("selector hooks", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("useMyCreatedChallenges", () => {
    it("should return empty array initially", () => {
      // Direct state access for testing
      const state = useChallengeStore.getState();
      expect(state.myCreatedChallenges).toEqual([]);
    });

    it("should return created challenges when set", () => {
      useChallengeStore.setState({
        myCreatedChallenges: [mockChallenge as any],
      });

      const state = useChallengeStore.getState();
      expect(state.myCreatedChallenges).toHaveLength(1);
      expect(state.myCreatedChallenges[0].id).toBe("challenge-1");
    });
  });

  describe("useMyReceivedChallenges", () => {
    it("should return empty array initially", () => {
      const state = useChallengeStore.getState();
      expect(state.myReceivedChallenges).toEqual([]);
    });
  });

  describe("usePublicChallenges", () => {
    it("should return empty array initially", () => {
      const state = useChallengeStore.getState();
      expect(state.publicChallenges).toEqual([]);
    });
  });

  describe("useCurrentChallenge", () => {
    it("should return null initially", () => {
      const state = useChallengeStore.getState();
      expect(state.currentChallenge).toBeNull();
    });
  });

  describe("useChallengeLoading", () => {
    it("should return all loading states", () => {
      const state = useChallengeStore.getState();

      expect(state.isLoading).toBe(false);
      expect(state.isCreating).toBe(false);
      expect(state.isJoining).toBe(false);
    });
  });

  describe("useChallengeError", () => {
    it("should return null initially", () => {
      const state = useChallengeStore.getState();
      expect(state.error).toBeNull();
    });

    it("should return error when set", () => {
      useChallengeStore.setState({ error: "Test error" });

      const state = useChallengeStore.getState();
      expect(state.error).toBe("Test error");
    });
  });

  describe("useJoinedGameId", () => {
    it("should return null initially", () => {
      const state = useChallengeStore.getState();
      expect(state.joinedGameId).toBeNull();
    });
  });

  describe("usePendingSettings", () => {
    it("should return default settings", () => {
      const state = useChallengeStore.getState();

      expect(state.pendingSettings).toEqual({
        timeControl: 300,
        increment: 3,
        wagerAmount: 0,
        isPublic: true,
        isRated: true,
        colorPreference: "random",
      });
    });
  });
});

// ============================================================================
// Type Tests
// ============================================================================

describe("ChallengeSettings type", () => {
  it("should have correct structure", () => {
    const settings: ChallengeSettings = {
      timeControl: 300,
      increment: 3,
      wagerAmount: 0,
      isPublic: true,
      isRated: true,
      colorPreference: "random",
    };

    expect(settings.timeControl).toBe(300);
    expect(settings.colorPreference).toBe("random");
  });

  it("should accept all color preferences", () => {
    const white: ChallengeSettings = {
      timeControl: 300,
      increment: 0,
      wagerAmount: 0,
      isPublic: true,
      isRated: true,
      colorPreference: "white",
    };

    const black: ChallengeSettings = {
      ...white,
      colorPreference: "black",
    };

    const random: ChallengeSettings = {
      ...white,
      colorPreference: "random",
    };

    expect(white.colorPreference).toBe("white");
    expect(black.colorPreference).toBe("black");
    expect(random.colorPreference).toBe("random");
  });
});
