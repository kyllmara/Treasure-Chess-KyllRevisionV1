-- =====================================================
-- TREASURE CHESS - INITIAL DATABASE SCHEMA
-- =====================================================
-- Run this in your Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/jgjhmivnlvruzvztepqa/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE game_status AS ENUM ('pending', 'active', 'completed', 'abandoned');
CREATE TYPE game_result AS ENUM ('white_wins', 'black_wins', 'draw', 'abandoned');
CREATE TYPE end_reason AS ENUM (
  'checkmate', 'timeout', 'resign', 'abandon',
  'draw_agreement', 'stalemate', 'insufficient_material',
  'threefold_repetition', 'fifty_moves'
);
CREATE TYPE challenge_status AS ENUM ('pending', 'accepted', 'cancelled', 'expired');
CREATE TYPE escrow_status AS ENUM ('active', 'settled', 'refunded', 'disputed');
CREATE TYPE transaction_type AS ENUM (
  'deposit', 'withdraw', 'wager_lock', 'wager_unlock',
  'win_payout', 'loss_deduct', 'commission', 'refund'
);
CREATE TYPE queue_status AS ENUM ('waiting', 'matched', 'cancelled', 'expired');

-- =====================================================
-- PROFILES TABLE
-- =====================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  avatar_index INTEGER NOT NULL DEFAULT 0,
  privy_user_id TEXT NOT NULL UNIQUE,
  embedded_wallet_address TEXT NOT NULL,
  smart_wallet_address TEXT,
  external_wallet_address TEXT,
  active_wallet_type TEXT NOT NULL DEFAULT 'embedded',
  elo_rating INTEGER NOT NULL DEFAULT 1200,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  games_drawn INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  music_enabled BOOLEAN NOT NULL DEFAULT true,
  haptic_enabled BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- BALANCES TABLE
-- =====================================================
CREATE TABLE balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  available_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  locked_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  total_deposited_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  total_withdrawn_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  total_won_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  total_lost_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  total_commission_paid_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =====================================================
-- GAMES TABLE
-- =====================================================
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  white_player_id UUID NOT NULL REFERENCES profiles(id),
  black_player_id UUID NOT NULL REFERENCES profiles(id),
  winner_id UUID REFERENCES profiles(id),
  wager_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  time_control_seconds INTEGER NOT NULL,
  increment_seconds INTEGER NOT NULL DEFAULT 0,
  status game_status NOT NULL DEFAULT 'pending',
  result game_result,
  end_reason end_reason,
  initial_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  current_fen TEXT,
  final_fen TEXT,
  pgn TEXT,
  white_time_remaining INTEGER,
  black_time_remaining INTEGER,
  move_count INTEGER NOT NULL DEFAULT 0,
  current_turn TEXT NOT NULL DEFAULT 'w',
  last_move_at TIMESTAMPTZ,
  white_elo_before INTEGER,
  white_elo_after INTEGER,
  black_elo_before INTEGER,
  black_elo_after INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- =====================================================
-- GAME MOVES TABLE
-- =====================================================
CREATE TABLE game_moves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number INTEGER NOT NULL,
  player_id UUID NOT NULL REFERENCES profiles(id),
  san TEXT NOT NULL,
  uci TEXT NOT NULL,
  fen_before TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  time_spent_ms INTEGER NOT NULL,
  time_remaining_ms INTEGER NOT NULL,
  is_capture BOOLEAN NOT NULL DEFAULT false,
  is_check BOOLEAN NOT NULL DEFAULT false,
  is_checkmate BOOLEAN NOT NULL DEFAULT false,
  is_castling BOOLEAN NOT NULL DEFAULT false,
  is_en_passant BOOLEAN NOT NULL DEFAULT false,
  is_promotion BOOLEAN NOT NULL DEFAULT false,
  promotion_piece TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- CHALLENGES TABLE
-- =====================================================
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES profiles(id),
  opponent_id UUID REFERENCES profiles(id),
  room_code TEXT NOT NULL UNIQUE,
  wager_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  time_control_seconds INTEGER NOT NULL,
  increment_seconds INTEGER NOT NULL DEFAULT 0,
  creator_color TEXT NOT NULL DEFAULT 'random',
  min_elo INTEGER,
  max_elo INTEGER,
  status challenge_status NOT NULL DEFAULT 'pending',
  game_id UUID REFERENCES games(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);

-- =====================================================
-- GAME ESCROWS TABLE
-- =====================================================
CREATE TABLE game_escrows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE UNIQUE,
  player_white_id UUID NOT NULL REFERENCES profiles(id),
  player_white_locked_tct NUMERIC(20, 8) NOT NULL,
  player_black_id UUID NOT NULL REFERENCES profiles(id),
  player_black_locked_tct NUMERIC(20, 8) NOT NULL,
  total_pool_tct NUMERIC(20, 8) NOT NULL,
  commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.10,
  status escrow_status NOT NULL DEFAULT 'active',
  winner_id UUID REFERENCES profiles(id),
  winner_payout_tct NUMERIC(20, 8),
  loser_refund_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
  commission_tct NUMERIC(20, 8),
  settled_at TIMESTAMPTZ,
  settled_reason TEXT,
  settlement_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  type transaction_type NOT NULL,
  amount_tct NUMERIC(20, 8) NOT NULL,
  game_id UUID REFERENCES games(id),
  escrow_id UUID REFERENCES game_escrows(id),
  tx_hash TEXT,
  balance_before_tct NUMERIC(20, 8) NOT NULL,
  balance_after_tct NUMERIC(20, 8) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- MATCHMAKING QUEUE TABLE
-- =====================================================
CREATE TABLE matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  wager_tct NUMERIC(20, 8) NOT NULL,
  time_control_seconds INTEGER NOT NULL,
  increment_seconds INTEGER NOT NULL DEFAULT 0,
  elo_range_min INTEGER NOT NULL,
  elo_range_max INTEGER NOT NULL,
  user_elo INTEGER NOT NULL,
  status queue_status NOT NULL DEFAULT 'waiting',
  matched_with_id UUID REFERENCES profiles(id),
  game_id UUID REFERENCES games(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_balances_updated_at
  BEFORE UPDATE ON balances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_profiles_privy_user_id ON profiles(privy_user_id);
CREATE INDEX idx_profiles_elo_rating ON profiles(elo_rating);
CREATE INDEX idx_profiles_username ON profiles(username);

CREATE INDEX idx_balances_user_id ON balances(user_id);

CREATE INDEX idx_games_white_player_id ON games(white_player_id);
CREATE INDEX idx_games_black_player_id ON games(black_player_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_created_at ON games(created_at);

CREATE INDEX idx_game_moves_game_id ON game_moves(game_id);
CREATE INDEX idx_game_moves_player_id ON game_moves(player_id);

CREATE INDEX idx_challenges_creator_id ON challenges(creator_id);
CREATE INDEX idx_challenges_room_code ON challenges(room_code);
CREATE INDEX idx_challenges_status ON challenges(status);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_game_id ON transactions(game_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

CREATE INDEX idx_matchmaking_queue_user_id ON matchmaking_queue(user_id);
CREATE INDEX idx_matchmaking_queue_status ON matchmaking_queue(status);
CREATE INDEX idx_matchmaking_queue_wager ON matchmaking_queue(wager_tct);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all profiles, but only update their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Balances: Users can only see their own balance
CREATE POLICY "Users can view own balance" ON balances
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- Games: Everyone can view games, participants can update
CREATE POLICY "Games are viewable by everyone" ON games
  FOR SELECT USING (true);

-- Game Moves: Everyone can view moves
CREATE POLICY "Moves are viewable by everyone" ON game_moves
  FOR SELECT USING (true);

-- Challenges: Users can see challenges they created or are invited to
CREATE POLICY "Users can view relevant challenges" ON challenges
  FOR SELECT USING (
    creator_id IN (SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
    OR opponent_id IN (SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
    OR opponent_id IS NULL
  );

-- Transactions: Users can only see their own transactions
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- Matchmaking: Users can see their own queue entries
CREATE POLICY "Users can view own queue entries" ON matchmaking_queue
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
