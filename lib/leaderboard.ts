/**
 * Leaderboard Service
 *
 * Fetches and manages leaderboard data from Supabase.
 * Supports time-based filtering (all-time, monthly, weekly)
 * and caching for performance optimization.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

// ============================================================================
// Types
// ============================================================================

export type TimePeriod = "all" | "monthly" | "weekly";

export interface LeaderboardPlayer {
  id: string;
  username: string;
  avatarIndex: number;
  profilePictureUrl: string | null;
  country: string | null;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  currentStreak: number;
  longestStreak: number;
  totalWonTct: number;
  rank: number;
}

export interface LeaderboardResult {
  players: LeaderboardPlayer[];
  currentUserRank: number | null;
  totalPlayers: number;
  fetchedAt: Date;
}

// Database row types (snake_case from Supabase)
interface ProfileRow {
  id: string;
  username: string;
  avatar_index: number;
  profile_picture_url: string | null;
  country: string | null;
  elo_rating: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  games_drawn: number;
  current_streak: number;
  longest_streak: number;
}

interface BalanceRow {
  user_id: string;
  total_won_tct: string | number;
}

interface GameRow {
  white_player_id: string;
  black_player_id: string;
  winner_id: string | null;
  result: string | null;
  wager_tct: string | number;
  started_at: string;
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  data: LeaderboardResult;
  timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

function getCacheKey(period: TimePeriod, limit: number): string {
  return `${period}-${limit}`;
}

function getCachedData(period: TimePeriod, limit: number): LeaderboardResult | null {
  const key = getCacheKey(period, limit);
  const entry = cache.get(key);

  if (!entry) return null;

  const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
  if (isExpired) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCacheData(period: TimePeriod, limit: number, data: LeaderboardResult): void {
  const key = getCacheKey(period, limit);
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearLeaderboardCache(): void {
  cache.clear();
}

// ============================================================================
// Date Helpers
// ============================================================================

function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

// ============================================================================
// Leaderboard Service
// ============================================================================

/**
 * Fetch top players by ELO rating
 * For all-time: Uses profiles table directly
 * For monthly/weekly: Filters by games completed in that period
 */
export async function fetchLeaderboard(
  period: TimePeriod = "all",
  limit: number = 100,
  currentUserId?: string,
  forceRefresh: boolean = false
): Promise<LeaderboardResult> {
  // Check cache first
  if (!forceRefresh) {
    const cached = getCachedData(period, limit);
    if (cached) {
      return cached;
    }
  }

  if (!isSupabaseConfigured) {
    return getMockLeaderboard(currentUserId);
  }

  try {
    let result: LeaderboardResult;

    if (period === "all") {
      result = await fetchAllTimeLeaderboard(limit, currentUserId);
    } else {
      result = await fetchPeriodLeaderboard(period, limit, currentUserId);
    }

    setCacheData(period, limit, result);
    return result;
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    // Return cached data if available, even if expired
    const cached = getCachedData(period, limit);
    if (cached) {
      return cached;
    }
    return getMockLeaderboard(currentUserId);
  }
}

/**
 * Fetch all-time leaderboard from profiles table
 */
async function fetchAllTimeLeaderboard(
  limit: number,
  currentUserId?: string
): Promise<LeaderboardResult> {
  console.log("[Leaderboard] Fetching all-time leaderboard from Supabase...");

  // Fetch top players by ELO (include all registered users)
  const { data, error, count } = await supabase
    .from("profiles")
    .select(`
      id,
      username,
      avatar_index,
      profile_picture_url,
      country,
      elo_rating,
      games_played,
      games_won,
      games_lost,
      games_drawn,
      current_streak,
      longest_streak
    `, { count: "exact" })
    .order("elo_rating", { ascending: false })
    .order("games_won", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Leaderboard] Supabase error:", error.message);
    throw new Error(`Supabase error: ${error.message}`);
  }

  const profiles = (data || []) as unknown as ProfileRow[];
  console.log("[Leaderboard] Fetched profiles:", profiles.map(p => ({ id: p.id, username: p.username, elo: p.elo_rating, pfp: p.profile_picture_url })));

  // Fetch total winnings from balances
  const playerIds = profiles.map(p => p.id);
  const { data: balanceData } = await supabase
    .from("balances")
    .select("user_id, total_won_tct")
    .in("user_id", playerIds);

  const balances = (balanceData || []) as unknown as BalanceRow[];
  const balanceMap = new Map(
    balances.map(b => [b.user_id, Number(b.total_won_tct) || 0])
  );

  const players: LeaderboardPlayer[] = profiles.map((profile, index) => ({
    id: profile.id,
    username: profile.username,
    avatarIndex: profile.avatar_index,
    profilePictureUrl: profile.profile_picture_url,
    country: profile.country,
    eloRating: profile.elo_rating,
    gamesPlayed: profile.games_played,
    gamesWon: profile.games_won,
    gamesLost: profile.games_lost,
    gamesDrawn: profile.games_drawn,
    currentStreak: profile.current_streak,
    longestStreak: profile.longest_streak,
    totalWonTct: balanceMap.get(profile.id) || 0,
    rank: index + 1,
  }));

  // Find current user's rank if not in top players
  let currentUserRank: number | null = null;
  if (currentUserId) {
    const foundIndex = players.findIndex(p => p.id === currentUserId);
    if (foundIndex !== -1) {
      currentUserRank = foundIndex + 1;
    } else {
      // Query for user's rank
      const { data: userData } = await supabase
        .from("profiles")
        .select("elo_rating")
        .eq("id", currentUserId)
        .single();

      const userProfile = userData as unknown as { elo_rating: number } | null;

      if (userProfile) {
        const { count: higherCount } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gt("elo_rating", userProfile.elo_rating);

        currentUserRank = (higherCount || 0) + 1;
      }
    }
  }

  return {
    players,
    currentUserRank,
    totalPlayers: count || 0,
    fetchedAt: new Date(),
  };
}

/**
 * Fetch leaderboard for a specific time period
 * Ranks players by performance (wins) within that period
 */
async function fetchPeriodLeaderboard(
  period: "monthly" | "weekly",
  limit: number,
  currentUserId?: string
): Promise<LeaderboardResult> {
  const startDate = period === "monthly" ? getStartOfMonth() : getStartOfWeek();

  // Query completed games in the period
  const { data: gamesData } = await supabase
    .from("games")
    .select(`
      white_player_id,
      black_player_id,
      winner_id,
      result,
      wager_tct
    `)
    .eq("status", "completed")
    .gte("started_at", startDate.toISOString());

  const games = (gamesData || []) as unknown as GameRow[];

  if (games.length === 0) {
    // No games in period, return empty leaderboard
    return {
      players: [],
      currentUserRank: null,
      totalPlayers: 0,
      fetchedAt: new Date(),
    };
  }

  // Aggregate stats by player
  const statsMap = new Map<string, {
    wins: number;
    losses: number;
    draws: number;
    winnings: number;
  }>();

  for (const game of games) {
    const whiteId = game.white_player_id;
    const blackId = game.black_player_id;
    const wager = Number(game.wager_tct) || 0;

    // Initialize players if not exists
    if (!statsMap.has(whiteId)) {
      statsMap.set(whiteId, { wins: 0, losses: 0, draws: 0, winnings: 0 });
    }
    if (!statsMap.has(blackId)) {
      statsMap.set(blackId, { wins: 0, losses: 0, draws: 0, winnings: 0 });
    }

    const whiteStats = statsMap.get(whiteId)!;
    const blackStats = statsMap.get(blackId)!;

    if (game.result === "white_wins") {
      whiteStats.wins++;
      blackStats.losses++;
      whiteStats.winnings += wager * 1.9; // Approximate after commission
    } else if (game.result === "black_wins") {
      blackStats.wins++;
      whiteStats.losses++;
      blackStats.winnings += wager * 1.9;
    } else if (game.result === "draw") {
      whiteStats.draws++;
      blackStats.draws++;
    }
  }

  // Get player IDs sorted by wins
  const playerIds = Array.from(statsMap.entries())
    .sort((a, b) => b[1].wins - a[1].wins)
    .slice(0, limit)
    .map(([id]) => id);

  if (playerIds.length === 0) {
    return {
      players: [],
      currentUserRank: null,
      totalPlayers: 0,
      fetchedAt: new Date(),
    };
  }

  // Fetch profile details
  const { data: profileData } = await supabase
    .from("profiles")
    .select(`
      id,
      username,
      avatar_index,
      profile_picture_url,
      country,
      elo_rating,
      current_streak,
      longest_streak
    `)
    .in("id", playerIds);

  const profiles = (profileData || []) as unknown as ProfileRow[];
  const profileMap = new Map(profiles.map(p => [p.id, p]));

  const players: LeaderboardPlayer[] = playerIds
    .map((id, index) => {
      const profile = profileMap.get(id);
      const stats = statsMap.get(id)!;
      if (!profile) return null;

      return {
        id: profile.id,
        username: profile.username,
        avatarIndex: profile.avatar_index,
        profilePictureUrl: profile.profile_picture_url,
        country: profile.country,
        eloRating: profile.elo_rating,
        gamesPlayed: stats.wins + stats.losses + stats.draws,
        gamesWon: stats.wins,
        gamesLost: stats.losses,
        gamesDrawn: stats.draws,
        currentStreak: profile.current_streak,
        longestStreak: profile.longest_streak,
        totalWonTct: stats.winnings,
        rank: index + 1,
      };
    })
    .filter((p): p is LeaderboardPlayer => p !== null);

  let currentUserRank: number | null = null;
  if (currentUserId) {
    const foundIndex = players.findIndex(p => p.id === currentUserId);
    if (foundIndex !== -1) {
      currentUserRank = foundIndex + 1;
    }
  }

  return {
    players,
    currentUserRank,
    totalPlayers: statsMap.size,
    fetchedAt: new Date(),
  };
}

/**
 * Fetch current user's rank and nearby players
 */
export async function fetchUserRankContext(
  userId: string,
  period: TimePeriod = "all"
): Promise<{
  userRank: number | null;
  userPlayer: LeaderboardPlayer | null;
  nearbyPlayers: LeaderboardPlayer[];
}> {
  if (!isSupabaseConfigured) {
    return { userRank: null, userPlayer: null, nearbyPlayers: [] };
  }

  try {
    // First fetch the full leaderboard to find user's position
    const result = await fetchLeaderboard(period, 100, userId);

    const userIndex = result.players.findIndex(p => p.id === userId);

    if (userIndex !== -1) {
      // User is in top 100
      const userPlayer = result.players[userIndex];
      const startIdx = Math.max(0, userIndex - 2);
      const endIdx = Math.min(result.players.length, userIndex + 3);
      const nearbyPlayers = result.players.slice(startIdx, endIdx);

      return {
        userRank: userIndex + 1,
        userPlayer,
        nearbyPlayers,
      };
    }

    // User not in top 100, fetch their specific data
    const { data: profileData } = await supabase
      .from("profiles")
      .select(`
        id,
        username,
        avatar_index,
        profile_picture_url,
        country,
        elo_rating,
        games_played,
        games_won,
        games_lost,
        games_drawn,
        current_streak,
        longest_streak
      `)
      .eq("id", userId)
      .single();

    const profile = profileData as unknown as ProfileRow | null;

    if (!profile) {
      return { userRank: null, userPlayer: null, nearbyPlayers: [] };
    }

    // Get user's rank (count all users with higher ELO)
    const { count: higherCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gt("elo_rating", profile.elo_rating);

    const userRank = (higherCount || 0) + 1;

    const userPlayer: LeaderboardPlayer = {
      id: profile.id,
      username: profile.username,
      avatarIndex: profile.avatar_index,
      profilePictureUrl: profile.profile_picture_url,
      country: profile.country,
      eloRating: profile.elo_rating,
      gamesPlayed: profile.games_played,
      gamesWon: profile.games_won,
      gamesLost: profile.games_lost,
      gamesDrawn: profile.games_drawn,
      currentStreak: profile.current_streak,
      longestStreak: profile.longest_streak,
      totalWonTct: 0,
      rank: userRank,
    };

    return {
      userRank,
      userPlayer,
      nearbyPlayers: [userPlayer],
    };
  } catch (error) {
    console.error("Failed to fetch user rank context:", error);
    return { userRank: null, userPlayer: null, nearbyPlayers: [] };
  }
}

// ============================================================================
// Mock Data (for development/fallback)
// ============================================================================

function getMockLeaderboard(currentUserId?: string): LeaderboardResult {
  const mockPlayers: LeaderboardPlayer[] = [
    { id: "u1", username: "ChessMaster3000", avatarIndex: 1, profilePictureUrl: null, country: "US", eloRating: 2150, gamesPlayed: 150, gamesWon: 127, gamesLost: 23, gamesDrawn: 0, currentStreak: 8, longestStreak: 15, totalWonTct: 5420, rank: 1 },
    { id: "u2", username: "QueenGambit", avatarIndex: 5, profilePictureUrl: null, country: "GB", eloRating: 2050, gamesPlayed: 129, gamesWon: 98, gamesLost: 31, gamesDrawn: 0, currentStreak: 3, longestStreak: 12, totalWonTct: 3890, rank: 2 },
    { id: "u3", username: "GrandmasterFlash", avatarIndex: 12, profilePictureUrl: null, country: "DE", eloRating: 1980, gamesPlayed: 113, gamesWon: 85, gamesLost: 28, gamesDrawn: 0, currentStreak: 5, longestStreak: 10, totalWonTct: 3240, rank: 3 },
    { id: "u4", username: "RookieKiller", avatarIndex: 8, profilePictureUrl: null, country: "FR", eloRating: 1920, gamesPlayed: 111, gamesWon: 76, gamesLost: 35, gamesDrawn: 0, currentStreak: 2, longestStreak: 8, totalWonTct: 2650, rank: 4 },
    { id: "u5", username: "PawnStorm", avatarIndex: 15, profilePictureUrl: null, country: "JP", eloRating: 1850, gamesPlayed: 110, gamesWon: 68, gamesLost: 42, gamesDrawn: 0, currentStreak: 1, longestStreak: 7, totalWonTct: 2180, rank: 5 },
    { id: "u6", username: "KnightRider", avatarIndex: 20, profilePictureUrl: null, country: "BR", eloRating: 1780, gamesPlayed: 92, gamesWon: 54, gamesLost: 38, gamesDrawn: 0, currentStreak: 4, longestStreak: 9, totalWonTct: 1760, rank: 6 },
    { id: "u7", username: "BishopBandit", avatarIndex: 3, profilePictureUrl: null, country: "IN", eloRating: 1720, gamesPlayed: 93, gamesWon: 49, gamesLost: 44, gamesDrawn: 0, currentStreak: 0, longestStreak: 6, totalWonTct: 1450, rank: 7 },
    { id: "u8", username: "CheckmateKing", avatarIndex: 22, profilePictureUrl: null, country: "RU", eloRating: 1680, gamesPlayed: 80, gamesWon: 41, gamesLost: 39, gamesDrawn: 0, currentStreak: 2, longestStreak: 5, totalWonTct: 1120, rank: 8 },
    { id: "u9", username: "EndgameMaster", avatarIndex: 7, profilePictureUrl: null, country: "CA", eloRating: 1650, gamesPlayed: 75, gamesWon: 38, gamesLost: 37, gamesDrawn: 0, currentStreak: 1, longestStreak: 4, totalWonTct: 950, rank: 9 },
    { id: "u10", username: "TacticalGenius", avatarIndex: 18, profilePictureUrl: null, country: "AU", eloRating: 1620, gamesPlayed: 70, gamesWon: 35, gamesLost: 35, gamesDrawn: 0, currentStreak: 3, longestStreak: 6, totalWonTct: 820, rank: 10 },
  ];

  let currentUserRank: number | null = null;
  if (currentUserId) {
    const found = mockPlayers.findIndex(p => p.id === currentUserId);
    currentUserRank = found !== -1 ? found + 1 : 42; // Default to rank 42 if not found
  }

  return {
    players: mockPlayers,
    currentUserRank,
    totalPlayers: 1250,
    fetchedAt: new Date(),
  };
}
