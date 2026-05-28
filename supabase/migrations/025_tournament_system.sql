-- ============================================================================
-- Migration: 010_tournament_system.sql
-- Description: Complete tournament system with brackets, Swiss pairing, and prizes
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Tournament type enum
CREATE TYPE tournament_type AS ENUM ('knockout', 'swiss', 'arena');

-- Tournament status enum
CREATE TYPE tournament_status AS ENUM (
  'draft',           -- Tournament created but not open
  'registration',    -- Registration is open
  'starting',        -- Registration closed, about to start
  'active',          -- Tournament in progress
  'completed',       -- Tournament finished
  'cancelled'        -- Tournament cancelled
);

-- Tournament match status enum
CREATE TYPE tournament_match_status AS ENUM (
  'pending',         -- Match not yet started
  'in_progress',     -- Match currently being played
  'completed',       -- Match finished
  'bye'              -- Player has a bye (no opponent)
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Main tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type tournament_type NOT NULL DEFAULT 'knockout',

  -- Entry and prizes
  entry_fee_tct INTEGER NOT NULL DEFAULT 0,
  prize_pool_tct INTEGER NOT NULL DEFAULT 0,
  rake_percentage DECIMAL(5,2) DEFAULT 5.00,

  -- Player limits
  min_players INTEGER NOT NULL DEFAULT 4,
  max_players INTEGER NOT NULL DEFAULT 64,
  current_players INTEGER NOT NULL DEFAULT 0,

  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  registration_deadline TIMESTAMPTZ,
  registration_opens_at TIMESTAMPTZ,

  -- Game settings
  time_control_seconds INTEGER NOT NULL DEFAULT 300,
  increment_seconds INTEGER NOT NULL DEFAULT 3,
  is_rated BOOLEAN DEFAULT true,

  -- Swiss-specific
  rounds INTEGER, -- Number of rounds for Swiss
  current_round INTEGER DEFAULT 0,

  -- Status
  status tournament_status NOT NULL DEFAULT 'draft',

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  template_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_player_range CHECK (min_players <= max_players),
  CONSTRAINT valid_entry_fee CHECK (entry_fee_tct >= 0),
  CONSTRAINT valid_prize_pool CHECK (prize_pool_tct >= 0)
);

-- Tournament registrations
CREATE TABLE IF NOT EXISTS tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Seeding and standings
  seed INTEGER, -- Initial seed based on ELO
  score DECIMAL(4,1) DEFAULT 0, -- Points (1 for win, 0.5 for draw, 0 for loss)
  buchholz_score DECIMAL(6,1) DEFAULT 0, -- Tiebreak: sum of opponents' scores
  sonneborn_berger DECIMAL(6,1) DEFAULT 0, -- Tiebreak: sum of defeated opponents' scores
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,

  -- Status
  is_eliminated BOOLEAN DEFAULT false,
  final_place INTEGER,

  -- Timing
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,

  -- Entry fee tracking
  entry_fee_paid INTEGER NOT NULL DEFAULT 0,
  entry_fee_refunded BOOLEAN DEFAULT false,

  -- Unique constraint: one registration per user per tournament
  UNIQUE(tournament_id, user_id)
);

-- Tournament matches
CREATE TABLE IF NOT EXISTS tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  -- Match position in bracket
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  bracket_position TEXT, -- e.g., 'W1', 'L2' for double elimination

  -- Players
  player1_id UUID REFERENCES profiles(id),
  player2_id UUID REFERENCES profiles(id),
  player1_seed INTEGER,
  player2_seed INTEGER,

  -- Result
  winner_id UUID REFERENCES profiles(id),
  game_id UUID REFERENCES games(id),
  player1_score DECIMAL(3,1) DEFAULT 0, -- 1 for win, 0.5 for draw, 0 for loss
  player2_score DECIMAL(3,1) DEFAULT 0,

  -- Status
  status tournament_match_status NOT NULL DEFAULT 'pending',

  -- Timing
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Next match reference (for bracket advancement)
  next_match_id UUID REFERENCES tournament_matches(id),
  next_match_slot INTEGER, -- 1 or 2 (which player slot in next match)

  -- Unique constraint
  UNIQUE(tournament_id, round, match_number)
);

-- Tournament prize distribution
CREATE TABLE IF NOT EXISTS tournament_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  -- Prize definition
  place INTEGER NOT NULL, -- 1st, 2nd, 3rd, etc.
  percentage DECIMAL(5,2) NOT NULL, -- Percentage of prize pool
  fixed_amount INTEGER, -- Or fixed amount if specified

  -- Payout
  user_id UUID REFERENCES profiles(id),
  amount_tct INTEGER,
  paid_at TIMESTAMPTZ,
  transaction_id UUID,

  -- Unique constraint
  UNIQUE(tournament_id, place)
);

-- Tournament templates for recurring tournaments
CREATE TABLE IF NOT EXISTS tournament_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type tournament_type NOT NULL DEFAULT 'knockout',

  -- Settings
  entry_fee_tct INTEGER NOT NULL DEFAULT 0,
  prize_distribution JSONB NOT NULL DEFAULT '[{"place": 1, "percentage": 50}, {"place": 2, "percentage": 30}, {"place": 3, "percentage": 20}]',
  min_players INTEGER NOT NULL DEFAULT 4,
  max_players INTEGER NOT NULL DEFAULT 64,
  time_control_seconds INTEGER NOT NULL DEFAULT 300,
  increment_seconds INTEGER NOT NULL DEFAULT 3,
  rounds INTEGER, -- For Swiss

  -- Recurrence
  recurrence TEXT, -- 'daily', 'weekly', 'monthly'
  day_of_week INTEGER, -- 0-6 (Sunday-Saturday) for weekly
  day_of_month INTEGER, -- 1-31 for monthly
  hour_utc INTEGER NOT NULL DEFAULT 19, -- Hour in UTC
  minute_utc INTEGER NOT NULL DEFAULT 0,

  -- Registration timing
  registration_hours_before INTEGER DEFAULT 168, -- 7 days
  registration_closes_minutes_before INTEGER DEFAULT 15,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_created_tournament_id UUID REFERENCES tournaments(id),
  next_scheduled_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_start_time ON tournaments(start_time);
CREATE INDEX idx_tournaments_type ON tournaments(type);
CREATE INDEX idx_tournaments_registration ON tournaments(status, registration_deadline)
  WHERE status = 'registration';

CREATE INDEX idx_tournament_registrations_tournament ON tournament_registrations(tournament_id);
CREATE INDEX idx_tournament_registrations_user ON tournament_registrations(user_id);
CREATE INDEX idx_tournament_registrations_score ON tournament_registrations(tournament_id, score DESC, buchholz_score DESC);

CREATE INDEX idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_round ON tournament_matches(tournament_id, round);
CREATE INDEX idx_tournament_matches_players ON tournament_matches(player1_id, player2_id);
CREATE INDEX idx_tournament_matches_status ON tournament_matches(status) WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_tournament_prizes_tournament ON tournament_prizes(tournament_id);
CREATE INDEX idx_tournament_prizes_user ON tournament_prizes(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_templates ENABLE ROW LEVEL SECURITY;

-- Tournaments: Anyone can view, only admins can create/modify
CREATE POLICY "Anyone can view tournaments"
  ON tournaments FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage tournaments"
  ON tournaments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_admin = true
    )
  );

-- Registrations: Anyone can view, users can register/unregister themselves
CREATE POLICY "Anyone can view registrations"
  ON tournament_registrations FOR SELECT
  USING (true);

CREATE POLICY "Users can register themselves"
  ON tournament_registrations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unregister themselves"
  ON tournament_registrations FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "System can update registrations"
  ON tournament_registrations FOR UPDATE
  USING (true); -- Controlled by functions with SECURITY DEFINER

-- Matches: Anyone can view
CREATE POLICY "Anyone can view matches"
  ON tournament_matches FOR SELECT
  USING (true);

CREATE POLICY "System can manage matches"
  ON tournament_matches FOR ALL
  USING (true); -- Controlled by functions with SECURITY DEFINER

-- Prizes: Anyone can view
CREATE POLICY "Anyone can view prizes"
  ON tournament_prizes FOR SELECT
  USING (true);

CREATE POLICY "System can manage prizes"
  ON tournament_prizes FOR ALL
  USING (true); -- Controlled by functions with SECURITY DEFINER

-- Templates: Anyone can view active templates
CREATE POLICY "Anyone can view active templates"
  ON tournament_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage templates"
  ON tournament_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_admin = true
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Register for tournament
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_for_tournament(
  p_tournament_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_user_balance INTEGER;
  v_user_elo INTEGER;
  v_registration_id UUID;
  v_current_seed INTEGER;
BEGIN
  -- Lock tournament row to prevent race conditions
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Check tournament status
  IF v_tournament.status != 'registration' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is not open for registration');
  END IF;

  -- Check registration deadline
  IF v_tournament.registration_deadline IS NOT NULL
     AND NOW() > v_tournament.registration_deadline THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration deadline has passed');
  END IF;

  -- Check capacity
  IF v_tournament.current_players >= v_tournament.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is full');
  END IF;

  -- Check if already registered
  IF EXISTS (
    SELECT 1 FROM tournament_registrations
    WHERE tournament_id = p_tournament_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already registered for this tournament');
  END IF;

  -- Get user balance and ELO
  SELECT tct_balance, elo_rating INTO v_user_balance, v_user_elo
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Check balance for entry fee
  IF v_user_balance < v_tournament.entry_fee_tct THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'required', v_tournament.entry_fee_tct,
      'available', v_user_balance
    );
  END IF;

  -- Deduct entry fee
  IF v_tournament.entry_fee_tct > 0 THEN
    UPDATE profiles
    SET tct_balance = tct_balance - v_tournament.entry_fee_tct
    WHERE id = p_user_id;

    -- Add to prize pool (minus rake)
    UPDATE tournaments
    SET prize_pool_tct = prize_pool_tct +
        (v_tournament.entry_fee_tct * (100 - v_tournament.rake_percentage) / 100)::INTEGER
    WHERE id = p_tournament_id;
  END IF;

  -- Calculate seed based on current registrations
  SELECT COALESCE(MAX(seed), 0) + 1 INTO v_current_seed
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id;

  -- Create registration
  INSERT INTO tournament_registrations (
    tournament_id,
    user_id,
    seed,
    entry_fee_paid
  ) VALUES (
    p_tournament_id,
    p_user_id,
    v_current_seed,
    v_tournament.entry_fee_tct
  )
  RETURNING id INTO v_registration_id;

  -- Update player count
  UPDATE tournaments
  SET current_players = current_players + 1
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'seed', v_current_seed,
    'entry_fee_paid', v_tournament.entry_fee_tct
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Unregister from tournament
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unregister_from_tournament(
  p_tournament_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
  v_refund_amount INTEGER;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Get registration
  SELECT * INTO v_registration
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not registered for this tournament');
  END IF;

  -- Check if tournament has started
  IF v_tournament.status NOT IN ('draft', 'registration') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot unregister after tournament has started');
  END IF;

  -- Check if already refunded
  IF v_registration.entry_fee_refunded THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entry fee already refunded');
  END IF;

  -- Calculate refund (full refund if before deadline, no refund after)
  IF v_tournament.registration_deadline IS NULL
     OR NOW() <= v_tournament.registration_deadline THEN
    v_refund_amount := v_registration.entry_fee_paid;
  ELSE
    v_refund_amount := 0;
  END IF;

  -- Refund entry fee
  IF v_refund_amount > 0 THEN
    UPDATE profiles
    SET tct_balance = tct_balance + v_refund_amount
    WHERE id = p_user_id;

    -- Remove from prize pool
    UPDATE tournaments
    SET prize_pool_tct = GREATEST(0, prize_pool_tct -
        (v_refund_amount * (100 - v_tournament.rake_percentage) / 100)::INTEGER)
    WHERE id = p_tournament_id;
  END IF;

  -- Delete registration
  DELETE FROM tournament_registrations
  WHERE id = v_registration.id;

  -- Update player count
  UPDATE tournaments
  SET current_players = GREATEST(0, current_players - 1)
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_amount', v_refund_amount
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Generate knockout bracket
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_knockout_bracket(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_players UUID[];
  v_player_count INTEGER;
  v_bracket_size INTEGER;
  v_num_byes INTEGER;
  v_num_rounds INTEGER;
  v_round INTEGER;
  v_match_num INTEGER;
  v_player_idx INTEGER;
  v_match_id UUID;
  v_prev_match_ids UUID[];
  v_matches_created INTEGER := 0;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Get registered players ordered by seed (ELO-based)
  SELECT ARRAY_AGG(user_id ORDER BY seed)
  INTO v_players
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id
    AND NOT is_eliminated;

  v_player_count := COALESCE(array_length(v_players, 1), 0);

  IF v_player_count < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough players');
  END IF;

  -- Calculate bracket size (next power of 2)
  v_bracket_size := 1;
  WHILE v_bracket_size < v_player_count LOOP
    v_bracket_size := v_bracket_size * 2;
  END LOOP;

  v_num_byes := v_bracket_size - v_player_count;
  v_num_rounds := LOG(2, v_bracket_size)::INTEGER;

  -- Create first round matches
  v_round := 1;
  v_match_num := 1;
  v_player_idx := 1;
  v_prev_match_ids := ARRAY[]::UUID[];

  FOR i IN 1..(v_bracket_size / 2) LOOP
    -- Determine players for this match (handle byes)
    DECLARE
      v_p1 UUID := NULL;
      v_p2 UUID := NULL;
      v_status tournament_match_status := 'pending';
      v_winner UUID := NULL;
    BEGIN
      -- Seeding: 1 vs bracket_size, 2 vs bracket_size-1, etc.
      IF v_player_idx <= v_player_count THEN
        v_p1 := v_players[v_player_idx];
        v_player_idx := v_player_idx + 1;
      END IF;

      -- Second player (from bottom of bracket)
      DECLARE
        v_opponent_seed INTEGER := v_bracket_size - i + 1;
      BEGIN
        IF v_opponent_seed <= v_player_count THEN
          v_p2 := v_players[v_opponent_seed];
        END IF;
      END;

      -- Handle byes
      IF v_p1 IS NULL AND v_p2 IS NOT NULL THEN
        v_winner := v_p2;
        v_status := 'bye';
      ELSIF v_p2 IS NULL AND v_p1 IS NOT NULL THEN
        v_winner := v_p1;
        v_status := 'bye';
      END IF;

      -- Insert match
      INSERT INTO tournament_matches (
        tournament_id, round, match_number,
        player1_id, player2_id, winner_id, status
      ) VALUES (
        p_tournament_id, v_round, v_match_num,
        v_p1, v_p2, v_winner, v_status
      )
      RETURNING id INTO v_match_id;

      v_prev_match_ids := array_append(v_prev_match_ids, v_match_id);
      v_match_num := v_match_num + 1;
      v_matches_created := v_matches_created + 1;
    END;
  END LOOP;

  -- Create subsequent rounds
  FOR v_round IN 2..v_num_rounds LOOP
    DECLARE
      v_new_match_ids UUID[] := ARRAY[]::UUID[];
      v_matches_in_round INTEGER := v_bracket_size / (2 ^ v_round);
    BEGIN
      v_match_num := 1;

      FOR i IN 1..v_matches_in_round LOOP
        -- Create match
        INSERT INTO tournament_matches (
          tournament_id, round, match_number, status
        ) VALUES (
          p_tournament_id, v_round, v_match_num, 'pending'
        )
        RETURNING id INTO v_match_id;

        v_new_match_ids := array_append(v_new_match_ids, v_match_id);

        -- Link previous round matches to this one
        UPDATE tournament_matches
        SET next_match_id = v_match_id, next_match_slot = 1
        WHERE id = v_prev_match_ids[(i-1)*2 + 1];

        UPDATE tournament_matches
        SET next_match_id = v_match_id, next_match_slot = 2
        WHERE id = v_prev_match_ids[(i-1)*2 + 2];

        v_match_num := v_match_num + 1;
        v_matches_created := v_matches_created + 1;
      END LOOP;

      v_prev_match_ids := v_new_match_ids;
    END;
  END LOOP;

  -- Auto-advance byes
  PERFORM advance_bye_winners(p_tournament_id);

  RETURN jsonb_build_object(
    'success', true,
    'bracket_size', v_bracket_size,
    'num_rounds', v_num_rounds,
    'num_byes', v_num_byes,
    'matches_created', v_matches_created
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Advance bye winners to next round
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION advance_bye_winners(p_tournament_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_advanced INTEGER := 0;
BEGIN
  FOR v_match IN
    SELECT * FROM tournament_matches
    WHERE tournament_id = p_tournament_id
      AND status = 'bye'
      AND winner_id IS NOT NULL
      AND next_match_id IS NOT NULL
  LOOP
    -- Place winner in next match
    IF v_match.next_match_slot = 1 THEN
      UPDATE tournament_matches
      SET player1_id = v_match.winner_id
      WHERE id = v_match.next_match_id;
    ELSE
      UPDATE tournament_matches
      SET player2_id = v_match.winner_id
      WHERE id = v_match.next_match_id;
    END IF;

    v_advanced := v_advanced + 1;
  END LOOP;

  RETURN v_advanced;
END;
$$;

-- ----------------------------------------------------------------------------
-- Generate Swiss pairings for a round
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_swiss_pairings(
  p_tournament_id UUID,
  p_round INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_player RECORD;
  v_paired UUID[] := ARRAY[]::UUID[];
  v_match_num INTEGER := 1;
  v_matches_created INTEGER := 0;
  v_opponent_id UUID;
  v_bye_player_id UUID := NULL;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Get active players ordered by score, then buchholz, then seed
  FOR v_player IN
    SELECT user_id, score, buchholz_score, seed
    FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
      AND NOT is_eliminated
    ORDER BY score DESC, buchholz_score DESC, seed ASC
  LOOP
    -- Skip if already paired
    IF v_player.user_id = ANY(v_paired) THEN
      CONTINUE;
    END IF;

    -- Find opponent (first unpaired player with similar score, not previously played)
    SELECT tr.user_id INTO v_opponent_id
    FROM tournament_registrations tr
    WHERE tr.tournament_id = p_tournament_id
      AND tr.user_id != v_player.user_id
      AND NOT tr.is_eliminated
      AND NOT (tr.user_id = ANY(v_paired))
      AND NOT EXISTS (
        -- Check if they've played before
        SELECT 1 FROM tournament_matches tm
        WHERE tm.tournament_id = p_tournament_id
          AND ((tm.player1_id = v_player.user_id AND tm.player2_id = tr.user_id)
               OR (tm.player2_id = v_player.user_id AND tm.player1_id = tr.user_id))
      )
    ORDER BY ABS(tr.score - v_player.score), tr.buchholz_score DESC, tr.seed ASC
    LIMIT 1;

    IF v_opponent_id IS NOT NULL THEN
      -- Create match
      INSERT INTO tournament_matches (
        tournament_id, round, match_number,
        player1_id, player2_id, status
      ) VALUES (
        p_tournament_id, p_round, v_match_num,
        v_player.user_id, v_opponent_id, 'pending'
      );

      v_paired := array_append(v_paired, v_player.user_id);
      v_paired := array_append(v_paired, v_opponent_id);
      v_match_num := v_match_num + 1;
      v_matches_created := v_matches_created + 1;
    ELSE
      -- This player gets a bye
      v_bye_player_id := v_player.user_id;
    END IF;
  END LOOP;

  -- Handle bye (give 1 point)
  IF v_bye_player_id IS NOT NULL THEN
    INSERT INTO tournament_matches (
      tournament_id, round, match_number,
      player1_id, winner_id, status,
      player1_score
    ) VALUES (
      p_tournament_id, p_round, v_match_num,
      v_bye_player_id, v_bye_player_id, 'bye',
      1
    );

    -- Update player score
    UPDATE tournament_registrations
    SET score = score + 1
    WHERE tournament_id = p_tournament_id AND user_id = v_bye_player_id;

    v_matches_created := v_matches_created + 1;
  END IF;

  -- Update tournament round
  UPDATE tournaments
  SET current_round = p_round
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'round', p_round,
    'matches_created', v_matches_created,
    'bye_player_id', v_bye_player_id
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Start tournament
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_result JSONB;
BEGIN
  -- Get and lock tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Check status
  IF v_tournament.status NOT IN ('registration', 'starting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament cannot be started from current status');
  END IF;

  -- Check minimum players
  IF v_tournament.current_players < v_tournament.min_players THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not enough players',
      'current', v_tournament.current_players,
      'required', v_tournament.min_players
    );
  END IF;

  -- Update seeds based on ELO
  WITH ranked AS (
    SELECT
      tr.id,
      ROW_NUMBER() OVER (ORDER BY p.elo_rating DESC) as new_seed
    FROM tournament_registrations tr
    JOIN profiles p ON p.id = tr.user_id
    WHERE tr.tournament_id = p_tournament_id
  )
  UPDATE tournament_registrations tr
  SET seed = ranked.new_seed
  FROM ranked
  WHERE tr.id = ranked.id;

  -- Generate bracket/pairings based on tournament type
  IF v_tournament.type = 'knockout' THEN
    v_result := generate_knockout_bracket(p_tournament_id);
  ELSIF v_tournament.type = 'swiss' THEN
    v_result := generate_swiss_pairings(p_tournament_id, 1);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported tournament type');
  END IF;

  IF NOT (v_result->>'success')::boolean THEN
    RETURN v_result;
  END IF;

  -- Update tournament status
  UPDATE tournaments
  SET
    status = 'active',
    started_at = NOW(),
    current_round = 1
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'type', v_tournament.type,
    'players', v_tournament.current_players,
    'bracket_result', v_result
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Record tournament match result
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_tournament_match_result(
  p_match_id UUID,
  p_winner_id UUID,
  p_game_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_tournament RECORD;
  v_loser_id UUID;
  v_is_draw BOOLEAN := false;
BEGIN
  -- Get match
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Check match status
  IF v_match.status NOT IN ('pending', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already completed');
  END IF;

  -- Validate winner
  IF p_winner_id IS NOT NULL
     AND p_winner_id != v_match.player1_id
     AND p_winner_id != v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Winner must be a player in this match');
  END IF;

  -- Determine loser and draw status
  IF p_winner_id IS NULL THEN
    v_is_draw := true;
  ELSIF p_winner_id = v_match.player1_id THEN
    v_loser_id := v_match.player2_id;
  ELSE
    v_loser_id := v_match.player1_id;
  END IF;

  -- Update match
  UPDATE tournament_matches
  SET
    winner_id = p_winner_id,
    game_id = p_game_id,
    status = 'completed',
    completed_at = NOW(),
    player1_score = CASE
      WHEN p_winner_id = v_match.player1_id THEN 1
      WHEN p_winner_id = v_match.player2_id THEN 0
      ELSE 0.5
    END,
    player2_score = CASE
      WHEN p_winner_id = v_match.player2_id THEN 1
      WHEN p_winner_id = v_match.player1_id THEN 0
      ELSE 0.5
    END
  WHERE id = p_match_id;

  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = v_match.tournament_id;

  -- Update player standings (for Swiss)
  IF v_tournament.type = 'swiss' THEN
    IF v_is_draw THEN
      UPDATE tournament_registrations
      SET score = score + 0.5, draws = draws + 1
      WHERE tournament_id = v_match.tournament_id
        AND user_id IN (v_match.player1_id, v_match.player2_id);
    ELSE
      UPDATE tournament_registrations
      SET score = score + 1, wins = wins + 1
      WHERE tournament_id = v_match.tournament_id AND user_id = p_winner_id;

      UPDATE tournament_registrations
      SET losses = losses + 1
      WHERE tournament_id = v_match.tournament_id AND user_id = v_loser_id;
    END IF;

    -- Update Buchholz scores
    PERFORM update_buchholz_scores(v_match.tournament_id);
  END IF;

  -- For knockout: eliminate loser and advance winner
  IF v_tournament.type = 'knockout' AND NOT v_is_draw THEN
    -- Eliminate loser
    UPDATE tournament_registrations
    SET is_eliminated = true
    WHERE tournament_id = v_match.tournament_id AND user_id = v_loser_id;

    -- Advance winner to next match
    IF v_match.next_match_id IS NOT NULL THEN
      IF v_match.next_match_slot = 1 THEN
        UPDATE tournament_matches
        SET player1_id = p_winner_id
        WHERE id = v_match.next_match_id;
      ELSE
        UPDATE tournament_matches
        SET player2_id = p_winner_id
        WHERE id = v_match.next_match_id;
      END IF;
    END IF;
  END IF;

  -- Check if round is complete
  PERFORM check_round_completion(v_match.tournament_id, v_match.round);

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'winner_id', p_winner_id,
    'is_draw', v_is_draw
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Update Buchholz tiebreak scores
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_buchholz_scores(p_tournament_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Buchholz = sum of all opponents' scores
  UPDATE tournament_registrations tr
  SET buchholz_score = (
    SELECT COALESCE(SUM(opp.score), 0)
    FROM tournament_matches tm
    JOIN tournament_registrations opp ON opp.tournament_id = tm.tournament_id
      AND opp.user_id = CASE
        WHEN tm.player1_id = tr.user_id THEN tm.player2_id
        ELSE tm.player1_id
      END
    WHERE tm.tournament_id = p_tournament_id
      AND (tm.player1_id = tr.user_id OR tm.player2_id = tr.user_id)
      AND tm.status = 'completed'
  )
  WHERE tr.tournament_id = p_tournament_id;

  -- Sonneborn-Berger = sum of defeated opponents' scores + half of drawn opponents' scores
  UPDATE tournament_registrations tr
  SET sonneborn_berger = (
    SELECT COALESCE(SUM(
      CASE
        WHEN tm.winner_id = tr.user_id THEN opp.score
        WHEN tm.winner_id IS NULL THEN opp.score * 0.5
        ELSE 0
      END
    ), 0)
    FROM tournament_matches tm
    JOIN tournament_registrations opp ON opp.tournament_id = tm.tournament_id
      AND opp.user_id = CASE
        WHEN tm.player1_id = tr.user_id THEN tm.player2_id
        ELSE tm.player1_id
      END
    WHERE tm.tournament_id = p_tournament_id
      AND (tm.player1_id = tr.user_id OR tm.player2_id = tr.user_id)
      AND tm.status = 'completed'
  )
  WHERE tr.tournament_id = p_tournament_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Check if round is complete and advance tournament
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_round_completion(
  p_tournament_id UUID,
  p_round INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_pending_matches INTEGER;
  v_remaining_players INTEGER;
BEGIN
  -- Count pending matches in this round
  SELECT COUNT(*) INTO v_pending_matches
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
    AND round = p_round
    AND status IN ('pending', 'in_progress');

  -- If matches still pending, do nothing
  IF v_pending_matches > 0 THEN
    RETURN jsonb_build_object('round_complete', false, 'pending_matches', v_pending_matches);
  END IF;

  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;

  -- Check if tournament is complete
  IF v_tournament.type = 'knockout' THEN
    SELECT COUNT(*) INTO v_remaining_players
    FROM tournament_registrations
    WHERE tournament_id = p_tournament_id AND NOT is_eliminated;

    IF v_remaining_players <= 1 THEN
      PERFORM finalize_tournament(p_tournament_id);
      RETURN jsonb_build_object('round_complete', true, 'tournament_complete', true);
    END IF;
  ELSIF v_tournament.type = 'swiss' THEN
    IF p_round >= v_tournament.rounds THEN
      PERFORM finalize_tournament(p_tournament_id);
      RETURN jsonb_build_object('round_complete', true, 'tournament_complete', true);
    ELSE
      -- Generate next round pairings
      PERFORM generate_swiss_pairings(p_tournament_id, p_round + 1);
    END IF;
  END IF;

  RETURN jsonb_build_object('round_complete', true, 'tournament_complete', false);
END;
$$;

-- ----------------------------------------------------------------------------
-- Finalize tournament and distribute prizes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finalize_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
  v_place INTEGER := 1;
  v_prize_record RECORD;
  v_prize_amount INTEGER;
  v_total_distributed INTEGER := 0;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF v_tournament.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament already finalized');
  END IF;

  -- Calculate final standings
  FOR v_registration IN
    SELECT * FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
    ORDER BY
      is_eliminated ASC, -- Non-eliminated first
      score DESC,
      buchholz_score DESC,
      sonneborn_berger DESC,
      seed ASC
  LOOP
    UPDATE tournament_registrations
    SET final_place = v_place
    WHERE id = v_registration.id;

    v_place := v_place + 1;
  END LOOP;

  -- Distribute prizes
  FOR v_prize_record IN
    SELECT tp.*, tr.user_id as winner_user_id
    FROM tournament_prizes tp
    LEFT JOIN tournament_registrations tr
      ON tr.tournament_id = tp.tournament_id AND tr.final_place = tp.place
    WHERE tp.tournament_id = p_tournament_id
    ORDER BY tp.place
  LOOP
    IF v_prize_record.winner_user_id IS NOT NULL THEN
      -- Calculate prize amount
      IF v_prize_record.fixed_amount IS NOT NULL THEN
        v_prize_amount := v_prize_record.fixed_amount;
      ELSE
        v_prize_amount := (v_tournament.prize_pool_tct * v_prize_record.percentage / 100)::INTEGER;
      END IF;

      -- Pay prize
      UPDATE profiles
      SET tct_balance = tct_balance + v_prize_amount
      WHERE id = v_prize_record.winner_user_id;

      -- Record payment
      UPDATE tournament_prizes
      SET
        user_id = v_prize_record.winner_user_id,
        amount_tct = v_prize_amount,
        paid_at = NOW()
      WHERE id = v_prize_record.id;

      v_total_distributed := v_total_distributed + v_prize_amount;
    END IF;
  END LOOP;

  -- Update tournament status
  UPDATE tournaments
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_distributed', v_total_distributed
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Cancel tournament and refund entry fees
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
  v_total_refunded INTEGER := 0;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel completed tournament');
  END IF;

  -- Refund all entry fees
  FOR v_registration IN
    SELECT * FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
      AND NOT entry_fee_refunded
      AND entry_fee_paid > 0
  LOOP
    UPDATE profiles
    SET tct_balance = tct_balance + v_registration.entry_fee_paid
    WHERE id = v_registration.user_id;

    UPDATE tournament_registrations
    SET entry_fee_refunded = true
    WHERE id = v_registration.id;

    v_total_refunded := v_total_refunded + v_registration.entry_fee_paid;
  END LOOP;

  -- Update tournament status
  UPDATE tournaments
  SET status = 'cancelled'
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_refunded', v_total_refunded
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Create tournament from template
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_tournament_from_template(p_template_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template RECORD;
  v_tournament_id UUID;
  v_start_time TIMESTAMPTZ;
  v_registration_opens TIMESTAMPTZ;
  v_registration_deadline TIMESTAMPTZ;
  v_prize JSONB;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM tournament_templates
  WHERE id = p_template_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found or inactive');
  END IF;

  -- Calculate next start time based on recurrence
  v_start_time := v_template.next_scheduled_at;
  IF v_start_time IS NULL OR v_start_time <= NOW() THEN
    -- Calculate next occurrence
    IF v_template.recurrence = 'weekly' THEN
      v_start_time := date_trunc('week', NOW())
        + (v_template.day_of_week || ' days')::INTERVAL
        + (v_template.hour_utc || ' hours')::INTERVAL
        + (v_template.minute_utc || ' minutes')::INTERVAL;
      IF v_start_time <= NOW() THEN
        v_start_time := v_start_time + INTERVAL '1 week';
      END IF;
    ELSIF v_template.recurrence = 'daily' THEN
      v_start_time := date_trunc('day', NOW())
        + (v_template.hour_utc || ' hours')::INTERVAL
        + (v_template.minute_utc || ' minutes')::INTERVAL;
      IF v_start_time <= NOW() THEN
        v_start_time := v_start_time + INTERVAL '1 day';
      END IF;
    END IF;
  END IF;

  -- Calculate registration times
  v_registration_opens := v_start_time - (v_template.registration_hours_before || ' hours')::INTERVAL;
  v_registration_deadline := v_start_time - (v_template.registration_closes_minutes_before || ' minutes')::INTERVAL;

  -- Create tournament
  INSERT INTO tournaments (
    name, description, type,
    entry_fee_tct, min_players, max_players,
    time_control_seconds, increment_seconds, rounds,
    start_time, registration_opens_at, registration_deadline,
    status, template_id
  ) VALUES (
    v_template.name || ' - ' || to_char(v_start_time, 'Mon DD'),
    v_template.description,
    v_template.type,
    v_template.entry_fee_tct,
    v_template.min_players,
    v_template.max_players,
    v_template.time_control_seconds,
    v_template.increment_seconds,
    v_template.rounds,
    v_start_time,
    v_registration_opens,
    v_registration_deadline,
    CASE WHEN v_registration_opens <= NOW() THEN 'registration' ELSE 'draft' END,
    p_template_id
  )
  RETURNING id INTO v_tournament_id;

  -- Create prize structure
  FOR v_prize IN SELECT * FROM jsonb_array_elements(v_template.prize_distribution)
  LOOP
    INSERT INTO tournament_prizes (tournament_id, place, percentage)
    VALUES (
      v_tournament_id,
      (v_prize->>'place')::INTEGER,
      (v_prize->>'percentage')::DECIMAL
    );
  END LOOP;

  -- Update template with next scheduled time
  UPDATE tournament_templates
  SET
    last_created_tournament_id = v_tournament_id,
    next_scheduled_at = CASE
      WHEN v_template.recurrence = 'weekly' THEN v_start_time + INTERVAL '1 week'
      WHEN v_template.recurrence = 'daily' THEN v_start_time + INTERVAL '1 day'
      WHEN v_template.recurrence = 'monthly' THEN v_start_time + INTERVAL '1 month'
    END
  WHERE id = p_template_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', v_tournament_id,
    'start_time', v_start_time,
    'registration_opens', v_registration_opens
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Open registration for pending tournaments
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION open_tournament_registration()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE tournaments
  SET status = 'registration'
  WHERE status = 'draft'
    AND registration_opens_at IS NOT NULL
    AND registration_opens_at <= NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- Close registration for tournaments past deadline
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_tournament_registration()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE tournaments
  SET status = 'starting'
  WHERE status = 'registration'
    AND registration_deadline IS NOT NULL
    AND registration_deadline <= NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- Auto-start tournaments at scheduled time
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_start_tournaments()
RETURNS TABLE(tournament_id UUID, result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  FOR v_tournament IN
    SELECT id FROM tournaments
    WHERE status IN ('registration', 'starting')
      AND start_time <= NOW()
  LOOP
    tournament_id := v_tournament.id;
    result := start_tournament(v_tournament.id);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ============================================================================
-- NOTIFICATION TRIGGERS
-- ============================================================================

-- Notify on tournament registration
CREATE OR REPLACE FUNCTION notify_tournament_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = NEW.tournament_id;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'tournament_registration',
    'Tournament Registration Confirmed',
    'You are registered for ' || v_tournament.name,
    jsonb_build_object(
      'tournament_id', NEW.tournament_id,
      'tournament_name', v_tournament.name,
      'start_time', v_tournament.start_time
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tournament_registration
  AFTER INSERT ON tournament_registrations
  FOR EACH ROW
  EXECUTE FUNCTION notify_tournament_registration();

-- Notify when match is ready
CREATE OR REPLACE FUNCTION notify_tournament_match_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  -- Only notify when both players are assigned
  IF NEW.player1_id IS NOT NULL AND NEW.player2_id IS NOT NULL
     AND NEW.status = 'pending'
     AND (OLD.player1_id IS NULL OR OLD.player2_id IS NULL) THEN

    SELECT * INTO v_tournament FROM tournaments WHERE id = NEW.tournament_id;

    -- Notify player 1
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.player1_id,
      'tournament_match_ready',
      'Your Tournament Match is Ready!',
      'Your match in ' || v_tournament.name || ' is ready to play',
      jsonb_build_object(
        'tournament_id', NEW.tournament_id,
        'match_id', NEW.id,
        'opponent_id', NEW.player2_id,
        'round', NEW.round
      )
    );

    -- Notify player 2
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.player2_id,
      'tournament_match_ready',
      'Your Tournament Match is Ready!',
      'Your match in ' || v_tournament.name || ' is ready to play',
      jsonb_build_object(
        'tournament_id', NEW.tournament_id,
        'match_id', NEW.id,
        'opponent_id', NEW.player1_id,
        'round', NEW.round
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tournament_match_ready
  AFTER UPDATE ON tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_tournament_match_ready();

-- Notify on tournament completion (prize won)
CREATE OR REPLACE FUNCTION notify_tournament_prize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT * INTO v_tournament FROM tournaments WHERE id = NEW.tournament_id;

    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.user_id,
      'tournament_prize',
      'Tournament Prize Won!',
      'You finished ' ||
        CASE NEW.place
          WHEN 1 THEN '1st'
          WHEN 2 THEN '2nd'
          WHEN 3 THEN '3rd'
          ELSE NEW.place || 'th'
        END ||
        ' place in ' || v_tournament.name || ' and won ' || NEW.amount_tct || ' TCT!',
      jsonb_build_object(
        'tournament_id', NEW.tournament_id,
        'tournament_name', v_tournament.name,
        'place', NEW.place,
        'amount_tct', NEW.amount_tct
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tournament_prize_paid
  AFTER UPDATE ON tournament_prizes
  FOR EACH ROW
  EXECUTE FUNCTION notify_tournament_prize();

-- ============================================================================
-- SEED DATA: Default tournament templates
-- ============================================================================

INSERT INTO tournament_templates (
  name, description, type, entry_fee_tct,
  prize_distribution, min_players, max_players,
  time_control_seconds, increment_seconds,
  recurrence, day_of_week, hour_utc,
  registration_hours_before, is_active
) VALUES
(
  'Weekly Blitz Championship',
  'Fast-paced weekly knockout tournament',
  'knockout',
  100,
  '[{"place": 1, "percentage": 50}, {"place": 2, "percentage": 30}, {"place": 3, "percentage": 15}, {"place": 4, "percentage": 5}]',
  8, 32,
  180, 2,
  'weekly', 6, 19, -- Saturday 7 PM UTC
  168, -- 7 days before
  true
),
(
  'Daily Rapid Arena',
  'Daily rapid tournament with Swiss format',
  'swiss',
  50,
  '[{"place": 1, "percentage": 40}, {"place": 2, "percentage": 25}, {"place": 3, "percentage": 15}, {"place": 4, "percentage": 10}, {"place": 5, "percentage": 10}]',
  4, 64,
  600, 5,
  'daily', NULL, 20, -- 8 PM UTC daily
  24, -- 1 day before
  true
);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON tournaments TO authenticated;
GRANT SELECT ON tournament_registrations TO authenticated;
GRANT SELECT ON tournament_matches TO authenticated;
GRANT SELECT ON tournament_prizes TO authenticated;
GRANT SELECT ON tournament_templates TO authenticated;

GRANT INSERT, DELETE ON tournament_registrations TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION register_for_tournament TO authenticated;
GRANT EXECUTE ON FUNCTION unregister_from_tournament TO authenticated;
