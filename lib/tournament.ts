/**
 * Tournament Service
 *
 * Core tournament functionality including registration, bracket management,
 * and realtime subscriptions.
 */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Tournament,
  TournamentRegistration,
  TournamentMatch,
  TournamentPrize,
  TournamentStatus,
  TournamentType,
  TournamentWithDetails,
  TournamentListFilters,
  RegisterForTournamentResult,
  UnregisterFromTournamentResult,
  StartTournamentResult,
  TournamentSubscriptionCallbacks,
  SwissStanding,
} from './tournament.types';

// ============================================================================
// Tournament Queries
// ============================================================================

/**
 * Fetch all tournaments with optional filters
 */
export async function fetchTournaments(
  filters?: TournamentListFilters
): Promise<Tournament[]> {
  let query = supabase
    .from('tournaments')
    .select('*')
    .order('start_time', { ascending: true });

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters?.type) {
    query = query.eq('type', filters.type);
  }

  if (filters?.minEntryFee !== undefined) {
    query = query.gte('entry_fee_tct', filters.minEntryFee);
  }

  if (filters?.maxEntryFee !== undefined) {
    query = query.lte('entry_fee_tct', filters.maxEntryFee);
  }

  if (filters?.hasAvailableSlots) {
    query = query.filter('current_players', 'lt', 'max_players');
  }

  const { data, error } = await query;

  if (error) {
    // PGRST205 means table doesn't exist - return empty array instead of throwing
    if (error.code === 'PGRST205') {
      console.warn('[Tournament] Tournaments table not found, returning empty array');
      return [];
    }
    console.error('Error fetching tournaments:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch active/upcoming tournaments for the main list
 */
export async function fetchActiveTournaments(): Promise<Tournament[]> {
  return fetchTournaments({
    status: ['registration', 'starting', 'active'],
  });
}

/**
 * Fetch a single tournament by ID
 */
export async function fetchTournamentById(
  tournamentId: string
): Promise<Tournament | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching tournament:', error);
    throw error;
  }

  return data;
}

/**
 * Fetch tournament with all related data
 */
export async function fetchTournamentWithDetails(
  tournamentId: string,
  userId?: string
): Promise<TournamentWithDetails | null> {
  // Fetch tournament
  const tournament = await fetchTournamentById(tournamentId);
  if (!tournament) return null;

  // Fetch registrations with profiles
  const { data: registrations } = await supabase
    .from('tournament_registrations')
    .select(`
      *,
      profile:profiles(id, username, avatar_index, elo_rating)
    `)
    .eq('tournament_id', tournamentId)
    .order('score', { ascending: false })
    .order('buchholz_score', { ascending: false });

  // Fetch matches with player info
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select(`
      *,
      player1:profiles!tournament_matches_player1_id_fkey(id, username, avatar_index, elo_rating),
      player2:profiles!tournament_matches_player2_id_fkey(id, username, avatar_index, elo_rating),
      winner:profiles!tournament_matches_winner_id_fkey(id, username)
    `)
    .eq('tournament_id', tournamentId)
    .order('round', { ascending: true })
    .order('match_number', { ascending: true });

  // Fetch prizes
  const { data: prizes } = await supabase
    .from('tournament_prizes')
    .select(`
      *,
      user:profiles(id, username, avatar_index)
    `)
    .eq('tournament_id', tournamentId)
    .order('place', { ascending: true });

  // Find user's registration if userId provided
  let userRegistration: TournamentRegistration | null = null;
  if (userId && registrations) {
    userRegistration = registrations.find((r) => r.user_id === userId) || null;
  }

  return {
    ...tournament,
    registrations: registrations || [],
    matches: matches || [],
    prizes: prizes || [],
    user_registration: userRegistration,
  };
}

// ============================================================================
// Registration Functions
// ============================================================================

/**
 * Register current user for a tournament
 */
export async function registerForTournament(
  tournamentId: string
): Promise<RegisterForTournamentResult> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase.rpc('register_for_tournament', {
    p_tournament_id: tournamentId,
    p_user_id: user.id,
  });

  if (error) {
    console.error('Error registering for tournament:', error);
    return { success: false, error: error.message };
  }

  return data as RegisterForTournamentResult;
}

/**
 * Unregister current user from a tournament
 */
export async function unregisterFromTournament(
  tournamentId: string
): Promise<UnregisterFromTournamentResult> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase.rpc('unregister_from_tournament', {
    p_tournament_id: tournamentId,
    p_user_id: user.id,
  });

  if (error) {
    console.error('Error unregistering from tournament:', error);
    return { success: false, error: error.message };
  }

  return data as UnregisterFromTournamentResult;
}

/**
 * Check if user is registered for a tournament
 */
export async function isUserRegistered(
  tournamentId: string,
  userId?: string
): Promise<boolean> {
  let targetUserId = userId;

  if (!targetUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    targetUserId = user.id;
  }

  const { data, error } = await supabase
    .from('tournament_registrations')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (error) {
    console.error('Error checking registration:', error);
    return false;
  }

  return !!data;
}

/**
 * Get user's registration for a tournament
 */
export async function getUserRegistration(
  tournamentId: string,
  userId?: string
): Promise<TournamentRegistration | null> {
  let targetUserId = userId;

  if (!targetUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    targetUserId = user.id;
  }

  const { data, error } = await supabase
    .from('tournament_registrations')
    .select(`
      *,
      profile:profiles(id, username, avatar_index, elo_rating)
    `)
    .eq('tournament_id', tournamentId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user registration:', error);
    return null;
  }

  return data;
}

// ============================================================================
// Bracket & Match Functions
// ============================================================================

/**
 * Fetch tournament bracket (matches organized by round)
 */
export async function fetchTournamentBracket(
  tournamentId: string
): Promise<Map<number, TournamentMatch[]>> {
  const { data: matches, error } = await supabase
    .from('tournament_matches')
    .select(`
      *,
      player1:profiles!tournament_matches_player1_id_fkey(id, username, avatar_index, elo_rating),
      player2:profiles!tournament_matches_player2_id_fkey(id, username, avatar_index, elo_rating),
      winner:profiles!tournament_matches_winner_id_fkey(id, username)
    `)
    .eq('tournament_id', tournamentId)
    .order('round', { ascending: true })
    .order('match_number', { ascending: true });

  if (error) {
    console.error('Error fetching bracket:', error);
    throw error;
  }

  // Organize matches by round
  const bracket = new Map<number, TournamentMatch[]>();

  for (const match of matches || []) {
    const round = match.round;
    if (!bracket.has(round)) {
      bracket.set(round, []);
    }
    bracket.get(round)!.push(match);
  }

  return bracket;
}

/**
 * Fetch user's current/next match in a tournament
 */
export async function getUserCurrentMatch(
  tournamentId: string,
  userId?: string
): Promise<TournamentMatch | null> {
  let targetUserId = userId;

  if (!targetUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    targetUserId = user.id;
  }

  const { data, error } = await supabase
    .from('tournament_matches')
    .select(`
      *,
      player1:profiles!tournament_matches_player1_id_fkey(id, username, avatar_index, elo_rating),
      player2:profiles!tournament_matches_player2_id_fkey(id, username, avatar_index, elo_rating)
    `)
    .eq('tournament_id', tournamentId)
    .or(`player1_id.eq.${targetUserId},player2_id.eq.${targetUserId}`)
    .in('status', ['pending', 'in_progress'])
    .order('round', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user match:', error);
    return null;
  }

  return data;
}

/**
 * Fetch all matches for a user in a tournament
 */
export async function getUserMatches(
  tournamentId: string,
  userId?: string
): Promise<TournamentMatch[]> {
  let targetUserId = userId;

  if (!targetUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    targetUserId = user.id;
  }

  const { data, error } = await supabase
    .from('tournament_matches')
    .select(`
      *,
      player1:profiles!tournament_matches_player1_id_fkey(id, username, avatar_index, elo_rating),
      player2:profiles!tournament_matches_player2_id_fkey(id, username, avatar_index, elo_rating),
      winner:profiles!tournament_matches_winner_id_fkey(id, username)
    `)
    .eq('tournament_id', tournamentId)
    .or(`player1_id.eq.${targetUserId},player2_id.eq.${targetUserId}`)
    .order('round', { ascending: true });

  if (error) {
    console.error('Error fetching user matches:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Standings & Leaderboard
// ============================================================================

/**
 * Fetch tournament standings (for Swiss tournaments)
 */
export async function fetchTournamentStandings(
  tournamentId: string
): Promise<SwissStanding[]> {
  const { data, error } = await supabase
    .from('tournament_registrations')
    .select(`
      *,
      profile:profiles(id, username, avatar_index, elo_rating)
    `)
    .eq('tournament_id', tournamentId)
    .order('score', { ascending: false })
    .order('buchholz_score', { ascending: false })
    .order('sonneborn_berger', { ascending: false })
    .order('seed', { ascending: true });

  if (error) {
    console.error('Error fetching standings:', error);
    throw error;
  }

  return (data || []).map((reg, index) => ({
    registration: reg,
    rank: index + 1,
    profile: reg.profile,
  }));
}

/**
 * Fetch tournament prizes
 */
export async function fetchTournamentPrizes(
  tournamentId: string
): Promise<TournamentPrize[]> {
  const { data, error } = await supabase
    .from('tournament_prizes')
    .select(`
      *,
      user:profiles(id, username, avatar_index)
    `)
    .eq('tournament_id', tournamentId)
    .order('place', { ascending: true });

  if (error) {
    console.error('Error fetching prizes:', error);
    throw error;
  }

  return data || [];
}

// ============================================================================
// Realtime Subscriptions
// ============================================================================

/**
 * Subscribe to tournament updates
 */
export function subscribeToTournament(
  tournamentId: string,
  callbacks: TournamentSubscriptionCallbacks
): RealtimeChannel {
  const channel = supabase.channel(`tournament:${tournamentId}`);

  // Tournament updates
  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'tournaments',
      filter: `id=eq.${tournamentId}`,
    },
    (payload) => {
      const tournament = payload.new as Tournament;
      callbacks.onTournamentUpdated?.(tournament);

      if (tournament.status === 'completed') {
        callbacks.onTournamentCompleted?.(tournament);
      }
    }
  );

  // Registration changes
  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'tournament_registrations',
      filter: `tournament_id=eq.${tournamentId}`,
    },
    async (payload) => {
      // Fetch full registration with profile
      const { data } = await supabase
        .from('tournament_registrations')
        .select(`*, profile:profiles(id, username, avatar_index, elo_rating)`)
        .eq('id', payload.new.id)
        .single();

      if (data) {
        callbacks.onRegistrationAdded?.(data);
      }
    }
  );

  channel.on(
    'postgres_changes',
    {
      event: 'DELETE',
      schema: 'public',
      table: 'tournament_registrations',
      filter: `tournament_id=eq.${tournamentId}`,
    },
    (payload) => {
      callbacks.onRegistrationRemoved?.(payload.old.user_id);
    }
  );

  // Match updates
  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'tournament_matches',
      filter: `tournament_id=eq.${tournamentId}`,
    },
    async (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        // Fetch full match with player info
        const { data } = await supabase
          .from('tournament_matches')
          .select(`
            *,
            player1:profiles!tournament_matches_player1_id_fkey(id, username, avatar_index, elo_rating),
            player2:profiles!tournament_matches_player2_id_fkey(id, username, avatar_index, elo_rating),
            winner:profiles!tournament_matches_winner_id_fkey(id, username)
          `)
          .eq('id', payload.new.id)
          .single();

        if (data) {
          callbacks.onMatchUpdated?.(data);
        }
      }
    }
  );

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      callbacks.onError?.(new Error('Failed to subscribe to tournament'));
    }
  });

  return channel;
}

/**
 * Unsubscribe from tournament updates
 */
export function unsubscribeFromTournament(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}

// ============================================================================
// Utility Functions
// ============================================================================

// ============================================================================
// Admin Functions
// ============================================================================

export type TournamentFrequency = 'one-time' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly';

export interface CreateTournamentParams {
  name: string;
  entryFee: number;
  maxPlayers: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  startTime: string;
  isRated: boolean;
  description?: string;
  frequency?: TournamentFrequency;
}

export interface UpdateTournamentParams {
  name?: string;
  description?: string;
  entryFee?: number;
  maxPlayers?: number;
  timeControlSeconds?: number;
  incrementSeconds?: number;
  startTime?: string;
  isRated?: boolean;
}

/**
 * Fetch all tournaments (no filters) — admin use
 */
export async function fetchAllTournaments(): Promise<Tournament[]> {
  return fetchTournaments();
}

/**
 * Admin: create a new tournament
 */
export async function adminCreateTournament(
  params: CreateTournamentParams,
  adminId: string
): Promise<{ success: boolean; error?: string; tournament_id?: string }> {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name: params.name,
      description: params.description || null,
      type: 'knockout' as TournamentType,
      entry_fee_tct: params.entryFee,
      prize_pool_tct: 0,
      rake_percentage: 5,
      min_players: 2,
      max_players: params.maxPlayers,
      current_players: 0,
      start_time: params.startTime,
      time_control_seconds: params.timeControlSeconds,
      increment_seconds: params.incrementSeconds,
      is_rated: params.isRated,
      status: 'registration' as TournamentStatus,
      created_by: adminId,
      current_round: 0,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating tournament:', error);
    return { success: false, error: error.message };
  }

  return { success: true, tournament_id: data.id };
}

/**
 * Admin: start a tournament (triggers bracket generation)
 */
export async function adminStartTournament(
  tournamentId: string,
  adminId: string
): Promise<StartTournamentResult> {
  const { data, error } = await supabase.rpc('start_tournament', {
    p_tournament_id: tournamentId,
    p_admin_id: adminId,
  });

  if (error) {
    console.error('Error starting tournament:', error);
    return { success: false, error: error.message };
  }

  return (data as StartTournamentResult) || { success: true };
}

/**
 * Admin: cancel a tournament and refund entry fees
 */
export async function adminCancelTournament(
  tournamentId: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await (supabase.rpc as any)('admin_cancel_tournament', {
    p_tournament_id: tournamentId,
    p_admin_id: adminId,
  });

  if (error) {
    console.error('Error cancelling tournament:', error);
    return { success: false, error: error.message };
  }

  return (data as { success: boolean; error?: string }) || { success: true };
}

/**
 * Admin: update tournament details
 */
export async function adminUpdateTournament(
  tournamentId: string,
  params: UpdateTournamentParams
): Promise<{ success: boolean; error?: string }> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.entryFee !== undefined) updates.entry_fee_tct = params.entryFee;
  if (params.maxPlayers !== undefined) updates.max_players = params.maxPlayers;
  if (params.timeControlSeconds !== undefined) updates.time_control_seconds = params.timeControlSeconds;
  if (params.incrementSeconds !== undefined) updates.increment_seconds = params.incrementSeconds;
  if (params.startTime !== undefined) updates.start_time = params.startTime;
  if (params.isRated !== undefined) updates.is_rated = params.isRated;

  const { error } = await supabase
    .from('tournaments')
    .update(updates)
    .eq('id', tournamentId);

  if (error) {
    console.error('Error updating tournament:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Admin: close a completed tournament (marks it as archived/closed)
 */
export async function adminCloseTournament(
  tournamentId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('tournaments')
    .update({ status: 'completed' })
    .eq('id', tournamentId);

  if (error) {
    console.error('Error closing tournament:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format tournament status for display
 */
export function formatTournamentStatus(status: TournamentStatus): string {
  const statusMap: Record<TournamentStatus, string> = {
    draft: 'Coming Soon',
    registration: 'Registration Open',
    starting: 'Starting Soon',
    active: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return statusMap[status] || status;
}

/**
 * Format tournament type for display
 */
export function formatTournamentType(type: TournamentType): string {
  const typeMap: Record<TournamentType, string> = {
    knockout: 'Knockout',
    swiss: 'Swiss',
    arena: 'Arena',
  };
  return typeMap[type] || type;
}

/**
 * Check if tournament registration is open
 */
export function isRegistrationOpen(tournament: Tournament): boolean {
  if (tournament.status !== 'registration') return false;

  const now = new Date();

  if (tournament.registration_opens_at) {
    const opens = new Date(tournament.registration_opens_at);
    if (now < opens) return false;
  }

  if (tournament.registration_deadline) {
    const deadline = new Date(tournament.registration_deadline);
    if (now > deadline) return false;
  }

  return tournament.current_players < tournament.max_players;
}

/**
 * Get time until tournament starts
 */
export function getTimeUntilStart(tournament: Tournament): number {
  const now = new Date();
  const start = new Date(tournament.start_time);
  return Math.max(0, start.getTime() - now.getTime());
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Starting now';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Calculate prize amount for a place
 */
export function calculatePrizeAmount(
  prizePool: number,
  percentage: number
): number {
  return Math.floor(prizePool * percentage / 100);
}

/**
 * Format place (1st, 2nd, 3rd, etc.)
 */
export function formatPlace(place: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = place % 100;
  return place + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}
