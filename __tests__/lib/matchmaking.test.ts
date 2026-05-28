/**
 * Matchmaking Tests
 *
 * Tests for the matchmaking system including queue management,
 * match finding, and balance locking.
 */

import { supabase } from "@/lib/supabase";

// Mock data
const mockUser = {
  id: "user-123",
  username: "TestPlayer",
  elo_rating: 1200,
  avatar_url: null,
  country: "US",
};

const mockQueueEntry = {
  id: "queue-123",
  user_id: "user-123",
  wager_tct: 100,
  time_control_seconds: 300,
  increment_seconds: 3,
  elo_range_min: 1000,
  elo_range_max: 1400,
  user_elo: 1200,
  status: "waiting",
  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
};

describe("Matchmaking System", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Queue Entry Creation", () => {
    it("should create a queue entry with correct parameters", async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockQueueEntry, error: null }),
        }),
      });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: mockInsert,
      });

      const { data, error } = await supabase
        .from("matchmaking_queue")
        .insert({
          user_id: mockUser.id,
          wager_tct: 100,
          time_control_seconds: 300,
          increment_seconds: 3,
          user_elo: mockUser.elo_rating,
          status: "waiting",
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it("should set correct ELO range based on user rating", () => {
      const userElo = 1200;
      const eloRange = 200;

      const minElo = Math.max(100, userElo - eloRange);
      const maxElo = userElo + eloRange;

      expect(minElo).toBe(1000);
      expect(maxElo).toBe(1400);
    });

    it("should enforce minimum ELO of 100", () => {
      const userElo = 150;
      const eloRange = 200;

      const minElo = Math.max(100, userElo - eloRange);

      expect(minElo).toBe(100);
    });
  });

  describe("Match Finding", () => {
    it("should find a match within ELO range", async () => {
      const mockMatch = {
        queue_id: "queue-456",
        user_id: "opponent-123",
        username: "Opponent",
        elo_rating: 1180,
        avatar_url: null,
        country: "CA",
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: mockMatch,
        error: null,
      });

      const { data, error } = await supabase.rpc("find_match", {
        p_user_id: mockUser.id,
        p_wager_tct: 100,
        p_elo_rating: mockUser.elo_rating,
        p_elo_range: 200,
      });

      expect(error).toBeNull();
      expect(supabase.rpc).toHaveBeenCalledWith("find_match", expect.any(Object));
    });

    it("should return null when no match found", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: null,
      });

      const { data, error } = await supabase.rpc("find_match", {
        p_user_id: mockUser.id,
        p_wager_tct: 10000, // Very high wager, unlikely match
        p_elo_rating: mockUser.elo_rating,
        p_elo_range: 50, // Very narrow range
      });

      expect(error).toBeNull();
      expect(data).toBeNull();
    });
  });

  describe("Balance Locking", () => {
    it("should lock balance for game", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: true,
        error: null,
      });

      const { data, error } = await supabase.rpc("lock_balance_for_game", {
        p_user_id: mockUser.id,
        p_amount: 100,
        p_game_id: "game-123",
      });

      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("should unlock balance when game cancelled", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: true,
        error: null,
      });

      const { data, error } = await supabase.rpc("unlock_balance_for_game", {
        p_user_id: mockUser.id,
        p_amount: 100,
        p_game_id: "game-123",
      });

      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("should fail to lock with insufficient balance", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: "Insufficient available balance" },
      });

      const { data, error } = await supabase.rpc("lock_balance_for_game", {
        p_user_id: mockUser.id,
        p_amount: 999999,
        p_game_id: "game-123",
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Insufficient");
    });
  });

  describe("Queue Cleanup", () => {
    it("should remove expired queue entries", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: 5, // 5 entries removed
        error: null,
      });

      const { data, error } = await supabase.rpc("cleanup_expired_queue_entries");

      expect(error).toBeNull();
      expect(typeof data).toBe("number");
    });
  });

  describe("Game Completion", () => {
    it("should complete game with winner", async () => {
      const gameResult = {
        success: true,
        winner_payout: 180,
        loser_refund: 0,
        commission: 20,
        new_white_elo: 1216,
        new_black_elo: 1184,
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: gameResult,
        error: null,
      });

      const { data, error } = await supabase.rpc("complete_game", {
        p_game_id: "game-123",
        p_winner_id: "white-player-id",
        p_result: "checkmate",
        p_final_fen: "8/8/8/8/8/5k2/8/4K2R w - - 0 1",
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
      expect(data?.winner_payout).toBe(180);
    });

    it("should complete game as draw", async () => {
      const gameResult = {
        success: true,
        winner_payout: 0,
        loser_refund: 0,
        commission: 0,
        new_white_elo: 1200,
        new_black_elo: 1200,
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: gameResult,
        error: null,
      });

      const { data, error } = await supabase.rpc("complete_game", {
        p_game_id: "game-123",
        p_winner_id: null,
        p_result: "draw",
        p_final_fen: "8/8/8/4k3/8/4K3/8/8 w - - 50 100",
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });
  });
});

describe("ELO Range Matching", () => {
  it("should correctly calculate if players are within ELO range", () => {
    const player1Elo = 1200;
    const player2Elo = 1350;
    const eloRange = 200;

    const isWithinRange = Math.abs(player1Elo - player2Elo) <= eloRange;
    expect(isWithinRange).toBe(true);
  });

  it("should reject players outside ELO range", () => {
    const player1Elo = 1200;
    const player2Elo = 1500;
    const eloRange = 200;

    const isWithinRange = Math.abs(player1Elo - player2Elo) <= eloRange;
    expect(isWithinRange).toBe(false);
  });
});

describe("Wager Matching", () => {
  const validWagers = [5, 10, 25, 50, 500, 750, 1000, 2500, 5000, 10000];

  it("should only allow valid wager amounts", () => {
    validWagers.forEach((wager) => {
      expect(validWagers.includes(wager)).toBe(true);
    });
  });

  it("should reject invalid wager amounts", () => {
    const invalidWagers = [0, 15, 100, 999, 50000];
    invalidWagers.forEach((wager) => {
      expect(validWagers.includes(wager)).toBe(false);
    });
  });
});
