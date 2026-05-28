/**
 * Game History Service
 *
 * Fetches and manages game history data from Supabase.
 * Supports pagination for efficient loading of historical games.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

// ============================================================================
// Types
// ============================================================================

export type GameResult = "win" | "loss" | "draw";
export type GameEndReason =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "stalemate"
  | "draw_agreement"
  | "insufficient_material"
  | "threefold_repetition"
  | "fifty_move_rule";

export interface GameHistoryItem {
  id: string;
  opponentId: string;
  opponentUsername: string;
  opponentAvatarIndex: number;
  opponentEloRating: number;
  playedAs: "white" | "black";
  result: GameResult;
  endReason: GameEndReason;
  eloChange: number;
  wagerTct: number;
  netEarnings: number; // Positive for win, negative for loss, 0 for draw
  movesCount: number;
  gameDurationSeconds: number;
  pgn: string | null;
  startedAt: Date;
  endedAt: Date;
}

export interface GameHistoryResult {
  games: GameHistoryItem[];
  hasMore: boolean;
  totalGames: number;
  cursor: string | null;
}

export interface PlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
  longestStreak: number;
  eloRating: number;
  eloHigh: number;
  eloLow: number;
  totalWonTct: number;
  totalLostTct: number;
  netEarnings: number;
  avgGameDuration: number;
  avgMovesPerGame: number;
  winsByCheckmate: number;
  winsByResignation: number;
  winsByTimeout: number;
  lastPlayedAt: Date | null;
}

// Database row types (snake_case from Supabase)
interface GameRow {
  id: string;
  white_player_id: string;
  black_player_id: string;
  winner_id: string | null;
  status: string;
  result: string | null;
  end_reason: string | null;
  wager_tct: string | number;
  white_elo_before: number;
  black_elo_before: number;
  white_elo_after: number | null;
  black_elo_after: number | null;
  pgn: string | null;
  moves_count: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

interface ProfileRow {
  id: string;
  username: string;
  avatar_index: number;
  elo_rating: number;
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const historyCache: Map<string, CacheEntry<GameHistoryResult>> = new Map();
const statsCache: Map<string, CacheEntry<PlayerStats>> = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

function getCacheKey(userId: string, offset: number, limit: number): string {
  return `${userId}-${offset}-${limit}`;
}

export function clearGameHistoryCache(userId?: string): void {
  if (userId) {
    // Clear only this user's cache entries
    for (const key of historyCache.keys()) {
      if (key.startsWith(userId)) {
        historyCache.delete(key);
      }
    }
    statsCache.delete(userId);
  } else {
    historyCache.clear();
    statsCache.clear();
  }
}

// ============================================================================
// Game History Service
// ============================================================================

/**
 * Fetch game history for a user with pagination
 */
export async function fetchGameHistory(
  userId: string,
  limit: number = 20,
  offset: number = 0,
  forceRefresh: boolean = false
): Promise<GameHistoryResult> {
  const cacheKey = getCacheKey(userId, offset, limit);

  // Check cache
  if (!forceRefresh) {
    const cached = historyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  if (!isSupabaseConfigured) {
    return getMockGameHistory(userId, limit, offset);
  }

  try {
    // Fetch games where user was either white or black
    const { data: gamesData, error: gamesError, count } = await supabase
      .from("games")
      .select(`
        id,
        white_player_id,
        black_player_id,
        winner_id,
        status,
        result,
        end_reason,
        wager_tct,
        white_elo_before,
        black_elo_before,
        white_elo_after,
        black_elo_after,
        pgn,
        moves_count,
        started_at,
        ended_at,
        duration_seconds
      `, { count: "exact" })
      .eq("status", "completed")
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .order("ended_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (gamesError) {
      throw new Error(`Supabase error: ${gamesError.message}`);
    }

    const games = (gamesData || []) as unknown as GameRow[];

    if (games.length === 0) {
      const result: GameHistoryResult = {
        games: [],
        hasMore: false,
        totalGames: 0,
        cursor: null,
      };
      historyCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    // Collect all opponent IDs
    const opponentIds = new Set<string>();
    for (const game of games) {
      const opponentId = game.white_player_id === userId
        ? game.black_player_id
        : game.white_player_id;
      opponentIds.add(opponentId);
    }

    // Fetch opponent profiles
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, avatar_index, elo_rating")
      .in("id", Array.from(opponentIds));

    const profiles = (profilesData || []) as unknown as ProfileRow[];
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Transform to GameHistoryItem
    const historyItems: GameHistoryItem[] = games.map(game => {
      const isWhite = game.white_player_id === userId;
      const opponentId = isWhite ? game.black_player_id : game.white_player_id;
      const opponent = profileMap.get(opponentId);

      // Determine result
      let result: GameResult;
      if (game.winner_id === null) {
        result = "draw";
      } else if (game.winner_id === userId) {
        result = "win";
      } else {
        result = "loss";
      }

      // Calculate ELO change
      const eloBefore = isWhite ? game.white_elo_before : game.black_elo_before;
      const eloAfter = isWhite
        ? (game.white_elo_after ?? eloBefore)
        : (game.black_elo_after ?? eloBefore);
      const eloChange = eloAfter - eloBefore;

      // Calculate net earnings
      const wager = Number(game.wager_tct) || 0;
      let netEarnings = 0;
      if (result === "win") {
        netEarnings = wager * 0.9; // 10% commission
      } else if (result === "loss") {
        netEarnings = -wager;
      }

      return {
        id: game.id,
        opponentId,
        opponentUsername: opponent?.username || "Unknown",
        opponentAvatarIndex: opponent?.avatar_index || 0,
        opponentEloRating: opponent?.elo_rating || 1200,
        playedAs: isWhite ? "white" : "black",
        result,
        endReason: mapEndReason(game.end_reason),
        eloChange,
        wagerTct: wager,
        netEarnings,
        movesCount: game.moves_count || 0,
        gameDurationSeconds: game.duration_seconds || 0,
        pgn: game.pgn,
        startedAt: new Date(game.started_at),
        endedAt: game.ended_at ? new Date(game.ended_at) : new Date(),
      };
    });

    const result: GameHistoryResult = {
      games: historyItems,
      hasMore: (count || 0) > offset + limit,
      totalGames: count || 0,
      cursor: historyItems.length > 0
        ? historyItems[historyItems.length - 1].id
        : null,
    };

    historyCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error("Failed to fetch game history:", error);

    // Return cached data if available
    const cached = historyCache.get(cacheKey);
    if (cached) {
      return cached.data;
    }

    return getMockGameHistory(userId, limit, offset);
  }
}

/**
 * Fetch a single game by ID
 */
export async function fetchGameById(gameId: string): Promise<GameHistoryItem | null> {
  if (!isSupabaseConfigured) {
    // Return mock for development
    const mockHistory = getMockGameHistory("mock-user", 10, 0);
    return mockHistory.games.find(g => g.id === gameId) || null;
  }

  try {
    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .select(`
        id,
        white_player_id,
        black_player_id,
        winner_id,
        status,
        result,
        end_reason,
        wager_tct,
        white_elo_before,
        black_elo_before,
        white_elo_after,
        black_elo_after,
        pgn,
        moves_count,
        started_at,
        ended_at,
        duration_seconds
      `)
      .eq("id", gameId)
      .single();

    if (gameError) {
      throw new Error(`Supabase error: ${gameError.message}`);
    }

    const game = gameData as unknown as GameRow;
    if (!game) return null;

    // Fetch both player profiles
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, avatar_index, elo_rating")
      .in("id", [game.white_player_id, game.black_player_id]);

    const profiles = (profilesData || []) as unknown as ProfileRow[];
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // For game detail, we need to know who the viewer is
    // Return from white's perspective by default
    const viewerIsWhite = true;
    const opponentId = viewerIsWhite ? game.black_player_id : game.white_player_id;
    const opponent = profileMap.get(opponentId);

    let result: GameResult;
    if (game.winner_id === null) {
      result = "draw";
    } else if (game.winner_id === game.white_player_id) {
      result = viewerIsWhite ? "win" : "loss";
    } else {
      result = viewerIsWhite ? "loss" : "win";
    }

    const wager = Number(game.wager_tct) || 0;
    let netEarnings = 0;
    if (result === "win") {
      netEarnings = wager * 0.9;
    } else if (result === "loss") {
      netEarnings = -wager;
    }

    return {
      id: game.id,
      opponentId,
      opponentUsername: opponent?.username || "Unknown",
      opponentAvatarIndex: opponent?.avatar_index || 0,
      opponentEloRating: opponent?.elo_rating || 1200,
      playedAs: viewerIsWhite ? "white" : "black",
      result,
      endReason: mapEndReason(game.end_reason),
      eloChange: viewerIsWhite
        ? (game.white_elo_after || game.white_elo_before) - game.white_elo_before
        : (game.black_elo_after || game.black_elo_before) - game.black_elo_before,
      wagerTct: wager,
      netEarnings,
      movesCount: game.moves_count || 0,
      gameDurationSeconds: game.duration_seconds || 0,
      pgn: game.pgn,
      startedAt: new Date(game.started_at),
      endedAt: game.ended_at ? new Date(game.ended_at) : new Date(),
    };
  } catch (error) {
    console.error("Failed to fetch game:", error);
    return null;
  }
}

/**
 * Fetch comprehensive player statistics
 */
export async function fetchPlayerStats(
  userId: string,
  forceRefresh: boolean = false
): Promise<PlayerStats> {
  // Check cache
  if (!forceRefresh) {
    const cached = statsCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  if (!isSupabaseConfigured) {
    return getMockPlayerStats();
  }

  try {
    // Fetch all completed games for this user
    const { data: gamesData, error: gamesError } = await supabase
      .from("games")
      .select(`
        id,
        white_player_id,
        black_player_id,
        winner_id,
        result,
        end_reason,
        wager_tct,
        white_elo_before,
        black_elo_before,
        white_elo_after,
        black_elo_after,
        moves_count,
        duration_seconds,
        ended_at
      `)
      .eq("status", "completed")
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .order("ended_at", { ascending: false });

    if (gamesError) {
      throw new Error(`Supabase error: ${gamesError.message}`);
    }

    const games = (gamesData || []) as unknown as GameRow[];

    // Fetch user profile for current ELO and streak
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("elo_rating, current_streak, longest_streak")
      .eq("id", userId)
      .single();

    if (profileError) {
      throw new Error(`Supabase error: ${profileError.message}`);
    }

    const profile = profileData as { elo_rating: number; current_streak: number; longest_streak: number };

    // Fetch balance for earnings
    const { data: balanceData } = await supabase
      .from("balances")
      .select("total_won_tct, total_lost_tct")
      .eq("user_id", userId)
      .single();

    const balance = balanceData as { total_won_tct: number; total_lost_tct: number } | null;

    // Calculate stats from games
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let winsByCheckmate = 0;
    let winsByResignation = 0;
    let winsByTimeout = 0;
    let totalDuration = 0;
    let totalMoves = 0;
    let eloHigh = profile.elo_rating;
    let eloLow = profile.elo_rating;
    let lastPlayedAt: Date | null = null;

    for (const game of games) {
      const isWhite = game.white_player_id === userId;

      // Track ELO history
      const eloAfter = isWhite
        ? (game.white_elo_after ?? game.white_elo_before)
        : (game.black_elo_after ?? game.black_elo_before);
      eloHigh = Math.max(eloHigh, eloAfter);
      eloLow = Math.min(eloLow, eloAfter);

      // Count results
      if (game.winner_id === null) {
        draws++;
      } else if (game.winner_id === userId) {
        wins++;
        if (game.end_reason === "checkmate") winsByCheckmate++;
        else if (game.end_reason === "resignation") winsByResignation++;
        else if (game.end_reason === "timeout") winsByTimeout++;
      } else {
        losses++;
      }

      // Track duration and moves
      totalDuration += game.duration_seconds || 0;
      totalMoves += game.moves_count || 0;

      // Track last played
      if (game.ended_at && !lastPlayedAt) {
        lastPlayedAt = new Date(game.ended_at);
      }
    }

    const totalGames = wins + losses + draws;
    const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
    const avgGameDuration = totalGames > 0 ? totalDuration / totalGames : 0;
    const avgMovesPerGame = totalGames > 0 ? totalMoves / totalGames : 0;

    const totalWonTct = Number(balance?.total_won_tct) || 0;
    const totalLostTct = Number(balance?.total_lost_tct) || 0;

    const stats: PlayerStats = {
      totalGames,
      wins,
      losses,
      draws,
      winRate,
      currentStreak: profile.current_streak,
      longestStreak: profile.longest_streak,
      eloRating: profile.elo_rating,
      eloHigh,
      eloLow,
      totalWonTct,
      totalLostTct,
      netEarnings: totalWonTct - totalLostTct,
      avgGameDuration,
      avgMovesPerGame,
      winsByCheckmate,
      winsByResignation,
      winsByTimeout,
      lastPlayedAt,
    };

    statsCache.set(userId, { data: stats, timestamp: Date.now() });
    return stats;
  } catch (error) {
    console.error("Failed to fetch player stats:", error);

    // Return cached if available
    const cached = statsCache.get(userId);
    if (cached) {
      return cached.data;
    }

    return getMockPlayerStats();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapEndReason(reason: string | null): GameEndReason {
  switch (reason) {
    case "checkmate":
      return "checkmate";
    case "resignation":
      return "resignation";
    case "timeout":
      return "timeout";
    case "stalemate":
      return "stalemate";
    case "draw_agreement":
      return "draw_agreement";
    case "insufficient_material":
      return "insufficient_material";
    case "threefold_repetition":
      return "threefold_repetition";
    case "fifty_move_rule":
      return "fifty_move_rule";
    default:
      return "checkmate";
  }
}

function formatGameDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// Mock Data
// ============================================================================

function getMockGameHistory(
  userId: string,
  limit: number,
  offset: number
): GameHistoryResult {
  const mockGames: GameHistoryItem[] = [
    {
      id: "g1",
      opponentId: "opp1",
      opponentUsername: "ChessMaster3000",
      opponentAvatarIndex: 5,
      opponentEloRating: 1850,
      playedAs: "white",
      result: "win",
      endReason: "checkmate",
      eloChange: 15,
      wagerTct: 100,
      netEarnings: 90,
      movesCount: 42,
      gameDurationSeconds: 1245,
      pgn: null,
      startedAt: new Date(Date.now() - 3600000),
      endedAt: new Date(Date.now() - 2400000),
    },
    {
      id: "g2",
      opponentId: "opp2",
      opponentUsername: "QueenGambit",
      opponentAvatarIndex: 12,
      opponentEloRating: 1920,
      playedAs: "black",
      result: "loss",
      endReason: "resignation",
      eloChange: -12,
      wagerTct: 50,
      netEarnings: -50,
      movesCount: 35,
      gameDurationSeconds: 980,
      pgn: null,
      startedAt: new Date(Date.now() - 86400000),
      endedAt: new Date(Date.now() - 85000000),
    },
    {
      id: "g3",
      opponentId: "opp3",
      opponentUsername: "GrandmasterFlash",
      opponentAvatarIndex: 8,
      opponentEloRating: 2100,
      playedAs: "white",
      result: "win",
      endReason: "timeout",
      eloChange: 25,
      wagerTct: 250,
      netEarnings: 225,
      movesCount: 28,
      gameDurationSeconds: 600,
      pgn: null,
      startedAt: new Date(Date.now() - 172800000),
      endedAt: new Date(Date.now() - 171600000),
    },
    {
      id: "g4",
      opponentId: "opp4",
      opponentUsername: "RookiePlayer",
      opponentAvatarIndex: 3,
      opponentEloRating: 1500,
      playedAs: "black",
      result: "win",
      endReason: "checkmate",
      eloChange: 8,
      wagerTct: 25,
      netEarnings: 22.5,
      movesCount: 52,
      gameDurationSeconds: 1800,
      pgn: null,
      startedAt: new Date(Date.now() - 259200000),
      endedAt: new Date(Date.now() - 257400000),
    },
    {
      id: "g5",
      opponentId: "opp5",
      opponentUsername: "PawnStorm",
      opponentAvatarIndex: 15,
      opponentEloRating: 1780,
      playedAs: "white",
      result: "draw",
      endReason: "stalemate",
      eloChange: 0,
      wagerTct: 100,
      netEarnings: 0,
      movesCount: 65,
      gameDurationSeconds: 2100,
      pgn: null,
      startedAt: new Date(Date.now() - 345600000),
      endedAt: new Date(Date.now() - 343500000),
    },
  ];

  // Generate more mock games
  for (let i = 6; i <= 25; i++) {
    const results: GameResult[] = ["win", "loss", "draw"];
    const result = results[Math.floor(Math.random() * results.length)];
    const endReasons: GameEndReason[] = ["checkmate", "resignation", "timeout"];
    const endReason = endReasons[Math.floor(Math.random() * endReasons.length)];
    const wager = [25, 50, 100, 250, 500][Math.floor(Math.random() * 5)];
    const eloChange = result === "win" ? Math.floor(Math.random() * 20) + 5
      : result === "loss" ? -(Math.floor(Math.random() * 15) + 5)
      : 0;

    mockGames.push({
      id: `g${i}`,
      opponentId: `opp${i}`,
      opponentUsername: `Player${i}`,
      opponentAvatarIndex: i % 20,
      opponentEloRating: 1400 + Math.floor(Math.random() * 600),
      playedAs: i % 2 === 0 ? "white" : "black",
      result,
      endReason,
      eloChange,
      wagerTct: wager,
      netEarnings: result === "win" ? wager * 0.9 : result === "loss" ? -wager : 0,
      movesCount: 20 + Math.floor(Math.random() * 40),
      gameDurationSeconds: 300 + Math.floor(Math.random() * 1800),
      pgn: null,
      startedAt: new Date(Date.now() - (i * 86400000)),
      endedAt: new Date(Date.now() - (i * 86400000) + 1200000),
    });
  }

  const paginatedGames = mockGames.slice(offset, offset + limit);

  return {
    games: paginatedGames,
    hasMore: offset + limit < mockGames.length,
    totalGames: mockGames.length,
    cursor: paginatedGames.length > 0
      ? paginatedGames[paginatedGames.length - 1].id
      : null,
  };
}

function getMockPlayerStats(): PlayerStats {
  return {
    totalGames: 150,
    wins: 87,
    losses: 52,
    draws: 11,
    winRate: 58.0,
    currentStreak: 3,
    longestStreak: 12,
    eloRating: 1750,
    eloHigh: 1890,
    eloLow: 1420,
    totalWonTct: 4520,
    totalLostTct: 2180,
    netEarnings: 2340,
    avgGameDuration: 1050,
    avgMovesPerGame: 38,
    winsByCheckmate: 45,
    winsByResignation: 32,
    winsByTimeout: 10,
    lastPlayedAt: new Date(Date.now() - 3600000),
  };
}
